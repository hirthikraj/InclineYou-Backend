package com.inclineyou.inclineyou_backend.core.report;

import com.inclineyou.inclineyou_backend.core.report.dto.ActiveClient;
import com.inclineyou.inclineyou_backend.core.report.dto.NewBestRow;
import com.inclineyou.inclineyou_backend.core.report.dto.WeekSessions;
import com.inclineyou.inclineyou_backend.core.report.dto.WeekWork;
import com.inclineyou.inclineyou_backend.core.report.dto.WeeklyReportRow;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Everything the stored weekly report and its Monday job read and write. The week is the caller's
 * ({@code weekStart}..{@code weekEnd}, both inclusive dates); what counts as a record worth announcing
 * is {@link WeeklyReportWriter}'s, written beside the numbers.
 */
@Repository
@RequiredArgsConstructor
public class WeeklyReportJdbcRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /** Every (trainer, client) the Monday job reports on: active clients, not deleted. */
    public List<ActiveClient> activeClients() {
        var pairs = jdbc.queryForList("""
                SELECT c.trainer_id, c.id AS client_id
                FROM client c
                WHERE c.status = 'active' AND c.deleted_at IS NULL
                """, Map.of());
        return pairs.stream()
                .map(pair -> new ActiveClient(
                        UUID.fromString(pair.get("trainer_id").toString()),
                        UUID.fromString(pair.get("client_id").toString())))
                .toList();
    }

    /** One queued WhatsApp row for the weekly report. */
    public void queueNudge(UUID trainerId, UUID clientId) {
        jdbc.update("""
                        INSERT INTO nudge_log (id, trainer_id, client_id, channel, template_name, status, sent_at, created_at, updated_at)
                        VALUES (gen_random_uuid(), :tid::uuid, :cid::uuid, 'whatsapp', 'weekly_report', 'queued', NOW(), NOW(), NOW())
                        """, Map.of("tid", trainerId.toString(), "cid", clientId.toString()));
    }

    public WeekSessions sessions(UUID clientId, LocalDate weekStart, LocalDate weekEnd) {
        var sessions = jdbc.queryForMap("""
                SELECT COUNT(*) FILTER (WHERE status = 'done')        AS kept,
                       COUNT(*) FILTER (WHERE status <> 'cancelled')  AS planned
                FROM scheduled_session
                WHERE client_id = :cid::uuid AND deleted_at IS NULL
                  AND (scheduled_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN :start AND :end
                """, week(clientId, weekStart, weekEnd));
        return new WeekSessions(sessions.get("kept"), sessions.get("planned"));
    }

    public WeekWork work(UUID clientId, LocalDate weekStart, LocalDate weekEnd) {
        var work = jdbc.queryForMap("""
                SELECT COALESCE(SUM(sl.load_kg * sl.reps), 0) AS volume,
                       COUNT(sl.id)                           AS sets
                FROM set_log sl
                JOIN workout_session ws ON ws.id = sl.workout_session_id
                WHERE ws.client_id = :cid::uuid
                  AND sl.deleted_at IS NULL AND ws.deleted_at IS NULL
                  AND ws.session_date BETWEEN :start AND :end
                """, week(clientId, weekStart, weekEnd));
        return new WeekWork(work.get("volume"), work.get("sets"));
    }

    /** ISO weekday numbers with a logged set on them, e.g. "2,7". */
    public String trainedDays(UUID clientId, LocalDate weekStart, LocalDate weekEnd) {
        List<Map<String, Object>> days = jdbc.queryForList("""
                SELECT DISTINCT EXTRACT(ISODOW FROM ws.session_date)::int AS dow
                FROM workout_session ws
                JOIN set_log sl ON sl.workout_session_id = ws.id AND sl.deleted_at IS NULL
                WHERE ws.client_id = :cid::uuid AND ws.deleted_at IS NULL
                  AND ws.session_date BETWEEN :start AND :end
                ORDER BY dow
                """, week(clientId, weekStart, weekEnd));
        return days.stream()
                .map(d -> d.get("dow").toString())
                .collect(Collectors.joining(","));
    }

    /** `trainer.metadata.prefs.plateStepKg` as text, the number the phone writes there; null when unset. */
    public String plateStepKg(UUID trainerId) {
        return jdbc.queryForObject("""
                    SELECT (metadata -> 'prefs' ->> 'plateStepKg') FROM trainer WHERE id = :tid::uuid
                    """, Map.of("tid", trainerId.toString()), String.class);
    }

    /** Exercises whose top set that week beat the earlier best by at least {@code step}, biggest jump first. */
    public List<NewBestRow> newBests(UUID clientId, LocalDate weekStart, LocalDate weekEnd, BigDecimal step) {
        var params = week(clientId, weekStart, weekEnd);
        params.put("step", step);
        var rows = jdbc.queryForList("""
                WITH this_week AS (
                    SELECT sl.exercise_id,
                           MAX(sl.load_kg) AS best_load
                    FROM set_log sl
                    JOIN workout_session ws ON ws.id = sl.workout_session_id
                    WHERE ws.client_id = :cid::uuid
                      AND sl.deleted_at IS NULL AND ws.deleted_at IS NULL
                      AND ws.session_date BETWEEN :start AND :end
                      AND sl.load_kg IS NOT NULL
                    GROUP BY sl.exercise_id
                ),
                before AS (
                    SELECT sl.exercise_id,
                           MAX(sl.load_kg) AS prior_load
                    FROM set_log sl
                    JOIN workout_session ws ON ws.id = sl.workout_session_id
                    WHERE ws.client_id = :cid::uuid
                      AND sl.deleted_at IS NULL AND ws.deleted_at IS NULL
                      AND ws.session_date < :start
                      AND sl.load_kg IS NOT NULL
                    GROUP BY sl.exercise_id
                )
                SELECT e.name                       AS exercise,
                       tw.best_load                 AS best_load,
                       b.prior_load                 AS prior_load,
                       (SELECT MAX(sl2.reps) FROM set_log sl2
                          JOIN workout_session ws2 ON ws2.id = sl2.workout_session_id
                         WHERE ws2.client_id = :cid::uuid AND sl2.exercise_id = tw.exercise_id
                           AND sl2.load_kg = tw.best_load AND sl2.deleted_at IS NULL
                           AND ws2.session_date BETWEEN :start AND :end) AS best_reps,
                       (SELECT MAX(ws3.session_date) FROM set_log sl3
                          JOIN workout_session ws3 ON ws3.id = sl3.workout_session_id
                         WHERE ws3.client_id = :cid::uuid AND sl3.exercise_id = tw.exercise_id
                           AND sl3.load_kg = b.prior_load AND sl3.deleted_at IS NULL
                           AND ws3.session_date < :start) AS prior_on
                FROM this_week tw
                JOIN exercise e ON e.id = tw.exercise_id
                LEFT JOIN before b ON b.exercise_id = tw.exercise_id
                WHERE b.prior_load IS NOT NULL
                  AND tw.best_load - b.prior_load >= :step
                ORDER BY (tw.best_load - b.prior_load) DESC
                """, params);
        return rows.stream()
                .map(r -> new NewBestRow(r.get("exercise"), r.get("best_load"), r.get("prior_load"),
                        r.get("best_reps"), r.get("prior_on")))
                .toList();
    }

    /**
     * Store the week's report. There is no update path on purpose — ON CONFLICT DO NOTHING keeps what
     * went out. True when this call wrote the row, false when the week already had one.
     */
    public boolean insertIfAbsent(WeeklyReportRow r) {
        // A HashMap, not Map.of: `best_line` is null in a week with no records, and Map.of throws on a null value.
        var params = week(r.clientId(), r.weekStart(), r.weekEnd());
        params.put("tid", r.trainerId().toString());
        params.put("kept", r.kept());
        params.put("planned", r.planned());
        params.put("trainedDays", r.trainedDays());
        params.put("volume", r.volume());
        params.put("sets", r.sets());
        params.put("newBests", r.newBests());
        params.put("bestLine", r.bestLine());
        params.put("bestPrevious", r.bestPrevious());

        int updated = jdbc.update("""
                INSERT INTO weekly_report (id, trainer_id, client_id, week_start, week_end,
                    sessions_kept, sessions_planned, trained_days, volume_kg, sets_done,
                    new_bests, best_line, best_previous, sent_at, created_at, updated_at)
                VALUES (gen_random_uuid(), :tid::uuid, :cid::uuid, :start, :end,
                    :kept, :planned, :trainedDays, :volume, :sets,
                    :newBests, :bestLine, :bestPrevious, NOW(), NOW(), NOW())
                ON CONFLICT DO NOTHING
                """, params);
        return updated > 0;
    }

    private static Map<String, Object> week(UUID clientId, LocalDate weekStart, LocalDate weekEnd) {
        var p = new HashMap<String, Object>();
        p.put("cid", clientId.toString());
        p.put("start", Date.valueOf(weekStart));
        p.put("end", Date.valueOf(weekEnd));
        return p;
    }
}
