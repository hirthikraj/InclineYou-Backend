package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.core.auth.client.ClientSignInLookup;
import com.inclineyou.inclineyou_backend.core.auth.otp.OtpAbuseGuard;
import com.inclineyou.inclineyou_backend.core.auth.otp.OtpRequest;
import com.inclineyou.inclineyou_backend.core.auth.otp.OtpService;
import com.inclineyou.inclineyou_backend.core.auth.token.AuthPrincipal;
import com.inclineyou.inclineyou_backend.core.auth.token.AuthTokenService;
import com.inclineyou.inclineyou_backend.core.auth.token.IssuedToken;
import com.inclineyou.inclineyou_backend.core.auth.token.JwtService;
import com.inclineyou.inclineyou_backend.core.auth.AppUserRepository.Identity;
import com.inclineyou.inclineyou_backend.core.auth.dto.AuthResponse;
import com.inclineyou.inclineyou_backend.core.auth.dto.ClaimTrainerRequest;
import com.inclineyou.inclineyou_backend.core.auth.dto.OtpDelivery;
import com.inclineyou.inclineyou_backend.core.auth.dto.OtpRequested;
import com.inclineyou.inclineyou_backend.core.auth.dto.SendOtpRequest;
import com.inclineyou.inclineyou_backend.core.auth.dto.VerifyOtpRequest;
import com.inclineyou.inclineyou_backend.core.trainer.Trainer;
import com.inclineyou.inclineyou_backend.core.trainer.TrainerRepository;
import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Sign-in, and the one question it exists to answer: is this number a trainer,
 * or a number that has proved itself and has no account yet.
 *
 * <p>The flow (api-contract, Sign in): {@link #requestOtp} opens a request and
 * answers its id; {@link #verifyOtp} checks the code against that request and
 * answers a trainer's session, or a short-lived {@code pending} token for a new
 * number, which spends it on {@link #becomeTrainer}.
 *
 * <p>A number that is only a client's signs into the client portal through the
 * client lens (V20, {@code ClientLensResolver}); the {@code CLIENT_SIGN_IN_UNAVAILABLE}
 * refusal of the trainer-only build (api-contract R60) is no longer sent, and the
 * web's wall for it was removed on 6 Nov 2026. A number that is both a trainer and
 * somebody's client signs in as the trainer.
 *
 * <p>{@link AppUserRepository#findIdentityByPhone} returns the role and the
 * trainer's setup state in one query, which matters less for speed than for
 * correctness — a two-step lookup is a place for the two answers to disagree.
 * Nothing here reads a profile.
 */
@Service
@RequiredArgsConstructor
public class AuthService {

    private final AppUserRepository appUserRepo;
    private final TrainerRepository trainerRepo;
    private final OtpService otpService;
    private final AuthTokenService tokens;
    private final com.inclineyou.inclineyou_backend.core.tenant.TenantScope tenantScope;
    private final AppProperties props;
    private final ClientSignInLookup clientLookup;

    public static final String VIEW_TRAINER = "trainer";
    public static final String VIEW_PENDING = "pending";

    /** A sign-up answer, and whether this call created the account (201) or found it already made (200). */
    public record Claimed(AuthResponse body, boolean created) {}

    /* ---------------------------------------------------------------- codes */

    /**
     * The same answer whether or not the number has an account, so the endpoint
     * cannot be used to find out who has signed up.
     */
    public OtpRequested requestOtp(SendOtpRequest req, OtpAbuseGuard.SignInAdmission admission) {
        String phone = req == null ? null : req.phone();
        if (phone == null || !phone.matches(SendOtpRequest.PHONE_PATTERN)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PHONE_INVALID", SendOtpRequest.PHONE_MESSAGE);
        }
        var a = admission == null ? OtpAbuseGuard.SignInAdmission.OPEN : admission;
        var issued = otpService.send(phone, OtpRequest.SIGN_IN, a.deliver());
        return new OtpRequested(issued.requestId().toString(),
                issued.expiresAt().toEpochMilli(), issued.resendAfterSeconds(), a.signupsPaused());
    }

    /** "Did the WhatsApp message arrive?" — keyed by the id the caller was given, never by a number. */
    public OtpDelivery deliveryOf(String requestId) {
        var d = otpService.delivery(requestId(requestId));
        return new OtpDelivery(d.status(), d.error(), d.expiresAt().toEpochMilli());
    }

    /**
     * Verify a code, then route: a trainer opens, a number with no account is
     * {@code pending} (it may claim one), and a client-only number is refused.
     */
    @Transactional
    public AuthResponse verifyOtp(VerifyOtpRequest req) {
        // Throws OtpLockedException, OtpExpiredException or InvalidOtpException on failure — each surfaces as its own HTTP response via GlobalExceptionHandler, because each needs a different recovery.
        String phone = otpService.verifyRequest(requestId(req.requestId()), req.otp());

        List<Identity> rows = appUserRepo.findIdentityByPhone(phone);

        if (rows.isEmpty()) {
            return pending(phone);
        }

        Identity head = rows.getFirst();
        if (AppUser.ROLE_TRAINER.equals(head.getRole())) {
            return trainerView(head);
        }
        return clientView(head);
    }

    /**
     * A number that belongs to a client lands on the portal (api-contract 1.2): {@code active} opens it, {@code paused} and
     * {@code removed} are the walls, and a removed client who has since been invited by somebody new is shown that invite too.
     * Nobody is asked which they are. A client with no row left to show (every one erased) is a removed client of nobody, not a
     * stranger — the account exists and it is not a trainer's.
     */
    private AuthResponse clientView(Identity head) {
        var state = clientLookup.stateOf(head.getPhone());
        String access = state == null ? "removed" : state.access();
        var invites = "removed".equals(access) ? clientLookup.invitesFor(head.getPhone()) : null;
        IssuedToken token = mint(head.getPhone(), head.getPhone(), "client", null);
        return new AuthResponse(token.value(), token.sessionId(), token.expiresAt().toEpochMilli(), "client", false, null, null, null,
                head.getPrivacyPolicyVersion(), props.getPrivacy().getPolicyVersion(), access,
                state == null ? null : state.trainer(), invites == null ? List.of() : invites);
    }

    /** A malformed id is the same 404 as an unknown one: no third answer to learn from. */
    private static UUID requestId(String raw) {
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw OtpService.requestNotFound();
        }
    }

    /** A trainer's own sign-in; a soft-deleted trainer row is a number with no account. */
    private AuthResponse trainerView(Identity head) {
        if (head.getTrainerId() == null) {
            return pending(head.getPhone());
        }
        IssuedToken token = mintTrainer(head.getTrainerId(), head.getPhone());
        return response(token, VIEW_TRAINER, false, head.getTrainerId(),
                displayName(head.getTrainerOwnName(), head.getPhone()),
                head.getSetupCompletedAt(), head.getPrivacyPolicyVersion());
    }

    private AuthResponse pending(String phone) {
        var r = response(mint(phone, phone, JwtService.ROLE_PENDING, null),
                VIEW_PENDING, true, null, null, null, null);
        // A number with no account may still have been invited: the login page shows those instead of "new trainer" (D-16).
        return new AuthResponse(r.token(), r.sessionId(), r.expiresAt(), r.role(), r.isNewUser(), r.trainerId(), r.trainerName(),
                r.setupCompletedAt(), r.privacyPolicyVersion(), r.currentPolicyVersion(), null, null, clientLookup.invitesFor(phone));
    }

    private AuthResponse response(IssuedToken token, String role, boolean isNewUser, UUID trainerId,
                                  String trainerName, Instant setupCompletedAt, String acceptedVersion) {
        return new AuthResponse(
                token.value(),
                token.sessionId(),
                token.expiresAt().toEpochMilli(),
                role,
                isNewUser,
                trainerId == null ? null : trainerId.toString(),
                trainerName,
                setupCompletedAt == null ? null : setupCompletedAt.toEpochMilli(),
                acceptedVersion,
                props.getPrivacy().getPolicyVersion());
    }

    /* ------------------------------------------------- become a trainer */

    /**
     * {@code POST /v1/trainers} — "I'm a trainer" on the new-number screen.
     *
     * <p>Creating the trainer row is a deliberate act rather than a side effect
     * of signing in, and it is idempotent by target state: a second tap, a retry
     * after a dropped response, or a call from a session that is already a
     * trainer's answers the account that exists (200) rather than failing.
     *
     * <p><b>One number, one role (D-06, kept 8 Nov 2026).</b> Only two credentials
     * may call this: the {@code pending} token of a number with no account, and a
     * trainer's own (the repeat call). A client's session or a client's step-up
     * ticket also carries a phone as its subject, and until 8 Nov this method took
     * that as enough and turned the client's {@code app_user} into a trainer —
     * after which sign-in routed them to an empty workspace and they could no
     * longer reach their portal. Both are now {@code 403 PHONE_HAS_ACCOUNT}, as is a
     * pending token whose number became a client while it was alive (a pending
     * session may accept an invite, D-16). A number whose account was CLOSED keeps
     * its number (V36), so it is {@code 403 ACCOUNT_CLOSED}, not a second
     * {@code app_user} colliding on {@code app_user_phone_key}.
     *
     * @param subject  the caller's credential subject: a trainer UUID for a trainer, the phone for a {@code pending} token
     * @param role     the caller's role, {@code trainer} or {@code pending}
     * @param rawToken the credential itself, which a repeat call answers with instead of minting another session
     */
    @Transactional
    public Claimed becomeTrainer(String subject, String role, String rawToken, ClaimTrainerRequest req) {
        String version = req == null ? null : req.privacyPolicyVersion();
        if (version == null || !version.equals(props.getPrivacy().getPolicyVersion())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "CONSENT_REQUIRED",
                    "The privacy notice has changed — reload it and accept the current one.");
        }

        if (JwtService.ROLE_TRAINER.equals(role)) {
            return new Claimed(alreadyTrainer(subject, rawToken), false);
        }
        // Only the token of a number with no account may claim. A client's session and a client's step-up ticket carry a phone as
        // their subject too, which is why the role is checked and not merely the subject's shape.
        if (!JwtService.ROLE_PENDING.equals(role)) throw phoneHasAccount();

        String phone = subject;
        if (phone == null || !phone.matches(SendOtpRequest.PHONE_PATTERN)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED",
                    "Sign in again to create your account.");
        }

        // A double tap waits here for the first to commit, then finds its row (see lockClaim).
        appUserRepo.lockClaim(phone);
        // Live or closed: app_user_phone_key does not look at deleted_at, so a closed account still holds the number.
        Optional<AppUser> existing = appUserRepo.findByPhone(phone);

        AppUser user;
        if (existing.isEmpty()) {
            user = new AppUser();
            user.setPhone(phone);
            user.setRole(AppUser.ROLE_TRAINER);
            user = appUserRepo.save(user);
        } else {
            user = existing.get();
            if (user.getDeletedAt() != null) {
                throw new ApiException(HttpStatus.FORBIDDEN, "ACCOUNT_CLOSED",
                        "The account on this number was closed, so it can't be used to sign up again.");
            }
            // The pending token outlived the moment its number became a client's (an invite accepted in the same sitting).
            if (!AppUser.ROLE_TRAINER.equals(user.getRole())) throw phoneHasAccount();
        }
        // Consent pair: both together (app_user_privacy_pair), stamped once.
        if (user.getPrivacyAcceptedAt() == null) {
            user.setPrivacyAcceptedAt(Instant.now());
            user.setPrivacyPolicyVersion(version);
        }
        user = appUserRepo.save(user);

        UUID appUserId = user.getId();
        Optional<Trainer> found = trainerRepo.findByAppUserIdAndDeletedAtIsNull(appUserId);
        boolean created = found.isEmpty();
        // Account already made = a replay of this pending token. Allowed briefly for a double tap; af  ter that it would keep
        // minting sessions from an unrevocable JWT.
        if (!created && claimedTooLongAgo(found.get())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "Your account is ready. Sign in to open it.");
        }
        Trainer trainer = found.orElseGet(() -> {
            Trainer t = new Trainer();
            t.setAppUserId(appUserId);
            t.setName(phone); // placeholder until setup; displayName() hides it
            // home_tenant_id stays null: the insert triggers create the workspace, membership, practice row and trial
            // (inclineyou_app has no INSERT policy on tenant, by design).
            return trainerRepo.save(t);
        });

        IssuedToken token = mintTrainer(trainer.getId(), phone);
        return new Claimed(response(token, VIEW_TRAINER, created, trainer.getId(),
                displayName(trainer.getName(), phone), trainer.getSetupCompletedAt(),
                user.getPrivacyPolicyVersion()), created);
    }

    /** The repeat call from a session that already belongs to a trainer: its own credential, echoed. */
    private AuthResponse alreadyTrainer(String subject, String rawToken) {
        Trainer trainer = trainerRepo.findById(UUID.fromString(subject))
                .filter(t -> t.getDeletedAt() == null)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "SESSION_REVOKED",
                        "This account is closed."));
        AppUser user = appUserRepo.findById(trainer.getAppUserId())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "SESSION_REVOKED",
                        "This account is closed."));
        IssuedToken token = tokens.describe(rawToken)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED",
                        "Sign in again."));
        return response(token, VIEW_TRAINER, false, trainer.getId(),
                displayName(trainer.getName(), user.getPhone()), trainer.getSetupCompletedAt(),
                user.getPrivacyPolicyVersion());
    }

    /** How long after the claim its pending token may still ask again (a double tap, a retried request). */
    static final Duration CLAIM_REPLAY_WINDOW = Duration.ofMinutes(2);

    private static boolean claimedTooLongAgo(Trainer trainer) {
        Instant at = trainer.getCreatedAt();
        return at == null || at.plus(CLAIM_REPLAY_WINDOW).isBefore(Instant.now());
    }

    /** One number, one role: a number that is already a client's cannot also become a trainer's. */
    private static ApiException phoneHasAccount() {
        return new ApiException(HttpStatus.FORBIDDEN, "PHONE_HAS_ACCOUNT",
                "This number already has an account. Sign in with it instead.");
    }

    /** The placeholder name trainer setup has not replaced yet is not a name. */
    private static String displayName(String name, String phone) {
        return name == null || name.equals(phone) ? null : name;
    }

    /* ------------------------------------------------------- minting tokens */

    /**
     * Every credential in this service goes out through the issuer interface,
     * never through {@link JwtService} directly.
     *
     * <p>That is the whole point of {@link AuthTokenService}: the phone gets a
     * self-contained JWT because it is offline half the time, the web gets a
     * revocable server-side session because a token that leaks from a browser is
     * a token somebody else is holding — and this file, which is about who
     * somebody is, does not have to know which.
     */
    private IssuedToken mint(String subject, String phone, String role, UUID tenantId) {
        return tokens.issueForCurrentRequest(new AuthPrincipal(subject, phone, role, tenantId, null));
    }

    /**
     * A trainer token, standing in their home workspace.
     *
     * <p>Home rather than "the one they were in last", because sign-in is the
     * one moment there is no previous request to ask.
     */
    private IssuedToken mintTrainer(UUID trainerId, String phone) {
        return mint(trainerId.toString(), phone, JwtService.ROLE_TRAINER,
                tenantScope.homeTenantOf(trainerId));
    }
}
