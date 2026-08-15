package com.xrep.xrep_backend.template;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class TemplateService {

    private final NamedParameterJdbcTemplate jdbc;

    private static final ObjectMapper MAPPER = new ObjectMapper()
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);

    // ── DTOs ──────────────────────────────────────────────────────────────────

    public record TemplateExerciseInput(
            String exerciseId,
            Integer sets,
            Integer reps,
            Integer restSeconds,
            Double targetLoad,
            String notes,
            Integer dayOfWeek,
            int orderIndex
    ) {}

    public record CreateTemplateRequest(
            @NotBlank String name,
            String goal,
            String description,
            List<TemplateExerciseInput> exercises,
            Map<String, String> dayLabels
    ) {}

    public record UpdateTemplateRequest(
            String name,
            String goal,
            String description,
            List<TemplateExerciseInput> exercises,
            Map<String, String> dayLabels
    ) {}

    public record ApplyTemplateRequest(
            @NotBlank String clientId,
            String name,
            String goal,
            Long startDate,
            Long endDate
    ) {}

    public record TemplateResponse(
            String id,
            String name,
            String goal,
            String description,
            List<Map<String, Object>> exercises,
            Map<String, String> dayLabels,
            long createdAt,
            long updatedAt
    ) {}

    public record ProgramSummary(
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

    // ── List ──────────────────────────────────────────────────────────────────

    public List<TemplateResponse> list(UUID trainerId) {
        var rows = jdbc.queryForList(
                "SELECT id::text, name, goal, description, structure::text AS structure, " +
                "day_labels::text AS day_labels, created_at, updated_at " +
                "FROM template WHERE trainer_id = :tid::uuid AND deleted_at IS NULL ORDER BY created_at DESC",
                Map.of("tid", trainerId.toString()));
        return rows.stream().map(this::toResponse).toList();
    }

    // ── Create ────────────────────────────────────────────────────────────────

    @Transactional
    public TemplateResponse create(UUID trainerId, CreateTemplateRequest req) {
        UUID id = UUID.randomUUID();
        Instant now = Instant.now();
        String structure = toJsonString(req.exercises());
        String dayLabelsJson = toJsonString(req.dayLabels());

        var p = new HashMap<String, Object>();
        p.put("id",          id.toString());
        p.put("tid",         trainerId.toString());
        p.put("name",        req.name());
        p.put("goal",        req.goal());
        p.put("description", req.description());
        p.put("structure",   structure);
        p.put("dayLabels",   dayLabelsJson);
        p.put("now",         Timestamp.from(now));

        jdbc.update("""
                INSERT INTO template (id, trainer_id, name, goal, description, structure, day_labels, created_at, updated_at)
                VALUES (:id::uuid, :tid::uuid, :name, :goal, :description,
                    CAST(:structure AS jsonb), CAST(:dayLabels AS jsonb), :now, :now)
                """, p);

        return new TemplateResponse(id.toString(), req.name(), req.goal(), req.description(),
                parseStructure(structure), parseDayLabels(dayLabelsJson), now.toEpochMilli(), now.toEpochMilli());
    }

    // ── Get ───────────────────────────────────────────────────────────────────

    public TemplateResponse get(UUID id, UUID trainerId) {
        return toResponse(findOwned(id, trainerId));
    }

    // ── Update ────────────────────────────────────────────────────────────────

    @Transactional
    public TemplateResponse update(UUID id, UUID trainerId, UpdateTemplateRequest req) {
        findOwned(id, trainerId);

        var sets = new ArrayList<String>();
        var p = new HashMap<String, Object>();
        p.put("id",  id.toString());
        p.put("tid", trainerId.toString());
        p.put("now", Timestamp.from(Instant.now()));
        sets.add("updated_at = :now");

        if (req.name() != null)      { p.put("name",      req.name());                              sets.add("name = :name"); }
        if (req.goal() != null)      { p.put("goal",      req.goal());                              sets.add("goal = :goal"); }
        if (req.description() != null) { p.put("desc",    req.description());                       sets.add("description = :desc"); }
        if (req.exercises() != null) { p.put("structure", toJsonString(req.exercises()));
                                       sets.add("structure = CAST(:structure AS jsonb)"); }
        if (req.dayLabels() != null) { p.put("dayLabels", toJsonString(req.dayLabels()));
                                       sets.add("day_labels = CAST(:dayLabels AS jsonb)"); }

        jdbc.update("UPDATE template SET " + String.join(", ", sets) +
                    " WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL", p);

        return toResponse(findOwned(id, trainerId));
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    @Transactional
    public void delete(UUID id, UUID trainerId) {
        findOwned(id, trainerId);
        jdbc.update("""
                UPDATE template SET deleted_at = NOW(), updated_at = NOW()
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", id.toString(), "tid", trainerId.toString()));
    }

    // ── Apply → creates an independent per-client program ─────────────────────

    @Transactional
    public ProgramSummary apply(UUID templateId, UUID trainerId, ApplyTemplateRequest req) {
        var tmpl = findOwned(templateId, trainerId);

        Boolean owned = jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                Map.of("cid", req.clientId(), "tid", trainerId.toString()), Boolean.class);
        if (!Boolean.TRUE.equals(owned)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Client not found");
        }

        UUID programId = UUID.randomUUID();
        Instant now = Instant.now();
        String programName = req.name() != null && !req.name().isBlank()
                ? req.name() : str(tmpl.get("name"));
        String goal = req.goal() != null ? req.goal() : str(tmpl.get("goal"));
        Date startDate = req.startDate() != null ? new Date(req.startDate()) : null;
        Date endDate   = req.endDate()   != null ? new Date(req.endDate())   : null;

        var p = new HashMap<String, Object>();
        p.put("id",        programId.toString());
        p.put("tid",       trainerId.toString());
        p.put("cid",       req.clientId());
        p.put("tmplId",    templateId.toString());
        p.put("name",      programName);
        p.put("goal",      goal);
        p.put("startDate", startDate);
        p.put("endDate",   endDate);
        p.put("now",       Timestamp.from(now));

        jdbc.update("""
                INSERT INTO program (id, trainer_id, client_id, template_id, name, goal,
                    start_date, end_date, status, created_at, updated_at)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :tmplId::uuid, :name, :goal,
                    :startDate, :endDate, 'active', :now, :now)
                """, p);

        for (var ex : parseStructure(str(tmpl.get("structure")))) {
            var ep = new HashMap<String, Object>();
            ep.put("id",          UUID.randomUUID().toString());
            ep.put("programId",   programId.toString());
            ep.put("exerciseId",  str(ex.get("exercise_id")));
            ep.put("sets",        ex.get("sets"));
            ep.put("reps",        ex.get("reps"));
            ep.put("restSeconds", ex.get("rest_seconds"));
            ep.put("targetLoad",  ex.get("target_load"));
            ep.put("notes",       str(ex.get("notes")));
            ep.put("dayOfWeek",   ex.get("day_of_week"));
            ep.put("orderIndex",  ex.getOrDefault("order_index", 0));
            // V20. A blueprint entry that predates multi-week programs has no
            // week on it and means week 1 — copying it as NULL would be the
            // same thing, but writing the 1 makes the client's plan explicit
            // about a shape the trainer can now see week by week.
            ep.put("week",        ex.getOrDefault("week", 1));
            ep.put("now",         Timestamp.from(now));

            jdbc.update("""
                    INSERT INTO program_exercise (id, program_id, exercise_id, sets, reps,
                        rest_seconds, target_load, notes, day_of_week, week, order_index, created_at, updated_at)
                    VALUES (:id::uuid, :programId::uuid, :exerciseId::uuid, :sets, :reps,
                        :restSeconds, :targetLoad, :notes, :dayOfWeek, :week, :orderIndex, :now, :now)
                    """, ep);
        }

        return new ProgramSummary(
                programId.toString(), req.clientId(), templateId.toString(),
                programName, goal,
                startDate != null ? startDate.toString() : null,
                endDate   != null ? endDate.toString()   : null,
                "active", now.toEpochMilli(), now.toEpochMilli());
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Map<String, Object> findOwned(UUID id, UUID trainerId) {
        var rows = jdbc.queryForList(
                "SELECT id::text, name, goal, description, structure::text AS structure, " +
                "day_labels::text AS day_labels, created_at, updated_at " +
                "FROM template WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL",
                Map.of("id", id.toString(), "tid", trainerId.toString()));
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Template not found");
        return rows.get(0);
    }

    private TemplateResponse toResponse(Map<String, Object> r) {
        return new TemplateResponse(
                str(r.get("id")),
                str(r.get("name")),
                str(r.get("goal")),
                str(r.get("description")),
                parseStructure(str(r.get("structure"))),
                parseDayLabels(str(r.get("day_labels"))),
                toEpochMilli(r.get("created_at")),
                toEpochMilli(r.get("updated_at")));
    }

    private List<Map<String, Object>> parseStructure(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            var node = MAPPER.readTree(json);
            String arrayJson = node.isArray() ? json : node.path("exercises").toString();
            return MAPPER.readValue(arrayJson, new TypeReference<>() {});
        } catch (Exception e) {
            log.warn("Failed to parse template structure: {}", e.getMessage());
            return List.of();
        }
    }

    private Map<String, String> parseDayLabels(String json) {
        if (json == null || json.isBlank() || json.equals("null") || json.equals("{}")) return Map.of();
        try {
            return MAPPER.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            log.warn("Failed to parse day_labels: {}", e.getMessage());
            return Map.of();
        }
    }

    private String toJsonString(Object v) {
        if (v == null) return "[]";
        try { return MAPPER.writeValueAsString(v); }
        catch (JsonProcessingException e) { return "[]"; }
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
