-- A single session is sold when it is booked (decided 10 Nov 2026), not when it is marked done.
--
-- V32 sold the one-session package at Mark done. The owner's rule is now: booking a single session means the client
-- owes for it (due on the session's day); Undo takes the booking and the sale back within ten minutes; after that a
-- cancel or a no-show asks whether to charge, and "no" closes the sale (status cancelled — kept, nothing owed). So a
-- session's sale now lives through cancel and reopen, and can be refunded and then booked again.
--
-- uq_package_single_session allowed one non-deleted package per session. A REFUNDED sale is a finished money record
-- that must stay, and the session it was for may be reopened and sold again — so a refunded sale no longer holds the
-- session's one place. Every other state still does: a cancelled sale is the one a reopen revives. Index only; no
-- column or row changes.

DROP INDEX uq_package_single_session;
CREATE UNIQUE INDEX uq_package_single_session ON package (session_id)
    WHERE session_id IS NOT NULL AND deleted_at IS NULL AND status <> 'refunded';
