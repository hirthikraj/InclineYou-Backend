package com.inclineyou.inclineyou_backend.team;

import com.inclineyou.inclineyou_backend.push.PushService;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

/**
 * Team-wide reads of clients, and the one write that moves a client between
 * coaches. Phase 2.
 *
 * <h2>Two rules that shape every query in this class</h2>
 *
 * <b>1. The trainer-id set comes from {@link TeamScope} and nowhere else.</b>
 * Not from a list assembled here, not from a join written inline. There is one
 * place that answers "whose rows may this caller read", so there is one place to
 * audit and one place to get wrong.
 *
 * <b>2. No role ever sees a teammate's money.</b> `package`, `payment` and
 * `gym_settlement` are not referenced anywhere in this file, and that is a
 * requirement rather than an omission — see {@code InclineYou_team_coaching_prd.md}
 * §0.4. The split a coach negotiated with a gym is not the next coach's
 * business, and the money book is the reason the trainer adopted InclineYou at all.
 * There is a test that asserts the absence.
 *
 * <h2>What reassignment does</h2>
 *
 * Moves the plan, keeps the history. The forward-looking artefacts follow the
 * client; the record of what happened stays with the coach who did it, because
 * a logged session and a collected payment are statements of fact about that
 * coach's work and rewriting them makes both books wrong at once.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TeamClientService {

    private final NamedParameterJdbcTemplate jdbc;
    private final TeamScope scope;
    private final PushService push;

    /* ------------------------------------------------------------------ DTOs */

    public record TeamClientRow(
            UUID id,
            String name,
            String phone,
            String goal,
            String status,
            String deliveryMode,
            UUID coachTrainerId,
            String coachName,
            /** Their last logged session, so an admin can see who is drifting. */
            Long lastSessionAt,
            /** Sessions still on the calendar, ahead of now. */
            int upcomingSessions,
            boolean hasActiveProgram,
            long createdAt
    ) {}

    /** One coach and the clients on their roster — the shape the screen draws. */
    public record CoachClients(
            UUID trainerId,
            String coachName,
            String role,
            List<TeamClientRow> clients
    ) {}

    public record TeamClientDetail(
            TeamClientRow client,
            BigDecimal heightCm,
            String activityLevel,
            Integer sessionsPerWeek,
            Integer sessionDurationMinutes,
            List<ProgramRow> programs,
            List<SessionRow> recentSessions,
            List<MetricRow> recentMetrics,
            /**
             * Always true, and stated rather than implied.
             *
             * The screen has to say "payments before today are recorded with
             * Ravi" out loud, because a new coach who opens a client and finds an
             * empty money book will file it as data loss. A flag the app can
             * branch on is cheaper than the app inferring it from an absence.
             */
            boolean moneyHidden
    ) {}

    public record ProgramRow(
            UUID id, String name, String goal, String status,
            String startDate, String endDate, int exercises
    ) {}

    public record SessionRow(
            UUID id, long scheduledAt, String status, Integer durationMinutes, boolean logged
    ) {}

    public record MetricRow(String metricType, BigDecimal value, String unit, long recordedAt) {}

    public record ReassignRequest(
            @NotNull UUID toTrainerId,
            /** 'keep' | 'clear' — what happens to the training plan. */
            @Pattern(regexp = "keep|clear") String programAction,
            @Size(max = 500) String note
    ) {}

    public record ReassignResult(
            UUID clientId,
            UUID fromTrainerId,
            UUID toTrainerId,
            String programAction,
            int programsMoved,
            int sessionsMoved,
            /** True when the target was already the coach — nothing was written. */
            boolean noop
    ) {}

    public record AssignmentRow(
            UUID id,
            UUID fromTrainerId, String fromCoachName,
            UUID toTrainerId, String toCoachName,
            UUID actorTrainerId, String actorName,
            String programAction, String note, long createdAt
    ) {}

    /* ------------------------------------------------------------- team reads */

    /**
     * Every client in the team, grouped by the coach who owns them.
     *
     * Grouped server-side because the grouping IS the answer — an admin opening
     * this is asking "who has whom", not "list 44 clients". The caller's own
     * roster leads, because the question after "who has whom" is always "and
     * what have I got".
     */
    @Transactional(readOnly = true)
    public List<CoachClients> list(UUID trainerId) {
        var s = scope.resolve(trainerId);
        s.requireAdmin();

        var rows = jdbc.queryForList("""
                SELECT c.id::text          AS id,
                       c.trainer_id::text  AS coach_trainer_id,
                       t.name              AS coach_name,
                       tm.role             AS coach_role,
                       c.name              AS name,
                       c.phone             AS phone,
                       c.goal              AS goal,
                       c.status            AS status,
                       c.delivery_mode     AS delivery_mode,
                       c.created_at        AS created_at,
                       (SELECT MAX(ws.session_date) FROM workout_session ws
                        WHERE ws.client_id = c.id AND ws.deleted_at IS NULL) AS last_session_at,
                       (SELECT COUNT(*) FROM scheduled_session ss
                        WHERE ss.client_id = c.id AND ss.deleted_at IS NULL
                          AND ss.status = 'scheduled' AND ss.scheduled_at >= NOW()) AS upcoming,
                       EXISTS(SELECT 1 FROM program p
                              WHERE p.client_id = c.id AND p.deleted_at IS NULL
                                AND p.status = 'active') AS has_program
                FROM client c
                JOIN trainer t     ON t.id = c.trainer_id
                JOIN team_member tm ON tm.trainer_id = c.trainer_id
                                   AND tm.team_id = :teamId::uuid
                                   AND tm.status = 'active'
                                   AND tm.deleted_at IS NULL
                WHERE c.trainer_id = ANY (CAST(:visible AS uuid[]))
                  AND c.deleted_at IS NULL
                  AND c.status <> 'archived'
                ORDER BY t.name, c.name
                """, Map.of(
                "teamId", s.teamId().toString(),
                "visible", s.visibleTrainerIdArray()));

        var byCoach = new LinkedHashMap<UUID, CoachClients>();
        for (var row : rows) {
            UUID coach = UUID.fromString((String) row.get("coach_trainer_id"));
            var bucket = byCoach.computeIfAbsent(coach, id -> new CoachClients(
                    id, (String) row.get("coach_name"), (String) row.get("coach_role"),
                    new ArrayList<>()));
            bucket.clients().add(toRow(row));
        }

        // The caller's own roster first; everybody else alphabetically, which is
        // the order the coach list on the team screen already uses.
        var ordered = new ArrayList<>(byCoach.values());
        ordered.sort(Comparator
                .comparing((CoachClients c) -> !c.trainerId().equals(trainerId))
                .thenComparing(c -> c.coachName() == null ? "" : c.coachName()));
        return ordered;
    }

    /**
     * One teammate's client, in enough detail to cover a session for them.
     *
     * Profile, plan, what has been logged, and the measurements. Deliberately
     * NOT: packages, payments, settlements, or the trainer's split. An admin
     * covering a session needs to know what to make them do, not what they paid.
     */
    @Transactional(readOnly = true)
    public TeamClientDetail detail(UUID trainerId, UUID clientId) {
        var s = scope.resolve(trainerId);
        s.requireAdmin();

        var rows = jdbc.queryForList("""
                SELECT c.id::text          AS id,
                       c.trainer_id::text  AS coach_trainer_id,
                       t.name              AS coach_name,
                       c.name              AS name,
                       c.phone             AS phone,
                       c.goal              AS goal,
                       c.status            AS status,
                       c.delivery_mode     AS delivery_mode,
                       c.height_cm         AS height_cm,
                       c.activity_level    AS activity_level,
                       c.sessions_per_week AS sessions_per_week,
                       c.session_duration_minutes AS session_duration_minutes,
                       c.created_at        AS created_at,
                       (SELECT MAX(ws.session_date) FROM workout_session ws
                        WHERE ws.client_id = c.id AND ws.deleted_at IS NULL) AS last_session_at,
                       (SELECT COUNT(*) FROM scheduled_session ss
                        WHERE ss.client_id = c.id AND ss.deleted_at IS NULL
                          AND ss.status = 'scheduled' AND ss.scheduled_at >= NOW()) AS upcoming,
                       EXISTS(SELECT 1 FROM program p
                              WHERE p.client_id = c.id AND p.deleted_at IS NULL
                                AND p.status = 'active') AS has_program
                FROM client c
                JOIN trainer t ON t.id = c.trainer_id
                WHERE c.id = :cid::uuid
                  AND c.trainer_id = ANY (CAST(:visible AS uuid[]))
                  AND c.deleted_at IS NULL
                """, params(
                "cid", clientId.toString(),
                "visible", s.visibleTrainerIdArray()));

        // Outside the caller's team is a 404, exactly like every other
        // out-of-scope id in this backend.
        if (rows.isEmpty()) throw TeamRuleException.clientNotInTeam();
        var row = rows.getFirst();

        return new TeamClientDetail(
                toRow(row),
                (BigDecimal) row.get("height_cm"),
                (String) row.get("activity_level"),
                (Integer) row.get("sessions_per_week"),
                (Integer) row.get("session_duration_minutes"),
                programs(clientId),
                recentSessions(clientId),
                recentMetrics(clientId),
                true);
    }

    @Transactional(readOnly = true)
    public List<AssignmentRow> assignments(UUID trainerId, UUID clientId) {
        var s = scope.resolve(trainerId);
        s.requireAdmin();
        requireInTeam(s, clientId);

        return jdbc.queryForList("""
                SELECT ca.id::text                AS id,
                       ca.from_trainer_id::text   AS from_id,
                       f.name                     AS from_name,
                       ca.to_trainer_id::text     AS to_id,
                       tt.name                    AS to_name,
                       ca.actor_trainer_id::text  AS actor_id,
                       a.name                     AS actor_name,
                       ca.program_action          AS program_action,
                       ca.note                    AS note,
                       ca.created_at              AS created_at
                FROM client_assignment ca
                JOIN trainer f  ON f.id  = ca.from_trainer_id
                JOIN trainer tt ON tt.id = ca.to_trainer_id
                JOIN trainer a  ON a.id  = ca.actor_trainer_id
                WHERE ca.client_id = :cid::uuid
                  AND ca.team_id = :teamId::uuid
                ORDER BY ca.created_at DESC
                """, Map.of("cid", clientId.toString(), "teamId", s.teamId().toString()))
                .stream()
                .map(r -> new AssignmentRow(
                        UUID.fromString((String) r.get("id")),
                        UUID.fromString((String) r.get("from_id")), (String) r.get("from_name"),
                        UUID.fromString((String) r.get("to_id")), (String) r.get("to_name"),
                        UUID.fromString((String) r.get("actor_id")), (String) r.get("actor_name"),
                        (String) r.get("program_action"),
                        (String) r.get("note"),
                        millis(r.get("created_at"))))
                .toList();
    }

    /* ------------------------------------------------------------- reassign */

    /**
     * Move a client from one coach in the team to another.
     *
     * <h3>What moves</h3>
     * <ul>
     *   <li>{@code client} — the assignment itself.</li>
     *   <li>{@code program} — every live program for that client, when
     *       {@code programAction = 'keep'}. The new coach has to be able to edit
     *       the plan they are now delivering.</li>
     *   <li>{@code scheduled_session} — <b>future rows only</b>. Tomorrow's
     *       session is the new coach's job and has to appear in <i>their</i>
     *       diary; last Tuesday's belongs in the diary of the person who ran
     *       it.</li>
     * </ul>
     *
     * <h3>What stays</h3>
     * Logged sessions and their sets, past appointments, and every rupee —
     * `package`, `payment`, `gym_settlement`. A logged session is a statement
     * about who ran it; the money went to a specific coach under a specific
     * split, and rewriting either makes two books wrong at once.
     *
     * <h3>What is deliberately NOT touched</h3>
     * {@code nudge_rule}. An earlier draft of the PRD had client-scoped nudge
     * rules moving with the client — there is no such thing. The table is one
     * row per trainer per kind with a unique index on the pair, so "moving" a
     * trainer's rules would both take rules that were never about this client
     * and collide with that index.
     *
     * {@code membership_status} is also untouched: a client who agreed to be
     * coached by the gym does not get re-invited because the gym changed who
     * delivers it. They get told, by push.
     *
     * <h3>Why `updated_at` is bumped on rows that did not otherwise change</h3>
     * Sync is a cursor over `updated_at`, so a row whose <i>visibility</i>
     * changed but whose contents did not would never reach the new coach's
     * phone. Program exercises and body metrics are in that position: nothing
     * about them changed except who may see them, so they are stamped, which is
     * the honest reading — the row IS different now, to somebody.
     */
    @Transactional
    public ReassignResult reassign(UUID actorId, UUID clientId, ReassignRequest req) {
        var s = scope.resolve(actorId);
        UUID teamId = s.requireAdmin();

        UUID from = requireInTeam(s, clientId);
        UUID to = requireActiveCoach(teamId, req.toTrainerId());

        if (from.equals(to)) {
            // Already theirs. Not an error, and deliberately not an audit row —
            // a log of moves that did not happen is a log nobody can read.
            return new ReassignResult(clientId, from, to, req.programAction(), 0, 0, true);
        }

        String action = req.programAction() == null ? "keep" : req.programAction();
        Timestamp now = Timestamp.from(Instant.now());
        var ids = params("cid", clientId.toString(), "to", to.toString(), "now", now);

        jdbc.update("""
                UPDATE client SET trainer_id = :to::uuid, updated_at = :now
                WHERE id = :cid::uuid AND deleted_at IS NULL
                """, ids);

        int programsMoved;
        if ("clear".equals(action)) {
            // Soft-deleted rather than moved: the new coach starts fresh, and the
            // existing tombstone path carries the deletion to both phones.
            programsMoved = jdbc.update("""
                    UPDATE program SET deleted_at = :now, updated_at = :now
                    WHERE client_id = :cid::uuid AND deleted_at IS NULL
                    """, ids);
        } else {
            programsMoved = jdbc.update("""
                    UPDATE program SET trainer_id = :to::uuid, updated_at = :now
                    WHERE client_id = :cid::uuid AND deleted_at IS NULL
                    """, ids);
            jdbc.update("""
                    UPDATE program_exercise SET updated_at = :now
                    WHERE deleted_at IS NULL
                      AND program_id IN (SELECT id FROM program
                                         WHERE client_id = :cid::uuid AND deleted_at IS NULL)
                    """, ids);
        }

        int sessionsMoved = jdbc.update("""
                UPDATE scheduled_session SET trainer_id = :to::uuid, updated_at = :now
                WHERE client_id = :cid::uuid
                  AND deleted_at IS NULL
                  AND status = 'scheduled'
                  AND scheduled_at >= NOW()
                """, ids);

        // Measurements belong to the person, not to a coach. Stamped so they
        // reach the new coach's phone, where the whole point is being able to
        // see the trend they are inheriting.
        jdbc.update("""
                UPDATE body_metric SET updated_at = :now
                WHERE client_id = :cid::uuid AND deleted_at IS NULL
                """, ids);

        jdbc.update("""
                INSERT INTO client_assignment
                    (id, client_id, team_id, from_trainer_id, to_trainer_id,
                     actor_trainer_id, program_action, note, created_at)
                VALUES (:id::uuid, :cid::uuid, :teamId::uuid, :from::uuid, :to::uuid,
                        :actor::uuid, :action, :note, :now)
                """, params(
                "id", UUID.randomUUID().toString(),
                "cid", clientId.toString(),
                "teamId", teamId.toString(),
                "from", from.toString(),
                "to", to.toString(),
                "actor", actorId.toString(),
                "action", action,
                "note", req.note(),
                "now", now));

        String clientName = jdbc.queryForObject(
                "SELECT name FROM client WHERE id = :cid::uuid",
                Map.of("cid", clientId.toString()), String.class);

        log.info("team {} reassigned client {} from={} to={} action={} by={}",
                teamId, clientId, from, to, action, actorId);

        notify(to, "New client assigned",
                clientName + " is now yours. Their training history came with them.");
        notify(from, "Client reassigned",
                clientName + " has moved to another coach. Your sessions and payments are unchanged.");

        return new ReassignResult(clientId, from, to, action, programsMoved, sessionsMoved, false);
    }

    /* --------------------------------------------------------------- helpers */

    /** @return the client's current coach, having established they are in the team. */
    private UUID requireInTeam(TeamScope.Scope s, UUID clientId) {
        var rows = jdbc.queryForList("""
                SELECT c.trainer_id::text AS coach FROM client c
                WHERE c.id = :cid::uuid
                  AND c.trainer_id = ANY (CAST(:visible AS uuid[]))
                  AND c.deleted_at IS NULL
                """, params(
                "cid", clientId.toString(),
                "visible", s.visibleTrainerIdArray()));
        if (rows.isEmpty()) throw TeamRuleException.clientNotInTeam();
        return UUID.fromString((String) rows.getFirst().get("coach"));
    }

    private UUID requireActiveCoach(UUID teamId, UUID trainerId) {
        Boolean member = jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM team_member
                              WHERE team_id = :teamId::uuid
                                AND trainer_id = :tid::uuid
                                AND status = 'active'
                                AND deleted_at IS NULL)
                """, Map.of("teamId", teamId.toString(), "tid", trainerId.toString()), Boolean.class);
        if (!Boolean.TRUE.equals(member)) throw TeamRuleException.memberNotInTeam();
        return trainerId;
    }

    private List<ProgramRow> programs(UUID clientId) {
        return jdbc.queryForList("""
                SELECT p.id::text AS id, p.name, p.goal, p.status,
                       p.start_date::text AS start_date, p.end_date::text AS end_date,
                       (SELECT COUNT(*) FROM program_exercise pe
                        WHERE pe.program_id = p.id AND pe.deleted_at IS NULL) AS exercises
                FROM program p
                WHERE p.client_id = :cid::uuid AND p.deleted_at IS NULL
                ORDER BY p.created_at DESC
                """, Map.of("cid", clientId.toString()))
                .stream()
                .map(r -> new ProgramRow(
                        UUID.fromString((String) r.get("id")),
                        (String) r.get("name"), (String) r.get("goal"), (String) r.get("status"),
                        (String) r.get("start_date"), (String) r.get("end_date"),
                        ((Number) r.get("exercises")).intValue()))
                .toList();
    }

    /** The last twenty appointments, newest first. Enough to read adherence off. */
    private List<SessionRow> recentSessions(UUID clientId) {
        return jdbc.queryForList("""
                SELECT ss.id::text AS id, ss.scheduled_at, ss.status, ss.duration_minutes,
                       EXISTS(SELECT 1 FROM workout_session ws
                              WHERE ws.scheduled_session_id = ss.id
                                AND ws.deleted_at IS NULL) AS logged
                FROM scheduled_session ss
                WHERE ss.client_id = :cid::uuid AND ss.deleted_at IS NULL
                ORDER BY ss.scheduled_at DESC
                LIMIT 20
                """, Map.of("cid", clientId.toString()))
                .stream()
                .map(r -> new SessionRow(
                        UUID.fromString((String) r.get("id")),
                        millis(r.get("scheduled_at")),
                        (String) r.get("status"),
                        (Integer) r.get("duration_minutes"),
                        Boolean.TRUE.equals(r.get("logged"))))
                .toList();
    }

    private List<MetricRow> recentMetrics(UUID clientId) {
        return jdbc.queryForList("""
                SELECT metric_type, value, unit, recorded_at
                FROM body_metric
                WHERE client_id = :cid::uuid AND deleted_at IS NULL
                ORDER BY recorded_at DESC
                LIMIT 12
                """, Map.of("cid", clientId.toString()))
                .stream()
                .map(r -> new MetricRow(
                        (String) r.get("metric_type"),
                        (BigDecimal) r.get("value"),
                        (String) r.get("unit"),
                        millis(r.get("recorded_at"))))
                .toList();
    }

    private TeamClientRow toRow(Map<String, Object> row) {
        return new TeamClientRow(
                UUID.fromString((String) row.get("id")),
                (String) row.get("name"),
                (String) row.get("phone"),
                (String) row.get("goal"),
                (String) row.get("status"),
                (String) row.get("delivery_mode"),
                UUID.fromString((String) row.get("coach_trainer_id")),
                (String) row.get("coach_name"),
                row.get("last_session_at") == null ? null : millis(row.get("last_session_at")),
                row.get("upcoming") == null ? 0 : ((Number) row.get("upcoming")).intValue(),
                Boolean.TRUE.equals(row.get("has_program")),
                millis(row.get("created_at")));
    }

    private void notify(UUID trainerId, String title, String body) {
        try {
            push.sendToTrainer(trainerId, title, body, Map.of("type", "team_reassign"));
        } catch (RuntimeException e) {
            log.warn("reassign push to trainer={} failed: {}", trainerId, e.getMessage());
        }
    }

    private static long millis(Object value) {
        if (value instanceof Timestamp ts) return ts.toInstant().toEpochMilli();
        if (value instanceof java.sql.Date d) return d.getTime();
        if (value instanceof java.util.Date d) return d.getTime();
        throw new IllegalStateException("not a timestamp: " + value);
    }

    /** {@code Map.of} rejects nulls, and `note` is legitimately null. */
    private static Map<String, Object> params(Object... kv) {
        var map = new HashMap<String, Object>();
        for (int i = 0; i < kv.length; i += 2) map.put((String) kv[i], kv[i + 1]);
        return map;
    }
}
