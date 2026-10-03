package com.inclineyou.inclineyou_backend.core.report;

import com.inclineyou.inclineyou_backend.core.report.dto.ReportResponse;
import com.inclineyou.inclineyou_backend.core.report.dto.WeeklyReportResult;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/v1")
public class ReportController {

    private final ReportService reportService;
    private final WeeklyReportWriter reportWriter;

    @GetMapping("/clients/{clientId}/report")
    public ReportResponse getReport(@PathVariable UUID clientId) {
        return new ReportResponse(reportService.generateReport(currentTrainerId(), clientId));
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
    public WeeklyReportResult writeWeekly(
            @PathVariable UUID clientId,
            @RequestParam(required = false) String weekStart) {
        var start = weekStart != null
                ? java.time.LocalDate.parse(weekStart)
                : WeeklyReportWriter.lastWeekStart(
                        java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata")));
        boolean stored = reportWriter.write(currentTrainerId(), clientId, start);
        return new WeeklyReportResult(start.toString(), stored);
    }

    private UUID currentTrainerId() {
        return UUID.fromString(
                SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
