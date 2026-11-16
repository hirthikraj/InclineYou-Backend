-- A single session's sale pays for its own session and no other (13 Nov 2026).
--
-- V32 let a pack-billed session be charged to any live package, "a leftover single one included". That was safe while
-- a single session's sale was made at Mark done and used up in the same moment. Since 10 Nov (V33) the sale is made at
-- booking, so next week's ₹800 sale is a live one-session package today — and a pack session marked done with no
-- usable pack took it, leaving next week's single session delivered with nothing charged. The service no longer picks
-- such a package (SessionStateJdbcRepository.payingPack); this is the backstop: a package that is a session's own sale
-- (package.session_id set) is charged only for that session, whatever the charged session's billing.
--
-- Replaces the V32 function in place; the trigger is unchanged.

CREATE OR REPLACE FUNCTION check_session_billing_charge() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b text; own uuid;
BEGIN
    IF NEW.kind <> 'session' THEN RETURN NEW; END IF;
    SELECT billing INTO b FROM scheduled_session WHERE id = NEW.session_id;
    IF b IN ('trial', 'complimentary') THEN
        RAISE EXCEPTION 'a % session is not charged to a package', b USING ERRCODE = 'check_violation';
    END IF;
    SELECT session_id INTO own FROM package WHERE id = NEW.package_id;
    IF b = 'single' AND own IS DISTINCT FROM NEW.session_id THEN
        RAISE EXCEPTION 'a single session is charged only to the package it sold' USING ERRCODE = 'check_violation';
    END IF;
    IF own IS NOT NULL AND own <> NEW.session_id THEN
        RAISE EXCEPTION 'package % is another session''s own sale', NEW.package_id USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
