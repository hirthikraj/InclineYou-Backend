package com.inclineyou.inclineyou_backend.core.assessment;

import com.inclineyou.inclineyou_backend.core.assessment.dto.PortalAssessment;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The SQL behind the client's assessments tab. Every statement names the client's id AND runs through their lens, so the two walls fail
 * separately; an assessment is the client's to see only once {@code sent_at} is set, which is the one thing that makes it theirs.
 */
@Repository
@RequiredArgsConstructor
public class PortalAssessmentJdbcRepository {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final NamedParameterJdbcTemplate jdbc;

    private static Map<String, Object> p(UUID client) {
        var m = new HashMap<String, Object>();
        m.put("c", client.toString());
        return m;
    }

    public UUID trainerOf(UUID client) {
        return UUID.fromString(jdbc.queryForObject("SELECT trainer_id::text FROM client WHERE id = :c::uuid", p(client), String.class));
    }

    public String zoneOf(UUID client) {
        var z = jdbc.queryForList("SELECT timezone FROM client WHERE id = :c::uuid", p(client), String.class);
        return z.isEmpty() || z.getFirst() == null ? "Asia/Kolkata" : z.getFirst();
    }

    public boolean hideWeight(UUID client) {
        var v = jdbc.queryForList("SELECT hide_weight FROM client_prefs WHERE client_id = :c::uuid AND deleted_at IS NULL", p(client), Boolean.class);
        return !v.isEmpty() && Boolean.TRUE.equals(v.getFirst());
    }

    public record ListRow(PortalAssessment.Item item, Timestamp key, LocalDate dueOn) {}

    /**
     * One page of the client's assessments. {@code open} is oldest-due first by {@code (due_on, id)}; {@code done} is newest first by
     * {@code (completed_at, id)}. The cursor's own key and id say where to resume; both are full precision.
     */
    public List<ListRow> list(UUID client, boolean open, LocalDate today, LocalDate afterDue, Timestamp afterAt, UUID afterId, int limit) {
        var m = p(client);
        m.put("n", limit);
        m.put("id", afterId == null ? null : afterId.toString());
        m.put("today", Date.valueOf(today));
        String where, order;
        if (open) {
            m.put("d", afterDue == null ? null : Date.valueOf(afterDue));
            where = "a.completed_at IS NULL AND (CAST(:d AS date) IS NULL OR (a.due_on, a.id) > (CAST(:d AS date), CAST(:id AS uuid)))";
            order = "a.due_on, a.id";
        } else {
            m.put("t", afterAt);
            where = "a.completed_at IS NOT NULL AND (CAST(:t AS timestamptz) IS NULL OR (a.completed_at, a.id) < (CAST(:t AS timestamptz), CAST(:id AS uuid)))";
            order = "a.completed_at DESC, a.id DESC";
        }
        return jdbc.query("""
                SELECT a.id::text AS id, a.name, t.system_key, a.sent_at, a.due_on, a.completed_at,
                       jsonb_array_length(COALESCE(a.form -> 'measurements', '[]'::jsonb)) AS ms, jsonb_array_length(COALESCE(a.form -> 'questions', '[]'::jsonb)) AS qs
                  FROM assessment a LEFT JOIN assessment_template t ON t.id = a.template_id
                 WHERE a.client_id = :c::uuid AND a.sent_at IS NOT NULL AND a.deleted_at IS NULL AND %s
                 ORDER BY %s LIMIT :n""".formatted(where, order), m, (rs, i) -> {
            LocalDate due = rs.getDate("due_on").toLocalDate();
            Timestamp done = rs.getTimestamp("completed_at");
            var item = new PortalAssessment.Item(rs.getString("id"), rs.getString("name"), rs.getString("system_key"), done == null ? "open" : "done",
                    rs.getTimestamp("sent_at").getTime(), due.toString(), done == null && due.isBefore(today), done == null ? null : done.getTime(),
                    new PortalAssessment.Asks(rs.getInt("ms"), rs.getInt("qs")));
            return new ListRow(item, done == null ? rs.getTimestamp("sent_at") : done, due);
        });
    }

    public PortalAssessment.Counts counts(UUID client) {
        return jdbc.queryForObject("""
                SELECT count(*) FILTER (WHERE completed_at IS NULL) AS open, count(*) FILTER (WHERE completed_at IS NOT NULL) AS done
                  FROM assessment WHERE client_id = :c::uuid AND sent_at IS NOT NULL AND deleted_at IS NULL""", p(client),
                (rs, i) -> new PortalAssessment.Counts(rs.getInt("open"), rs.getInt("done")));
    }

    /** At least one template is on offer: there is a "Start a new one" to show. */
    public boolean canStart(UUID client) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM assessment_template t JOIN client c ON c.trainer_id = t.trainer_id AND c.tenant_id = t.tenant_id
                                WHERE c.id = :c::uuid AND t.client_can_start AND t.deleted_at IS NULL)""", p(client), Boolean.class));
    }

    /** The assessment of this template already waiting for the client, if any — the page says Continue, not Start. */
    public Optional<String> openOf(UUID client, UUID template) {
        var m = p(client);
        m.put("t", template.toString());
        return jdbc.queryForList("""
                SELECT id::text FROM assessment WHERE client_id = :c::uuid AND template_id = :t::uuid AND sent_at IS NOT NULL AND completed_at IS NULL AND deleted_at IS NULL
                 ORDER BY created_at LIMIT 1""", m, String.class).stream().findFirst();
    }

    /** {@code start_client_assessment} (V12): the one way a client creates an assessment. Answers {@code result} and, for two of them, the id. */
    public JsonNode start(UUID id, UUID client, UUID template, String formJson, String name, LocalDate dueOn) {
        var m = p(client);
        m.put("id", id.toString());
        m.put("t", template.toString());
        m.put("form", formJson);
        m.put("name", name);
        m.put("due", Date.valueOf(dueOn));
        return JSON.readTree(jdbc.queryForObject("SELECT start_client_assessment(:id::uuid, :c::uuid, :t::uuid, CAST(:form AS jsonb), :name, :due)::text", m, String.class));
    }

    /** {@code client_cycle_template} (V24): what advancing the cycle needs, or null when there is nothing to advance. */
    public Optional<JsonNode> cycleTemplate(UUID assessment) {
        String json = jdbc.queryForObject("SELECT client_cycle_template(:a::uuid)::text", Map.of("a", assessment.toString()), String.class);
        return json == null ? Optional.empty() : Optional.of(JSON.readTree(json));
    }

    /** {@code client_book_next_assessment} (V24): moves the cycle's date and books the next, unsent. */
    public void bookNext(UUID done, LocalDate nextDue, String formJson, String name) {
        jdbc.queryForObject("SELECT client_book_next_assessment(:a::uuid, :d, CAST(:f AS jsonb), :n)::text",
                Map.of("a", done.toString(), "d", Date.valueOf(nextDue), "f", formJson, "n", name), String.class);
    }
}
