-- V27 · an index for reading a workout's exercises (ProgramJdbcRepository.exercisesByWorkout).
--
-- Every tree read — the standalone-workout shelf, one template, a program's days — asks for
-- `workout_exercise WHERE workout_id = ANY(:ids)`, mains AND alternatives, and then their sets by join.
-- V1 has no index that answers it: uq_workout_exercise_order leads with workout_id but is partial on
-- `alternative_of IS NULL`, which that predicate does not imply, and uq_workout_exercise_main leads with
-- main_id. So the read seq-scanned workout_exercise, and the planner hash-joined a seq scan of
-- workout_set onto it — a cost that grows with every trainer's programs, not with the workouts asked for.
--
-- Measured 19 Oct 2026 on a copy of the dev data with the tables grown ~10× (36k exercises, 124k sets),
-- through the app under RLS: GET /v1/workout-templates at 102 templates went from 130 ms to 34 ms p50
-- (sets query 45 ms → 0.5 ms), and at 12 templates from 50 ms to request overhead.
--
-- Plain, not partial and not unique: it must serve alternatives too, and uniqueness is already
-- uq_workout_exercise_order's job. Not CONCURRENTLY, because Flyway runs a migration in a transaction;
-- the table is small enough today that the lock is brief.

CREATE INDEX idx_workout_exercise_workout ON workout_exercise (workout_id);
