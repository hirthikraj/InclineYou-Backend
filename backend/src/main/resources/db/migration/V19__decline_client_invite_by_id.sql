-- V19 · "Not for me" from a number that has already signed in (api-contract 1.2, inv-a7).
--
-- decline_client_invite() (V17) is keyed by the link's token hash, and a session that found an invite on the login page holds no
-- token — only its id. This is the same single act for that caller: it finds the invite by id and, ONLY if the invite is for the
-- number the request signed in with, hands it to the token-keyed function. For any other number (or an unknown id) it does
-- nothing and says so quietly, so an id teaches nothing and a session cannot decline somebody else's invite.
-- Answers {result}: declined · already · none.
CREATE FUNCTION decline_client_invite_by_id(p_invite uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE inv client_invite%ROWTYPE;
BEGIN
    SELECT * INTO inv FROM client_invite WHERE id = p_invite;
    IF NOT FOUND THEN RETURN jsonb_build_object('result', 'none'); END IF;
    -- session_user, not current_user: inside a SECURITY DEFINER function current_user is the owner (see V11).
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system' AND inv.phone IS DISTINCT FROM app_phone() THEN
        RETURN jsonb_build_object('result', 'none');
    END IF;
    RETURN decline_client_invite(inv.token_hash);
END $$;

DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION decline_client_invite_by_id(uuid) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION decline_client_invite_by_id(uuid) TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;
