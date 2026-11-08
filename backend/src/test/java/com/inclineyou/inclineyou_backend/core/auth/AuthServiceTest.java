package com.inclineyou.inclineyou_backend.core.auth;

import com.inclineyou.inclineyou_backend.core.auth.client.ClientSignInLookup;
import com.inclineyou.inclineyou_backend.core.auth.otp.OtpAbuseGuard;
import com.inclineyou.inclineyou_backend.core.auth.otp.OtpRequest;
import com.inclineyou.inclineyou_backend.core.auth.otp.OtpService;
import com.inclineyou.inclineyou_backend.core.auth.token.AuthPrincipal;
import com.inclineyou.inclineyou_backend.core.auth.token.AuthTokenService;
import com.inclineyou.inclineyou_backend.core.auth.token.IssuedToken;
import com.inclineyou.inclineyou_backend.core.auth.token.JwtService;
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
 * What sign-in decides: a trainer opens, a number with no account may claim one (and is shown any invites waiting for it), and a
 * number that is somebody's client lands on the portal (api-contract 1.2, inv-a5) — {@code CLIENT_SIGN_IN_UNAVAILABLE} is retired.
 * The wire flow is {@code SignInFlowTest} and {@code ClientSignInTest}.
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
    @Mock ClientSignInLookup clientLookup;

    AppProperties props = new AppProperties();
    AuthService auth;

    @BeforeEach
    void setUp() {
        props.getPrivacy().setPolicyVersion("2026-09");
        auth = new AuthService(appUserRepo, trainerRepo, otpService, tokens, tenantScope, props, clientLookup);
        when(otpService.verifyRequest(any(UUID.class), anyString())).thenReturn(PHONE);
    }

    /* ------------------------------------------------------------- request */

    @Test
    @DisplayName("a request answers its id, expiry in epoch ms and the next resend wait")
    void requestAnswers() {
        when(otpService.send(PHONE, OtpRequest.SIGN_IN, true)).thenReturn(new OtpService.Issued(REQUEST, EXPIRES, 30));

        var res = auth.requestOtp(new SendOtpRequest(PHONE), OtpAbuseGuard.SignInAdmission.OPEN);

        assertThat(res.requestId()).isEqualTo(REQUEST.toString());
        assertThat(res.expiresAt()).isEqualTo(EXPIRES.toEpochMilli());
        assertThat(res.resendAfterSeconds()).isEqualTo(30);
        assertThat(res.signupsPaused()).isFalse();
    }

    @Test
    @DisplayName("on a paused day an unknown number is answered exactly like a known one, and no message goes out")
    void pausedDayAnswersAlike() {
        when(otpService.send(PHONE, OtpRequest.SIGN_IN, false)).thenReturn(new OtpService.Issued(REQUEST, EXPIRES, 30));
        when(otpService.send(PHONE, OtpRequest.SIGN_IN, true)).thenReturn(new OtpService.Issued(REQUEST, EXPIRES, 30));

        var unknown = auth.requestOtp(new SendOtpRequest(PHONE), new OtpAbuseGuard.SignInAdmission(false, true));
        var known = auth.requestOtp(new SendOtpRequest(PHONE), new OtpAbuseGuard.SignInAdmission(true, true));

        assertThat(unknown).isEqualTo(known);
        assertThat(unknown.signupsPaused()).isTrue();
        verify(otpService).send(PHONE, OtpRequest.SIGN_IN, false);
    }

    @Test
    @DisplayName("a number that fails the format is PHONE_INVALID before anything is sent")
    void badPhone() {
        assertThatThrownBy(() -> auth.requestOtp(new SendOtpRequest("9876543210"), null))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(e.getCode()).isEqualTo("PHONE_INVALID");
                });
        verify(otpService, never()).send(anyString(), anyString(), org.mockito.ArgumentMatchers.anyBoolean());
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
    @DisplayName("a number that is a client's is a client now: a credential, role client, and the wall it is on")
    void clientNumberLandsOnThePortal() {
        stubTokens();
        when(appUserRepo.findIdentityByPhone(PHONE)).thenReturn(List.of(
                row(AppUser.ROLE_CLIENT, null, null, null, null)));
        when(clientLookup.stateOf(PHONE)).thenReturn(new ClientSignInLookup.State("active",
                new com.inclineyou.inclineyou_backend.core.auth.dto.AuthResponse.ClientTrainer("Arun Prakash", "Strength")));

        var res = auth.verifyOtp(new VerifyOtpRequest(REQUEST.toString(), "123456"));

        assertThat(res.role()).isEqualTo("client");
        assertThat(res.access()).isEqualTo("active");
        assertThat(res.trainer().name()).isEqualTo("Arun Prakash");
        assertThat(res.pendingInvites()).isEmpty();
        verify(tokens).issueForCurrentRequest(any());
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
    @DisplayName("one number, one role: a client's session, a client's step-up ticket, or a pending token whose number is now a client's cannot claim")
    void clientCannotClaimTrainer() {
        var client = new AppUser();
        client.setId(UUID.randomUUID());
        client.setPhone(PHONE);
        client.setRole(AppUser.ROLE_CLIENT);
        when(appUserRepo.findByPhone(PHONE)).thenReturn(Optional.of(client));

        for (String role : new String[]{AppUser.ROLE_CLIENT, JwtService.ROLE_STEP_UP, JwtService.ROLE_PENDING}) {
            assertThatThrownBy(() -> auth.becomeTrainer(PHONE, role, "raw", new ClaimTrainerRequest("2026-09")))
                    .as(role)
                    .isInstanceOfSatisfying(ApiException.class, e -> {
                        assertThat(e.getStatus()).isEqualTo(HttpStatus.FORBIDDEN);
                        assertThat(e.getCode()).isEqualTo("PHONE_HAS_ACCOUNT");
                    });
        }
        assertThat(client.getRole()).isEqualTo(AppUser.ROLE_CLIENT);
        verify(appUserRepo, never()).save(any());
        verify(trainerRepo, never()).save(any());
    }

    @Test
    @DisplayName("a closed account's number is ACCOUNT_CLOSED, not a second app_user colliding on the phone key")
    void closedAccountCannotClaim() {
        var closed = new AppUser();
        closed.setId(UUID.randomUUID());
        closed.setPhone(PHONE);
        closed.setRole(AppUser.ROLE_TRAINER);
        closed.setDeletedAt(Instant.now());
        when(appUserRepo.findByPhone(PHONE)).thenReturn(Optional.of(closed));

        assertThatThrownBy(() -> auth.becomeTrainer(PHONE, JwtService.ROLE_PENDING, "raw", new ClaimTrainerRequest("2026-09")))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.FORBIDDEN);
                    assertThat(e.getCode()).isEqualTo("ACCOUNT_CLOSED");
                });
        verify(appUserRepo, never()).save(any());
        verify(trainerRepo, never()).save(any());
    }

    @Test
    @DisplayName("a claim takes the number's lock before it looks for the account, so a double tap finds the first one's row")
    void claimLocksTheNumberFirst() {
        stubTokens();
        when(appUserRepo.findByPhone(PHONE)).thenReturn(Optional.empty());
        when(appUserRepo.save(any())).thenAnswer(inv -> {
            var u = (AppUser) inv.getArgument(0);
            if (u.getId() == null) u.setId(UUID.randomUUID());
            return u;
        });
        when(trainerRepo.findByAppUserIdAndDeletedAtIsNull(any())).thenReturn(Optional.empty());
        when(trainerRepo.save(any())).thenAnswer(inv -> {
            var t = (Trainer) inv.getArgument(0);
            t.setId(UUID.randomUUID());
            return t;
        });

        auth.becomeTrainer(PHONE, JwtService.ROLE_PENDING, "raw", new ClaimTrainerRequest("2026-09"));

        var order = org.mockito.Mockito.inOrder(appUserRepo);
        order.verify(appUserRepo).lockClaim(PHONE);
        order.verify(appUserRepo).findByPhone(PHONE);
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
        trainer.setCreatedAt(Instant.now());
        when(appUserRepo.findByPhone(PHONE)).thenReturn(Optional.of(user));
        when(appUserRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(trainerRepo.findByAppUserIdAndDeletedAtIsNull(user.getId())).thenReturn(Optional.of(trainer));

        var claimed = auth.becomeTrainer(PHONE, JwtService.ROLE_PENDING, "raw", new ClaimTrainerRequest("2026-09"));

        assertThat(claimed.created()).isFalse();
        verify(trainerRepo, never()).save(any());
    }

    @Test
    @DisplayName("finding 5: the pending token that made the account cannot keep minting trainer sessions past the replay window")
    void pendingReplayIsBounded() {
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
        trainer.setCreatedAt(Instant.now().minus(AuthService.CLAIM_REPLAY_WINDOW).minusSeconds(1));
        when(appUserRepo.findByPhone(PHONE)).thenReturn(Optional.of(user));
        when(appUserRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(trainerRepo.findByAppUserIdAndDeletedAtIsNull(user.getId())).thenReturn(Optional.of(trainer));

        assertThatThrownBy(() -> auth.becomeTrainer(PHONE, JwtService.ROLE_PENDING, "raw", new ClaimTrainerRequest("2026-09")))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.UNAUTHORIZED);
                    assertThat(e.getCode()).isEqualTo("SESSION_EXPIRED");
                });
        verify(tokens, never()).issueForCurrentRequest(any());
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
