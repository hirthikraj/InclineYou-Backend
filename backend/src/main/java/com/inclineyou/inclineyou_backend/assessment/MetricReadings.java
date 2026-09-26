package com.inclineyou.inclineyou_backend.assessment;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.HashMap;
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

    private final NamedParameterJdbcTemplate jdbc;

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
        var p = new HashMap<String, Object>();
        p.put("cid", clientId.toString());
        p.put("keys", metricType == null ? MetricCatalogue.ids() : List.of(metricType));
        // `order` is one of two literals chosen above, never caller text.
        String sql = """
                SELECT a.id::text AS assessment_id, r->>'key' AS metric_type,
                       (r->>'value')::numeric AS value, a.completed_at
                FROM assessment a
                CROSS JOIN LATERAL jsonb_array_elements(a.readings) r
                WHERE a.client_id = :cid::uuid
                  AND a.deleted_at IS NULL
                  AND a.completed_at IS NOT NULL
                  AND r->>'key' IN (:keys)
                  AND jsonb_typeof(r->'value') = 'number'
                ORDER BY a.completed_at %1$s, a.id %1$s, r->>'key'
                """.formatted(order) + (limit == null ? "" : " LIMIT :limit");
        if (limit != null) p.put("limit", limit);
        return jdbc.queryForList(sql, p).stream().map(r -> {
            String type = (String) r.get("metric_type");
            var metric = MetricCatalogue.get(type);
            return new MetricReading(
                    UUID.fromString((String) r.get("assessment_id")),
                    clientId,
                    type,
                    (BigDecimal) r.get("value"),
                    metric == null ? null : metric.unit(),
                    instant(r.get("completed_at")));
        }).toList();
    }

    private static Instant instant(Object o) {
        if (o instanceof Timestamp t) return t.toInstant();
        if (o instanceof OffsetDateTime odt) return odt.toInstant();
        if (o instanceof Instant i) return i;
        throw new IllegalStateException("completed_at: unexpected " + o);
    }
}
