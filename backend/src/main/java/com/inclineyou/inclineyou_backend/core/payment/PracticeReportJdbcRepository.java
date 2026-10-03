package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.dto.MonthAmounts;
import com.inclineyou.inclineyou_backend.core.payment.dto.MonthCount;
import com.inclineyou.inclineyou_backend.core.payment.dto.Retention;
import com.inclineyou.inclineyou_backend.core.payment.dto.SessionMonth;
import com.inclineyou.inclineyou_backend.core.payment.dto.TopClient;
import com.inclineyou.inclineyou_backend.shared.util.Money;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The reads behind {@code GET /v1/reports/practice}: sessions, clients and money grouped by month
 * in the workspace's time zone. The definitions — what "active", "retention" or "billed" mean — are
 * {@link PracticeReportService}'s, written beside the numbers a trainer will quote.
 */
@Repository
@RequiredArgsConstructor
public class PracticeReportJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** The span's bounds, in the shapes its queries compare against. */
    public record Span(UUID trainerId, ZoneId zone, Instant from, Instant to, YearMonth first, YearMonth last) {
        Map<String, Object> params() {
            var p = new HashMap<String, Object>();
            p.put("tid", trainerId.toString());
            p.put("tz", zone.getId());
            p.put("fromAt", Timestamp.from(from));
            p.put("toAt", Timestamp.from(to));
            p.put("firstDay", Date.valueOf(first.atDay(1)));
            p.put("endDay", Date.valueOf(last.plusMonths(1).atDay(1)));
            return p;
        }
    }

    public List<SessionMonth> sessionsByMonth(Span s) {
        return jdbc.query("""
                SELECT to_char(scheduled_at AT TIME ZONE :tz, 'YYYY-MM') AS m,
                       count(*) FILTER (WHERE status = 'done') AS delivered,
                       count(*) FILTER (WHERE status = 'no_show') AS no_shows,
                       count(*) FILTER (WHERE status = 'cancelled') AS cancelled,
                       count(DISTINCT client_id) FILTER (WHERE status = 'done') AS active
                FROM scheduled_session
                WHERE trainer_id = :tid::uuid AND deleted_at IS NULL AND scheduled_at >= :fromAt AND scheduled_at < :toAt
                GROUP BY 1
                """, s.params(), (rs, i) -> new SessionMonth(rs.getString("m"), rs.getInt("delivered"),
                rs.getInt("no_shows"), rs.getInt("cancelled"), rs.getInt("active")));
    }

    public List<MonthCount> clientsCreatedByMonth(Span s) {
        return jdbc.query("""
                SELECT to_char(created_at AT TIME ZONE :tz, 'YYYY-MM') AS m, count(*) AS n
                FROM client WHERE trainer_id = :tid::uuid AND deleted_at IS NULL
                  AND created_at >= :fromAt AND created_at < :toAt GROUP BY 1
                """, s.params(), (rs, i) -> new MonthCount(rs.getString("m"), rs.getInt("n")));
    }

    public List<MonthCount> clientsArchivedByMonth(Span s) {
        return jdbc.query("""
                SELECT to_char(archived_at AT TIME ZONE :tz, 'YYYY-MM') AS m, count(*) AS n
                FROM client WHERE trainer_id = :tid::uuid AND deleted_at IS NULL
                  AND archived_at >= :fromAt AND archived_at < :toAt GROUP BY 1
                """, s.params(), (rs, i) -> new MonthCount(rs.getString("m"), rs.getInt("n")));
    }

    /** Packages billed per month by start_date; {@code a} is the billed sum. */
    public List<MonthAmounts> billedByMonth(Span s) {
        return jdbc.query("""
                SELECT to_char(start_date, 'YYYY-MM') AS m, sum(amount) AS billed
                FROM package WHERE trainer_id = :tid::uuid AND deleted_at IS NULL
                  AND start_date >= :firstDay AND start_date < :endDay GROUP BY 1
                """, s.params(), (rs, i) -> new MonthAmounts(rs.getString("m"), rs.getBigDecimal("billed"), null));
    }

    /** Paid payments per month by paid_at; {@code a} is collected, {@code b} the trainer's part of it. */
    public List<MonthAmounts> collectedByMonth(Span s) {
        return jdbc.query("""
                SELECT to_char(y.paid_at AT TIME ZONE :tz, 'YYYY-MM') AS m, sum(y.amount) AS collected,
                       sum(coalesce(sh.share, y.amount)) AS take_home
                FROM payment y LEFT JOIN payment_trainer_share sh ON sh.payment_id = y.id
                WHERE y.trainer_id = :tid::uuid AND y.deleted_at IS NULL AND y.status = 'paid'
                  AND y.paid_at >= :fromAt AND y.paid_at < :toAt GROUP BY 1
                """, s.params(), (rs, i) -> new MonthAmounts(rs.getString("m"), rs.getBigDecimal("collected"),
                rs.getBigDecimal("take_home")));
    }

    /** The books when the span began (created before, not archived before) and how many are still on them at its end. */
    public Retention retention(Span s) {
        return jdbc.queryForObject("""
                SELECT count(*) AS base, count(*) FILTER (WHERE archived_at IS NULL OR archived_at >= :toAt) AS kept
                FROM client WHERE trainer_id = :tid::uuid AND deleted_at IS NULL AND status <> 'prospect'
                  AND created_at < :fromAt AND (archived_at IS NULL OR archived_at >= :fromAt)
                """, s.params(), (rs, i) -> new Retention(rs.getLong("base"), rs.getLong("kept")));
    }

    public int clientsWithSessions(Span s) {
        Integer n = jdbc.queryForObject("""
                SELECT count(DISTINCT client_id) FROM scheduled_session
                WHERE trainer_id = :tid::uuid AND deleted_at IS NULL AND status = 'done'
                  AND scheduled_at >= :fromAt AND scheduled_at < :toAt
                """, s.params(), Integer.class);
        return n == null ? 0 : n;
    }

    public List<TopClient> topClients(Span s) {
        return jdbc.query("""
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
                """, s.params(), (rs, i) -> new TopClient(rs.getString("id"), rs.getString("name"), rs.getInt("sessions"),
                Money.format(rs.getBigDecimal("collected")), Money.format(rs.getBigDecimal("yours"))));
    }
}
