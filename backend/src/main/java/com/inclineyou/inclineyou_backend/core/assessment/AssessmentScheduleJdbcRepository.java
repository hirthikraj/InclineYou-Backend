package com.inclineyou.inclineyou_backend.core.assessment;

import com.inclineyou.inclineyou_backend.core.assessment.dto.ScheduleItem;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** The SQL on {@code assessment_schedule} — a client's cycle on one template. */
@Repository
@RequiredArgsConstructor
public class AssessmentScheduleJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** A cycle locked for a write, deleted or not. */
    record Locked(UUID id, UUID clientId, UUID templateId, int intervalDays, LocalDate nextDueOn,
                  Instant endedAt, boolean deleted, Instant updatedAt) {
        String version() {
            return String.valueOf(updatedAt.toEpochMilli());
        }

        boolean live() {
            return !deleted && endedAt == null;
        }
    }

    private static final String ITEM = """
            SELECT s.id::text AS id, s.client_id::text AS client_id, s.template_id::text AS template_id,
                   t.name AS template_name, s.interval_days, s.next_due_on, s.ended_at,
                   (SELECT a.id::text FROM assessment a
                     WHERE a.schedule_id = s.id AND a.completed_at IS NULL AND a.deleted_at IS NULL) AS open_id,
                   s.created_at, s.updated_at
              FROM assessment_schedule s JOIN assessment_template t ON t.id = s.template_id""";

    private static ScheduleItem item(ResultSet rs, int i) throws SQLException {
        Timestamp ended = rs.getTimestamp("ended_at");
        Timestamp updated = rs.getTimestamp("updated_at");
        return new ScheduleItem(rs.getString("id"), rs.getString("client_id"), rs.getString("template_id"),
                rs.getString("template_name"), rs.getInt("interval_days"), rs.getDate("next_due_on").toString(),
                ended == null ? null : ended.getTime(), rs.getString("open_id"),
                rs.getTimestamp("created_at").getTime(), updated.getTime(), String.valueOf(updated.getTime()));
    }

    /** Live first, then ended, newest first — served by idx_assessment_schedule_client. */
    public List<ScheduleItem> forClient(UUID trainerId, UUID clientId) {
        return jdbc.query(ITEM + """

                 WHERE s.client_id = :cid::uuid AND s.trainer_id = :tid::uuid AND s.deleted_at IS NULL
                 ORDER BY (s.ended_at IS NOT NULL), s.created_at DESC, s.id""",
                Map.of("cid", clientId.toString(), "tid", trainerId.toString()), AssessmentScheduleJdbcRepository::item);
    }

    public Optional<ScheduleItem> one(UUID trainerId, UUID id) {
        return jdbc.query(ITEM + """

                 WHERE s.id = :id::uuid AND s.trainer_id = :tid::uuid AND s.deleted_at IS NULL""",
                Map.of("id", id.toString(), "tid", trainerId.toString()), AssessmentScheduleJdbcRepository::item)
                .stream().findFirst();
    }

    /** Empty when nothing has the id; otherwise whether it is this trainer's live cycle. */
    public Optional<Boolean> isMine(UUID id, UUID trainerId) {
        return jdbc.queryForList("""
                SELECT (trainer_id = :tid::uuid AND deleted_at IS NULL) FROM assessment_schedule WHERE id = :id::uuid""",
                Map.of("id", id.toString(), "tid", trainerId.toString()), Boolean.class).stream().findFirst();
    }

    public Optional<Locked> lock(UUID trainerId, UUID id) {
        return jdbc.query("""
                SELECT id::text, client_id::text, template_id::text, interval_days, next_due_on, ended_at,
                       (deleted_at IS NOT NULL) AS deleted, updated_at
                  FROM assessment_schedule WHERE id = :id::uuid AND trainer_id = :tid::uuid FOR UPDATE""",
                Map.of("id", id.toString(), "tid", trainerId.toString()), (rs, i) -> {
                    Timestamp ended = rs.getTimestamp("ended_at");
                    return new Locked(UUID.fromString(rs.getString(1)), UUID.fromString(rs.getString(2)),
                            UUID.fromString(rs.getString(3)), rs.getInt("interval_days"),
                            rs.getDate("next_due_on").toLocalDate(), ended == null ? null : ended.toInstant(),
                            rs.getBoolean("deleted"), rs.getTimestamp("updated_at").toInstant());
                }).stream().findFirst();
    }

    /** Whether the client is already on a live cycle of this template. */
    public boolean liveExists(UUID clientId, UUID templateId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM assessment_schedule
                                WHERE client_id = :cid::uuid AND template_id = :tpl::uuid
                                  AND deleted_at IS NULL AND ended_at IS NULL)""",
                Map.of("cid", clientId.toString(), "tpl", templateId.toString()), Boolean.class));
    }

    /** False when the id was taken meanwhile. uq_assessment_schedule_live raises for a second live cycle. */
    public boolean insert(UUID id, UUID trainerId, UUID clientId, UUID templateId, int intervalDays, LocalDate nextDueOn) {
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("tid", trainerId.toString());
        p.put("cid", clientId.toString());
        p.put("tpl", templateId.toString());
        p.put("days", intervalDays);
        p.put("due", Date.valueOf(nextDueOn));
        return jdbc.update("""
                INSERT INTO assessment_schedule (id, trainer_id, client_id, template_id, interval_days, next_due_on)
                VALUES (:id::uuid, :tid::uuid, :cid::uuid, :tpl::uuid, :days, :due)
                ON CONFLICT (id) DO NOTHING""", p) > 0;
    }

    /** Only what was sent. */
    public void update(UUID id, LocalDate nextDueOn, Integer intervalDays) {
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        var sets = new StringBuilder("updated_at = now()");
        if (nextDueOn != null) { p.put("due", Date.valueOf(nextDueOn)); sets.append(", next_due_on = :due"); }
        if (intervalDays != null) { p.put("days", intervalDays); sets.append(", interval_days = :days"); }
        jdbc.update("UPDATE assessment_schedule SET " + sets + " WHERE id = :id::uuid", p);
    }

    public void end(UUID id) {
        jdbc.update("UPDATE assessment_schedule SET ended_at = now() WHERE id = :id::uuid AND ended_at IS NULL",
                Map.of("id", id.toString()));
    }

    public void softDelete(UUID id) {
        jdbc.update("UPDATE assessment_schedule SET deleted_at = now() WHERE id = :id::uuid AND deleted_at IS NULL",
                Map.of("id", id.toString()));
    }

    /** A template's delete ends every live cycle on it. */
    public void endLiveOnTemplate(UUID trainerId, UUID templateId) {
        jdbc.update("""
                UPDATE assessment_schedule SET ended_at = now()
                 WHERE template_id = :tpl::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL AND ended_at IS NULL""",
                Map.of("tpl", templateId.toString(), "tid", trainerId.toString()));
    }
}
