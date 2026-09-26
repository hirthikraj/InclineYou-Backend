-- V10 · A DAY HOLDS WORKOUTS, AND A WORKOUT HAS A NAME
--
-- The redesigned builder turned a program DAY into a list of named WORKOUTS:
-- Tuesday is "Upper A" and then "Conditioning", and a saved workout can be
-- poured into a day as a block. Every row carries its container —
-- `workoutId` (which block) and `workoutName` (what it is called).
--
-- Neither survived a save. The blueprint's JSON and the copy's rows both
-- dropped them, so on the next reload the builder fell back to one container
-- per day and two workouts on a Tuesday merged into one with no name.
--
--   THE BLUEPRINT NEEDS NO MIGRATION
--
-- `template.structure` is one JSONB blob, so the blueprint carries the two keys
-- as `workout_id` / `workout_name` beside every other entry key. Only the
-- client's COPY is rows, and those are the two columns below.
--
--   `workout_id` IS A LOCAL HANDLE, NOT A FOREIGN KEY
--
-- The web mints it (`newWorkoutId`) to group a board's rows, and re-mints it on
-- purpose when a workout template is poured in — so it points at nothing and
-- must not be read as a reference to `workout_template`. Hence varchar and
-- unindexed: nothing queries by it, it only travels with the row. The name is
-- what a person reads; a reordering that renames nothing changes neither.
--
--   ADDITIVE, AND THE PHONE CANNOT CLOBBER IT
--
-- `program_exercise` IS in the phone's sync. `pushProgramExercises`' upsert
-- names its columns and these are not among them — the same protection V30
-- gave `paused_at` — so an old phone editing a set count leaves the web's
-- workout grouping exactly where it was. The columns ride the pull and are
-- dropped by a WatermelonDB schema that does not declare them; a phone draws
-- one block per day, which is what it has always drawn.

ALTER TABLE public.program_exercise
    ADD COLUMN workout_id   varchar(64),
    ADD COLUMN workout_name varchar(120);

COMMENT ON COLUMN public.program_exercise.workout_id IS
    'Which named workout block on its day this row belongs to. A local handle minted by the web, NOT a foreign key (to workout_template or anything else). Not in the phone''s push upsert. See V10.';
COMMENT ON COLUMN public.program_exercise.workout_name IS
    'The block''s name ("Upper A"). NULL = the day''s single unnamed block, which is every row written before V10. See V10.';
