package com.inclineyou.inclineyou_backend.core.invite;

import com.inclineyou.inclineyou_backend.core.auth.AppUserRepository;
import com.inclineyou.inclineyou_backend.core.auth.dto.AuthResponse;
import com.inclineyou.inclineyou_backend.core.auth.AuthPrincipal;
import com.inclineyou.inclineyou_backend.core.auth.AuthTokenService;
import com.inclineyou.inclineyou_backend.core.auth.OtpService;
import com.inclineyou.inclineyou_backend.core.client.InviteToken;
import com.inclineyou.inclineyou_backend.core.invite.dto.AcceptRequest;
import com.inclineyou.inclineyou_backend.core.invite.dto.AcceptedClient;
import com.inclineyou.inclineyou_backend.core.tenant.TenantContext;
import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * "Let me in" (api-contract 1.2, inv-a3): check the code, create the client's account, open a session.
 *
 * <h2>The order is the security argument</h2>
 * <ol>
 *   <li><b>A link that does not work is {@code INVITE_UNAVAILABLE} before the code is looked at</b>, so a dead link spends nobody's
 *       attempts and every guess gets one answer.</li>
 *   <li><b>The code must have been sent for the number on the invite</b> ({@link OtpService#verifyRequestFor}): somebody else's
 *       request id is a 404 and their code is never examined. That is the whole proof — the page never supplies a number.</li>
 *   <li>Only then does {@code accept_client_invite()} run, with the proved number as {@code app.phone}. The function refuses an
 *       invite for any other number, which is the database's own backstop for step 2.</li>
 * </ol>
 *
 * <h2>Idempotent, with a window</h2>
 * A second press, a double tap or a reopened tab answers {@code 200} with a fresh session and does nothing twice — but only for
 * the request whose code did it, within two minutes. An old link in the hands of somebody else, after the fact, is
 * {@code INVITE_UNAVAILABLE}.
 *
 * <h2>Why not the SYSTEM actor</h2>
 * The contract says the function runs under the {@code system} actor. It needs only {@code app.phone}: the function is
 * {@code SECURITY DEFINER} and its one identity check reads that setting, so the context here is the narrowest one that works —
 * a staff context with no workspace and the proved number — and nothing on this path can read or write a row as the system.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class InviteAcceptService {

    private static final Duration REPLAY_WINDOW = Duration.ofMinutes(2);

    private final InviteCardJdbcRepository repo;
    private final OtpService otp;
    private final AuthTokenService tokens;
    private final AppUserRepository appUsers;
    private final AppProperties props;

    /** @return the answer, and whether this call created the account (201) or found it already made (200) */
    public Result accept(String token, AcceptRequest req) {
        var target = InviteToken.wellFormed(token) ? repo.acceptTarget(InviteToken.hash(token)).orElse(null) : null;
        if (target == null || !(target.live() || "accepted".equals(target.status()))) throw unavailable();

        LocalDate dob = req.dateOfBirth();
        checkWhatTheyAreSaying(dob, req.policyVersion());

        UUID requestId = parse(req.requestId());
        boolean replay = !target.live();
        if (replay) {
            // Already accepted: only the request whose code did it, just now, may ask again.
            if (!otp.consumedRecentlyFor(requestId, target.phone(), REPLAY_WINDOW)) throw unavailable();
        } else {
            otp.verifyRequestFor(requestId, req.otp(), target.phone());
        }

        // One client, one trainer (R94), said only now that the code has proved the number, so only its owner learns it. The invite
        // stays pending and works once the client has left the first trainer. (The unique index is the backstop for a race.)
        if (!replay && target.withAnotherTrainer()) throw alreadyWithATrainer();

        return finish(target.phone(), target.inviteId(), dob, req.policyVersion().strip(), target.trainerName(), target.headline(), replay);
    }

    /**
     * "Let me in" for a number that has ALREADY proved itself on the login page (api-contract 1.2, inv-a7): no link, no code, no
     * request id. The caller has checked that {@code invite} is one of the invites the signed-in number's own list holds — which is
     * the whole proof that it is theirs — and that they are not a live client of somebody else. What is left is the part they say:
     * their date of birth and the notice, and then it is the same single act as the link's.
     */
    public Result acceptForSignedIn(String phone, AuthResponse.PendingInvite invite, LocalDate dob, String policyVersion) {
        checkWhatTheyAreSaying(dob, policyVersion);
        return finish(phone, invite.inviteId(), dob, policyVersion.strip(), invite.trainerName(), invite.headline(), false);
    }

    /** The two things the client says about themselves, refused before anything is spent or written. */
    private void checkWhatTheyAreSaying(LocalDate dob, String policyVersion) {
        if (dob.isBefore(LocalDate.of(1900, 1, 1))) throw ApiException.validation("dateOfBirth: before 1900");
        if (dob.isAfter(LocalDate.now(java.time.ZoneId.of("Asia/Kolkata")))) throw ApiException.validation("dateOfBirth: in the future");
        String inForce = props.getPrivacy().getPolicyVersion();
        if (!inForce.equals(policyVersion.strip())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "CONSENT_REQUIRED",
                    "policyVersion: the privacy notice in force is " + inForce + ". Reload the notice and accept that one.");
        }
    }

    /** Make the account (or find it made), then open the client's session. */
    private Result finish(String phone, String inviteId, LocalDate dob, String policyVersion, String trainerName, String headline, boolean replay) {
        boolean hadAccount = appUsers.findByPhoneAndDeletedAtIsNull(phone).isPresent();
        String result = run(inviteId, phone, dob, policyVersion);
        switch (result) {
            case "accepted" -> { }
            case "age_requirement" -> throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "AGE_REQUIREMENT",
                    "This isn’t available for you. Please talk to your trainer.");
            // 'unavailable' is a number that already belongs to a trainer: the client is never told why.
            default -> throw unavailable();
        }

        var principal = new AuthPrincipal(phone, phone, "client", null, null);
        var issued = tokens.issueForCurrentRequest(principal);
        return new Result(new AcceptedClient(issued.value(), issued.sessionId(), issued.expiresAt().toEpochMilli(), "client",
                !hadAccount && !replay, "active", new AcceptedClient.Trainer(trainerName, headline), List.of()), !replay);
    }

    /** The one statement that makes the account, with the proved number as the database's idea of who is asking. */
    private String run(String inviteId, String phone, LocalDate dob, String policyVersion) {
        TenantContext before = TenantContext.current();
        TenantContext.set(TenantContext.bootstrap(phone));
        try {
            return repo.accept(inviteId, dob, policyVersion);
        } catch (DuplicateKeyException e) {
            throw alreadyWithATrainer();
        } finally {
            TenantContext.set(before);
        }
    }

    private static UUID parse(String raw) {
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException e) {
            throw OtpService.requestNotFound();
        }
    }

    private static ApiException alreadyWithATrainer() {
        return ApiException.conflict("ALREADY_WITH_A_TRAINER", "You’re already with a trainer. Leave them first, then use this link.");
    }

    private static ApiException unavailable() {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "INVITE_UNAVAILABLE",
                "This invite isn’t available any more. Ask your trainer to send it again.");
    }

    public record Result(AcceptedClient body, boolean created) {}
}
