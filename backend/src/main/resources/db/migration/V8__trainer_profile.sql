-- Trainer setup profile — the six answers the onboarding flow collects.
-- Additive only: new nullable / defaulted columns on an existing table, no
-- renames, no retypes. An old client that never sends these keeps working; a
-- trainer created before this migration reads back as "setup not finished",
-- which is exactly what they are.

ALTER TABLE trainer
    -- A BAND, never a number of years: '' | 'lt1' | '1_2' | '3_5' | '6_10' | '10_plus'.
    -- Kept as a plain string so adding a band is a code change, not a migration.
    ADD COLUMN IF NOT EXISTS experience_band VARCHAR(20),

    -- Arrays of ids, JSONB to match how `client.weekly_schedule` and
    -- `client.metadata` already store lists in this schema. Anything the trainer
    -- typed themselves arrives prefixed `custom:` and is stored verbatim.
    ADD COLUMN IF NOT EXISTS specialities   JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS certifications JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS languages      JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- The authority on whether setup is owed. NULL = not finished. This is
    -- server-side on purpose: `isNewUser` only answers "first ever verify", so
    -- a trainer who cleared app data mid-flow used to come back as an existing
    -- user with no profile and never see the flow again.
    ADD COLUMN IF NOT EXISTS setup_completed_at TIMESTAMPTZ,

    -- Brings trainer in line with the rest of the core tables, which all carry
    -- an open metadata bag so the next optional field is not a migration.
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Clients filter coaches by language, so that lookup gets an index now rather
-- than after it is slow. GIN over JSONB answers `languages @> '["ta"]'`.
CREATE INDEX IF NOT EXISTS idx_trainer_languages ON trainer USING GIN (languages);
