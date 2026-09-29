package com.inclineyou.inclineyou_backend.core.report;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Sunday's report, written down — FR-10.2, and screen 6a of the client role.
 *
 * Everything else in this product is derived on read, so that correcting a set
 * from November fixes every number that depended on it. This one is stored, for
 * the opposite reason: it was sent. Both people read the same figures on Sunday
 * night and the trainer said something about them, and a report whose numbers
 * move afterwards is not a report.
 *
 * Which is why there is no update path. The insert is ON CONFLICT DO NOTHING, so
 * the job can be re-run by hand, retried after a crash, or fired twice by a
 * scheduler with a bad clock, and last week's report stays exactly as it went out.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WeeklyReportWriter {

    private final NamedParameterJdbcTemplate jdbc;

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final DateTimeFormatter WAS_ON = DateTimeFormatter.ofPattern("d MMMM");

    /**
     * The smallest plate a gym has, in kg, when the trainer has not said.
     *
     * The same default the phone uses, and it has to be the same number: this is
     * what separates a record worth announcing from a rounding error, and a
     * report that counted three where the log announced one is a report nobody
     * trusts again.
     */
    private static final BigDecimal DEFAULT_PLATE_STEP = new BigDecimal("2.5");

    /** Monday of the week that just finished, given any day in the week after it. */
    public static LocalDate lastWeekStart(LocalDate today) {
        return today.with(java.time.temporal.TemporalAdjusters.previousOrSame(java.time.DayOfWeek.MONDAY))
                .minusWeeks(1);
    }

    /**
     * Write one client's report for one week. Returns false if a report for that
     * week already existed, which is not a failure.
     */
    @Transactional
    public boolean write(UUID trainerId, UUID clientId, LocalDate weekStart) {
        LocalDate weekEnd = weekStart.plusDays(6);
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("cid", clientId.toString());
        p.put("start", Date.valueOf(weekStart));
        p.put("end", Date.valueOf(weekEnd));

        var sessions = jdbc.queryForMap("""
                SELECT COUNT(*) FILTER (WHERE status = 'done')        AS kept,
                       COUNT(*) FILTER (WHERE status <> 'cancelled')  AS planned
                FROM scheduled_session
                WHERE client_id = :cid::uuid AND deleted_at IS NULL
                  AND (scheduled_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN :start AND :end
                """, p);

        var work = jdbc.queryForMap("""
                SELECT COALESCE(SUM(sl.load_kg * sl.reps), 0) AS volume,
                       COUNT(sl.id)                           AS sets
                FROM set_log sl
                JOIN workout_session ws ON ws.id = sl.workout_session_id
                WHERE ws.client_id = :cid::uuid
                  AND sl.deleted_at IS NULL AND ws.deleted_at IS NULL
                  AND ws.session_date BETWEEN :start AND :end
                """, p);

        // ISO weekday numbers with a logged set on them, e.g. "2,7". Drawn as
        // seven cells, never queried, so a string is the honest storage.
        List<Map<String, Object>> days = jdbc.queryForList("""
                SELECT DISTINCT EXTRACT(ISODOW FROM ws.session_date)::int AS dow
                FROM workout_session ws
                JOIN set_log sl ON sl.workout_session_id = ws.id AND sl.deleted_at IS NULL
                WHERE ws.client_id = :cid::uuid AND ws.deleted_at IS NULL
                  AND ws.session_date BETWEEN :start AND :end
                ORDER BY dow
                """, p);
        String trainedDays = days.stream()
                .map(d -> d.get("dow").toString())
                .collect(Collectors.joining(","));

        var bests = newBests(trainerId, clientId, p);

        // A HashMap, not Map.of: `best_line` is null in a week with no records,
        // and Map.of throws on a null value.
        var params = new HashMap<>(p);
        params.put("kept", sessions.get("kept"));
        params.put("planned", sessions.get("planned"));
        params.put("trainedDays", trainedDays);
        params.put("volume", work.get("volume"));
        params.put("sets", work.get("sets"));
        params.put("newBests", bests.count());
        params.put("bestLine", nullable(bests.line()));
        params.put("bestPrevious", nullable(bests.previous()));

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

    private record Bests(int count, String line, String previous) {}

    /**
     * How many records that week were worth announcing, and the best of them.
     *
     * The same test the log applies on the phone: the top set beat the all-time
     * best on that exercise by at least one plate. Beating it by 1 kg in a gym
     * whose smallest plate is 2.5 is a typo, not a personal record — so the
     * trainer's own plate step decides, read from the profile the settings screen
     * writes, because the count here and the gold circle there must agree.
     */
    private Bests newBests(UUID trainerId, UUID clientId, Map<String, Object> p) {
        BigDecimal step = plateStep(trainerId);

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
                """, merge(p, Map.of("step", step)));

        if (rows.isEmpty()) return new Bests(0, null, null);

        var top = rows.get(0);
        String line = "%s · %s kg × %s".formatted(
                top.get("exercise"), trim(top.get("best_load")), top.get("best_reps"));
        Object priorOn = top.get("prior_on");
        String previous = "Was %s kg%s".formatted(
                trim(top.get("prior_load")),
                priorOn == null ? "" : " on " + LocalDate.parse(priorOn.toString()).format(WAS_ON));

        return new Bests(rows.size(), line, previous);
    }

    /** `trainer.metadata.prefs.plateStepKg`, the number the phone writes there. */
    private BigDecimal plateStep(UUID trainerId) {
        try {
            var value = jdbc.queryForObject("""
                    SELECT (metadata -> 'prefs' ->> 'plateStepKg') FROM trainer WHERE id = :tid::uuid
                    """, Map.of("tid", trainerId.toString()), String.class);
            return value == null ? DEFAULT_PLATE_STEP : new BigDecimal(value);
        } catch (Exception e) {
            return DEFAULT_PLATE_STEP;
        }
    }

    /** 57.50 reads as 57.5, and 55.00 as 55 — a report is prose, not a column. */
    private static String trim(Object load) {
        if (load == null) return "0";
        return new BigDecimal(load.toString()).stripTrailingZeros().toPlainString();
    }

    private static Object nullable(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    private static Map<String, Object> merge(Map<String, Object> base, Map<String, Object> extra) {
        var out = new HashMap<String, Object>(base);
        out.putAll(extra);
        return out;
    }
}
