-- V51 · slot_topup_targets(refill, lapse_grace) — the top-up stops booking a client whose pack has lapsed.
--
--   Review §5 P0 (25 Nov 2026): a client's pack ended with sessions unused, and SlotTopUpSweeper (V30) kept booking
--   their three standing slots a week, 28 days ahead, for ever. Nothing on the grid said no pack covered them, and Mark
--   done charges only a live pack whose term holds the session's day (SessionStateJdbcRepository.payingPack), so every
--   one of those sessions was headed for "Delivered · not charged". The product was causing the leak, not merely
--   failing to catch it.
--
--   A client is LAPSED when they have bought a pack before (any non-single package, not deleted), none of their packs is
--   live (status 'active', which includes a paused pack: a client on holiday keeps their slots), and the newest one
--   closed more than p_lapse_grace_days ago. The grace is PackageExpirySweeper.GRACE_DAYS (7), the same week the pack
--   itself is held open past its end date so the last sessions can still be marked against it; an expired pack has
--   therefore already had its week, and one used up (completed), cancelled or refunded gets the same week to be renewed
--   before the diary stops growing.
--
--   · A client who has NEVER bought a pack is not lapsed — a prospect's trial, a complimentary arrangement, a client
--     paid single by single. Their slots keep booking as V30 does.
--   · A single session's own sale (package.session_id set, V32) is not a pack and neither counts as live nor as bought.
--   · Nothing already booked is touched: those sessions stay, and the web marks each one "No pack" (lib/schedule/
--     billing.ts noPackCovers) with Renew and Make it single beside it. Renewing makes a live pack, and the next run
--     tops the client up again from the last session it made — so nothing has to be re-saved.
--
--   The one-argument V30 function is replaced in place to delegate with a 7-day grace, so a caller that still names it
--   gets the new rule rather than the old leak.

CREATE FUNCTION slot_topup_targets(p_refill_days int, p_lapse_grace_days int)
    RETURNS TABLE (client_id uuid, trainer_id uuid, tenant_id uuid, timezone text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
BEGIN
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system' THEN
        RAISE EXCEPTION 'only the system lists slot top-ups' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_lapse_grace_days IS NULL OR p_lapse_grace_days < 0 THEN
        RAISE EXCEPTION 'grace must be zero or more days' USING ERRCODE = 'invalid_parameter_value';
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
       -- Not lapsed: never bought a pack, or holds a live one, or the last one closed inside the grace.
       AND NOT (
           NOT EXISTS (SELECT 1 FROM package k
                        WHERE k.client_id = c.id AND k.deleted_at IS NULL AND k.session_id IS NULL
                          AND k.status = 'active')
           AND coalesce((SELECT max(k.closed_at) FROM package k
                          WHERE k.client_id = c.id AND k.deleted_at IS NULL AND k.session_id IS NULL),
                        'infinity'::timestamptz)
               < now() - make_interval(days => p_lapse_grace_days)
       )
     ORDER BY c.trainer_id, c.id;
END $$;

CREATE OR REPLACE FUNCTION slot_topup_targets(p_refill_days int)
    RETURNS TABLE (client_id uuid, trainer_id uuid, tenant_id uuid, timezone text)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
    SELECT * FROM slot_topup_targets(p_refill_days, 7)
$$;

DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION slot_topup_targets(int, int) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION slot_topup_targets(int, int) TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;
