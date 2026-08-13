package com.xrep.xrep_backend.exercise;

import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.ArrayList;

@Service
@RequiredArgsConstructor
public class ExerciseService {

    private final NamedParameterJdbcTemplate jdbc;

    // ── DTOs ──────────────────────────────────────────────────────────────────

    public record ExerciseResponse(
            String id,
            String name,
            String muscleGroup,
            String equipment,
            String movementPattern,
            String description,
            String imageUrl,
            String videoUrl,
            String level,
            boolean isCustom,
            long createdAt
    ) {}

    public record SearchResult(List<ExerciseResponse> exercises, int total) {}

    public record MetaResponse(List<String> muscleGroups, List<String> equipment, List<String> levels) {}

    public record CreateExerciseRequest(
            @NotBlank String name,
            String muscleGroup,
            String equipment,
            String movementPattern,
            String description,
            String imageUrl,
            String videoUrl
    ) {}

    // ── Search ────────────────────────────────────────────────────────────────

    public SearchResult search(UUID trainerId, String q, String muscleGroup,
                               String equipment, String level, int page, int size) {
        size = Math.min(size, 100);

        var params = new HashMap<String, Object>();
        params.put("tid",    trainerId.toString());
        params.put("limit",  size);
        params.put("offset", (long) page * size);

        // Build WHERE dynamically — avoids null-param type inference issues with ILIKE
        var conditions = new ArrayList<String>();
        conditions.add("deleted_at IS NULL");
        conditions.add("(is_custom = false OR trainer_id = :tid::uuid)");

        if (q != null && !q.isBlank()) {
            params.put("q", q.strip());
            conditions.add("name ILIKE '%' || :q || '%'");
        }
        if (muscleGroup != null && !muscleGroup.isBlank()) {
            params.put("muscleGroup", muscleGroup);
            conditions.add("muscle_group = :muscleGroup");
        }
        if (equipment != null && !equipment.isBlank()) {
            params.put("equipment", equipment);
            conditions.add("equipment = :equipment");
        }
        if (level != null && !level.isBlank()) {
            params.put("level", level);
            conditions.add("level = :level");
        }

        String where = "WHERE " + String.join(" AND ", conditions);

        var rows = jdbc.queryForList(
                "SELECT id::text, name, muscle_group, equipment, movement_pattern, " +
                "description, image_url, video_url, level, is_custom, created_at " +
                "FROM exercise " + where +
                " ORDER BY is_custom ASC, name ASC LIMIT :limit OFFSET :offset",
                params);

        Integer total = jdbc.queryForObject(
                "SELECT COUNT(*) FROM exercise " + where, params, Integer.class);

        var exercises = rows.stream().map(r -> new ExerciseResponse(
                str(r.get("id")),
                str(r.get("name")),
                str(r.get("muscle_group")),
                str(r.get("equipment")),
                str(r.get("movement_pattern")),
                str(r.get("description")),
                str(r.get("image_url")),
                str(r.get("video_url")),
                str(r.get("level")),
                Boolean.TRUE.equals(r.get("is_custom")),
                toEpochMilli(r.get("created_at"))
        )).toList();

        return new SearchResult(exercises, total == null ? 0 : total);
    }

    // ── Meta ──────────────────────────────────────────────────────────────────

    public MetaResponse meta() {
        var groups = stringColumn("""
                SELECT DISTINCT muscle_group AS val FROM exercise
                WHERE is_custom = false AND deleted_at IS NULL AND muscle_group IS NOT NULL
                ORDER BY val
                """);

        var equips = stringColumn("""
                SELECT DISTINCT equipment AS val FROM exercise
                WHERE is_custom = false AND deleted_at IS NULL AND equipment IS NOT NULL
                ORDER BY val
                """);

        var levels = stringColumn("""
                SELECT DISTINCT level AS val FROM exercise
                WHERE is_custom = false AND deleted_at IS NULL AND level IS NOT NULL
                ORDER BY val
                """);

        return new MetaResponse(groups, equips, levels);
    }

    // ── Custom exercise create ─────────────────────────────────────────────────

    @Transactional
    public ExerciseResponse createCustom(UUID trainerId, CreateExerciseRequest req) {
        UUID id = UUID.randomUUID();
        Instant now = Instant.now();

        var params = new HashMap<String, Object>();
        params.put("id",              id.toString());
        params.put("tid",             trainerId.toString());
        params.put("name",            req.name());
        params.put("muscleGroup",     req.muscleGroup());
        params.put("equipment",       req.equipment());
        params.put("movementPattern", req.movementPattern());
        params.put("description",     req.description());
        params.put("imageUrl",        req.imageUrl());
        params.put("videoUrl",        req.videoUrl());
        params.put("now",             Timestamp.from(now));

        jdbc.update("""
                INSERT INTO exercise (id, name, muscle_group, equipment, movement_pattern,
                    description, image_url, video_url, is_custom, trainer_id, created_at, updated_at)
                VALUES (:id::uuid, :name, :muscleGroup, :equipment, :movementPattern,
                    :description, :imageUrl, :videoUrl, true, :tid::uuid, :now, :now)
                """, params);

        return new ExerciseResponse(
                id.toString(), req.name(), req.muscleGroup(), req.equipment(),
                req.movementPattern(), req.description(), req.imageUrl(), req.videoUrl(),
                null, true, now.toEpochMilli()
        );
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private List<String> stringColumn(String sql) {
        return jdbc.queryForList(sql, Map.of())
                .stream().map(r -> str(r.get("val"))).toList();
    }

    private String str(Object v) {
        return v == null ? null : v.toString();
    }

    private long toEpochMilli(Object v) {
        if (v instanceof java.sql.Timestamp ts)           return ts.toInstant().toEpochMilli();
        if (v instanceof java.time.OffsetDateTime odt)    return odt.toInstant().toEpochMilli();
        if (v instanceof java.time.LocalDateTime ldt)     return ldt.toInstant(java.time.ZoneOffset.UTC).toEpochMilli();
        if (v instanceof java.time.Instant i)             return i.toEpochMilli();
        return 0L;
    }
}
