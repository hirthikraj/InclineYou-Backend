package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.MoneyReportJdbcRepository.PaymentKind;
import com.inclineyou.inclineyou_backend.core.payment.dto.MoneySummary;
import com.inclineyou.inclineyou_backend.core.payment.dto.SummaryMonth;
import com.inclineyou.inclineyou_backend.core.payment.dto.SummaryNow;
import com.inclineyou.inclineyou_backend.core.payment.dto.SummaryTotal;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.util.Money;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
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

    private final MoneyReportJdbcRepository reports;
    private final PackageJdbcRepository packages;
    private final WorkspaceClock clock;

    private static final int MAX_MONTHS = 24;
    /** "Overdue" is owed past its due date by more than this. */
    private static final int OVERDUE_GRACE_DAYS = 7;

    /** Mutable accumulator for one month while the grouped rows are folded in. */
    private static final class Acc {
        BigDecimal takeHome = BigDecimal.ZERO, billed = BigDecimal.ZERO, gymCut = BigDecimal.ZERO, collected = BigDecimal.ZERO,
                writtenOff = BigDecimal.ZERO, refunded = BigDecimal.ZERO;
        int sold, payments;
    }

    /**
     * @param months how many months ending with the current one; or
     * @param from   {@code yyyy-MM}, inclusive, with
     * @param to     {@code yyyy-MM}, inclusive
     */
    public MoneySummary summary(UUID trainerId, Integer months, String from, String to) {
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
        var fromAt = WorkspaceClock.startOf(readFrom, zone);
        var toAt = WorkspaceClock.startOf(last.plusMonths(1), zone);
        var uid = trainerId;

        var acc = new HashMap<String, Acc>();
        for (var m : reports.packagesByMonth(uid, readFrom, last)) {
            var a = acc.computeIfAbsent(m.month(), k -> new Acc());
            a.sold = m.sold();
            a.billed = m.billed();
            a.gymCut = m.gymCut();
        }
        // One pass per status column, each on its own partial index.
        for (var kind : PaymentKind.values()) {
            for (var m : reports.paymentsByMonth(uid, zone, kind, fromAt, toAt)) {
                var a = acc.computeIfAbsent(m.month(), k -> new Acc());
                switch (kind) {
                    case PAID -> { a.collected = m.total(); a.payments = m.count(); a.takeHome = m.takeHome(); }
                    case REFUND -> a.refunded = m.total();
                    default -> a.writtenOff = m.total();
                }
            }
        }

        // Oldest first, one row per month, zero rows included.
        var out = new ArrayList<SummaryMonth>(span);
        var sum = new Acc();
        BigDecimal billedBefore = BigDecimal.ZERO;
        for (YearMonth m = readFrom; !m.isAfter(last); m = m.plusMonths(1)) {
            var a = acc.getOrDefault(m.toString(), new Acc());
            if (m.isBefore(first)) {
                billedBefore = billedBefore.add(a.billed);
                continue;
            }
            out.add(new SummaryMonth(m.toString(), money(a.billed), money(a.collected), money(a.gymCut),
                    money(a.billed.subtract(a.gymCut)), money(a.writtenOff), money(a.refunded),
                    a.sold, a.payments, money(a.takeHome)));
            sum.billed = sum.billed.add(a.billed);
            sum.gymCut = sum.gymCut.add(a.gymCut);
            sum.collected = sum.collected.add(a.collected);
            sum.writtenOff = sum.writtenOff.add(a.writtenOff);
            sum.refunded = sum.refunded.add(a.refunded);
            sum.sold += a.sold;
            sum.payments += a.payments;
            sum.takeHome = sum.takeHome.add(a.takeHome);
        }
        Double trend = billedBefore.signum() == 0 ? null
                : sum.billed.subtract(billedBefore).multiply(BigDecimal.valueOf(100))
                        .divide(billedBefore, 1, RoundingMode.HALF_UP).doubleValue();
        var total = new SummaryTotal(money(sum.billed), money(sum.collected), money(sum.gymCut),
                money(sum.billed.subtract(sum.gymCut)), money(sum.writtenOff), money(sum.refunded),
                sum.sold, sum.payments, money(sum.takeHome), trend);

        // Now — on the same ledger L5 uses, so "owed" on a pack and "pending"
        // here cannot disagree.
        var now = packages.dues(trainerId, WorkspaceClock.today(zone).minusDays(OVERDUE_GRACE_DAYS));

        return new MoneySummary(clock.currency(), out, total, new SummaryNow(
                money(now.pending()), money(now.overdue()), now.clientsOwing(), now.clientsOverdue()));
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
        return Money.formatOrZero(v);
    }
}
