package com.xrep.xrep_backend.team;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The rules of a coaching team.
 *
 * <p>Two of these are the ones worth having: a team is a visibility grant and
 * never a change of owner, so <em>nothing here touches a client row</em>; and an
 * invite can precede the account, which is what makes an invitation an
 * acquisition channel rather than only a permission grant.
 *
 * <p>{@code @Transactional} on the class rolls everything back — this suite runs
 * against the dev database and must not leave anything in it.
 */
@SpringBootTest
@Transactional
class TeamServiceTest {

    @Autowired TeamService service;
    @Autowired TeamScope scope;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private UUID owner;

    @BeforeEach
    void setUp() {
        owner = trainer("9200000001", "Ravi Kannan");
    }

    // ── Forming a team ────────────────────────────────────────────────────────

    @Test
    @DisplayName("creating a team makes the creator an active owner, and a member row like anyone else")
    void createMakesAnOwner() {
        var team = service.create(owner, new TeamService.CreateTeamRequest("Iron House", null));

        assertThat(team.name()).isEqualTo("Iron House");
        assertThat(team.myRole()).isEqualTo(TeamRole.OWNER);
        assertThat(team.ownerTrainerId()).isEqualTo(owner);
        assertThat(team.activeMembers()).isEqualTo(1);
        // The default seat limit comes from config, not from a literal in the SQL.
        assertThat(team.seatLimit()).isEqualTo(5);

        var s = scope.resolve(owner);
        assertThat(s.inTeam()).isTrue();
        assertThat(s.owns()).isTrue();
        assertThat(s.administers()).isTrue();
    }

    @Test
    @DisplayName("a trainer can only be in one team")
    void oneTeamPerTrainer() {
        service.create(owner, new TeamService.CreateTeamRequest("Iron House", null));

        assertThatThrownBy(() -> service.create(owner, new TeamService.CreateTeamRequest("Second", null)))
                .isInstanceOf(TeamRuleException.class)
                .satisfies(e -> assertThat(((TeamRuleException) e).getCode()).isEqualTo("ALREADY_IN_TEAM"));
    }

    @Test
    @DisplayName("a plain coach's read scope is not widened — being in a team is not being an admin")
    void aCoachSeesOnlyTheirOwnBook() {
        var team = createTeam();
        UUID coach = joinAsCoach(team, "9200000002", "Priya");

        var coachScope = scope.resolve(coach);
        assertThat(coachScope.inTeam()).isTrue();
        assertThat(coachScope.administers()).isFalse();
        assertThat(coachScope.visibleTrainerIds()).containsExactly(coach);

        // The owner, by contrast, sees both books.
        assertThat(scope.resolve(owner).visibleTrainerIds()).containsExactlyInAnyOrder(owner, coach);
    }

    @Test
    @DisplayName("joining a team does not touch the coach's clients")
    void joiningIsAdditive() {
        var team = createTeam();
        UUID coach = trainer("9200000002", "Priya");
        UUID clientId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, membership_status)
                VALUES (:id::uuid, :tid::uuid, 'Meera', 'accepted')
                """, Map.of("id", clientId.toString(), "tid", coach.toString()));

        joinExisting(team, coach);

        // Still theirs, and still with the same trainer_id. This is the whole
        // promise that makes joining safe to say yes to.
        assertThat(jdbc.queryForObject(
                "SELECT trainer_id::text FROM client WHERE id = :id::uuid",
                Map.of("id", clientId.toString()), String.class))
                .isEqualTo(coach.toString());
    }

    // ── Inviting ──────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("the invite guard")
    class InviteGuard {

        @Test
        @DisplayName("a number on somebody's roster CAN be invited as a coach — trainer/client duality is allowed")
        void clientNumberIsInvitable() {
            createTeam();
            UUID otherTrainer = trainer("9200000009", "Someone");
            jdbc.update("""
                    INSERT INTO client (id, trainer_id, name, phone, membership_status)
                    VALUES (gen_random_uuid(), :tid::uuid, 'Meera', :p, 'accepted')
                    """, Map.of("tid", otherTrainer.toString(), "p", "9200000003"));
            jdbc.update("INSERT INTO app_user (phone, role) VALUES (:p, 'client') ON CONFLICT DO NOTHING",
                    Map.of("p", "9200000003"));

            var invite = service.invite(owner, new TeamService.InviteRequest("9200000003"));

            assertThat(invite.member().phone()).isEqualTo("9200000003");
            assertThat(invite.member().status()).isEqualTo("invited");
        }

        @Test
        @DisplayName("a number already in a team cannot be invited, and the refusal never names that team")
        void alreadyInATeamIsRefused() {
            createTeam();
            UUID otherOwner = trainer("9200000004", "Anand");
            service.create(otherOwner, new TeamService.CreateTeamRequest("Rival Gym", null));

            var ex = assertRefused("9200000004", TeamPhoneGuard.CODE_ALREADY_IN_TEAM, HttpStatus.CONFLICT);
            // Enumerating a competitor's staff one number at a time is exactly
            // what this sentence must not enable.
            assertThat(ex.getMessage()).doesNotContain("Rival Gym").doesNotContain("Anand");
        }

        @Test
        @DisplayName("inviting your own number is a 422, not a conflict — nothing is in conflict")
        void ownNumberIsRefused() {
            createTeam();
            assertRefused("9200000001", TeamPhoneGuard.CODE_IS_SELF, HttpStatus.UNPROCESSABLE_CONTENT);
        }

        @Test
        @DisplayName("the same number cannot be invited twice")
        void duplicateInviteIsRefused() {
            createTeam();
            service.invite(owner, new TeamService.InviteRequest("9200000005"));
            assertRefused("9200000005", TeamPhoneGuard.CODE_ALREADY_INVITED, HttpStatus.CONFLICT);
        }

        @Test
        @DisplayName("a declined invite can be sent again — the rule must not outlive the refusal")
        void declinedCanBeReinvited() {
            var team = createTeam();
            UUID coach = trainer("9200000005", "Priya");
            var invite = service.invite(owner, new TeamService.InviteRequest("9200000005"));
            service.declineInvitation(coach, invite.member().id());

            // No exception: April is allowed to disagree with March.
            var again = service.invite(owner, new TeamService.InviteRequest("9200000005"));
            assertThat(again.member().status()).isEqualTo(TeamMemberStatus.INVITED);
            assertThat(again.member().id()).isNotEqualTo(invite.member().id());
            assertThat(team).isNotNull();
        }

        private TeamRuleException assertRefused(String phone, String code, HttpStatus status) {
            var thrown = (TeamRuleException) org.assertj.core.api.Assertions
                    .catchThrowable(() -> service.invite(owner, new TeamService.InviteRequest(phone)));
            assertThat(thrown).isNotNull();
            assertThat(thrown.getCode()).isEqualTo(code);
            assertThat(thrown.getStatus()).isEqualTo(status);

            // The pre-flight and the write must agree, or the form says available
            // and the save says no.
            var verdict = service.phoneAvailability(owner, new TeamService.PhoneCheckRequest(phone));
            assertThat(verdict.available()).isFalse();
            assertThat(verdict.code()).isEqualTo(code);
            return thrown;
        }
    }

    @Test
    @DisplayName("a coach cannot invite")
    void onlyAdminsInvite() {
        var team = createTeam();
        UUID coach = joinAsCoach(team, "9200000002", "Priya");

        assertThatThrownBy(() -> service.invite(coach, new TeamService.InviteRequest("9200000006")))
                .isInstanceOf(TeamRuleException.class)
                .satisfies(e -> assertThat(((TeamRuleException) e).getCode()).isEqualTo("NOT_TEAM_ADMIN"));
    }

    @Test
    @DisplayName("an invite to a number with no account is unbound, and binds on accept")
    void inviteCanPrecedeTheAccount() {
        createTeam();
        var invite = service.invite(owner, new TeamService.InviteRequest("9200000007"));

        // Nothing to point at yet: the row is written against the phone.
        assertThat(invite.member().trainerId()).isNull();
        assertThat(invite.member().phone()).isEqualTo("9200000007");
        assertThat(invite.whatsappUrl()).startsWith("https://wa.me/919200000007?text=");

        // Now that number signs up, and finds the invitation waiting for it.
        UUID newcomer = trainer("9200000007", "Karthik");
        var waiting = service.myInvitations(newcomer);
        assertThat(waiting).singleElement().satisfies(i -> {
            assertThat(i.id()).isEqualTo(invite.member().id());
            assertThat(i.teamName()).isEqualTo("Iron House");
            assertThat(i.invitedByName()).isEqualTo("Ravi Kannan");
            assertThat(i.expiresAt()).isGreaterThan(i.invitedAt());
        });

        service.acceptInvitation(newcomer, invite.member().id());

        assertThat(jdbc.queryForObject("""
                SELECT trainer_id::text FROM team_member WHERE id = :id::uuid
                """, Map.of("id", invite.member().id().toString()), String.class))
                .isEqualTo(newcomer.toString());
        assertThat(scope.resolve(newcomer).teamRole()).isEqualTo(TeamRole.COACH);
    }

    @Test
    @DisplayName("seats are checked when an invite is accepted, not when it is sent")
    void seatsAreConsumedByPeopleNotIntentions() {
        var team = createTeam(1);   // the owner alone fills it
        UUID coach = trainer("9200000002", "Priya");

        // Inviting past the limit is allowed on purpose.
        var invite = service.invite(owner, new TeamService.InviteRequest("9200000002"));
        assertThat(invite.member().status()).isEqualTo(TeamMemberStatus.INVITED);

        assertThatThrownBy(() -> service.acceptInvitation(coach, invite.member().id()))
                .isInstanceOf(TeamRuleException.class)
                .satisfies(e -> {
                    var ex = (TeamRuleException) e;
                    assertThat(ex.getCode()).isEqualTo("TEAM_SEAT_LIMIT");
                    assertThat(ex.getSeatLimit()).isEqualTo(1);
                });
        assertThat(team).isNotNull();
    }

    // ── Roles, removal, ownership ─────────────────────────────────────────────

    @Test
    @DisplayName("an admin may promote a coach but not touch another admin")
    void adminsDoNotOutrankEachOther() {
        var team = createTeam();
        UUID adminA = joinAsCoach(team, "9200000002", "Priya");
        UUID coachB = joinAsCoach(team, "9200000003", "Suresh");

        service.changeRole(owner, memberIdOf(team, adminA), new TeamService.RoleRequest(TeamRole.ADMIN));

        // A may promote B — that is the point of being an admin.
        var promoted = service.changeRole(adminA, memberIdOf(team, coachB),
                new TeamService.RoleRequest(TeamRole.ADMIN));
        assertThat(promoted.role()).isEqualTo(TeamRole.ADMIN);

        // And now neither may demote the other. Two admins demoting each other
        // in a race is the incident this closes.
        assertThatThrownBy(() -> service.changeRole(adminA, memberIdOf(team, coachB),
                new TeamService.RoleRequest(TeamRole.COACH)))
                .isInstanceOf(TeamRuleException.class)
                .satisfies(e -> assertThat(((TeamRuleException) e).getCode()).isEqualTo("NOT_TEAM_OWNER"));
    }

    @Test
    @DisplayName("the owner cannot be removed, demoted, or leave")
    void theOwnerIsTheAdminWhoCannotBeRemoved() {
        var team = createTeam();
        UUID admin = joinAsCoach(team, "9200000002", "Priya");
        service.changeRole(owner, memberIdOf(team, admin), new TeamService.RoleRequest(TeamRole.ADMIN));
        UUID ownerMemberId = memberIdOf(team, owner);

        assertThatThrownBy(() -> service.removeMember(admin, ownerMemberId))
                .isInstanceOf(TeamRuleException.class)
                .satisfies(e -> assertThat(((TeamRuleException) e).getCode()).isEqualTo("CANNOT_REMOVE_OWNER"));

        assertThatThrownBy(() -> service.changeRole(admin, ownerMemberId,
                new TeamService.RoleRequest(TeamRole.COACH)))
                .isInstanceOf(TeamRuleException.class)
                .satisfies(e -> assertThat(((TeamRuleException) e).getCode()).isEqualTo("CANNOT_DEMOTE_OWNER"));

        assertThatThrownBy(() -> service.leave(owner))
                .isInstanceOf(TeamRuleException.class)
                .satisfies(e -> assertThat(((TeamRuleException) e).getCode()).isEqualTo("CANNOT_REMOVE_OWNER"));
    }

    @Test
    @DisplayName("making someone the owner is a transfer, not a role edit")
    void ownerIsNotAnAssignableRole() {
        var team = createTeam();
        UUID coach = joinAsCoach(team, "9200000002", "Priya");

        assertThatThrownBy(() -> service.changeRole(owner, memberIdOf(team, coach),
                new TeamService.RoleRequest(TeamRole.OWNER)))
                .isInstanceOf(TeamRuleException.class)
                .satisfies(e -> assertThat(((TeamRuleException) e).getCode()).isEqualTo("TEAM_ROLE_INVALID"));
    }

    @Test
    @DisplayName("transferring ownership stands the old owner down first, and rewrites the team row")
    void transferOwnership() {
        var team = createTeam();
        UUID coach = joinAsCoach(team, "9200000002", "Priya");

        var after = service.transferOwnership(owner, new TeamService.TransferRequest(memberIdOf(team, coach)));

        assertThat(after.myRole()).isEqualTo(TeamRole.ADMIN);
        assertThat(scope.resolve(coach).owns()).isTrue();
        assertThat(scope.resolve(owner).owns()).isFalse();
        assertThat(scope.resolve(owner).administers()).isTrue();
        assertThat(jdbc.queryForObject(
                "SELECT owner_trainer_id::text FROM team WHERE id = :id::uuid",
                Map.of("id", team.toString()), String.class))
                .isEqualTo(coach.toString());
    }

    @Test
    @DisplayName("removal ends visibility, not ownership — their clients stay theirs")
    void removalDoesNotTakeClients() {
        var team = createTeam();
        UUID coach = joinAsCoach(team, "9200000002", "Priya");
        UUID clientId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, membership_status)
                VALUES (:id::uuid, :tid::uuid, 'Meera', 'accepted')
                """, Map.of("id", clientId.toString(), "tid", coach.toString()));

        service.removeMember(owner, memberIdOf(team, coach));

        assertThat(scope.resolve(coach).inTeam()).isFalse();
        assertThat(scope.resolve(owner).visibleTrainerIds()).containsExactly(owner);
        assertThat(jdbc.queryForObject(
                "SELECT trainer_id::text FROM client WHERE id = :id::uuid AND deleted_at IS NULL",
                Map.of("id", clientId.toString()), String.class))
                .isEqualTo(coach.toString());

        // Both the status and deleted_at: the status is the history, deleted_at
        // is what sync propagates so the row leaves every teammate's phone.
        var row = jdbc.queryForMap("""
                SELECT status, removed_at, deleted_at FROM team_member
                WHERE team_id = :team::uuid AND trainer_id = :tid::uuid
                """, Map.of("team", team.toString(), "tid", coach.toString()));
        assertThat(row.get("status")).isEqualTo(TeamMemberStatus.REMOVED);
        assertThat(row.get("removed_at")).isNotNull();
        assertThat(row.get("deleted_at")).isNotNull();
    }

    @Test
    @DisplayName("deleting the team frees everyone and touches no client data")
    void deleteTeam() {
        var team = createTeam();
        UUID coach = joinAsCoach(team, "9200000002", "Priya");

        service.delete(owner);

        assertThat(scope.resolve(owner).inTeam()).isFalse();
        assertThat(scope.resolve(coach).inTeam()).isFalse();
        // And each of them can form a new team immediately.
        assertThat(service.create(coach, new TeamService.CreateTeamRequest("Priya's team", null)).myRole())
                .isEqualTo(TeamRole.OWNER);
    }

    @Test
    @DisplayName("an id outside the caller's team is a 404, like every other out-of-scope id here")
    void outOfTeamIdsAre404() {
        createTeam();
        UUID otherOwner = trainer("9200000004", "Anand");
        var otherTeam = service.create(otherOwner, new TeamService.CreateTeamRequest("Rival Gym", null));
        UUID theirMemberId = memberIdOf(otherTeam.id(), otherOwner);

        assertThatThrownBy(() -> service.removeMember(owner, theirMemberId))
                .isInstanceOf(TeamRuleException.class)
                .satisfies(e -> {
                    var ex = (TeamRuleException) e;
                    assertThat(ex.getCode()).isEqualTo("MEMBER_NOT_IN_TEAM");
                    assertThat(ex.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
                });
    }

    @Test
    @DisplayName("a trainer with no team is refused with a code the app can act on")
    void noTeamIsItsOwnAnswer() {
        assertThat(service.get(owner)).isNull();
        assertThatThrownBy(() -> service.members(owner))
                .isInstanceOf(TeamRuleException.class)
                .satisfies(e -> assertThat(((TeamRuleException) e).getCode())
                        .isEqualTo("TEAM_MEMBERSHIP_REQUIRED"));
    }

    @Test
    @DisplayName("the coach list is ordered as a hierarchy and carries each roster's size")
    void memberListing() {
        var team = createTeam();
        UUID coach = joinAsCoach(team, "9200000002", "Priya");
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, membership_status)
                VALUES (gen_random_uuid(), :tid::uuid, 'Meera', 'accepted')
                """, Map.of("tid", coach.toString()));
        service.invite(owner, new TeamService.InviteRequest("9200000008"));

        var members = service.members(owner);
        assertThat(members).hasSize(3);
        assertThat(members.get(0).role()).isEqualTo(TeamRole.OWNER);
        assertThat(members.get(1).trainerId()).isEqualTo(coach);
        assertThat(members.get(1).clientCount()).isEqualTo(1);
        // A pending invite to a number with no account has no name — the phone
        // is all we know, and the app shows that.
        assertThat(members.get(2).status()).isEqualTo(TeamMemberStatus.INVITED);
        assertThat(members.get(2).name()).isNull();
        assertThat(members.get(2).phone()).isEqualTo("9200000008");
    }

    // ── Fixtures ──────────────────────────────────────────────────────────────

    private UUID createTeam() { return createTeam(null); }

    private UUID createTeam(Integer seats) {
        return service.create(owner, new TeamService.CreateTeamRequest("Iron House", seats)).id();
    }

    /** A second trainer, invited and accepted, ending up as a plain coach. */
    private UUID joinAsCoach(UUID teamId, String phone, String name) {
        UUID coach = trainer(phone, name);
        joinExisting(teamId, coach);
        return coach;
    }

    private void joinExisting(UUID teamId, UUID coach) {
        String phone = jdbc.queryForObject("SELECT phone FROM trainer WHERE id = :id::uuid",
                Map.of("id", coach.toString()), String.class);
        var invite = service.invite(owner, new TeamService.InviteRequest(phone));
        service.acceptInvitation(coach, invite.member().id());
        assertThat(teamId).isNotNull();
    }

    private UUID memberIdOf(UUID teamId, UUID trainerId) {
        return UUID.fromString(jdbc.queryForObject("""
                SELECT id::text FROM team_member
                WHERE team_id = :team::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("team", teamId.toString(), "tid", trainerId.toString()), String.class));
    }

    private UUID trainer(String phone, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO trainer (id, phone, name) VALUES (:id::uuid, :p, :n)
                """, Map.of("id", id.toString(), "p", phone, "n", name));
        jdbc.update("""
                INSERT INTO app_user (phone, role) VALUES (:p, 'trainer')
                ON CONFLICT (phone) DO NOTHING
                """, Map.of("p", phone));
        return id;
    }
}
