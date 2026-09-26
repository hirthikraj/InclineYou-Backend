-- V3 · A SESSION KNOWS WHETHER THE RHYTHM PUT IT THERE
--
-- Selling a pack now books the sessions it owes: `DiaryService` joins the rhythm
-- on the client (`client.weekly_schedule` — which mornings) to the count on the
-- pack (`package.sessions_remaining` — how many) and writes the diary that
-- implies. Until this pass `POST /v1/clients/{id}/packages` wrote a package row
-- and a pending payment and stopped, so a trainer who had just agreed
-- Mon/Wed/Fri at 7am with a client opened the schedule and found it empty.
--
-- Because that write RECONCILES rather than appends — a rhythm that changes has
-- to move the diary with it — it needs to know which rows are its own.
--
--   WITHOUT THIS COLUMN THE ONLY AVAILABLE RULE IS "DELETE EVERY FUTURE
--   SCHEDULED SESSION AND RE-LAY THEM"
--
-- which quietly eats the extra Saturday before somebody's wedding and the
-- catch-up booked for a missed Tuesday. Those are not part of the rhythm, so the
-- rhythm may not take them away — but they still OCCUPY their instants, so a
-- standing slot that lands on one books nothing there rather than doubling it.
--
-- A trainer who MOVES a rhythm session on the schedule grid takes ownership of
-- it: `ScheduledSessionService.update` clears this flag on a move, so a
-- deliberate 7pm Thursday is not swept back to 6am Tuesday the next time
-- anything else about the client changes.
--
--   NULL MEANS "BOOKED BY HAND", AND THAT IS THE DELIBERATE READING
--
-- Every row written before this migration is null. Reading those as hand-booked
-- means the reconcile leaves them alone: the worst that costs is a stale slot a
-- trainer can cancel, against silently deleting a session somebody meant. No
-- backfill for the same reason — there is no way to tell, after the fact, which
-- of a client's existing Tuesdays came from their standing week and which were
-- typed, and a guess here deletes real bookings.
--
-- Additive, per the standing law: one nullable column, no drop, no rename, no
-- change to any existing response field.

ALTER TABLE public.scheduled_session
    ADD COLUMN from_schedule boolean;

COMMENT ON COLUMN public.scheduled_session.from_schedule IS
    'TRUE when DiaryService laid this row down from the client''s standing week, and therefore may move or remove it. NULL or FALSE means a trainer booked or moved it by hand and it is left alone. See V3.';
