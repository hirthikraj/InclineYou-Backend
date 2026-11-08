-- V30 · slot_topup_targets() — which clients' standing weekly slots need booking further ahead.
--
--   A client's weekly slots (client_schedule_slot) become scheduled_session rows only when something books them, and
--   until now only three things did: saving the client's week, resuming them, and unarchiving them — each booking
--   ClientScheduleService.WINDOW_DAYS (28) ahead and no further. Nothing rolled the window forward, so four weeks after
--   a trainer last touched a client's week that client's Tuesdays simply stopped appearing: the diary ran dry, Today said
--   nothing was booked, and the pack and renewal rows lost the sessions they count. SlotTopUpSweeper now keeps every
--   bookable client booked WINDOW_DAYS ahead, through the SAME booking code the week editor uses
--   (ClientScheduleJdbcRepository.book), which starts each slot after the last session it ever made — cancelled and
--   deleted included — so a session the trainer called off or moved is never booked back.
--
--   This function only answers WHO. The booking itself runs as the client's own workspace (the STAFF actor with that
--   tenant active), so every write goes through the ordinary tenant policies and stamp_tenant_id(), exactly as a
--   trainer's own Save does. A scheduler thread has no request and so no workspace to read the roster from, which is
--   why the list is a SECURITY DEFINER read callable by the SYSTEM actor alone (V26 and V29's shape).
--
--   A target is a client who is bookable by the week editor's own rule (LockedClient.bookable: active, inactive or
--   prospect, and not removed), not deleted, with at least one live slot and a client_schedule row (book() joins it),
--   whose slots' furthest session is less than p_refill_days ahead — so a client already booked to the edge is not
--   touched, and the job does nothing on most runs.

CREATE FUNCTION slot_topup_targets(p_refill_days int)
    RETURNS TABLE (client_id uuid, trainer_id uuid, tenant_id uuid, timezone text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
BEGIN
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system' THEN
        RAISE EXCEPTION 'only the system lists slot top-ups' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN QUERY
    SELECT c.id, c.trainer_id, c.tenant_id, t.timezone::text
      FROM client c
      JOIN trainer t ON t.id = c.trainer_id AND t.deleted_at IS NULL
      JOIN client_schedule cs ON cs.client_id = c.id
     WHERE c.deleted_at IS NULL
       AND c.status IN ('active', 'inactive', 'prospect')
       AND c.membership_status IS DISTINCT FROM 'removed'
       AND EXISTS (SELECT 1 FROM client_schedule_slot sl WHERE sl.client_id = c.id AND sl.deleted_at IS NULL)
       AND coalesce((SELECT max(x.scheduled_at)
                       FROM scheduled_session x
                       JOIN client_schedule_slot sl ON sl.id = x.slot_id
                      WHERE sl.client_id = c.id AND sl.deleted_at IS NULL), '-infinity'::timestamptz)
           < now() + make_interval(days => p_refill_days)
     ORDER BY c.trainer_id, c.id;
END $$;

DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION slot_topup_targets(int) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION slot_topup_targets(int) TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;
