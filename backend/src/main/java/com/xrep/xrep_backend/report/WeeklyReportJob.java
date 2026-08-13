package com.xrep.xrep_backend.report;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class WeeklyReportJob {

    private final NamedParameterJdbcTemplate jdbc;
    private final ReportService reportService;
    private final WeeklyReportWriter reportWriter;

    // Every Monday 08:00 IST (02:30 UTC)
    @Scheduled(cron = "0 30 2 * * MON")
    public void runWeeklyReports() {
        log.info("WeeklyReportJob: starting");

        var pairs = jdbc.queryForList("""
                SELECT c.trainer_id, c.id AS client_id
                FROM client c
                WHERE c.status = 'active' AND c.deleted_at IS NULL
                """, Map.of());

        // The week that just finished, in Indian time — the job runs Monday
        // morning and reports on Monday-to-Sunday behind it.
        var weekStart = WeeklyReportWriter.lastWeekStart(
                java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata")));

        int count = 0;
        int stored = 0;
        for (var pair : pairs) {
            try {
                UUID trainerId = UUID.fromString(pair.get("trainer_id").toString());
                UUID clientId  = UUID.fromString(pair.get("client_id").toString());

                // FR-11 · the client's own copy, stored so it can be read on a
                // phone with no signal and so it never changes after it lands.
                // Written before the WhatsApp goes out: a report the client can
                // open is worth more than a message that arrives first.
                if (reportWriter.write(trainerId, clientId, weekStart)) stored++;

                String report = reportService.generateReport(trainerId, clientId);

                jdbc.update("""
                        INSERT INTO nudge_log (id, trainer_id, client_id, channel, template_name, status, sent_at, created_at, updated_at)
                        VALUES (gen_random_uuid(), :tid::uuid, :cid::uuid, 'whatsapp', 'weekly_report', 'queued', NOW(), NOW(), NOW())
                        """, Map.of("tid", trainerId.toString(), "cid", clientId.toString()));

                log.debug("WeeklyReportJob: queued report client={} len={}", clientId, report.length());
                count++;
            } catch (Exception e) {
                log.warn("WeeklyReportJob: skipping pair {} — {}", pair, e.getMessage());
            }
        }
        log.info("WeeklyReportJob: done — {} report(s) queued, {} stored for week of {}",
                count, stored, weekStart);
    }
}
