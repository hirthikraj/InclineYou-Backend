-- V21 · the place a session happens (api-contract 1.2, p-a2 · GET /v1/portal/home).
--
-- Home names the gym on the hero card ("Cult Koramangala"), and the gym is the trainer's — trainer_business.gym_name — which is not
-- a table the client lens opens and must not be. portal_wall() already carries the trainer's card across that wall, so it carries the
-- one more word. Replaced in place (V20): the signature, the guard and every other key are unchanged, and a removed client still
-- gets the trainer's name and nothing else.
CREATE OR REPLACE FUNCTION portal_wall(p_phone text) RETURNS jsonb
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
                                                'instagram_url', b.instagram_url, 'youtube_url', b.youtube_url, 'phone', tphone,
                                                'gym_name', b.gym_name) END,
        'my_details', CASE WHEN access = 'removed' THEN NULL
                           ELSE jsonb_build_object('name', c.name, 'goal', c.goal, 'height_cm', c.height_cm, 'timezone', c.timezone,
                                                   'activity_level', c.activity_level, 'date_of_birth', c.date_of_birth, 'phone', c.phone,
                                                   'version', (extract(epoch FROM c.updated_at) * 1000)::bigint) END);
END $$;
