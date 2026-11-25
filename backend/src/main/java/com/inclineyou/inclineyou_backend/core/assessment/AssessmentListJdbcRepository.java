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
 * The SQL behind {@code GET /v1/assessments}. Two orders, each walked by keyset on its own index so a deep page costs
 * what the first does: {@code due_on DESC, id} on idx_assessment_trainer (the default), and the Assessments screen's
 * work order — To take · To review · Reviewed — on V47's idx_assessment_trainer_work. {@code state} is derived in SQL from the workspace's calendar day, never stored.
 */
@Repository
@RequiredArgsConstructor
public class AssessmentListJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final String STATE_SQL = """
            CASE WHEN a.completed_at IS NOT NULL THEN 'done'
                 WHEN a.due_on >= :today THEN 'booked'
                 ELSE 'missed' END""";

    /** V47's two sort expressions, written exactly as idx_assessment_trainer_work holds them so the planner uses it. */
    static final String SECTION_SQL =
            "(CASE WHEN a.completed_at IS NULL THEN 0 WHEN a.read_at IS NULL THEN 1 ELSE 2 END)";
    static final String WORK_KEY_SQL =
            "(CASE WHEN a.completed_at IS NULL THEN a.due_on - DATE '2000-01-01' ELSE DATE '2000-01-01' - a.due_on END)";

    /** Where a work-ordered page resumes: the last row's section and folded day key, as V47's index holds them. */
    public record WorkKey(int section, int key) {
        private static final long EPOCH_2000 = java.time.LocalDate.of(2000, 1, 1).toEpochDay();

        /** The key of a row the list returned — the same two expressions as SQL, computed from the row's own fields. */
        public static WorkKey of(AssessmentItem r) {
            int section = r.completedAt() == null ? 0 : r.reviewedAt() == null ? 1 : 2;
            int days = (int) (java.time.LocalDate.parse(r.dueOn()).toEpochDay() - EPOCH_2000);
            return new WorkKey(section, section == 0 ? days : -days);
        }

        /** {@code "section:key"} — the cursor's sort half. */
        public String text() {
            return section + ":" + key;
        }

        /** 400 for anything this list did not write. */
        public static WorkKey parse(String text) {
            try {
                int colon = text.indexOf(':');
                int s = Integer.parseInt(text.substring(0, colon));
                if (s < 0 || s > 2) throw new NumberFormatException();
                return new WorkKey(s, Integer.parseInt(text.substring(colon + 1)));
            } catch (RuntimeException e) {
                throw com.inclineyou.inclineyou_backend.shared.exception.ApiException.validation("cursor: not a cursor from this list");
            }
        }
    }

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
        if (f.reviewed() != null) {
            where.add(f.reviewed() ? "a.read_at IS NOT NULL" : "(a.completed_at IS NOT NULL AND a.read_at IS NULL)");
        }
        if (f.clientId() != null) {
            p.put("cid", f.clientId().toString());
            where.add("a.client_id = :cid::uuid");
        }
        if (f.q() != null) {
            // Matched as typed: a % or _ in the search is the character itself, not a wildcard.
            p.put("q", likeLiteral(f.q()));
            where.add("(a.name ILIKE '%' || :q || '%' ESCAPE '\\' OR c.name ILIKE '%' || :q || '%' ESCAPE '\\')");
        }
        if (f.dueBy() != null) {
            p.put("dueBy", Date.valueOf(f.dueBy()));
            where.add("a.due_on <= :dueBy");
        }
        return new Where(where, p);
    }

    /** {@code s} with LIKE's three special characters escaped by a backslash, so it matches only itself. */
    static String likeLiteral(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    /** Is this client on this trainer's roster (not deleted)? {@code ?clientId=} answers 404 otherwise. */
    public boolean clientIsMine(java.util.UUID trainerId, java.util.UUID clientId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)
                """, Map.of("cid", clientId.toString(), "tid", trainerId.toString()), Boolean.class));
    }

    /** The list's two orders. {@code DUE} is the default every caller but the Assessments screen reads. */
    public enum Order { DUE, WORK }

    /**
     * One page, {@code fetch} rows (one past the page, so the caller can tell whether there is a next one).
     *
     * <p>{@code DUE}: {@code due_on DESC, id}, resumed after {@code afterDue}. {@code WORK} (V47): To take, oldest owed
     * first · To review · Reviewed, newest first — resumed after {@code afterWork}. Each order has its own index, and
     * each resume predicate is a range over it, so a deep page costs what the first does.
     */
    public List<AssessmentItem> page(AssessmentFilter f, Order order, Cursor after, java.time.LocalDate afterDue,
                                     WorkKey afterWork, int fetch) {
        var w = where(f);
        var clauses = new ArrayList<>(w.clauses());
        var p = w.params();
        p.put("limit", fetch);
        if (after != null && order == Order.WORK) {
            p.put("afterSection", afterWork.section());
            p.put("afterKey", afterWork.key());
            p.put("afterId", after.id().toString());
            clauses.add("(" + SECTION_SQL + ", " + WORK_KEY_SQL + ", a.id) > (:afterSection, :afterKey, :afterId::uuid)");
        } else if (after != null) {
            // (due_on DESC, id ASC) — the index's own order, so the scan resumes in place.
            p.put("afterDue", Date.valueOf(afterDue));
            p.put("afterId", after.id().toString());
            clauses.add("(a.due_on < :afterDue OR (a.due_on = :afterDue AND a.id > :afterId::uuid))");
        }
        return jdbc.query("""
                SELECT a.id::text AS id, a.client_id::text AS client_id, a.template_id::text AS template_id,
                       a.schedule_id::text AS schedule_id, a.name, a.due_on::text AS due_on,
                       %s AS state, a.completed_at, a.entered_by, a.created_at, a.updated_at, a.sent_at, a.read_at,
                       (SELECT count(*) FROM jsonb_object_keys(a.readings)) AS readings_got,
                       jsonb_array_length(a.form -> 'measurements') AS readings_asked,
                       (SELECT count(*) FROM jsonb_object_keys(a.answers)) AS answers_got,
                       jsonb_array_length(a.form -> 'questions') AS answers_asked
                FROM assessment a JOIN client c ON c.id = a.client_id WHERE %s
                ORDER BY %s LIMIT :limit
                """.formatted(STATE_SQL, String.join(" AND ", clauses),
                order == Order.WORK ? SECTION_SQL + ", " + WORK_KEY_SQL + ", a.id" : "a.due_on DESC, a.id"), p, (rs, i) -> {
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
                    String.valueOf(rs.getTimestamp("updated_at").getTime()),
                    rs.getTimestamp("sent_at") == null ? null : rs.getTimestamp("sent_at").getTime(),
                    rs.getTimestamp("read_at") == null ? null : rs.getTimestamp("read_at").getTime());
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
