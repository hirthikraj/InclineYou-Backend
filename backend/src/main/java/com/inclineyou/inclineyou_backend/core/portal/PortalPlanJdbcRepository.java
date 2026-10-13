package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.portal.dto.PortalPlan;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The SQL behind the client's plan and progress (api-contract 1.2, pp-l1 … pp-l4). Every statement names the client's id AND runs through
 * their lens, so the two walls fail separately. Progress counts FINISHED sessions only ({@code status = 'done'}), of either kind, the
 * same rule the trainer's console uses for {@code last} and {@code best}; and ranks a weight × reps set by estimated one-rep max
 * (Epley), the product's one ranking, so a figure here cannot disagree with the trainer's.
 */
@Repository
@RequiredArgsConstructor
public class PortalPlanJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static Map<String, Object> p(UUID client) {
        var m = new HashMap<String, Object>();
        m.put("c", client.toString());
        return m;
    }

    private static BigDecimal strip(BigDecimal v) {
        if (v == null) return null;
        BigDecimal s = v.stripTrailingZeros();
        return s.scale() < 0 ? s.setScale(0) : s;
    }

    private static BigDecimal one(BigDecimal v) {
        return v == null ? null : strip(v.setScale(1, RoundingMode.HALF_UP));
    }

    private static final String E1 = "(sl.load_value * (1 + sl.effort_value / 30.0))";
    /** What ranks a set: weight × reps by estimated one-rep max, every other kind by its own effort (else load). */
    private static final String SCORE = "(CASE WHEN sl.load_kind = 'weight' AND sl.effort_kind = 'reps' THEN coalesce(sl.load_value, 0) * (1 + coalesce(sl.effort_value, 0) / 30.0) "
            + "ELSE coalesce(sl.effort_value, sl.load_value) END)";

    // ── the arc ──────────────────────────────────────────────────────────────────────────────────

    public record ProgramRow(UUID id, String name, int weeks, String status, String startDate, String endDate) {}

    /** The program being followed now: the active one, else a paused one, newest first. */
    public Optional<ProgramRow> currentProgram(UUID client) {
        return jdbc.query("""
                SELECT id, name, weeks, status, start_date::text AS sd, end_date::text AS ed FROM program
                 WHERE client_id = :c::uuid AND status IN ('active', 'paused') AND deleted_at IS NULL
                 ORDER BY (status = 'active') DESC, created_at DESC, id LIMIT 1""", p(client),
                (rs, i) -> new ProgramRow(UUID.fromString(rs.getString("id")), rs.getString("name"), rs.getInt("weeks"), rs.getString("status"),
                        rs.getString("sd"), rs.getString("ed"))).stream().findFirst();
    }

    public record DayRow(String workoutId, String name, Integer week, Integer day, String doneId, String bookedId) {}

    /** A program's days in order, each with the finished session of it and the trainer session booked for it in the coming week, if any. */
    public List<DayRow> days(UUID client, UUID program, Instant now) {
        var m = p(client);
        m.put("p", program.toString());
        m.put("now", Timestamp.from(now));
        m.put("wk", Timestamp.from(now.plusSeconds(7L * 86400)));
        return jdbc.query("""
                SELECT w.id::text AS id, w.name, w.week, w.day,
                       (SELECT s.id::text FROM scheduled_session s WHERE s.workout_id = w.id AND s.client_id = :c::uuid AND s.status = 'done' AND s.deleted_at IS NULL
                         ORDER BY COALESCE(s.ended_at, s.scheduled_at) DESC, s.id LIMIT 1) AS done_id,
                       (SELECT s.id::text FROM scheduled_session s WHERE s.workout_id = w.id AND s.client_id = :c::uuid AND s.logged_by = 'trainer'
                           AND s.status = 'scheduled' AND s.deleted_at IS NULL AND s.scheduled_at >= :now AND s.scheduled_at < :wk
                         ORDER BY s.scheduled_at, s.id LIMIT 1) AS booked_id
                  FROM workout w JOIN program pr ON pr.id = w.program_id
                 WHERE w.program_id = :p::uuid AND pr.client_id = :c::uuid AND w.deleted_at IS NULL
                 ORDER BY w.week, w.day, w.position, w.id""", m,
                (rs, i) -> new DayRow(rs.getString("id"), rs.getString("name"), (Integer) rs.getObject("week"), (Integer) rs.getObject("day"),
                        rs.getString("done_id"), rs.getString("booked_id")));
    }

    /** The trainer's own sessions of the next days, not yet over. */
    public List<PortalHomeJdbcRepository.SessionRow> upcoming(UUID client, Instant now, int days) {
        var m = p(client);
        m.put("now", Timestamp.from(now));
        m.put("to", Timestamp.from(now.plusSeconds(days * 86400L)));
        return jdbc.query("""
                SELECT s.id::text AS id, s.scheduled_at, s.duration_minutes, s.delivery_mode, w.name AS workout_name
                  FROM scheduled_session s LEFT JOIN workout w ON w.id = s.workout_id
                 WHERE s.client_id = :c::uuid AND s.logged_by = 'trainer' AND s.status = 'scheduled' AND s.deleted_at IS NULL
                   AND s.ends_at > :now AND s.scheduled_at < :to
                 ORDER BY s.scheduled_at, s.id""", m,
                (rs, i) -> new PortalHomeJdbcRepository.SessionRow(rs.getString("id"), rs.getTimestamp("scheduled_at").getTime(), rs.getInt("duration_minutes"),
                        rs.getString("delivery_mode"), rs.getString("workout_name")));
    }

    // ── past plans ───────────────────────────────────────────────────────────────────────────────

    public record PastRow(PortalPlan.PastItem item, Timestamp createdAt) {}

    /** Finished programs, newest first by {@code (created_at, id)}. */
    public List<PastRow> past(UUID client, Timestamp beforeAt, UUID beforeId, int limit) {
        var m = p(client);
        m.put("at", beforeAt);
        m.put("id", beforeId == null ? null : beforeId.toString());
        m.put("n", limit);
        return jdbc.query("""
                SELECT pr.id::text AS id, pr.name, pr.weeks, pr.start_date::text AS sd, pr.end_date::text AS ed, pr.created_at,
                       (SELECT count(*) FROM scheduled_session s JOIN workout w ON w.id = s.workout_id
                         WHERE w.program_id = pr.id AND s.client_id = pr.client_id AND s.status = 'done' AND s.deleted_at IS NULL) AS done
                  FROM program pr
                 WHERE pr.client_id = :c::uuid AND pr.status = 'completed' AND pr.deleted_at IS NULL
                   AND (CAST(:at AS timestamptz) IS NULL OR (pr.created_at, pr.id) < (CAST(:at AS timestamptz), CAST(:id AS uuid)))
                 ORDER BY pr.created_at DESC, pr.id DESC LIMIT :n""", m,
                (rs, i) -> new PastRow(new PortalPlan.PastItem(rs.getString("id"), rs.getString("name"), rs.getInt("weeks"), rs.getString("sd"), rs.getString("ed"),
                        rs.getInt("done")), rs.getTimestamp("created_at")));
    }

    /** Any one of the client's own programs, of any status; never a template, never another client's. */
    public Optional<ProgramRow> program(UUID client, UUID id) {
        var m = p(client);
        m.put("p", id.toString());
        return jdbc.query("""
                SELECT id, name, weeks, status, start_date::text AS sd, end_date::text AS ed FROM program
                 WHERE id = :p::uuid AND client_id = :c::uuid AND deleted_at IS NULL""", m,
                (rs, i) -> new ProgramRow(UUID.fromString(rs.getString("id")), rs.getString("name"), rs.getInt("weeks"), rs.getString("status"),
                        rs.getString("sd"), rs.getString("ed"))).stream().findFirst();
    }

    /** The program's days with their main exercises and prescribed sets; two statements, not one per day. */
    public List<PortalPlan.PlanWorkout> tree(UUID program) {
        var pm = Map.of("p", program.toString());
        var days = new LinkedHashMap<String, List<PortalPlan.PlanExercise>>();
        var heads = new LinkedHashMap<String, Object[]>();
        jdbc.query("SELECT id::text AS id, week, day, name FROM workout WHERE program_id = :p::uuid AND deleted_at IS NULL ORDER BY week, day, position, id", pm, rs -> {
            heads.put(rs.getString("id"), new Object[]{rs.getObject("week"), rs.getObject("day"), rs.getString("name")});
            days.put(rs.getString("id"), new ArrayList<>());
        });
        var sets = new HashMap<String, List<PortalPlan.SetPlan>>();
        jdbc.query("""
                SELECT ws.workout_exercise_id::text AS we, ws.position, ws.load_kind, ws.effort_kind, ws.load_value, ws.effort_value, ws.rest_seconds
                  FROM workout_set ws JOIN workout_exercise we ON we.id = ws.workout_exercise_id JOIN workout w ON w.id = we.workout_id
                 WHERE w.program_id = :p::uuid AND we.alternative_of IS NULL ORDER BY ws.workout_exercise_id, ws.position""", pm, rs -> {
            sets.computeIfAbsent(rs.getString("we"), k -> new ArrayList<>()).add(new PortalPlan.SetPlan(rs.getInt("position"), rs.getString("load_kind"),
                    rs.getString("effort_kind"), strip(rs.getBigDecimal("load_value")), strip(rs.getBigDecimal("effort_value")), (Integer) rs.getObject("rest_seconds")));
        });
        jdbc.query("""
                SELECT we.id::text AS id, we.workout_id::text AS wid, we.exercise_id::text AS ex, e.name, e.muscle_group, we.section, we.notes
                  FROM workout_exercise we JOIN workout w ON w.id = we.workout_id JOIN exercise e ON e.id = we.exercise_id
                 WHERE w.program_id = :p::uuid AND w.deleted_at IS NULL AND we.alternative_of IS NULL ORDER BY we.workout_id, we.position, we.id""", pm, rs -> {
            var list = days.get(rs.getString("wid"));
            if (list == null) return;
            String cue = rs.getString("notes");
            list.add(new PortalPlan.PlanExercise(rs.getString("id"), rs.getString("ex"), rs.getString("name"), rs.getString("muscle_group"), rs.getString("section"),
                    cue == null || cue.isBlank() ? null : cue.strip(), sets.getOrDefault(rs.getString("id"), List.of())));
        });
        var out = new ArrayList<PortalPlan.PlanWorkout>();
        heads.forEach((id, h) -> out.add(new PortalPlan.PlanWorkout(id, (Integer) (h[0] == null ? null : ((Number) h[0]).intValue()),
                (Integer) (h[1] == null ? null : ((Number) h[1]).intValue()), (String) h[2], days.get(id))));
        return out;
    }

    // ── progress ─────────────────────────────────────────────────────────────────────────────────

    /** Finished sessions in the window, by who ran them; a self-run with no set done is not a session (R106). */
    public int[] consistency(UUID client, Instant from, Instant to) {
        var m = p(client);
        m.put("from", Timestamp.from(from));
        m.put("to", Timestamp.from(to));
        return jdbc.queryForObject("""
                SELECT count(*) FILTER (WHERE s.logged_by = 'trainer') AS trainer, count(*) FILTER (WHERE s.logged_by = 'client') AS self
                  FROM scheduled_session s
                 WHERE s.client_id = :c::uuid AND s.status = 'done' AND s.deleted_at IS NULL AND s.scheduled_at >= :from AND s.scheduled_at <= :to
                   AND (s.logged_by = 'trainer' OR EXISTS (SELECT 1 FROM session_exercise se JOIN set_log sl ON sl.session_exercise_id = se.id
                                                            WHERE se.session_id = s.id AND se.removed_at IS NULL AND sl.done_at IS NOT NULL))""", m,
                (rs, i) -> new int[]{rs.getInt("trainer"), rs.getInt("self")});
    }

    public List<PortalPlan.MilestoneItem> milestones(UUID client, Instant from) {
        var m = p(client);
        m.put("from", Timestamp.from(from));
        return jdbc.query("SELECT kind, label, at FROM milestone WHERE client_id = :c::uuid AND deleted_at IS NULL AND at >= :from ORDER BY at DESC, id", m,
                (rs, i) -> new PortalPlan.MilestoneItem(rs.getString("kind"), rs.getString("label"), rs.getTimestamp("at").getTime()));
    }

    public record StrengthRow(String exerciseId, String name, PortalPlan.Point from, PortalPlan.Point to, boolean hadBefore) {}

    /**
     * Per exercise with a done weight × reps set in the window: its best set in the window, and the baseline it is measured against — the
     * best set from BEFORE the window, or, for an exercise first logged inside it, the top set of its first session in it.
     */
    public List<StrengthRow> strength(UUID client, Instant from, Instant to) {
        var m = p(client);
        m.put("from", Timestamp.from(from));
        m.put("to", Timestamp.from(to));
        return jdbc.query("""
                WITH base AS (
                    SELECT se.exercise_id, s.id AS sid, s.scheduled_at, sl.load_value, sl.effort_value, %1$s AS e1
                      FROM set_log sl JOIN session_exercise se ON se.id = sl.session_exercise_id AND se.removed_at IS NULL
                      JOIN scheduled_session s ON s.id = se.session_id
                     WHERE se.client_id = :c::uuid AND s.status = 'done' AND s.deleted_at IS NULL AND s.scheduled_at <= :to AND sl.done_at IS NOT NULL
                       AND sl.load_kind = 'weight' AND sl.effort_kind = 'reps' AND sl.load_value IS NOT NULL AND sl.effort_value IS NOT NULL),
                win AS (SELECT DISTINCT ON (exercise_id) exercise_id, load_value, effort_value, e1 FROM base WHERE scheduled_at >= :from ORDER BY exercise_id, e1 DESC, scheduled_at DESC),
                pre AS (SELECT DISTINCT ON (exercise_id) exercise_id, load_value, effort_value, e1 FROM base WHERE scheduled_at < :from ORDER BY exercise_id, e1 DESC, scheduled_at DESC),
                first_session AS (SELECT DISTINCT ON (exercise_id) exercise_id, sid FROM base WHERE scheduled_at >= :from ORDER BY exercise_id, scheduled_at, sid),
                first_top AS (SELECT DISTINCT ON (b.exercise_id) b.exercise_id, b.load_value, b.effort_value, b.e1 FROM base b JOIN first_session f ON f.sid = b.sid AND f.exercise_id = b.exercise_id
                               ORDER BY b.exercise_id, b.e1 DESC)
                SELECT w.exercise_id::text AS id, e.name, w.load_value AS tl, w.effort_value AS te, w.e1 AS t1,
                       COALESCE(pre.load_value, ft.load_value) AS fl, COALESCE(pre.effort_value, ft.effort_value) AS fe, COALESCE(pre.e1, ft.e1) AS f1,
                       (pre.exercise_id IS NOT NULL) AS had_before
                  FROM win w JOIN exercise e ON e.id = w.exercise_id LEFT JOIN pre ON pre.exercise_id = w.exercise_id LEFT JOIN first_top ft ON ft.exercise_id = w.exercise_id
                 ORDER BY e.name, w.exercise_id""".formatted(E1), m,
                (rs, i) -> new StrengthRow(rs.getString("id"), rs.getString("name"),
                        new PortalPlan.Point(strip(rs.getBigDecimal("fl")), strip(rs.getBigDecimal("fe")), one(rs.getBigDecimal("f1"))),
                        new PortalPlan.Point(strip(rs.getBigDecimal("tl")), strip(rs.getBigDecimal("te")), one(rs.getBigDecimal("t1"))), rs.getBoolean("had_before")));
    }

    // ── per exercise ─────────────────────────────────────────────────────────────────────────────

    public record ExerciseRow(PortalPlan.ExerciseItem item, Timestamp lastAt) {}

    /** Every exercise the client has a done set of, most recently trained first, with the number of sessions and the best set. */
    public List<ExerciseRow> exercises(UUID client, String tz, Timestamp beforeAt, UUID beforeId, int limit) {
        var m = p(client);
        m.put("tz", tz);
        m.put("at", beforeAt);
        m.put("id", beforeId == null ? null : beforeId.toString());
        m.put("n", limit);
        return jdbc.query("""
                WITH h AS (
                    SELECT se.exercise_id, s.id AS sid, s.scheduled_at, sl.load_kind, sl.effort_kind, sl.load_value, sl.effort_value, %1$s AS score
                      FROM set_log sl JOIN session_exercise se ON se.id = sl.session_exercise_id AND se.removed_at IS NULL
                      JOIN scheduled_session s ON s.id = se.session_id
                     WHERE se.client_id = :c::uuid AND s.status = 'done' AND s.deleted_at IS NULL AND sl.done_at IS NOT NULL),
                agg AS (SELECT exercise_id, count(DISTINCT sid) AS sessions, max(scheduled_at) AS last_at FROM h GROUP BY exercise_id),
                top AS (SELECT DISTINCT ON (exercise_id) exercise_id, load_value, effort_value, load_kind, effort_kind, scheduled_at, score FROM h
                         ORDER BY exercise_id, score DESC NULLS LAST, scheduled_at DESC)
                SELECT a.exercise_id::text AS id, e.name, e.muscle_group, a.sessions, a.last_at, (a.last_at AT TIME ZONE :tz)::date::text AS last_on,
                       t.load_value, t.effort_value, t.load_kind, t.effort_kind, (t.scheduled_at AT TIME ZONE :tz)::date::text AS best_on, t.score
                  FROM agg a JOIN exercise e ON e.id = a.exercise_id JOIN top t ON t.exercise_id = a.exercise_id
                 WHERE (CAST(:at AS timestamptz) IS NULL OR (a.last_at, a.exercise_id) < (CAST(:at AS timestamptz), CAST(:id AS uuid)))
                 ORDER BY a.last_at DESC, a.exercise_id DESC LIMIT :n""".formatted(SCORE), m,
                (rs, i) -> new ExerciseRow(new PortalPlan.ExerciseItem(rs.getString("id"), rs.getString("name"), rs.getString("muscle_group"), rs.getInt("sessions"),
                        rs.getString("last_on"), bestSet(rs.getBigDecimal("load_value"), rs.getBigDecimal("effort_value"), rs.getString("load_kind"), rs.getString("effort_kind"),
                                rs.getBigDecimal("score"), rs.getString("best_on"))), rs.getTimestamp("last_at")));
    }

    private static PortalPlan.BestSet bestSet(BigDecimal load, BigDecimal effort, String lk, String ek, BigDecimal score, String on) {
        boolean wr = "weight".equals(lk) && "reps".equals(ek);
        return new PortalPlan.BestSet(strip(load), strip(effort), wr ? one(score) : null, on);
    }

    public Optional<PortalPlan.ExerciseHead> exerciseHead(UUID exerciseId) {
        return jdbc.query("SELECT id::text AS id, name, log_type FROM exercise WHERE id = :e::uuid AND deleted_at IS NULL", Map.of("e", exerciseId.toString()),
                (rs, i) -> new PortalPlan.ExerciseHead(rs.getString("id"), rs.getString("name"), rs.getString("log_type") == null ? "weight_reps" : rs.getString("log_type")))
                .stream().findFirst();
    }

    /** One point per finished session: its top set for the exercise, and the kilograms moved on it (weight × reps on done sets). */
    public List<PortalPlan.SeriesPoint> series(UUID client, UUID exerciseId, String tz, Instant from) {
        var m = p(client);
        m.put("e", exerciseId.toString());
        m.put("tz", tz);
        m.put("from", from == null ? null : Timestamp.from(from));
        return jdbc.query("""
                WITH h AS (
                    SELECT s.id AS sid, s.scheduled_at, sl.load_kind, sl.effort_kind, sl.load_value, sl.effort_value, %1$s AS score
                      FROM set_log sl JOIN session_exercise se ON se.id = sl.session_exercise_id AND se.removed_at IS NULL
                      JOIN scheduled_session s ON s.id = se.session_id
                     WHERE se.client_id = :c::uuid AND se.exercise_id = :e::uuid AND s.status = 'done' AND s.deleted_at IS NULL AND sl.done_at IS NOT NULL
                       AND (CAST(:from AS timestamptz) IS NULL OR s.scheduled_at >= CAST(:from AS timestamptz))),
                top AS (SELECT DISTINCT ON (sid) sid, scheduled_at, load_value, effort_value, load_kind, effort_kind, score FROM h ORDER BY sid, score DESC NULLS LAST),
                vol AS (SELECT sid, COALESCE(sum(load_value * effort_value) FILTER (WHERE load_kind = 'weight' AND effort_kind = 'reps'), 0) AS volume FROM h GROUP BY sid)
                SELECT (t.scheduled_at AT TIME ZONE :tz)::date::text AS on_day, t.load_value, t.effort_value, t.load_kind, t.effort_kind, t.score, v.volume
                  FROM top t JOIN vol v ON v.sid = t.sid ORDER BY t.scheduled_at, t.sid""".formatted(SCORE), m,
                (rs, i) -> {
                    boolean wr = "weight".equals(rs.getString("load_kind")) && "reps".equals(rs.getString("effort_kind"));
                    return new PortalPlan.SeriesPoint(rs.getString("on_day"), strip(rs.getBigDecimal("load_value")), strip(rs.getBigDecimal("effort_value")),
                            wr ? one(rs.getBigDecimal("score")) : null, strip(rs.getBigDecimal("volume").setScale(2, RoundingMode.HALF_UP)));
                });
    }
}
