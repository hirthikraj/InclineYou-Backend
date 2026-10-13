-- V24 · a client's submitted assessment moves its cycle on (api-contract 1.2, pa-a1: "the next one is booked in the same transaction, by the
-- same server path as the trainer's (R33)").
--
-- When a TRAINER completes an assessment that belongs to a cycle, the service books the next one and moves the cycle's next date. A client
-- cannot do either: assessment_schedule has no client policy at all, a client has no INSERT policy on assessment, and the template of a
-- cycle need not be one the trainer offers for a client to start (client_can_start), so it is not readable to them either. Two doors, both
-- SECURITY DEFINER and both answering only for the caller's OWN completed assessment (session_user, not current_user — see V11):
--
--   · client_cycle_template(assessment)      — what the service needs to copy the next form: the cycle's interval, the trainer's time zone
--                                              (the cycle moves on from the day it was DONE, in the trainer's calendar, as the trainer's own
--                                              path does), and the template as it now stands. NULL when there is nothing to advance: no
--                                              cycle, a cycle that ended or was deleted, or a template that was deleted.
--   · client_book_next_assessment(...)       — moves schedule.next_due_on and books the next assessment, unsent (a cycle sends on its due
--                                              date), with a form that may ask only what the template asks, like start_client_assessment.

CREATE FUNCTION client_cycle_template(p_assessment uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE a assessment%ROWTYPE; s assessment_schedule%ROWTYPE; t assessment_template%ROWTYPE; tz text;
BEGIN
    SELECT * INTO a FROM assessment WHERE id = p_assessment AND completed_at IS NOT NULL AND deleted_at IS NULL AND schedule_id IS NOT NULL;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system' AND NOT (app_actor() = 'client' AND a.client_id = ANY (app_client_ids())) THEN
        RAISE EXCEPTION 'assessment % is not yours', p_assessment USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT * INTO s FROM assessment_schedule WHERE id = a.schedule_id AND deleted_at IS NULL AND ended_at IS NULL;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO t FROM assessment_template WHERE id = s.template_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT timezone INTO tz FROM trainer WHERE id = a.trainer_id;
    RETURN jsonb_build_object('schedule_id', s.id, 'interval_days', s.interval_days, 'timezone', COALESCE(tz, 'Asia/Kolkata'),
                              'template', jsonb_build_object('id', t.id, 'name', t.name, 'description', t.description,
                                                             'measurements', t.measurements, 'questions', t.questions));
END $$;

CREATE FUNCTION client_book_next_assessment(p_done uuid, p_next_due date, p_form jsonb, p_name varchar) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE a assessment%ROWTYPE; s assessment_schedule%ROWTYPE; t assessment_template%ROWTYPE; made uuid := gen_random_uuid();
BEGIN
    SELECT * INTO a FROM assessment WHERE id = p_done AND completed_at IS NOT NULL AND deleted_at IS NULL AND schedule_id IS NOT NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'assessment % has no cycle to advance', p_done USING ERRCODE = 'check_violation'; END IF;
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system' AND NOT (app_actor() = 'client' AND a.client_id = ANY (app_client_ids())) THEN
        RAISE EXCEPTION 'assessment % is not yours', p_done USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT * INTO s FROM assessment_schedule WHERE id = a.schedule_id AND deleted_at IS NULL AND ended_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'the cycle of % has ended', p_done USING ERRCODE = 'check_violation'; END IF;
    SELECT * INTO t FROM assessment_template WHERE id = s.template_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'the template of % was deleted', p_done USING ERRCODE = 'check_violation'; END IF;
    IF jsonb_typeof(p_form) = 'object' AND (
           EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_form -> 'measurements', '[]'::jsonb)) m
                    WHERE NOT (t.measurements -> 'keys') ? (m ->> 'key'))
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_form -> 'questions', '[]'::jsonb)) q
                    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(t.questions -> 'items') i WHERE i ->> 'id' = q ->> 'id'))) THEN
        RAISE EXCEPTION 'the form asks something template % does not', t.id USING ERRCODE = 'check_violation';
    END IF;
    UPDATE assessment_schedule SET next_due_on = p_next_due WHERE id = s.id;
    INSERT INTO assessment (id, tenant_id, trainer_id, client_id, template_id, schedule_id, name, form, due_on)
    VALUES (made, a.tenant_id, a.trainer_id, a.client_id, t.id, s.id, p_name, p_form, p_next_due);
    RETURN made;
END $$;

DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION client_cycle_template(uuid), client_book_next_assessment(uuid, date, jsonb, varchar) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION client_cycle_template(uuid), client_book_next_assessment(uuid, date, jsonb, varchar) TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;
