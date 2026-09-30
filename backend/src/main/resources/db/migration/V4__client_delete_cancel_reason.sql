-- V4 · additive, 29 Sep 2026. A trainer-initiated client delete cancels every
-- upcoming session the same way pause/archive do (ClientScheduleJdbcRepository
-- .cancelUpcoming), so it needs its own cancel_reason to tell the three verbs
-- apart later. Delete itself sets no new column on `client` — deleted_at is
-- the same tombstone every soft delete in this schema already uses, and
-- `erased_at` stays untouched: that column is for the DPDP erasure this is
-- deliberately not (see api-contract, DELETE /v1/me's "a membership exit, not
-- an erasure").
ALTER TABLE scheduled_session DROP CONSTRAINT scheduled_session_cancel_reason;
ALTER TABLE scheduled_session ADD CONSTRAINT scheduled_session_cancel_reason
    CHECK (cancel_reason IS NULL OR cancel_reason IN ('trainer', 'client', 'client_paused', 'client_archived', 'client_deleted', 'schedule_changed'));
