package com.xrep.xrep_backend.auth;

import com.xrep.xrep_backend.entity.Trainer;
import com.xrep.xrep_backend.repository.ClientRepository;
import com.xrep.xrep_backend.repository.TrainerRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * What sign-in decides, and specifically what a pause decides.
 *
 * The behaviour under test here was a bug worth a regression test rather than a
 * changelog line: a paused membership used to return no token, which took the
 * app off the phone of anyone whose package lapsed — while ClientSyncService
 * went on serving paused clients their history quite happily. The two halves
 * disagreed, and because tokens last seven days the visible symptom was an app
 * that worked for a week and then didn't.
 *
 * So the first test below is the fix, and the rest are the cases it must not
 * have broken on the way past.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AuthServiceTest {

    private static final String PHONE = "9876543210";
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Mock TrainerRepository trainerRepo;
    @Mock ClientRepository clientRepo;
    @Mock OtpService otpService;
    @Mock JwtService jwtService;

    @InjectMocks AuthService auth;

    /* ------------------------------------------------------------ the fix */

    @Test
    @DisplayName("a client whose only roster is paused still gets a token")
    void pausedClientSignsIn() {
        stubTokens();
        noTrainer();
        var pausedOn = Instant.parse("2026-07-22T04:00:00Z");
        when(clientRepo.findMembershipsByPhone(PHONE))
                .thenReturn(List.of(membership("Ravi Kannan", "paused", pausedOn)));

        var res = auth.verifyOtp(PHONE, "123456");

        // The whole point: there is something to sign into.
        assertThat(res.token()).isNotNull();
        assertThat(res.role()).isEqualTo(JwtService.ROLE_CLIENT);

        // And the lens knows which roster is on hold, so it can say so.
        assertThat(res.clientOf()).hasSize(1);
        assertThat(res.clientOf().get(0).status()).isEqualTo("paused");
        assertThat(res.clientOf().get(0).pausedOn())
                .isEqualTo(LocalDate.ofInstant(pausedOn, IST).toString());

        // Nothing but paused rosters, so the banner gets its copy.
        assertThat(res.paused()).isNotNull();
        assertThat(res.paused().trainerName()).isEqualTo("Ravi Kannan");
        assertThat(res.paused().pausedOn()).isEqualTo("2026-07-22");
    }

    @Test
    @DisplayName("`paused` is not sent as a role any more — it was the wall")
    void pausedIsNeverARole() {
        stubTokens();
        noTrainer();
        when(clientRepo.findMembershipsByPhone(PHONE))
                .thenReturn(List.of(membership("Ravi Kannan", "paused", Instant.now())));

        assertThat(auth.verifyOtp(PHONE, "123456").role()).isNotEqualTo("paused");
    }

    /* ------------------------------------------------- what it must not break */

    @Test
    @DisplayName("one paused roster among live ones is not a paused sign-in")
    void mixedRostersAreNotPaused() {
        stubTokens();
        noTrainer();
        when(clientRepo.findMembershipsByPhone(PHONE)).thenReturn(List.of(
                membership("Ravi Kannan", "active", null),
                membership("Kumar S", "paused", Instant.parse("2026-07-22T04:00:00Z"))));

        var res = auth.verifyOtp(PHONE, "123456");

        assertThat(res.role()).isEqualTo(JwtService.ROLE_CLIENT);
        // Both come back — the paused one is reachable, it is just labelled.
        assertThat(res.clientOf()).hasSize(2);
        // But the person IS training with somebody, so the banner would be a lie.
        assertThat(res.paused()).isNull();
    }

    @Test
    @DisplayName("an active client is untouched by any of this")
    void activeClientUnchanged() {
        stubTokens();
        noTrainer();
        when(clientRepo.findMembershipsByPhone(PHONE))
                .thenReturn(List.of(membership("Ravi Kannan", "active", null)));

        var res = auth.verifyOtp(PHONE, "123456");

        assertThat(res.role()).isEqualTo(JwtService.ROLE_CLIENT);
        assertThat(res.token()).isNotNull();
        assertThat(res.paused()).isNull();
        assertThat(res.clientOf().get(0).pausedOn()).isNull();
    }

    @Test
    @DisplayName("a trainer who is also a paused client still opens the coaching lens")
    void trainerWithPausedMembership() {
        stubTokens();
        var trainer = new Trainer();
        trainer.setId(UUID.randomUUID());
        trainer.setPhone(PHONE);
        trainer.setName("Ravi Kannan");
        when(trainerRepo.findByPhoneAndDeletedAtIsNull(PHONE)).thenReturn(Optional.of(trainer));
        when(clientRepo.findMembershipsByPhone(PHONE))
                .thenReturn(List.of(membership("Kumar S", "paused", Instant.now())));

        var res = auth.verifyOtp(PHONE, "123456");

        assertThat(res.role()).isEqualTo(JwtService.ROLE_TRAINER);
        assertThat(res.token()).isNotNull();
        assertThat(res.clientOf()).hasSize(1);
    }

    @Test
    @DisplayName("a number on nobody's roster is still 7a, not a silent trainer account")
    void unknownNumberIsPending() {
        stubTokens();
        noTrainer();
        when(clientRepo.findMembershipsByPhone(PHONE)).thenReturn(List.of());

        var res = auth.verifyOtp(PHONE, "123456");

        assertThat(res.role()).isEqualTo(JwtService.ROLE_PENDING);
        assertThat(res.isNewUser()).isTrue();
        assertThat(res.paused()).isNull();
    }

    /* ------------------------------------------------------------- fixtures */

    private void noTrainer() {
        when(trainerRepo.findByPhoneAndDeletedAtIsNull(PHONE)).thenReturn(Optional.empty());
    }

    private void stubTokens() {
        when(jwtService.generate(any(), anyString())).thenReturn("trainer-token");
        when(jwtService.generateClient(anyString())).thenReturn("client-token");
        when(jwtService.generatePending(anyString())).thenReturn("pending-token");
    }

    /** The Spring Data projection, hand-rolled — there is no entity to build here. */
    private static ClientRepository.Membership membership(
            String trainerName, String status, Instant pausedAt) {
        return new ClientRepository.Membership() {
            public UUID getClientId() { return UUID.randomUUID(); }
            public UUID getTrainerId() { return UUID.randomUUID(); }
            public String getClientName() { return "Priya"; }
            public String getStatus() { return status; }
            public Instant getPausedAt() { return pausedAt; }
            public String getTrainerName() { return trainerName; }
            public String getGymName() { return "Iron Works"; }
            public String getTrainerPhone() { return "9000000001"; }
        };
    }
}
