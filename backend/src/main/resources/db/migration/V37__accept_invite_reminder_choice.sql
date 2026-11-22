-- V37 — accepting an invite records the client's own WhatsApp-reminder choice (21 Nov 2026, the owner's call).
--
-- accept_client_invite() (V11) stamped client_prefs.whatsapp_opt_in_at whenever the TRAINER's session_reminders switch was
-- on, so a client who joined then was opted in to WhatsApp reminders without being asked — the invite page said nothing
-- about reminders. D-17 decided reminders are opt-in on both sides, and a WhatsApp business message needs the person's own
-- opt-in. Now the invite page asks ("Send me WhatsApp reminders", unticked) and the answer rides on the accept:
--
--   · accept_client_invite(uuid, date, varchar, boolean) — the same act as V11's, except that whatsapp_opt_in_at is stamped
--     only when p_whatsapp_reminders is true, whatever the trainer's switch says. Sending still needs both the trainer's
--     switch and this opt-in; the opt-in is the client's consent and is recorded even while the trainer's switch is off.
--   · accept_client_invite(uuid, date, varchar) — V11's signature, replaced in place so nothing that still calls it can opt
--     anyone in: it is the four-argument one with p_whatsapp_reminders = false.
--
-- An opt-in already on the row (COALESCE) is kept either way: accepting again never withdraws one.

CREATE FUNCTION accept_client_invite(p_invite uuid, p_date_of_birth date, p_policy_version varchar, p_whatsapp_reminders boolean)
    RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE inv client_invite%ROWTYPE; c client%ROWTYPE; au app_user%ROWTYPE;
BEGIN
    SELECT * INTO inv FROM client_invite WHERE id = p_invite FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('result', 'expired'); END IF;
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system' AND inv.phone IS DISTINCT FROM app_phone() THEN
        RAISE EXCEPTION 'an invite can be accepted only by the number it was sent to' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF inv.status = 'accepted' THEN
        RETURN jsonb_build_object('result', 'accepted', 'client_id', inv.client_id);
    END IF;
    IF inv.status <> 'pending' OR inv.expires_at <= now() THEN RETURN jsonb_build_object('result', 'expired'); END IF;
    IF p_date_of_birth IS NULL OR p_policy_version IS NULL THEN
        RAISE EXCEPTION 'a date of birth and the notice version are required' USING ERRCODE = 'invalid_parameter_value';
    END IF;

    SELECT * INTO c FROM client WHERE id = inv.client_id FOR UPDATE;
    IF c.phone IS DISTINCT FROM inv.phone OR c.erased_at IS NOT NULL OR c.deleted_at IS NOT NULL THEN
        UPDATE client_invite SET status = 'revoked', revoked_at = now(),
               revoked_reason = CASE WHEN c.erased_at IS NOT NULL THEN 'erased' ELSE 'number_changed' END
         WHERE id = inv.id;
        RETURN jsonb_build_object('result', 'expired');
    END IF;

    -- adults only (decided 25 Sep 2026): the invite ends, and the trainer is told only that the age requirement was not met
    IF p_date_of_birth > (current_date - interval '18 years')::date OR p_date_of_birth < DATE '1900-01-01' THEN
        UPDATE client_invite SET status = 'declined', declined_at = now(), decline_reason = 'age_requirement' WHERE id = inv.id;
        UPDATE client SET membership_status = 'declined', declined_at = now() WHERE id = c.id;
        RETURN jsonb_build_object('result', 'age_requirement');
    END IF;

    SELECT * INTO au FROM app_user WHERE phone = inv.phone;
    IF FOUND AND (au.role <> 'client' OR au.deleted_at IS NOT NULL) THEN
        RETURN jsonb_build_object('result', 'unavailable');
    END IF;
    IF NOT FOUND THEN
        INSERT INTO app_user (phone, role, privacy_accepted_at, privacy_policy_version)
        VALUES (inv.phone, 'client', now(), p_policy_version) RETURNING * INTO au;
    ELSIF au.privacy_policy_version IS DISTINCT FROM p_policy_version THEN
        UPDATE app_user SET privacy_accepted_at = now(), privacy_policy_version = p_policy_version WHERE id = au.id;
    END IF;

    UPDATE client SET date_of_birth = p_date_of_birth, membership_status = 'accepted', accepted_at = now(),
                      accepted_policy_version = p_policy_version, declined_at = NULL
     WHERE id = c.id;
    -- The client's own choice, not the trainer's switch (V37).
    INSERT INTO client_prefs (client_id, tenant_id, whatsapp_opt_in_at)
    VALUES (c.id, c.tenant_id, CASE WHEN p_whatsapp_reminders THEN now() END)
    ON CONFLICT (client_id) DO UPDATE
        SET whatsapp_opt_in_at = COALESCE(client_prefs.whatsapp_opt_in_at, EXCLUDED.whatsapp_opt_in_at), deleted_at = NULL;
    UPDATE client_invite SET status = 'accepted', accepted_at = now(), policy_version = p_policy_version WHERE id = inv.id;
    RETURN jsonb_build_object('result', 'accepted', 'client_id', c.id, 'app_user_id', au.id);
END $$;

-- V11's signature, kept for anything that still calls it, and no longer able to opt anyone in.
CREATE OR REPLACE FUNCTION accept_client_invite(p_invite uuid, p_date_of_birth date, p_policy_version varchar) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
    SELECT accept_client_invite(p_invite, p_date_of_birth, p_policy_version, false)
$$;

DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION accept_client_invite(uuid, date, varchar, boolean) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION accept_client_invite(uuid, date, varchar, boolean) TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;
