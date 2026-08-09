package com.trainx.trainx_backend.progress;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ProgressService {

    private final NamedParameterJdbcTemplate jdbc;

    public record PrRecord(
            String exerciseId,
            String exerciseName,
            BigDecimal maxLoadKg,
            Integer maxReps,
            long achievedAt
    ) {}

    public record VolumePoint(String weekStart, double volume) {}

    public record ProgressResponse(List<PrRecord> prs, List<VolumePoint> volumeByWeek) {}

    @Transactional(readOnly = true)
    public ProgressResponse get(UUID trainerId, String clientId) {
        Boolean owned = jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM client WHERE id = :cid::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                Map.of("cid", clientId, "tid", trainerId.toString()), Boolean.class);
        if (!Boolean.TRUE.equals(owned)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Client not found");
        }
        return new ProgressResponse(getPRs(clientId), getVolumeByWeek(clientId));
    }

    private List<PrRecord> getPRs(String clientId) {
        // DISTINCT ON gets the row (exercise, set) with the highest load_kg per exercise.
        // Ordered by load_kg DESC within each exercise partition, then outer ORDER BY name.
        var rows = jdbc.queryForList("""
                SELECT exercise_id, exercise_name, max_load_kg, max_reps, achieved_at FROM (
                    SELECT DISTINCT ON (sl.exercise_id)
                        sl.exercise_id::text  AS exercise_id,
                        e.name                AS exercise_name,
                        sl.load_kg            AS max_load_kg,
                        sl.reps               AS max_reps,
                        ws.session_date       AS achieved_at
                    FROM set_log sl
                    JOIN exercise e          ON e.id  = sl.exercise_id
                    JOIN workout_session ws  ON ws.id = sl.workout_session_id
                    WHERE ws.client_id = :cid::uuid
                      AND ws.deleted_at IS NULL
                      AND sl.deleted_at IS NULL
                      AND sl.load_kg IS NOT NULL
                    ORDER BY sl.exercise_id, sl.load_kg DESC
                ) sub
                ORDER BY max_load_kg DESC
                LIMIT 30
                """, Map.of("cid", clientId));

        return rows.stream().map(r -> new PrRecord(
                str(r.get("exercise_id")),
                str(r.get("exercise_name")),
                toDecimal(r.get("max_load_kg")),
                toInt(r.get("max_reps")),
                toDateMs(r.get("achieved_at"))
        )).toList();
    }

    private List<VolumePoint> getVolumeByWeek(String clientId) {
        var rows = jdbc.queryForList("""
                SELECT
                    DATE_TRUNC('week', ws.session_date)::date AS week_start,
                    COALESCE(SUM(sl.load_kg * sl.reps), 0)   AS volume
                FROM set_log sl
                JOIN workout_session ws ON ws.id = sl.workout_session_id
                WHERE ws.client_id = :cid::uuid
                  AND ws.deleted_at IS NULL
                  AND sl.deleted_at IS NULL
                  AND sl.load_kg IS NOT NULL
                  AND sl.reps IS NOT NULL
                GROUP BY DATE_TRUNC('week', ws.session_date)
                ORDER BY week_start ASC
                LIMIT 16
                """, Map.of("cid", clientId));

        return rows.stream().map(r -> new VolumePoint(
                str(r.get("week_start")),
                toDouble(r.get("volume"))
        )).toList();
    }

    private String str(Object v) { return v == null ? null : v.toString(); }

    private BigDecimal toDecimal(Object v) {
        if (v instanceof BigDecimal bd) return bd;
        return v != null ? new BigDecimal(v.toString()) : null;
    }

    private Integer toInt(Object v) {
        if (v instanceof Integer i) return i;
        return v != null ? Integer.parseInt(v.toString()) : null;
    }

    private double toDouble(Object v) {
        return v instanceof Number n ? n.doubleValue() : 0.0;
    }

    private long toDateMs(Object v) {
        if (v instanceof java.sql.Date d) {
            return d.toLocalDate().atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli();
        }
        if (v instanceof java.time.LocalDate ld) {
            return ld.atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli();
        }
        return 0L;
    }
}
