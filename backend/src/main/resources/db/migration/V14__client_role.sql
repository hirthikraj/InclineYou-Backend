-- Screens 18–24 · the client role · FR-11
--
-- The role is a lens, not an account: same person, same login, same records,
-- read from the other side of the same session. So this migration adds almost
-- nothing. A client's plan is `program_exercise`, their sets are `set_log`,
-- their sessions are `scheduled_session`, their receipts are `payment`, and
-- their records are still computed on read and never stored (see V13).
--
-- Four things genuinely have nowhere to live:
--
--   1. Whether the client has confirmed a session their trainer moved (4b).
--   2. What the time WAS before the move, so the notice can strike it through.
--   3. When a client's access was paused, so sign-in can name the date (7b).
--   4. Sunday's weekly report, which is the one screen in the whole product
--      that does not come from the device. It is generated on the server and
--      stored, because a report whose numbers move after you have read it is
--      not a report.
--
-- Additive only: three new nullable columns and one new table. Nothing
-- renamed, retyped or dropped.

-- ─── the moved session ───────────────────────────────────────────────────────
ALTER TABLE scheduled_session
    -- Set when the trainer moves an existing booking, cleared never. Two
    -- purposes, and the second is the reason it is a timestamp rather than a
    -- boolean: the client's notice shows the old time struck through, because a
    -- client shown only the new time cannot tell what changed and will ask —
    -- which is the WhatsApp exchange the notice exists to replace.
    ADD COLUMN IF NOT EXISTS moved_from_at TIMESTAMPTZ;

ALTER TABLE scheduled_session
    -- The client's one-tap confirm. Deliberately NOT a status: a confirmed
    -- session is still `scheduled`, and the four statuses stay four. A move is
    -- also the ONLY thing a client may write to this table — they cannot move,
    -- cancel or no-show, because all three change somebody else's working day.
    ADD COLUMN IF NOT EXISTS client_confirmed_at TIMESTAMPTZ;

-- ─── paused access ───────────────────────────────────────────────────────────
ALTER TABLE client
    -- `status` already carries 'paused'. This carries WHEN, which is what turns
    -- a wall into information: "Ravi Kannan paused your account on 22 July.
    -- Your history is safe." Stamped by the sync push when the status flips, so
    -- an app that knows nothing about this column still produces the date.
    ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

-- ─── the weekly report ───────────────────────────────────────────────────────
-- FR-10.2. Written once, on Sunday night, by WeeklyReportJob — and then never
-- touched. Every other number in the app is derived on read so that correcting
-- a set from November fixes everything that depended on it; this one is stored
-- for the opposite reason. It was sent. Both people read the same figures, and
-- the trainer said something about them.
--
-- Which is also why there is no UPDATE path: the job inserts, and a row that
-- already exists for that week is left exactly as it was.
CREATE TABLE IF NOT EXISTS weekly_report (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id       UUID          NOT NULL REFERENCES trainer(id),
    client_id        UUID          NOT NULL REFERENCES client(id),
    -- Monday to Sunday, stored as dates because a week is a week in the
    -- trainer's timezone and not an instant.
    week_start       DATE          NOT NULL,
    week_end         DATE          NOT NULL,
    -- Kept out of planned, in that order, because the report opens with what
    -- the client kept and not with what they missed.
    sessions_kept    INTEGER       NOT NULL DEFAULT 0,
    sessions_planned INTEGER       NOT NULL DEFAULT 0,
    -- ISO weekday numbers that carry a logged workout, e.g. '2,7'. A string
    -- rather than an array because it is drawn as seven cells and never queried.
    trained_days     VARCHAR(20),
    volume_kg        NUMERIC(12,2) NOT NULL DEFAULT 0,
    sets_done        INTEGER       NOT NULL DEFAULT 0,
    -- How many records were worth announcing that week. Counted the same way
    -- the log counts them, so the two never disagree.
    new_bests        INTEGER       NOT NULL DEFAULT 0,
    -- "Back squat · 57.5 kg × 5" and "Was 55 kg on 22 July". Text, because the
    -- sentence is part of what was sent — reconstructing it later from live
    -- data would let the report change after it landed.
    best_line        TEXT,
    best_previous    TEXT,
    sent_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ
);

-- One report per client per week. The job relies on this to be idempotent: it
-- runs weekly, it can be re-run by hand, and neither may produce a second copy.
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_report_week
    ON weekly_report (client_id, week_start)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_weekly_report_trainer
    ON weekly_report (trainer_id, week_start DESC)
    WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_weekly_report_updated_at ON weekly_report;
CREATE TRIGGER trg_weekly_report_updated_at
    BEFORE UPDATE ON weekly_report
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A client signs in by phone, so sign-in asks "is this number on anybody's
-- roster" on every verify. Partial, because a soft-deleted client is not a
-- membership — but a paused one is, and 7b is the screen that says so.
CREATE INDEX IF NOT EXISTS idx_client_phone
    ON client (phone)
    WHERE phone IS NOT NULL AND deleted_at IS NULL;
