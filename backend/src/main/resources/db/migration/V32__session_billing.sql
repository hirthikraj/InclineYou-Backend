-- How a session is paid for (9 Nov 2026).
--
-- Until now every trainer-booked session had one billing rule: Mark done charges the client's live pack for the same
-- service, and a session with no pack (or a paused or empty one) is delivered uncharged. That left three ordinary cases
-- with no honest record — a trial before the client buys, a session the trainer gives free, and a client who pays per
-- session — all of which looked like "no pack", the same as money somebody forgot to chase.
--
-- billing says which one a session is, chosen at booking (or later, through POST /v1/sessions/{id}/billing):
--   pack           the default and today's behaviour: Mark done charges the live pack for the service
--   trial          delivered free, on purpose: never charges a pack, never flagged as owed
--   complimentary  the same, given free for another reason
--   single         paid on its own: Mark done sells a one-session package at `price` and charges it, so the amount is
--                  owed in the money book like any other sale
-- Booking still never charges; delivery does, as before. Additive only: every existing row is 'pack', which is exactly
-- what it already was.

ALTER TABLE scheduled_session
    ADD COLUMN billing varchar(16) NOT NULL DEFAULT 'pack',
    ADD COLUMN price numeric(10,2);

ALTER TABLE scheduled_session
    ADD CONSTRAINT scheduled_session_billing
        CHECK (billing IN ('pack', 'trial', 'complimentary', 'single')),
    -- A price belongs to a single session and only to it.
    ADD CONSTRAINT scheduled_session_price
        CHECK ((billing = 'single') = (price IS NOT NULL) AND (price IS NULL OR price > 0)),
    -- A workout the client did alone is never billed (V11 refuses its charge); it keeps the default.
    ADD CONSTRAINT scheduled_session_client_logged_billing
        CHECK (logged_by = 'trainer' OR billing = 'pack');

COMMENT ON COLUMN scheduled_session.billing IS
    'How the session is paid for: pack (Mark done charges the live pack), trial, complimentary (never charged), single (Mark done sells a one-session package at price).';
COMMENT ON COLUMN scheduled_session.price IS 'The price of a single session; set only when billing = single.';

-- The one-session package a single session sold. NULL for every other package. ON DELETE SET NULL so an erasure that
-- removes an undelivered booking never has to step round a package that outlives it as money.
ALTER TABLE package ADD COLUMN session_id uuid REFERENCES scheduled_session (id) ON DELETE SET NULL;
CREATE UNIQUE INDEX uq_package_single_session ON package (session_id) WHERE session_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN package.session_id IS 'Set on the one-session package a single-billed session sold at Mark done; NULL otherwise.';

-- The backstop for the service's rule (SessionChargeService): a trial or complimentary session never charges a pack,
-- and a single session charges only the package it sold. A pack-billed session may use any live pack, a leftover
-- single one included — that is a session the client already paid for.
CREATE FUNCTION check_session_billing_charge() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b text; own uuid;
BEGIN
    IF NEW.kind <> 'session' THEN RETURN NEW; END IF;
    SELECT billing INTO b FROM scheduled_session WHERE id = NEW.session_id;
    IF b IN ('trial', 'complimentary') THEN
        RAISE EXCEPTION 'a % session is not charged to a package', b USING ERRCODE = 'check_violation';
    END IF;
    IF b = 'single' THEN
        SELECT session_id INTO own FROM package WHERE id = NEW.package_id;
        IF own IS DISTINCT FROM NEW.session_id THEN
            RAISE EXCEPTION 'a single session is charged only to the package it sold' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_package_adjustment_billing BEFORE INSERT ON package_adjustment
    FOR EACH ROW EXECUTE FUNCTION check_session_billing_charge();
