-- Delivery mode — is this session on the gym floor, or over a call?
--
-- Screen 03 (home) filters the day by it, and the teardown found TrueCoach is
-- the only platform in the category that segments this way. It is also the one
-- thing a trainer needs before deciding whether to leave the house.
--
-- Additive only: two new nullable columns, no renames, no retypes, no ENUM.
-- Statuses in this schema are plain strings validated in application code, and
-- this is no different — adding a third mode later must be a code change, not a
-- migration.
--
-- Deliberately NULL rather than DEFAULT 'floor'. Null means "nobody has said",
-- which is what lets a session fall back to its client's usual mode; a column
-- defaulted to 'floor' cannot tell an unanswered session from one a trainer
-- explicitly marked as floor, and the fallback would be dead on arrival.

ALTER TABLE client
    -- How this client is usually trained. The default for their sessions.
    ADD COLUMN IF NOT EXISTS delivery_mode VARCHAR(16);

ALTER TABLE scheduled_session
    -- Per-session override. A floor client's Thursday check-in call is remote,
    -- and that is the case the chips on home exist to make visible.
    ADD COLUMN IF NOT EXISTS delivery_mode VARCHAR(16);

-- Today's list is read by trainer and day on every app open, and it filters on
-- this column. Partial: the rows that have a mode set are the only ones the
-- index can help with, and early on most will be null.
CREATE INDEX IF NOT EXISTS idx_scheduled_session_delivery_mode
    ON scheduled_session (trainer_id, delivery_mode)
    WHERE delivery_mode IS NOT NULL AND deleted_at IS NULL;
