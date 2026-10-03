package com.inclineyou.inclineyou_backend.core.payment;

import com.inclineyou.inclineyou_backend.core.payment.PracticeReportJdbcRepository.Span;
import com.inclineyou.inclineyou_backend.core.payment.dto.PracticeHeadline;
import com.inclineyou.inclineyou_backend.core.payment.dto.PracticeMonth;
import com.inclineyou.inclineyou_backend.core.payment.dto.PracticeReport;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.util.Money;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
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

    private final PracticeReportJdbcRepository report;
    private final WorkspaceClock clock;

    private static final int MAX_MONTHS = 24;

    private static final class Acc {
        int delivered, noShows, cancelled, active, fresh, archived;
        BigDecimal billed = BigDecimal.ZERO, collected = BigDecimal.ZERO, takeHome = BigDecimal.ZERO;
    }

    public PracticeReport practice(UUID trainerId, Integer months) {
        int n = months == null ? 12 : months;
        if (n < 1) throw ApiException.validation("months: at least 1");
        if (n > MAX_MONTHS) throw ApiException.rangeTooLarge("months: at most " + MAX_MONTHS);
        var zone = clock.zone();
        YearMonth last = YearMonth.now(zone);
        YearMonth first = last.minusMonths(n - 1);
        Instant fromInstant = WorkspaceClock.startOf(first, zone);
        Instant toInstant = WorkspaceClock.startOf(last.plusMonths(1), zone);
        var span = new Span(trainerId, zone, fromInstant, toInstant, first, last);

        var acc = new HashMap<String, Acc>();
        for (var m : report.sessionsByMonth(span)) {
            var a = acc.computeIfAbsent(m.month(), k -> new Acc());
            a.delivered = m.delivered();
            a.noShows = m.noShows();
            a.cancelled = m.cancelled();
            a.active = m.active();
        }
        for (var m : report.clientsCreatedByMonth(span)) acc.computeIfAbsent(m.month(), k -> new Acc()).fresh = m.n();
        for (var m : report.clientsArchivedByMonth(span)) acc.computeIfAbsent(m.month(), k -> new Acc()).archived = m.n();
        for (var m : report.billedByMonth(span)) acc.computeIfAbsent(m.month(), k -> new Acc()).billed = m.a();
        for (var m : report.collectedByMonth(span)) {
            var a = acc.computeIfAbsent(m.month(), k -> new Acc());
            a.collected = m.a();
            a.takeHome = m.b();
        }

        var rows = new ArrayList<PracticeMonth>(n);
        int delivered = 0;
        BigDecimal takeHome = BigDecimal.ZERO;
        String busiest = null;
        int busiestN = 0;
        for (YearMonth m = first; !m.isAfter(last); m = m.plusMonths(1)) {
            var a = acc.getOrDefault(m.toString(), new Acc());
            rows.add(new PracticeMonth(m.toString(), a.delivered, a.noShows, a.cancelled, a.active, a.fresh, a.archived,
                    Money.format(a.billed), Money.format(a.collected), Money.format(a.takeHome)));
            delivered += a.delivered;
            takeHome = takeHome.add(a.takeHome);
            if (a.delivered > busiestN) { busiestN = a.delivered; busiest = m.toString(); }
        }

        // Retention: the books when the span began, and who is still on them at its end.
        var ret = report.retention(span);
        Integer retention = ret.base() == 0 ? null : (int) Math.round(ret.kept() * 100.0 / ret.base());

        int clientsWithSessions = report.clientsWithSessions(span);
        Double avg = null;
        if (delivered > 0 && clientsWithSessions > 0) {
            Instant end = Instant.now().isBefore(toInstant) ? Instant.now() : toInstant;
            double weeks = Math.max(1.0, ChronoUnit.DAYS.between(fromInstant, end) / 7.0);
            avg = BigDecimal.valueOf(delivered / (double) clientsWithSessions / weeks)
                    .setScale(1, RoundingMode.HALF_UP).doubleValue();
        }

        var top = report.topClients(span);

        return new PracticeReport(clock.currency(), rows,
                new PracticeHeadline(delivered, retention, busiest, avg, Money.format(takeHome)), top);
    }
}
