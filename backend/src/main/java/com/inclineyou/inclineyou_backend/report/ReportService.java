package com.inclineyou.inclineyou_backend.report;

import com.inclineyou.inclineyou_backend.assessment.MetricReadings;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class ReportService {

    private final NamedParameterJdbcTemplate jdbc;
    private final MetricReadings metricReadings;

    private static final DateTimeFormatter DATE_FMT  = DateTimeFormatter.ofPattern("d MMM yyyy");
    private static final DateTimeFormatter SESS_FMT  = DateTimeFormatter.ofPattern("EEEE, d MMM · h:mm a");
    private static final ZoneId            IST        = ZoneId.of("Asia/Kolkata");

    public String generateReport(UUID trainerId, UUID clientId) {
        var p = Map.of("cid", clientId.toString(), "tid", trainerId.toString());

        Map<String, Object> info;
        try {
            info = jdbc.queryForMap("""
                    SELECT c.name AS client_name, t.name AS trainer_name
                    FROM client c JOIN trainer t ON t.id = c.trainer_id
                    WHERE c.id = :cid::uuid AND c.trainer_id = :tid::uuid AND c.deleted_at IS NULL
                    """, p);
        } catch (EmptyResultDataAccessException e) {
            return "Report unavailable — client not found.";
        }
        String clientName  = str(info.get("client_name"));
        String trainerName = str(info.get("trainer_name"));

        // Adherence last 4 weeks
        LocalDate fourWeeksAgo = LocalDate.now(IST).minusWeeks(4);
        var sessionStats = jdbc.queryForMap("""
                SELECT
                  COUNT(*) FILTER (WHERE status = 'done')       AS done_count,
                  COUNT(*) FILTER (WHERE status != 'cancelled') AS scheduled_count
                FROM scheduled_session
                WHERE client_id = :cid::uuid AND trainer_id = :tid::uuid
                  AND deleted_at IS NULL AND scheduled_at >= :since
                """, Map.of("cid", clientId.toString(), "tid", trainerId.toString(),
                "since", java.sql.Date.valueOf(fourWeeksAgo)));

        long done      = toLong(sessionStats.get("done_count"));
        long scheduled = toLong(sessionStats.get("scheduled_count"));
        String adherence = scheduled > 0 ? Math.round(done * 100.0 / scheduled) + "%" : "—";

        // Latest body weight — from the last assessment that took one (V22)
        String latestWeight = metricReadings.latest(clientId, "weight", 1).stream()
                .findFirst()
                .map(w -> w.value().stripTrailingZeros().toPlainString() + " " + w.unit())
                .orElse(null);

        // Top 5 PRs
        List<Map<String, Object>> prs = jdbc.queryForList("""
                SELECT ex.name AS ex_name, sub.max_load_kg, sub.max_reps
                FROM (
                    SELECT DISTINCT ON (sl.exercise_id)
                        sl.exercise_id,
                        sl.load_kg AS max_load_kg,
                        sl.reps    AS max_reps
                    FROM set_log sl
                    JOIN workout_session ws ON ws.id = sl.workout_session_id
                    WHERE ws.trainer_id = :tid::uuid AND ws.client_id = :cid::uuid
                      AND sl.deleted_at IS NULL
                    ORDER BY sl.exercise_id, sl.load_kg DESC NULLS LAST
                ) sub
                JOIN exercise ex ON ex.id = sub.exercise_id
                ORDER BY sub.max_load_kg DESC NULLS LAST
                LIMIT 5
                """, Map.of("cid", clientId.toString(), "tid", trainerId.toString()));

        // Next upcoming session
        String nextSession = null;
        try {
            var ns = jdbc.queryForMap("""
                    SELECT scheduled_at, day_label FROM scheduled_session
                    WHERE client_id = :cid::uuid AND trainer_id = :tid::uuid
                      AND status = 'scheduled' AND deleted_at IS NULL AND scheduled_at > NOW()
                    ORDER BY scheduled_at ASC LIMIT 1
                    """, Map.of("cid", clientId.toString(), "tid", trainerId.toString()));
            var ts = (java.sql.Timestamp) ns.get("scheduled_at");
            nextSession = ts.toInstant().atZone(IST).format(SESS_FMT);
            if (ns.get("day_label") != null) nextSession += " · " + ns.get("day_label");
        } catch (EmptyResultDataAccessException ignored) {}

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
                sb.append("  • ").append(pr.get("ex_name"));
                if (pr.get("max_load_kg") != null) sb.append(": ").append(pr.get("max_load_kg")).append(" kg");
                if (pr.get("max_reps") != null) sb.append(" × ").append(pr.get("max_reps")).append(" reps");
                sb.append('\n');
            }
        }

        if (nextSession != null) {
            sb.append('\n').append("Next session: ").append(nextSession).append('\n');
        }

        sb.append('\n').append("Keep it up! — ").append(trainerName).append(" via InclineYou");
        return sb.toString();
    }

    private String str(Object o) { return o != null ? o.toString() : "—"; }

    private long toLong(Object o) {
        if (o instanceof Long l) return l;
        if (o instanceof Number n) return n.longValue();
        return 0;
    }
}
