package com.inclineyou.inclineyou_backend.core.program;

/**
 * The order a client's plan is given in, as SQL, for the three readers that walk it: linking sessions to a fresh plan
 * or a new week ({@code ClientScheduleJdbcRepository.linkWorkouts}), the next workout at booking
 * ({@code SessionJdbcRepository.nextWorkout}) and the walk-in list ({@code SessionLogJdbcRepository.everybody}).
 *
 * <p><b>A week with nothing of its own repeats week 1</b> (18 Nov 2026). That is the builder's rule (the web's
 * {@code lib/programs/blueprint.ts}, law 3) and every InclineYou library program is written as week 1 only, stretched
 * over its {@code weeks}. Each reader used to number the workout ROWS, so an eight-week block with one written week
 * ran out after three sessions and every session after that was booked with no workout. Here the plan is numbered
 * week by week up to its length, a repeat week drawing week 1's workouts again.
 *
 * <p><b>Where a client is in it.</b> A repeat puts the same workout at several places, so the latest session's
 * workout no longer says where the client is. The k-th time a workout was given is taken as its k-th place: the
 * third "Day 1" is week 3's. A workout picked by hand out of order still moves the client to it, as before.
 */
public final class PlanSequence {

    private PlanSequence() {}

    /**
     * CTEs to put after {@code WITH} (and after any CTE they reference); a caller with more CTEs adds the comma:
     * <ul>
     *   <li>{@code plan(client_id, id, name, week, day, n)} — every place in the plan, {@code n} from 1 per client;</li>
     *   <li>{@code plan_at(client_id, n)} — the place of the latest session that counts, one row per client that has one.</li>
     * </ul>
     *
     * @param programs a query answering {@code (id, client_id)} — the active plan of each client being asked about
     * @param counted  a condition on {@code scheduled_session s}: the sessions that count as already given
     */
    public static String ctes(String programs, String counted) {
        return """
                plan_src AS (
                    SELECT p.id AS program_id, p.client_id, g.wk,
                           CASE WHEN EXISTS (SELECT 1 FROM workout o
                                             WHERE o.program_id = p.id AND o.deleted_at IS NULL AND o.week = g.wk)
                                THEN g.wk ELSE 1 END AS src
                    FROM (%s) p
                    JOIN program pp ON pp.id = p.id
                    CROSS JOIN LATERAL generate_series(1, pp.weeks) AS g(wk)
                ),
                plan AS (
                    SELECT ps.client_id, w.id, w.name, ps.wk AS week, w.day,
                           row_number() OVER (PARTITION BY ps.client_id ORDER BY ps.wk, w.day, w.position, w.id) AS n
                    FROM plan_src ps
                    JOIN workout w ON w.program_id = ps.program_id AND w.deleted_at IS NULL AND w.week = ps.src
                ),
                plan_given AS (
                    SELECT s.client_id, s.workout_id, s.scheduled_at, s.id,
                           row_number() OVER (PARTITION BY s.client_id, s.workout_id ORDER BY s.scheduled_at, s.id) AS k
                    FROM scheduled_session s
                    JOIN (SELECT DISTINCT client_id, id FROM plan) pw ON pw.client_id = s.client_id AND pw.id = s.workout_id
                    WHERE %s
                ),
                plan_last AS (
                    SELECT DISTINCT ON (client_id) client_id, workout_id, k FROM plan_given
                    ORDER BY client_id, scheduled_at DESC, id DESC
                ),
                plan_occ AS (
                    SELECT client_id, id, n, row_number() OVER (PARTITION BY client_id, id ORDER BY n) AS o,
                           count(*) OVER (PARTITION BY client_id, id) AS total
                    FROM plan
                ),
                plan_at AS (
                    SELECT l.client_id, po.n FROM plan_last l
                    JOIN plan_occ po ON po.client_id = l.client_id AND po.id = l.workout_id AND po.o = least(l.k, po.total)
                )
                """.formatted(programs, counted);
    }
}
