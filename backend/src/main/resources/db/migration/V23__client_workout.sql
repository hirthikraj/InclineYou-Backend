-- V23 · what finishing a self-run workout needs that a client's own session cannot do (api-contract 1.2, pw-a5, pw-a6).
--
--   · session_exercise_swap is widened to the three reasons a client gives for a swap — busy, pain, other — beside the two a trainer
--     gives. The contract keeps the client's list short and fixed ("a short list, not free text") so nothing in it is a health
--     inference; the old pair stays valid for the trainer's own swap route.
--   · client_finish_extras() — milestones and the personal-best notice. A client has no INSERT policy on milestone and
--     mint_client_notification() refuses a client actor by design ("a notification is written for a client, never by one"), so
--     finishing a workout would be unable to record either. This is the one door: it answers only for the caller's OWN finished
--     self-run session, accepts only the milestone kinds finishing can produce (sessions_<n>) and only the best notice, applies the
--     client's own personal-best switch, and is idempotent (a milestone is stored once; the notice is written once per session).

ALTER TABLE session_exercise DROP CONSTRAINT session_exercise_swap;
ALTER TABLE session_exercise ADD CONSTRAINT session_exercise_swap CHECK (
    (swapped_from_exercise_id IS NULL OR swapped_from_exercise_id <> exercise_id)
    AND (swap_reason IS NULL OR (swapped_from_exercise_id IS NOT NULL
         AND swap_reason IN ('unavailable', 'difficulty', 'busy', 'pain', 'other'))));

CREATE FUNCTION client_finish_extras(p_session uuid, p_milestones jsonb, p_best_text text, p_best_count integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE s scheduled_session%ROWTYPE; m jsonb; made jsonb := '[]'::jsonb; got_kind text; got_label text; gate boolean;
BEGIN
    SELECT * INTO s FROM scheduled_session WHERE id = p_session AND logged_by = 'client' AND status = 'done' AND deleted_at IS NULL;
    IF NOT FOUND THEN RETURN made; END IF;
    IF session_user = 'inclineyou_app' AND NOT (app_actor() = 'client' AND s.client_id = ANY (app_client_ids())) THEN
        RAISE EXCEPTION 'session % is not yours to finish', p_session USING ERRCODE = 'insufficient_privilege';
    END IF;

    FOR m IN SELECT * FROM jsonb_array_elements(COALESCE(p_milestones, '[]'::jsonb)) LOOP
        CONTINUE WHEN (m ->> 'kind') !~ '^sessions_[0-9]{1,5}$' OR btrim(COALESCE(m ->> 'label', '')) = '';
        got_kind := NULL;
        INSERT INTO milestone (tenant_id, client_id, kind, label, value)
        VALUES (s.tenant_id, s.client_id, m ->> 'kind', left(m ->> 'label', 120), (m ->> 'value')::numeric)
        ON CONFLICT (client_id, kind, value) DO NOTHING
        RETURNING kind, label INTO got_kind, got_label;
        IF got_kind IS NOT NULL THEN
            made := made || jsonb_build_array(jsonb_build_object('kind', got_kind, 'label', got_label));
        END IF;
    END LOOP;

    IF COALESCE(p_best_count, 0) > 0 AND btrim(COALESCE(p_best_text, '')) <> '' THEN
        SELECT COALESCE((SELECT notify_personal_best FROM client_prefs WHERE client_id = s.client_id AND deleted_at IS NULL), true) INTO gate;
        IF gate AND NOT EXISTS (SELECT 1 FROM client_notification WHERE client_id = s.client_id AND kind = 'best' AND session_id = s.id) THEN
            INSERT INTO client_notification (tenant_id, client_id, kind, text, session_id)
            VALUES (s.tenant_id, s.client_id, 'best', left(p_best_text, 160), s.id);
        END IF;
    END IF;
    RETURN made;
END $$;

DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION client_finish_extras(uuid, jsonb, text, integer) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION client_finish_extras(uuid, jsonb, text, integer) TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;
