package com.inclineyou.inclineyou_backend.core.auth;

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
 * <p>v1 is the trainer web app alone, so a number that is only a client's has
 * nowhere to go: {@link #verifyOtp} answers it 403 {@code CLIENT_SIGN_IN_UNAVAILABLE}
 * and opens no session (api-contract R60). A number that is both a trainer and
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

    public static final String VIEW_TRAINER = "trainer";
    public static final String VIEW_PENDING = "pending";

    /** A sign-up answer, and whether this call created the account (201) or found it already made (200). */
    public record Claimed(AuthResponse body, boolean created) {}

    /* ---------------------------------------------------------------- codes */

    /**
     * The same answer whether or not the number has an account, so the endpoint
     * cannot be used to find out who has signed up.
     */
    public OtpRequested requestOtp(SendOtpRequest req) {
        String phone = req == null ? null : req.phone();
        if (phone == null || !phone.matches(SendOtpRequest.PHONE_PATTERN)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PHONE_INVALID", SendOtpRequest.PHONE_MESSAGE);
        }
        var issued = otpService.send(phone, OtpRequest.SIGN_IN);
        return new OtpRequested(issued.requestId().toString(),
                issued.expiresAt().toEpochMilli(), issued.resendAfterSeconds());
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

        throw new ApiException(HttpStatus.FORBIDDEN, "CLIENT_SIGN_IN_UNAVAILABLE",
                "Client sign-in opens soon. Your trainer will share it.");
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
        return response(mint(phone, phone, JwtService.ROLE_PENDING, null),
                VIEW_PENDING, true, null, null, null, null);
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
     * <p>A phone that is already somebody's client can claim a trainer account
     * too — claiming is what makes trainer the *home* role from here on: the
     * existing {@code app_user} row is updated to {@code role = 'trainer'}
     * rather than refused.
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

        // A pending token carries the phone alone; anything else here is a credential that cannot claim.
        String phone = subject;
        if (phone == null || !phone.matches(SendOtpRequest.PHONE_PATTERN)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED",
                    "Sign in again to create your account.");
        }

        Optional<AppUser> existing = appUserRepo.findByPhoneAndDeletedAtIsNull(phone);

        AppUser user;
        if (existing.isEmpty()) {
            user = new AppUser();
            user.setPhone(phone);
            user.setRole(AppUser.ROLE_TRAINER);
            user = appUserRepo.save(user);
        } else {
            user = existing.get();
            if (!AppUser.ROLE_TRAINER.equals(user.getRole())) {
                user.setRole(AppUser.ROLE_TRAINER);
            }
        }
        // Both together, always — `app_user_privacy_pair` refuses one without the
        // other, because a row that has accepted "something" with no version on it
        // is not a consent the product can point to. Stamped once: a second
        // acceptance does not move the date of the first.
        if (user.getPrivacyAcceptedAt() == null) {
            user.setPrivacyAcceptedAt(Instant.now());
            user.setPrivacyPolicyVersion(version);
        }
        user = appUserRepo.save(user);

        UUID appUserId = user.getId();
        Optional<Trainer> found = trainerRepo.findByAppUserIdAndDeletedAtIsNull(appUserId);
        boolean created = found.isEmpty();
        Trainer trainer = found.orElseGet(() -> {
            Trainer t = new Trainer();
            t.setAppUserId(appUserId);
            // Same placeholder as the old phone-on-trainer shape: not a real
            // name until setup replaces it — displayName() below is what keeps
            // it off screen until then.
            t.setName(phone);
            // home_tenant_id is left null on purpose. `ensure_home_tenant`
            // (BEFORE INSERT, SECURITY DEFINER) fills it, and the three
            // AFTER INSERT triggers behind it — ensure_home_membership,
            // ensure_trainer_business, ensure_subscription — provision the
            // owner membership, the practice row and the trial in the
            // same INSERT. Doing any of that here, as the request-scoped
            // `inclineyou_app` role, would hit `tenant`'s row-level
            // security head-on: there is no INSERT policy for it at all,
            // by design, because nothing outside these triggers is
            // supposed to create a workspace.
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
