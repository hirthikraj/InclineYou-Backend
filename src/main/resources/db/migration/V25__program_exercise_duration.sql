-- A prescription can be a hold, not a count.
--
-- "3 × 45s plank" was unsayable: the only target fields were sets and reps,
-- and writing 45 into reps would lie to everything that reads reps as a count.
-- `duration_seconds` is the honest column — set instead of reps on a timed
-- exercise, chosen by the trainer when the exercise is added to a program.
--
-- On the template the same field lives inside the blueprint JSON and needs no
-- migration; this column is the client's copy of it, written by apply and by
-- the sync push. Additive and nullable: every existing row is a rep
-- prescription and stays one.
ALTER TABLE program_exercise
    ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
