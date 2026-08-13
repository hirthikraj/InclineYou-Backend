package com.xrep.xrep_backend.report;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/v1")
public class ReportController {

    private final ReportService reportService;
    private final WeeklyReportWriter reportWriter;

    @GetMapping("/clients/{clientId}/report")
    public Map<String, String> getReport(@PathVariable UUID clientId) {
        return Map.of("report", reportService.generateReport(currentTrainerId(), clientId));
    }

    /**
     * Share on demand — write the stored report for one week now, rather than
     * waiting for Monday's job.
     *
     * Idempotent, and deliberately so: a week that already has a report keeps the
     * one it has. `stored: false` means it was already there, which is the answer
     * to "can I re-send last week's" — yes, and it will be the same numbers.
     */
    @PostMapping("/clients/{clientId}/report/weekly")
    public Map<String, Object> writeWeekly(
            @PathVariable UUID clientId,
            @RequestParam(required = false) String weekStart) {
        var start = weekStart != null
                ? java.time.LocalDate.parse(weekStart)
                : WeeklyReportWriter.lastWeekStart(
                        java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata")));
        boolean stored = reportWriter.write(currentTrainerId(), clientId, start);
        return Map.of("weekStart", start.toString(), "stored", stored);
    }

    private UUID currentTrainerId() {
        return UUID.fromString(
                SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
