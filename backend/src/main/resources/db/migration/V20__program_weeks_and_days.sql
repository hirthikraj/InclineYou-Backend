-- Multi-week programs, and the days a program trains on.
--
-- Both columns are additive and nullable, which is the whole contract: every
-- row that exists today was authored as a single week's shape repeated, and a
-- back-fill would rewrite history to claim a trainer said something they never
-- said.

-- Which weekdays the program trains on, as ISO numbers: "1,3,5" is Mon/Wed/Fri.
--
-- The blueprint already records a day per exercise, but that only knows about
-- days somebody has already filled — and a program is authored by laying out
-- the empty days first and then putting exercises on them. NULL reads as "not
-- told", and the reader falls back to whichever days the blueprint uses.
ALTER TABLE template
    ADD COLUMN IF NOT EXISTS training_days TEXT;

-- Which week of the program this exercise belongs to. NULL reads as week 1.
--
-- The template's blueprint carries the same field inside its JSON, so applying
-- a four-week program now copies four weeks of rows rather than flattening them
-- into one week with every exercise repeated four times.
ALTER TABLE program_exercise
    ADD COLUMN IF NOT EXISTS week INTEGER;

-- The log reads one day of one week at a time; without the week in the index it
-- scans every week of the program to find today's.
CREATE INDEX IF NOT EXISTS idx_program_exercise_week
    ON program_exercise (program_id, week, day_of_week)
    WHERE deleted_at IS NULL;
