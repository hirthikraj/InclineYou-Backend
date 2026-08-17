-- Swaps the shared exercise library from free-exercise-db (873 static JPGs) to
-- hasaneyldrm/exercises-dataset (1,324 exercises, each with a thumbnail AND a
-- 180x180 animation GIF).
--
-- Additive only: two new nullable columns, plus a soft-delete of the rows the
-- old library owned. Nothing is renamed, retyped or dropped, and no row leaves
-- the table — `exercise` is on the far end of four foreign keys
-- (program_exercise, set_log, workout_exercise, exercise_favourite) and a DELETE
-- would take a trainer's logged history with it.

-- ─── new taxonomy ─────────────────────────────────────────────────────────────
-- The new dataset splits what free-exercise-db called `primaryMuscles` in two,
-- and both halves earn a column because the library screen uses each for a
-- different job.

-- Ten values: back, cardio, chest, lower arms, lower legs, neck, shoulders,
-- upper arms, upper legs, waist. This is how a trainer scans a library — "another
-- chest thing" is a real query — so it is what the list groups by.
ALTER TABLE exercise ADD COLUMN IF NOT EXISTS body_part VARCHAR(30);

-- Nineteen values: abs, biceps, lats, quads, … The primary muscle worked, which
-- is finer than body_part and is what the muscle filter offers.
--
-- `muscle_group` keeps its meaning — the primary muscle — and is written from the
-- same source value, so every existing reader (search, /exercises/meta, the
-- app's own custom exercises) is untouched.
ALTER TABLE exercise ADD COLUMN IF NOT EXISTS target VARCHAR(50);

-- The list groups by body_part on every open of the library screen.
CREATE INDEX IF NOT EXISTS idx_exercise_body_part ON exercise (body_part);

-- ─── retire the old library ───────────────────────────────────────────────────
-- Soft-deleted, not removed. `deleted_at` is what the sync pull reads to tell a
-- phone a row is gone (SyncService.fetchExercises splits on exactly this), so
-- bumping `updated_at` alongside it is what carries the removal to every device
-- on its next pull. A hard DELETE would be invisible to a phone that is offline
-- today and would strand it on the old library forever.
--
-- Scoped to seeded rows: `source_id IS NOT NULL` is precisely "came from a seed
-- file", and `is_custom = false` is belt and braces. Anything a trainer built
-- themselves has source_id NULL and is not touched.
--
-- Consequence worth stating plainly: a program or a set log that pointed at one
-- of these exercises now points at a deleted row. The row still exists, so no
-- history is lost and no foreign key breaks, but the exercise reads as "removed"
-- in the app until it is re-picked from the new library. The two libraries share
-- no identifiers and their names differ ("3/4 Sit-Up" vs "3/4 sit-up"), so there
-- is no honest automatic remapping — guessing one would silently rewrite what a
-- trainer recorded.
UPDATE exercise
   SET deleted_at = NOW(),
       updated_at = NOW()
 WHERE source_id IS NOT NULL
   AND is_custom = false
   AND deleted_at IS NULL;
