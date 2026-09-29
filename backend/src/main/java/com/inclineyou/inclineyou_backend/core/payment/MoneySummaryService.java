package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * {@code GET /v1/money/summary} — api-contract Business L1, which Today L6 is the
 * same endpoint of ({@code months=2}). One shape, shared, so nothing Today built
 * has to change again when Business lands (R65).
 *
 * <p>What the figures mean (R4, R3, R84): <b>billed</b> is Σ {@code amount} of
 * packages whose {@code start_date} falls in the month — {@code amount} is
 * already net of the discount, so the discount is not subtracted again — and
 * every sale counts whatever happened to it later: a sale is a sale, and what
 * was forgiven or given back shows in {@code writtenOff} and {@code refunded}.
 * <b>collected</b> is paid payments by {@code paid_at}. The gym's cut comes off
 * each package's own trainer share, not a trainer-wide percentage.
 *
 * <p>{@code now} is as of today, not as of the span — pending and overdue belong
 * to no month, which is why 1.1 moved them out of every month row. Gym
 * arrangement base fees are settlement, not billing, and are left out.
 *
 * <p>Cost: one grouped query per source (packages by start_date, paid payments
 * on idx_payment_book, refunds on idx_payment_refunds, write-offs) and one pass
 * over the L5 ledger for {@code now} — never a loop per month or per client.
 */
@Service
@RequiredArgsConstructor
public class MoneySummaryService {

    private final NamedParameterJdbcTemplate jdbc;
    private final WorkspaceClock clock;
    private final PackageReadService packages;

    private static final int MAX_MONTHS = 24;
    /** "Overdue" is owed past its due date by more than this. */
    private static final int OVERDUE_GRACE_DAYS = 7;

    public record Month(
            String month,
            String billed,
            String collected,
            String gymCut,
            String yours,
            String writtenOff,
            String refunded,
            int packagesSold,
            int paymentsCount
    ) {}

    /** The month fields summed over the span, plus the trend on billed. */
    public record Total(
            String billed,
            String collected,
            String gymCut,
            String yours,
            String writtenOff,
            String refunded,
            int packagesSold,
            int paymentsCount,
            /** Billed against the same-length span before it; null when that span billed 0. */
            Double trendPercent
    ) {}

    public record Now(String pending, String overdue, int clientsOwing, int clientsOverdue) {}

    public record Summary(String currency, List<Month> months, Total total, Now now) {}

    /** Mutable accumulator for one month while the grouped rows are folded in. */
    private static final class Acc {
        BigDecimal billed = BigDecimal.ZERO, gymCut = BigDecimal.ZERO, collected = BigDecimal.ZERO,
                writtenOff = BigDecimal.ZERO, refunded = BigDecimal.ZERO;
        int sold, payments;
    }

    /**
     * @param months how many months ending with the current one; or
     * @param from   {@code yyyy-MM}, inclusive, with
     * @param to     {@code yyyy-MM}, inclusive
     */
    public Summary summary(UUID trainerId, Integer months, String from, String to) {
        var zone = clock.zone();
        YearMonth thisMonth = YearMonth.now(zone);
        YearMonth first, last;
        if (from != null || to != null) {
            if (months != null) throw ApiException.validation("months: use either months or from/to");
            first = month(from, "from");
            last = month(to, "to");
            if (first == null || last == null) throw ApiException.validation("from and to: both, as yyyy-MM");
            if (last.isBefore(first)) throw ApiException.validation("to: must not be before from");
        } else {
            int n = months == null ? 1 : months;
            if (n < 1) throw ApiException.validation("months: at least 1");
            if (n > MAX_MONTHS) throw ApiException.rangeTooLarge("months: at most " + MAX_MONTHS);
            last = thisMonth;
            first = thisMonth.minusMonths(n - 1);
        }
        int span = (int) (first.until(last, java.time.temporal.ChronoUnit.MONTHS) + 1);
        if (span > MAX_MONTHS) throw ApiException.rangeTooLarge("at most " + MAX_MONTHS + " months in one request");

        // The span before, for the trend, is read in the same queries.
        YearMonth readFrom = first.minusMonths(span);
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("tz", zone.getId());
        p.put("firstDay", Date.valueOf(readFrom.atDay(1)));
        p.put("endDay", Date.valueOf(last.plusMonths(1).atDay(1)));
        p.put("fromAt", Timestamp.from(WorkspaceClock.startOf(readFrom, zone)));
        p.put("toAt", Timestamp.from(WorkspaceClock.startOf(last.plusMonths(1), zone)));

        var acc = new HashMap<String, Acc>();
        /*
         * The trainer's share is either a percentage or a flat amount out of the
         * package price; the gym keeps the rest. No share means the whole package
         * is the trainer's.
         */
        jdbc.query("""
                SELECT to_char(start_date, 'YYYY-MM') AS m, count(*) AS sold,
                       coalesce(sum(amount), 0) AS billed,
                       coalesce(sum(CASE
                           WHEN trainer_share_percent IS NOT NULL THEN amount * (100 - trainer_share_percent) / 100
                           WHEN trainer_share_amount IS NOT NULL THEN greatest(amount - trainer_share_amount, 0)
                           ELSE 0 END), 0) AS gym_cut
                FROM package
                WHERE trainer_id = :tid::uuid AND deleted_at IS NULL
                  AND start_date >= :firstDay AND start_date < :endDay
                GROUP BY 1
                """, p, rs -> {
            var a = acc.computeIfAbsent(rs.getString("m"), k -> new Acc());
            a.sold = rs.getInt("sold");
            a.billed = rs.getBigDecimal("billed");
            a.gymCut = rs.getBigDecimal("gym_cut");
        });
        // One pass per status column, each on its own partial index.
        for (String[] kind : new String[][]{{"paid", "paid_at"}, {"refund", "refunded_at"}, {"write_off", "written_off_at"}}) {
            jdbc.query("""
                    SELECT to_char(%1$s AT TIME ZONE :tz, 'YYYY-MM') AS m, count(*) AS n, sum(amount) AS total
                    FROM payment
                    WHERE trainer_id = :tid::uuid AND deleted_at IS NULL AND status = '%2$s'
                      AND %1$s >= :fromAt AND %1$s < :toAt
                    GROUP BY 1
                    """.formatted(kind[1], kind[0]), p, rs -> {
                var a = acc.computeIfAbsent(rs.getString("m"), k -> new Acc());
                switch (kind[0]) {
                    case "paid" -> { a.collected = rs.getBigDecimal("total"); a.payments = rs.getInt("n"); }
                    case "refund" -> a.refunded = rs.getBigDecimal("total");
                    default -> a.writtenOff = rs.getBigDecimal("total");
                }
            });
        }

        // Oldest first, one row per month, zero rows included.
        var out = new ArrayList<Month>(span);
        var sum = new Acc();
        BigDecimal billedBefore = BigDecimal.ZERO;
        for (YearMonth m = readFrom; !m.isAfter(last); m = m.plusMonths(1)) {
            var a = acc.getOrDefault(m.toString(), new Acc());
            if (m.isBefore(first)) {
                billedBefore = billedBefore.add(a.billed);
                continue;
            }
            out.add(new Month(m.toString(), money(a.billed), money(a.collected), money(a.gymCut),
                    money(a.billed.subtract(a.gymCut)), money(a.writtenOff), money(a.refunded),
                    a.sold, a.payments));
            sum.billed = sum.billed.add(a.billed);
            sum.gymCut = sum.gymCut.add(a.gymCut);
            sum.collected = sum.collected.add(a.collected);
            sum.writtenOff = sum.writtenOff.add(a.writtenOff);
            sum.refunded = sum.refunded.add(a.refunded);
            sum.sold += a.sold;
            sum.payments += a.payments;
        }
        Double trend = billedBefore.signum() == 0 ? null
                : sum.billed.subtract(billedBefore).multiply(BigDecimal.valueOf(100))
                        .divide(billedBefore, 1, RoundingMode.HALF_UP).doubleValue();
        var total = new Total(money(sum.billed), money(sum.collected), money(sum.gymCut),
                money(sum.billed.subtract(sum.gymCut)), money(sum.writtenOff), money(sum.refunded),
                sum.sold, sum.payments, trend);

        // Now — on the same ledger L5 uses, so "owed" on a pack and "pending"
        // here cannot disagree.
        p.put("overdueBefore", Date.valueOf(WorkspaceClock.today(zone).minusDays(OVERDUE_GRACE_DAYS)));
        Map<String, Object> now = jdbc.queryForMap("WITH " + PackageReadService.LEDGER_CTE + """
                SELECT coalesce(sum(amount_due), 0) AS pending,
                       coalesce(sum(amount_due) FILTER (WHERE due_date < :overdueBefore), 0) AS overdue,
                       count(DISTINCT client_id) FILTER (WHERE amount_due > 0) AS owing,
                       count(DISTINCT client_id) FILTER (WHERE amount_due > 0 AND due_date < :overdueBefore) AS overdue_clients
                FROM ledger
                """, p);

        return new Summary(packages.workspaceCurrency(), out, total, new Now(
                money((BigDecimal) now.get("pending")),
                money((BigDecimal) now.get("overdue")),
                ((Number) now.get("owing")).intValue(),
                ((Number) now.get("overdue_clients")).intValue()));
    }

    private static YearMonth month(String raw, String param) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return YearMonth.parse(raw.strip());
        } catch (DateTimeParseException e) {
            throw ApiException.validation(param + ": expected a month as yyyy-MM");
        }
    }

    private static String money(BigDecimal v) {
        return PackageReadService.money(v == null ? BigDecimal.ZERO : v);
    }
}
