package com.inclineyou.inclineyou_backend.core.assessment;

import com.inclineyou.inclineyou_backend.core.assessment.dto.AssessmentFilter;
import com.inclineyou.inclineyou_backend.core.assessment.dto.AssessmentPage;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import com.inclineyou.inclineyou_backend.shared.wire.Page;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * {@code GET /v1/assessments} — the v1 list, used by Today (L10) and the Assessments screen.
 *
 * <p>{@code state} is DERIVED, never stored (V14): done once completed, booked while not completed and due today or
 * later, missed once past due. "Today" is the workspace's calendar day, so an assessment due on the 26th is still booked
 * at 23:30 in Chennai whatever the server's clock says. {@code waiting} (sent to the client and not back) is next
 * release, with the portal.
 *
 * <p>Timestamps are epoch ms since 1.1 — the V14 exception for ISO strings is dropped, since this wire breaks every
 * client anyway. One fixed order, {@code dueOn DESC, id}, walked by keyset; no page, size or sort any more. The SQL is
 * {@link AssessmentListJdbcRepository}'s; this class decides what the parameters mean.
 */
@Service
@RequiredArgsConstructor
public class AssessmentListService {

    private final AssessmentListJdbcRepository repo;
    private final WorkspaceClock clock;

    private static final Set<String> STATES = Set.of("booked", "missed", "done");
    private static final int DEFAULT_LIMIT = 50;
    private static final int MAX_LIMIT = 500;

    /**
     * @param state  comma list of booked · missed · done; an unknown name is a 400
     * @param q      the assessment's or the client's name, case-insensitive
     * @param dueBy  due on or before this date — Today's "owed today or earlier"
     */
    public AssessmentPage list(UUID trainerId, String state, String clientId, String q, String dueBy,
                               Integer limit, String cursor, boolean includeTotal) {
        var wanted = new LinkedHashSet<String>();
        if (state != null && !state.isBlank()) for (String s : state.split(",")) {
            if (!STATES.contains(s.strip())) throw ApiException.validation("state: unknown value " + s.strip());
            wanted.add(s.strip());
        }
        UUID client = null;
        if (clientId != null && !clientId.isBlank()) {
            try {
                client = UUID.fromString(clientId.strip());
            } catch (IllegalArgumentException e) {
                throw ApiException.validation("clientId: not a client id");
            }
        }
        var filter = new AssessmentFilter(trainerId, WorkspaceClock.today(clock.zone()), List.copyOf(wanted), client,
                q == null || q.isBlank() ? null : q.strip(), WorkspaceClock.parseDate(dueBy, "dueBy"));

        int n = Cursor.limit(limit, DEFAULT_LIMIT, MAX_LIMIT);
        Cursor after = Cursor.decode(cursor);
        LocalDate afterDue = after == null ? null : WorkspaceClock.parseDate(after.key(), "cursor");
        var page = Page.of(repo.page(filter, after, afterDue, n + 1), n, r -> Cursor.encode(r.dueOn(), r.id()));
        if (!includeTotal) return new AssessmentPage(page.items(), page.nextCursor(), null, null);
        return new AssessmentPage(page.items(), page.nextCursor(), repo.count(filter), repo.grandTotal(filter));
    }
}
