-- V22 · two writes a client's session cannot make for itself (api-contract 1.2, p-a4 POST /v1/portal/ack, p-a5 POST /v1/portal/consent).
--
--   · client_ack_removed(phone) — "I have seen that my trainer ended this". A removed client has an EMPTY lens (client_ids_for_phone
--     answers live rows only), so no UPDATE through the policies can reach their row; this is the one door. It stamps
--     client.removed_ack_at ONCE, on the row the wall is drawn from, and answers whether it moved anything, so a replay is a no-op
--     that the caller can tell from the first time.
--   · client_accept_policy(phone, version) — the client twin of POST /v1/trainers/me/consent. The pair on app_user and
--     client.accepted_policy_version are both outside what a client may change (guard_client_columns), and consent is the PERSON's,
--     so it is written for every accepted arrangement of the number, not just one. A version already on file keeps its original date:
--     the date is evidence and must not move on a retry.
--
-- Both answer only for the number in app.phone — the same refusal V20's three functions make.

CREATE FUNCTION client_ack_removed(p_phone text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE n int;
BEGIN
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system' AND p_phone IS DISTINCT FROM app_phone() THEN
        RAISE EXCEPTION 'only the number that signed in can acknowledge' USING ERRCODE = 'insufficient_privilege';
    END IF;
    UPDATE client SET removed_ack_at = now()
     WHERE id = client_best_row(p_phone) AND membership_status = 'removed' AND removed_ack_at IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n > 0;
END $$;

CREATE FUNCTION client_accept_policy(p_phone text, p_version text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
BEGIN
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system' AND p_phone IS DISTINCT FROM app_phone() THEN
        RAISE EXCEPTION 'only the number that signed in can accept for it' USING ERRCODE = 'insufficient_privilege';
    END IF;
    UPDATE app_user SET privacy_policy_version = p_version, privacy_accepted_at = now()
     WHERE phone = p_phone AND role = 'client' AND deleted_at IS NULL
       AND (privacy_policy_version IS DISTINCT FROM p_version OR privacy_accepted_at IS NULL);
    UPDATE client SET accepted_policy_version = p_version
     WHERE phone = p_phone AND membership_status = 'accepted' AND erased_at IS NULL
       AND accepted_policy_version IS DISTINCT FROM p_version;
END $$;

DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION client_ack_removed(text), client_accept_policy(text, text) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION client_ack_removed(text), client_accept_policy(text, text) TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;
