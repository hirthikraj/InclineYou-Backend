-- V4 · A MISCOUNTED PACK CAN BE CORRECTED, AND A CORRECTION IS NOT A SALE
--
-- V30 gave the sold package a life — pause, resume, extend — and a log to keep
-- it in (`package_adjustment`). All three of those move TIME, so one `days`
-- column carried every one of them. This adds the fourth thing that happens to a
-- pack in the real world and the first that moves SESSIONS: the trainer typed
-- ten and sold twelve, or ticked a session off against the wrong client and
-- corrected the diary but not the count.
--
--   THE LINE THIS COLUMN DRAWS IS BETWEEN A CORRECTION AND A SALE
--
-- Selling somebody more sessions mid-pack does NOT come through here. That is a
-- second `package` row, because a package is what one client BOUGHT — a price,
-- a date, a price-list entry, an agreement — and adding six sessions to the row
-- they bought in August would rewrite August: the per-session price on that card
-- becomes an average of two different rates, the validity window covers sessions
-- it was never sold with, and no row anywhere still says what was actually
-- agreed. `POST /v1/packages/{id}/renew` with a `startDate` of today is that
-- write, and the web calls it *Add sessions*.
--
-- What comes through here is the case where NO MONEY MOVED and the stored count
-- was simply wrong. That is why this endpoint touches `sessions_total` and
-- `sessions_remaining` and never `amount` — it is the exact sibling of `extend`,
-- which gives days away and never touches the price either. Punchpass and
-- Mindbody both split it the same way: editing the credits on a pass somebody
-- holds is a staff correction, and selling them more is a purchase.
--
--   SIGNED, BECAUSE A CORRECTION GOES BOTH WAYS
--
-- `days` on an extend is always positive; `sessions` here is the DELTA and is
-- negative as often as not, since the commonest correction is a count that was
-- typed too high. Zero is refused by the service rather than stored, exactly as
-- a zero-day extension is — a no-op wearing a write's clothes.
--
-- `DEFAULT 0 NOT NULL` so every pause, resume and extend already in the table
-- reads back as "moved no sessions", which is true of all of them.
--
-- Additive, per the standing law: one column with a default, no drop, no rename,
-- no change to any existing response field. `AdjustmentResponse` GAINS
-- `sessions`; nothing loses anything.

ALTER TABLE public.package_adjustment
    ADD COLUMN sessions integer DEFAULT 0 NOT NULL;

COMMENT ON COLUMN public.package_adjustment.sessions IS
    'Signed change to package.sessions_total made by a correction (kind = ''sessions''). Zero on pause, resume and extend, which move days. Never written by a sale — buying more sessions is a second package row. See V4.';
