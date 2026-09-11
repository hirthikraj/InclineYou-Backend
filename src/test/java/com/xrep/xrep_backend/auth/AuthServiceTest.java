package com.xrep.xrep_backend.auth;

import com.xrep.xrep_backend.entity.AppUser;
import com.xrep.xrep_backend.repository.AppUserRepository;
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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * What sign-in decides.
 *
 * Two behaviours are pinned here, and both were bugs worth a regression test
 * rather than a changelog line.
 *
 * The first is the pause: a paused membership used to return no token, which
 * took the app off the phone of anyone whose package lapsed — while
 * ClientSyncService went on serving paused clients their history quite happily.
 * The two halves disagreed, and because tokens last seven days the visible
 * symptom was an app that worked for a week and then didn't.
 *
 * The second is consent (V18): a trainer typing a number into their roster is a
 * claim, not a relationship, and the person on the other end must be asked
 * before anything of theirs is shared. The invite must therefore never carry a
 * token that can open a sync scope, and the removal notice must be shown exactly
 * once — the server row is kept forever, so without the acknowledgement it would
 * be the app for the rest of time.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AuthServiceTest {

    private static final String PHONE = "9876543210";
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Mock AppUserRepository appUserRepo;
    @Mock TrainerRepository trainerRepo;
    @Mock ClientRepository clientRepo;
    @Mock OtpService otpService;
    @Mock JwtService jwtService;
    @Mock AuthTokenService tokens;
    @Mock com.xrep.xrep_backend.tenant.TenantScope tenantScope;

    @InjectMocks AuthService auth;

    /* --------------------------------------------------- pause is not a wall */

    @Test
    @DisplayName("a client whose only roster is paused still gets a token")
    void pausedClientSignsIn() {
        stubTokens();
        var pausedOn = Instant.parse("2026-07-22T04:00:00Z");
        identity(client("Ravi Kannan", "paused", "paused", pausedOn));

        var res = auth.verifyOtp(PHONE, "123456");

        // The whole point: there is something to sign into.
        assertThat(res.token()).isNotNull();
        assertThat(res.role()).isEqualTo(AuthService.VIEW_CLIENT);

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
        identity(client("Ravi Kannan", "paused", "paused", Instant.now()));

        assertThat(auth.verifyOtp(PHONE, "123456").role()).isNotEqualTo("paused");
    }

    @Test
    @DisplayName("one paused roster among live ones is not a paused sign-in")
    void mixedRostersAreNotPaused() {
        stubTokens();
        identity(client("Ravi Kannan", "active", "accepted", null),
                 client("Kumar S", "paused", "paused", Instant.parse("2026-07-22T04:00:00Z")));

        var res = auth.verifyOtp(PHONE, "123456");

        assertThat(res.role()).isEqualTo(AuthService.VIEW_CLIENT);
        // Both come back — the paused one is reachable, it is just labelled.
        assertThat(res.clientOf()).hasSize(2);
        // But the person IS training with somebody, so the banner would be a lie.
        assertThat(res.paused()).isNull();
    }

    @Test
    @DisplayName("an active client is untouched by any of this")
    void activeClientUnchanged() {
        stubTokens();
        identity(client("Ravi Kannan", "active", "accepted", null));

        var res = auth.verifyOtp(PHONE, "123456");

        assertThat(res.role()).isEqualTo(AuthService.VIEW_CLIENT);
        assertThat(res.token()).isNotNull();
        assertThat(res.paused()).isNull();
        assertThat(res.clientOf().get(0).pausedOn()).isNull();
    }

    @Test
    @DisplayName("a number on nobody's roster is still 7a, not a silent trainer account")
    void unknownNumberIsPending() {
        stubTokens();
        when(appUserRepo.findIdentityByPhone(PHONE)).thenReturn(List.of());

        var res = auth.verifyOtp(PHONE, "123456");

        assertThat(res.role()).isEqualTo(AuthService.VIEW_PENDING);
        assertThat(res.isNewUser()).isTrue();
        assertThat(res.paused()).isNull();
    }

    @Test
    @DisplayName("a trainer with no other rosters opens the coaching lens and carries none")
    void trainerSignsIn() {
        stubTokens();
        when(appUserRepo.findIdentityByPhone(PHONE)).thenReturn(List.of(
                trainerRow(UUID.randomUUID(), "Ravi Kannan", Instant.now())));

        var res = auth.verifyOtp(PHONE, "123456");

        assertThat(res.role()).isEqualTo(AuthService.VIEW_TRAINER);
        assertThat(res.token()).isNotNull();
        assertThat(res.setupComplete()).isTrue();
        assertThat(res.clientOf()).isEmpty();
    }

    @Test
    @DisplayName("a trainer with a LIVE membership elsewhere sees it in clientOf")
    void trainerWithLiveMembershipSeesIt() {
        stubTokens();
        when(appUserRepo.findIdentityByPhone(PHONE)).thenReturn(List.of(
                row(AppUser.ROLE_TRAINER, UUID.randomUUID(), "Ravi Kannan", Instant.now(),
                        "Anand", "active", "accepted", null, null, null)));

        var res = auth.verifyOtp(PHONE, "123456");

        // Trainer stays the destination — home role wins — but the membership
        // is not hidden.
        assertThat(res.role()).isEqualTo(AuthService.VIEW_TRAINER);
        assertThat(res.clientOf()).hasSize(1);
        assertThat(res.clientOf().get(0).trainerName()).isEqualTo("Anand");
    }

    @Test
    @DisplayName("a trainer's OUTSTANDING invite elsewhere does not interrupt the coaching sign-in")
    void trainerWithPendingInviteIsUnaffected() {
        stubTokens();
        when(appUserRepo.findIdentityByPhone(PHONE)).thenReturn(List.of(
                row(AppUser.ROLE_TRAINER, UUID.randomUUID(), "Ravi Kannan", Instant.now(),
                        "Anand", "active", "invited", null, null, null)));

        var res = auth.verifyOtp(PHONE, "123456");

        assertThat(res.role()).isEqualTo(AuthService.VIEW_TRAINER);
        // Deliberately out of scope for this pass — see AuthService#trainerView.
        assertThat(res.clientOf()).isEmpty();
    }

    /* -------------------------------------------------------------- consent */

    @Test
    @DisplayName("an unanswered invite gets the invited role, never a client token")
    void invitedClientIsNotSignedIn() {
        stubTokens();
        identity(client("Ravi Kannan", "active", "invited", null));

        var res = auth.verifyOtp(PHONE, "123456");

        assertThat(res.role()).isEqualTo(AuthService.VIEW_INVITED);
        // The distinction the whole consent step rests on: the token behind an
        // invite must not be one that opens a sync scope.
        assertThat(res.token()).isEqualTo("invited-token");
        assertThat(res.clientOf()).hasSize(1);
        assertThat(res.clientOf().get(0).membershipStatus()).isEqualTo("invited");
    }

    @Test
    @DisplayName("a live roster beats an outstanding invite — training is not held up")
    void liveRosterWinsOverInvite() {
        stubTokens();
        identity(client("Ravi Kannan", "active", "accepted", null),
                 client("Kumar S", "active", "invited", null));

        var res = auth.verifyOtp(PHONE, "123456");

        assertThat(res.role()).isEqualTo(AuthService.VIEW_CLIENT);
        assertThat(res.token()).isEqualTo("client-token");
        // The invite still travels, so the app can surface it inside the lens
        // rather than making it wait for the next sign-in.
        assertThat(res.clientOf()).hasSize(2);
    }

    @Test
    @DisplayName("a removal names who and when, and is shown exactly once")
    void removalIsAnnouncedThenRetired() {
        stubTokens();
        var removedAt = Instant.parse("2026-08-14T04:00:00Z");
        identity(removedClient("Ravi Kannan", removedAt, null));

        var res = auth.verifyOtp(PHONE, "123456");

        assertThat(res.role()).isEqualTo(AuthService.VIEW_REMOVED);
        assertThat(res.removed()).isNotNull();
        assertThat(res.removed().trainerName()).isEqualTo("Ravi Kannan");
        assertThat(res.removed().removedOn()).isEqualTo("2026-08-14");

        // Once acknowledged the row still says `removed` forever — the trainer's
        // books point at it — so the ack stamp is the only thing standing
        // between this person and the notice on every future sign-in.
        identity(removedClient("Ravi Kannan", removedAt, Instant.now()));
        var after = auth.verifyOtp(PHONE, "123456");

        assertThat(after.role()).isEqualTo(AuthService.VIEW_UNATTACHED);
        assertThat(after.removed()).isNull();
    }

    @Test
    @DisplayName("a declined invite is unattached, NOT 7a — never offered a trainer account")
    void declinedIsUnattachedNotPending() {
        stubTokens();
        identity(client("Ravi Kannan", "active", "declined", null));

        var res = auth.verifyOtp(PHONE, "123456");

        // The distinction matters: 7a offers "I'm a trainer", and handing that
        // to somebody who declined one invite would quietly convert them.
        assertThat(res.role()).isEqualTo(AuthService.VIEW_UNATTACHED);
        assertThat(res.role()).isNotEqualTo(AuthService.VIEW_PENDING);
        assertThat(res.clientOf()).isEmpty();
    }

    /* --------------------------------------------------------- claim (7a) */

    @Test
    @DisplayName("a phone that is already somebody's client can still claim a trainer account")
    void clientCanClaimTrainer() {
        stubTokens();
        var existing = new AppUser();
        existing.setPhone(PHONE);
        existing.setRole(AppUser.ROLE_CLIENT);
        when(appUserRepo.findByPhoneAndDeletedAtIsNull(PHONE)).thenReturn(java.util.Optional.of(existing));
        when(trainerRepo.findByPhoneAndDeletedAtIsNull(PHONE)).thenReturn(java.util.Optional.empty());
        when(trainerRepo.save(org.mockito.ArgumentMatchers.any())).thenAnswer(inv -> {
            var t = (com.xrep.xrep_backend.entity.Trainer) inv.getArgument(0);
            t.setId(UUID.randomUUID());
            return t;
        });

        var res = auth.claimTrainer(PHONE);

        assertThat(res.role()).isEqualTo(AuthService.VIEW_TRAINER);
        assertThat(res.token()).isNotNull();
        // Claiming is what makes trainer the home role — the existing row is
        // updated, not refused.
        assertThat(existing.getRole()).isEqualTo(AppUser.ROLE_TRAINER);
    }

    /* -------------------------------------------------------- mode switch */

    @Test
    @DisplayName("switching to trainer mode mints a trainer token when one exists")
    void switchToTrainerModeSucceeds() {
        stubTokens();
        UUID trainerId = UUID.randomUUID();
        when(appUserRepo.findIdentityByPhone(PHONE)).thenReturn(List.of(
                trainerRow(trainerId, "Ravi Kannan", Instant.now())));

        var res = auth.switchToTrainer(PHONE);

        assertThat(res.role()).isEqualTo(AuthService.VIEW_TRAINER);
        assertThat(res.trainerId()).isEqualTo(trainerId.toString());
    }

    @Test
    @DisplayName("switching to trainer mode 404s when this number owns no trainer account")
    void switchToTrainerModeFailsWithoutAccount() {
        when(appUserRepo.findIdentityByPhone(PHONE)).thenReturn(List.of(
                client("Ravi Kannan", "active", "accepted", null)));

        assertThatThrownBy(() -> auth.switchToTrainer(PHONE))
                .extracting("statusCode")
                .isEqualTo(org.springframework.http.HttpStatusCode.valueOf(404));
    }

    @Test
    @DisplayName("switching to client mode mints a client token when a live membership exists")
    void switchToClientModeSucceeds() {
        stubTokens();
        when(appUserRepo.findIdentityByPhone(PHONE)).thenReturn(List.of(
                client("Ravi Kannan", "active", "accepted", null)));

        var res = auth.switchToClient(PHONE);

        assertThat(res.role()).isEqualTo(AuthService.VIEW_CLIENT);
        assertThat(res.clientOf()).hasSize(1);
    }

    @Test
    @DisplayName("switching to client mode 404s with no live membership anywhere")
    void switchToClientModeFailsWithoutMembership() {
        when(appUserRepo.findIdentityByPhone(PHONE)).thenReturn(List.of(
                trainerRow(UUID.randomUUID(), "Ravi Kannan", Instant.now())));

        assertThatThrownBy(() -> auth.switchToClient(PHONE))
                .extracting("statusCode")
                .isEqualTo(org.springframework.http.HttpStatusCode.valueOf(404));
    }

    /* ------------------------------------------------------------- fixtures */

    private void identity(AppUserRepository.Identity... rows) {
        when(appUserRepo.findIdentityByPhone(PHONE)).thenReturn(List.of(rows));
    }

    /**
     * Minting now goes through {@link AuthTokenService}, which picks a JWT for
     * the phone and a server-side session for the web. This service no longer
     * knows or cares which, so the stub answers by ROLE — which is the only
     * thing these tests were ever really asserting about a token.
     */
    private void stubTokens() {
        when(tokens.issueForCurrentRequest(any(AuthPrincipal.class))).thenAnswer(inv -> {
            AuthPrincipal p = inv.getArgument(0);
            return new IssuedToken(switch (p.role()) {
                case JwtService.ROLE_CLIENT  -> "client-token";
                case JwtService.ROLE_PENDING -> "pending-token";
                case JwtService.ROLE_INVITED -> "invited-token";
                default -> "trainer-token";
            }, "jwt", null);
        });
    }

    /** A row with a trainer identity and no membership. */
    private static AppUserRepository.Identity trainerRow(UUID id, String name, Instant setupAt) {
        return row(AppUser.ROLE_TRAINER, id, name, setupAt, null, null, null, null, null, null);
    }

    private static AppUserRepository.Identity client(
            String coach, String status, String membershipStatus, Instant pausedAt) {
        return row(AppUser.ROLE_CLIENT, null, null, null,
                coach, status, membershipStatus, pausedAt, null, null);
    }

    private static AppUserRepository.Identity removedClient(
            String coach, Instant removedAt, Instant ackAt) {
        return row(AppUser.ROLE_CLIENT, null, null, null,
                coach, "archived", "removed", null, removedAt, ackAt);
    }

    /** The Spring Data projection, hand-rolled — there is no entity to build here. */
    private static AppUserRepository.Identity row(
            String role, UUID trainerId, String trainerOwnName, Instant setupAt,
            String coach, String status, String membershipStatus,
            Instant pausedAt, Instant removedAt, Instant removedAckAt) {
        UUID clientId = coach == null ? null : UUID.randomUUID();
        return new AppUserRepository.Identity() {
            public UUID getUserId() { return UUID.randomUUID(); }
            public String getPhone() { return PHONE; }
            public String getRole() { return role; }
            public Instant getPrivacyAcceptedAt() { return null; }

            public UUID getTrainerId() { return trainerId; }
            public Instant getSetupCompletedAt() { return setupAt; }
            public String getTrainerOwnName() { return trainerOwnName; }

            public UUID getClientId() { return clientId; }
            public UUID getClientTrainerId() { return clientId == null ? null : UUID.randomUUID(); }
            public String getClientName() { return clientId == null ? null : "Priya"; }
            public String getStatus() { return status; }
            public String getMembershipStatus() { return membershipStatus; }
            public Instant getPausedAt() { return pausedAt; }
            public Instant getRemovedAt() { return removedAt; }
            public Instant getRemovedAckAt() { return removedAckAt; }

            public String getCoachName() { return coach; }
            public String getCoachGymName() { return coach == null ? null : "Iron Works"; }
            public String getCoachPhone() { return coach == null ? null : "9000000001"; }
        };
    }
}
