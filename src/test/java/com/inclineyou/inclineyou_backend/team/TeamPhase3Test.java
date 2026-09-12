package com.inclineyou.inclineyou_backend.team;

import com.inclineyou.inclineyou_backend.sync.SyncService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Phase 3: an admin editing a teammate's plan, and the owner's numbers.
 *
 * <p>Three properties carry the whole phase:
 *
 * <ol>
 *   <li><b>Every crossing is written down.</b> The capability is only acceptable
 *       because the coach whose plan changed can see who changed it. Editing your
 *       own writes nothing — there is nobody to account to.</li>
 *   <li><b>The edit reaches the owning coach's phone.</b> Their pull is unchanged
 *       by an edit, because the program's `trainer_id` never moved, so
 *       `updated_at` is the whole mechanism. Worth pinning precisely because
 *       there is nothing to write for it.</li>
 *   <li><b>The revenue roll-up stays a roll-up.</b> Owner-only, totals only, and
 *       no client is ever named. The tests assert the absence, because a leak
 *       here contradicts a promise the invitation screen makes.</li>
 * </ol>
 */
@SpringBootTest
@Transactional
class TeamPhase3Test {

    @Autowired TeamService teams;
    @Autowired TeamEditService edits;
    @Autowired TeamRevenueService revenue;
    @Autowired SyncService sync;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private UUID owner;
    private UUID admin;
    private UUID coach;
    private UUID clientId;
    private UUID programId;
    private UUID rowId;
    private String squatId;

    @BeforeEach
    void setUp() {
        owner = trainer("9700000001", "Ravi Kannan");
        admin = trainer("9700000002", "Anand");
        coach = trainer("9700000003", "Priya Nair");

        teams.create(owner, new TeamService.CreateTeamRequest("Iron House", null));
        join(admin, "9700000002");
        join(coach, "9700000003");
        teams.changeRole(owner, memberIdOf(admin), new TeamService.RoleRequest(TeamRole.ADMIN));

        // Priya's client, on Priya's plan.
        clientId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, status, membership_status)
                VALUES (:id::uuid, :tid::uuid, 'Meera', 'active', 'accepted')
                """, Map.of("id", clientId.toString(), "tid", coach.toString()));

        programId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO program (id, trainer_id, client_id, name, status)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, 'Push Pull Legs', 'active')
                """, Map.of("id", programId.toString(), "tid", coach.toString(), "cid", clientId.toString()));

        squatId = jdbc.queryForObject(
                "SELECT id::text FROM exercise WHERE deleted_at IS NULL LIMIT 1", Map.of(), String.class);
        rowId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO program_exercise (id, program_id, exercise_id, sets, reps, day_of_week, order_index)
                VALUES (:id::uuid, :pid::uuid, :eid::uuid, 5, 5, 2, 0)
                """, Map.of("id", rowId.toString(), "pid", programId.toString(), "eid", squatId));
    }

    // ── Editing a teammate's plan ─────────────────────────────────────────────

    @Test
    @DisplayName("an admin can change a teammate's prescription, and it is written down")
    void adminEditsAndItIsRecorded() {
        var updated = edits.updateExercise(admin, programId, rowId,
                new TeamEditService.UpdateExerciseRequest(4, 6, null, 90,
                        new BigDecimal("60.00"), "Shoulder — go easy", null, null, null));

        assertThat(updated.sets()).isEqualTo(4);
        assertThat(updated.reps()).isEqualTo(6);
        assertThat(updated.notes()).isEqualTo("Shoulder — go easy");

        // Priya can read who touched her client's plan. That readability is the
        // reason the capability is acceptable at all.
        var log = edits.activity(coach, null);
        assertThat(log).singleElement().satisfies(row -> {
            assertThat(row.actorName()).isEqualTo("Anand");
            assertThat(row.subjectTrainerId()).isEqualTo(coach);
            assertThat(row.clientId()).isEqualTo(clientId);
            assertThat(row.action()).isEqualTo("updated");
            // The sentence, written at the time and in the words she reads it in.
            assertThat(row.summary()).contains("4 × 6").contains("Meera").contains("day 2");
        });
    }

    @Test
    @DisplayName("a timed hold is preserved rather than silently becoming reps")
    void timedPrescription() {
        var updated = edits.updateExercise(admin, programId, rowId,
                new TeamEditService.UpdateExerciseRequest(3, null, 45, 60, null, null, null, null, null));

        // V25 · `duration_seconds` is the honest field for a plank. The REST
        // program endpoints predate it and drop it; this path must not.
        assertThat(updated.durationSeconds()).isEqualTo(45);
        assertThat(edits.activity(coach, null).getFirst().summary()).contains("3 × 45s");
    }

    @Test
    @DisplayName("adding and removing an exercise both leave a trace")
    void addAndRemove() {
        var added = edits.addExercise(admin, programId,
                new TeamEditService.ExerciseRequest(squatId, 3, 12, null, 60, null, null, 3, null, 1));
        assertThat(added.dayOfWeek()).isEqualTo(3);

        edits.removeExercise(admin, programId, added.id());

        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM program_exercise
                WHERE id = :id::uuid AND deleted_at IS NOT NULL
                """, Map.of("id", added.id().toString()), Integer.class)).isEqualTo(1);

        var actions = edits.activity(coach, null).stream().map(r -> r.action()).toList();
        assertThat(actions).containsExactly("removed", "added");
    }

    @Test
    @DisplayName("editing your OWN client's plan writes no activity row")
    void ownEditsAreNotAudited() {
        UUID mine = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, status, membership_status)
                VALUES (:id::uuid, :tid::uuid, 'Sanjay', 'active', 'accepted')
                """, Map.of("id", mine.toString(), "tid", admin.toString()));
        UUID myProgram = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO program (id, trainer_id, client_id, name, status)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, 'Mine', 'active')
                """, Map.of("id", myProgram.toString(), "tid", admin.toString(), "cid", mine.toString()));

        edits.updateProgram(admin, myProgram, new TeamEditService.UpdateProgramRequest("Renamed", null, null));

        // The table records crossings. A row where actor and subject match would
        // be noise that buries the rows that matter — and the CHECK constraint
        // would refuse it anyway.
        assertThat(edits.activity(admin, null)).isEmpty();
    }

    @Test
    @DisplayName("a plain coach cannot edit anybody else's plan")
    void coachesCannotEdit() {
        UUID otherClient = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, status, membership_status)
                VALUES (:id::uuid, :tid::uuid, 'Theirs', 'active', 'accepted')
                """, Map.of("id", otherClient.toString(), "tid", admin.toString()));
        UUID theirProgram = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO program (id, trainer_id, client_id, name, status)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, 'Theirs', 'active')
                """, Map.of("id", theirProgram.toString(), "tid", admin.toString(), "cid", otherClient.toString()));

        assertThatThrownBy(() -> edits.updateProgram(coach, theirProgram,
                new TeamEditService.UpdateProgramRequest("Hijacked", null, null)))
                .isInstanceOf(TeamRuleException.class)
                .satisfies(e -> assertThat(((TeamRuleException) e).getCode()).isEqualTo("NOT_TEAM_ADMIN"));
    }

    @Test
    @DisplayName("a plan outside the team is a 404")
    void cannotReachOutside() {
        UUID stranger = trainer("9700000009", "Nobody");
        UUID theirClient = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, status, membership_status)
                VALUES (:id::uuid, :tid::uuid, 'Outsider', 'active', 'accepted')
                """, Map.of("id", theirClient.toString(), "tid", stranger.toString()));
        UUID theirProgram = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO program (id, trainer_id, client_id, name, status)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, 'Not yours', 'active')
                """, Map.of("id", theirProgram.toString(), "tid", stranger.toString(), "cid", theirClient.toString()));

        assertThatThrownBy(() -> edits.program(owner, theirProgram))
                .isInstanceOf(TeamRuleException.class)
                .satisfies(e -> {
                    var ex = (TeamRuleException) e;
                    assertThat(ex.getCode()).isEqualTo("PROGRAM_NOT_IN_TEAM");
                    assertThat(ex.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
                });
    }

    @Test
    @DisplayName("the edit reaches the owning coach's phone on the next pull")
    void theEditSyncs() {
        edits.updateExercise(admin, programId, rowId,
                new TeamEditService.UpdateExerciseRequest(4, 6, null, null, null, null, null, null, null));

        // Nothing had to be written for this: the program's `trainer_id` never
        // moved, so Priya's own filter still matches and `updated_at` carries it.
        // Pinned anyway, because "it works because we did nothing" is exactly the
        // kind of claim that stops being true after a refactor.
        var changes = sync.pull(coach, 0L).changes();
        assertThat(changes.get("program_exercises").updated().stream()
                .map(r -> String.valueOf(r.get("id")))).contains(rowId.toString());

        // And the admin does NOT get the program on their own device — editing a
        // teammate's plan is not a claim on it.
        assertThat(sync.pull(admin, 0L).changes().get("programs").updated().stream()
                .map(r -> String.valueOf(r.get("id")))).doesNotContain(programId.toString());
    }

    @Test
    @DisplayName("a coach sees only the crossings that happened to them; an admin sees the team's")
    void activityScope() {
        edits.updateProgram(admin, programId, new TeamEditService.UpdateProgramRequest(null, null, "paused"));

        assertThat(edits.activity(coach, null)).hasSize(1);
        assertThat(edits.activity(admin, null)).hasSize(1);
        assertThat(edits.activity(owner, null)).hasSize(1);
        // Filtered to one client when asked.
        assertThat(edits.activity(coach, clientId)).hasSize(1);
        assertThat(edits.activity(coach, UUID.randomUUID())).isEmpty();
    }

    // ── The shared exercise ───────────────────────────────────────────────────

    @Test
    @DisplayName("an admin can fix a teammate's custom exercise for the whole team")
    void fixASharedExercise() {
        UUID custom = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO exercise (id, name, is_custom, trainer_id, log_type)
                VALUES (:id::uuid, 'Barbell Squt', TRUE, :tid::uuid, 'weight_reps')
                """, Map.of("id", custom.toString(), "tid", coach.toString()));

        edits.updateCustomExercise(admin, custom,
                new TeamEditService.UpdateCustomExerciseRequest("Barbell Squat", null, null, null, null));

        assertThat(jdbc.queryForObject("SELECT name FROM exercise WHERE id = :id::uuid",
                Map.of("id", custom.toString()), String.class)).isEqualTo("Barbell Squat");

        assertThat(edits.activity(coach, null)).singleElement().satisfies(row -> {
            assertThat(row.entityType()).isEqualTo("exercise");
            assertThat(row.summary()).contains("Barbell Squt").contains("Barbell Squat");
            assertThat(row.clientId()).isNull();
        });
    }

    @Test
    @DisplayName("the built-in library cannot be edited")
    void seededExercisesAreUntouchable() {
        assertThatThrownBy(() -> edits.updateCustomExercise(owner, UUID.fromString(squatId),
                new TeamEditService.UpdateCustomExerciseRequest("Hijacked", null, null, null, null)))
                .isInstanceOf(TeamRuleException.class)
                .satisfies(e -> assertThat(((TeamRuleException) e).getCode())
                        .isEqualTo("EXERCISE_NOT_IN_TEAM"));
    }

    // ── The owner's numbers ───────────────────────────────────────────────────

    @Nested
    @DisplayName("the revenue roll-up")
    class Revenue {

        @Test
        @DisplayName("totals per coach, and a coach who took nothing is a zero rather than absent")
        void totals() {
            payment(coach, clientId, "4000", "2000", LocalDate.now());
            payment(coach, clientId, "1500", "0", LocalDate.now().minusDays(2));

            var view = revenue.revenue(owner, LocalDate.now().minusDays(7), LocalDate.now());

            assertThat(view.teamCollected()).isEqualByComparingTo("5500");
            assertThat(view.teamGymShare()).isEqualByComparingTo("2000");
            assertThat(view.coaches()).hasSize(3);

            var priya = view.coaches().getFirst();
            assertThat(priya.trainerId()).isEqualTo(coach);
            assertThat(priya.collected()).isEqualByComparingTo("5500");
            assertThat(priya.payments()).isEqualTo(2);
            assertThat(priya.payingClients()).isEqualTo(1);

            // A missing row reads as "no data" and sends the owner hunting for a
            // bug; a zero is an answer.
            assertThat(view.coaches().stream().filter(c -> c.trainerId().equals(admin)))
                    .singleElement()
                    .satisfies(c -> assertThat(c.collected()).isEqualByComparingTo("0"));
        }

        @Test
        @DisplayName("the range is read from paid_at, not from when it was typed in")
        void paidAtNotCreatedAt() {
            // Cash taken on Saturday, recorded on Monday. It belongs to Saturday,
            // which is the whole reason `paid_at` exists.
            payment(coach, clientId, "3000", "0", LocalDate.now().minusDays(40));

            assertThat(revenue.revenue(owner, LocalDate.now().minusDays(7), LocalDate.now())
                    .teamCollected()).isEqualByComparingTo("0");
            assertThat(revenue.revenue(owner, LocalDate.now().minusDays(60), LocalDate.now())
                    .teamCollected()).isEqualByComparingTo("3000");
        }

        @Test
        @DisplayName("pending money is not revenue")
        void pendingIsNotCounted() {
            jdbc.update("""
                    INSERT INTO payment (id, trainer_id, client_id, amount, method, status, paid_at)
                    VALUES (gen_random_uuid(), :tid::uuid, :cid::uuid, 9999, 'upi_intent', 'pending', NOW())
                    """, Map.of("tid", coach.toString(), "cid", clientId.toString()));

            assertThat(revenue.revenue(owner, null, null).teamCollected()).isEqualByComparingTo("0");
        }

        @Test
        @DisplayName("an admin cannot read it — the numbers belong to whoever owns the business")
        void ownerOnly() {
            assertThatThrownBy(() -> revenue.revenue(admin, null, null))
                    .isInstanceOf(TeamRuleException.class)
                    .satisfies(e -> assertThat(((TeamRuleException) e).getCode())
                            .isEqualTo("NOT_TEAM_OWNER"));

            assertThatThrownBy(() -> revenue.revenue(coach, null, null))
                    .isInstanceOf(TeamRuleException.class)
                    .satisfies(e -> assertThat(((TeamRuleException) e).getCode())
                            .isEqualTo("NOT_TEAM_OWNER"));
        }

        @Test
        @DisplayName("no client is ever named, which is what keeps this a roll-up")
        void noClientLeaks() {
            payment(coach, clientId, "4000", "2000", LocalDate.now());

            var view = revenue.revenue(owner, null, null);

            // The unit of the answer is a coach and a range. "Who paid what" must
            // not be derivable from it, or this is the money book by another
            // route rather than the narrow carve-out §0.4 argued for.
            assertThat(view.toString())
                    .doesNotContain("Meera")
                    .doesNotContain(clientId.toString());
        }

        @Test
        @DisplayName("a backwards range is a caller mistake, not an empty month")
        void backwardsRange() {
            assertThatThrownBy(() -> revenue.revenue(owner, LocalDate.now(), LocalDate.now().minusDays(7)))
                    .isInstanceOf(TeamRuleException.class)
                    .satisfies(e -> assertThat(((TeamRuleException) e).getCode())
                            .isEqualTo("TEAM_RANGE_INVALID"));
        }

        private void payment(UUID trainerId, UUID client, String amount, String gymShare, LocalDate paidAt) {
            jdbc.update("""
                    INSERT INTO payment (id, trainer_id, client_id, amount, gym_share_amount,
                                         method, status, paid_at)
                    VALUES (gen_random_uuid(), :tid::uuid, :cid::uuid, CAST(:amount AS numeric),
                            CAST(:share AS numeric), 'cash', 'paid', CAST(:paidAt AS date))
                    """, Map.of("tid", trainerId.toString(), "cid", client.toString(),
                    "amount", amount, "share", gymShare, "paidAt", paidAt.toString()));
        }
    }

    // ── Fixtures ──────────────────────────────────────────────────────────────

    private void join(UUID who, String phone) {
        var invite = teams.invite(owner, new TeamService.InviteRequest(phone));
        teams.acceptInvitation(who, invite.member().id());
    }

    private UUID memberIdOf(UUID trainerId) {
        return UUID.fromString(jdbc.queryForObject("""
                SELECT id::text FROM team_member
                WHERE trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("tid", trainerId.toString()), String.class));
    }

    private UUID trainer(String phone, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO trainer (id, phone, name) VALUES (:id::uuid, :p, :n)",
                Map.of("id", id.toString(), "p", phone, "n", name));
        jdbc.update("""
                INSERT INTO app_user (phone, role) VALUES (:p, 'trainer')
                ON CONFLICT (phone) DO NOTHING
                """, Map.of("p", phone));
        return id;
    }
}
