package com.inclineyou.inclineyou_backend.core.sessionlog;

import com.inclineyou.inclineyou_backend.core.sessionlog.dto.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;

import static com.inclineyou.inclineyou_backend.core.sessionlog.LogSql.*;

/**
 * Every statement behind the log's session-level calls: the session row as the log needs it (and locked when it is
 * about to be written), the plan laid down at start, the end, the picker's three groups, and the console's one read.
 *
 * <p>The log IS the scheduled session (R2/R40): {@code scheduled_session} carries started_at / ended_at, and its
 * exercises and sets hang off it as {@code session_exercise} / {@code set_log}. Neither child table has a trainer id,
 * so every read here reaches the trainer through the session — an unknown id and a stranger's are the same empty
 * result, which the services turn into a 404.
 */
@Repository
@RequiredArgsConstructor
public class SessionLogJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** The session row as the verbs need it. */
    public record Head(UUID id, UUID clientId, String status, Timestamp startedAt, Timestamp endedAt, UUID workoutId) {}

    /** One session_exercise (or, in a preview, one main plan row) before its sets are attached. */
    public record ExRow(UUID id, UUID exerciseId, String name, String equipment, int position, String section, UUID groupId,
                        String source, UUID plannedFrom, UUID swappedFrom, String swappedFromName, String swapReason,
                        Timestamp removedAt, String notes) {}

    /** The kinds a movement is being logged in, for the one history read. */
    public record Want(UUID exerciseId, String loadKind, String effortKind) {}

    /** {@code last} and {@code best} for one exercise; either may be absent. */
    public record History(LastSets last, BestSet best) {}

    // ── the session ──────────────────────────────────────────────────────────────────────────────

    /** Read, or read under {@code FOR UPDATE} when a write is about to decide on what it sees. */
    public Optional<Head> head(UUID trainerId, UUID sessionId, boolean lock) {
        return jdbc.query("""
                SELECT s.id, s.client_id, s.status, s.started_at, s.ended_at, s.workout_id
                FROM scheduled_session s
                WHERE s.id = :sid::uuid AND s.trainer_id = :tid::uuid AND s.deleted_at IS NULL
                """ + (lock ? " FOR UPDATE OF s" : ""),
                Map.of("sid", sessionId.toString(), "tid", trainerId.toString()),
                (rs, i) -> new Head(uuid(rs.getObject("id")), uuid(rs.getObject("client_id")), rs.getString("status"),
                        rs.getTimestamp("started_at"), rs.getTimestamp("ended_at"), uuid(rs.getObject("workout_id"))))
                .stream().findFirst();
    }

    /** The conditional update that decides which of two simultaneous starts lays the plan down. 1 = this call won. */
    public int stampStarted(UUID sessionId, Timestamp at) {
        return jdbc.update("UPDATE scheduled_session SET started_at = :at WHERE id = :sid::uuid AND started_at IS NULL",
                Map.of("sid", sessionId.toString(), "at", at));
    }

    /**
     * Copy the session's workout into rows: one session_exercise per MAIN plan row (alternatives stay on the plan, for
     * the swap) and one planned set_log per workout_set with its targets. Copied, never referenced, so editing the plan
     * later cannot rewrite a past target. Two set-based INSERT … SELECTs, one per level, not a loop. The tenant is
     * stamped by the table's trigger like every other insert.
     */
    public void layDownPlan(UUID sessionId) {
        var p = Map.of("sid", sessionId.toString());
        jdbc.update("""
                INSERT INTO session_exercise (id, session_id, client_id, exercise_id, position, source, planned_from)
                SELECT gen_random_uuid(), s.id, s.client_id, we.exercise_id,
                       (row_number() OVER (ORDER BY we.position, we.id) - 1)::smallint, 'planned', we.id
                FROM scheduled_session s
                JOIN workout_exercise we ON we.workout_id = s.workout_id AND we.alternative_of IS NULL
                WHERE s.id = :sid::uuid
                """, p);
        jdbc.update("""
                INSERT INTO set_log (id, session_exercise_id, position, planned, load_kind, effort_kind,
                                     target_load_value, target_effort_value, rest_seconds, tempo)
                SELECT gen_random_uuid(), se.id, ws.position, true, ws.load_kind, ws.effort_kind,
                       ws.load_value, ws.effort_value, ws.rest_seconds, ws.tempo
                FROM session_exercise se
                JOIN workout_set ws ON ws.workout_exercise_id = se.planned_from
                WHERE se.session_id = :sid::uuid
                """, p);
    }

    public void stampEnded(UUID sessionId, Timestamp at) {
        jdbc.update("UPDATE scheduled_session SET ended_at = :at WHERE id = :sid::uuid",
                Map.of("sid", sessionId.toString(), "at", at));
    }

    // ── the picker ───────────────────────────────────────────────────────────────────────────────

    /** Started and not ended, at any age; a cancelled or no-show session cannot have been started. */
    public List<OpenLog> open(UUID trainerId) {
        return jdbc.query("""
                SELECT s.id, s.client_id, c.name AS client_name, s.scheduled_at, s.started_at, w.name AS workout_name,
                       coalesce(t.done, 0) AS sets_done, coalesce(t.volume, 0) AS volume
                FROM scheduled_session s
                JOIN client c ON c.id = s.client_id
                LEFT JOIN workout w ON w.id = s.workout_id
                -- ONE grouped pass over every open log's live sets, not a read per row; the same two figures totals() computes
                LEFT JOIN (
                    SELECT se.session_id, count(*) FILTER (WHERE sl.done_at IS NOT NULL) AS done, %s AS volume
                    FROM session_exercise se JOIN set_log sl ON sl.session_exercise_id = se.id
                    WHERE se.removed_at IS NULL AND se.session_id IN (
                        SELECT o.id FROM scheduled_session o
                        WHERE o.trainer_id = :tid::uuid AND o.deleted_at IS NULL AND o.started_at IS NOT NULL AND o.ended_at IS NULL)
                    GROUP BY se.session_id
                ) t ON t.session_id = s.id
                WHERE s.trainer_id = :tid::uuid AND s.deleted_at IS NULL
                  AND s.started_at IS NOT NULL AND s.ended_at IS NULL
                ORDER BY s.started_at DESC, s.id
                """.formatted(volume("sl")), Map.of("tid", trainerId.toString()),
                (rs, i) -> new OpenLog(rs.getString("id"), rs.getString("client_id"), rs.getString("client_name"),
                        rs.getTimestamp("scheduled_at").getTime(), rs.getTimestamp("started_at").getTime(),
                        rs.getString("workout_name"), rs.getInt("sets_done"), num(rs.getBigDecimal("volume"))));
    }

    /** Today's diary — {@code [from, to)} — not started and still scheduled (so not done, no-show or cancelled). */
    public List<BookedSession> booked(UUID trainerId, Timestamp from, Timestamp to) {
        return jdbc.query("""
                SELECT s.id, s.client_id, c.name AS client_name, s.scheduled_at, w.name AS workout_name
                FROM scheduled_session s
                JOIN client c ON c.id = s.client_id
                LEFT JOIN workout w ON w.id = s.workout_id
                WHERE s.trainer_id = :tid::uuid AND s.deleted_at IS NULL AND s.status = 'scheduled'
                  AND s.started_at IS NULL AND s.scheduled_at >= :from AND s.scheduled_at < :to
                ORDER BY s.scheduled_at, s.id
                """, Map.of("tid", trainerId.toString(), "from", from, "to", to),
                (rs, i) -> new BookedSession(rs.getString("id"), rs.getString("client_id"), rs.getString("client_name"),
                        rs.getTimestamp("scheduled_at").getTime(), rs.getString("workout_name")));
    }

    /**
     * Active clients for a walk-in, each with the next workout of their active program (the rule booking uses: the one
     * after the workout of their latest earlier session, in the program's order; none once the plan is used up) and the
     * newest delivered session — all clients in one pass, never a query per client.
     */
    public List<Everybody> everybody(UUID trainerId, Timestamp now) {
        return jdbc.query("""
                WITH plan AS (
                    SELECT pr.client_id, w.id, w.name,
                           row_number() OVER (PARTITION BY pr.client_id ORDER BY w.week, w.day, w.position, w.id) AS n
                    FROM program pr JOIN workout w ON w.program_id = pr.id AND w.deleted_at IS NULL
                    WHERE pr.trainer_id = :tid::uuid AND pr.status = 'active' AND pr.deleted_at IS NULL
                ),
                last_booked AS (
                    SELECT DISTINCT ON (s.client_id) s.client_id, plan.n
                    FROM scheduled_session s JOIN plan ON plan.id = s.workout_id AND plan.client_id = s.client_id
                    WHERE s.trainer_id = :tid::uuid AND s.deleted_at IS NULL AND s.status <> 'cancelled'
                      AND s.scheduled_at < :now
                    ORDER BY s.client_id, s.scheduled_at DESC, s.id DESC
                ),
                done AS (
                    SELECT client_id, max(scheduled_at) AS last_done FROM scheduled_session
                    WHERE trainer_id = :tid::uuid AND deleted_at IS NULL AND status = 'done' GROUP BY client_id
                )
                SELECT c.id, c.name, p.name AS next_name, d.last_done
                FROM client c
                LEFT JOIN last_booked lb ON lb.client_id = c.id
                LEFT JOIN plan p ON p.client_id = c.id AND p.n = coalesce(lb.n, 0) + 1
                LEFT JOIN done d ON d.client_id = c.id
                WHERE c.trainer_id = :tid::uuid AND c.deleted_at IS NULL AND c.status = 'active'
                  AND c.membership_status IS DISTINCT FROM 'removed'
                ORDER BY lower(c.name), c.id
                """, Map.of("tid", trainerId.toString(), "now", now),
                (rs, i) -> new Everybody(rs.getString("id"), rs.getString("name"), rs.getString("next_name"),
                        ms(rs.getTimestamp("last_done"))));
    }

    // ── the console's read ───────────────────────────────────────────────────────────────────────

    public LogClient client(UUID trainerId, UUID clientId) {
        return jdbc.queryForObject("""
                SELECT c.id, c.name,
                       EXISTS (SELECT 1 FROM client_note n WHERE n.client_id = c.id AND n.pinned AND n.deleted_at IS NULL) AS pinned
                FROM client c WHERE c.id = :cid::uuid AND c.trainer_id = :tid::uuid
                """, Map.of("cid", clientId.toString(), "tid", trainerId.toString()),
                (rs, i) -> new LogClient(rs.getString("id"), rs.getString("name"), rs.getBoolean("pinned")));
    }

    /** The program the session's workout sits in; empty for an unplanned session or a standalone workout. */
    public Optional<LogProgram> program(UUID workoutId) {
        if (workoutId == null) return Optional.empty();
        return jdbc.query("""
                SELECT pr.id, pr.name, pr.weeks FROM workout w JOIN program pr ON pr.id = w.program_id
                WHERE w.id = :wid::uuid
                """, Map.of("wid", workoutId.toString()),
                (rs, i) -> new LogProgram(rs.getString("id"), rs.getString("name"), rs.getInt("weeks"))).stream().findFirst();
    }

    /** The session's exercises (removed ones included, so Undo can be offered), or just one of them. */
    public List<ExRow> exerciseRows(UUID sessionId, UUID onlyExercise) {
        var p = new HashMap<String, Object>();
        p.put("sid", sessionId.toString());
        p.put("only", onlyExercise == null ? null : onlyExercise.toString());
        return jdbc.query("""
                SELECT se.id, se.exercise_id, e.name, e.equipment, se.position, we.section, we.group_id, se.source,
                       se.planned_from, se.swapped_from_exercise_id, sf.name AS swapped_from_name, se.swap_reason,
                       se.removed_at, se.notes
                FROM session_exercise se
                JOIN exercise e ON e.id = se.exercise_id
                LEFT JOIN exercise sf ON sf.id = se.swapped_from_exercise_id
                LEFT JOIN workout_exercise we ON we.id = se.planned_from
                WHERE se.session_id = :sid::uuid AND (CAST(:only AS uuid) IS NULL OR se.id = CAST(:only AS uuid))
                ORDER BY se.position
                """, p, SessionLogJdbcRepository::exRow);
    }

    /** Before the log opens: the plan's main rows, in plan order, as unkeyed entries (the id is the plan row). */
    public List<ExRow> previewRows(UUID workoutId) {
        return jdbc.query("""
                SELECT we.id, we.exercise_id, e.name, e.equipment,
                       (row_number() OVER (ORDER BY we.position, we.id) - 1)::int AS position,
                       we.section, we.group_id, 'planned' AS source, we.id AS planned_from,
                       NULL::uuid AS swapped_from_exercise_id, NULL AS swapped_from_name, NULL AS swap_reason,
                       NULL::timestamptz AS removed_at, NULL AS notes
                FROM workout_exercise we JOIN exercise e ON e.id = we.exercise_id
                WHERE we.workout_id = :wid::uuid AND we.alternative_of IS NULL
                ORDER BY we.position, we.id
                """, Map.of("wid", workoutId.toString()), SessionLogJdbcRepository::exRow);
    }

    private static ExRow exRow(ResultSet rs, int i) throws SQLException {
        return new ExRow(uuid(rs.getObject("id")), uuid(rs.getObject("exercise_id")), rs.getString("name"),
                rs.getString("equipment"), rs.getInt("position"), rs.getString("section"), uuid(rs.getObject("group_id")),
                rs.getString("source"), uuid(rs.getObject("planned_from")), uuid(rs.getObject("swapped_from_exercise_id")),
                rs.getString("swapped_from_name"), rs.getString("swap_reason"), rs.getTimestamp("removed_at"), rs.getString("notes"));
    }

    /** Each exercise's sets, keyed by session_exercise.id, in position order. */
    public Map<UUID, List<SetRow>> sets(Collection<UUID> sessionExerciseIds) {
        if (sessionExerciseIds.isEmpty()) return Map.of();
        var out = new LinkedHashMap<UUID, List<SetRow>>();
        jdbc.query("SELECT * FROM set_log sl WHERE sl.session_exercise_id = ANY(string_to_array(:ids, ',')::uuid[]) "
                        + "ORDER BY sl.session_exercise_id, sl.position",
                Map.of("ids", join(sessionExerciseIds)), rs -> {
                    out.computeIfAbsent(uuid(rs.getObject("session_exercise_id")), k -> new ArrayList<>()).add(setRow(rs));
                });
        return out;
    }

    /** The preview's sets: the plan's workout_sets as unkeyed planned rows, keyed by the plan row. */
    public Map<UUID, List<SetRow>> planSets(Collection<UUID> planRowIds) {
        if (planRowIds.isEmpty()) return Map.of();
        var out = new LinkedHashMap<UUID, List<SetRow>>();
        jdbc.query("""
                SELECT ws.workout_exercise_id, ws.position, ws.load_kind, ws.effort_kind, ws.load_value, ws.effort_value,
                       ws.rest_seconds, ws.tempo
                FROM workout_set ws WHERE ws.workout_exercise_id = ANY(string_to_array(:ids, ',')::uuid[])
                ORDER BY ws.workout_exercise_id, ws.position
                """, Map.of("ids", join(planRowIds)), rs -> {
            out.computeIfAbsent(uuid(rs.getObject("workout_exercise_id")), k -> new ArrayList<>())
                    .add(new SetRow(null, rs.getInt("position"), true, rs.getString("load_kind"), rs.getString("effort_kind"),
                            new SetTarget(num(rs.getBigDecimal("load_value")), num(rs.getBigDecimal("effort_value")),
                                    (Integer) rs.getObject("rest_seconds"), rs.getString("tempo")),
                            null, null, null, null, null));
        });
        return out;
    }

    /** The plan's own swaps for each main plan row, shown before the library. */
    public Map<UUID, List<Alternative>> alternatives(Collection<UUID> mainPlanRowIds) {
        if (mainPlanRowIds.isEmpty()) return Map.of();
        var out = new LinkedHashMap<UUID, List<Alternative>>();
        jdbc.query("""
                SELECT we.alternative_of, we.id, we.exercise_id, e.name
                FROM workout_exercise we JOIN exercise e ON e.id = we.exercise_id
                WHERE we.alternative_of = ANY(string_to_array(:ids, ',')::uuid[])
                ORDER BY we.alternative_of, we.position, we.id
                """, Map.of("ids", join(mainPlanRowIds)), rs -> {
            out.computeIfAbsent(uuid(rs.getObject("alternative_of")), k -> new ArrayList<>())
                    .add(new Alternative(rs.getString("id"), rs.getString("exercise_id"), rs.getString("name")));
        });
        return out;
    }

    static SetRow setRow(ResultSet rs) throws SQLException {
        boolean planned = rs.getBoolean("planned");
        BigDecimal tl = rs.getBigDecimal("target_load_value"), te = rs.getBigDecimal("target_effort_value");
        Integer rest = (Integer) rs.getObject("rest_seconds");
        String tempo = rs.getString("tempo");
        boolean hasTarget = tl != null || te != null || rest != null || tempo != null;
        return new SetRow(rs.getString("id"), rs.getInt("position"), planned, rs.getString("load_kind"),
                rs.getString("effort_kind"), hasTarget ? new SetTarget(num(tl), num(te), rest, tempo) : null,
                num(rs.getBigDecimal("load_value")), num(rs.getBigDecimal("effort_value")), num(rs.getBigDecimal("rpe")),
                rs.getString("notes"), ms(rs.getTimestamp("done_at")));
    }

    /**
     * {@code last} and {@code best} for EVERY exercise in one statement over idx_session_exercise_history — never one
     * query per exercise. History is the client's COMPLETED sessions other than this one. {@code last} is the newest of
     * those containing the exercise (all its done sets, in order); {@code best} is the top set by {@link LogSql#score}
     * among sets logged in the same load/effort kinds the session is using for that exercise, so a weights day is not
     * ranked against a bodyweight one.
     */
    public Map<UUID, History> history(UUID trainerId, UUID sessionId, UUID clientId, List<Want> wants, ZoneId zone) {
        if (wants.isEmpty()) return Map.of();
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("sid", sessionId == null ? null : sessionId.toString());
        p.put("cid", clientId.toString());
        p.put("ids", wants.stream().map(w -> w.exerciseId().toString()).collect(Collectors.joining(",")));
        p.put("lk", wants.stream().map(Want::loadKind).collect(Collectors.joining(",")));
        p.put("ek", wants.stream().map(Want::effortKind).collect(Collectors.joining(",")));
        var lasts = new HashMap<UUID, LinkedHashMap<String, Object>>();
        var lastSets = new HashMap<UUID, List<SetValue>>();
        var bests = new HashMap<UUID, BestSet>();
        jdbc.query("""
                WITH want AS (
                    SELECT w.exercise_id::uuid AS exercise_id, w.load_kind, w.effort_kind
                    FROM unnest(string_to_array(:ids, ','), string_to_array(:lk, ','), string_to_array(:ek, ','))
                         AS w(exercise_id, load_kind, effort_kind)
                ),
                hist AS (
                    SELECT se.exercise_id, s.id AS session_id, s.scheduled_at, sl.position, sl.load_kind, sl.effort_kind,
                           sl.load_value, sl.effort_value, %s AS score
                    FROM scheduled_session s
                    JOIN session_exercise se ON se.session_id = s.id AND se.removed_at IS NULL
                         AND se.exercise_id IN (SELECT exercise_id FROM want)
                    JOIN set_log sl ON sl.session_exercise_id = se.id AND sl.done_at IS NOT NULL
                    WHERE s.client_id = :cid::uuid AND s.trainer_id = :tid::uuid AND s.deleted_at IS NULL
                      AND s.status = 'done' AND (CAST(:sid AS uuid) IS NULL OR s.id <> CAST(:sid AS uuid))
                ),
                newest AS (
                    SELECT DISTINCT ON (exercise_id) exercise_id, session_id FROM hist
                    ORDER BY exercise_id, scheduled_at DESC, session_id DESC
                ),
                top AS (
                    SELECT DISTINCT ON (h.exercise_id) h.*
                    FROM hist h JOIN want w ON w.exercise_id = h.exercise_id
                         AND w.load_kind = h.load_kind AND w.effort_kind = h.effort_kind
                    ORDER BY h.exercise_id, h.score DESC NULLS LAST, h.scheduled_at DESC, h.position
                )
                SELECT 'last' AS kind, h.exercise_id, h.scheduled_at, h.position, h.load_kind, h.effort_kind,
                       h.load_value, h.effort_value, NULL::numeric AS e1rm
                FROM hist h JOIN newest n ON n.exercise_id = h.exercise_id AND n.session_id = h.session_id
                UNION ALL
                SELECT 'best', t.exercise_id, t.scheduled_at, t.position, t.load_kind, t.effort_kind, t.load_value,
                       t.effort_value, CASE WHEN t.load_kind = 'weight' AND t.effort_kind = 'reps' THEN t.score END
                FROM top t
                ORDER BY 1, 2, 4
                """.formatted(score("sl")), p, rs -> {
            UUID ex = uuid(rs.getObject("exercise_id"));
            String date = rs.getTimestamp("scheduled_at").toInstant().atZone(zone).toLocalDate().toString();
            if ("last".equals(rs.getString("kind"))) {
                lasts.computeIfAbsent(ex, k -> new LinkedHashMap<>()).put("date", date);
                lastSets.computeIfAbsent(ex, k -> new ArrayList<>()).add(new SetValue(num(rs.getBigDecimal("load_value")),
                        num(rs.getBigDecimal("effort_value")), rs.getString("load_kind"), rs.getString("effort_kind")));
            } else {
                BigDecimal e1 = rs.getBigDecimal("e1rm");
                bests.put(ex, new BestSet(date, num(rs.getBigDecimal("load_value")), num(rs.getBigDecimal("effort_value")),
                        rs.getString("load_kind"), rs.getString("effort_kind"),
                        e1 == null ? null : num(e1.setScale(1, java.math.RoundingMode.HALF_UP))));
            }
        });
        var out = new HashMap<UUID, History>();
        for (var w : wants) {
            UUID ex = w.exerciseId();
            LastSets last = lasts.containsKey(ex) ? new LastSets((String) lasts.get(ex).get("date"), lastSets.get(ex)) : null;
            if (last != null || bests.containsKey(ex)) out.put(ex, new History(last, bests.get(ex)));
        }
        return out;
    }

    /** One aggregate over the session's live sets; the one place {@code totals} is computed. */
    public Totals totals(UUID sessionId) {
        return jdbc.queryForObject("""
                SELECT count(*) FILTER (WHERE sl.done_at IS NOT NULL) AS done,
                       count(*) FILTER (WHERE sl.planned) AS planned, %s AS volume
                FROM session_exercise se JOIN set_log sl ON sl.session_exercise_id = se.id
                WHERE se.session_id = :sid::uuid AND se.removed_at IS NULL
                """.formatted(volume("sl")), Map.of("sid", sessionId.toString()),
                (rs, i) -> new Totals(rs.getInt("done"), rs.getInt("planned"), num(rs.getBigDecimal("volume"))));
    }

    /** What the plan would put in the log, before it is opened: no sets done, planned = the plan's sets. */
    public Totals previewTotals(UUID workoutId) {
        return jdbc.queryForObject("""
                SELECT count(*) AS planned FROM workout_exercise we JOIN workout_set ws ON ws.workout_exercise_id = we.id
                WHERE we.workout_id = :wid::uuid AND we.alternative_of IS NULL
                """, Map.of("wid", workoutId.toString()), (rs, i) -> new Totals(0, rs.getInt("planned"), BigDecimal.ZERO));
    }

    static String join(Collection<UUID> ids) {
        return ids.stream().map(UUID::toString).collect(Collectors.joining(","));
    }
}
