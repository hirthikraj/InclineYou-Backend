package com.inclineyou.inclineyou_backend.core.assessment;

import com.inclineyou.inclineyou_backend.core.assessment.dto.AssessmentFilter;
import com.inclineyou.inclineyou_backend.core.assessment.dto.AssessmentItem;
import com.inclineyou.inclineyou_backend.core.assessment.dto.Count;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The SQL behind {@code GET /v1/assessments}. One fixed order, {@code due_on DESC, id}, walked by keyset on
 * idx_assessment_trainer (trainer_id, due_on DESC, id): the cursor is the last row's (due_on, id), so a deep page costs
 * what the first does. {@code state} is derived in SQL from the workspace's calendar day, never stored.
 */
@Repository
@RequiredArgsConstructor
public class AssessmentListJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final String STATE_SQL = """
            CASE WHEN a.completed_at IS NOT NULL THEN 'done'
                 WHEN a.due_on >= :today THEN 'booked'
                 ELSE 'missed' END""";

    private static final List<String> BASE = List.of("a.trainer_id = :tid::uuid", "a.deleted_at IS NULL");

    private record Where(List<String> clauses, Map<String, Object> params) {}

    private static Where where(AssessmentFilter f) {
        var p = new HashMap<String, Object>();
        p.put("tid", f.trainerId().toString());
        p.put("today", Date.valueOf(f.today()));
        var where = new ArrayList<>(BASE);
        if (f.states() != null && !f.states().isEmpty()) {
            p.put("states", f.states());
            where.add("(" + STATE_SQL + ") IN (:states)");
        }
        if (f.clientId() != null) {
            p.put("cid", f.clientId().toString());
            where.add("a.client_id = :cid::uuid");
        }
        if (f.q() != null) {
            p.put("q", f.q());
            where.add("(a.name ILIKE '%' || :q || '%' OR c.name ILIKE '%' || :q || '%')");
        }
        if (f.dueBy() != null) {
            p.put("dueBy", Date.valueOf(f.dueBy()));
            where.add("a.due_on <= :dueBy");
        }
        return new Where(where, p);
    }

    /** One page, {@code fetch} rows (one past the page, so the caller can tell whether there is a next one). */
    public List<AssessmentItem> page(AssessmentFilter f, Cursor after, java.time.LocalDate afterDue, int fetch) {
        var w = where(f);
        var clauses = new ArrayList<>(w.clauses());
        var p = w.params();
        p.put("limit", fetch);
        if (after != null) {
            // (due_on DESC, id ASC) — the index's own order, so the scan resumes in place.
            p.put("afterDue", Date.valueOf(afterDue));
            p.put("afterId", after.id().toString());
            clauses.add("(a.due_on < :afterDue OR (a.due_on = :afterDue AND a.id > :afterId::uuid))");
        }
        return jdbc.query("""
                SELECT a.id::text AS id, a.client_id::text AS client_id, a.template_id::text AS template_id,
                       a.schedule_id::text AS schedule_id, a.name, a.due_on::text AS due_on,
                       %s AS state, a.completed_at, a.entered_by, a.created_at, a.updated_at,
                       (SELECT count(*) FROM jsonb_object_keys(a.readings)) AS readings_got,
                       jsonb_array_length(a.form -> 'measurements') AS readings_asked,
                       (SELECT count(*) FROM jsonb_object_keys(a.answers)) AS answers_got,
                       jsonb_array_length(a.form -> 'questions') AS answers_asked
                FROM assessment a JOIN client c ON c.id = a.client_id WHERE %s
                ORDER BY a.due_on DESC, a.id LIMIT :limit
                """.formatted(STATE_SQL, String.join(" AND ", clauses)), p, (rs, i) -> {
            Timestamp completed = rs.getTimestamp("completed_at");
            return new AssessmentItem(
                    rs.getString("id"),
                    rs.getString("client_id"),
                    rs.getString("template_id"),
                    rs.getString("schedule_id"),
                    rs.getString("name"),
                    rs.getString("due_on"),
                    rs.getString("state"),
                    completed == null ? null : completed.getTime(),
                    rs.getString("entered_by"),
                    new Count(rs.getInt("readings_got"), rs.getInt("readings_asked")),
                    new Count(rs.getInt("answers_got"), rs.getInt("answers_asked")),
                    rs.getTimestamp("created_at").getTime(),
                    String.valueOf(rs.getTimestamp("updated_at").getTime()));
        });
    }

    /** How many match the filter (the cursor ignored). */
    public int count(AssessmentFilter f) {
        var w = where(f);
        Integer n = jdbc.queryForObject("SELECT count(*) FROM assessment a JOIN client c ON c.id = a.client_id WHERE "
                + String.join(" AND ", w.clauses()), w.params(), Integer.class);
        return n == null ? 0 : n;
    }

    /** How many this trainer has at all, ignoring every filter: the "3 of 57" the list prints. */
    public int grandTotal(AssessmentFilter f) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM assessment a WHERE " + String.join(" AND ", BASE),
                Map.of("tid", f.trainerId().toString()), Integer.class);
        return n == null ? 0 : n;
    }
}
