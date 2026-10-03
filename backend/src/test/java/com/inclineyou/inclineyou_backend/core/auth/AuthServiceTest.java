package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.core.auth.dto.ClaimTrainerRequest;
import com.inclineyou.inclineyou_backend.core.auth.dto.SendOtpRequest;
import com.inclineyou.inclineyou_backend.core.auth.dto.VerifyOtpRequest;
import com.inclineyou.inclineyou_backend.core.tenant.TenantScope;
import com.inclineyou.inclineyou_backend.core.trainer.Trainer;
import com.inclineyou.inclineyou_backend.core.trainer.TrainerRepository;
import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * What sign-in decides in v1, where the only product is the trainer's: a
 * trainer opens, a number with no account may claim one, and a number that is
 * only somebody's client is refused with {@code CLIENT_SIGN_IN_UNAVAILABLE} and
 * given no credential (api-contract R60). The wire flow is {@code SignInFlowTest}.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AuthServiceTest {

    private static final String PHONE = "+919876543210";
    private static final UUID REQUEST = UUID.randomUUID();
    private static final Instant EXPIRES = Instant.parse("2026-10-03T12:00:00Z");

    @Mock AppUserRepository appUserRepo;
    @Mock TrainerRepository trainerRepo;
    @Mock OtpService otpService;
    @Mock AuthTokenService tokens;
    @Mock TenantScope tenantScope;

    AppProperties props = new AppProperties();
    AuthService auth;

    @BeforeEach
    void setUp() {
        props.getPrivacy().setPolicyVersion("2026-09");
        auth = new AuthService(appUserRepo, trainerRepo, otpService, tokens, tenantScope, props);
        when(otpService.verifyRequest(any(UUID.class), anyString())).thenReturn(PHONE);
    }

    /* ------------------------------------------------------------- request */

    @Test
    @DisplayName("a request answers its id, expiry in epoch ms and the next resend wait")
    void requestAnswers() {
        when(otpService.send(PHONE, OtpRequest.SIGN_IN)).thenReturn(new OtpService.Issued(REQUEST, EXPIRES, 30));

        var res = auth.requestOtp(new SendOtpRequest(PHONE));

        assertThat(res.requestId()).isEqualTo(REQUEST.toString());
        assertThat(res.expiresAt()).isEqualTo(EXPIRES.toEpochMilli());
        assertThat(res.resendAfterSeconds()).isEqualTo(30);
    }

    @Test
    @DisplayName("a number that fails the format is PHONE_INVALID before anything is sent")
    void badPhone() {
        assertThatThrownBy(() -> auth.requestOtp(new SendOtpRequest("9876543210")))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(e.getCode()).isEqualTo("PHONE_INVALID");
                });
        verify(otpService, never()).send(anyString(), anyString());
    }

    /* -------------------------------------------------------------- verify */

    @Test
    @DisplayName("a number with no account is pending — never a silent trainer account")
    void unknownNumberIsPending() {
        stubTokens();
        when(appUserRepo.findIdentityByPhone(PHONE)).thenReturn(List.of());

        var res = auth.verifyOtp(new VerifyOtpRequest(REQUEST.toString(), "123456"));

        assertThat(res.role()).isEqualTo(AuthService.VIEW_PENDING);
        assertThat(res.token()).isEqualTo("pending-token");
        assertThat(res.isNewUser()).isTrue();
        assertThat(res.sessionId()).isNull();
        assertThat(res.currentPolicyVersion()).isEqualTo("2026-09");
    }

    @Test
    @DisplayName("a trainer signs in with their session, setup date and accepted notice version")
    void trainerSignsIn() {
        stubTokens();
        Instant setup = Instant.parse("2026-09-30T04:00:00Z");
        when(appUserRepo.findIdentityByPhone(PHONE)).thenReturn(List.of(
                row(AppUser.ROLE_TRAINER, UUID.randomUUID(), "Ravi Kannan", setup, "2026-08")));

        var res = auth.verifyOtp(new VerifyOtpRequest(REQUEST.toString(), "123456"));

        assertThat(res.role()).isEqualTo(AuthService.VIEW_TRAINER);
        assertThat(res.token()).isEqualTo("trainer-token");
        assertThat(res.sessionId()).isEqualTo("ws-1");
        assertThat(res.isNewUser()).isFalse();
        assertThat(res.trainerName()).isEqualTo("Ravi Kannan");
        assertThat(res.setupCompletedAt()).isEqualTo(setup.toEpochMilli());
        // The mismatch is what sends them to the consent screen.
        assertThat(res.privacyPolicyVersion()).isEqualTo("2026-08");
        assertThat(res.currentPolicyVersion()).isEqualTo("2026-09");
    }

    @Test
    @DisplayName("a number that is only a client's is refused and gets no credential")
    void clientOnlyNumberIsRefused() {
        stubTokens();
        when(appUserRepo.findIdentityByPhone(PHONE)).thenReturn(List.of(
                row(AppUser.ROLE_CLIENT, null, null, null, null)));

        assertThatThrownBy(() -> auth.verifyOtp(new VerifyOtpRequest(REQUEST.toString(), "123456")))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.FORBIDDEN);
                    assertThat(e.getCode()).isEqualTo("CLIENT_SIGN_IN_UNAVAILABLE");
                });
        verify(tokens, never()).issueForCurrentRequest(any());
    }

    @Test
    @DisplayName("a malformed request id is the same 404 as an unknown one")
    void malformedRequestId() {
        assertThatThrownBy(() -> auth.verifyOtp(new VerifyOtpRequest("nope", "123456")))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getCode()).isEqualTo("OTP_REQUEST_NOT_FOUND"));
        assertThatThrownBy(() -> auth.deliveryOf("nope"))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getCode()).isEqualTo("OTP_REQUEST_NOT_FOUND"));
    }

    /* ---------------------------------------------------- become a trainer */

    @Test
    @DisplayName("a phone that is already somebody's client can still claim a trainer account")
    void clientCanClaimTrainer() {
        stubTokens();
        var existing = new AppUser();
        existing.setId(UUID.randomUUID());
        existing.setPhone(PHONE);
        existing.setRole(AppUser.ROLE_CLIENT);
        when(appUserRepo.findByPhoneAndDeletedAtIsNull(PHONE)).thenReturn(Optional.of(existing));
        when(appUserRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(trainerRepo.findByAppUserIdAndDeletedAtIsNull(existing.getId())).thenReturn(Optional.empty());
        when(trainerRepo.save(any())).thenAnswer(inv -> {
            var t = (Trainer) inv.getArgument(0);
            t.setId(UUID.randomUUID());
            return t;
        });

        var claimed = auth.becomeTrainer(PHONE, JwtService.ROLE_PENDING, "raw", new ClaimTrainerRequest("2026-09"));

        assertThat(claimed.created()).isTrue();
        assertThat(claimed.body().role()).isEqualTo(AuthService.VIEW_TRAINER);
        assertThat(claimed.body().token()).isEqualTo("trainer-token");
        // Claiming is what makes trainer the home role — the existing row is
        // updated, not refused — and it stamps the consent the screen carried.
        assertThat(existing.getRole()).isEqualTo(AppUser.ROLE_TRAINER);
        assertThat(existing.getPrivacyPolicyVersion()).isEqualTo("2026-09");
        assertThat(existing.getPrivacyAcceptedAt()).isNotNull();
    }

    @Test
    @DisplayName("claiming when the trainer already exists is a 200 that creates nothing")
    void claimAgainIsNotACreate() {
        stubTokens();
        var user = new AppUser();
        user.setId(UUID.randomUUID());
        user.setPhone(PHONE);
        user.setRole(AppUser.ROLE_TRAINER);
        user.setPrivacyAcceptedAt(Instant.now());
        user.setPrivacyPolicyVersion("2026-09");
        var trainer = new Trainer();
        trainer.setId(UUID.randomUUID());
        trainer.setAppUserId(user.getId());
        trainer.setName(PHONE);
        when(appUserRepo.findByPhoneAndDeletedAtIsNull(PHONE)).thenReturn(Optional.of(user));
        when(appUserRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(trainerRepo.findByAppUserIdAndDeletedAtIsNull(user.getId())).thenReturn(Optional.of(trainer));

        var claimed = auth.becomeTrainer(PHONE, JwtService.ROLE_PENDING, "raw", new ClaimTrainerRequest("2026-09"));

        assertThat(claimed.created()).isFalse();
        verify(trainerRepo, never()).save(any());
    }

    @Test
    @DisplayName("a missing or outdated notice version is CONSENT_REQUIRED, before anything is read")
    void consentRequired() {
        for (var body : new ClaimTrainerRequest[]{null, new ClaimTrainerRequest(null), new ClaimTrainerRequest("2020-01")}) {
            assertThatThrownBy(() -> auth.becomeTrainer(PHONE, JwtService.ROLE_PENDING, "raw", body))
                    .isInstanceOfSatisfying(ApiException.class, e -> {
                        assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                        assertThat(e.getCode()).isEqualTo("CONSENT_REQUIRED");
                    });
        }
        verify(appUserRepo, never()).save(any());
    }

    /* ------------------------------------------------------------- fixtures */

    /** The stub answers by ROLE, the only thing these tests assert about a credential. */
    private void stubTokens() {
        when(tokens.issueForCurrentRequest(any(AuthPrincipal.class))).thenAnswer(inv -> {
            AuthPrincipal p = inv.getArgument(0);
            boolean pending = JwtService.ROLE_PENDING.equals(p.role());
            return new IssuedToken(pending ? "pending-token" : "trainer-token", pending ? "jwt" : "session",
                    EXPIRES, pending ? null : "ws-1");
        });
    }

    /** The Spring Data projection, hand-rolled — there is no entity to build here. */
    private static AppUserRepository.Identity row(
            String role, UUID trainerId, String trainerOwnName, Instant setupAt, String acceptedVersion) {
        return new AppUserRepository.Identity() {
            public String getPhone() { return PHONE; }
            public String getRole() { return role; }
            public String getPrivacyPolicyVersion() { return acceptedVersion; }
            public UUID getTrainerId() { return trainerId; }
            public Instant getSetupCompletedAt() { return setupAt; }
            public String getTrainerOwnName() { return trainerOwnName; }
        };
    }
}
