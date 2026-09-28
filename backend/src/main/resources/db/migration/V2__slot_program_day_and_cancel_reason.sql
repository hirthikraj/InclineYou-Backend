-- V2 · additive, approved 28 Sep 2026 (api-contract 1.1 R45 and R68).

-- R45 · the program day a weekly slot books: "Monday is legs". Null keeps the
-- sequence rule for a client with no program. 1..7 is program_length's own
-- range for days; the upper bound against THIS client's program is checked at
-- write time (PROGRAM_DAY_OUT_OF_RANGE), because a program can be replaced.
ALTER TABLE client_schedule_slot ADD COLUMN program_day smallint;
ALTER TABLE client_schedule_slot ADD CONSTRAINT client_schedule_slot_program_day
    CHECK (program_day IS NULL OR program_day BETWEEN 1 AND 7);

-- R68 · why a session was cancelled. Pausing a client cancels the sessions in
-- the pause, and moving the return date must put back those and only those —
-- never one the trainer or client called off by hand (R70).
ALTER TABLE scheduled_session ADD COLUMN cancel_reason varchar(16);
ALTER TABLE scheduled_session ADD CONSTRAINT scheduled_session_cancel_reason
    CHECK (cancel_reason IS NULL OR cancel_reason IN ('trainer', 'client', 'client_paused', 'client_archived', 'schedule_changed'));

-- Every cancel before this column was a trainer's, so that is the backfill.
UPDATE scheduled_session SET cancel_reason = 'trainer' WHERE status = 'cancelled';

ALTER TABLE scheduled_session ADD CONSTRAINT scheduled_session_cancelled_has_reason
    CHECK ((status = 'cancelled') = (cancel_reason IS NOT NULL));
