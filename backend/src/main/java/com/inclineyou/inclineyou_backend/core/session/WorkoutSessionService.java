package com.inclineyou.inclineyou_backend.core.session;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.*;

@Service
@RequiredArgsConstructor
public class WorkoutSessionService {

    private final NamedParameterJdbcTemplate jdbc;

    // ── DTOs ──────────────────────────────────────────────────────────────────

    public record WorkoutSessionResponse(
            String id,
            String clientId,
            String programId,
            String scheduledSessionId,
            String loggedBy,
            String sessionDate,
            String notes,
            long createdAt,
            long updatedAt,
            /*
             * V13's `ended_at` — set when the trainer CLOSED the log. Null means
             * still open.
             *
             * The column and the sync envelope have carried it since V13; this DTO
             * never did, and the omission is load-bearing rather than cosmetic. An
             * open log is the only thing that makes a scheduled session "in
             * session": `buildRunning` looks for a session with a log that has not
             * ended. With this field absent every log reads as permanently open, so
             * a session logged on Tuesday still says *In session* on Sunday, and
             * the "started, nothing logged" state can never fire at all — the two
             * states a trainer's home screen is most often in.
             *
             * It also makes the phone's *Later* honest on this half: finishing the
             * log and closing the money are different facts, and a trainer who did
             * the first and left the second should not still be told they are
             * mid-session.
             *
             * APPENDED LAST, which is the additive-only contract rather than
             * tidiness: every existing caller destructures by name, so a reader
             * written against the nine-field shape keeps working.
             */
            Long endedAt,
            /*
             * ── APPENDED 23 SEP 2026 · HOW MANY MOVEMENTS ─────────────────────
             * The client file's Sessions table prints it in an *Exercises*
             * column. COUNTED on read, never stored. See EXERCISE_COUNT for the
             * one fallback, which is what keeps a pre-V13 log from reading "0".
             */
            Integer exerciseCount
    ) {}

    public record SetLogResponse(
            String id,
            String workoutSessionId,
            String exerciseId,
            int setNumber,
            BigDecimal loadKg,
            Integer reps,
            BigDecimal rpe,
            String notes,
            long createdAt,
            long updatedAt,
            /*
             * The owning log's `session_date`, ISO "yyyy-MM-dd". Denormalised
             * onto the set deliberately.
             *
             * A set's date is the SESSION's date, never `created_at` — a session
             * on Tuesday typed up on Thursday is a Tuesday session, and Previous
             * and the record test both order by when the training happened. On
             * the per-session read it is redundant; on the bulk read below it is
             * the whole point, because otherwise a caller holding two thousand
             * sets would need the workout list as well just to sort them.
             *
             * APPENDED LAST.
             */
            String sessionDate
    ) {}

    /* ── V13's workout_exercise, as REST ──────────────────────────────────────
       Today's card list: what is in the grid, in what order, what was asked for,
       and what was swapped or taken out.

       The table has been in the sync envelope since V13 and had no route, so the
       online half could only RECONSTRUCT the grid — the program's rows plus every
       exercise that happened to have a set logged against it. Three things that
       reconstruction cannot represent, all of them things a trainer did on
       purpose:

         · an exercise ADDED to today that nobody has typed a set into yet. It
           existed only in a query string until its first set landed.
         · a SWAP. The rack was busy, so the bench press was not skipped, it was
           replaced — and `swapped_from_exercise_id` is the single most important
           thing this table records, because adherence reads it. Reconstructed,
           the original just vanishes and reads as a skip.
         · REST for an off-plan exercise, which had nowhere to persist.
    */

    public record WorkoutExerciseResponse(
            String id,
            String workoutSessionId,
            String exerciseId,
            int orderIndex,
            String source,
            String swappedFromExerciseId,
            Integer targetSets,
            Integer targetReps,
            Integer restSeconds,
            Long removedAt,
            long createdAt,
            long updatedAt
    ) {}

    // ── List sessions ─────────────────────────────────────────────────────────

    public List<WorkoutSessionResponse> list(UUID trainerId, String clientId) {
        var conditions = new ArrayList<String>();
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        conditions.add("trainer_id = :tid::uuid");
        conditions.add("deleted_at IS NULL");

        if (clientId != null && !clientId.isBlank()) {
            p.put("cid", clientId);
            conditions.add("client_id = :cid::uuid");
        }

        var rows = jdbc.queryForList(
                "SELECT " + SESSION_COLUMNS +
                " FROM workout_session WHERE " + String.join(" AND ", conditions) +
                " ORDER BY session_date DESC", p);
        return rows.stream().map(this::toSessionResponse).toList();
    }

    // ── Get session ───────────────────────────────────────────────────────────

    public WorkoutSessionResponse get(UUID id, UUID trainerId) {
        return toSessionResponse(findOwnedSession(id, trainerId));
    }

    // ── List sets ─────────────────────────────────────────────────────────────

    public List<SetLogResponse> listSets(UUID workoutId, UUID trainerId) {
        var session = findOwnedSession(workoutId, trainerId);
        var rows = jdbc.queryForList("SELECT " + SET_COLUMNS + " " + """
                FROM set_log
                WHERE workout_session_id = :wid::uuid AND deleted_at IS NULL
                ORDER BY exercise_id, set_number ASC
                """, Map.of("wid", workoutId.toString()));
        // The date is the session's and every row shares it — carried from the
        // row already read rather than joined back per set.
        String sessionDate = str(session.get("session_date"));
        return rows.stream().map(r -> toSetResponse(r, sessionDate)).toList();
    }

    // ── Every set a client has ever logged ────────────────────────────────────

    /**
     * The bulk set-log read: one request for a client's whole history, optionally
     * narrowed to one exercise.
     *
     * <p>Until this existed, {@code GET /v1/workouts/{id}/sets} was the only way
     * to read a set and it is per session. The workout console needs every set
     * this client has ever done on the movements in today's grid — *Previous* is
     * per set number against the last session, and the record test compares
     * today's top set against the heaviest load in the whole history. A client at
     * three sessions a week for a year is around 150 requests for one page load,
     * against a 120/min tier: the console could not be built correctly, so the
     * web half read a 40-session WINDOW and patched the hole with the all-time
     * maximum from {@code /progress}, which is capped at 30 exercises and counts
     * only sets that carry a load. A client with more than thirty movements, or a
     * reps-only exercise logged more than forty times, could still have an old
     * best outside both. This closes that.
     *
     * <p>The phone does none of this — it holds the table in SQLite and answers
     * the same question with a {@code SELECT}. This endpoint is the online half's
     * equivalent of that local read, which is why it is unbounded: a window is
     * what produced the wrong answer above.
     *
     * <p>Ownership is the join, not a second check — the same filter every read
     * in this file uses. A client id that is not this trainer's matches no
     * session and therefore no set, so it comes back empty rather than 403, which
     * is the house rule.
     */
    public List<SetLogResponse> listSetsForClient(UUID trainerId, String clientId, String exerciseId) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("cid", clientId);

        var conditions = new ArrayList<String>();
        conditions.add("ws.trainer_id = :tid::uuid");
        conditions.add("ws.client_id = :cid::uuid");
        conditions.add("ws.deleted_at IS NULL");
        conditions.add("sl.deleted_at IS NULL");
        if (exerciseId != null && !exerciseId.isBlank()) {
            p.put("exId", exerciseId);
            conditions.add("sl.exercise_id = :exId::uuid");
        }

        var rows = jdbc.queryForList("""
                SELECT sl.id::text, sl.workout_session_id::text, sl.exercise_id::text,
                       sl.set_number, sl.load_kg, sl.reps, sl.rpe, sl.notes,
                       sl.created_at, sl.updated_at, ws.session_date::text AS session_date
                FROM set_log sl
                JOIN workout_session ws ON ws.id = sl.workout_session_id
                WHERE """ + " " + String.join(" AND ", conditions) +
                // Oldest first, so a caller folding these into a running best or a
                // per-set-number "previous" can do it in one pass without sorting.
                " ORDER BY ws.session_date ASC, sl.exercise_id, sl.set_number ASC", p);

        return rows.stream().map(r -> toSetResponse(r, str(r.get("session_date")))).toList();
    }

    // ── Today's card list ─────────────────────────────────────────────────────

    private static final String WORKOUT_EXERCISE_COLUMNS =
            "id::text, workout_session_id::text, exercise_id::text, order_index, source, " +
            "swapped_from_exercise_id::text, target_sets, target_reps, rest_seconds, " +
            "removed_at, created_at, updated_at";

    public List<WorkoutExerciseResponse> listExercises(UUID workoutId, UUID trainerId) {
        findOwnedSession(workoutId, trainerId);
        var rows = jdbc.queryForList("SELECT " + WORKOUT_EXERCISE_COLUMNS + " " + """
                FROM workout_exercise
                WHERE workout_session_id = :wid::uuid AND deleted_at IS NULL
                ORDER BY order_index ASC, created_at ASC
                """, Map.of("wid", workoutId.toString()));
        // Removed rows come back. They are not noise — the card is drawn struck
        // through with an Undo on it, and a caller that wanted only the live grid
        // filters on `removedAt == null` itself.
        return rows.stream().map(this::toWorkoutExerciseResponse).toList();
    }

    private WorkoutExerciseResponse toWorkoutExerciseResponse(Map<String, Object> r) {
        Object oi = r.get("order_index");
        int orderIndex = oi instanceof Integer i ? i : (oi != null ? Integer.parseInt(oi.toString()) : 0);
        return new WorkoutExerciseResponse(
                str(r.get("id")),
                str(r.get("workout_session_id")),
                str(r.get("exercise_id")),
                orderIndex,
                str(r.get("source")),
                str(r.get("swapped_from_exercise_id")),
                (Integer) r.get("target_sets"),
                (Integer) r.get("target_reps"),
                (Integer) r.get("rest_seconds"),
                // Null-preserving for the same reason `endedAt` is: 0 would read
                // as "removed at the epoch", which is removed.
                nullableEpochMilli(r.get("removed_at")),
                toEpochMilli(r.get("created_at")),
                toEpochMilli(r.get("updated_at")));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * The one row of columns every read of this table selects — the same device
     * `ScheduledSessionService` uses. It exists because `ended_at` had to be added
     * to two hand-written SELECTs that were already identical, which is one more
     * place than a column should ever need adding.
     */
    private static final String SET_COLUMNS =
            "id::text, workout_session_id::text, exercise_id::text, " +
            "set_number, load_kg, reps, rpe, notes, created_at, updated_at";

    /**
     * How many movements are in a log.
     *
     * <p>{@code workout_exercise} rows that are live and not removed — what the
     * log holds today, including a card added before its first set. That table
     * arrived with V13, so a log written before it (or by a phone build that
     * predates it) has sets and no rows, and counting only rows would print
     * <i>0 exercises</i> against a session with a full sheet. So when a log has
     * no {@code workout_exercise} rows AT ALL — not even removed ones — the
     * count falls back to the distinct movements in its {@code set_log}. A log
     * whose rows were all removed genuinely holds nothing and says 0.
     *
     * <p>Both subqueries are covered by an index on {@code workout_session_id}.
     */
    private static final String EXERCISE_COUNT = """
            CASE WHEN EXISTS (SELECT 1 FROM workout_exercise we
                               WHERE we.workout_session_id = workout_session.id AND we.deleted_at IS NULL)
                 THEN (SELECT count(*) FROM workout_exercise we
                        WHERE we.workout_session_id = workout_session.id
                          AND we.deleted_at IS NULL AND we.removed_at IS NULL)
                 ELSE (SELECT count(DISTINCT sl.exercise_id) FROM set_log sl
                        WHERE sl.workout_session_id = workout_session.id AND sl.deleted_at IS NULL)
            END AS exercise_count""";

    private static final String SESSION_COLUMNS =
            "id::text, client_id::text, program_id::text, scheduled_session_id::text, " +
            "logged_by, session_date::text, notes, created_at, updated_at, ended_at, " + EXERCISE_COUNT;

    private Map<String, Object> findOwnedSession(UUID id, UUID trainerId) {
        var rows = jdbc.queryForList(
                "SELECT " + SESSION_COLUMNS +
                " FROM workout_session WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL",
                Map.of("id", id.toString(), "tid", trainerId.toString()));
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Workout session not found");
        return rows.get(0);
    }

    private WorkoutSessionResponse toSessionResponse(Map<String, Object> r) {
        return new WorkoutSessionResponse(
                str(r.get("id")),
                str(r.get("client_id")),
                str(r.get("program_id")),
                str(r.get("scheduled_session_id")),
                str(r.get("logged_by")),
                str(r.get("session_date")),
                str(r.get("notes")),
                toEpochMilli(r.get("created_at")),
                toEpochMilli(r.get("updated_at")),
                // Null-preserving, and that is the whole point: `0` would mean the
                // log was closed at the epoch, which reads as CLOSED. An open log
                // has to come back as absent.
                nullableEpochMilli(r.get("ended_at")),
                r.get("exercise_count") instanceof Number n ? n.intValue() : null);
    }

    /** Epoch millis, or null when the column is null — never 0 for absent. */
    private Long nullableEpochMilli(Object v) {
        if (v instanceof java.sql.Timestamp ts) return ts.toInstant().toEpochMilli();
        if (v instanceof java.time.OffsetDateTime odt) return odt.toInstant().toEpochMilli();
        if (v instanceof java.time.Instant i) return i.toEpochMilli();
        return null;
    }

    private SetLogResponse toSetResponse(Map<String, Object> r, String sessionDate) {
        Object sn = r.get("set_number");
        int setNumber = sn instanceof Integer i ? i : (sn != null ? Integer.parseInt(sn.toString()) : 0);
        Object lk = r.get("load_kg");
        BigDecimal loadKg = lk instanceof BigDecimal bd ? bd : (lk != null ? new BigDecimal(lk.toString()) : null);
        Object rp = r.get("rpe");
        BigDecimal rpe = rp instanceof BigDecimal bd ? bd : (rp != null ? new BigDecimal(rp.toString()) : null);
        return new SetLogResponse(
                str(r.get("id")),
                str(r.get("workout_session_id")),
                str(r.get("exercise_id")),
                setNumber,
                loadKg,
                (Integer) r.get("reps"),
                rpe,
                str(r.get("notes")),
                toEpochMilli(r.get("created_at")),
                toEpochMilli(r.get("updated_at")),
                sessionDate);
    }

    private String str(Object v) { return v == null ? null : v.toString(); }

    private long toEpochMilli(Object v) {
        if (v instanceof java.sql.Timestamp ts)          return ts.toInstant().toEpochMilli();
        if (v instanceof java.time.OffsetDateTime odt)   return odt.toInstant().toEpochMilli();
        if (v instanceof java.time.LocalDateTime ldt)    return ldt.toInstant(java.time.ZoneOffset.UTC).toEpochMilli();
        if (v instanceof java.time.Instant i)            return i.toEpochMilli();
        return 0L;
    }
}
