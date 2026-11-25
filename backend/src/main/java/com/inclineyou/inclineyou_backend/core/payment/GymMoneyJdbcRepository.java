package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.dto.GymPack;
import com.inclineyou.inclineyou_backend.core.payment.dto.GymSaleStats;
import com.inclineyou.inclineyou_backend.core.payment.dto.MonthShare;
import com.inclineyou.inclineyou_backend.core.payment.dto.PackSales;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The reads behind {@code GET /v1/money/gym}: the span's sales split by who keeps what, and the
 * money the gym took for the trainer by month. What "floor" and "owed" mean is
 * {@link GymMoneyService}'s; the pay terms and payouts are {@link GymArrangementJdbcRepository}'s
 * and {@link TrainerPayoutJdbcRepository}'s.
 */
@Repository
@RequiredArgsConstructor
public class GymMoneyJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** Trainer's part of one package, as SQL: a percentage or a flat amount, else all of it. */
    private static final String TAKE = "(k.amount - gym_cut(k.amount, k.trainer_share_percent, k.trainer_share_amount))";
    /** "Floor" is a package sold with a share (a gym pack, floor only by the schema). */
    private static final String HAS_SHARE = "(k.trainer_share_percent IS NOT NULL OR k.trainer_share_amount IS NOT NULL)";
    /**
     * A sale that happened (20 Nov 2026): a single session is sold when it is booked, and a cancel or an uncharged
     * no-show keeps the sale as status cancelled with nothing owed — not a sale, so not billed, not a session, not
     * take-home. The same rule as MoneyReportJdbcRepository.packagesByMonth.
     */
    private static final String SOLD = "NOT (k.session_id IS NOT NULL AND k.status = 'cancelled')";

    private static Map<String, Object> span(UUID tid, YearMonth first, YearMonth last) {
        var p = new HashMap<String, Object>();
        p.put("tid", tid.toString());
        p.put("firstDay", Date.valueOf(first.atDay(1)));
        p.put("endDay", Date.valueOf(last.plusMonths(1).atDay(1)));
        return p;
    }

    /** Stats: floor (gym packs) vs the trainer's own books, by the package's start month. */
    public GymSaleStats saleStats(UUID tid, YearMonth first, YearMonth last) {
        return jdbc.queryForObject("""
                SELECT coalesce(sum(k.amount) FILTER (WHERE %1$s), 0) AS floor_billed,
                       coalesce(sum(k.sessions_total) FILTER (WHERE %1$s), 0) AS floor_sessions,
                       coalesce(sum(k.amount - %2$s) FILTER (WHERE %1$s), 0) AS gym_cut,
                       coalesce(sum(k.amount) FILTER (WHERE NOT %1$s), 0) AS remote_billed,
                       coalesce(sum(k.sessions_total) FILTER (WHERE NOT %1$s), 0) AS remote_sessions
                FROM package k
                WHERE k.trainer_id = :tid::uuid AND k.deleted_at IS NULL AND %3$s
                  AND k.start_date >= :firstDay AND k.start_date < :endDay
                """.formatted(HAS_SHARE, TAKE, SOLD), span(tid, first, last), (rs, i) -> new GymSaleStats(
                rs.getBigDecimal("floor_billed"), rs.getLong("floor_sessions"), rs.getBigDecimal("gym_cut"),
                rs.getBigDecimal("remote_billed"), rs.getLong("remote_sessions")));
    }

    /**
     * Gym-share sales grouped by the pack a package came from ('' for a custom sale). Each package's
     * OWN share is what counts, since a sale may override the pack's.
     */
    public Map<String, PackSales> salesByPack(UUID tid, YearMonth first, YearMonth last) {
        var sold = new LinkedHashMap<String, PackSales>();
        jdbc.query("""
                SELECT coalesce(k.pack_id::text, '') AS pid, count(*) AS sold, sum(k.amount) AS billed,
                       sum(%2$s) AS take, max(pk.name) AS pname, max(pk.amount) AS pamount,
                       max(pk.trainer_share_percent) AS ppct, max(pk.trainer_share_amount) AS pamt,
                       max(pk.order_index) AS ord
                FROM package k LEFT JOIN pack pk ON pk.id = k.pack_id
                WHERE k.trainer_id = :tid::uuid AND k.deleted_at IS NULL AND %1$s AND %3$s
                  AND k.start_date >= :firstDay AND k.start_date < :endDay
                GROUP BY 1
                """.formatted(HAS_SHARE, TAKE, SOLD), span(tid, first, last), rs -> {
            sold.put(rs.getString("pid"), new PackSales(rs.getInt("sold"), rs.getBigDecimal("billed"), rs.getBigDecimal("take")));
        });
        return sold;
    }

    /** The price list's active gym packs, in the trainer's own order. */
    public List<GymPack> activeGymPacks(UUID tid) {
        return jdbc.query("""
                SELECT id::text AS id, name, amount, trainer_share_percent, trainer_share_amount
                FROM pack WHERE trainer_id = :tid::uuid AND deleted_at IS NULL AND owner = 'gym' AND status = 'active'
                ORDER BY order_index, id""", Map.of("tid", tid.toString()),
                (rs, i) -> new GymPack(rs.getString("id"), rs.getString("name"), rs.getBigDecimal("amount"),
                        rs.getBigDecimal("trainer_share_percent"), rs.getBigDecimal("trainer_share_amount")));
    }

    /** A retired or deleted pack that still sold in the span. */
    public GymPack pack(String packId) {
        return jdbc.queryForObject("SELECT id::text AS id, name, amount, trainer_share_percent, trainer_share_amount FROM pack WHERE id = :id::uuid",
                Map.of("id", packId), (rs, i) -> new GymPack(rs.getString("id"), rs.getString("name"), rs.getBigDecimal("amount"),
                        rs.getBigDecimal("trainer_share_percent"), rs.getBigDecimal("trainer_share_amount")));
    }

    /** Money the gym took for the trainer, by the month it counts in (refunds already negative). */
    public List<MonthShare> shareByMonth(UUID tid, ZoneId zone) {
        return jdbc.query("""
                SELECT to_char(coalesce(paid_at, refunded_at) AT TIME ZONE :tz, 'YYYY-MM') AS m,
                       sum(share) AS s, count(DISTINCT client_id) AS c
                FROM payment_trainer_share WHERE trainer_id = :tid::uuid GROUP BY 1""",
                Map.of("tid", tid.toString(), "tz", zone.getId()),
                (rs, i) -> new MonthShare(rs.getString("m"), rs.getBigDecimal("s"), rs.getInt("c")));
    }

    /**
     * The statement's sales for a span: new sales and renewals (a client who had any earlier pack), and what was billed split
     * by who found the client — the gym's front desk (V48 {@code lead_source = 'gym_desk'}) or the trainer.
     */
    public Map<String, Object> statementSales(UUID tid, YearMonth first, YearMonth last) {
        return jdbc.queryForMap("""
                SELECT count(*) FILTER (WHERE NOT prior) AS new_sales, count(*) FILTER (WHERE prior) AS renewals,
                       coalesce(sum(amount) FILTER (WHERE desk), 0) AS billed_desk,
                       coalesce(sum(amount) FILTER (WHERE NOT desk), 0) AS billed_you
                FROM (SELECT k.amount, c.lead_source IS NOT DISTINCT FROM 'gym_desk' AS desk,
                             EXISTS (SELECT 1 FROM package k2 WHERE k2.client_id = k.client_id AND k2.deleted_at IS NULL
                                       AND k2.session_id IS NULL AND k2.created_at < k.created_at) AS prior
                        FROM package k JOIN client c ON c.id = k.client_id
                       WHERE k.trainer_id = :tid::uuid AND k.deleted_at IS NULL AND %1$s AND %2$s
                         AND k.start_date >= :firstDay AND k.start_date < :endDay) x
                """.formatted(HAS_SHARE, SOLD), span(tid, first, last));
    }

    /** Gym clients' sessions the trainer marked done in the span, on the workspace's calendar: how many, and for how many people. */
    public Map<String, Object> statementSessions(UUID tid, YearMonth first, YearMonth last, ZoneId zone) {
        var p = span(tid, first, last);
        p.put("tz", zone.getId());
        return jdbc.queryForMap("""
                SELECT count(*) AS sessions, count(DISTINCT s.client_id) AS clients
                FROM scheduled_session s JOIN client c ON c.id = s.client_id
                WHERE s.trainer_id = :tid::uuid AND c.client_type = 'gym' AND s.status = 'done' AND s.logged_by = 'trainer'
                  AND s.deleted_at IS NULL
                  AND (s.scheduled_at AT TIME ZONE :tz)::date >= :firstDay AND (s.scheduled_at AT TIME ZONE :tz)::date < :endDay
                """, p);
    }

    /** What the gym paid the trainer: in the span (by the day it arrived), and ever. */
    public Map<String, Object> payoutsReceived(UUID tid, YearMonth first, YearMonth last, ZoneId zone) {
        var p = span(tid, first, last);
        p.put("tz", zone.getId());
        return jdbc.queryForMap("""
                SELECT coalesce(sum(amount) FILTER (WHERE (received_at AT TIME ZONE :tz)::date >= :firstDay
                                                     AND (received_at AT TIME ZONE :tz)::date < :endDay), 0) AS in_span,
                       coalesce(sum(amount), 0) AS ever
                FROM trainer_payout WHERE trainer_id = :tid::uuid AND deleted_at IS NULL
                """, p);
    }

    /** Every gym-pack sale ever: since when, how many, billed, the gym's part and the trainer's. */
    public Map<String, Object> lifetime(UUID tid) {
        return jdbc.queryForMap("""
                SELECT to_char(min(k.start_date), 'YYYY-MM') AS since, count(*) AS sales, coalesce(sum(k.amount), 0) AS billed,
                       coalesce(sum(k.amount - %2$s), 0) AS gym_cut, coalesce(sum(%2$s), 0) AS yours
                FROM package k
                WHERE k.trainer_id = :tid::uuid AND k.deleted_at IS NULL AND %1$s AND %3$s
                """.formatted(HAS_SHARE, TAKE, SOLD), Map.of("tid", tid.toString()));
    }
}
