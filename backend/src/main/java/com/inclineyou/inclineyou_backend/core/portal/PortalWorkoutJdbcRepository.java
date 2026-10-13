package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.portal.dto.PortalWorkout;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The SQL behind the client's workout (api-contract 1.2, pw-*): a plan day, the self-run session built from it, its exercises and sets,
 * and what finishing records. Every statement names the signed-in client's id AND runs through their lens, so the two walls fail
 * separately; a statement that writes can touch only the client's OWN self-run rows, which the policies and the column guards say again.
 *
 * <p>The reads the trainer's console already makes — the plan's rows and sets, the history behind {@code last}, the totals — are
 * {@code SessionLogJdbcRepository}'s and are called, not copied, so a figure here cannot disagree with the one on the trainer's screen.
 */
@Repository
@RequiredArgsConstructor
public class PortalWorkoutJdbcRepository {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final NamedParameterJdbcTemplate jdbc;

    private static Map<String, Object> p(UUID client) {
        var m = new HashMap<String, Object>();
        m.put("c", client.toString());
        return m;
    }

    private static UUID uuid(Object o) {
        return o == null ? null : o instanceof UUID u ? u : UUID.fromString(o.toString());
    }

    // ── who ──────────────────────────────────────────────────────────────────────────────────────

    /** The coach the client belongs to — a self-run session is written under it ({@code scheduled_session_client_insert}). */
    public UUID trainerOf(UUID client) {
        return uuid(jdbc.queryForObject("SELECT trainer_id FROM client WHERE id = :c::uuid", p(client), Object.class));
    }

    public String zoneOf(UUID client) {
        var z = jdbc.queryForList("SELECT timezone FROM client WHERE id = :c::uuid", p(client), String.class);
        return z.isEmpty() || z.getFirst() == null ? "Asia/Kolkata" : z.getFirst();
    }

    public boolean autoRestTimer(UUID client) {
        var v = jdbc.queryForList("SELECT auto_rest_timer FROM client_prefs WHERE client_id = :c::uuid AND deleted_at IS NULL", p(client), Boolean.class);
        return v.isEmpty() || !Boolean.FALSE.equals(v.getFirst());
    }

    /** Serialises the starts of one client, so two tabs pressing Start cannot make two logs. */
    public void lockStarts(UUID client) {
        jdbc.queryForList("SELECT pg_advisory_xact_lock(hashtext(:c))", p(client));
    }

    // ── the plan ─────────────────────────────────────────────────────────────────────────────────

    public record PlanDay(UUID workoutId, String name, Integer week, Integer day, UUID programId, String programName, int weeks, String programStatus) {}

    /** A workout of the client's OWN plan; empty for anything else, including a workout of another client's program. */
    public Optional<PlanDay> planDay(UUID client, UUID workoutId) {
        var m = p(client);
        m.put("w", workoutId.toString());
        return jdbc.query("""
                SELECT w.id, w.name, w.week, w.day, pr.id AS pid, pr.name AS pname, pr.weeks, pr.status
                  FROM workout w JOIN program pr ON pr.id = w.program_id
                 WHERE w.id = :w::uuid AND pr.client_id = :c::uuid AND w.deleted_at IS NULL AND pr.deleted_at IS NULL""", m,
                (rs, i) -> new PlanDay(uuid(rs.getObject("id")), rs.getString("name"), (Integer) rs.getObject("week"), (Integer) rs.getObject("day"),
                        uuid(rs.getObject("pid")), rs.getString("pname"), rs.getInt("weeks"), rs.getString("status"))).stream().findFirst();
    }

    /** The trainer has this day booked and it has not ended: that day is the trainer's to log, so it is not startable alone. */
    public boolean trainerSessionBooked(UUID client, UUID workoutId, Instant now) {
        var m = p(client);
        m.put("w", workoutId.toString());
        m.put("now", Timestamp.from(now));
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM scheduled_session s
                                WHERE s.client_id = :c::uuid AND s.workout_id = :w::uuid AND s.logged_by = 'trainer' AND s.status = 'scheduled'
                                  AND s.deleted_at IS NULL AND s.ends_at > :now)""", m, Boolean.class));
    }

    /** One main row of a plan day (alternatives excluded) with what the preview and the player read off it. */
    public record PlanRow(UUID id, UUID exerciseId, String name, String equipment, String target, int position, String section, UUID groupId,
                          String cue, String description) {}

    public List<PlanRow> planRows(UUID workoutId) {
        return jdbc.query("""
                SELECT we.id, we.exercise_id, e.name, e.equipment, e.muscle_group, we.section, we.group_id, we.notes, e.description,
                       (row_number() OVER (ORDER BY we.position, we.id) - 1)::int AS position
                  FROM workout_exercise we JOIN exercise e ON e.id = we.exercise_id
                 WHERE we.workout_id = :w::uuid AND we.alternative_of IS NULL
                 ORDER BY we.position, we.id""", Map.of("w", workoutId.toString()),
                (rs, i) -> new PlanRow(uuid(rs.getObject("id")), uuid(rs.getObject("exercise_id")), rs.getString("name"), rs.getString("equipment"),
                        rs.getString("muscle_group"), rs.getInt("position"), rs.getString("section"), uuid(rs.getObject("group_id")),
                        rs.getString("notes"), rs.getString("description")));
    }

    /** A started, unfinished self-run of this day — what "resume" opens. */
    public Optional<UUID> resumable(UUID client, UUID workoutId) {
        var m = p(client);
        m.put("w", workoutId.toString());
        return jdbc.queryForList("""
                SELECT s.id FROM scheduled_session s
                 WHERE s.client_id = :c::uuid AND s.workout_id = :w::uuid AND s.logged_by = 'client' AND s.deleted_at IS NULL
                   AND s.started_at IS NOT NULL AND s.status = 'scheduled'
                 ORDER BY s.started_at DESC LIMIT 1""", m, Object.class).stream().findFirst().map(PortalWorkoutJdbcRepository::uuid);
    }

    // ── a session ────────────────────────────────────────────────────────────────────────────────

    public record SessionRow(UUID id, UUID trainerId, UUID clientId, UUID workoutId, String workoutName, Integer week, Integer day, String loggedBy,
                             String status, Timestamp startedAt, Timestamp endedAt, int pausedSeconds, long version) {}

    private static SessionRow sessionRow(ResultSet rs, int i) throws SQLException {
        return new SessionRow(uuid(rs.getObject("id")), uuid(rs.getObject("trainer_id")), uuid(rs.getObject("client_id")), uuid(rs.getObject("workout_id")),
                rs.getString("wname"), (Integer) rs.getObject("week"), (Integer) rs.getObject("day"), rs.getString("logged_by"), rs.getString("status"),
                rs.getTimestamp("started_at"), rs.getTimestamp("ended_at"), rs.getInt("paused_seconds"), rs.getLong("version"));
    }

    /** One of the client's sessions of either kind; {@code lock} when a write is about to decide on what it sees. */
    public Optional<SessionRow> session(UUID client, UUID sessionId, boolean lock) {
        var m = p(client);
        m.put("s", sessionId.toString());
        return jdbc.query("""
                SELECT s.id, s.trainer_id, s.client_id, s.workout_id, w.name AS wname, w.week, w.day, s.logged_by, s.status, s.started_at, s.ended_at,
                       s.paused_seconds, (extract(epoch FROM s.updated_at) * 1000)::bigint AS version
                  FROM scheduled_session s LEFT JOIN workout w ON w.id = s.workout_id
                 WHERE s.id = :s::uuid AND s.client_id = :c::uuid AND s.deleted_at IS NULL""" + (lock ? " FOR UPDATE OF s" : ""),
                m, PortalWorkoutJdbcRepository::sessionRow).stream().findFirst();
    }

    /** Any session with this id, whoever's — only to tell a replay of the client's own id from an id somebody else holds. */
    public boolean idTaken(UUID sessionId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM scheduled_session WHERE id = :s::uuid)",
                Map.of("s", sessionId.toString()), Boolean.class));
    }

    public void insertSelfRun(UUID id, UUID trainerId, UUID client, UUID workoutId, int minutes) {
        var m = p(client);
        m.put("id", id.toString());
        m.put("t", trainerId.toString());
        m.put("w", workoutId.toString());
        m.put("min", minutes);
        jdbc.update("""
                INSERT INTO scheduled_session (id, trainer_id, client_id, workout_id, scheduled_at, duration_minutes, ends_at, status, started_at, logged_by)
                VALUES (:id::uuid, :t::uuid, :c::uuid, :w::uuid, now(), :min, now() + make_interval(mins => :min), 'scheduled', now(), 'client')""", m);
    }

    /**
     * The plan laid down as the client's own rows: one session_exercise per MAIN plan row and one set per planned set, targets copied. Same
     * two set-based inserts as the trainer's {@code layDownPlan}, except every set is {@code entered_by = 'client'} — the client lens
     * refuses an insert that says anything else, and an update of a set keeps it.
     */
    public void layDownPlan(UUID sessionId) {
        var p = Map.of("sid", sessionId.toString());
        jdbc.update("""
                INSERT INTO session_exercise (id, session_id, client_id, exercise_id, position, source, planned_from)
                SELECT gen_random_uuid(), s.id, s.client_id, we.exercise_id,
                       (row_number() OVER (ORDER BY we.position, we.id) - 1)::smallint, 'planned', we.id
                  FROM scheduled_session s
                  JOIN workout_exercise we ON we.workout_id = s.workout_id AND we.alternative_of IS NULL
                 WHERE s.id = :sid::uuid""", p);
        jdbc.update("""
                INSERT INTO set_log (id, session_exercise_id, position, planned, load_kind, effort_kind, target_load_value, target_effort_value,
                                     rest_seconds, tempo, entered_by)
                SELECT gen_random_uuid(), se.id, ws.position, true, ws.load_kind, ws.effort_kind, ws.load_value, ws.effort_value,
                       ws.rest_seconds, ws.tempo, 'client'
                  FROM session_exercise se JOIN workout_set ws ON ws.workout_exercise_id = se.planned_from
                 WHERE se.session_id = :sid::uuid""", p);
    }

    public void setPaused(UUID sessionId, int seconds) {
        jdbc.update("UPDATE scheduled_session SET paused_seconds = :p WHERE id = :s::uuid", Map.of("p", seconds, "s", sessionId.toString()));
    }

    // ── the log's rows ───────────────────────────────────────────────────────────────────────────

    public record LogRow(UUID id, UUID exerciseId, String name, int position, String section, UUID groupId, String source, UUID plannedFrom,
                         UUID swappedFrom, String swappedFromName, String swapSource, String swapReason, Timestamp removedAt, String cue, String description) {}

    public List<LogRow> logRows(UUID client, UUID sessionId, UUID only) {
        var m = p(client);
        m.put("s", sessionId.toString());
        m.put("only", only == null ? null : only.toString());
        return jdbc.query("""
                SELECT se.id, se.exercise_id, e.name, se.position, we.section, we.group_id, se.source, se.planned_from, se.swapped_from_exercise_id,
                       sf.name AS sf_name, se.swap_source, se.swap_reason, se.removed_at,
                       CASE WHEN se.swap_source = 'library' THEN NULL ELSE we.notes END AS cue, e.description
                  FROM session_exercise se
                  JOIN exercise e ON e.id = se.exercise_id
                  LEFT JOIN exercise sf ON sf.id = se.swapped_from_exercise_id
                  LEFT JOIN workout_exercise we ON we.id = se.planned_from
                 WHERE se.session_id = :s::uuid AND se.client_id = :c::uuid AND (CAST(:only AS uuid) IS NULL OR se.id = CAST(:only AS uuid))
                 ORDER BY se.position""", m,
                (rs, i) -> new LogRow(uuid(rs.getObject("id")), uuid(rs.getObject("exercise_id")), rs.getString("name"), rs.getInt("position"),
                        rs.getString("section"), uuid(rs.getObject("group_id")), rs.getString("source"), uuid(rs.getObject("planned_from")),
                        uuid(rs.getObject("swapped_from_exercise_id")), rs.getString("sf_name"), rs.getString("swap_source"), rs.getString("swap_reason"),
                        rs.getTimestamp("removed_at"), rs.getString("cue"), rs.getString("description")));
    }

    public Optional<PortalWorkout.Feedback> feedback(UUID client, UUID sessionId) {
        var m = p(client);
        m.put("s", sessionId.toString());
        return jdbc.query("SELECT effort, note, at FROM workout_feedback WHERE session_id = :s::uuid AND client_id = :c::uuid AND deleted_at IS NULL", m,
                (rs, i) -> new PortalWorkout.Feedback(rs.getString("effort"), rs.getString("note"), rs.getTimestamp("at").getTime())).stream().findFirst();
    }

    public Optional<PortalWorkout.Feedback> upsertFeedback(UUID client, UUID sessionId, String effort, String note) {
        var m = p(client);
        m.put("s", sessionId.toString());
        m.put("e", effort);
        m.put("n", note);
        jdbc.update("""
                INSERT INTO workout_feedback (id, session_id, client_id, tenant_id, effort, note)
                SELECT gen_random_uuid(), s.id, s.client_id, s.tenant_id, :e, :n FROM scheduled_session s WHERE s.id = :s::uuid AND s.client_id = :c::uuid
                ON CONFLICT (session_id) DO UPDATE SET effort = EXCLUDED.effort, note = EXCLUDED.note, at = now(), deleted_at = NULL""", m);
        return feedback(client, sessionId);
    }

    public Optional<PortalWorkout.Recap> recap(UUID client, UUID sessionId) {
        var m = p(client);
        m.put("s", sessionId.toString());
        return jdbc.query("""
                SELECT id::text AS id, body, read_at FROM client_message
                 WHERE client_id = :c::uuid AND session_id = :s::uuid AND kind = 'recap' AND deleted_at IS NULL LIMIT 1""", m,
                (rs, i) -> new PortalWorkout.Recap(rs.getString("id"), rs.getString("body"), rs.getTimestamp("read_at") == null ? null : rs.getTimestamp("read_at").getTime()))
                .stream().findFirst();
    }

    // ── finishing ────────────────────────────────────────────────────────────────────────────────

    public int setsDone(UUID client, UUID sessionId) {
        var m = p(client);
        m.put("s", sessionId.toString());
        return jdbc.queryForObject("""
                SELECT count(*) FROM set_log sl JOIN session_exercise se ON se.id = sl.session_exercise_id
                 WHERE se.session_id = :s::uuid AND se.client_id = :c::uuid AND se.removed_at IS NULL AND sl.done_at IS NOT NULL""", m, Integer.class);
    }

    /** Marks the self-run done at the database's own now() (so every row written in this transaction shares one instant). */
    public void markDone(UUID sessionId, Integer pausedSeconds) {
        var m = new HashMap<String, Object>();
        m.put("s", sessionId.toString());
        m.put("p", pausedSeconds);
        jdbc.update("UPDATE scheduled_session SET status = 'done', ended_at = greatest(now(), started_at), paused_seconds = COALESCE(:p, paused_seconds) WHERE id = :s::uuid", m);
    }

    /** Sessions of either kind finished, the one just closed included: what a "10th session" counts. */
    public int doneCount(UUID client) {
        return jdbc.queryForObject("SELECT count(*) FROM scheduled_session WHERE client_id = :c::uuid AND status = 'done' AND deleted_at IS NULL "
                + "AND (logged_by = 'trainer' OR EXISTS (SELECT 1 FROM session_exercise se JOIN set_log sl ON sl.session_exercise_id = se.id "
                + "WHERE se.session_id = scheduled_session.id AND sl.done_at IS NOT NULL))", p(client), Integer.class);
    }

    private static final String E1 = "(sl.load_value * (1 + sl.effort_value / 30.0))";

    /**
     * Personal bests set in the session: an exercise whose best estimated one-rep max (Epley, the product's one ranking) beats every EARLIER
     * done session's — a first time has nothing to beat, so it is not a best. At most three, the biggest jump first.
     */
    public List<PortalWorkout.NewBest> newBests(UUID client, UUID sessionId, Instant sessionAt) {
        var m = p(client);
        m.put("s", sessionId.toString());
        m.put("at", Timestamp.from(sessionAt));
        return jdbc.query("""
                WITH cur AS (
                    SELECT DISTINCT ON (se.exercise_id) se.exercise_id, sl.load_value, sl.effort_value, %1$s AS e1
                      FROM session_exercise se JOIN set_log sl ON sl.session_exercise_id = se.id
                     WHERE se.session_id = :s::uuid AND se.client_id = :c::uuid AND se.removed_at IS NULL AND sl.done_at IS NOT NULL
                       AND sl.load_kind = 'weight' AND sl.effort_kind = 'reps' AND sl.load_value IS NOT NULL AND sl.effort_value IS NOT NULL
                     ORDER BY se.exercise_id, %1$s DESC),
                prior AS (
                    SELECT se.exercise_id, max(%1$s) AS p1
                      FROM session_exercise se JOIN set_log sl ON sl.session_exercise_id = se.id JOIN scheduled_session s ON s.id = se.session_id
                     WHERE se.client_id = :c::uuid AND se.session_id <> :s::uuid AND se.removed_at IS NULL AND s.status = 'done' AND s.deleted_at IS NULL
                       AND s.scheduled_at < :at AND sl.done_at IS NOT NULL AND sl.load_kind = 'weight' AND sl.effort_kind = 'reps'
                       AND sl.load_value IS NOT NULL AND sl.effort_value IS NOT NULL AND se.exercise_id IN (SELECT exercise_id FROM cur)
                     GROUP BY se.exercise_id)
                SELECT cur.exercise_id::text AS id, e.name, cur.load_value, cur.effort_value, cur.e1, prior.p1
                  FROM cur JOIN prior ON prior.exercise_id = cur.exercise_id JOIN exercise e ON e.id = cur.exercise_id
                 WHERE cur.e1 > prior.p1
                 ORDER BY (cur.e1 - prior.p1) DESC, e.name LIMIT 3""".formatted(E1), m,
                (rs, i) -> new PortalWorkout.NewBest(rs.getString("id"), rs.getString("name"), strip(rs.getBigDecimal("load_value")),
                        strip(rs.getBigDecimal("effort_value")), one(rs.getBigDecimal("e1")), one(rs.getBigDecimal("p1"))));
    }

    private static BigDecimal strip(BigDecimal v) {
        if (v == null) return null;
        BigDecimal s = v.stripTrailingZeros();
        return s.scale() < 0 ? s.setScale(0) : s;
    }

    private static BigDecimal one(BigDecimal v) {
        return v == null ? null : strip(v.setScale(1, java.math.RoundingMode.HALF_UP));
    }

    /** {@code client_finish_extras} (V23): the milestones and the best notice a client cannot write for themselves. Answers the milestones it newly made. */
    public List<PortalWorkout.Milestone> finishExtras(UUID sessionId, List<Map<String, Object>> milestones, String bestText, int bestCount) {
        var m = new HashMap<String, Object>();
        m.put("s", sessionId.toString());
        m.put("m", JSON.writeValueAsString(milestones));
        m.put("t", bestText);
        m.put("n", bestCount);
        String json = jdbc.queryForObject("SELECT client_finish_extras(:s::uuid, :m::jsonb, :t, :n)::text", m, String.class);
        var out = new ArrayList<PortalWorkout.Milestone>();
        for (var n : JSON.readTree(json)) out.add(new PortalWorkout.Milestone(n.path("kind").asString(), n.path("label").asString()));
        return out;
    }

    /** The milestones a finish made, read back for a replay: rows stamped at the instant the session ended. */
    public List<PortalWorkout.Milestone> milestonesAt(UUID client, Instant endedAt) {
        var m = p(client);
        m.put("a", Timestamp.from(endedAt.minusSeconds(2)));
        m.put("b", Timestamp.from(endedAt.plusSeconds(2)));
        return jdbc.query("SELECT kind, label FROM milestone WHERE client_id = :c::uuid AND deleted_at IS NULL AND at BETWEEN :a AND :b ORDER BY value",
                m, (rs, i) -> new PortalWorkout.Milestone(rs.getString("kind"), rs.getString("label")));
    }

    // ── swapping ─────────────────────────────────────────────────────────────────────────────────

    public record Sx(UUID id, UUID exerciseId, UUID plannedFrom, UUID swappedFrom, Timestamp removedAt) {}

    public Optional<Sx> lockExercise(UUID client, UUID sessionId, UUID sxId) {
        var m = p(client);
        m.put("s", sessionId.toString());
        m.put("x", sxId.toString());
        return jdbc.query("""
                SELECT se.id, se.exercise_id, se.planned_from, se.swapped_from_exercise_id, se.removed_at FROM session_exercise se
                 WHERE se.id = :x::uuid AND se.session_id = :s::uuid AND se.client_id = :c::uuid FOR UPDATE OF se""", m,
                (rs, i) -> new Sx(uuid(rs.getObject("id")), uuid(rs.getObject("exercise_id")), uuid(rs.getObject("planned_from")),
                        uuid(rs.getObject("swapped_from_exercise_id")), rs.getTimestamp("removed_at"))).stream().findFirst();
    }

    /** An exercise the client may use: the library, or a trainer's own that the lens opens. Its log type decides the kinds a swapped-in set starts with. */
    public Optional<String[]> visibleExercise(UUID exerciseId) {
        return jdbc.query("SELECT name, log_type FROM exercise WHERE id = :e::uuid AND deleted_at IS NULL", Map.of("e", exerciseId.toString()),
                (rs, i) -> new String[]{rs.getString("name"), rs.getString("log_type")}).stream().findFirst();
    }

    public boolean liveInSession(UUID sessionId, UUID exerciseId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM session_exercise WHERE session_id = :s::uuid AND exercise_id = :e::uuid AND removed_at IS NULL)",
                Map.of("s", sessionId.toString(), "e", exerciseId.toString()), Boolean.class));
    }

    /** The plan alternative row of {@code mainPlanRow} that trains {@code exerciseId}, if the trainer approved it. */
    public Optional<UUID> approvedRow(UUID mainPlanRow, UUID exerciseId) {
        if (mainPlanRow == null) return Optional.empty();
        return jdbc.queryForList("SELECT id FROM workout_exercise WHERE alternative_of = :m::uuid AND exercise_id = :e::uuid LIMIT 1",
                Map.of("m", mainPlanRow.toString(), "e", exerciseId.toString()), Object.class).stream().findFirst().map(PortalWorkoutJdbcRepository::uuid);
    }

    public void swap(UUID sxId, UUID toExercise, UUID plannedFrom, UUID swappedFrom, String source, String reason) {
        var m = new HashMap<String, Object>();
        m.put("x", sxId.toString());
        m.put("e", toExercise.toString());
        m.put("pf", plannedFrom == null ? null : plannedFrom.toString());
        m.put("sf", swappedFrom == null ? null : swappedFrom.toString());
        m.put("src", swappedFrom == null ? null : source);
        m.put("r", swappedFrom == null ? null : reason);
        jdbc.update("""
                UPDATE session_exercise SET exercise_id = :e::uuid, planned_from = CAST(:pf AS uuid), swapped_from_exercise_id = CAST(:sf AS uuid),
                       swap_source = :src, swap_reason = :r WHERE id = :x::uuid""", m);
    }

    public int maxDonePosition(UUID sxId) {
        return jdbc.queryForObject("SELECT coalesce(max(position), 0) FROM set_log WHERE session_exercise_id = :x::uuid AND done_at IS NOT NULL",
                Map.of("x", sxId.toString()), Integer.class);
    }

    /** What is still to do on an exercise, in order: the not-done sets, with their targets, so a swap can carry them across. */
    public record Pending(String loadKind, String effortKind, BigDecimal load, BigDecimal effort, Integer rest, String tempo) {}

    public List<Pending> pendingSets(UUID sxId) {
        return jdbc.query("""
                SELECT load_kind, effort_kind, target_load_value, target_effort_value, rest_seconds, tempo FROM set_log
                 WHERE session_exercise_id = :x::uuid AND done_at IS NULL ORDER BY position""", Map.of("x", sxId.toString()),
                (rs, i) -> new Pending(rs.getString("load_kind"), rs.getString("effort_kind"), rs.getBigDecimal("target_load_value"),
                        rs.getBigDecimal("target_effort_value"), (Integer) rs.getObject("rest_seconds"), rs.getString("tempo")));
    }

    public void deleteNotDoneSets(UUID sxId) {
        jdbc.update("DELETE FROM set_log WHERE session_exercise_id = :x::uuid AND done_at IS NULL", Map.of("x", sxId.toString()));
    }

    /** Planned sets from the approved alternative's own prescription, after the sets already done. */
    public void insertSetsFromPlan(UUID sxId, UUID planRow, int after) {
        jdbc.update("""
                INSERT INTO set_log (id, session_exercise_id, position, planned, load_kind, effort_kind, target_load_value, target_effort_value,
                                     rest_seconds, tempo, entered_by)
                SELECT gen_random_uuid(), :x::uuid, :after + (row_number() OVER (ORDER BY ws.position)), true, ws.load_kind, ws.effort_kind,
                       ws.load_value, ws.effort_value, ws.rest_seconds, ws.tempo, 'client'
                  FROM workout_set ws WHERE ws.workout_exercise_id = :w::uuid""", Map.of("x", sxId.toString(), "w", planRow.toString(), "after", after));
    }

    public int planSetCount(UUID planRow) {
        return jdbc.queryForObject("SELECT count(*) FROM workout_set WHERE workout_exercise_id = :w::uuid", Map.of("w", planRow.toString()), Integer.class);
    }

    public void insertPlannedSet(UUID sxId, int position, Pending s, String loadKind, String effortKind, boolean keepTargets) {
        var m = new HashMap<String, Object>();
        m.put("x", sxId.toString());
        m.put("pos", position);
        m.put("lk", loadKind);
        m.put("ek", effortKind);
        m.put("tl", keepTargets ? s.load() : null);
        m.put("te", keepTargets ? s.effort() : null);
        m.put("rest", s.rest());
        m.put("tempo", keepTargets ? s.tempo() : null);
        jdbc.update("""
                INSERT INTO set_log (id, session_exercise_id, position, planned, load_kind, effort_kind, target_load_value, target_effort_value,
                                     rest_seconds, tempo, entered_by)
                VALUES (gen_random_uuid(), :x::uuid, :pos, true, :lk, :ek, :tl, :te, :rest, :tempo, 'client')""", m);
    }

    // ── library alternatives ─────────────────────────────────────────────────────────────────────

    /**
     * Other exercises for the same target muscle, nearest first: the same movement pattern, then the same equipment, then by name.
     * Excludes the exercise itself and, when a session is named, whatever is already live in it.
     */
    public List<PortalWorkout.LibraryAlt> libraryAlternatives(UUID exerciseId, UUID sessionId, int limit) {
        var m = new HashMap<String, Object>();
        m.put("e", exerciseId.toString());
        m.put("s", sessionId == null ? null : sessionId.toString());
        m.put("n", limit);
        return jdbc.query("""
                SELECT o.id::text AS id, o.name, o.equipment, o.muscle_group FROM exercise e
                  JOIN exercise o ON o.muscle_group = e.muscle_group AND o.id <> e.id AND o.deleted_at IS NULL
                 WHERE e.id = :e::uuid AND e.muscle_group IS NOT NULL
                   AND (CAST(:s AS uuid) IS NULL OR NOT EXISTS (SELECT 1 FROM session_exercise se WHERE se.session_id = CAST(:s AS uuid)
                                                                  AND se.exercise_id = o.id AND se.removed_at IS NULL))
                 ORDER BY (o.movement_pattern IS NOT DISTINCT FROM e.movement_pattern) DESC, (o.equipment IS NOT DISTINCT FROM e.equipment) DESC, o.name, o.id
                 LIMIT :n""", m, (rs, i) -> new PortalWorkout.LibraryAlt(rs.getString("id"), rs.getString("name"), rs.getString("equipment"), rs.getString("muscle_group"), "library"));
    }

    /** Whether the exercise can be seen at all — a 404 for one the lens does not open. */
    public boolean exerciseExists(UUID exerciseId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM exercise WHERE id = :e::uuid AND deleted_at IS NULL)",
                Map.of("e", exerciseId.toString()), Boolean.class));
    }

    // ── the list ─────────────────────────────────────────────────────────────────────────────────

    public record ListRow(PortalWorkout.ListItem item, Timestamp at) {}

    /** The client's finished sessions, newest first by {@code (scheduled_at, id)}; a self-run with no set done is not listed (R106). */
    public List<ListRow> listDone(UUID client, Timestamp beforeAt, UUID beforeId, int limit) {
        var m = p(client);
        m.put("at", beforeAt);
        m.put("id", beforeId == null ? null : beforeId.toString());
        m.put("n", limit);
        return jdbc.query("""
                SELECT s.id::text AS id, s.logged_by, s.scheduled_at, w.name AS wname, COALESCE(t.done, 0) AS done, COALESCE(t.volume, 0) AS volume,
                       COALESCE(b.n, 0) AS bests,
                       EXISTS (SELECT 1 FROM client_message m WHERE m.client_id = s.client_id AND m.session_id = s.id AND m.kind = 'recap'
                                  AND m.deleted_at IS NULL AND m.read_at IS NULL) AS unread
                  FROM scheduled_session s
                  LEFT JOIN workout w ON w.id = s.workout_id
                  LEFT JOIN LATERAL (
                      SELECT count(*) FILTER (WHERE sl.done_at IS NOT NULL) AS done,
                             COALESCE(sum(sl.load_value * sl.effort_value) FILTER (WHERE sl.done_at IS NOT NULL AND sl.load_kind = 'weight' AND sl.effort_kind = 'reps'), 0) AS volume
                        FROM session_exercise se JOIN set_log sl ON sl.session_exercise_id = se.id
                       WHERE se.session_id = s.id AND se.removed_at IS NULL) t ON true
                  LEFT JOIN LATERAL (
                      SELECT count(*) AS n FROM (
                          SELECT se.exercise_id, max(%1$s) AS e1
                            FROM session_exercise se JOIN set_log sl ON sl.session_exercise_id = se.id
                           WHERE se.session_id = s.id AND se.removed_at IS NULL AND sl.done_at IS NOT NULL AND sl.load_kind = 'weight'
                             AND sl.effort_kind = 'reps' AND sl.load_value IS NOT NULL AND sl.effort_value IS NOT NULL
                           GROUP BY se.exercise_id) cur
                       WHERE EXISTS (SELECT 1 FROM session_exercise se2 JOIN set_log sl ON sl.session_exercise_id = se2.id JOIN scheduled_session s2 ON s2.id = se2.session_id
                                      WHERE se2.client_id = s.client_id AND se2.exercise_id = cur.exercise_id AND se2.removed_at IS NULL AND s2.id <> s.id
                                        AND s2.status = 'done' AND s2.deleted_at IS NULL AND s2.scheduled_at < s.scheduled_at AND sl.done_at IS NOT NULL
                                        AND sl.load_kind = 'weight' AND sl.effort_kind = 'reps' AND sl.load_value IS NOT NULL AND sl.effort_value IS NOT NULL
                                      HAVING max(%1$s) < cur.e1)) b ON true
                 WHERE s.client_id = :c::uuid AND s.status = 'done' AND s.deleted_at IS NULL
                   AND (s.logged_by = 'trainer' OR COALESCE(t.done, 0) > 0)
                   AND (CAST(:at AS timestamptz) IS NULL OR (s.scheduled_at, s.id) < (CAST(:at AS timestamptz), CAST(:id AS uuid)))
                 ORDER BY s.scheduled_at DESC, s.id DESC LIMIT :n""".formatted(E1), m,
                (rs, i) -> new ListRow(new PortalWorkout.ListItem(rs.getString("id"), rs.getString("logged_by"), rs.getTimestamp("scheduled_at").getTime(), rs.getString("wname"),
                        rs.getInt("done"), strip(rs.getBigDecimal("volume").setScale(2, java.math.RoundingMode.HALF_UP)), rs.getInt("bests"), rs.getBoolean("unread")),
                        rs.getTimestamp("scheduled_at")));
    }
}
