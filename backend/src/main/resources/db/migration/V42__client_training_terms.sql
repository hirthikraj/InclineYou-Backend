-- V42 — consent to TRAIN, recorded beside consent to the privacy notice (22 Nov 2026, the owner's call).
--
-- A trainer may now deliver two sessions to a client who has not accepted their invite, and no more; health data, the
-- personal profile and notes wait for the acceptance outright (ConsentGate). The invite page gains one required tick —
-- "I'm fit to train, and I accept my trainer's coaching terms" — and this records it:
--
--   · client.training_terms_accepted_at — when the client ticked it. NULL on everybody who accepted before V42: they
--     are not asked again, and nothing branches on this column; acceptance (membership_status) is still the consent.
--   · accept_client_invite(uuid, date, varchar, boolean, boolean) — V37's act, then the stamp when the fifth argument is
--     true and the invite ended accepted (a replay of an accepted invite stamps it too, never twice: COALESCE).
--
-- The privacy notice's version is NOT bumped for this: it is shared with the trainer's own consent, and a new version
-- would ask every trainer to accept again for a line that is not addressed to them.

ALTER TABLE client ADD COLUMN training_terms_accepted_at timestamptz;

CREATE FUNCTION accept_client_invite(p_invite uuid, p_date_of_birth date, p_policy_version varchar,
                                     p_whatsapp_reminders boolean, p_training_terms boolean)
    RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE r jsonb;
BEGIN
    r := accept_client_invite(p_invite, p_date_of_birth, p_policy_version, p_whatsapp_reminders);
    IF p_training_terms AND r ->> 'result' = 'accepted' AND r ? 'client_id' THEN
        UPDATE client SET training_terms_accepted_at = COALESCE(training_terms_accepted_at, now())
         WHERE id = (r ->> 'client_id')::uuid;
    END IF;
    RETURN r;
END $$;

DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION accept_client_invite(uuid, date, varchar, boolean, boolean) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION accept_client_invite(uuid, date, varchar, boolean, boolean) TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;
