package com.inclineyou.inclineyou_backend.core.assessment;

import com.inclineyou.inclineyou_backend.core.assessment.dto.AssessmentFilter;
import com.inclineyou.inclineyou_backend.core.assessment.dto.AssessmentPage;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import com.inclineyou.inclineyou_backend.shared.wire.Page;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
 * at 23:30 in Chennai whatever the server's clock says. There is no {@code waiting} state, deliberately (owner, 9 Nov
 * 2026): an assessment sent to the client ({@code sentAt} set) can still be taken by the trainer, on the floor after
 * a session, so it stays booked or missed and Today keeps offering Take; the row's {@code sentAt} says it was sent.
 *
 * <p>Timestamps are epoch ms since 1.1 — the V14 exception for ISO strings is dropped, since this wire breaks every
 * client anyway. Walked by keyset; no page or size. Two orders (23 Nov 2026): {@code due} — {@code dueOn DESC, id}, the
 * default, which Today and the client file read — and {@code work}, the Assessments screen's sections across every page:
 * To take (oldest owed first) · To review · Reviewed (newest first). The SQL is
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
    /** The longest search worth sending: an assessment or client name is far shorter. */
    static final int MAX_Q = 100;

    /**
     * @param state  comma list of booked · missed · done; an unknown name is a 400
     * @param q      the assessment's or the client's name, case-insensitive, matched as typed: {@code %} and {@code _}
     *               are literal characters, not wildcards; at most {@link #MAX_Q} characters
     * @param dueBy  due on or before this date — Today's "owed today or earlier"
     * @param reviewed true: done and reviewed; false: done and still to review; absent: either (23 Nov 2026)
     * @param order  {@code due} (default) or {@code work}; anything else is a 400
     *
     * <p>One read-only transaction: the workspace's timezone, the page and the two optional totals share one connection.
     */
    @Transactional(readOnly = true)
    public AssessmentPage list(UUID trainerId, String state, String clientId, String q, String dueBy,
                               Boolean reviewed, String order, Integer limit, String cursor, boolean includeTotal) {
        var sort = order == null || order.isBlank() || order.strip().equals("due") ? AssessmentListJdbcRepository.Order.DUE
                : order.strip().equals("work") ? AssessmentListJdbcRepository.Order.WORK
                : null;
        if (sort == null) throw ApiException.validation("order: unknown value " + order.strip());
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
        String search = q == null || q.isBlank() ? null : q.strip();
        if (search != null && search.length() > MAX_Q) throw ApiException.validation("q: at most " + MAX_Q + " characters");
        LocalDate due = WorkspaceClock.parseDate(dueBy, "dueBy");
        var filter = new AssessmentFilter(trainerId, WorkspaceClock.today(clock.zone()), List.copyOf(wanted), client,
                search, due, reviewed);

        int n = Cursor.limit(limit, DEFAULT_LIMIT, MAX_LIMIT);
        // The cursor names the filters it came from; sent back with others it is a 400, not a page from nowhere.
        // The work order adds itself to the mark, so a cursor from one order is a 400 in the other; the date order's mark
        // is the one it has always been, so a cursor already in flight still resumes.
        String states = String.join(",", new java.util.TreeSet<>(wanted));
        String query = sort == AssessmentListJdbcRepository.Order.WORK
                ? Cursor.mark(states, client, search, due, reviewed, "work")
                : Cursor.mark(states, client, search, due, reviewed);
        Cursor after = Cursor.within(cursor, query);
        boolean work = sort == AssessmentListJdbcRepository.Order.WORK;
        LocalDate afterDue = after == null || work ? null : WorkspaceClock.parseDate(after.key(), "cursor");
        var afterWork = after == null || !work ? null : AssessmentListJdbcRepository.WorkKey.parse(after.key());
        // A client not on this trainer's roster is a 404, as every route answers — an empty list would read as "none owed".
        if (client != null && !repo.clientIsMine(trainerId, client)) {
            throw ApiException.notFound("That client is not on your roster.");
        }
        var page = Page.of(repo.page(filter, sort, after, afterDue, afterWork, n + 1), n,
                r -> Cursor.encodeFor(query, work ? AssessmentListJdbcRepository.WorkKey.of(r).text() : r.dueOn(), r.id()));
        if (!includeTotal) return new AssessmentPage(page.items(), page.nextCursor(), null, null);
        return new AssessmentPage(page.items(), page.nextCursor(), repo.count(filter), repo.grandTotal(filter));
    }
}
