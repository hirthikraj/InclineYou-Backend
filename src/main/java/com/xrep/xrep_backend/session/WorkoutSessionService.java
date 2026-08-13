package com.xrep.xrep_backend.session;

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

    public record UpdateSessionRequest(String notes) {}

    public record WorkoutSessionResponse(
            String id,
            String clientId,
            String programId,
            String scheduledSessionId,
            String loggedBy,
            String sessionDate,
            String notes,
            long createdAt,
            long updatedAt
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
                "SELECT id::text, client_id::text, program_id::text, scheduled_session_id::text, " +
                "logged_by, session_date::text, notes, created_at, updated_at " +
                "FROM workout_session WHERE " + String.join(" AND ", conditions) +
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

        return new WorkoutSessionResponse(id.toString(), req.clientId(), req.programId(),
                req.scheduledSessionId(), "trainer", req.sessionDate(), req.notes(),
                now.toEpochMilli(), now.toEpochMilli());
    }

    // ── Get session ───────────────────────────────────────────────────────────

    public WorkoutSessionResponse get(UUID id, UUID trainerId) {
        return toSessionResponse(findOwnedSession(id, trainerId));
    }

    // ── Update session ────────────────────────────────────────────────────────

    @Transactional
    public WorkoutSessionResponse update(UUID id, UUID trainerId, UpdateSessionRequest req) {
        findOwnedSession(id, trainerId);
        jdbc.update("""
                UPDATE workout_session SET notes = :notes, updated_at = NOW()
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", id.toString(), "tid", trainerId.toString(), "notes", req.notes()));
        return toSessionResponse(findOwnedSession(id, trainerId));
    }

    // ── List sets ─────────────────────────────────────────────────────────────

    public List<SetLogResponse> listSets(UUID workoutId, UUID trainerId) {
        findOwnedSession(workoutId, trainerId);
        var rows = jdbc.queryForList("""
                SELECT id::text, workout_session_id::text, exercise_id::text,
                       set_number, load_kg, reps, rpe, notes, created_at, updated_at
                FROM set_log
                WHERE workout_session_id = :wid::uuid AND deleted_at IS NULL
                ORDER BY exercise_id, set_number ASC
                """, Map.of("wid", workoutId.toString()));
        return rows.stream().map(this::toSetResponse).toList();
    }

    // ── Add set ───────────────────────────────────────────────────────────────

    @Transactional
    public SetLogResponse addSet(UUID workoutId, UUID trainerId, CreateSetRequest req) {
        findOwnedSession(workoutId, trainerId);

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
                now.toEpochMilli(), now.toEpochMilli());
    }

    // ── Update set ────────────────────────────────────────────────────────────

    @Transactional
    public SetLogResponse updateSet(UUID workoutId, UUID setId, UUID trainerId, UpdateSetRequest req) {
        findOwnedSession(workoutId, trainerId);

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

        var rows = jdbc.queryForList("""
                SELECT id::text, workout_session_id::text, exercise_id::text,
                       set_number, load_kg, reps, rpe, notes, created_at, updated_at
                FROM set_log WHERE id = :id::uuid AND deleted_at IS NULL
                """, Map.of("id", setId.toString()));
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Set not found");
        return toSetResponse(rows.get(0));
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

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Map<String, Object> findOwnedSession(UUID id, UUID trainerId) {
        var rows = jdbc.queryForList(
                "SELECT id::text, client_id::text, program_id::text, scheduled_session_id::text, " +
                "logged_by, session_date::text, notes, created_at, updated_at " +
                "FROM workout_session WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL",
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
                toEpochMilli(r.get("updated_at")));
    }

    private SetLogResponse toSetResponse(Map<String, Object> r) {
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
                toEpochMilli(r.get("updated_at")));
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
