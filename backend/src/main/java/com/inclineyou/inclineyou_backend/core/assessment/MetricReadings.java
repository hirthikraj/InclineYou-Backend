package com.inclineyou.inclineyou_backend.core.assessment;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * V22 · a client's body readings, read out of the assessments they came back on.
 *
 * <p>A body is measured in an assessment and nowhere else (decided 24 Sep 2026),
 * so {@code body_metric} is gone and this is the one place that turns
 * {@code assessment.readings} into a measurement series. Every screen that used
 * to read that table — the client file, the report's latest weight, the team
 * file, the portal's progress — reads through here, so they cannot disagree
 * about which readings count.
 *
 * <p>Only V5's six ids come out ({@link MetricCatalogue}); the other fifteen
 * catalogue measurements are the assessment's own business and stay on its
 * detail screen. A reading is dated by its assessment's {@code completed_at} —
 * the session it was taken in — and carries that assessment's id, so one
 * assessment yields up to six rows sharing it. A correction is an edit to the
 * assessment's readings, and every series reflects it on the next read because
 * nothing was ever copied.
 */
@Component
@RequiredArgsConstructor
public class MetricReadings {

    private final MetricReadingsJdbcRepository rows;

    public record MetricReading(UUID assessmentId, UUID clientId, String metricType,
                                BigDecimal value, String unit, Instant recordedAt) {}

    /** Every reading for one client, newest first. */
    public List<MetricReading> newestFirst(UUID clientId) {
        return query(clientId, null, "DESC", null);
    }

    /** Every reading for one client, oldest first — the order a chart draws. */
    public List<MetricReading> oldestFirst(UUID clientId) {
        return query(clientId, null, "ASC", null);
    }

    /** The {@code limit} newest readings, optionally of one metric only. */
    public List<MetricReading> latest(UUID clientId, String metricType, int limit) {
        return query(clientId, metricType, "DESC", limit);
    }

    private List<MetricReading> query(UUID clientId, String metricType, String order, Integer limit) {
        List<String> keys = metricType == null ? MetricCatalogue.ids() : List.of(metricType);
        return rows.read(clientId, keys, "DESC".equals(order), limit).stream().map(r -> {
            var metric = MetricCatalogue.get(r.key());
            return new MetricReading(r.assessmentId(), clientId, r.key(), r.value(),
                    metric == null ? null : metric.unit(), r.completedAt());
        }).toList();
    }
}
