package com.inclineyou.inclineyou_backend.core.report;

import com.inclineyou.inclineyou_backend.core.assessment.MetricReadings;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class ReportService {

    private final ReportJdbcRepository reports;
    private final MetricReadings metricReadings;

    private static final DateTimeFormatter DATE_FMT  = DateTimeFormatter.ofPattern("d MMM yyyy");
    private static final DateTimeFormatter SESS_FMT  = DateTimeFormatter.ofPattern("EEEE, d MMM · h:mm a");
    private static final ZoneId            IST        = ZoneId.of("Asia/Kolkata");

    public String generateReport(UUID trainerId, UUID clientId) {
        var names = reports.names(trainerId, clientId);
        if (names.isEmpty()) return "Report unavailable — client not found.";
        String clientName  = str(names.get().clientName());
        String trainerName = str(names.get().trainerName());

        // Adherence last 4 weeks
        LocalDate fourWeeksAgo = LocalDate.now(IST).minusWeeks(4);
        var sessionStats = reports.sessionStats(trainerId, clientId, fourWeeksAgo);

        long done      = sessionStats.done();
        long scheduled = sessionStats.scheduled();
        String adherence = scheduled > 0 ? Math.round(done * 100.0 / scheduled) + "%" : "—";

        // Latest body weight — from the last assessment that took one (V22)
        String latestWeight = metricReadings.latest(clientId, "weight", 1).stream()
                .findFirst()
                .map(w -> w.value().stripTrailingZeros().toPlainString() + " " + w.unit())
                .orElse(null);

        // Top 5 PRs
        var prs = reports.personalRecords(trainerId, clientId);

        // Next upcoming session
        String nextSession = null;
        var next = reports.nextSession(trainerId, clientId);
        if (next.isPresent()) {
            nextSession = next.get().scheduledAt().atZone(IST).format(SESS_FMT);
            if (next.get().workoutName() != null) nextSession += " · " + next.get().workoutName();
        }

        var sb = new StringBuilder();
        sb.append("InclineYou Weekly Report\n");
        sb.append("Client: ").append(clientName).append('\n');
        sb.append("Date: ").append(LocalDate.now(IST).format(DATE_FMT)).append('\n');
        sb.append('\n');
        sb.append("Sessions (last 4 weeks): ").append(done).append(" done");
        if (scheduled > 0) sb.append(" / ").append(scheduled).append(" scheduled");
        sb.append(" (").append(adherence).append(" adherence)\n");

        if (latestWeight != null) {
            sb.append("Latest body weight: ").append(latestWeight).append('\n');
        }

        if (!prs.isEmpty()) {
            sb.append('\n').append("Personal Records:\n");
            for (var pr : prs) {
                sb.append("  • ").append(pr.exercise());
                if (pr.maxLoadKg() != null) sb.append(": ").append(num(pr.maxLoadKg())).append(" kg");
                if (pr.maxReps() != null) sb.append(" × ").append(num(pr.maxReps())).append(" reps");
                sb.append('\n');
            }
        }

        if (nextSession != null) {
            sb.append('\n').append("Next session: ").append(nextSession).append('\n');
        }

        sb.append('\n').append("Keep it up! — ").append(trainerName).append(" via InclineYou");
        return sb.toString();
    }

    /** numeric(7,2) comes back as 57.50 and 7.00; a person reads 57.5 and 7. */
    private static String num(Object o) {
        return o instanceof java.math.BigDecimal d ? d.stripTrailingZeros().toPlainString() : String.valueOf(o);
    }

    private String str(Object o) { return o != null ? o.toString() : "—"; }
}
