-- V39 — the product key of a client's assessment, readable by the client (21 Nov 2026, review fix).
--
-- GET /v1/portal/assessments answers systemKey ("weekly_check_in", or null for a trainer-built form) from the assessment's template.
-- But the client's policy on assessment_template (assessment_template_client, V12) opens only the templates a client may START, so in
-- the running app every product-made assessment whose template is not offered to start, or has since been deleted, came back with
-- systemKey null, which the contract reserves for a trainer-built form. The suite runs as the owner with no policies, so it never
-- showed. Opening the templates wider would hand a client every form the trainer has; this door answers one fact, for one assessment,
-- and only for the caller's own:
--
--   · client_assessment_system_key(assessment) — the template's system_key, or NULL when the assessment is not the calling client's
--     (or has no template). It never raises, so a list read cannot fail on it.

CREATE FUNCTION client_assessment_system_key(p_assessment uuid) RETURNS varchar
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
    SELECT t.system_key
      FROM assessment a JOIN assessment_template t ON t.id = a.template_id
     WHERE a.id = p_assessment
       AND (session_user <> 'inclineyou_app' OR app_actor() = 'system'
            OR (app_actor() = 'client' AND a.client_id = ANY (app_client_ids()) AND a.sent_at IS NOT NULL AND a.deleted_at IS NULL))
$$;

DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION client_assessment_system_key(uuid) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION client_assessment_system_key(uuid) TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;
