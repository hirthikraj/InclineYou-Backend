package com.inclineyou.inclineyou_backend.core.report;

import com.inclineyou.inclineyou_backend.core.report.dto.WeeklyReportRow;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

/**
 * Sunday's report, written down — FR-10.2, and screen 6a of the client role.
 *
 * Everything else in this product is derived on read, so that correcting a set
 * from November fixes every number that depended on it. This one is stored, for
 * the opposite reason: it was sent. Both people read the same figures on Sunday
 * night and the trainer said something about them, and a report whose numbers
 * move afterwards is not a report.
 *
 * Which is why there is no update path. The insert is ON CONFLICT DO NOTHING, so
 * the job can be re-run by hand, retried after a crash, or fired twice by a
 * scheduler with a bad clock, and last week's report stays exactly as it went out.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WeeklyReportWriter {

    private final WeeklyReportJdbcRepository weekly;

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final DateTimeFormatter WAS_ON = DateTimeFormatter.ofPattern("d MMMM");

    /**
     * The smallest plate a gym has, in kg, when the trainer has not said.
     *
     * The same default the phone uses, and it has to be the same number: this is
     * what separates a record worth announcing from a rounding error, and a
     * report that counted three where the log announced one is a report nobody
     * trusts again.
     */
    private static final BigDecimal DEFAULT_PLATE_STEP = new BigDecimal("2.5");

    /** Monday of the week that just finished, given any day in the week after it. */
    public static LocalDate lastWeekStart(LocalDate today) {
        return today.with(java.time.temporal.TemporalAdjusters.previousOrSame(java.time.DayOfWeek.MONDAY))
                .minusWeeks(1);
    }

    /**
     * Write one client's report for one week. Returns false if a report for that
     * week already existed, which is not a failure.
     */
    @Transactional
    public boolean write(UUID trainerId, UUID clientId, LocalDate weekStart) {
        LocalDate weekEnd = weekStart.plusDays(6);

        var sessions = weekly.sessions(clientId, weekStart, weekEnd);

        var work = weekly.work(clientId, weekStart, weekEnd);

        // ISO weekday numbers with a logged set on them, e.g. "2,7". Drawn as
        // seven cells, never queried, so a string is the honest storage.
        String trainedDays = weekly.trainedDays(clientId, weekStart, weekEnd);

        var bests = newBests(trainerId, clientId, weekStart, weekEnd);

        return weekly.insertIfAbsent(new WeeklyReportRow(
                trainerId, clientId, weekStart, weekEnd,
                sessions.kept(), sessions.planned(), trainedDays, work.volume(), work.sets(),
                bests.count(), nullable(bests.line()), nullable(bests.previous())));
    }

    private record Bests(int count, String line, String previous) {}

    /**
     * How many records that week were worth announcing, and the best of them.
     *
     * The same test the log applies on the phone: the top set beat the all-time
     * best on that exercise by at least one plate. Beating it by 1 kg in a gym
     * whose smallest plate is 2.5 is a typo, not a personal record — so the
     * trainer's own plate step decides, read from the profile the settings screen
     * writes, because the count here and the gold circle there must agree.
     */
    private Bests newBests(UUID trainerId, UUID clientId, LocalDate weekStart, LocalDate weekEnd) {
        BigDecimal step = plateStep(trainerId);

        var rows = weekly.newBests(clientId, weekStart, weekEnd, step);

        if (rows.isEmpty()) return new Bests(0, null, null);

        var top = rows.get(0);
        String line = "%s · %s kg × %s".formatted(
                top.exercise(), trim(top.bestLoad()), top.bestReps());
        Object priorOn = top.priorOn();
        String previous = "Was %s kg%s".formatted(
                trim(top.priorLoad()),
                priorOn == null ? "" : " on " + LocalDate.parse(priorOn.toString()).format(WAS_ON));

        return new Bests(rows.size(), line, previous);
    }

    /** `trainer.metadata.prefs.plateStepKg`, the number the phone writes there. */
    private BigDecimal plateStep(UUID trainerId) {
        try {
            var value = weekly.plateStepKg(trainerId);
            return value == null ? DEFAULT_PLATE_STEP : new BigDecimal(value);
        } catch (Exception e) {
            return DEFAULT_PLATE_STEP;
        }
    }

    /** 57.50 reads as 57.5, and 55.00 as 55 — a report is prose, not a column. */
    private static String trim(Object load) {
        if (load == null) return "0";
        return new BigDecimal(load.toString()).stripTrailingZeros().toPlainString();
    }

    private static Object nullable(String s) {
        return s == null || s.isBlank() ? null : s;
    }
}
