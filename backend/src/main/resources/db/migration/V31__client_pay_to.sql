-- V31 · client_pay_to() — the UPI ID a client pays their own trainer on, for the portal's *Pay with UPI*.
--
--   The trainer's UPI ID lives on trainer_business.upi_vpa, which has no client policy: a client's session can read
--   nothing of the trainer's business. The portal's balance now offers a upi:// pay link (decided 6 Nov 2026, the
--   launch UPI-collection item), so it needs exactly one fact from that row and nothing else.
--
--   The door answers NULL unless every one of these holds, so it cannot be used to discover anybody's UPI ID:
--   · the caller is a CLIENT session and p_client is one of its own client ids (app_client_ids());
--   · that client may see money at all (client_can_see_money, the same switch the payment policies use) — a trainer
--     who hid the Payments screen has also not offered a way to pay through it;
--   · the trainer has set a UPI ID.
--   The system and staff actors get NULL too: a trainer reads their own UPI ID through /v1/trainers/me.
--
--   Nothing moves money. The link opens the client's UPI app with the trainer's ID, the amount and a note filled in;
--   the trainer still marks the payment as received, exactly as for cash.

CREATE FUNCTION client_pay_to(p_client uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
    SELECT nullif(btrim(b.upi_vpa), '')
      FROM client c
      JOIN trainer_business b ON b.trainer_id = c.trainer_id
     WHERE c.id = p_client
       AND c.deleted_at IS NULL
       AND app_actor() = 'client'
       AND p_client = ANY (app_client_ids())
       AND client_can_see_money(p_client)
$$;

DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION client_pay_to(uuid) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION client_pay_to(uuid) TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;
