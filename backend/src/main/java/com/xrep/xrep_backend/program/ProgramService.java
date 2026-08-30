package com.xrep.xrep_backend.program;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.xrep.xrep_backend.template.TemplateService;
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
    private final TemplateService templates;

    /**
     * `program.schedule` and `program_exercise.set_detail` are both jsonb
     * written by {@link TemplateService} through a SNAKE_CASE mapper, so
     * reading them back needs the same one. See the note on that field.
     */
    private static final ObjectMapper STORE = new ObjectMapper()
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);

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
            /** V20. Which week of the program. Null reads as week 1. */
            Integer week,
            int orderIndex,
            /**
             * V25's hold — "3 x 45s" — carried instead of reps. The column has
             * existed since V25 and `apply` has copied it since V25; this record
             * had no field for it, so a timed exercise added to a client's plan
             * over REST arrived with no prescription at all.
             */
            Integer durationSeconds,
            /* V31 — see the migration for what each one costs a build that
             * predates it. All four nullable, all four appended last. */
            String tempo,
            String altExerciseId,
            String groupId,
            List<TemplateService.SetDetail> setDetail
    ) {}

    public record UpdateProgramExerciseRequest(
            Integer sets,
            Integer reps,
            Integer restSeconds,
            BigDecimal targetLoad,
            String notes,
            Integer dayOfWeek,
            Integer week,
            Integer orderIndex,
            Integer durationSeconds,
            String tempo,
            String altExerciseId,
            String groupId,
            List<TemplateService.SetDetail> setDetail
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
            Integer week,
            int orderIndex,
            long createdAt,
            long updatedAt,
            /* Appended last, per the schema law. */
            Integer durationSeconds,
            String tempo,
            String altExerciseId,
            String groupId,
            List<TemplateService.SetDetail> setDetail
    ) {}

    /**
     * What a resync moved. Counts rather than rows, because the caller's next
     * act is to re-read the plan and the numbers are what the confirmation says.
     */
    public record ResyncResult(
            String programId,
            String templateId,
            int removed,
            int added
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
                       target_load, notes, day_of_week, week, order_index, created_at, updated_at,
                       duration_seconds, tempo, alt_exercise_id::text, group_id::text,
                       set_detail::text AS set_detail
                FROM program_exercise
                WHERE program_id = :pid::uuid AND deleted_at IS NULL
                ORDER BY COALESCE(week, 1), COALESCE(day_of_week, 999), order_index ASC
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
        // An older build posts no week at all; that request means week 1, which
        // is the only week it knows how to draw.
        Integer week = req.week() != null ? req.week() : 1;
        p.put("week",        week);
        p.put("orderIndex",  req.orderIndex());
        p.put("durationSeconds", req.durationSeconds());
        p.put("tempo",           req.tempo());
        p.put("altExerciseId",   req.altExerciseId());
        p.put("groupId",         req.groupId());
        p.put("setDetail",       toJson(req.setDetail()));
        p.put("now",         Timestamp.from(now));

        jdbc.update("""
                INSERT INTO program_exercise (id, program_id, exercise_id, sets, reps, rest_seconds,
                    target_load, notes, day_of_week, week, order_index, duration_seconds, tempo,
                    alt_exercise_id, group_id, set_detail, created_at, updated_at)
                VALUES (:id::uuid, :programId::uuid, :exerciseId::uuid, :sets, :reps, :restSeconds,
                    :targetLoad, :notes, :dayOfWeek, :week, :orderIndex, :durationSeconds, :tempo,
                    :altExerciseId::uuid, :groupId::uuid, CAST(:setDetail AS jsonb), :now, :now)
                """, p);

        return new ProgramExerciseResponse(id.toString(), programId.toString(), req.exerciseId(),
                req.sets(), req.reps(), req.restSeconds(), req.targetLoad(), req.notes(),
                req.dayOfWeek(), week, req.orderIndex(), now.toEpochMilli(), now.toEpochMilli(),
                req.durationSeconds(), req.tempo(), req.altExerciseId(), req.groupId(), req.setDetail());
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
        if (req.week() != null)        { p.put("week",        req.week());        sets.add("week = :week"); }
        if (req.orderIndex() != null)  { p.put("orderIndex",  req.orderIndex());  sets.add("order_index = :orderIndex"); }
        if (req.durationSeconds() != null) { p.put("durationSeconds", req.durationSeconds()); sets.add("duration_seconds = :durationSeconds"); }
        if (req.tempo() != null)       { p.put("tempo",       req.tempo());       sets.add("tempo = :tempo"); }
        // Both of these are how a row is UNSET as well as set, so an empty
        // string is the clear rather than a second route. `alt_exercise_id`
        // takes a uuid, so the cast has to see NULL and not "".
        if (req.altExerciseId() != null) {
            p.put("altExerciseId", req.altExerciseId().isBlank() ? null : req.altExerciseId());
            sets.add("alt_exercise_id = :altExerciseId::uuid");
        }
        if (req.groupId() != null) {
            p.put("groupId", req.groupId().isBlank() ? null : req.groupId());
            sets.add("group_id = :groupId::uuid");
        }
        if (req.setDetail() != null) {
            // An empty list means "these sets agree again" — back to the scalar
            // `sets` and `reps`, which is the shape an old build reads right.
            p.put("setDetail", req.setDetail().isEmpty() ? null : toJson(req.setDetail()));
            sets.add("set_detail = CAST(:setDetail AS jsonb)");
        }

        jdbc.update("UPDATE program_exercise SET " + String.join(", ", sets) +
                    " WHERE id = :id::uuid AND program_id = :programId::uuid AND deleted_at IS NULL", p);

        var rows = jdbc.queryForList("""
                SELECT id::text, program_id::text, exercise_id::text, sets, reps, rest_seconds,
                       target_load, notes, day_of_week, week, order_index, created_at, updated_at,
                       duration_seconds, tempo, alt_exercise_id::text, group_id::text,
                       set_detail::text AS set_detail
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
                (Integer) r.get("week"),
                orderIndex,
                toEpochMilli(r.get("created_at")),
                toEpochMilli(r.get("updated_at")),
                (Integer) r.get("duration_seconds"),
                str(r.get("tempo")),
                str(r.get("alt_exercise_id")),
                str(r.get("group_id")),
                readSetDetail(str(r.get("set_detail"))));
    }

    // ── Resync — push a blueprint change onto one client's copy ───────────────

    /**
     * The one way a template edit reaches a client who is already on it.
     *
     * The two tables are two tables precisely so this does NOT happen by itself:
     * `apply` snapshots, and editing the blueprint afterwards changes the
     * blueprint and nothing else. That is what makes duplicate-and-tweak safe
     * with six clients on the original. So this is a route the trainer presses,
     * on one program at a time, having been told what it will do.
     *
     * <p>Three things about what it touches, because the boundary is the whole
     * design:
     *
     * <ul>
     *   <li><b>The client's SCHEDULE is kept, not re-asked.</b> The weekday and
     *       time each ordinal slot landed on are the client's, chosen once at
     *       assign time, and a blueprint edit is not a reason to move somebody's
     *       Tuesday. The stored `program.schedule` is replayed through the same
     *       translation `apply` runs. A blueprint that has GROWN a day since —
     *       three days a week where the client was scheduled for two — is a 400
     *       naming the mismatch, because inventing a weekday for the new day is
     *       exactly the invention the count-match rule exists to refuse.</li>
     *   <li><b>History is not touched.</b> `workout_session`, `set_log` and
     *       `scheduled_session` key on the program, the exercise and the client,
     *       never on a `program_exercise` row id. Every set this client has ever
     *       logged reads back identically afterwards. What changes is the PLAN
     *       from here on, which is what was asked for.</li>
     *   <li><b>The old rows are tombstoned, not deleted.</b> Soft delete, like
     *       every other removal in this schema, so the sync envelope can tell
     *       the phone they are gone.</li>
     * </ul>
     */
    @Transactional
    public ResyncResult resync(UUID programId, UUID trainerId) {
        var program = findOwned(programId, trainerId);
        String templateId = str(program.get("template_id"));
        if (templateId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "This program was written from scratch, not from a template — there is nothing to pull from.");
        }

        var blueprint = templates.blueprintOf(UUID.fromString(templateId), trainerId);

        var schedule = readSchedule(programId);
        var bySlot = new HashMap<Integer, TemplateService.ScheduleEntry>();
        for (var entry : schedule) bySlot.put(entry.day(), entry);

        var missing = new TreeSet<>(blueprint.slots());
        missing.removeAll(bySlot.keySet());
        if (!missing.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    ("This program now trains %d day%s a week and this client is only scheduled for %d. "
                     + "Assign it again to choose when the new day%s happen.")
                            .formatted(blueprint.slots().size(), blueprint.slots().size() == 1 ? "" : "s",
                                       bySlot.size(), missing.size() == 1 ? "" : "s"));
        }

        Instant now = Instant.now();
        int removed = jdbc.update("""
                UPDATE program_exercise SET deleted_at = :now, updated_at = :now
                WHERE program_id = :pid::uuid AND deleted_at IS NULL
                """, Map.of("pid", programId.toString(), "now", Timestamp.from(now)));

        templates.copyBlueprintInto(programId, blueprint.entries(), bySlot, now);

        jdbc.update("UPDATE program SET updated_at = :now WHERE id = :pid::uuid",
                Map.of("pid", programId.toString(), "now", Timestamp.from(now)));

        return new ResyncResult(programId.toString(), templateId, removed, blueprint.entries().size());
    }

    /** The client's own day layout, as `apply` wrote it. */
    private List<TemplateService.ScheduleEntry> readSchedule(UUID programId) {
        String json = jdbc.queryForObject(
                "SELECT schedule::text FROM program WHERE id = :pid::uuid",
                Map.of("pid", programId.toString()), String.class);
        if (json == null || json.isBlank() || json.equals("null")) return List.of();
        try {
            return STORE.readValue(json, new TypeReference<List<TemplateService.ScheduleEntry>>() {});
        } catch (Exception e) {
            log.warn("Unreadable program schedule on {}: {}", programId, e.getMessage());
            return List.of();
        }
    }

    private List<TemplateService.SetDetail> readSetDetail(String json) {
        if (json == null || json.isBlank() || json.equals("null")) return null;
        try {
            var out = STORE.readValue(json, new TypeReference<List<TemplateService.SetDetail>>() {});
            return out.isEmpty() ? null : out;
        } catch (Exception e) {
            log.warn("Unreadable set_detail: {}", e.getMessage());
            return null;
        }
    }

    private String toJson(Object v) {
        if (v == null) return null;
        try { return STORE.writeValueAsString(v); }
        catch (Exception e) { return null; }
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
