package com.inclineyou.inclineyou_backend.core.exercise;

import com.inclineyou.inclineyou_backend.core.exercise.dto.ExerciseItem;
import com.inclineyou.inclineyou_backend.core.exercise.dto.ExerciseMeta.Facet;
import com.inclineyou.inclineyou_backend.core.exercise.dto.ExerciseRequest;
import com.inclineyou.inclineyou_backend.core.exercise.dto.PatchExerciseRequest;
import com.inclineyou.inclineyou_backend.shared.wire.Patch;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The SQL on {@code exercise}: the library search and its facets, one exercise,
 * and the writes on a trainer's own custom rows. A trainer sees the global
 * library ({@code origin = 'inclineyou'}) plus their customs that are not
 * deleted; nothing here ever writes a global row.
 */
@Repository
@RequiredArgsConstructor
public class ExerciseJdbcRepository {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final TypeReference<List<String>> STRINGS = new TypeReference<>() {};

    /** What every read selects; {@code description} and {@code form_cues} are dropped from a list by {@code summary()}. */
    private static final String COLUMNS = """
            e.id::text AS id, e.name, e.muscle_group, e.body_part, e.target, e.secondary_targets::text AS secondary_targets,
            e.equipment, e.movement_pattern, e.level, e.log_type, e.origin, e.status, e.created_at, e.updated_at,
            e.description, e.form_cues::text AS form_cues""";

    private static final String VISIBLE = "e.deleted_at IS NULL AND (e.origin = 'inclineyou' OR e.trainer_id = :tid::uuid)";

    private final NamedParameterJdbcTemplate jdbc;

    /** A search hit with the two numbers the next page resumes from. */
    public record Hit(ExerciseItem item, int tier, String similarity) {}

    /** The filters of a list read, already validated. {@code q} is raw text; this class escapes it. */
    public record Filter(String q, String bodyPart, String equipment, String level, Boolean custom) {}

    /** Where the previous page stopped. {@code tier} and {@code similarity} are unused without a {@code q}. */
    public record After(int tier, String similarity, String name, UUID id) {}

    private static final RowMapper<ExerciseItem> ITEM = (rs, i) -> {
        Timestamp updated = rs.getTimestamp("updated_at");
        return new ExerciseItem(rs.getString("id"), rs.getString("name"), rs.getString("muscle_group"),
                rs.getString("body_part"), rs.getString("target"), list(rs.getString("secondary_targets")),
                rs.getString("equipment"), rs.getString("movement_pattern"), rs.getString("level"),
                rs.getString("log_type"), "trainer".equals(rs.getString("origin")), rs.getString("status"),
                rs.getTimestamp("created_at").getTime(), String.valueOf(updated.getTime()),
                rs.getString("description"), list(rs.getString("form_cues")));
    };

    /* ─────────────────────────────────────────────────────────────── reads ── */

    /** {@code limit + 1} rows so the caller can tell whether another page exists. */
    public List<Hit> search(UUID trainerId, Filter f, After after, int limit) {
        var p = params(trainerId, f);
        boolean ranked = f.q() != null;
        String where = where(f) + (after == null ? "" : keyset(after, ranked, p));
        String rank = ranked
                ? ", CASE WHEN e.name ILIKE :prefix ESCAPE '\\' THEN 1 ELSE 0 END AS tier,"
                + " round(similarity(e.name, :q)::numeric, 4)::text AS sim"
                : ", 0 AS tier, '0' AS sim";
        String order = ranked ? "tier DESC, round(similarity(e.name, :q)::numeric, 4) DESC, e.name, e.id" : "e.name, e.id";
        p.addValue("limit", limit + 1);
        return jdbc.query("SELECT " + COLUMNS + rank + " FROM exercise e WHERE " + where + " ORDER BY " + order
                + " LIMIT :limit", p, (rs, i) -> new Hit(ITEM.mapRow(rs, i).summary(), rs.getInt("tier"), rs.getString("sim")));
    }

    public int count(UUID trainerId, Filter f) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM exercise e WHERE " + where(f), params(trainerId, f), Integer.class);
        return n == null ? 0 : n;
    }

    public Optional<ExerciseItem> find(UUID trainerId, UUID id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM exercise e WHERE e.id = :id::uuid AND " + VISIBLE,
                new MapSqlParameterSource("id", id.toString()).addValue("tid", trainerId.toString()), ITEM)
                .stream().findFirst();
    }

    /** One facet, counted over what the caller can see: {@code column} is one of ours, never the caller's. */
    public List<Facet> facet(UUID trainerId, String column) {
        return jdbc.query("SELECT e." + column + " AS id, count(*) AS n FROM exercise e WHERE " + VISIBLE
                + " AND e." + column + " IS NOT NULL GROUP BY e." + column + " ORDER BY n DESC, id",
                Map.of("tid", trainerId.toString()), (rs, i) -> new Facet(rs.getString("id"), rs.getInt("n")));
    }

    public int total(UUID trainerId) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM exercise e WHERE " + VISIBLE,
                Map.of("tid", trainerId.toString()), Integer.class);
        return n == null ? 0 : n;
    }

    /* ────────────────────────────────────────────────────────────── writes ── */

    /** The trainer's custom exercise, locked; empty for a global one, somebody else's, or a retired one. */
    public Optional<ExerciseItem> lockCustom(UUID trainerId, UUID id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM exercise e WHERE e.id = :id::uuid AND e.origin = 'trainer'"
                + " AND e.trainer_id = :tid::uuid AND e.deleted_at IS NULL FOR UPDATE",
                new MapSqlParameterSource("id", id.toString()).addValue("tid", trainerId.toString()), ITEM)
                .stream().findFirst();
    }

    /** Does this id exist, and is it the trainer's live custom? Empty when nothing has it. */
    public Optional<Boolean> ownership(UUID trainerId, UUID id) {
        return jdbc.queryForList("""
                SELECT (origin = 'trainer' AND trainer_id = :tid::uuid AND deleted_at IS NULL) FROM exercise
                WHERE id = :id::uuid
                """, Map.of("id", id.toString(), "tid", trainerId.toString()), Boolean.class).stream().findFirst();
    }

    /** Is this id a custom exercise of the trainer's that was already retired? A repeat delete is then a repeat. */
    public boolean retired(UUID trainerId, UUID id) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM exercise WHERE id = :id::uuid AND origin = 'trainer'
                               AND trainer_id = :tid::uuid AND deleted_at IS NOT NULL)
                """, Map.of("id", id.toString(), "tid", trainerId.toString()), Boolean.class));
    }

    /** A live custom of the trainer's with this name (any case), other than {@code except}. */
    public boolean nameTaken(UUID trainerId, String name, UUID except) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM exercise WHERE origin = 'trainer' AND trainer_id = :tid::uuid
                               AND deleted_at IS NULL AND lower(name) = lower(:name) AND id <> :except::uuid)
                """, Map.of("tid", trainerId.toString(), "name", name,
                "except", except == null ? new UUID(0, 0).toString() : except.toString()), Boolean.class));
    }

    /** {@code muscle_group} mirrors {@code target}, as it does on every seeded row. */
    public void insert(UUID id, UUID trainerId, ExerciseRequest r) {
        jdbc.update("""
                INSERT INTO exercise (id, origin, trainer_id, name, muscle_group, body_part, target, equipment, log_type,
                                      level, description, form_cues, secondary_targets, status)
                VALUES (:id::uuid, 'trainer', :tid::uuid, :name, :target, :bodyPart, :target, :equipment, :logType,
                        :level, :description, CAST(:cues AS jsonb), '[]'::jsonb, :status)
                """, new MapSqlParameterSource("id", id.toString()).addValue("tid", trainerId.toString())
                .addValue("name", r.name()).addValue("bodyPart", r.bodyPart()).addValue("target", r.target())
                .addValue("equipment", r.equipment()).addValue("logType", r.logType() == null ? "weight_reps" : r.logType())
                .addValue("level", r.level()).addValue("description", r.description())
                .addValue("cues", json(r.formCues() == null ? List.of() : r.formCues()))
                .addValue("status", r.status() == null ? "published" : r.status()));
    }

    /** The fields a PATCH sent; {@code target} keeps {@code muscle_group} beside it. Always moves {@code updated_at} (a trigger). */
    public void update(UUID id, PatchExerciseRequest r) {
        var sets = new StringBuilder();
        var p = new MapSqlParameterSource("id", id.toString());
        set(sets, p, "name", r.name());
        set(sets, p, "body_part", r.bodyPart());
        set(sets, p, "target", r.target());
        if (r.target() != null) sets.append(", muscle_group = :target");
        set(sets, p, "equipment", r.equipment());
        set(sets, p, "log_type", r.logType());
        set(sets, p, "level", r.level());
        set(sets, p, "description", r.description());
        set(sets, p, "status", r.status());
        if (r.formCues() != null) {
            sets.append(", form_cues = CAST(:formCues AS jsonb)");
            p.addValue("formCues", json(r.formCues().value()));
        }
        jdbc.update("UPDATE exercise SET " + sets.substring(2) + " WHERE id = :id::uuid", p);
    }

    /** Soft: plans and past logs still resolve its name, and its name is free for a new custom. */
    public void retire(UUID id) {
        jdbc.update("UPDATE exercise SET deleted_at = now() WHERE id = :id::uuid", Map.of("id", id.toString()));
    }

    /* ──────────────────────────────────────────────────────────── internals ── */

    private static void set(StringBuilder sets, MapSqlParameterSource p, String column, Patch<?> field) {
        if (field == null) return;
        String param = column.replace("_", "");
        sets.append(", ").append(column).append(" = :").append(param);
        p.addValue(param, field.value());
    }

    private static MapSqlParameterSource params(UUID trainerId, Filter f) {
        var p = new MapSqlParameterSource("tid", trainerId.toString());
        if (f.q() != null) {
            String like = f.q().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
            p.addValue("q", f.q()).addValue("prefix", like + "%").addValue("contains", "%" + like + "%");
        }
        if (f.bodyPart() != null) p.addValue("bodyPart", f.bodyPart());
        if (f.equipment() != null) p.addValue("equipment", f.equipment());
        if (f.level() != null) p.addValue("level", f.level());
        return p;
    }

    private static String where(Filter f) {
        var w = new StringBuilder(VISIBLE);
        if (f.q() != null) w.append(" AND (e.name ILIKE :contains ESCAPE '\\' OR similarity(e.name, :q) > 0.3)");
        if (f.bodyPart() != null) w.append(" AND lower(e.body_part) = lower(:bodyPart)");
        if (f.equipment() != null) w.append(" AND lower(e.equipment) = lower(:equipment)");
        if (f.level() != null) w.append(" AND lower(e.level) = lower(:level)");
        if (f.custom() != null) w.append(f.custom() ? " AND e.origin = 'trainer'" : " AND e.origin = 'inclineyou'");
        return w.toString();
    }

    /** The step past the last row of the previous page: a keyset, never an OFFSET. */
    private static String keyset(After a, boolean ranked, MapSqlParameterSource p) {
        p.addValue("aName", a.name()).addValue("aId", a.id().toString());
        if (!ranked) return " AND (e.name, e.id) > (:aName, :aId::uuid)";
        p.addValue("aTier", a.tier()).addValue("aSim", new java.math.BigDecimal(a.similarity()));
        return """
                 AND ((CASE WHEN e.name ILIKE :prefix ESCAPE '\\' THEN 1 ELSE 0 END) < :aTier
                   OR ((CASE WHEN e.name ILIKE :prefix ESCAPE '\\' THEN 1 ELSE 0 END) = :aTier AND
                       (round(similarity(e.name, :q)::numeric, 4) < :aSim
                        OR (round(similarity(e.name, :q)::numeric, 4) = :aSim AND (e.name, e.id) > (:aName, :aId::uuid)))))""";
    }

    private static List<String> list(String json) {
        if (json == null) return List.of();
        try {
            return JSON.readValue(json, STRINGS);
        } catch (RuntimeException e) {
            return List.of();
        }
    }

    private static String json(List<String> values) {
        return JSON.writeValueAsString(values);
    }
}
