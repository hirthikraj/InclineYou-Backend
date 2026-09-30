package com.inclineyou.inclineyou_backend.core.assessment;

import com.inclineyou.inclineyou_backend.core.assessment.dto.TemplateItem;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** The SQL on {@code assessment_template}. */
@Repository
@RequiredArgsConstructor
public class AssessmentTemplateJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** A template as the assessment and cycle writes copy it. Read whether deleted or not. */
    record Stored(UUID id, String name, String description, TemplateItem.Measurements measurements,
                  TemplateItem.Questions questions, Instant createdAt, Instant updatedAt, boolean deleted) {
        String version() {
            return String.valueOf(updatedAt.toEpochMilli());
        }
    }

    private static final String COLUMNS = """
            id::text AS id, name, description, measurements::text AS measurements, questions::text AS questions,
            created_at, updated_at, (deleted_at IS NOT NULL) AS deleted""" + " ";

    private static Stored stored(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        return new Stored(UUID.fromString(rs.getString("id")), rs.getString("name"), rs.getString("description"),
                AssessmentJson.read(rs.getString("measurements"), TemplateItem.Measurements.class),
                AssessmentJson.read(rs.getString("questions"), TemplateItem.Questions.class),
                rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant(),
                rs.getBoolean("deleted"));
    }

    /** A shelf is a handful of forms, so there is no cursor. Most recently edited first. */
    public List<Stored> live(UUID trainerId) {
        return jdbc.query("SELECT " + COLUMNS + """
                 FROM assessment_template WHERE trainer_id = :tid::uuid AND deleted_at IS NULL
                ORDER BY updated_at DESC, created_at, id""", Map.of("tid", trainerId.toString()),
                AssessmentTemplateJdbcRepository::stored);
    }

    /** One grouped query for the whole shelf's "on 6 clients". */
    public Map<UUID, Integer> liveCycles(UUID trainerId) {
        var out = new HashMap<UUID, Integer>();
        jdbc.query("""
                SELECT template_id::text, count(*) FROM assessment_schedule
                 WHERE trainer_id = :tid::uuid AND deleted_at IS NULL AND ended_at IS NULL
                 GROUP BY template_id""", Map.of("tid", trainerId.toString()),
                rs -> { out.put(UUID.fromString(rs.getString(1)), rs.getInt(2)); });
        return out;
    }

    public int liveCycles(UUID trainerId, UUID templateId) {
        Integer n = jdbc.queryForObject("""
                SELECT count(*) FROM assessment_schedule
                 WHERE trainer_id = :tid::uuid AND template_id = :id::uuid AND deleted_at IS NULL AND ended_at IS NULL""",
                Map.of("tid", trainerId.toString(), "id", templateId.toString()), Integer.class);
        return n == null ? 0 : n;
    }

    /** The trainer's own template, deleted or not — an assessment outlives its template. */
    public Optional<Stored> find(UUID trainerId, UUID id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM assessment_template WHERE id = :id::uuid AND trainer_id = :tid::uuid",
                Map.of("id", id.toString(), "tid", trainerId.toString()), AssessmentTemplateJdbcRepository::stored)
                .stream().findFirst();
    }

    /** {@code find} that also locks the row, for a write. */
    public Optional<Stored> lock(UUID trainerId, UUID id) {
        return jdbc.query("SELECT " + COLUMNS + """
                 FROM assessment_template WHERE id = :id::uuid AND trainer_id = :tid::uuid FOR UPDATE""",
                Map.of("id", id.toString(), "tid", trainerId.toString()), AssessmentTemplateJdbcRepository::stored)
                .stream().findFirst();
    }

    /** Empty when nothing has the id; otherwise whether it is this trainer's live template. */
    public Optional<Boolean> isMine(UUID id, UUID trainerId) {
        return jdbc.queryForList("SELECT (trainer_id = :tid::uuid AND deleted_at IS NULL) FROM assessment_template WHERE id = :id::uuid",
                Map.of("id", id.toString(), "tid", trainerId.toString()), Boolean.class).stream().findFirst();
    }

    /** Whether another live template of this trainer's already has the name (case-insensitive). */
    public boolean nameTaken(UUID trainerId, String name, UUID exceptId) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("name", name);
        p.put("except", exceptId == null ? null : exceptId.toString());
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM assessment_template
                                WHERE trainer_id = :tid::uuid AND lower(name) = lower(:name) AND deleted_at IS NULL
                                  AND (CAST(:except AS uuid) IS NULL OR id <> CAST(:except AS uuid)))""", p, Boolean.class));
    }

    /** False when the id was taken meanwhile; uq_assessment_template_name raises for a taken name. */
    public boolean insert(UUID id, UUID trainerId, String name, String description, String measurementsJson, String questionsJson) {
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("tid", trainerId.toString());
        p.put("name", name);
        p.put("description", description);
        p.put("m", measurementsJson);
        p.put("q", questionsJson);
        return jdbc.update("""
                INSERT INTO assessment_template (id, trainer_id, name, description, measurements, questions)
                VALUES (:id::uuid, :tid::uuid, :name, :description, CAST(:m AS jsonb), CAST(:q AS jsonb))
                ON CONFLICT (id) DO NOTHING""", p) > 0;
    }

    public void update(UUID id, String name, String description, String measurementsJson, String questionsJson) {
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("name", name);
        p.put("description", description);
        p.put("m", measurementsJson);
        p.put("q", questionsJson);
        jdbc.update("""
                UPDATE assessment_template SET name = :name, description = :description,
                       measurements = CAST(:m AS jsonb), questions = CAST(:q AS jsonb)
                 WHERE id = :id::uuid""", p);
    }

    public void softDelete(UUID id) {
        jdbc.update("UPDATE assessment_template SET deleted_at = now() WHERE id = :id::uuid AND deleted_at IS NULL",
                Map.of("id", id.toString()));
    }

}
