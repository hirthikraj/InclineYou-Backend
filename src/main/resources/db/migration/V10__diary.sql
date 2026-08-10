-- Screen 05 · Diary · FR-2.
--
-- Three things the diary needs that the schema has never carried: when the
-- trainer works, when they are unavailable, and what a session did to a pack.
--
-- Additive only. Two new tables, five new nullable columns, no renames, no
-- retypes, no ENUMs. Statuses stay plain strings validated in application code.

-- ── Working hours ────────────────────────────────────────────────────────────
--
-- One row per window, not per day: a personal trainer works a split shift, and
-- "Monday 06:00–11:00 and 17:00–21:00" is two windows. A single start/end pair
-- per day would have to claim they are available for lunch, which is the exact
-- lie the design refuses to draw.
--
-- Minutes from midnight rather than TIME, because every consumer does interval
-- arithmetic on it — a free-slot search is subtraction, and doing that in SQL
-- time types buys nothing on the phone, which is where it runs.
--
-- Trainerize stacks four availability types in a precedence order. This is
-- layer one of two, and it constrains client self-booking only: the trainer's
-- own booking ignores it (see §07).
CREATE TABLE IF NOT EXISTS working_hours (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id    UUID        NOT NULL REFERENCES trainer(id),
    -- 0 = Monday … 6 = Sunday. ISO order, so it matches the day strip.
    weekday       SMALLINT    NOT NULL,
    start_minute  SMALLINT    NOT NULL,
    end_minute    SMALLINT    NOT NULL,
    metadata      JSONB       NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_working_hours_trainer
    ON working_hours (trainer_id, weekday)
    WHERE deleted_at IS NULL;

-- ── Time blocks ──────────────────────────────────────────────────────────────
--
-- Layer two: a dated hole in the diary. One table covers both an afternoon and
-- a fortnight in Kerala, because the only difference is the length — giving
-- "vacation" its own table would mean two code paths for one idea.
--
-- A block stops new bookings and nothing else. Sessions already inside it stay
-- exactly where they are; what happens to them is the trainer's decision in the
-- sheet (5b), never the migration's.
CREATE TABLE IF NOT EXISTS time_block (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id  UUID        NOT NULL REFERENCES trainer(id),
    starts_at   TIMESTAMPTZ NOT NULL,
    ends_at     TIMESTAMPTZ NOT NULL,
    -- True for whole days, so a viewer never has to infer it from 00:00–23:59.
    all_day     BOOLEAN     NOT NULL DEFAULT FALSE,
    reason      VARCHAR(120),
    metadata    JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_time_block_trainer_range
    ON time_block (trainer_id, starts_at, ends_at)
    WHERE deleted_at IS NULL;

-- ── Sessions ─────────────────────────────────────────────────────────────────

ALTER TABLE scheduled_session
    -- Recurrence. The occurrences are real rows — a series is a set of sessions
    -- that were created together, not a rule evaluated at read time — and this
    -- is what lets "cancel the rest of these" find them. Null for a one-off.
    ADD COLUMN IF NOT EXISTS series_id UUID;

ALTER TABLE scheduled_session
    -- Who called it off: 'client' or 'trainer'. Deliberately NOT a fifth
    -- status. §07 caps this screen at four (scheduled, done, no_show,
    -- cancelled) because every status is a decision someone has to make
    -- mid-session, and Vagaro's nine describe a reception desk. The two kinds
    -- of cancellation differ in who apologises, not in what the diary shows.
    ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(16);

-- The pack ledger, inlined.
--
-- §07: a pack moves on `done` or `no_show`, never on `booked` — and every pack
-- change from this screen is undoable for 24 hours. Undo therefore has to know
-- exactly what was applied and to which package, because by the time someone
-- taps it the package may have been renewed, part-paid or expired. Recomputing
-- the delta from the status would guess; these three columns remember.
--
-- Three nullable columns rather than a `pack_change` table: the fact belongs to
-- one session, is read whenever that session is on screen, and is never
-- aggregated. A join table would add a hop to the hottest read on the screen.
ALTER TABLE scheduled_session
    ADD COLUMN IF NOT EXISTS pack_delta INTEGER;

ALTER TABLE scheduled_session
    ADD COLUMN IF NOT EXISTS pack_package_id UUID;

ALTER TABLE scheduled_session
    ADD COLUMN IF NOT EXISTS pack_applied_at TIMESTAMPTZ;

-- The diary reads one day, one week or one month at a time, always for one
-- trainer, always in time order. This is that query.
CREATE INDEX IF NOT EXISTS idx_scheduled_session_trainer_at
    ON scheduled_session (trainer_id, scheduled_at)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_session_series
    ON scheduled_session (series_id)
    WHERE series_id IS NOT NULL AND deleted_at IS NULL;
