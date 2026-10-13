-- V18 · where a number lands after its code (api-contract 1.2, inv-a5).
--
-- POST /v1/auth/otp/verify now has to tell a client from a trainer from a stranger, and the tables that say so (client,
-- client_invite) are closed to a caller who has only just proved a number and holds no session. Two doors, both SECURITY DEFINER
-- and both answering only for the number that was proved (the service sets app.phone to it; anyone else is refused):
--
--   · client_sign_in_state(phone) — which wall this client is on: active (accepted), paused, or removed (left, or removed by the
--     trainer), and whose client they are. One row wins when a number has several: accepted, then paused, then removed, newest
--     first, so somebody who left one trainer and joined another opens into the new one, not the wall.
--   · pending_invites_for_phone(phone) — replaced in place (signature unchanged, V11's grants kept) to also say when each invite
--     lapses, which the login page's short list shows.
CREATE FUNCTION client_sign_in_state(p_phone text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
BEGIN
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system' AND p_phone IS DISTINCT FROM app_phone() THEN
        RAISE EXCEPTION 'a client''s state can be read only for the number that signed in' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN (
        SELECT jsonb_build_object(
                   'access', CASE c.membership_status WHEN 'accepted' THEN 'active' ELSE c.membership_status END,
                   'trainer_name', t.name, 'headline', b.headline)
          FROM client c
          JOIN trainer t ON t.id = c.trainer_id
          LEFT JOIN trainer_business b ON b.trainer_id = t.id
         WHERE c.phone = p_phone AND c.membership_status IN ('accepted', 'paused', 'removed') AND c.erased_at IS NULL
         ORDER BY CASE c.membership_status WHEN 'accepted' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
                  COALESCE(c.accepted_at, c.removed_at, c.created_at) DESC
         LIMIT 1);
END $$;

CREATE OR REPLACE FUNCTION pending_invites_for_phone(p_phone text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
BEGIN
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system' AND p_phone IS DISTINCT FROM app_phone() THEN
        RAISE EXCEPTION 'invites can be listed only for the number that signed in' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object('invite_id', i.id, 'trainer_name', t.name, 'headline', b.headline,
                                            'expires_at', (extract(epoch FROM i.expires_at) * 1000)::bigint) ORDER BY i.created_at)
          FROM client_invite i
          JOIN trainer t ON t.id = i.trainer_id
          LEFT JOIN trainer_business b ON b.trainer_id = t.id
         WHERE i.phone = p_phone AND i.status = 'pending' AND i.expires_at > now()), '[]'::jsonb);
END $$;

DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION client_sign_in_state(text) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION client_sign_in_state(text) TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;
