package com.inclineyou.inclineyou_backend.team;

import com.inclineyou.inclineyou_backend.sync.SyncService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Moving a client between coaches — the plan moves, the history stays.
 *
 * <p>This is the correctness gate for the whole feature. Two things are being
 * pinned, and the second one is the one that would otherwise be found in
 * production:
 *
 * <ol>
 *   <li><b>What moves and what does not.</b> A logged session and a collected
 *       payment are statements of fact about a specific coach's work; rewriting
 *       either makes two people's books wrong at once.</li>
 *   <li><b>That both devices converge.</b> The pull filters by `trainer_id`, so
 *       the moved rows stop <em>matching</em> the old coach's filter rather than
 *       becoming deleted — and would sit on that phone forever. Meanwhile the
 *       client row has to STAY there, or their money book starts drawing
 *       payments with no name against them.</li>
 * </ol>
 *
 * <p>Pulls ask from the epoch rather than from a mid-test cursor: `NOW()` inside
 * a transaction is the transaction's start time, so two writes in one test share
 * an `updated_at` and a cursor-based assertion would be testing Postgres's clock
 * instead of the scope rules.
 */
@SpringBootTest
@Transactional
class TeamReassignTest {

    @Autowired TeamService teams;
    @Autowired TeamClientService teamClients;
    @Autowired SyncService sync;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private UUID owner;
    private UUID coach;
    private UUID teamId;
    private UUID clientId;
    private UUID programId;
    private UUID exerciseRowId;
    private UUID futureSession;
    private UUID pastSession;
    private UUID workoutId;
    private UUID paymentId;

    @BeforeEach
    void setUp() {
        owner = trainer("9500000001", "Ravi");
        coach = trainer("9500000002", "Priya");
        teamId = teams.create(owner, new TeamService.CreateTeamRequest("Iron House", null)).id();
        var invite = teams.invite(owner, new TeamService.InviteRequest("9500000002"));
        teams.acceptInvitation(coach, invite.member().id());

        // A client of the OWNER's, with a plan, a diary, a logged session and a
        // payment — one of each thing reassignment has to decide about.
        clientId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, phone, status, membership_status)
                VALUES (:id::uuid, :tid::uuid, 'Meera', '9500000009', 'active', 'accepted')
                """, Map.of("id", clientId.toString(), "tid", owner.toString()));

        programId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO program (id, trainer_id, client_id, name, status)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, 'Push Pull Legs', 'active')
                """, Map.of("id", programId.toString(), "tid", owner.toString(), "cid", clientId.toString()));

        String exId = jdbc.queryForObject(
                "SELECT id::text FROM exercise WHERE deleted_at IS NULL LIMIT 1", Map.of(), String.class);
        exerciseRowId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO program_exercise (id, program_id, exercise_id, sets, reps, order_index)
                VALUES (:id::uuid, :pid::uuid, :eid::uuid, 3, 10, 0)
                """, Map.of("id", exerciseRowId.toString(), "pid", programId.toString(), "eid", exId));

        futureSession = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, status)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, NOW() + INTERVAL '3 days', 'scheduled')
                """, Map.of("id", futureSession.toString(), "tid", owner.toString(), "cid", clientId.toString()));

        pastSession = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, scheduled_at, status)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, NOW() - INTERVAL '3 days', 'done')
                """, Map.of("id", pastSession.toString(), "tid", owner.toString(), "cid", clientId.toString()));

        workoutId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO workout_session (id, trainer_id, client_id, session_date)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, CURRENT_DATE - 3)
                """, Map.of("id", workoutId.toString(), "tid", owner.toString(), "cid", clientId.toString()));

        paymentId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO payment (id, trainer_id, client_id, amount, method, status)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, 4000, 'cash', 'paid')
                """, Map.of("id", paymentId.toString(), "tid", owner.toString(), "cid", clientId.toString()));
    }

    // ── What moves, and what does not ─────────────────────────────────────────

    @Test
    @DisplayName("the plan moves: client, programs, and only the FUTURE sessions")
    void thePlanMoves() {
        var result = teamClients.reassign(owner, clientId,
                new TeamClientService.ReassignRequest(coach, "keep", "Covering Tuesdays"));

        assertThat(result.noop()).isFalse();
        assertThat(result.fromTrainerId()).isEqualTo(owner);
        assertThat(result.toTrainerId()).isEqualTo(coach);
        assertThat(result.programsMoved()).isEqualTo(1);
        assertThat(result.sessionsMoved()).isEqualTo(1);

        assertThat(trainerOf("client", clientId)).isEqualTo(coach.toString());
        assertThat(trainerOf("program", programId)).isEqualTo(coach.toString());
        // Tomorrow's session is the new coach's job and has to be in THEIR diary.
        assertThat(trainerOf("scheduled_session", futureSession)).isEqualTo(coach.toString());
        // Last week's belongs in the diary of whoever ran it.
        assertThat(trainerOf("scheduled_session", pastSession)).isEqualTo(owner.toString());
    }

    @Test
    @DisplayName("the history stays: logged sessions and every rupee keep their coach")
    void theHistoryStays() {
        teamClients.reassign(owner, clientId,
                new TeamClientService.ReassignRequest(coach, "keep", null));

        // Rewriting either of these would make both coaches' books wrong at once.
        assertThat(trainerOf("workout_session", workoutId)).isEqualTo(owner.toString());
        assertThat(trainerOf("payment", paymentId)).isEqualTo(owner.toString());
    }

    @Test
    @DisplayName("nudge rules are never touched — they were never client-scoped")
    void nudgeRulesAreNotTouched() {
        jdbc.update("""
                INSERT INTO nudge_rule (id, trainer_id, kind, threshold, action)
                VALUES (gen_random_uuid(), :tid::uuid, 'quiet', 7, 'ask')
                """, Map.of("tid", owner.toString()));

        teamClients.reassign(owner, clientId,
                new TeamClientService.ReassignRequest(coach, "keep", null));

        // An earlier draft of the PRD had these moving with the client. There is
        // no such thing as a client-scoped nudge rule — the table is one row per
        // trainer per kind with a unique index on the pair — so "moving" them
        // would take rules that were never about this client and collide with
        // that index on arrival.
        assertThat(count("SELECT COUNT(*) FROM nudge_rule WHERE trainer_id = :tid::uuid",
                Map.of("tid", owner.toString()))).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM nudge_rule WHERE trainer_id = :tid::uuid",
                Map.of("tid", coach.toString()))).isZero();
    }

    @Test
    @DisplayName("'clear' leaves the new coach a blank slate instead of moving the plan")
    void clearStartsFresh() {
        var result = teamClients.reassign(owner, clientId,
                new TeamClientService.ReassignRequest(coach, "clear", null));

        assertThat(result.programsMoved()).isEqualTo(1);
        assertThat(trainerOf("client", clientId)).isEqualTo(coach.toString());
        assertThat(count("SELECT COUNT(*) FROM program WHERE id = :id::uuid AND deleted_at IS NOT NULL",
                Map.of("id", programId.toString()))).isEqualTo(1);
    }

    @Test
    @DisplayName("V15 · the coach who LOSES a client gets a bell row naming the new coach — unless they moved it themselves")
    void theLosingCoachIsTold() {
        // The owner moves their OWN client: they know, so no row for anybody.
        teamClients.reassign(owner, clientId, new TeamClientService.ReassignRequest(coach, "keep", null));
        assertThat(count("SELECT count(*) FROM trainer_notification WHERE client_id = :c::uuid",
                Map.of("c", clientId.toString()))).isZero();

        // The owner moves it back, off Priya: Priya did not do this, so her bell says so.
        teamClients.reassign(owner, clientId, new TeamClientService.ReassignRequest(owner, "keep", null));
        var rows = jdbc.queryForList("""
                SELECT trainer_id::text AS who, kind, text FROM trainer_notification WHERE client_id = :c::uuid
                """, Map.of("c", clientId.toString()));
        assertThat(rows).singleElement().satisfies(r -> {
            assertThat(r.get("who")).isEqualTo(coach.toString());
            assertThat(r.get("kind")).isEqualTo("team");
            assertThat(r.get("text")).isEqualTo("Ravi");
        });
    }

    @Test
    @DisplayName("every move is written down, with who did it")
    void theAuditRow() {
        teamClients.reassign(owner, clientId,
                new TeamClientService.ReassignRequest(coach, "keep", "Covering Tuesdays"));

        var log = teamClients.assignments(owner, clientId);
        assertThat(log).singleElement().satisfies(row -> {
            assertThat(row.fromTrainerId()).isEqualTo(owner);
            assertThat(row.toTrainerId()).isEqualTo(coach);
            assertThat(row.actorTrainerId()).isEqualTo(owner);
            assertThat(row.programAction()).isEqualTo("keep");
            assertThat(row.note()).isEqualTo("Covering Tuesdays");
            assertThat(row.fromCoachName()).isEqualTo("Ravi");
            assertThat(row.toCoachName()).isEqualTo("Priya");
        });
    }

    @Test
    @DisplayName("reassigning to the current coach is a no-op, not an error and not an audit row")
    void noop() {
        var result = teamClients.reassign(owner, clientId,
                new TeamClientService.ReassignRequest(owner, "keep", null));

        assertThat(result.noop()).isTrue();
        assertThat(teamClients.assignments(owner, clientId)).isEmpty();
    }

    // ── Who may do it ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("a plain coach cannot reassign anybody")
    void coachesCannotReassign() {
        assertThatThrownBy(() -> teamClients.reassign(coach, clientId,
                new TeamClientService.ReassignRequest(coach, "keep", null)))
                .isInstanceOf(TeamRuleException.class)
                .satisfies(e -> assertThat(((TeamRuleException) e).getCode()).isEqualTo("NOT_TEAM_ADMIN"));
    }

    @Test
    @DisplayName("an admin cannot reach a client outside their team, or a coach outside it")
    void cannotReachOutsideTheTeam() {
        UUID stranger = trainer("9500000003", "Anand");
        UUID theirClient = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, status, membership_status)
                VALUES (:id::uuid, :tid::uuid, 'Outsider', 'active', 'accepted')
                """, Map.of("id", theirClient.toString(), "tid", stranger.toString()));

        assertThatThrownBy(() -> teamClients.reassign(owner, theirClient,
                new TeamClientService.ReassignRequest(coach, "keep", null)))
                .isInstanceOf(TeamRuleException.class)
                .satisfies(e -> {
                    var ex = (TeamRuleException) e;
                    assertThat(ex.getCode()).isEqualTo("CLIENT_NOT_IN_TEAM");
                    assertThat(ex.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
                });

        assertThatThrownBy(() -> teamClients.reassign(owner, clientId,
                new TeamClientService.ReassignRequest(stranger, "keep", null)))
                .isInstanceOf(TeamRuleException.class)
                .satisfies(e -> assertThat(((TeamRuleException) e).getCode()).isEqualTo("MEMBER_NOT_IN_TEAM"));
    }

    // ── Both devices converge ─────────────────────────────────────────────────

    @Test
    @DisplayName("the new coach's pull carries the client, the plan and the future session")
    void theNewCoachGetsIt() {
        teamClients.reassign(owner, clientId,
                new TeamClientService.ReassignRequest(coach, "keep", null));

        var changes = sync.pull(coach, 0L).changes();

        assertThat(ids(changes.get("clients").updated())).contains(clientId.toString());
        assertThat(ids(changes.get("programs").updated())).contains(programId.toString());
        // The child rows are stamped by the reassignment for exactly this reason:
        // nothing about them changed except who may see them, and sync is a
        // cursor over `updated_at`.
        assertThat(ids(changes.get("program_exercises").updated())).contains(exerciseRowId.toString());
        assertThat(ids(changes.get("scheduled_sessions").updated())).contains(futureSession.toString());

        // And NOT the history — which is the honest consequence the app has to
        // put on screen rather than let a new coach read as data loss.
        assertThat(ids(changes.get("payments").updated())).doesNotContain(paymentId.toString());
        assertThat(ids(changes.get("workout_sessions").updated())).doesNotContain(workoutId.toString());
    }

    @Test
    @DisplayName("the old coach loses the plan but KEEPS the client, so their money book still reads")
    void theOldCoachConverges() {
        teamClients.reassign(owner, clientId,
                new TeamClientService.ReassignRequest(coach, "keep", null));

        var changes = sync.pull(owner, 0L).changes();

        // Gone: everything that actually became somebody else's.
        assertThat(changes.get("programs").deleted()).contains(programId.toString());
        assertThat(changes.get("program_exercises").deleted()).contains(exerciseRowId.toString());
        assertThat(changes.get("scheduled_sessions").deleted()).contains(futureSession.toString());
        assertThat(ids(changes.get("programs").updated())).doesNotContain(programId.toString());

        // Kept: the past session, the logged workout, the payment — and the
        // CLIENT ROW, without which every one of those draws with no name.
        assertThat(ids(changes.get("scheduled_sessions").updated())).contains(pastSession.toString());
        assertThat(ids(changes.get("payments").updated())).contains(paymentId.toString());
        assertThat(changes.get("clients").deleted()).doesNotContain(clientId.toString());
        assertThat(ids(changes.get("clients").updated())).contains(clientId.toString());
    }

    @Test
    @DisplayName("the old coach sees the handed-over client as archived; the new coach sees them active")
    void theProjection() {
        teamClients.reassign(owner, clientId,
                new TeamClientService.ReassignRequest(coach, "keep", null));

        // Archived is precisely what this is from the old coach's side: not
        // training with them, history retained. Every screen already drops an
        // archived client from the roster, the deck and the diary, so no screen
        // has to learn what a handover is.
        assertThat(statusInPull(owner)).isEqualTo("archived");
        assertThat(statusInPull(coach)).isEqualTo("active");

        // And the row in the database still says what is true of the client.
        assertThat(jdbc.queryForObject("SELECT status FROM client WHERE id = :id::uuid",
                Map.of("id", clientId.toString()), String.class)).isEqualTo("active");
    }

    @Test
    @DisplayName("a push echoing the projected row back cannot archive the new coach's client")
    void theProjectionCannotLeakBack() {
        teamClients.reassign(owner, clientId,
                new TeamClientService.ReassignRequest(coach, "keep", null));

        // The old coach's phone holds status='archived' and will push it like any
        // other row. Both write paths in pushClients end in
        // `WHERE client.trainer_id = :tid`, so this is a no-op — which is the
        // whole reason the projection is safe.
        var record = new java.util.HashMap<String, Object>();
        record.put("id", clientId.toString());
        record.put("name", "Meera");
        record.put("status", "archived");
        sync.push(owner, Map.of("changes", Map.of(
                "clients", Map.of("created", List.of(), "updated", List.of(record), "deleted", List.of()))));

        assertThat(jdbc.queryForObject("SELECT status FROM client WHERE id = :id::uuid",
                Map.of("id", clientId.toString()), String.class)).isEqualTo("active");
        assertThat(trainerOf("client", clientId)).isEqualTo(coach.toString());
    }

    @Test
    @DisplayName("moved back, and nothing is left deleted on the original coach's phone")
    void moveBackHeals() {
        teamClients.reassign(owner, clientId,
                new TeamClientService.ReassignRequest(coach, "keep", null));
        teamClients.reassign(owner, clientId,
                new TeamClientService.ReassignRequest(owner, "keep", null));

        var changes = sync.pull(owner, 0L).changes();

        // `trainer_id <> :tid` is false again, so the tombstone simply does not
        // fire. No "unless a later move brought them back" bookkeeping, and no
        // ordering to get wrong.
        assertThat(changes.get("programs").deleted()).doesNotContain(programId.toString());
        assertThat(ids(changes.get("programs").updated())).contains(programId.toString());
        assertThat(statusInPull(owner)).isEqualTo("active");
        assertThat(teamClients.assignments(owner, clientId)).hasSize(2);
    }

    @Test
    @DisplayName("the same pull twice produces the same answer")
    void idempotent() {
        teamClients.reassign(owner, clientId,
                new TeamClientService.ReassignRequest(coach, "keep", null));

        var first = sync.pull(owner, 0L).changes();
        var second = sync.pull(owner, 0L).changes();

        assertThat(second.get("programs").deleted()).isEqualTo(first.get("programs").deleted());
        assertThat(second.get("scheduled_sessions").deleted())
                .isEqualTo(first.get("scheduled_sessions").deleted());
    }

    // ── The read side ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("the team roster groups clients by coach, caller's own first")
    void theTeamRoster() {
        var before = teamClients.list(owner);
        assertThat(before).singleElement().satisfies(bucket -> {
            assertThat(bucket.trainerId()).isEqualTo(owner);
            assertThat(bucket.clients()).singleElement()
                    .satisfies(c -> assertThat(c.name()).isEqualTo("Meera"));
        });

        teamClients.reassign(owner, clientId,
                new TeamClientService.ReassignRequest(coach, "keep", null));

        var after = teamClients.list(owner);
        assertThat(after).singleElement().satisfies(bucket -> {
            assertThat(bucket.trainerId()).isEqualTo(coach);
            assertThat(bucket.coachName()).isEqualTo("Priya");
            assertThat(bucket.clients()).hasSize(1);
        });
    }

    @Test
    @DisplayName("a teammate's client detail carries the plan and the sessions — and no money")
    void theClientDetail() {
        teamClients.reassign(owner, clientId,
                new TeamClientService.ReassignRequest(coach, "keep", null));

        var detail = teamClients.detail(owner, clientId);

        assertThat(detail.client().name()).isEqualTo("Meera");
        assertThat(detail.client().coachName()).isEqualTo("Priya");
        assertThat(detail.programs()).singleElement()
                .satisfies(p -> assertThat(p.exercises()).isEqualTo(1));
        assertThat(detail.recentSessions()).hasSize(2);

        // The flag is the app's licence to say "payments before today are
        // recorded with Ravi" instead of drawing an empty money section.
        assertThat(detail.moneyHidden()).isTrue();

        // No money leaks, asserted rather than reviewed — the whole DTO graph is
        // searched for the words a payment would arrive under. The amount is
        // matched as "4000.00", the shape a NUMERIC(10,2) stringifies to, and
        // not as the bare digits: the DTO carries epoch-millis timestamps, and
        // a 13-digit number contains any short digit run often enough to fail
        // this test on some days and pass on others.
        assertThat(detail.toString().toLowerCase())
                .doesNotContain("payment").doesNotContain("package")
                .doesNotContain("settlement").doesNotContain("4000.00");
    }

    @Test
    @DisplayName("a plain coach cannot read the team roster")
    void coachesCannotReadTheRoster() {
        assertThatThrownBy(() -> teamClients.list(coach))
                .isInstanceOf(TeamRuleException.class)
                .satisfies(e -> assertThat(((TeamRuleException) e).getCode()).isEqualTo("NOT_TEAM_ADMIN"));
    }

    // ── Fixtures ──────────────────────────────────────────────────────────────

    private String statusInPull(UUID trainerId) {
        return sync.pull(trainerId, 0L).changes().get("clients").updated().stream()
                .filter(r -> clientId.toString().equals(String.valueOf(r.get("id"))))
                .map(r -> String.valueOf(r.get("status")))
                .findFirst()
                .orElse("<absent>");
    }

    private static List<String> ids(List<Map<String, Object>> rows) {
        return rows.stream().map(r -> String.valueOf(r.get("id"))).toList();
    }

    private String trainerOf(String table, UUID id) {
        return jdbc.queryForObject(
                "SELECT trainer_id::text FROM %s WHERE id = :id::uuid".formatted(table),
                Map.of("id", id.toString()), String.class);
    }

    private int count(String sql, Map<String, ?> params) {
        Integer n = jdbc.queryForObject(sql, params, Integer.class);
        return n == null ? 0 : n;
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
