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
                WHERE k.trainer_id = :tid::uuid AND k.deleted_at IS NULL
                  AND k.start_date >= :firstDay AND k.start_date < :endDay
                """.formatted(HAS_SHARE, TAKE), span(tid, first, last), (rs, i) -> new GymSaleStats(
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
                WHERE k.trainer_id = :tid::uuid AND k.deleted_at IS NULL AND %1$s
                  AND k.start_date >= :firstDay AND k.start_date < :endDay
                GROUP BY 1
                """.formatted(HAS_SHARE, TAKE), span(tid, first, last), rs -> {
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
}
