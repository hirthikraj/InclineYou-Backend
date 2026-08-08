-- Additive only: two new nullable columns on `exercise` plus a unique index.
-- Nothing existing is renamed, retyped, or dropped.

-- `level` comes straight from free-exercise-db ('beginner' | 'intermediate' | 'expert').
-- String, not an enum, so new values are a code change rather than a migration.
ALTER TABLE exercise ADD COLUMN IF NOT EXISTS level VARCHAR(20);

-- Brings `exercise` in line with the data-model contract's "metadata JSONB on every
-- core entity" rule. Holds the long tail from the seed (mechanic, category,
-- secondary muscles, the full image list) without a column per field.
ALTER TABLE exercise ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Makes the seeder idempotent: re-running it upserts on source_id instead of
-- duplicating the library. Partial, so trainer-created exercises (source_id NULL)
-- are unconstrained and any number of them can exist.
CREATE UNIQUE INDEX IF NOT EXISTS uq_exercise_source_id
    ON exercise (source_id) WHERE source_id IS NOT NULL;
