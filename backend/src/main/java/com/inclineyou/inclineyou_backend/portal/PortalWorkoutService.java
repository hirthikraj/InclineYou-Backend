package com.inclineyou.inclineyou_backend.portal;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

import static com.inclineyou.inclineyou_backend.portal.PortalReadService.*;

/**
 * Module 11b · a client logging their own workout — start, set, swap, finish.
 *
 * <p>The log is the SAME {@code workout_session} / {@code workout_exercise} /
 * {@code set_log} rows the trainer's console and the phone write, so a session
 * the trainer opened and one the client opened are one log. Every insert sets
 * {@code tenant_id} from the resolved client row (V17 says why), and every write
 * checks the workout is the resolved client's before it touches anything.
 *
 * <p><b>Finishing does not move money.</b> It closes the log, stores how it felt
 * and may mint a milestone. The booked session stays {@code scheduled} for the
 * trainer to mark — the product owner's decision, and the rule the phone's client
 * sync already keeps.
 */
@Service
@RequiredArgsConstructor
public class PortalWorkoutService {

    /** Every Nth finished workout is a milestone. */
    static final int MILESTONE_EVERY = 25;
    private static final Set<String> EFFORTS = Set.of("easy", "right", "hard");
    private static final int MAX_NOTE = 1000;

    private final NamedParameterJdbcTemplate jdbc;
    private final PortalReadService reads;
    private final com.inclineyou.inclineyou_backend.notification.ClientNotificationService clientBell;

    public record StartRequest(String sessionId) {}

    public record SetRequest(String exerciseId, Integer setNumber, BigDecimal loadKg, Integer reps) {}

    public record SwapRequest(String exerciseId, String toExerciseId) {}

    public record FinishRequest(String effort, String note) {}

    /** The start's answer, with whether it created (201) or resumed (200). */
    public record Started(boolean created, Workout workout) {}

    public record SavedSet(boolean created, SetRow set) {}

    // ── Start ─────────────────────────────────────────────────────────────────

    /**
     * RESUME BEFORE CREATE. An open log for this session — or, with no session,
     * one of today's with no session — is returned as it stands, whoever opened
     * it. Otherwise a new log is made against the live plan and seeded with the
     * plan's rows for the session's day (by the session's slot), or — with no
     * session — for today's weekday. A session that is not the client's is a 404;
     * a cancelled one is refused.
     */
    @Transactional
    public Started start(PortalScope.Me me, StartRequest req) {
        var p = params(me);
        String sessionId = req == null || req.sessionId() == null || req.sessionId().isBlank() ? null : req.sessionId().strip();
        LocalDate date = LocalDate.now(IST);
        Integer slot = null;
        if (sessionId != null) {
            try {
                p.put("sid", UUID.fromString(sessionId).toString());
            } catch (IllegalArgumentException e) {
                throw PortalRuleException.notFound("No such session.");
            }
            var sessions = jdbc.queryForList("""
                    SELECT status, scheduled_at, template_day FROM scheduled_session
                    WHERE id = :sid::uuid AND client_id = :cid::uuid AND deleted_at IS NULL
                    """, p);
            if (sessions.isEmpty()) throw PortalRuleException.notFound("No such session.");
            var s = sessions.getFirst();
            if ("cancelled".equals(s(s.get("status")))) {
                throw new PortalRuleException(HttpStatus.CONFLICT, "SESSION_CANCELLED",
                        "That session was cancelled, so there is nothing to log against it.");
            }
            date = LocalDate.ofInstant(Instant.ofEpochMilli(ms(s.get("scheduled_at"))), IST);
            slot = i(s.get("template_day"));
        }
        p.put("date", java.sql.Date.valueOf(date));

        var open = jdbc.queryForList(sessionId != null ? """
                SELECT id::text FROM workout_session
                WHERE client_id = :cid::uuid AND scheduled_session_id = :sid::uuid
                  AND ended_at IS NULL AND deleted_at IS NULL
                ORDER BY created_at DESC, id LIMIT 1
                """ : """
                SELECT id::text FROM workout_session
                WHERE client_id = :cid::uuid AND scheduled_session_id IS NULL AND session_date = :date
                  AND ended_at IS NULL AND deleted_at IS NULL
                ORDER BY created_at DESC, id LIMIT 1
                """, p);
        if (!open.isEmpty()) return new Started(false, reads.workout(me, UUID.fromString(s(open.getFirst().get("id")))));

        var programs = jdbc.queryForList("""
                SELECT id::text, schedule::text AS schedule FROM program
                WHERE client_id = :cid::uuid AND status = 'active' AND deleted_at IS NULL
                ORDER BY created_at DESC, id LIMIT 1
                """, p);
        String programId = programs.isEmpty() ? null : s(programs.getFirst().get("id"));

        UUID id = UUID.randomUUID();
        p.put("wid", id.toString());
        p.put("pid", programId);
        p.put("tenant", me.tenantId().toString());
        p.put("now", Timestamp.from(Instant.now()));
        jdbc.update("""
                INSERT INTO workout_session (id, trainer_id, client_id, program_id, scheduled_session_id, logged_by,
                    session_date, created_at, updated_at, tenant_id)
                VALUES (:wid::uuid, :tid::uuid, :cid::uuid, :pid::uuid, :sid::uuid, 'client', :date, :now, :now,
                    :tenant::uuid)
                """, withNull(p, "sid"));

        if (programId != null) {
            // The plan's rows for the day: by the session's slot where there is one, else today's weekday.
            Integer weekday = date.getDayOfWeek().getValue();
            if (slot != null) {
                weekday = slot;
                for (var e : slotMap(s(programs.getFirst().get("schedule"))).entrySet()) {
                    if (e.getValue().equals(slot)) weekday = e.getKey();
                }
            }
            p.put("dow", weekday);
            jdbc.update("""
                    INSERT INTO workout_exercise (workout_session_id, exercise_id, order_index, source,
                        target_sets, target_reps, rest_seconds, created_at, updated_at, tenant_id)
                    SELECT :wid::uuid, pe.exercise_id, row_number() OVER (ORDER BY pe.order_index, pe.id) - 1,
                           'program', pe.sets, pe.reps, pe.rest_seconds, :now, :now, :tenant::uuid
                    FROM (SELECT DISTINCT ON (exercise_id) * FROM program_exercise
                          WHERE program_id = :pid::uuid AND deleted_at IS NULL AND day_of_week = :dow
                          ORDER BY exercise_id, COALESCE(week, 1), order_index) pe
                    """, p);
        }
        return new Started(true, reads.workout(me, id));
    }

    // ── Sets ──────────────────────────────────────────────────────────────────

    /**
     * UPSERT on (workout, movement, set number), so tapping twice cannot make two
     * sets. The movement must be a live card in this workout — the mock accepted
     * any library movement, and a set against something not in the log is a set
     * the trainer's view cannot place. A closed workout is refused.
     */
    @Transactional
    public SavedSet saveSet(PortalScope.Me me, UUID workoutId, SetRequest req) {
        requireOpen(me, workoutId);
        if (req == null || req.exerciseId() == null) throw PortalRuleException.validation("exerciseId: required");
        String eid = uuid(req.exerciseId(), "exerciseId");
        int n = req.setNumber() == null ? 0 : req.setNumber();
        if (n < 1 || n > 50) throw PortalRuleException.validation("setNumber: 1 to 50");
        if (req.loadKg() != null && (req.loadKg().signum() < 0 || req.loadKg().compareTo(new BigDecimal("1000")) > 0)) {
            throw PortalRuleException.validation("loadKg: between 0 and 1000");
        }
        if (req.reps() != null && (req.reps() < 0 || req.reps() > 1000)) throw PortalRuleException.validation("reps: 0 to 1000");

        var p = params(me);
        p.put("wid", workoutId.toString());
        p.put("eid", eid);
        p.put("n", n);
        p.put("load", req.loadKg());
        p.put("reps", req.reps());
        p.put("tenant", me.tenantId().toString());
        Boolean carded = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM workout_exercise WHERE workout_session_id = :wid::uuid
                               AND exercise_id = :eid::uuid AND removed_at IS NULL AND deleted_at IS NULL)
                """, p, Boolean.class);
        if (!Boolean.TRUE.equals(carded)) throw PortalRuleException.validation("exerciseId: not in this workout");

        var existing = jdbc.queryForList("""
                SELECT id::text FROM set_log WHERE workout_session_id = :wid::uuid AND exercise_id = :eid::uuid
                  AND set_number = :n AND deleted_at IS NULL
                ORDER BY created_at, id LIMIT 1 FOR UPDATE
                """, p);
        String id;
        boolean created = existing.isEmpty();
        if (created) {
            id = UUID.randomUUID().toString();
            p.put("id", id);
            jdbc.update("""
                    INSERT INTO set_log (id, workout_session_id, exercise_id, set_number, load_kg, reps, tenant_id)
                    VALUES (:id::uuid, :wid::uuid, :eid::uuid, :n, CAST(:load AS numeric), CAST(:reps AS integer), :tenant::uuid)
                    """, p);
        } else {
            id = s(existing.getFirst().get("id"));
            p.put("id", id);
            jdbc.update("""
                    UPDATE set_log SET load_kg = CAST(:load AS numeric), reps = CAST(:reps AS integer), updated_at = now()
                    WHERE id = :id::uuid
                    """, p);
        }
        touch(workoutId);
        var row = jdbc.queryForList("SELECT id::text, set_number, load_kg, reps, rpe FROM set_log WHERE id = :id::uuid", p).getFirst();
        return new SavedSet(created, new SetRow(s(row.get("id")), n(row.get("set_number")), dec(row.get("load_kg")),
                i(row.get("reps")), dec(row.get("rpe"))));
    }

    // ── Swap ──────────────────────────────────────────────────────────────────

    /**
     * Only to the alternative the TRAINER approved on the plan's row for this
     * movement, and only before any set of it has been logged — a half-done
     * movement swapped mid-way is two half-logged movements.
     */
    @Transactional
    public Workout swap(PortalScope.Me me, UUID workoutId, SwapRequest req) {
        var w = requireOpen(me, workoutId);
        if (req == null) throw PortalRuleException.validation("exerciseId: required");
        String from = uuid(req.exerciseId(), "exerciseId");
        String to = uuid(req.toExerciseId(), "toExerciseId");
        var p = params(me);
        p.put("wid", workoutId.toString());
        p.put("from", from);
        p.put("to", to);
        var card = jdbc.queryForList("""
                SELECT id::text FROM workout_exercise WHERE workout_session_id = :wid::uuid AND exercise_id = :from::uuid
                  AND removed_at IS NULL AND deleted_at IS NULL
                """, p);
        if (card.isEmpty()) throw PortalRuleException.notFound("That movement is not in this workout.");

        Map<String, Object> planRow = null;
        if (w.get("program_id") != null) {
            p.put("pid", s(w.get("program_id")));
            var rows = jdbc.queryForList("""
                    SELECT alt_exercise_id::text AS alt, reps FROM program_exercise
                    WHERE program_id = :pid::uuid AND exercise_id = :from::uuid AND deleted_at IS NULL
                      AND alt_exercise_id = :to::uuid
                    LIMIT 1
                    """, p);
            planRow = rows.isEmpty() ? null : rows.getFirst();
        }
        if (planRow == null) {
            throw new PortalRuleException(HttpStatus.UNPROCESSABLE_CONTENT, "NOT_APPROVED",
                    "Your trainer has not set that as an alternative for this movement.");
        }
        Boolean started = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM set_log WHERE workout_session_id = :wid::uuid
                               AND exercise_id = :from::uuid AND deleted_at IS NULL)
                """, p, Boolean.class);
        if (Boolean.TRUE.equals(started)) {
            throw new PortalRuleException(HttpStatus.CONFLICT, "ALREADY_STARTED",
                    "You've already logged a set of this one, so it can't be swapped now.");
        }
        Boolean present = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM workout_exercise WHERE workout_session_id = :wid::uuid
                               AND exercise_id = :to::uuid AND deleted_at IS NULL)
                """, p, Boolean.class);
        if (Boolean.TRUE.equals(present)) {
            throw new PortalRuleException(HttpStatus.CONFLICT, "ALREADY_IN_WORKOUT",
                    "That alternative is already in today's workout.");
        }
        p.put("card", s(card.getFirst().get("id")));
        p.put("reps", i(planRow.get("reps")));
        jdbc.update("""
                UPDATE workout_exercise SET swapped_from_exercise_id = :from::uuid, exercise_id = :to::uuid,
                    target_reps = CAST(:reps AS integer), updated_at = now()
                WHERE id = :card::uuid
                """, p);
        touch(workoutId);
        return reads.workout(me, workoutId);
    }

    // ── Finish ────────────────────────────────────────────────────────────────

    /**
     * IDEMPOTENT. Only the first call closes the log; every call upserts the
     * feedback it carries. The session is NOT marked and no pack is charged (the
     * class note). On the call that closes it, every {@link #MILESTONE_EVERY}th
     * finished workout mints a milestone — a retry cannot mint it twice.
     */
    @Transactional
    public Workout finish(PortalScope.Me me, UUID workoutId, FinishRequest req) {
        var w = loadOwned(me, workoutId);
        String effort = req == null || req.effort() == null || req.effort().isBlank() ? null : req.effort().strip();
        if (effort != null && !EFFORTS.contains(effort)) throw PortalRuleException.validation("effort: easy, right or hard");
        String note = req == null || req.note() == null || req.note().isBlank() ? null : req.note().strip();
        if (note != null && note.length() > MAX_NOTE) throw PortalRuleException.validation("note: at most " + MAX_NOTE + " characters");

        var p = params(me);
        p.put("wid", workoutId.toString());
        p.put("tenant", me.tenantId().toString());
        if (w.get("ended_at") == null) {
            jdbc.update("UPDATE workout_session SET ended_at = now(), updated_at = now() WHERE id = :wid::uuid", p);
            maybeMilestone(me);
        }
        if (effort != null || note != null) {
            p.put("effort", effort);
            p.put("note", note);
            jdbc.update("""
                    INSERT INTO workout_feedback (workout_session_id, client_id, effort, note, at, tenant_id)
                    VALUES (:wid::uuid, :cid::uuid, :effort, :note, now(), :tenant::uuid)
                    ON CONFLICT (workout_session_id) DO UPDATE
                        SET effort = COALESCE(EXCLUDED.effort, workout_feedback.effort),
                            note = COALESCE(EXCLUDED.note, workout_feedback.note),
                            at = now(), deleted_at = NULL
                    """, p);
        }
        return reads.workout(me, workoutId);
    }

    /** "25th session with Asha" on every 25th finished workout. {@code uq_milestone_once} absorbs a retry. */
    private void maybeMilestone(PortalScope.Me me) {
        var p = params(me);
        Integer finished = jdbc.queryForObject("""
                SELECT count(*) FROM workout_session WHERE client_id = :cid::uuid AND ended_at IS NOT NULL AND deleted_at IS NULL
                """, p, Integer.class);
        if (finished == null || finished == 0 || finished % MILESTONE_EVERY != 0) return;
        String trainer = jdbc.queryForObject("SELECT name FROM trainer WHERE id = :tid::uuid", p, String.class);
        String first = trainer == null ? "your trainer" : trainer.strip().split("\\s+")[0];
        p.put("label", ordinal(finished) + " session with " + first);
        p.put("value", finished);
        p.put("tenant", me.tenantId().toString());
        int minted = jdbc.update("""
                INSERT INTO milestone (client_id, kind, label, value, tenant_id)
                VALUES (:cid::uuid, 'sessions', :label, :value, :tenant::uuid)
                ON CONFLICT (client_id, kind, value) WHERE deleted_at IS NULL DO NOTHING
                """, p);
        // V18 · the celebration is a moment and the feed is the record — gated by `personalBest`.
        if (minted > 0) clientBell.mint(me.clientId(), "best", null, null, (String) p.get("label"));
    }

    static String ordinal(int n) {
        int mod100 = n % 100;
        String suffix = (mod100 >= 11 && mod100 <= 13) ? "th"
                : switch (n % 10) { case 1 -> "st"; case 2 -> "nd"; case 3 -> "rd"; default -> "th"; };
        return n + suffix;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Map<String, Object> loadOwned(PortalScope.Me me, UUID workoutId) {
        var p = params(me);
        p.put("wid", workoutId.toString());
        var rows = jdbc.queryForList("""
                SELECT id::text, ended_at, program_id::text AS program_id FROM workout_session
                WHERE id = :wid::uuid AND client_id = :cid::uuid AND deleted_at IS NULL
                FOR UPDATE
                """, p);
        if (rows.isEmpty()) throw PortalRuleException.notFound("No such workout.");
        return rows.getFirst();
    }

    private Map<String, Object> requireOpen(PortalScope.Me me, UUID workoutId) {
        var w = loadOwned(me, workoutId);
        if (w.get("ended_at") != null) {
            throw new PortalRuleException(HttpStatus.CONFLICT, "WORKOUT_CLOSED", "That workout is finished.");
        }
        return w;
    }

    /** A set or a swap is a change to the log: bump it so the phone's next pull carries it. */
    private void touch(UUID workoutId) {
        jdbc.update("UPDATE workout_session SET updated_at = now() WHERE id = :wid::uuid", Map.of("wid", workoutId.toString()));
    }

    private static String uuid(String raw, String field) {
        try {
            return UUID.fromString(raw.strip()).toString();
        } catch (Exception e) {
            throw PortalRuleException.validation(field + ": not an id");
        }
    }

    private static Map<String, Object> withNull(Map<String, Object> p, String key) {
        p.putIfAbsent(key, null);
        return p;
    }
}
