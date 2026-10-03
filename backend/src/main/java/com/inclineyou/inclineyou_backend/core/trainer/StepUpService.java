package com.inclineyou.inclineyou_backend.core.trainer;

import com.inclineyou.inclineyou_backend.core.auth.AppUser;
import com.inclineyou.inclineyou_backend.core.auth.AppUserRepository;
import com.inclineyou.inclineyou_backend.core.auth.JwtService;
import com.inclineyou.inclineyou_backend.core.auth.OtpRequest;
import com.inclineyou.inclineyou_backend.core.auth.OtpService;
import com.inclineyou.inclineyou_backend.core.auth.SessionTokenIssuer;
import com.inclineyou.inclineyou_backend.core.trainer.dto.StepUpTicketResponse;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.Set;
import java.util.UUID;

/**
 * PROVE IT'S YOU AGAIN (api-contract v1.1, Settings A9) — a code to the number the
 * account is signed in with, traded for a ten-minute ticket that unlocks the two
 * things a stolen session must not be able to do: move the account to another
 * number, and close it.
 *
 * <p>The codes are {@link OtpService}'s, so every wait, lock and daily ceiling that
 * governs sign-in governs this too, keyed per number — a step-up and a sign-in on
 * the same number share one lock, which is the point: the cheaper of the two must
 * not be the way to brute-force it. The ticket's design and why it needs no table
 * is {@link JwtService#ROLE_STEP_UP}.
 *
 * <p>Not {@code @Transactional}: nothing is written. A verified code is consumed
 * inside the OTP store's own transaction, and the ticket is a signature over facts
 * that are already true.
 */
@Service
@RequiredArgsConstructor
public class StepUpService {

    public static final String PHONE_CHANGE = "phone_change";
    public static final String ACCOUNT_DELETION = "account_deletion";
    public static final Set<String> PURPOSES = Set.of(PHONE_CHANGE, ACCOUNT_DELETION);

    private final TrainerRepository trainerRepo;
    private final AppUserRepository appUserRepo;
    private final OtpService otpService;
    private final JwtService jwtService;

    /** A code to the CURRENT number. Throws OtpLocked / OtpThrottled as sign-in does. */
    public void send(UUID trainerId, String purpose) {
        requirePurpose(purpose);
        otpService.send(currentPhone(trainerId), OtpRequest.CHANGE_PHONE_OLD);
    }

    /**
     * That code back, and the ticket for it. A wrong or expired code is the OTP
     * service's own exception, deliberately not re-thrown as an account rule: "wrong
     * code, 2 tries left" is a better sentence than anything this class could
     * write, and the web already reads it from the sign-in flow.
     */
    public StepUpTicketResponse verify(UUID trainerId, String purpose, String code, String rawToken) {
        requirePurpose(purpose);
        String phone = currentPhone(trainerId);
        otpService.verify(phone, code);
        String ticket = jwtService.generateStepUpTicket(trainerId, phone, purpose, binding(rawToken));
        return new StepUpTicketResponse(ticket, jwtService.parse(ticket).getExpiration().getTime());
    }

    /**
     * Is this ticket this trainer's, for this purpose, on this session, unexpired and
     * still about the number the account is on? Returns normally or throws.
     *
     * <p>Two different refusals, because they mean two different things to the
     * person: {@code 403 STEP_UP_REQUIRED} for a ticket that was never valid here
     * (absent, forged, wrong purpose, wrong session, wrong trainer), and {@code 401
     * TICKET_EXPIRED} for one that WAS valid and no longer is (past ten minutes, or
     * spent — the number moved). Expiry is only reported for a correctly SIGNED
     * ticket, so a made-up expired one is a 403, not a hint.
     */
    public void require(String ticket, String purpose, UUID trainerId, String rawToken) {
        if (ticket == null || ticket.isBlank()) throw AccountRuleException.stepUpRequired();
        Claims claims;
        try {
            claims = jwtService.parse(ticket.strip());
        } catch (ExpiredJwtException e) {
            throw AccountRuleException.ticketExpired();
        } catch (JwtException | IllegalArgumentException e) {
            throw AccountRuleException.stepUpRequired();
        }
        boolean ours = JwtService.ROLE_STEP_UP.equals(jwtService.extractRole(claims))
                && purpose.equals(claims.get(JwtService.PURPOSE_CLAIM, String.class))
                && trainerId.toString().equals(claims.getSubject())
                && binding(rawToken).equals(claims.get(JwtService.SESSION_CLAIM, String.class));
        if (!ours) throw AccountRuleException.stepUpRequired();
        // The last clause is the single-use rule: a confirmed phone change moves the
        // number, so a ticket minted before it proves a SIM the account has left.
        if (!currentPhone(trainerId).equals(claims.get("phone", String.class))) {
            throw AccountRuleException.ticketExpired();
        }
    }

    /** What a ticket binds to: a hash of the bearer token the caller proved it with. */
    public static String binding(String rawToken) {
        return rawToken == null ? "-" : SessionTokenIssuer.hash(rawToken);
    }

    private static void requirePurpose(String purpose) {
        if (purpose == null || !PURPOSES.contains(purpose)) {
            throw ApiException.validation("purpose: phone_change or account_deletion");
        }
    }

    private String currentPhone(UUID trainerId) {
        Trainer t = trainerRepo.findById(trainerId)
                .filter(x -> x.getDeletedAt() == null)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Trainer not found"));
        return appUserRepo.findById(t.getAppUserId())
                .map(AppUser::getPhone)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Trainer not found"));
    }
}
