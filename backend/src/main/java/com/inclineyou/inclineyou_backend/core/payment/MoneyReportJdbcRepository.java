package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.dto.ActivityItem;
import com.inclineyou.inclineyou_backend.core.payment.dto.PackagesMonth;
import com.inclineyou.inclineyou_backend.core.payment.dto.PaymentsMonth;
import com.inclineyou.inclineyou_backend.shared.util.Money;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The aggregates behind the Business money screens: the monthly summary and the activity feed.
 * What "billed", "collected" and "take-home" MEAN is {@link MoneySummaryService}'s to say; this
 * class only groups rows. "Owed today" is {@link PackageJdbcRepository#dues}'s, so the package
 * ledger has one definition.
 */
@Repository
@RequiredArgsConstructor
public class MoneyReportJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    // ── summary ─────────────────────────────────────────────────────────

    /**
     * Packages sold per month by {@code start_date}: how many, what they billed, and the gym's part
     * of it ({@code gym_cut()}: the trainer's share is a percentage or a flat amount out of the
     * price; no share means the whole package is the trainer's).
     */
    public List<PackagesMonth> packagesByMonth(UUID trainerId, YearMonth from, YearMonth last) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("firstDay", Date.valueOf(from.atDay(1)));
        p.put("endDay", Date.valueOf(last.plusMonths(1).atDay(1)));
        return jdbc.query("""
                SELECT to_char(start_date, 'YYYY-MM') AS m, count(*) AS sold,
                       coalesce(sum(amount), 0) AS billed,
                       coalesce(sum(gym_cut(amount, trainer_share_percent, trainer_share_amount)), 0) AS gym_cut
                FROM package
                WHERE trainer_id = :tid::uuid AND deleted_at IS NULL
                  AND start_date >= :firstDay AND start_date < :endDay
                GROUP BY 1
                """, p, (rs, i) -> new PackagesMonth(rs.getString("m"), rs.getInt("sold"),
                rs.getBigDecimal("billed"), rs.getBigDecimal("gym_cut")));
    }

    /**
     * Every paid, refund and write-off row per month and status, in ONE pass over
     * {@code idx_payment_ledger (trainer_id, book_at DESC, id DESC)}. {@code book_at} (V7) is
     * {@code coalesce(paid_at, written_off_at, refunded_at, created_at)}, and {@code payment_state_shape}
     * makes exactly one of the three stamps non-null per status, so it IS the instant each kind is
     * counted at — paid by {@code paid_at}, a refund by {@code refunded_at}, a write-off by
     * {@code written_off_at}. It used to be three passes, one per status, and the write-off one had no
     * index of its own.
     *
     * <p>{@code takeHome} (paid rows only) is what was collected less the gym's part of it: the share
     * view only has rows for gym-desk payments, so a payment without one is entirely the trainer's.
     */
    public List<PaymentsMonth> paymentsByMonth(UUID trainerId, ZoneId zone, Instant from, Instant to) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("tz", zone.getId());
        p.put("fromAt", Timestamp.from(from));
        p.put("toAt", Timestamp.from(to));
        // The span's rows first; the share view is then asked for the packages of the span's paid
        // rows only (a value list on its partition column, which Postgres pushes below the view's
        // running total — a join on payment_id alone made it total the whole workspace's gym book).
        return jdbc.query("""
                WITH span AS MATERIALIZED (
                    SELECT y.id, y.package_id, y.status, y.amount, y.book_at
                    FROM payment y
                    WHERE y.trainer_id = :tid::uuid AND y.deleted_at IS NULL
                      AND y.status IN ('paid', 'refund', 'write_off')
                      AND y.book_at >= :fromAt AND y.book_at < :toAt
                )
                SELECT to_char(y.book_at AT TIME ZONE :tz, 'YYYY-MM') AS m, y.status, count(*) AS n, sum(y.amount) AS total,
                       sum(coalesce(sh.share, y.amount)) FILTER (WHERE y.status = 'paid') AS take_home
                FROM span y
                LEFT JOIN payment_trainer_share sh
                       ON sh.payment_id = y.id AND y.status = 'paid'
                      AND sh.package_id = ANY (ARRAY(SELECT package_id FROM span WHERE status = 'paid'))
                GROUP BY 1, 2
                """, p, (rs, i) -> new PaymentsMonth(rs.getString("m"), rs.getString("status"),
                rs.getInt("n"), rs.getBigDecimal("total"), rs.getBigDecimal("take_home")));
    }

    // ── activity feed ───────────────────────────────────────────────────

    /**
     * One UNION ALL of sales (a package, at its {@code created_at}) and payment rows (paid ·
     * write_off · refund, each at its own instant), every side bounded by the trainer and merged and
     * limited once, newest first. A pending payment is not an event. The row id is the package id for
     * a sale and the payment id otherwise, so the keyset {@code (at, id)} is unique. Client names are
     * not joined — {@link #clientNames} reads them for the page only.
     */
    public List<ActivityItem> feed(UUID trainerId, Instant from, Instant to, Cursor after, int limit) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        // Both sides carry the same window, so the merge only sorts what can appear.
        String window = "";
        if (from != null) {
            p.put("from", Timestamp.from(from));
            window += " AND at >= :from";
        }
        if (to != null) {
            p.put("to", Timestamp.from(to));
            window += " AND at < :to";
        }
        if (after != null) {
            p.put("afterAt", after.keyAsTimestamp());
            p.put("afterId", after.id().toString());
            window += " AND (at, id) < (:afterAt, :afterId::uuid)";
        }
        p.put("limit", limit);
        return jdbc.query("""
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
            return new ActivityItem(rs.getString("kind"), at.getTime(), rs.getString("client_id"), null,
                    Money.format(rs.getBigDecimal("amount")), rs.getString("method"),
                    rs.getString("package_id"), rs.getString("package_name"), Cursor.key(at), rs.getString("id"));
        });
    }

    /** Names for a page's clients: one lookup for at most 100 of them. */
    public Map<String, String> clientNames(Collection<String> ids) {
        var names = new HashMap<String, String>();
        if (ids.isEmpty()) return names;
        var uuids = ids.stream().map(UUID::fromString).toList();
        jdbc.query("SELECT id::text AS id, name FROM client WHERE id IN (:ids)", Map.of("ids", uuids),
                rs -> { names.put(rs.getString("id"), rs.getString("name")); });
        return names;
    }
}
