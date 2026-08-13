-- Screens 07–16 · behind the drawer
--
-- The drawer's seven destinations are Programs, Exercises, Reports, Adherence,
-- Nudges, Settings and Help. Five of them read data that already exists:
-- reports and adherence are computed on the phone from sessions and workouts,
-- and settings and help hold no records at all. Only two need storage, and
-- both are here.
--
-- Additive only: two new tables, and new nullable columns on two existing ones.
-- Nothing renamed, retyped or dropped; no column changes meaning. A build that
-- predates this migration keeps working — it never writes the new fields and
-- reads them as absent.
--
-- Deliberately NOT here:
--
--   · notification switches, the appearance choice, the language, the chase
--     window and the default reminder tone. Those are preferences, they are
--     small, and `trainer.metadata` was added in V8 precisely so the next
--     optional field is not a migration. They live under `metadata.prefs`.
--   · anything for "my own training". The mode is a device choice with no
--     server-side records yet, so there is nothing to store.

-- ─── nudge_rule ───────────────────────────────────────────────────────────────
-- If / then. Five rules ship on by default and the trainer edits the threshold,
-- the action and the message.
--
-- Its own table rather than a JSON blob on trainer, for one reason: a rule is
-- edited on a gym floor with no signal, so it has to be a WatermelonDB record
-- that syncs like everything else. A blob would mean the whole set of rules is
-- one conflict.
--
-- What is NOT in this table, on purpose: the send window (9am–8pm) and the
-- frequency cap (once per client per 7 days). Both are fixed in code. The
-- design says so out loud on the rule editor, because some limits protect the
-- trainer from themselves and a limit with a text field beside it is not a
-- limit.
--
-- kind:   'quiet' | 'pack_low' | 'overdue' | 'well_done' | 'birthday'
--         A plain string, so a sixth rule is a code change and not a migration.
-- action: 'ask'  — draft it and queue it for one tap. The default, always.
--         'auto' — send it without asking.
CREATE TABLE nudge_rule (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id  UUID         NOT NULL REFERENCES trainer(id),
    kind        VARCHAR(30)  NOT NULL,
    -- What the condition is measured in depends on the kind: days without a
    -- workout for 'quiet', sessions left for 'pack_low', days past due for
    -- 'overdue'. NULL for the two that have no threshold at all — a birthday
    -- is on the day, and a personal record is when it happens.
    threshold   INTEGER,
    action      VARCHAR(10)  NOT NULL DEFAULT 'ask',
    -- The draft, with {name}, {lastdate}, {days} and {amount} substituted at
    -- send time. NULL falls back to the built-in wording for that kind, so a
    -- trainer who never edits a message still gets a sensible one.
    message     TEXT,
    enabled     BOOLEAN      NOT NULL DEFAULT TRUE,
    order_index INTEGER      NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);
CREATE INDEX idx_nudge_rule_trainer_id ON nudge_rule (trainer_id);
-- One rule per kind per trainer. The app seeds five on first open and would
-- otherwise seed them again on a second device before the first pull lands.
CREATE UNIQUE INDEX idx_nudge_rule_kind
    ON nudge_rule (trainer_id, kind) WHERE deleted_at IS NULL;

-- ─── exercise_favourite ───────────────────────────────────────────────────────
-- A star, and favourites sort to the top of the library.
--
-- A join table rather than a column on `exercise`, because 861 of the 873 rows
-- are the shared global library: they have no trainer, and one trainer's star
-- must not appear in another's list. `is_custom = false` rows are readable by
-- everyone and writable by nobody.
CREATE TABLE exercise_favourite (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id  UUID        NOT NULL REFERENCES trainer(id),
    exercise_id UUID        NOT NULL REFERENCES exercise(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);
CREATE INDEX idx_exercise_favourite_trainer_id ON exercise_favourite (trainer_id);
CREATE UNIQUE INDEX idx_exercise_favourite_pair
    ON exercise_favourite (trainer_id, exercise_id) WHERE deleted_at IS NULL;

-- ─── exercise · how it is logged ──────────────────────────────────────────────
ALTER TABLE exercise
    -- 'weight_reps' | 'reps'. Set once when a custom exercise is created and
    -- then IMMUTABLE — every set already recorded against it would stop making
    -- sense if this changed, which is the rule Hevy learned first and states in
    -- its own help centre. The app enforces it; this column just holds it.
    --
    -- NULL on all 873 existing rows and read as 'weight_reps', which is what
    -- every one of them is.
    ADD COLUMN IF NOT EXISTS log_type VARCHAR(20);

-- ─── template · how long the program runs ─────────────────────────────────────
ALTER TABLE template
    -- The program's length in weeks, which is what the Programs screen draws
    -- its weeks × days matrix from. NULL reads as one week — a template with no
    -- stated length is a single week's shape repeated, which is how every
    -- template written before this migration was built.
    ADD COLUMN IF NOT EXISTS weeks INTEGER;

-- ─── updated_at triggers for the two new tables ───────────────────────────────
CREATE TRIGGER trg_nudge_rule_updated_at
    BEFORE UPDATE ON nudge_rule
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_exercise_favourite_updated_at
    BEFORE UPDATE ON exercise_favourite
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
