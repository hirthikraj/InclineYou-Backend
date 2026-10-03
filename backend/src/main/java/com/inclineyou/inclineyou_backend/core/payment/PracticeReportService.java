package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * {@code GET /v1/reports/practice} — api-contract Business: the practice's year in
 * twelve rows, replacing a year of raw sessions and the whole money book read into
 * the browser.
 *
 * <p>Definitions, because each is a number a trainer will quote:
 * <ul>
 *   <li><b>delivered / noShows / cancelled</b> — sessions by status, counted in the
 *       month of {@code scheduled_at} in the workspace's time zone.</li>
 *   <li><b>activeClients</b> — distinct clients with at least one delivered session
 *       that month.</li>
 *   <li><b>newClients / archived</b> — clients created / archived in the month.</li>
 *   <li><b>billed / collected / takeHome</b> — the Business L1 definitions:
 *       packages by {@code start_date}, paid payments by {@code paid_at}, and
 *       collected less the gym's part of it.</li>
 *   <li><b>retentionPercent</b> — of the clients on the books when the span began
 *       (created before it, not archived before it), the share not archived by its
 *       end, rounded to an integer; null when nobody was on the books.</li>
 *   <li><b>averageSessionsPerClientPerWeek</b> — delivered ÷ clients who had any ÷
 *       weeks elapsed in the span (to today if the span is still running), to one
 *       decimal; null when nothing was delivered.</li>
 *   <li><b>busiestMonth</b> — the month with the most delivered sessions; null when
 *       there are none, and the earliest month on a tie.</li>
 *   <li><b>topClients</b> — the top ten by money collected in the span, then by
 *       sessions; {@code yours} is the trainer's part of that collection.</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class PracticeReportService {

    private final NamedParameterJdbcTemplate jdbc;
    private final WorkspaceClock clock;
    private final PackageReadService packages;

    private static final int MAX_MONTHS = 24;

    public record Month(String month, int delivered, int noShows, int cancelled, int activeClients,
                        int newClients, int archived, String billed, String collected, String takeHome) {}

    public record Headline(int delivered, Integer retentionPercent, String busiestMonth,
                           Double averageSessionsPerClientPerWeek, String takeHome) {}

    public record TopClient(String clientId, String clientName, int sessions, String collected, String yours) {}

    public record Report(String currency, List<Month> months, Headline headline, List<TopClient> topClients) {}

    private static final class Acc {
        int delivered, noShows, cancelled, active, fresh, archived;
        BigDecimal billed = BigDecimal.ZERO, collected = BigDecimal.ZERO, takeHome = BigDecimal.ZERO;
    }

    public Report practice(UUID trainerId, Integer months) {
        int n = months == null ? 12 : months;
        if (n < 1) throw ApiException.validation("months: at least 1");
        if (n > MAX_MONTHS) throw ApiException.rangeTooLarge("months: at most " + MAX_MONTHS);
        var zone = clock.zone();
        YearMonth last = YearMonth.now(zone);
        YearMonth first = last.minusMonths(n - 1);
        Instant fromInstant = WorkspaceClock.startOf(first, zone);
        Instant toInstant = WorkspaceClock.startOf(last.plusMonths(1), zone);

        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("tz", zone.getId());
        p.put("fromAt", Timestamp.from(fromInstant));
        p.put("toAt", Timestamp.from(toInstant));
        p.put("firstDay", Date.valueOf(first.atDay(1)));
        p.put("endDay", Date.valueOf(last.plusMonths(1).atDay(1)));

        var acc = new HashMap<String, Acc>();
        jdbc.query("""
                SELECT to_char(scheduled_at AT TIME ZONE :tz, 'YYYY-MM') AS m,
                       count(*) FILTER (WHERE status = 'done') AS delivered,
                       count(*) FILTER (WHERE status = 'no_show') AS no_shows,
                       count(*) FILTER (WHERE status = 'cancelled') AS cancelled,
                       count(DISTINCT client_id) FILTER (WHERE status = 'done') AS active
                FROM scheduled_session
                WHERE trainer_id = :tid::uuid AND deleted_at IS NULL AND scheduled_at >= :fromAt AND scheduled_at < :toAt
                GROUP BY 1
                """, p, rs -> {
            var a = acc.computeIfAbsent(rs.getString("m"), k -> new Acc());
            a.delivered = rs.getInt("delivered");
            a.noShows = rs.getInt("no_shows");
            a.cancelled = rs.getInt("cancelled");
            a.active = rs.getInt("active");
        });
        jdbc.query("""
                SELECT to_char(created_at AT TIME ZONE :tz, 'YYYY-MM') AS m, count(*) AS n
                FROM client WHERE trainer_id = :tid::uuid AND deleted_at IS NULL
                  AND created_at >= :fromAt AND created_at < :toAt GROUP BY 1
                """, p, rs -> { acc.computeIfAbsent(rs.getString("m"), k -> new Acc()).fresh = rs.getInt("n"); });
        jdbc.query("""
                SELECT to_char(archived_at AT TIME ZONE :tz, 'YYYY-MM') AS m, count(*) AS n
                FROM client WHERE trainer_id = :tid::uuid AND deleted_at IS NULL
                  AND archived_at >= :fromAt AND archived_at < :toAt GROUP BY 1
                """, p, rs -> { acc.computeIfAbsent(rs.getString("m"), k -> new Acc()).archived = rs.getInt("n"); });
        jdbc.query("""
                SELECT to_char(start_date, 'YYYY-MM') AS m, sum(amount) AS billed
                FROM package WHERE trainer_id = :tid::uuid AND deleted_at IS NULL
                  AND start_date >= :firstDay AND start_date < :endDay GROUP BY 1
                """, p, rs -> { acc.computeIfAbsent(rs.getString("m"), k -> new Acc()).billed = rs.getBigDecimal("billed"); });
        jdbc.query("""
                SELECT to_char(y.paid_at AT TIME ZONE :tz, 'YYYY-MM') AS m, sum(y.amount) AS collected,
                       sum(coalesce(sh.share, y.amount)) AS take_home
                FROM payment y LEFT JOIN payment_trainer_share sh ON sh.payment_id = y.id
                WHERE y.trainer_id = :tid::uuid AND y.deleted_at IS NULL AND y.status = 'paid'
                  AND y.paid_at >= :fromAt AND y.paid_at < :toAt GROUP BY 1
                """, p, rs -> {
            var a = acc.computeIfAbsent(rs.getString("m"), k -> new Acc());
            a.collected = rs.getBigDecimal("collected");
            a.takeHome = rs.getBigDecimal("take_home");
        });

        var rows = new ArrayList<Month>(n);
        int delivered = 0;
        BigDecimal takeHome = BigDecimal.ZERO;
        String busiest = null;
        int busiestN = 0;
        for (YearMonth m = first; !m.isAfter(last); m = m.plusMonths(1)) {
            var a = acc.getOrDefault(m.toString(), new Acc());
            rows.add(new Month(m.toString(), a.delivered, a.noShows, a.cancelled, a.active, a.fresh, a.archived,
                    PackageReadService.money(a.billed), PackageReadService.money(a.collected),
                    PackageReadService.money(a.takeHome)));
            delivered += a.delivered;
            takeHome = takeHome.add(a.takeHome);
            if (a.delivered > busiestN) { busiestN = a.delivered; busiest = m.toString(); }
        }

        // Retention: the books when the span began, and who is still on them at its end.
        Map<String, Object> ret = jdbc.queryForMap("""
                SELECT count(*) AS base, count(*) FILTER (WHERE archived_at IS NULL OR archived_at >= :toAt) AS kept
                FROM client WHERE trainer_id = :tid::uuid AND deleted_at IS NULL AND status <> 'prospect'
                  AND created_at < :fromAt AND (archived_at IS NULL OR archived_at >= :fromAt)
                """, p);
        long base = ((Number) ret.get("base")).longValue();
        Integer retention = base == 0 ? null
                : (int) Math.round(((Number) ret.get("kept")).doubleValue() * 100 / base);

        Integer clientsWithSessions = jdbc.queryForObject("""
                SELECT count(DISTINCT client_id) FROM scheduled_session
                WHERE trainer_id = :tid::uuid AND deleted_at IS NULL AND status = 'done'
                  AND scheduled_at >= :fromAt AND scheduled_at < :toAt
                """, p, Integer.class);
        Double avg = null;
        if (delivered > 0 && clientsWithSessions != null && clientsWithSessions > 0) {
            Instant end = Instant.now().isBefore(toInstant) ? Instant.now() : toInstant;
            double weeks = Math.max(1.0, ChronoUnit.DAYS.between(fromInstant, end) / 7.0);
            avg = BigDecimal.valueOf(delivered / (double) clientsWithSessions / weeks)
                    .setScale(1, RoundingMode.HALF_UP).doubleValue();
        }

        var top = jdbc.query("""
                SELECT c.id::text AS id, c.name, coalesce(s.n, 0) AS sessions,
                       coalesce(y.collected, 0) AS collected, coalesce(y.yours, 0) AS yours
                FROM client c
                LEFT JOIN (SELECT client_id, count(*) AS n FROM scheduled_session
                           WHERE trainer_id = :tid::uuid AND deleted_at IS NULL AND status = 'done'
                             AND scheduled_at >= :fromAt AND scheduled_at < :toAt GROUP BY client_id) s ON s.client_id = c.id
                LEFT JOIN (SELECT y.client_id, sum(y.amount) AS collected, sum(coalesce(sh.share, y.amount)) AS yours
                           FROM payment y LEFT JOIN payment_trainer_share sh ON sh.payment_id = y.id
                           WHERE y.trainer_id = :tid::uuid AND y.deleted_at IS NULL AND y.status = 'paid'
                             AND y.paid_at >= :fromAt AND y.paid_at < :toAt GROUP BY y.client_id) y ON y.client_id = c.id
                WHERE c.trainer_id = :tid::uuid AND (s.n > 0 OR y.collected > 0)
                ORDER BY coalesce(y.collected, 0) DESC, coalesce(s.n, 0) DESC, c.id
                LIMIT 10
                """, p, (rs, i) -> new TopClient(rs.getString("id"), rs.getString("name"), rs.getInt("sessions"),
                PackageReadService.money(rs.getBigDecimal("collected")), PackageReadService.money(rs.getBigDecimal("yours"))));

        return new Report(packages.workspaceCurrency(), rows,
                new Headline(delivered, retention, busiest, avg, PackageReadService.money(takeHome)), top);
    }
}
