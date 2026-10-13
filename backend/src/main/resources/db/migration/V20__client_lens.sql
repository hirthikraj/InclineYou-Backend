-- V20 · the client lens, and the wall (api-contract 1.2, p-a1 · GET /v1/portal/me).
--
-- Three functions, all SECURITY DEFINER and all answering only for the number in app.phone (the request's own, or a bootstrap
-- context for it — anyone else is refused), because the caller of each is a client who has proved a number and whose row-level
-- lens is not built yet at the moment of asking:
--
--   · client_ids_for_phone(phone) — the ids the client LENS is built from (app_client_ids()). Only LIVE rows: accepted, and not
--     paused or archived by the trainer, not deleted, not erased. The policies in V11 key on app_client_ids() and carry no
--     membership check of their own, so this list IS the wall: a paused or removed client's list is empty and every table the lens
--     opens stays shut to them, whatever a controller forgets.
--   · portal_wall(phone) — what GET /v1/portal/me answers for ANY access, because a paused or removed client has no lens to read
--     it with: which wall, whose client, and — for everyone but a removed client — the trainer's card and their own details. A
--     removed client gets the trainer's NAME only: the person has left.
--   · client_sign_in_state(phone) — replaced in place (V18) so "access" means what the contract says: removed when
--     membership_status = removed, else paused when the trainer paused the client (client.status = paused), else active.
--     membership_status = 'paused' (the client's own pause) is unused (S-08) but still reads as paused.
--
-- When a number has several client rows the best one wins: live, then paused, then removed, newest first.

CREATE FUNCTION client_best_row(p_phone text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
    SELECT c.id FROM client c
     WHERE c.phone = p_phone AND c.membership_status IN ('accepted', 'paused', 'removed') AND c.erased_at IS NULL
     ORDER BY CASE WHEN c.membership_status = 'accepted' AND c.status NOT IN ('paused', 'archived') THEN 0
                   WHEN c.membership_status <> 'removed' THEN 1 ELSE 2 END,
              COALESCE(c.accepted_at, c.removed_at, c.created_at) DESC
     LIMIT 1
$$;

CREATE OR REPLACE FUNCTION client_sign_in_state(p_phone text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
BEGIN
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system' AND p_phone IS DISTINCT FROM app_phone() THEN
        RAISE EXCEPTION 'a client''s state can be read only for the number that signed in' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN (
        SELECT jsonb_build_object(
                   'access', CASE WHEN c.membership_status = 'removed' THEN 'removed'
                                  WHEN c.membership_status = 'paused' OR c.status = 'paused' THEN 'paused'
                                  ELSE 'active' END,
                   'trainer_name', t.name, 'headline', b.headline)
          FROM client c
          JOIN trainer t ON t.id = c.trainer_id
          LEFT JOIN trainer_business b ON b.trainer_id = t.id
         WHERE c.id = client_best_row(p_phone));
END $$;

CREATE FUNCTION client_ids_for_phone(p_phone text) RETURNS uuid[]
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
BEGIN
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system' AND p_phone IS DISTINCT FROM app_phone() THEN
        RAISE EXCEPTION 'a client''s ids can be read only for the number that signed in' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN COALESCE((
        SELECT array_agg(c.id ORDER BY c.accepted_at) FROM client c
         WHERE c.phone = p_phone AND c.membership_status = 'accepted' AND c.status NOT IN ('paused', 'archived')
           AND c.deleted_at IS NULL AND c.erased_at IS NULL), ARRAY[]::uuid[]);
END $$;

CREATE FUNCTION portal_wall(p_phone text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE c client%ROWTYPE; t trainer%ROWTYPE; b trainer_business%ROWTYPE; tphone text; access text;
BEGIN
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system' AND p_phone IS DISTINCT FROM app_phone() THEN
        RAISE EXCEPTION 'the wall can be read only for the number that signed in' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT * INTO c FROM client WHERE id = client_best_row(p_phone);
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO t FROM trainer WHERE id = c.trainer_id;
    SELECT * INTO b FROM trainer_business WHERE trainer_id = t.id;
    SELECT u.phone INTO tphone FROM app_user u WHERE u.id = t.app_user_id;
    access := CASE WHEN c.membership_status = 'removed' THEN 'removed'
                   WHEN c.membership_status = 'paused' OR c.status = 'paused' THEN 'paused' ELSE 'active' END;
    RETURN jsonb_build_object(
        'client_id', c.id, 'access', access,
        'paused_until', c.paused_until, 'removed_at', (extract(epoch FROM c.removed_at) * 1000)::bigint,
        'removed_by', c.removed_by, 'acknowledged_at', (extract(epoch FROM c.removed_ack_at) * 1000)::bigint,
        'trainer', CASE WHEN access = 'removed'
                        THEN jsonb_build_object('name', t.name)
                        ELSE jsonb_build_object('name', t.name, 'headline', b.headline, 'bio', b.bio, 'intro_video_url', b.intro_video_url,
                                                'certifications', b.certifications, 'specialities', b.specialities, 'languages', b.languages,
                                                'instagram_url', b.instagram_url, 'youtube_url', b.youtube_url, 'phone', tphone) END,
        'my_details', CASE WHEN access = 'removed' THEN NULL
                           ELSE jsonb_build_object('name', c.name, 'goal', c.goal, 'height_cm', c.height_cm, 'timezone', c.timezone,
                                                   'activity_level', c.activity_level, 'date_of_birth', c.date_of_birth, 'phone', c.phone,
                                                   'version', (extract(epoch FROM c.updated_at) * 1000)::bigint) END);
END $$;

DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION client_best_row(text), client_ids_for_phone(text), portal_wall(text) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION client_ids_for_phone(text), portal_wall(text) TO inclineyou_app';
    -- client_best_row has no phone guard of its own: it is a helper for the three above and is not granted to the request role.
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;
