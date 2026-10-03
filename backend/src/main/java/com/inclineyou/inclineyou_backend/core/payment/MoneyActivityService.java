package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.dto.ActivityFeed;
import com.inclineyou.inclineyou_backend.core.payment.dto.ActivityItem;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import com.inclineyou.inclineyou_backend.shared.wire.Page;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * {@code GET /v1/money/activity} — api-contract Business: what happened in the
 * money book, newest first. It replaces {@code computeActivity}, which worked over
 * the whole book in the browser.
 *
 * <p>One UNION ALL of sales (a package, at its {@code created_at}) and payment rows
 * (paid · write_off · refund, each at its own instant), every side bounded by the
 * trainer and the window and merged and limited once. A pending payment is not an
 * event — nothing has happened to the money yet. The row id is the package id for a
 * sale and the payment id otherwise, so the keyset {@code (at, id)} is unique.
 */
@Service
@RequiredArgsConstructor
public class MoneyActivityService {

    private final MoneyReportJdbcRepository reports;
    private final WorkspaceClock clock;

    public ActivityFeed activity(UUID trainerId, String from, String to, Integer limit, String cursor) {
        int n = Cursor.limit(limit, 8, 100);
        var zone = clock.zone();
        LocalDate fromDate = WorkspaceClock.parseDate(from, "from");
        LocalDate toDate = WorkspaceClock.parseDate(to, "to");
        Instant fromAt = fromDate == null ? null : WorkspaceClock.startOf(fromDate, zone);
        Instant toAt = toDate == null ? null : WorkspaceClock.startOf(toDate, zone);
        Cursor after = Cursor.decode(cursor);

        var rows = reports.feed(trainerId, fromAt, toAt, after, n + 1);
        var page = Page.of(rows, n, r -> Cursor.encode(r.cursorKey(), r.id()));

        // Names for the page only: one lookup for at most 100 clients.
        var names = reports.clientNames(page.items().stream().map(ActivityItem::clientId).distinct().toList());
        var items = page.items().stream().map(r -> new ActivityItem(r.kind(), r.at(), r.clientId(),
                names.get(r.clientId()), r.amount(), r.method(), r.packageId(), r.packageName(),
                r.cursorKey(), r.id())).toList();
        return new ActivityFeed(clock.currency(), items, page.nextCursor());
    }
}
