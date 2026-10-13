-- V12 · assessments are the client's to take (PRD D-21, D-22; api-contract-v1.2 R112, R114).
--
-- Additive only: two columns, one policy, one function, two indexes.
--   · assessment_template.client_can_start — the trainer offers a template to clients (UC-ASM-10); the default
--     weekly template is offered, everything a trainer builds is not until they say so.
--   · assessment_schedule.send_to_client — a cycle sends the assessment it books on its due date (UC-ASM-11).
--   · a client read policy on the templates a client may start, and nothing else of the shelf.
--   · start_client_assessment() — the ONE way a client creates an assessment row. A client has no INSERT policy on
--     assessment and never writes a form of their own: the service builds the form from the template and this function
--     checks it against that template before it writes.
--   · uq_client_one_trainer — one client, one trainer (D-22) backed by the database. uq_client_phone_live is per
--     workspace, so two trainers could each hold an accepted row for one number; this makes the second one impossible.
--   · idx_assessment_unsent_due — the daily sender's scan.

-- ─── 1. columns ──────────────────────────────────────────────────────────────

ALTER TABLE assessment_template ADD COLUMN client_can_start boolean NOT NULL DEFAULT false;
-- The weekly default ships offered. Every other template stays the trainer's until they switch it on.
UPDATE assessment_template SET client_can_start = true WHERE system_key = 'weekly_check_in';

ALTER TABLE assessment_schedule ADD COLUMN send_to_client boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN assessment_template.client_can_start IS 'The trainer offers this template under "Start a new one" in the client portal. The default weekly template ships true.';
COMMENT ON COLUMN assessment_schedule.send_to_client IS 'The assessment this cycle books is sent to the client on its due date (when the client is on the portal), instead of waiting for the trainer to take it in person.';

-- ─── 2. indexes ──────────────────────────────────────────────────────────────

-- One accepted client row per phone, across every workspace. A person who has left a trainer (removed) or been erased
-- (phone nulled) is outside the predicate, so they can accept a new one.
CREATE UNIQUE INDEX uq_client_one_trainer ON client (phone)
    WHERE membership_status = 'accepted' AND deleted_at IS NULL;

-- What the daily sender reads: cycle-booked, unsent, not done, by due date.
CREATE INDEX idx_assessment_unsent_due ON assessment (due_on)
    WHERE sent_at IS NULL AND completed_at IS NULL AND schedule_id IS NOT NULL AND deleted_at IS NULL;

-- ─── 3. the client lens: the templates they may start ───────────────────────

-- Permissive, so it ORs with the staff tier. Only this client's own trainer's templates, only the offered ones.
CREATE POLICY assessment_template_client ON assessment_template FOR SELECT TO inclineyou_app
    USING (app_actor() = 'client' AND client_can_start AND deleted_at IS NULL
        AND trainer_id IN (SELECT c.trainer_id FROM client c
                           WHERE c.id = ANY (app_client_ids()) AND c.membership_status = 'accepted' AND c.deleted_at IS NULL));

-- ─── 4. starting one ─────────────────────────────────────────────────────────

-- "Start a new one". Answers {result, id}: created · existing · unavailable · conflict.
--   existing    — this id was already used for this client's assessment of this template (a replay), OR one of this
--                 template is already waiting for the client, so a double tap never makes a second.
--   unavailable — the template is not offered, not this client's trainer's, or deleted. One answer for all of them.
--   conflict    — the id belongs to something else.
-- It raises for a caller who is not this client, for a client who is paused or has left, and for a form that asks
-- anything the template does not: the form is built by the service, but a client never gets to widen it.
-- session_user, not current_user: inside a SECURITY DEFINER function current_user is the owner (see V11).
CREATE FUNCTION start_client_assessment(p_id uuid, p_client uuid, p_template uuid, p_form jsonb, p_name varchar, p_due_on date)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE c client%ROWTYPE; tpl assessment_template%ROWTYPE; a assessment%ROWTYPE; waiting uuid;
BEGIN
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system'
       AND NOT (app_actor() = 'client' AND p_client = ANY (app_client_ids())) THEN
        RAISE EXCEPTION 'an assessment can be started only for your own row' USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Locked, so two taps at once are serialised: the second sees the first's row and answers 'existing'.
    SELECT * INTO c FROM client
     WHERE id = p_client AND membership_status = 'accepted' AND status = 'active' AND deleted_at IS NULL AND erased_at IS NULL
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

COMMENT ON FUNCTION start_client_assessment(uuid, uuid, uuid, jsonb, varchar, date) IS
    'The one way a client creates an assessment: from a template their trainer offers, for their own row, one waiting at a time. Idempotent on id.';

-- ─── 5. what the request role may call ──────────────────────────────────────

DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION start_client_assessment(uuid, uuid, uuid, jsonb, varchar, date) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION start_client_assessment(uuid, uuid, uuid, jsonb, varchar, date) TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;
