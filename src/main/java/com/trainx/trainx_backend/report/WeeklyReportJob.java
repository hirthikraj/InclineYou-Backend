package com.trainx.trainx_backend.report;

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

    // Every Monday 08:00 IST (02:30 UTC)
    @Scheduled(cron = "0 30 2 * * MON")
    public void runWeeklyReports() {
        log.info("WeeklyReportJob: starting");

        var pairs = jdbc.queryForList("""
                SELECT c.trainer_id, c.id AS client_id
                FROM client c
                WHERE c.status = 'active' AND c.deleted_at IS NULL
                """, Map.of());

        int count = 0;
        for (var pair : pairs) {
            try {
                UUID trainerId = UUID.fromString(pair.get("trainer_id").toString());
                UUID clientId  = UUID.fromString(pair.get("client_id").toString());

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
        log.info("WeeklyReportJob: done — {} report(s) queued", count);
    }
}
