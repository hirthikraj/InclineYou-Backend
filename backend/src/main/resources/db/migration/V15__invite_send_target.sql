-- V15 · who a live invite link sends its code to (api-contract 1.2, inv-a2).
--
-- "Send the code" is called with nothing but the link: there is no session, so client_invite is closed to the caller by
-- row-level security, and the number the code must go to is the one thing the caller may NOT supply (that is what stops an
-- invite being a way to make us message an arbitrary number). This SECURITY DEFINER function is the whole door: it answers the
-- invite's id and number for a link that is still pending, unexpired and still points at the client row it was minted for, and
-- NULL for everything else — one answer for a dead link, whatever killed it, so a guess learns nothing.
-- Read-only, like invite_card().
CREATE FUNCTION invite_send_target(p_token_hash varchar) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
    SELECT jsonb_build_object('invite_id', i.id, 'phone', i.phone)
      FROM client_invite i
      JOIN client c ON c.id = i.client_id
     WHERE i.token_hash = p_token_hash AND i.status = 'pending' AND i.expires_at > now()
       AND c.phone IS NOT DISTINCT FROM i.phone AND c.deleted_at IS NULL AND c.erased_at IS NULL
$$;

DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION invite_send_target(varchar) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION invite_send_target(varchar) TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;
