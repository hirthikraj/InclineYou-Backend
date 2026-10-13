-- V13 · who a session reminder would reach, for the trainer (api-contract 1.2 tr-a10, R105).
--
-- Additive only: one function. It exists because the answer needs something the trainer's own connection cannot read.
-- Whether a client has opted in to WhatsApp, and whether the channel is on, are in client_prefs, and V11 gave that table no
-- staff policy on purpose: a client's preferences (their notification switches, their nominee) are theirs, and "the trainer's
-- half never reads it". A policy would hand the trainer the whole row. This returns three counts and nothing else.
--
--   on_portal — this trainer's clients who have joined the portal
--   opted_in  — of those, the ones a reminder would actually be sent to: the WhatsApp channel is on (it defaults on), they have
--               opted in (never assumed), and the trainer has not excluded them
--   excluded  — of those on the portal, the ones the trainer has excluded
--
-- It takes no argument: the trainer is the caller's own (app_trainer_id()), so there is no id to forge and no other trainer's
-- numbers to ask for. Inside a SECURITY DEFINER function current_user is the owner, so the request role is recognised with
-- session_user (see V11). A client, or any caller who is not staff, gets zeros.

CREATE FUNCTION trainer_reminder_reach()
    RETURNS TABLE (on_portal integer, opted_in integer, excluded integer)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
    SELECT count(*)::integer,
           (count(*) FILTER (WHERE NOT c.reminders_excluded AND COALESCE(p.channel_whatsapp, true)
                                    AND p.whatsapp_opt_in_at IS NOT NULL))::integer,
           (count(*) FILTER (WHERE c.reminders_excluded))::integer
    FROM client c
    LEFT JOIN client_prefs p ON p.client_id = c.id AND p.deleted_at IS NULL
    WHERE (session_user <> 'inclineyou_app' OR (app_actor() = 'staff' AND c.tenant_id = ANY (app_tenant_ids())))
      AND c.trainer_id = app_trainer_id()
      AND c.membership_status = 'accepted' AND c.deleted_at IS NULL AND c.erased_at IS NULL
$$;

COMMENT ON FUNCTION trainer_reminder_reach() IS
    'Three counts for the trainer''s own clients: on the portal, would be sent a session reminder, excluded. Reads client_prefs, which the trainer cannot.';

DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION trainer_reminder_reach() FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION trainer_reminder_reach() TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;
