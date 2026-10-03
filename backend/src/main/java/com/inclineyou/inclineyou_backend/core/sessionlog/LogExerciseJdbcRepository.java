package com.inclineyou.inclineyou_backend.core.sessionlog;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static com.inclineyou.inclineyou_backend.core.sessionlog.LogSql.uuid;

/**
 * The statements behind a movement in the log: adding one, removing / annotating it, changing the rest, swapping it
 * today or in the client's plan. session_exercise has no trainer id, so everything is reached through the session.
 */
@Repository
@RequiredArgsConstructor
public class LogExerciseJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** A session_exercise with what the writes need to know about its session and plan, read under {@code FOR UPDATE OF se}. */
    public record ExCtx(UUID sxId, UUID sessionId, UUID clientId, UUID exerciseId, UUID plannedFrom, UUID swappedFrom,
                        Timestamp removedAt, UUID workoutId, boolean started) {}

    /** A library exercise this trainer may use (global, or their own and live). */
    public record Library(UUID id, String logType) {}

    public Optional<ExCtx> lock(UUID trainerId, UUID sessionId, UUID sxId) {
        return jdbc.query("""
                SELECT se.id, se.session_id, se.client_id, se.exercise_id, se.planned_from, se.swapped_from_exercise_id,
                       se.removed_at, s.workout_id, s.started_at
                FROM session_exercise se JOIN scheduled_session s ON s.id = se.session_id
                WHERE se.id = :sx::uuid AND s.id = :sid::uuid AND s.trainer_id = :tid::uuid AND s.deleted_at IS NULL
                FOR UPDATE OF se
                """, Map.of("sx", sxId.toString(), "sid", sessionId.toString(), "tid", trainerId.toString()),
                (rs, i) -> ctx(rs)).stream().findFirst();
    }

    /** This trainer's session_exercise by id, without a lock — the replay of a client-minted id. */
    public Optional<ExCtx> findOwned(UUID trainerId, UUID sxId) {
        return jdbc.query("""
                SELECT se.id, se.session_id, se.client_id, se.exercise_id, se.planned_from, se.swapped_from_exercise_id,
                       se.removed_at, s.workout_id, s.started_at
                FROM session_exercise se JOIN scheduled_session s ON s.id = se.session_id
                WHERE se.id = :sx::uuid AND s.trainer_id = :tid::uuid
                """, Map.of("sx", sxId.toString(), "tid", trainerId.toString()),
                (rs, i) -> ctx(rs)).stream().findFirst();
    }

    private static ExCtx ctx(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new ExCtx(uuid(rs.getObject("id")), uuid(rs.getObject("session_id")), uuid(rs.getObject("client_id")),
                uuid(rs.getObject("exercise_id")), uuid(rs.getObject("planned_from")), uuid(rs.getObject("swapped_from_exercise_id")),
                rs.getTimestamp("removed_at"), uuid(rs.getObject("workout_id")), rs.getTimestamp("started_at") != null);
    }

    public Optional<Library> library(UUID trainerId, UUID exerciseId) {
        return jdbc.query("""
                SELECT e.id, e.log_type FROM exercise e
                WHERE e.id = :ex::uuid AND e.deleted_at IS NULL AND (e.origin = 'inclineyou' OR e.trainer_id = :tid::uuid)
                """, Map.of("ex", exerciseId.toString(), "tid", trainerId.toString()),
                (rs, i) -> new Library(uuid(rs.getObject("id")), rs.getString("log_type"))).stream().findFirst();
    }

    // ── adding ───────────────────────────────────────────────────────────────────────────────────

    /** The next free position, counting removed rows (the order index is unique across them). */
    public int nextPosition(UUID sessionId) {
        return jdbc.queryForObject("SELECT coalesce(max(position) + 1, 0) FROM session_exercise WHERE session_id = :sid::uuid",
                Map.of("sid", sessionId.toString()), Integer.class);
    }

    /**
     * Make room at {@code position}: everything from there up moves one place. Two passes through a high range,
     * because the order index is a non-deferrable unique and a one-pass +1 would collide with its own neighbour.
     */
    public void shiftFrom(UUID sessionId, int position) {
        var p = Map.<String, Object>of("sid", sessionId.toString(), "pos", position);
        jdbc.update("UPDATE session_exercise SET position = position + 10000 WHERE session_id = :sid::uuid AND position >= :pos", p);
        jdbc.update("UPDATE session_exercise SET position = position - 9999 WHERE session_id = :sid::uuid AND position >= 10000", p);
    }

    public void insert(UUID id, UUID sessionId, UUID clientId, UUID exerciseId, int position) {
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("sid", sessionId.toString());
        p.put("cid", clientId.toString());
        p.put("ex", exerciseId.toString());
        p.put("pos", position);
        jdbc.update("""
                INSERT INTO session_exercise (id, session_id, client_id, exercise_id, position, source)
                VALUES (:id::uuid, :sid::uuid, :cid::uuid, :ex::uuid, :pos, 'added')
                """, p);
    }

    /** Empty planned rows (no targets, nothing done) — the only kind of not-done row the schema allows. */
    public void insertEmptySets(UUID sxId, int count, String loadKind, String effortKind) {
        var p = new HashMap<String, Object>();
        p.put("sx", sxId.toString());
        p.put("n", count);
        p.put("lk", loadKind);
        p.put("ek", effortKind);
        jdbc.update("""
                INSERT INTO set_log (id, session_exercise_id, position, planned, load_kind, effort_kind)
                SELECT gen_random_uuid(), :sx::uuid, g, true, :lk, :ek FROM generate_series(1, :n) AS g
                """, p);
    }

    // ── patching ─────────────────────────────────────────────────────────────────────────────────

    public void setRemoved(UUID sxId, boolean removed) {
        jdbc.update("UPDATE session_exercise SET removed_at = CASE WHEN :r THEN coalesce(removed_at, now()) END WHERE id = :sx::uuid",
                Map.of("sx", sxId.toString(), "r", removed));
    }

    public void setNotes(UUID sxId, String notes) {
        var p = new HashMap<String, Object>();
        p.put("sx", sxId.toString());
        p.put("n", notes);
        jdbc.update("UPDATE session_exercise SET notes = :n WHERE id = :sx::uuid", p);
    }

    /** The rest on the sets still to do; what has been done keeps the rest it had. */
    public void setRestOnNotDone(UUID sxId, int seconds) {
        jdbc.update("UPDATE set_log SET rest_seconds = :s WHERE session_exercise_id = :sx::uuid AND done_at IS NULL",
                Map.of("sx", sxId.toString(), "s", seconds));
    }

    /**
     * The client's PROGRAM this exercise came from, when the session's workout is a day of a program that belongs to
     * this client (a template or a standalone workout is not "their plan"). Empty for an added exercise or an
     * unplanned session.
     */
    public Optional<UUID> clientProgramOf(UUID workoutId, UUID clientId) {
        if (workoutId == null) return Optional.empty();
        return jdbc.query("""
                SELECT pr.id FROM workout w JOIN program pr ON pr.id = w.program_id
                WHERE w.id = :wid::uuid AND pr.client_id = :cid::uuid AND pr.deleted_at IS NULL
                """, Map.of("wid", workoutId.toString(), "cid", clientId.toString()),
                (rs, i) -> uuid(rs.getObject("id"))).stream().findFirst();
    }

    public void setPlanRest(UUID planRowId, int seconds) {
        jdbc.update("UPDATE workout_set SET rest_seconds = :s WHERE workout_exercise_id = :we::uuid",
                Map.of("we", planRowId.toString(), "s", seconds));
    }

    /** A program's version is its revised_at: bumping it makes a builder tab open on the plan fail its next save with 412. */
    public void touchProgram(UUID programId) {
        jdbc.update("UPDATE program SET revised_at = now() WHERE id = :pid::uuid", Map.of("pid", programId.toString()));
    }

    // ── swapping ─────────────────────────────────────────────────────────────────────────────────

    /** A plan alternative of {@code mainPlanRow} that is {@code toExercise}; empty when the pair does not match. */
    public Optional<UUID> alternative(UUID planRowId, UUID mainPlanRow, UUID toExercise) {
        if (mainPlanRow == null) return Optional.empty();
        return jdbc.query("""
                SELECT we.id FROM workout_exercise we
                WHERE we.id = :alt::uuid AND we.alternative_of = :main::uuid AND we.exercise_id = :ex::uuid
                """, Map.of("alt", planRowId.toString(), "main", mainPlanRow.toString(), "ex", toExercise.toString()),
                (rs, i) -> uuid(rs.getObject("id"))).stream().findFirst();
    }

    /** The movement changes; the original is kept in swapped_from (null when swapping back to it). */
    public void swap(UUID sxId, UUID toExercise, UUID plannedFrom, UUID swappedFrom, String reason) {
        var p = new HashMap<String, Object>();
        p.put("sx", sxId.toString());
        p.put("ex", toExercise.toString());
        p.put("pf", plannedFrom == null ? null : plannedFrom.toString());
        p.put("sf", swappedFrom == null ? null : swappedFrom.toString());
        p.put("reason", swappedFrom == null ? null : reason);
        jdbc.update("""
                UPDATE session_exercise SET exercise_id = :ex::uuid, planned_from = CAST(:pf AS uuid),
                       swapped_from_exercise_id = CAST(:sf AS uuid), swap_reason = :reason
                WHERE id = :sx::uuid
                """, p);
    }

    /** The highest position among sets that are done, i.e. the ones a swap keeps. */
    public int maxDonePosition(UUID sxId) {
        return jdbc.queryForObject("SELECT coalesce(max(position), 0) FROM set_log WHERE session_exercise_id = :sx::uuid AND done_at IS NOT NULL",
                Map.of("sx", sxId.toString()), Integer.class);
    }

    public int planSetCount(UUID planRowId) {
        return jdbc.queryForObject("SELECT count(*) FROM workout_set WHERE workout_exercise_id = :we::uuid",
                Map.of("we", planRowId.toString()), Integer.class);
    }

    public void deleteNotDoneSets(UUID sxId) {
        jdbc.update("DELETE FROM set_log WHERE session_exercise_id = :sx::uuid AND done_at IS NULL", Map.of("sx", sxId.toString()));
    }

    /** The alternative's targets become the exercise's not-done sets, after the sets already done. */
    public void insertPlannedFromPlan(UUID sxId, UUID planRowId, int afterPosition) {
        jdbc.update("""
                INSERT INTO set_log (id, session_exercise_id, position, planned, load_kind, effort_kind,
                                     target_load_value, target_effort_value, rest_seconds, tempo)
                SELECT gen_random_uuid(), :sx::uuid, :after + (row_number() OVER (ORDER BY ws.position)), true,
                       ws.load_kind, ws.effort_kind, ws.load_value, ws.effort_value, ws.rest_seconds, ws.tempo
                FROM workout_set ws WHERE ws.workout_exercise_id = :we::uuid
                """, Map.of("sx", sxId.toString(), "we", planRowId.toString(), "after", afterPosition));
    }

    /** scope program: the plan's main row now trains the new movement from the next session on. */
    public void planSwapExercise(UUID mainPlanRow, UUID toExercise) {
        jdbc.update("UPDATE workout_exercise SET exercise_id = :ex::uuid WHERE id = :we::uuid",
                Map.of("we", mainPlanRow.toString(), "ex", toExercise.toString()));
    }

    /** scope program with a plan alternative: the main row takes the alternative's prescription too. */
    public void planCopySets(UUID fromPlanRow, UUID toPlanRow) {
        jdbc.update("DELETE FROM workout_set WHERE workout_exercise_id = :to::uuid", Map.of("to", toPlanRow.toString()));
        jdbc.update("""
                INSERT INTO workout_set (id, workout_exercise_id, position, load_kind, load_value, effort_kind,
                                         effort_value, rest_seconds, tempo, notes)
                SELECT gen_random_uuid(), :to::uuid, ws.position, ws.load_kind, ws.load_value, ws.effort_kind,
                       ws.effort_value, ws.rest_seconds, ws.tempo, ws.notes
                FROM workout_set ws WHERE ws.workout_exercise_id = :from::uuid
                """, Map.of("from", fromPlanRow.toString(), "to", toPlanRow.toString()));
    }
}
