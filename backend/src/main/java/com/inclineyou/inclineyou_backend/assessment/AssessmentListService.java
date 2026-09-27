package com.inclineyou.inclineyou_backend.assessment;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.inclineyou.inclineyou_backend.exception.ApiException;
import com.inclineyou.inclineyou_backend.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.wire.Cursor;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * {@code GET /v1/assessments} — the v1 list, used by Today (L10) and the
 * Assessments screen.
 *
 * <p>{@code state} is DERIVED, never stored (V14): done once completed, booked
 * while not completed and due today or later, missed once past due. "Today" is
 * the workspace's calendar day, so an assessment due on the 26th is still booked
 * at 23:30 in Chennai whatever the server's clock says. {@code waiting} (sent to
 * the client and not back) is next release, with the portal.
 *
 * <p>Timestamps are epoch ms since 1.1 — the V14 exception for ISO strings is
 * dropped, since this wire breaks every client anyway.
 *
 * <p>One fixed order, {@code dueOn DESC, id}, walked by keyset on
 * idx_assessment_trainer (trainer_id, due_on DESC, id); the cursor is the last
 * row's (dueOn, id), so a deep page costs what the first does. No page, size or
 * sort any more.
 */
@Service
@RequiredArgsConstructor
public class AssessmentListService {

    private final NamedParameterJdbcTemplate jdbc;
    private final WorkspaceClock clock;

    private static final Set<String> STATES = Set.of("booked", "missed", "done");
    private static final int DEFAULT_LIMIT = 50;
    private static final int MAX_LIMIT = 500;

    public record Count(int got, int asked) {}

    public record Item(
            String id,
            String clientId,
            String templateId,
            String scheduleId,
            String name,
            String dueOn,
            String state,
            Long completedAt,
            String enteredBy,
            Count measurements,
            Count questions,
            long createdAt,
            /** Opaque — {@code updated_at} as epoch ms. */
            String version
    ) {}

    /**
     * @param total      only with {@code includeTotal=true} — matching the filter
     * @param grandTotal only with {@code includeTotal=true} — ignoring the filter:
     *                   the "3 of 57" the list prints
     */
    public record Page(List<Item> items, String nextCursor,
                       @JsonInclude(JsonInclude.Include.NON_NULL) Integer total,
                       @JsonInclude(JsonInclude.Include.NON_NULL) Integer grandTotal) {}

    private static final String STATE_SQL = """
            CASE WHEN a.completed_at IS NOT NULL THEN 'done'
                 WHEN a.due_on >= :today THEN 'booked'
                 ELSE 'missed' END""";

    /**
     * @param state  comma list of booked · missed · done; unknown names are ignored,
     *               and none known filters nothing
     * @param q      the assessment's or the client's name, case-insensitive
     * @param dueBy  due on or before this date — Today's "owed today or earlier"
     */
    public Page list(UUID trainerId, String state, String clientId, String q, String dueBy,
                     Integer limit, String cursor, boolean includeTotal) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("today", Date.valueOf(WorkspaceClock.today(clock.zone())));

        var base = List.of("a.trainer_id = :tid::uuid", "a.deleted_at IS NULL");
        var where = new ArrayList<>(base);

        var wanted = new LinkedHashSet<String>();
        if (state != null && !state.isBlank()) for (String s : state.split(",")) {
            if (!STATES.contains(s.strip())) throw ApiException.validation("state: unknown value " + s.strip());
            wanted.add(s.strip());
        }
        if (!wanted.isEmpty()) {
            p.put("states", List.copyOf(wanted));
            where.add("(" + STATE_SQL + ") IN (:states)");
        }
        if (clientId != null && !clientId.isBlank()) {
            try {
                p.put("cid", UUID.fromString(clientId.strip()).toString());
            } catch (IllegalArgumentException e) {
                throw ApiException.validation("clientId: not a client id");
            }
            where.add("a.client_id = :cid::uuid");
        }
        if (q != null && !q.isBlank()) {
            p.put("q", q.strip());
            where.add("(a.name ILIKE '%' || :q || '%' OR c.name ILIKE '%' || :q || '%')");
        }
        LocalDate due = WorkspaceClock.parseDate(dueBy, "dueBy");
        if (due != null) {
            p.put("dueBy", Date.valueOf(due));
            where.add("a.due_on <= :dueBy");
        }

        int n = Cursor.limit(limit, DEFAULT_LIMIT, MAX_LIMIT);
        p.put("limit", n + 1);
        String from = " FROM assessment a JOIN client c ON c.id = a.client_id WHERE " + String.join(" AND ", where);
        var paged = new ArrayList<>(where);
        Cursor after = Cursor.decode(cursor);
        if (after != null) {
            // (due_on DESC, id ASC) — the index's own order, so the scan resumes in place.
            p.put("afterDue", Date.valueOf(WorkspaceClock.parseDate(after.key(), "cursor")));
            p.put("afterId", after.id().toString());
            paged.add("(a.due_on < :afterDue OR (a.due_on = :afterDue AND a.id > :afterId::uuid))");
        }
        String pageFrom = " FROM assessment a JOIN client c ON c.id = a.client_id WHERE " + String.join(" AND ", paged);

        var items = jdbc.query("""
                SELECT a.id::text AS id, a.client_id::text AS client_id, a.template_id::text AS template_id,
                       a.schedule_id::text AS schedule_id, a.name, a.due_on::text AS due_on,
                       %s AS state, a.completed_at, a.entered_by, a.created_at, a.updated_at,
                       (SELECT count(*) FROM jsonb_object_keys(a.readings)) AS readings_got,
                       jsonb_array_length(a.form -> 'measurements') AS readings_asked,
                       (SELECT count(*) FROM jsonb_object_keys(a.answers)) AS answers_got,
                       jsonb_array_length(a.form -> 'questions') AS answers_asked
                """.formatted(STATE_SQL) + pageFrom + " ORDER BY a.due_on DESC, a.id LIMIT :limit",
                p, (rs, i) -> {
                    Timestamp completed = rs.getTimestamp("completed_at");
                    return new Item(
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
        var page = com.inclineyou.inclineyou_backend.wire.Page.of(items, n, r -> Cursor.encode(r.dueOn(), r.id()));
        if (!includeTotal) return new Page(page.items(), page.nextCursor(), null, null);
        Integer total = jdbc.queryForObject("SELECT count(*)" + from, p, Integer.class);
        return new Page(page.items(), page.nextCursor(), total == null ? 0 : total, grandTotal(p, base));
    }

    private int grandTotal(Map<String, Object> p, List<String> base) {
        Integer n = jdbc.queryForObject(
                "SELECT count(*) FROM assessment a WHERE " + String.join(" AND ", base), p, Integer.class);
        return n == null ? 0 : n;
    }
}
