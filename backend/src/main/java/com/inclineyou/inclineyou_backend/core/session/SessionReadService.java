package com.inclineyou.inclineyou_backend.core.session;

import com.inclineyou.inclineyou_backend.core.session.dto.SessionRow;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import com.inclineyou.inclineyou_backend.shared.wire.Page;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashSet;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * {@code GET /v1/sessions?from=&to=} — api-contract Today L4, the diary read the Schedule and the client file share.
 *
 * <p>There is no {@code workout_session} in v1: a session's log IS the {@code scheduled_session} row
 * ({@code started_at} / {@code ended_at}). So <i>running</i>, <i>open log</i> and <i>late</i> are all read off these
 * rows, and the live set count rides on each one — the old screen's conditional second round-trip for the running
 * session's sets is gone. The SQL is {@link SessionJdbcRepository}'s; this class decides what a window means.
 */
@Service
@RequiredArgsConstructor
public class SessionReadService {

    private final SessionJdbcRepository repo;
    private final WorkspaceClock clock;

    /**
     * A window a year wide is already more than any screen draws; the cap keeps a hand-typed {@code from=2000-01-01}
     * from turning into an unbounded read.
     */
    private static final long MAX_WINDOW_DAYS = 400;

    static final Set<String> STATUSES = Set.of("scheduled", "done", "no_show", "cancelled");

    static final int DEFAULT_LIMIT = 500;
    static final int MAX_LIMIT = 1000;

    /**
     * @param from   inclusive date, workspace timezone
     * @param to     exclusive date — Today asks for 30 days back through the end of tomorrow, so {@code to} is the day
     *               after tomorrow
     * @param status optional comma list of {@link #STATUSES}
     * @param order  {@code asc} (default) or {@code desc} — the client file's Sessions tab
     */
    public Page<SessionRow> list(UUID trainerId, String from, String to, String clientId, String status,
                                 Integer limit, String cursor, String order) {
        LocalDate fromDate = WorkspaceClock.parseDate(from, "from");
        LocalDate toDate = WorkspaceClock.parseDate(to, "to");
        if (fromDate == null || toDate == null) {
            throw ApiException.validation("from and to are required (yyyy-MM-dd)");
        }
        if (!toDate.isAfter(fromDate)) {
            throw ApiException.validation("to must be after from");
        }
        if (ChronoUnit.DAYS.between(fromDate, toDate) > MAX_WINDOW_DAYS) {
            throw ApiException.rangeTooLarge("window is limited to " + MAX_WINDOW_DAYS + " days");
        }
        boolean desc;
        if (order == null || order.isBlank() || "asc".equals(order.strip())) desc = false;
        else if ("desc".equals(order.strip())) desc = true;
        else throw ApiException.validation("order: asc or desc");
        int n = Cursor.limit(limit, DEFAULT_LIMIT, MAX_LIMIT);
        Cursor after = Cursor.decode(cursor);

        UUID client = null;
        if (clientId != null && !clientId.isBlank()) {
            try {
                client = UUID.fromString(clientId.strip());
            } catch (IllegalArgumentException e) {
                throw ApiException.validation("clientId: not a client id");
            }
        }
        var wanted = new LinkedHashSet<String>();
        if (status != null && !status.isBlank()) {
            for (String one : status.split(",")) {
                if (!STATUSES.contains(one.strip())) throw ApiException.validation("status: unknown value " + one.strip());
                wanted.add(one.strip());
            }
        }

        var zone = clock.zone();
        var rows = repo.page(trainerId, WorkspaceClock.startOf(fromDate, zone), WorkspaceClock.startOf(toDate, zone),
                client, java.util.List.copyOf(wanted), after, desc, n + 1);
        return Page.of(rows, n, r -> Cursor.encode(r.cursorKey(), r.id()));
    }

    /** One session in the L4 shape — what a write that creates or changes one answers with. */
    public Optional<SessionRow> one(UUID trainerId, UUID sessionId) {
        return repo.one(trainerId, sessionId);
    }

    /** {@code GET /v1/sessions/{id}}: the same row the list draws, 404 when it is not this trainer's live session. */
    public SessionRow get(UUID trainerId, UUID sessionId) {
        return repo.one(trainerId, sessionId).orElseThrow(() -> ApiException.notFound("That session is not in your diary."));
    }
}
