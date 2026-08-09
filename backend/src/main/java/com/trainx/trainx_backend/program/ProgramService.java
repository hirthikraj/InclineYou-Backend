package com.trainx.trainx_backend.program;

import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class ProgramService {

    private final NamedParameterJdbcTemplate jdbc;

    // ── DTOs ──────────────────────────────────────────────────────────────────

    public record CreateProgramRequest(
            @NotBlank String clientId,
            @NotBlank String name,
            String goal,
            Long startDate,
            Long endDate,
            String status
    ) {}

    public record UpdateProgramRequest(
            String name,
            String goal,
            Long startDate,
            Long endDate,
            String status
    ) {}

    public record ProgramExerciseRequest(
            @NotBlank String exerciseId,
            Integer sets,
            Integer reps,
            Integer restSeconds,
            BigDecimal targetLoad,
            String notes,
            Integer dayOfWeek,
            int orderIndex
    ) {}

    public record UpdateProgramExerciseRequest(
            Integer sets,
            Integer reps,
            Integer restSeconds,
            BigDecimal targetLoad,
            String notes,
            Integer dayOfWeek,
            Integer orderIndex
    ) {}

    public record ProgramResponse(
            String id,
            String clientId,
            String templateId,
            String name,
            String goal,
            String startDate,
            String endDate,
            String status,
            long createdAt,
            long updatedAt
    ) {}

    public record ProgramExerciseResponse(
            String id,
            String programId,
            String exerciseId,
            Integer sets,
            Integer reps,
            Integer restSeconds,
            BigDecimal targetLoad,
            String notes,
            Integer dayOfWeek,
            int orderIndex,
            long createdAt,
            long updatedAt
    ) {}

    // ── List ──────────────────────────────────────────────────────────────────

    public List<ProgramResponse> list(UUID trainerId, String clientId) {
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
                "SELECT id::text, client_id::text, template_id::text, name, goal, " +
                "start_date::text, end_date::text, status, created_at, updated_at FROM program WHERE " +
                String.join(" AND ", conditions) + " ORDER BY created_at DESC", p);

        return rows.stream().map(this::toProgramResponse).toList();
    }

    // ── Create ────────────────────────────────────────────────────────────────

    @Transactional
    public ProgramResponse create(UUID trainerId, CreateProgramRequest req) {
        Boolean owned = jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                Map.of("cid", req.clientId(), "tid", trainerId.toString()), Boolean.class);
        if (!Boolean.TRUE.equals(owned)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Client not found");
        }

        UUID id = UUID.randomUUID();
        Instant now = Instant.now();
        String status = req.status() != null && !req.status().isBlank() ? req.status() : "active";
        Date startDate = req.startDate() != null ? new Date(req.startDate()) : null;
        Date endDate   = req.endDate()   != null ? new Date(req.endDate())   : null;

        var p = new HashMap<String, Object>();
        p.put("id",        id.toString());
        p.put("tid",       trainerId.toString());
        p.put("cid",       req.clientId());
        p.put("name",      req.name());
        p.put("goal",      req.goal());
        p.put("startDate", startDate);
        p.put("endDate",   endDate);
        p.put("status",    status);
        p.put("now",       Timestamp.from(now));

        jdbc.update("""
                INSERT INTO program (id, trainer_id, client_id, name, goal, start_date, end_date, status, created_at, updated_at)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :name, :goal, :startDate, :endDate, :status, :now, :now)
                """, p);

        return new ProgramResponse(id.toString(), req.clientId(), null, req.name(), req.goal(),
                startDate != null ? startDate.toString() : null,
                endDate   != null ? endDate.toString()   : null,
                status, now.toEpochMilli(), now.toEpochMilli());
    }

    // ── Get ───────────────────────────────────────────────────────────────────

    public ProgramResponse get(UUID id, UUID trainerId) {
        return toProgramResponse(findOwned(id, trainerId));
    }

    // ── Update ────────────────────────────────────────────────────────────────

    @Transactional
    public ProgramResponse update(UUID id, UUID trainerId, UpdateProgramRequest req) {
        findOwned(id, trainerId);

        var sets = new ArrayList<String>();
        var p = new HashMap<String, Object>();
        p.put("id",  id.toString());
        p.put("tid", trainerId.toString());
        p.put("now", Timestamp.from(Instant.now()));
        sets.add("updated_at = :now");

        if (req.name() != null)      { p.put("name",      req.name());                       sets.add("name = :name"); }
        if (req.goal() != null)      { p.put("goal",      req.goal());                       sets.add("goal = :goal"); }
        if (req.startDate() != null) { p.put("startDate", new Date(req.startDate()));         sets.add("start_date = :startDate"); }
        if (req.endDate() != null)   { p.put("endDate",   new Date(req.endDate()));           sets.add("end_date = :endDate"); }
        if (req.status() != null)    { p.put("status",    req.status());                      sets.add("status = :status"); }

        jdbc.update("UPDATE program SET " + String.join(", ", sets) +
                    " WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL", p);

        return toProgramResponse(findOwned(id, trainerId));
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    @Transactional
    public void delete(UUID id, UUID trainerId) {
        findOwned(id, trainerId);
        jdbc.update("""
                UPDATE program SET deleted_at = NOW(), updated_at = NOW()
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", id.toString(), "tid", trainerId.toString()));
    }

    // ── List exercises ────────────────────────────────────────────────────────

    public List<ProgramExerciseResponse> listExercises(UUID programId, UUID trainerId) {
        findOwned(programId, trainerId);
        var rows = jdbc.queryForList("""
                SELECT id::text, program_id::text, exercise_id::text, sets, reps, rest_seconds,
                       target_load, notes, day_of_week, order_index, created_at, updated_at
                FROM program_exercise
                WHERE program_id = :pid::uuid AND deleted_at IS NULL
                ORDER BY COALESCE(day_of_week, 999), order_index ASC
                """, Map.of("pid", programId.toString()));

        return rows.stream().map(this::toExerciseResponse).toList();
    }

    // ── Add exercise ──────────────────────────────────────────────────────────

    @Transactional
    public ProgramExerciseResponse addExercise(UUID programId, UUID trainerId, ProgramExerciseRequest req) {
        findOwned(programId, trainerId);

        UUID id = UUID.randomUUID();
        Instant now = Instant.now();

        var p = new HashMap<String, Object>();
        p.put("id",          id.toString());
        p.put("programId",   programId.toString());
        p.put("exerciseId",  req.exerciseId());
        p.put("sets",        req.sets());
        p.put("reps",        req.reps());
        p.put("restSeconds", req.restSeconds());
        p.put("targetLoad",  req.targetLoad());
        p.put("notes",       req.notes());
        p.put("dayOfWeek",   req.dayOfWeek());
        p.put("orderIndex",  req.orderIndex());
        p.put("now",         Timestamp.from(now));

        jdbc.update("""
                INSERT INTO program_exercise (id, program_id, exercise_id, sets, reps, rest_seconds,
                    target_load, notes, day_of_week, order_index, created_at, updated_at)
                VALUES (:id::uuid, :programId::uuid, :exerciseId::uuid, :sets, :reps, :restSeconds,
                    :targetLoad, :notes, :dayOfWeek, :orderIndex, :now, :now)
                """, p);

        return new ProgramExerciseResponse(id.toString(), programId.toString(), req.exerciseId(),
                req.sets(), req.reps(), req.restSeconds(), req.targetLoad(), req.notes(),
                req.dayOfWeek(), req.orderIndex(), now.toEpochMilli(), now.toEpochMilli());
    }

    // ── Update exercise ───────────────────────────────────────────────────────

    @Transactional
    public ProgramExerciseResponse updateExercise(UUID programId, UUID exId, UUID trainerId,
                                                   UpdateProgramExerciseRequest req) {
        findOwned(programId, trainerId);

        var sets = new ArrayList<String>();
        var p = new HashMap<String, Object>();
        p.put("id",        exId.toString());
        p.put("programId", programId.toString());
        p.put("now",       Timestamp.from(Instant.now()));
        sets.add("updated_at = :now");

        if (req.sets() != null)        { p.put("sets",        req.sets());        sets.add("sets = :sets"); }
        if (req.reps() != null)        { p.put("reps",        req.reps());        sets.add("reps = :reps"); }
        if (req.restSeconds() != null) { p.put("restSeconds", req.restSeconds()); sets.add("rest_seconds = :restSeconds"); }
        if (req.targetLoad() != null)  { p.put("targetLoad",  req.targetLoad());  sets.add("target_load = :targetLoad"); }
        if (req.notes() != null)       { p.put("notes",       req.notes());       sets.add("notes = :notes"); }
        if (req.dayOfWeek() != null)   { p.put("dayOfWeek",   req.dayOfWeek());   sets.add("day_of_week = :dayOfWeek"); }
        if (req.orderIndex() != null)  { p.put("orderIndex",  req.orderIndex());  sets.add("order_index = :orderIndex"); }

        jdbc.update("UPDATE program_exercise SET " + String.join(", ", sets) +
                    " WHERE id = :id::uuid AND program_id = :programId::uuid AND deleted_at IS NULL", p);

        var rows = jdbc.queryForList("""
                SELECT id::text, program_id::text, exercise_id::text, sets, reps, rest_seconds,
                       target_load, notes, day_of_week, order_index, created_at, updated_at
                FROM program_exercise WHERE id = :id::uuid AND deleted_at IS NULL
                """, Map.of("id", exId.toString()));
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Program exercise not found");
        return toExerciseResponse(rows.get(0));
    }

    // ── Remove exercise ───────────────────────────────────────────────────────

    @Transactional
    public void removeExercise(UUID programId, UUID exId, UUID trainerId) {
        findOwned(programId, trainerId);
        jdbc.update("""
                UPDATE program_exercise SET deleted_at = NOW(), updated_at = NOW()
                WHERE id = :id::uuid AND program_id = :programId::uuid AND deleted_at IS NULL
                """, Map.of("id", exId.toString(), "programId", programId.toString()));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Map<String, Object> findOwned(UUID id, UUID trainerId) {
        var rows = jdbc.queryForList(
                "SELECT id::text, client_id::text, template_id::text, name, goal, " +
                "start_date::text, end_date::text, status, created_at, updated_at FROM program " +
                "WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL",
                Map.of("id", id.toString(), "tid", trainerId.toString()));
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Program not found");
        return rows.get(0);
    }

    private ProgramResponse toProgramResponse(Map<String, Object> r) {
        return new ProgramResponse(
                str(r.get("id")),
                str(r.get("client_id")),
                str(r.get("template_id")),
                str(r.get("name")),
                str(r.get("goal")),
                str(r.get("start_date")),
                str(r.get("end_date")),
                str(r.get("status")),
                toEpochMilli(r.get("created_at")),
                toEpochMilli(r.get("updated_at")));
    }

    private ProgramExerciseResponse toExerciseResponse(Map<String, Object> r) {
        Object tl = r.get("target_load");
        BigDecimal targetLoad = tl instanceof BigDecimal bd ? bd
                : (tl != null ? new BigDecimal(tl.toString()) : null);
        Object oi = r.get("order_index");
        int orderIndex = oi instanceof Integer i ? i : (oi != null ? Integer.parseInt(oi.toString()) : 0);

        return new ProgramExerciseResponse(
                str(r.get("id")),
                str(r.get("program_id")),
                str(r.get("exercise_id")),
                (Integer) r.get("sets"),
                (Integer) r.get("reps"),
                (Integer) r.get("rest_seconds"),
                targetLoad,
                str(r.get("notes")),
                (Integer) r.get("day_of_week"),
                orderIndex,
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
