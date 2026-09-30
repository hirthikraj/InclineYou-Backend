package com.inclineyou.inclineyou_backend.core.assessment;

import com.inclineyou.inclineyou_backend.core.assessment.dto.AssessmentDetail;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The SQL on {@code assessment}. The list has its own service
 * ({@code AssessmentListService}) because its query is built from filters.
 *
 * <p>Every read filters {@code trainer_id} and {@code deleted_at IS NULL}: ownership
 * is a query filter, so somebody else's id is a 404. {@code tenant_id} is RLS's.
 */
@Repository
@RequiredArgsConstructor
public class AssessmentJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final String COLUMNS = """
            a.id::text AS id, a.client_id::text AS client_id, a.template_id::text AS template_id,
            a.schedule_id::text AS schedule_id, a.name, a.due_on, a.completed_at, a.entered_by,
            a.form::text AS form, a.readings::text AS readings, a.answers::text AS answers,
            a.created_at, a.updated_at, (a.deleted_at IS NOT NULL) AS deleted""" + " ";

    private static AssessmentRow row(ResultSet rs, int i) throws SQLException {
        Timestamp completed = rs.getTimestamp("completed_at");
        String schedule = rs.getString("schedule_id");
        return new AssessmentRow(UUID.fromString(rs.getString("id")), UUID.fromString(rs.getString("client_id")),
                UUID.fromString(rs.getString("template_id")), schedule == null ? null : UUID.fromString(schedule),
                rs.getString("name"), rs.getDate("due_on").toLocalDate(),
                completed == null ? null : completed.toInstant(), rs.getString("entered_by"),
                rs.getString("form"), rs.getString("readings"), rs.getString("answers"),
                rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant(),
                rs.getBoolean("deleted"));
    }

    private static HashMap<String, Object> params(UUID trainerId, UUID id) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("id", id.toString());
        return p;
    }

    /** The trainer's live assessment, or empty. */
    public Optional<AssessmentRow> find(UUID trainerId, UUID id) {
        return jdbc.query("SELECT " + COLUMNS + """
                 FROM assessment a
                WHERE a.id = :id::uuid AND a.trainer_id = :tid::uuid AND a.deleted_at IS NULL
                """, params(trainerId, id), AssessmentJdbcRepository::row).stream().findFirst();
    }

    /**
     * Locked for a write, deleted or not. A cycle's own row is locked FIRST when
     * there is one, because every route that touches both (finish, move, delete,
     * a cycle's own PATCH) then takes them in the same order and cannot deadlock.
     */
    public Optional<AssessmentRow> lock(UUID trainerId, UUID id) {
        var p = params(trainerId, id);
        jdbc.query("""
                SELECT s.id FROM assessment_schedule s
                 WHERE s.id = (SELECT schedule_id FROM assessment WHERE id = :id::uuid AND trainer_id = :tid::uuid)
                   FOR UPDATE""", p, rs -> {});
        return jdbc.query("SELECT " + COLUMNS + """
                 FROM assessment a
                WHERE a.id = :id::uuid AND a.trainer_id = :tid::uuid FOR UPDATE
                """, p, AssessmentJdbcRepository::row).stream().findFirst();
    }

    /** Whether the id is this trainer's live assessment on this client; empty when nothing has the id. */
    public Optional<Boolean> isMine(UUID id, UUID trainerId, UUID clientId) {
        var p = params(trainerId, id);
        p.put("cid", clientId.toString());
        return jdbc.queryForList("""
                SELECT (trainer_id = :tid::uuid AND client_id = :cid::uuid AND deleted_at IS NULL) AS mine
                FROM assessment WHERE id = :id::uuid""", p, Boolean.class).stream().findFirst();
    }

    /** False when the id was taken meanwhile. tenant_id is stamped by the trigger. */
    public boolean insert(UUID id, UUID trainerId, UUID clientId, UUID templateId, UUID scheduleId,
                          String name, String formJson, LocalDate dueOn) {
        var p = params(trainerId, id);
        p.put("cid", clientId.toString());
        p.put("tpl", templateId.toString());
        p.put("sched", scheduleId == null ? null : scheduleId.toString());
        p.put("name", name);
        p.put("form", formJson);
        p.put("due", Date.valueOf(dueOn));
        return jdbc.update("""
                INSERT INTO assessment (id, trainer_id, client_id, template_id, schedule_id, name, form, due_on)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :tpl::uuid, :sched::uuid, :name, CAST(:form AS jsonb), :due)
                ON CONFLICT (id) DO NOTHING""", p) > 0;
    }

    /**
     * Replace the entry. {@code completedAt} is written only when given, and
     * {@code firstCompletion} is what stamps {@code entered_by} — the two columns
     * assessment_entered_by_on_completion ties together.
     */
    public void saveEntry(UUID id, String readingsJson, String answersJson, Instant completedAt, boolean firstCompletion) {
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("readings", readingsJson);
        p.put("answers", answersJson);
        var sets = new StringBuilder("readings = CAST(:readings AS jsonb), answers = CAST(:answers AS jsonb)");
        if (completedAt != null) {
            p.put("at", Timestamp.from(completedAt));
            sets.append(", completed_at = :at");
        }
        if (firstCompletion) sets.append(", entered_by = 'trainer'");
        jdbc.update("UPDATE assessment SET " + sets + " WHERE id = :id::uuid", p);
    }

    public void setDue(UUID id, LocalDate dueOn) {
        jdbc.update("UPDATE assessment SET due_on = :due WHERE id = :id::uuid",
                java.util.Map.of("id", id.toString(), "due", Date.valueOf(dueOn)));
    }

    public void softDelete(UUID id) {
        jdbc.update("UPDATE assessment SET deleted_at = now() WHERE id = :id::uuid AND deleted_at IS NULL",
                java.util.Map.of("id", id.toString()));
    }

    /** A cycle's open assessment follows the cycle's date. */
    public void moveOpenDue(UUID scheduleId, LocalDate dueOn) {
        jdbc.update("""
                UPDATE assessment SET due_on = :due
                 WHERE schedule_id = :sid::uuid AND completed_at IS NULL AND deleted_at IS NULL""",
                java.util.Map.of("sid", scheduleId.toString(), "due", Date.valueOf(dueOn)));
    }

    /** True when it removed the cycle's open assessment — false when somebody had started it (or none is open). */
    public boolean softDeleteOpenUnstarted(UUID scheduleId) {
        return jdbc.update("""
                UPDATE assessment SET deleted_at = now()
                 WHERE schedule_id = :sid::uuid AND completed_at IS NULL AND deleted_at IS NULL
                   AND readings = '{}' AND answers = '{}'""", java.util.Map.of("sid", scheduleId.toString())) > 0;
    }

    /**
     * R36 — a template edit reaches the open assessments nobody has started, in
     * one statement. freeze_assessment_form allows exactly these and refuses the
     * rest, so a started one keeps the form it is being answered against.
     */
    public int refreshUnstarted(UUID templateId, String name, String formJson) {
        return jdbc.update("""
                UPDATE assessment SET name = :name, form = CAST(:form AS jsonb)
                 WHERE template_id = :tpl::uuid AND completed_at IS NULL AND sent_at IS NULL
                   AND readings = '{}' AND answers = '{}' AND deleted_at IS NULL""",
                java.util.Map.of("tpl", templateId.toString(), "name", name, "form", formJson));
    }

    // ── the client the assessment is on ────────────────────────────────────────

    /** {@code status} of the trainer's live client, or empty when it is not theirs. */
    public Optional<String> clientStatus(UUID trainerId, UUID clientId) {
        return jdbc.queryForList("""
                SELECT status FROM client
                 WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL""",
                java.util.Map.of("cid", clientId.toString(), "tid", trainerId.toString()), String.class)
                .stream().findFirst();
    }

    public Optional<AssessmentDetail.ClientRef> clientRef(UUID clientId) {
        return jdbc.query("SELECT id::text, name, status FROM client WHERE id = :cid::uuid",
                java.util.Map.of("cid", clientId.toString()),
                (rs, i) -> new AssessmentDetail.ClientRef(rs.getString(1), rs.getString(2), rs.getString(3)))
                .stream().findFirst();
    }

    // ── what the detail draws beside the entry ─────────────────────────────────

    public record HistoryPoint(String key, String assessmentId, Instant at, BigDecimal value) {}

    /**
     * One range on idx_assessment_client for every key at once, oldest first —
     * not one query per key. Only completed assessments count: a draft is not a
     * measurement yet.
     */
    public List<HistoryPoint> history(UUID clientId, Collection<String> keys) {
        if (keys.isEmpty()) return List.of();
        var p = new HashMap<String, Object>();
        p.put("cid", clientId.toString());
        p.put("keys", new ArrayList<>(keys));
        return jdbc.query("""
                SELECT r.key, a.id::text AS id, a.completed_at, (r.value)::text::numeric AS value
                  FROM assessment a
                 CROSS JOIN LATERAL jsonb_each(a.readings) r
                 WHERE a.client_id = :cid::uuid AND a.deleted_at IS NULL AND a.completed_at IS NOT NULL
                   AND r.key IN (:keys) AND jsonb_typeof(r.value) = 'number'
                 ORDER BY a.completed_at, a.id, r.key""", p,
                (rs, i) -> new HistoryPoint(rs.getString("key"), rs.getString("id"),
                        rs.getTimestamp("completed_at").toInstant(), rs.getBigDecimal("value")));
    }

    /** This client's completed assessments, newest first — the Compare picker. */
    public List<AssessmentDetail.Returned> returned(UUID clientId) {
        return jdbc.query("""
                SELECT id::text, name, completed_at FROM assessment
                 WHERE client_id = :cid::uuid AND deleted_at IS NULL AND completed_at IS NOT NULL
                 ORDER BY completed_at DESC, id""", java.util.Map.of("cid", clientId.toString()),
                (rs, i) -> new AssessmentDetail.Returned(rs.getString(1), rs.getString(2),
                        rs.getTimestamp(3).toInstant().toEpochMilli()));
    }
}
