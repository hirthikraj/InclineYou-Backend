package com.inclineyou.inclineyou_backend.session;

import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class WorkoutSessionService {

    private final NamedParameterJdbcTemplate jdbc;

    // ── DTOs ──────────────────────────────────────────────────────────────────

    public record CreateSessionRequest(
            @NotBlank String clientId,
            @NotBlank String sessionDate,  // ISO "yyyy-MM-dd"
            String programId,
            String scheduledSessionId,
            String notes
    ) {}

    public record UpdateSessionRequest(
            String notes,
            /*
             * V13's `ended_at`, as a write. Epoch ms.
             *
             * Three states, and the third is why this is a Long rather than a
             * boolean:
             *
             *   · null    — leave `ended_at` exactly as it is. THE DEFAULT, and
             *               it has to be: every caller that predates this field
             *               sends `{notes}` alone, and if absent meant "clear"
             *               each of them would silently REOPEN a closed log.
             *   · > 0     — close the log at that instant.
             *   · 0       — reopen it. The sentinel is ugly and the alternative
             *               is worse: with null already meaning "don't touch",
             *               an additive-only API that never adds a way back has
             *               made mis-tapping *Finish the log* permanent. It is
             *               the same "empty clears" rule `deliveryMode` uses on
             *               the scheduled-session update, spelled for a number.
             *
             * Until this existed the only writer of the column anywhere was
             * `SyncService.pushWorkoutSessions`, so the web half — which has no
             * sync — closed logs by posting a whole row back through the sync
             * envelope just to change one field.
             */
            Long endedAt
    ) {}

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

    public record CreateSetRequest(
            @NotBlank String exerciseId,
            int setNumber,
            BigDecimal loadKg,
            Integer reps,
            BigDecimal rpe,
            String notes
    ) {}

    public record UpdateSetRequest(
            BigDecimal loadKg,
            Integer reps,
            BigDecimal rpe,
            String notes
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

    public record CreateWorkoutExerciseRequest(
            @NotBlank String exerciseId,
            Integer orderIndex,
            /** 'planned' | 'unplanned'; null means 'planned'. */
            String source,
            String swappedFromExerciseId,
            Integer targetSets,
            Integer targetReps,
            /** Null means the plan's rest, and no rest at all if the plan has none. */
            Integer restSeconds
    ) {}

    public record UpdateWorkoutExerciseRequest(
            Integer orderIndex,
            Integer targetSets,
            Integer targetReps,
            Integer restSeconds,
            /*
             * Taken out of today. Epoch ms, and the same three-state Long as
             * `endedAt` above: null leaves it alone, > 0 removes, and 0 puts it
             * back — which is what the toast's Undo needs and the reason this is
             * not a boolean.
             *
             * Separate from DELETE, which tombstones. A removed row is still the
             * record that the trainer decided not to do this; a deleted one is a
             * row that should never have existed.
             */
            Long removedAt
    ) {}

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

    // ── Create session ────────────────────────────────────────────────────────

    @Transactional
    public WorkoutSessionResponse create(UUID trainerId, CreateSessionRequest req) {
        Boolean owned = jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                Map.of("cid", req.clientId(), "tid", trainerId.toString()), Boolean.class);
        if (!Boolean.TRUE.equals(owned)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Client not found");
        }

        UUID id = UUID.randomUUID();
        Instant now = Instant.now();

        var p = new HashMap<String, Object>();
        p.put("id",                 id.toString());
        p.put("tid",                trainerId.toString());
        p.put("cid",                req.clientId());
        p.put("programId",          req.programId());
        p.put("scheduledSessionId", req.scheduledSessionId());
        p.put("sessionDate",        java.sql.Date.valueOf(req.sessionDate()));
        p.put("notes",              req.notes());
        p.put("now",                Timestamp.from(now));

        jdbc.update("""
                INSERT INTO workout_session (id, trainer_id, client_id, program_id, scheduled_session_id,
                    logged_by, session_date, notes, created_at, updated_at)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :programId::uuid, :scheduledSessionId::uuid,
                    'trainer', :sessionDate, :notes, :now, :now)
                """, p);

        // endedAt is null, and it has to be: a log that was just created is OPEN.
        // This is the row `buildRunning` reads as "in session", which is exactly
        // what has happened — the trainer started logging a session.
        return new WorkoutSessionResponse(id.toString(), req.clientId(), req.programId(),
                req.scheduledSessionId(), "trainer", req.sessionDate(), req.notes(),
                now.toEpochMilli(), now.toEpochMilli(), null,
                // Nothing is in a log that was created a moment ago.
                0);
    }

    // ── Get session ───────────────────────────────────────────────────────────

    public WorkoutSessionResponse get(UUID id, UUID trainerId) {
        return toSessionResponse(findOwnedSession(id, trainerId));
    }

    // ── Update session ────────────────────────────────────────────────────────

    @Transactional
    public WorkoutSessionResponse update(UUID id, UUID trainerId, UpdateSessionRequest req) {
        findOwnedSession(id, trainerId);

        var setClauses = new ArrayList<String>();
        var p = new HashMap<String, Object>();
        p.put("id",  id.toString());
        p.put("tid", trainerId.toString());
        setClauses.add("updated_at = NOW()");

        /*
         * Both fields are now conditional, and `notes` becoming conditional is a
         * change of behaviour that had to happen in the same commit as `endedAt`.
         *
         * It used to be written unconditionally, so a request that carried only
         * `endedAt` would have set `notes = NULL` — closing a log would have
         * ERASED the session's notes, which is exactly the trap this file's
         * sibling call in the web half documents about the sync upsert. Nothing
         * clears notes by sending null; a cleared note is an empty string, which
         * is non-null and still clears.
         */
        if (req.notes() != null) { p.put("notes", req.notes()); setClauses.add("notes = :notes"); }

        if (req.endedAt() != null) {
            if (req.endedAt() == 0L) {
                setClauses.add("ended_at = NULL");
            } else {
                p.put("endedAt", Timestamp.from(Instant.ofEpochMilli(req.endedAt())));
                setClauses.add("ended_at = :endedAt");
            }
        }

        jdbc.update("UPDATE workout_session SET " + String.join(", ", setClauses) +
                " WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL", p);

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

    // ── Add set ───────────────────────────────────────────────────────────────

    @Transactional
    public SetLogResponse addSet(UUID workoutId, UUID trainerId, CreateSetRequest req) {
        var session = findOwnedSession(workoutId, trainerId);

        UUID id = UUID.randomUUID();
        Instant now = Instant.now();

        var p = new HashMap<String, Object>();
        p.put("id",        id.toString());
        p.put("workoutId", workoutId.toString());
        p.put("exId",      req.exerciseId());
        p.put("setNumber", req.setNumber());
        p.put("loadKg",    req.loadKg());
        p.put("reps",      req.reps());
        p.put("rpe",       req.rpe());
        p.put("notes",     req.notes());
        p.put("now",       Timestamp.from(now));

        jdbc.update("""
                INSERT INTO set_log (id, workout_session_id, exercise_id, set_number,
                    load_kg, reps, rpe, notes, created_at, updated_at)
                VALUES (:id::uuid, :workoutId::uuid, :exId::uuid, :setNumber,
                    :loadKg, :reps, :rpe, :notes, :now, :now)
                """, p);

        return new SetLogResponse(id.toString(), workoutId.toString(), req.exerciseId(),
                req.setNumber(), req.loadKg(), req.reps(), req.rpe(), req.notes(),
                now.toEpochMilli(), now.toEpochMilli(), str(session.get("session_date")));
    }

    // ── Update set ────────────────────────────────────────────────────────────

    @Transactional
    public SetLogResponse updateSet(UUID workoutId, UUID setId, UUID trainerId, UpdateSetRequest req) {
        var session = findOwnedSession(workoutId, trainerId);

        var setClauses = new ArrayList<String>();
        var p = new HashMap<String, Object>();
        p.put("id",  setId.toString());
        p.put("wid", workoutId.toString());
        p.put("now", Timestamp.from(Instant.now()));
        setClauses.add("updated_at = :now");

        if (req.loadKg() != null) { p.put("loadKg", req.loadKg()); setClauses.add("load_kg = :loadKg"); }
        if (req.reps() != null)   { p.put("reps",   req.reps());   setClauses.add("reps = :reps"); }
        if (req.rpe() != null)    { p.put("rpe",    req.rpe());    setClauses.add("rpe = :rpe"); }
        if (req.notes() != null)  { p.put("notes",  req.notes());  setClauses.add("notes = :notes"); }

        jdbc.update("UPDATE set_log SET " + String.join(", ", setClauses) +
                " WHERE id = :id::uuid AND workout_session_id = :wid::uuid AND deleted_at IS NULL", p);

        var rows = jdbc.queryForList("SELECT " + SET_COLUMNS +
                " FROM set_log WHERE id = :id::uuid AND deleted_at IS NULL",
                Map.of("id", setId.toString()));
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Set not found");
        return toSetResponse(rows.get(0), str(session.get("session_date")));
    }

    // ── Delete set ────────────────────────────────────────────────────────────

    @Transactional
    public void deleteSet(UUID workoutId, UUID setId, UUID trainerId) {
        findOwnedSession(workoutId, trainerId);
        jdbc.update("""
                UPDATE set_log SET deleted_at = NOW(), updated_at = NOW()
                WHERE id = :id::uuid AND workout_session_id = :wid::uuid AND deleted_at IS NULL
                """, Map.of("id", setId.toString(), "wid", workoutId.toString()));
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

    /**
     * Puts an exercise in today's grid.
     *
     * <p>Idempotent on the pair, because the table's unique index is
     * {@code (workout_session_id, exercise_id) WHERE deleted_at IS NULL} and a
     * second POST would otherwise be a 500. Adding an exercise that is already
     * there — including one the trainer removed a moment ago — updates the row
     * and clears {@code removed_at}, which is what "add it back" means and what
     * the trainer just asked for. The upsert names the index's own predicate so
     * Postgres infers the partial index rather than looking for a full one.
     */
    @Transactional
    public WorkoutExerciseResponse addExercise(UUID workoutId, UUID trainerId,
                                               CreateWorkoutExerciseRequest req) {
        findOwnedSession(workoutId, trainerId);
        requireVisibleExercise(req.exerciseId(), trainerId);
        if (req.swappedFromExerciseId() != null && !req.swappedFromExerciseId().isBlank()) {
            requireVisibleExercise(req.swappedFromExerciseId(), trainerId);
        }

        var p = new HashMap<String, Object>();
        p.put("id",          UUID.randomUUID().toString());
        p.put("workoutId",   workoutId.toString());
        p.put("exId",        req.exerciseId());
        p.put("orderIndex",  req.orderIndex() == null ? 0 : req.orderIndex());
        p.put("source",      source(req.source()));
        p.put("swappedFrom", blankToNull(req.swappedFromExerciseId()));
        p.put("targetSets",  req.targetSets());
        p.put("targetReps",  req.targetReps());
        p.put("restSeconds", req.restSeconds());

        var written = jdbc.queryForList("""
                INSERT INTO workout_exercise (id, workout_session_id, exercise_id, order_index,
                    source, swapped_from_exercise_id, target_sets, target_reps, rest_seconds)
                VALUES (:id::uuid, :workoutId::uuid, :exId::uuid, :orderIndex,
                    :source, :swappedFrom::uuid, :targetSets, :targetReps, :restSeconds)
                ON CONFLICT (workout_session_id, exercise_id) WHERE deleted_at IS NULL
                DO UPDATE SET
                    order_index              = EXCLUDED.order_index,
                    source                   = EXCLUDED.source,
                    swapped_from_exercise_id = EXCLUDED.swapped_from_exercise_id,
                    target_sets              = EXCLUDED.target_sets,
                    target_reps              = EXCLUDED.target_reps,
                    rest_seconds             = EXCLUDED.rest_seconds,
                    removed_at               = NULL,
                    updated_at               = NOW()
                RETURNING """ + " " + WORKOUT_EXERCISE_COLUMNS, p);

        return toWorkoutExerciseResponse(written.get(0));
    }

    @Transactional
    public WorkoutExerciseResponse updateExercise(UUID workoutId, UUID rowId, UUID trainerId,
                                                  UpdateWorkoutExerciseRequest req) {
        findOwnedSession(workoutId, trainerId);

        var setClauses = new ArrayList<String>();
        var p = new HashMap<String, Object>();
        p.put("id",  rowId.toString());
        p.put("wid", workoutId.toString());
        setClauses.add("updated_at = NOW()");

        if (req.orderIndex() != null)  { p.put("orderIndex",  req.orderIndex());  setClauses.add("order_index = :orderIndex"); }
        if (req.targetSets() != null)  { p.put("targetSets",  req.targetSets());  setClauses.add("target_sets = :targetSets"); }
        if (req.targetReps() != null)  { p.put("targetReps",  req.targetReps());  setClauses.add("target_reps = :targetReps"); }
        if (req.restSeconds() != null) { p.put("restSeconds", req.restSeconds()); setClauses.add("rest_seconds = :restSeconds"); }
        if (req.removedAt() != null) {
            if (req.removedAt() == 0L) {
                setClauses.add("removed_at = NULL");
            } else {
                p.put("removedAt", Timestamp.from(Instant.ofEpochMilli(req.removedAt())));
                setClauses.add("removed_at = :removedAt");
            }
        }

        int changed = jdbc.update("UPDATE workout_exercise SET " + String.join(", ", setClauses) +
                " WHERE id = :id::uuid AND workout_session_id = :wid::uuid AND deleted_at IS NULL", p);
        if (changed == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Workout exercise not found");

        var rows = jdbc.queryForList("SELECT " + WORKOUT_EXERCISE_COLUMNS +
                " FROM workout_exercise WHERE id = :id::uuid AND deleted_at IS NULL",
                Map.of("id", rowId.toString()));
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Workout exercise not found");
        return toWorkoutExerciseResponse(rows.get(0));
    }

    /**
     * Tombstones the row — the card should never have been there.
     *
     * <p>Not the same verb as taking an exercise out of today, which is
     * {@code removedAt} on the update: that keeps the record that the trainer
     * decided against it, and keeps something for Undo to put back. Soft, like
     * every delete here, so sync can carry the tombstone to the phone.
     */
    @Transactional
    public void deleteExercise(UUID workoutId, UUID rowId, UUID trainerId) {
        findOwnedSession(workoutId, trainerId);
        int changed = jdbc.update("""
                UPDATE workout_exercise SET deleted_at = NOW(), updated_at = NOW()
                WHERE id = :id::uuid AND workout_session_id = :wid::uuid AND deleted_at IS NULL
                """, Map.of("id", rowId.toString(), "wid", workoutId.toString()));
        if (changed == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Workout exercise not found");
    }

    /**
     * The library row has to exist and be readable by this trainer — the seeded
     * library or their own custom. Checked here rather than left to the foreign
     * key, which would answer a mistyped id with a 500 and would not notice
     * another trainer's private exercise at all.
     */
    private void requireVisibleExercise(String exerciseId, UUID trainerId) {
        Boolean visible = jdbc.queryForObject("""
                SELECT EXISTS(
                    SELECT 1 FROM exercise
                    WHERE id = :id::uuid AND deleted_at IS NULL
                      AND (is_custom = false OR trainer_id = :tid::uuid)
                )
                """, Map.of("id", exerciseId, "tid", trainerId.toString()), Boolean.class);
        if (!Boolean.TRUE.equals(visible)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Exercise not found");
        }
    }

    /** 'planned' | 'unplanned'; anything else is 'planned', the column's default. */
    private static String source(String raw) {
        if (raw == null) return "planned";
        return "unplanned".equals(raw.trim().toLowerCase()) ? "unplanned" : "planned";
    }

    private static String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v;
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
