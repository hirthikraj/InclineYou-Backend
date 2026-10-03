package com.inclineyou.inclineyou_backend.core.assessment;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.UUID;

/**
 * The SQL behind a client's reading series: one row per measurement in each completed, undeleted assessment, read out of
 * {@code assessment.readings} — an object keyed by measurement id (assessment_readings_valid). Which ids count, and the
 * unit each carries, is {@link MetricReadings}'s.
 */
@Repository
@RequiredArgsConstructor
public class MetricReadingsJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** One reading as stored: the assessment it came back on, the measurement id, the number, and when it was completed. */
    public record Row(UUID assessmentId, String key, BigDecimal value, Instant completedAt) {}

    /**
     * Newest first when {@code newestFirst}, else oldest first; at most {@code limit} when not null. A reading is dated
     * by its assessment's {@code completed_at} — the session it was taken in — and one assessment yields up to as many
     * rows as it has measurements.
     */
    public List<Row> read(UUID clientId, List<String> keys, boolean newestFirst, Integer limit) {
        var p = new HashMap<String, Object>();
        p.put("cid", clientId.toString());
        p.put("keys", keys);
        // The direction is one of two literals chosen here, never caller text.
        String dir = newestFirst ? "DESC" : "ASC";
        String sql = """
                SELECT a.id::text AS assessment_id, r.key AS metric_type,
                       (r.value)::text::numeric AS value, a.completed_at
                FROM assessment a
                -- v1: readings is an object keyed by measurement id (assessment_readings_valid).
                CROSS JOIN LATERAL jsonb_each(a.readings) r
                WHERE a.client_id = :cid::uuid
                  AND a.deleted_at IS NULL
                  AND a.completed_at IS NOT NULL
                  AND r.key IN (:keys)
                  AND jsonb_typeof(r.value) = 'number'
                ORDER BY a.completed_at %1$s, a.id %1$s, r.key
                """.formatted(dir) + (limit == null ? "" : " LIMIT :limit");
        if (limit != null) p.put("limit", limit);
        return jdbc.query(sql, p, (rs, i) -> new Row(UUID.fromString(rs.getString("assessment_id")), rs.getString("metric_type"),
                rs.getBigDecimal("value"), ((Timestamp) rs.getTimestamp("completed_at")).toInstant()));
    }
}
