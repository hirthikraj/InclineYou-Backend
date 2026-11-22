-- V40 — a prospect or inactive client on the portal can start an assessment (21 Nov 2026, review fix).
--
-- start_client_assessment() (V12) accepted only a client whose status is 'active'. The client lens (client_ids_for_phone, V20) lets in
-- every accepted client that is not paused or archived — a prospect (V3: no pack bought yet) and an inactive client included — and
-- GET /v1/portal/assessment-templates offers them the weekly check-in. For them, Start raised check_violation, which nothing maps, so
-- the client got 500. Replaced in place to accept exactly the clients the lens accepts; everything else is V12's, unchanged.
--
-- Same signature, so V12's grants stand.

CREATE OR REPLACE FUNCTION start_client_assessment(p_id uuid, p_client uuid, p_template uuid, p_form jsonb, p_name varchar, p_due_on date)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE c client%ROWTYPE; tpl assessment_template%ROWTYPE; a assessment%ROWTYPE; waiting uuid;
BEGIN
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system'
       AND NOT (app_actor() = 'client' AND p_client = ANY (app_client_ids())) THEN
        RAISE EXCEPTION 'an assessment can be started only for your own row' USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Locked, so two taps at once are serialised: the second sees the first's row and answers 'existing'.
    SELECT * INTO c FROM client
     WHERE id = p_client AND membership_status = 'accepted' AND status NOT IN ('paused', 'archived') AND deleted_at IS NULL AND erased_at IS NULL
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'client % cannot start an assessment now', p_client USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO a FROM assessment WHERE id = p_id;
    IF FOUND THEN
        IF a.client_id = p_client AND a.template_id = p_template AND a.deleted_at IS NULL THEN
            RETURN jsonb_build_object('result', 'existing', 'id', a.id);
        END IF;
        RETURN jsonb_build_object('result', 'conflict');
    END IF;

    SELECT * INTO tpl FROM assessment_template
     WHERE id = p_template AND client_can_start AND deleted_at IS NULL AND trainer_id = c.trainer_id AND tenant_id = c.tenant_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('result', 'unavailable');
    END IF;

    SELECT id INTO waiting FROM assessment
     WHERE client_id = p_client AND template_id = p_template AND sent_at IS NOT NULL AND completed_at IS NULL AND deleted_at IS NULL
     ORDER BY created_at LIMIT 1;
    IF waiting IS NOT NULL THEN
        RETURN jsonb_build_object('result', 'existing', 'id', waiting);
    END IF;

    -- The form may only ask what the template asks: every measurement key and every question id must be the template's.
    IF jsonb_typeof(p_form) = 'object' AND (
           EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_form -> 'measurements', '[]'::jsonb)) m
                    WHERE NOT (tpl.measurements -> 'keys') ? (m ->> 'key'))
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_form -> 'questions', '[]'::jsonb)) q
                    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(tpl.questions -> 'items') t WHERE t ->> 'id' = q ->> 'id'))) THEN
        RAISE EXCEPTION 'the form asks something template % does not', p_template USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO assessment (id, tenant_id, trainer_id, client_id, template_id, name, form, due_on, sent_at)
    VALUES (p_id, c.tenant_id, c.trainer_id, c.id, tpl.id, p_name, p_form, p_due_on, now());
    RETURN jsonb_build_object('result', 'created', 'id', p_id);
END $$;
