-- V29 · close_lapsed_packages() — the nightly job PackageReadService has always said exists.
--
--   PackageReadService.list says "status is kept current by writes … and the nightly job closes the expired ones".
--   There was no such job: the only scheduled work in the backend was the session and OTP sweepers. So a pack past its
--   end_date stayed 'active' indefinitely — Today read it as "Pack expires today" for weeks, and the charge kept taking
--   sessions off a pack whose term had run out.
--
--   What it closes: an ACTIVE, unpaused, undeleted pack whose end_date is more than GRACE days behind the trainer's own
--   today. Closing is status 'expired' + closed_at, the pair package_closed ties together; nothing else on the row moves,
--   so guard_package_balance and freeze_package_terms have nothing to refuse.
--
--   · A PAUSED pack is never closed: its end_date is frozen while the pause runs and moves out on resume.
--   · Money owed is untouched. An expired pack can still be owed for (PackageLedgerService) and GET /v1/packages
--     scope=current still returns it while amount_due > 0, so Business keeps chasing it.
--   · The GRACE (7 days) is the charge's sake, not the client's: payingPack only finds an 'active' pack and does not
--     look at the session's date, so a pack closed the morning after it ended would refuse the trainer marking the last
--     week's sessions done. Seven is Today's own unmarked window (deck.ts, unmarkedFrom). Until it closes, the web says
--     "Pack ended 24 Oct" rather than "expires today".
--   · "Today" is per trainer (trainer.timezone), as apply_package_adjustment already reads it.
--
--   SECURITY DEFINER because the caller is a scheduled job with no session: no tenant policy on package can reach the
--   row. Only the SYSTEM actor may call it, the shape V26's record_whatsapp_status() set. Idempotent: a second run the
--   same day finds nothing and answers 0.

CREATE FUNCTION close_lapsed_packages(p_grace_days int) RETURNS int
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE
    n int;
BEGIN
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system' THEN
        RAISE EXCEPTION 'only the system closes lapsed packages' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_grace_days IS NULL OR p_grace_days < 0 THEN
        RAISE EXCEPTION 'grace must be zero or more days' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    UPDATE package k
       SET status = 'expired', closed_at = now()
      FROM trainer t
     WHERE t.id = k.trainer_id
       AND k.status = 'active'
       AND k.deleted_at IS NULL
       AND k.paused_at IS NULL
       AND k.end_date IS NOT NULL
       AND k.end_date < (now() AT TIME ZONE t.timezone)::date - p_grace_days;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END $$;

DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION close_lapsed_packages(int) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION close_lapsed_packages(int) TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;
