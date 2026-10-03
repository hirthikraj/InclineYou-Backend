package com.inclineyou.inclineyou_backend.core.payment;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import com.inclineyou.inclineyou_backend.shared.wire.Page;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.HashMap;
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

    private final NamedParameterJdbcTemplate jdbc;
    private final WorkspaceClock clock;
    private final PackageReadService packages;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Item(String kind, long at, String clientId, String clientName, String amount,
                       String method, String packageId, String packageName,
                       @com.fasterxml.jackson.annotation.JsonIgnore String cursorKey,
                       @com.fasterxml.jackson.annotation.JsonIgnore String id) {}

    public record Feed(String currency, java.util.List<Item> items, String nextCursor) {}

    public Feed activity(UUID trainerId, String from, String to, Integer limit, String cursor) {
        int n = Cursor.limit(limit, 8, 100);
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        var zone = clock.zone();
        LocalDate fromDate = WorkspaceClock.parseDate(from, "from");
        LocalDate toDate = WorkspaceClock.parseDate(to, "to");
        // Both sides carry the same window, so the merge only sorts what can appear.
        String window = "";
        if (fromDate != null) {
            p.put("from", Timestamp.from(WorkspaceClock.startOf(fromDate, zone)));
            window += " AND at >= :from";
        }
        if (toDate != null) {
            p.put("to", Timestamp.from(WorkspaceClock.startOf(toDate, zone)));
            window += " AND at < :to";
        }
        Cursor after = Cursor.decode(cursor);
        if (after != null) {
            p.put("afterAt", after.keyAsTimestamp());
            p.put("afterId", after.id().toString());
            window += " AND (at, id) < (:afterAt, :afterId::uuid)";
        }
        p.put("limit", n + 1);

        var rows = jdbc.query("""
                SELECT * FROM (
                    SELECT 'sold' AS kind, k.created_at AS at, k.id AS id, k.client_id, k.amount, NULL::varchar AS method,
                           k.id AS package_id, k.name AS package_name
                    FROM package k WHERE k.trainer_id = :tid::uuid AND k.deleted_at IS NULL
                    UNION ALL
                    SELECT y.status, CASE y.status WHEN 'paid' THEN y.paid_at WHEN 'write_off' THEN y.written_off_at
                                                   ELSE y.refunded_at END,
                           y.id, y.client_id, y.amount, y.method, y.package_id, k.name
                    FROM payment y JOIN package k ON k.id = y.package_id
                    WHERE y.trainer_id = :tid::uuid AND y.deleted_at IS NULL AND y.status IN ('paid', 'write_off', 'refund')
                ) e
                WHERE true""" + window + """

                ORDER BY at DESC, id DESC
                LIMIT :limit
                """, p, (rs, i) -> {
            Timestamp at = rs.getTimestamp("at");
            return new Item(rs.getString("kind"), at.getTime(), rs.getString("client_id"), null,
                    PackageReadService.money(rs.getBigDecimal("amount")), rs.getString("method"),
                    rs.getString("package_id"), rs.getString("package_name"), Cursor.key(at), rs.getString("id"));
        });
        var page = Page.of(rows, n, r -> Cursor.encode(r.cursorKey(), r.id()));

        // Names for the page only: one lookup for at most 100 clients.
        var ids = page.items().stream().map(Item::clientId).distinct().toList();
        var names = new HashMap<String, String>();
        if (!ids.isEmpty()) {
            jdbc.query("SELECT id::text AS id, name FROM client WHERE id IN (:ids)".replace(":ids",
                            ids.stream().map(x -> "'" + x + "'::uuid").collect(java.util.stream.Collectors.joining(","))),
                    rs -> { names.put(rs.getString("id"), rs.getString("name")); });
        }
        var items = page.items().stream().map(r -> new Item(r.kind(), r.at(), r.clientId(),
                names.get(r.clientId()), r.amount(), r.method(), r.packageId(), r.packageName(),
                r.cursorKey(), r.id())).toList();
        return new Feed(packages.workspaceCurrency(), items, page.nextCursor());
    }
}
