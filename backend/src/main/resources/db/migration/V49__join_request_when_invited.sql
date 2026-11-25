-- V49 — a join request from somebody the trainer already added (23 Nov 2026).
--
-- submit_join_request() (V45) answered already_client to every number on this workspace's list, and the page then said
-- "sign in instead". That is only true of a member. Somebody the trainer added and invited cannot sign in until they open
-- the invite, and somebody added but never sent a link cannot sign in at all. Replaced in place, same signature, with
-- two new answers before already_client:
--   · invite_waiting  added, and a pending invite that has not lapsed: "open the link your trainer sent you".
--   · ask_for_invite  added, with no live invite (never sent, or lapsed): "ask your trainer to send you an invite link".
-- These are told only to a number proved by its code (the function still refuses any number but app.phone), so they say
-- nothing about anybody else. Everything else is V45's, unchanged.

CREATE OR REPLACE FUNCTION submit_join_request(p_slug varchar, p_name varchar, p_phone varchar, p_email varchar, p_date_of_birth date,
                                    p_gender varchar, p_pack uuid, p_answers jsonb, p_policy_version varchar,
                                    p_whatsapp_reminders boolean, p_training_terms boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE l join_link%ROWTYPE; au app_user%ROWTYPE; existing uuid; waiting int; standing varchar; live_invite boolean;
BEGIN
    IF session_user = 'inclineyou_app' AND p_phone IS DISTINCT FROM app_phone() THEN
        RAISE EXCEPTION 'a join request is made only by the number it is for' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT COALESCE(p_training_terms, false) OR p_policy_version IS NULL OR p_date_of_birth IS NULL THEN
        RAISE EXCEPTION 'the notice, the fit-to-train tick and a date of birth are required' USING ERRCODE = 'invalid_parameter_value';
    END IF;

    SELECT jl.* INTO l FROM join_link jl
      JOIN trainer t ON t.id = jl.trainer_id
      JOIN tenant tn ON tn.id = jl.tenant_id
     WHERE jl.slug = lower(p_slug) AND jl.taking_joins AND t.deleted_at IS NULL AND tn.status = 'active'
       FOR UPDATE OF jl;
    IF NOT FOUND THEN RETURN jsonb_build_object('result', 'closed'); END IF;

    IF p_date_of_birth > (current_date - interval '18 years')::date OR p_date_of_birth < DATE '1900-01-01' THEN
        RETURN jsonb_build_object('result', 'age_requirement');
    END IF;

    IF p_pack IS NULL THEN
        IF NOT l.allow_no_plan AND EXISTS (
            SELECT 1 FROM pack p WHERE p.id = ANY (l.pack_ids) AND p.trainer_id = l.trainer_id AND p.tenant_id = l.tenant_id
               AND p.status = 'active' AND p.deleted_at IS NULL) THEN
            RETURN jsonb_build_object('result', 'plan_unavailable');
        END IF;
    ELSIF NOT (p_pack = ANY (l.pack_ids)) OR NOT EXISTS (
            SELECT 1 FROM pack p WHERE p.id = p_pack AND p.trainer_id = l.trainer_id AND p.tenant_id = l.tenant_id
               AND p.status = 'active' AND p.deleted_at IS NULL) THEN
        RETURN jsonb_build_object('result', 'plan_unavailable');
    END IF;

    SELECT * INTO au FROM app_user WHERE phone = p_phone;
    IF FOUND AND (au.role <> 'client' OR au.deleted_at IS NOT NULL) THEN
        RETURN jsonb_build_object('result', 'unavailable');
    END IF;
    SELECT c.membership_status,
           EXISTS (SELECT 1 FROM client_invite i WHERE i.client_id = c.id AND i.status = 'pending' AND i.expires_at > now())
      INTO standing, live_invite
      FROM client c WHERE c.tenant_id = l.tenant_id AND c.phone = p_phone AND c.deleted_at IS NULL
       AND c.status <> 'archived' AND c.membership_status NOT IN ('removed', 'declined')
     LIMIT 1;
    IF FOUND THEN
        -- Already added here. Which wall they are on decides what to tell them (V49): a live invite is waiting for them;
        -- added but no live link, so the trainer has to send one; or a member already, who signs in.
        IF standing = 'invited' AND live_invite THEN RETURN jsonb_build_object('result', 'invite_waiting'); END IF;
        IF standing IN ('invited', 'not_invited') THEN RETURN jsonb_build_object('result', 'ask_for_invite'); END IF;
        RETURN jsonb_build_object('result', 'already_client');
    END IF;
    IF EXISTS (SELECT 1 FROM client c WHERE c.phone = p_phone AND c.deleted_at IS NULL
                  AND c.membership_status IN ('accepted', 'paused')) THEN
        RETURN jsonb_build_object('result', 'with_another_trainer');
    END IF;

    SELECT id INTO existing FROM join_request WHERE tenant_id = l.tenant_id AND phone = p_phone AND status = 'pending' FOR UPDATE;
    IF existing IS NOT NULL THEN
        UPDATE join_request
           SET trainer_id = l.trainer_id, join_link_id = l.id, name = btrim(p_name), email = NULLIF(btrim(p_email), ''),
               date_of_birth = p_date_of_birth, gender = p_gender, pack_id = p_pack, answers = COALESCE(p_answers, '[]'::jsonb),
               policy_version = p_policy_version, training_terms_accepted_at = now(),
               whatsapp_reminders = COALESCE(p_whatsapp_reminders, false), phone_verified_at = now(), created_at = now()
         WHERE id = existing;
        RETURN jsonb_build_object('result', 'updated', 'request_id', existing);
    END IF;

    SELECT count(*) INTO waiting FROM join_request WHERE join_link_id = l.id AND status = 'pending';
    IF waiting >= 200 THEN RETURN jsonb_build_object('result', 'full'); END IF;

    INSERT INTO join_request (tenant_id, trainer_id, join_link_id, name, phone, email, date_of_birth, gender, pack_id, answers,
                              policy_version, training_terms_accepted_at, whatsapp_reminders, phone_verified_at)
    VALUES (l.tenant_id, l.trainer_id, l.id, btrim(p_name), p_phone, NULLIF(btrim(p_email), ''), p_date_of_birth, p_gender, p_pack,
            COALESCE(p_answers, '[]'::jsonb), p_policy_version, now(), COALESCE(p_whatsapp_reminders, false), now())
    RETURNING id INTO existing;
    RETURN jsonb_build_object('result', 'received', 'request_id', existing);
END $$;
