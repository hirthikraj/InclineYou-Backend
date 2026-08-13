-- Screen 17 · the workout log
--
-- Most of this screen needs no storage at all. Sets are `set_log`, which has
-- existed since V1; a session is `workout_session`; a plan is `program_exercise`.
-- And the headline number on the screen — the personal record — is deliberately
-- absent from this migration, because §09 of the design makes it a rule:
--
--     A record is computed on read and never stored.
--
-- Correct a set from November and every record that depended on it fixes itself
-- in the same frame. A stored PR is a second copy of the truth, and second
-- copies drift. There is no `personal_record` table here and there should never
-- be one.
--
-- Two things genuinely have nowhere to live, and both are here. Additive only:
-- one new table, one new nullable column. Nothing renamed, retyped or dropped.

-- ─── workout_exercise ─────────────────────────────────────────────────────────
-- What is in today's log, in the order it is being done.
--
-- Until now "which exercises are in this session" was derived: the plan came
-- from `program_exercise`, and anything else was inferred from whatever had a
-- set logged against it. That derivation cannot hold three facts the floor
-- screen depends on, and all three happen on an ordinary Tuesday in a shared
-- gym:
--
--   · An exercise added before its first set. The rack was busy, the trainer
--     picks the machine chest press, and for the next ninety seconds it is in
--     the session with nothing logged against it. Derived from set_logs, it
--     does not exist yet and the card vanishes under the thumb.
--   · A planned exercise taken out of today. Swiped away because the cable
--     station has a queue. There is no row to mark, and the plan would keep
--     putting it back on every re-render.
--   · The order they were dragged into. Today's order is a fact about today,
--     not an edit to the client's program — `program_exercise.order_index` is
--     the plan and must not move because one morning ran backwards.
--
-- So one row per exercise per session. The plan is still the source of what
-- SHOULD happen; this table is what IS happening.
CREATE TABLE workout_exercise (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_session_id UUID        NOT NULL REFERENCES workout_session(id),
    exercise_id        UUID        NOT NULL REFERENCES exercise(id),
    -- Today's order. Starts as the plan's and diverges the moment somebody
    -- drags a card.
    order_index        INTEGER     NOT NULL DEFAULT 0,
    -- 'planned' | 'unplanned'. §09: an unplanned exercise is a FIRST-CLASS row
    -- — same card, same table, counted in volume, one quiet tag. This column
    -- exists to draw that tag and for nothing else. It is not a quality mark
    -- and adherence must never read it.
    source             VARCHAR(20) NOT NULL DEFAULT 'planned',
    -- Set when this row replaced a planned exercise. The rack was busy; the
    -- bench press was not skipped, it was swapped, and that distinction is the
    -- single most important thing this table records. Adherence reads THIS,
    -- not the absence of the original.
    swapped_from_exercise_id UUID   REFERENCES exercise(id),
    -- What was asked for, copied from the plan at the moment the log opened.
    -- Copied rather than joined for the same reason assigning a program copies
    -- it: editing the plan next week must not rewrite what happened today.
    target_sets        INTEGER,
    target_reps        INTEGER,
    -- Rest for THIS exercise. §09: rest autostart is per-exercise, never
    -- global — 90s after a bench set and 20s after a curl is one trainer, not
    -- two preferences. NULL means the plan's value, and no rest at all if the
    -- plan has none either.
    rest_seconds       INTEGER,
    -- Taken out of today. Soft, and separate from `deleted_at`: the row is
    -- still the record that the trainer decided not to do this, and the toast's
    -- Undo needs something to put back. `deleted_at` is for a row that should
    -- never have existed.
    removed_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ
);
CREATE INDEX idx_workout_exercise_session ON workout_exercise (workout_session_id);
-- One row per exercise per session. Two devices can open the same log offline
-- and both seed it from the plan; without this the trainer comes back to the
-- bench press twice.
CREATE UNIQUE INDEX idx_workout_exercise_pair
    ON workout_exercise (workout_session_id, exercise_id) WHERE deleted_at IS NULL;

-- ─── workout_session · when the log was closed ────────────────────────────────
ALTER TABLE workout_session
    -- Finishing the log and closing the money are two different facts, and §09
    -- forbids collapsing them: the sets happened, and whether the session counts
    -- against a pack is the trainer's separate call. `scheduled_session.status`
    -- already carries the second. This carries the first, and it is what the
    -- summary means by "58 minutes on the floor".
    --
    -- NULL on every row written before this migration, and read as "still
    -- open" — which for a session logged months ago is harmless, because the
    -- only thing that reads it is the home screen's in-progress hero and that
    -- only ever looks at today.
    ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

CREATE TRIGGER trg_workout_exercise_updated_at
    BEFORE UPDATE ON workout_exercise
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
