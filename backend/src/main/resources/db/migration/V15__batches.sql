-- Diary 3d · batches.
--
-- A batch is a group session on the floor — the word an Indian gym uses, and
-- the reason this is not called a "class": a class implies a timetable somebody
-- signs up to, where a batch is the four people who happen to train at six.
--
-- The modelling decision that matters: a batch is NOT one session with many
-- clients. Every attendee keeps their own `scheduled_session` row and they
-- share a `batch_id`. That is what lets a pack move per person, lets one
-- attendee no-show while the rest train, and keeps the 24-hour undo exact —
-- all rules that already exist and none of which survive a single shared row.
--
-- Additive only: one new table, one new nullable column.

CREATE TABLE IF NOT EXISTS batch (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id  UUID NOT NULL REFERENCES trainer(id),
    name        VARCHAR(120) NOT NULL,
    -- What the floor holds. The diary's "8/10" is booked over this.
    capacity    INTEGER NOT NULL DEFAULT 10,
    -- Below this it is not worth running, and the agenda row says so in advance
    -- while there is still time to fill it.
    min_size    INTEGER NOT NULL DEFAULT 4,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_batch_trainer ON batch (trainer_id) WHERE deleted_at IS NULL;

ALTER TABLE scheduled_session ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batch(id);

CREATE INDEX IF NOT EXISTS idx_scheduled_session_batch
    ON scheduled_session (batch_id) WHERE batch_id IS NOT NULL AND deleted_at IS NULL;
