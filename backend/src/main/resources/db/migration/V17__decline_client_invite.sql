-- V17 · "Not for me" (api-contract 1.2, inv-a4).
--
-- Declining needs no code — it proves nothing and grants nothing — so it is called with only the link, with no session, and the
-- tables it moves (client_invite, client) are closed to that caller by row-level security. This SECURITY DEFINER function is the
-- whole door, and it can only do one thing: end a LIVE pending invite as declined / not_for_me and mark that one client row
-- declined. It cannot touch an accepted invite (a stranger holding an old link must not be able to withdraw a client who has
-- joined), an expired or revoked one, or anything else; for all of those it changes nothing and says so.
--
-- Idempotent by target state: a second press, or a link already declined, answers 'already' and writes nothing.
-- Answers {result}: declined · already · none.
CREATE FUNCTION decline_client_invite(p_token_hash varchar) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE inv client_invite%ROWTYPE;
BEGIN
    SELECT * INTO inv FROM client_invite WHERE token_hash = p_token_hash FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('result', 'none'); END IF;
    IF inv.status = 'declined' THEN RETURN jsonb_build_object('result', 'already'); END IF;
    IF inv.status <> 'pending' OR inv.expires_at <= now() THEN RETURN jsonb_build_object('result', 'none'); END IF;

    UPDATE client_invite SET status = 'declined', declined_at = now(), decline_reason = 'not_for_me' WHERE id = inv.id;
    -- Only a client still waiting on this very invite moves: one who has since joined, left or been removed is left alone.
    UPDATE client SET membership_status = 'declined', declined_at = now()
     WHERE id = inv.client_id AND membership_status = 'invited' AND deleted_at IS NULL;
    RETURN jsonb_build_object('result', 'declined');
END $$;

DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION decline_client_invite(varchar) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION decline_client_invite(varchar) TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;
