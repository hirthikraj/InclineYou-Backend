-- V16 · what "Let me in" needs to know about a link, for every state it can be in (api-contract 1.2, inv-a3).
--
-- Accepting is called with nothing but the link and a code, and it must tell four things apart that invite_card() and
-- invite_send_target() deliberately do not: a LIVE link (go on), one that was ALREADY ACCEPTED (a double tap or a reopened tab
-- is a replay, not a failure — it answers with a fresh session when the code that did it was just used), and every dead one
-- (one answer). It also carries the trainer's name and headline, because once an invite is accepted invite_card() answers only
-- 'used' and the response to a replay still has to say whose client this is.
--
-- SECURITY DEFINER and read-only, like the other two doors; NULL for a token that matches nothing. The caller learns nothing
-- from it directly: the service turns every not-live, not-replayable answer into the same 422.
CREATE FUNCTION invite_for_accept(p_token_hash varchar) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
    SELECT jsonb_build_object(
               'invite_id', i.id, 'client_id', i.client_id, 'phone', i.phone, 'status', i.status,
               'live', (i.status = 'pending' AND i.expires_at > now()
                        AND c.phone IS NOT DISTINCT FROM i.phone AND c.deleted_at IS NULL AND c.erased_at IS NULL),
               'accepted_at', (extract(epoch FROM i.accepted_at) * 1000)::bigint,
               -- Another trainer already has this number as an accepted or paused client (one client, one trainer, R94). Said so
               -- here, rather than learned from the unique index, so the answer is a clean 409 and not an aborted transaction.
               'with_another_trainer', EXISTS (SELECT 1 FROM client o WHERE o.phone = i.phone AND o.id <> i.client_id
                                                AND o.membership_status IN ('accepted', 'paused') AND o.deleted_at IS NULL),
               'trainer_name', t.name, 'headline', b.headline)
      FROM client_invite i
      JOIN client c ON c.id = i.client_id
      JOIN trainer t ON t.id = i.trainer_id
      LEFT JOIN trainer_business b ON b.trainer_id = t.id
     WHERE i.token_hash = p_token_hash
$$;

DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION invite_for_accept(varchar) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION invite_for_accept(varchar) TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;
