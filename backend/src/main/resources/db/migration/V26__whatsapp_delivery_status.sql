-- V26 · what the provider says happened to a reminder (api-contract 1.2, sy-a1 POST /v1/webhooks/whatsapp).
--
--   · record_whatsapp_status(message_id, status, error) — the one door the WhatsApp status webhook writes a REMINDER's delivery
--     through. The webhook has no session, so no policy on client_notification (staff or client) can reach the row; and the
--     row is found by the provider's message id, not by anybody's tenant. Only the SYSTEM actor may call it.
--
--     Idempotent and monotonic: a status only ever moves forward (queued → sent → delivered; `read` is the provider's word for
--     "delivered and opened" and the table has no such state, so it lands as delivered), and `failed` is final but cannot
--     overwrite a delivered one — a late `failed` after a `delivered` is the provider contradicting itself, and the receipt wins.
--     A replay therefore changes nothing and answers 0, which the caller does not need to tell from a first time.
--
--     It only touches a row that already carries the message id (whatsapp_sent_at is set with it, by the sender), so the
--     client_notification_sent constraint cannot be broken from here, and it never touches a `skipped` row.
--
-- The sign-in code's twin (otp_request.delivery_status) needs no function: that table is not under row-level security.

CREATE FUNCTION record_whatsapp_status(p_message_id text, p_status text, p_error text) RETURNS int
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE
    n int;
    v_status text;
BEGIN
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system' THEN
        RAISE EXCEPTION 'only the system records a delivery status' USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_status := CASE p_status WHEN 'read' THEN 'delivered' ELSE p_status END;
    IF v_status NOT IN ('sent', 'delivered', 'failed') THEN
        RETURN 0;
    END IF;
    UPDATE client_notification
       SET whatsapp_status = v_status,
           -- client_notification_sent ties 'sent'/'delivered' to a send time and forbids one on anything else: a failed row has
           -- the id the provider gave it but no send time, and a row stored as queued with its id has none yet
           whatsapp_sent_at = CASE WHEN v_status IN ('sent', 'delivered') THEN coalesce(whatsapp_sent_at, now()) END,
           whatsapp_error = CASE WHEN v_status = 'failed' THEN left(coalesce(nullif(btrim(p_error), ''), 'failed'), 200) END
     WHERE whatsapp_message_id = p_message_id
       AND deleted_at IS NULL
       AND whatsapp_status IN ('queued', 'sent', 'delivered', 'failed')
       AND CASE v_status
             WHEN 'sent'      THEN whatsapp_status = 'queued'
             WHEN 'delivered' THEN whatsapp_status IN ('queued', 'sent', 'failed')
             WHEN 'failed'    THEN whatsapp_status IN ('queued', 'sent')
           END;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END $$;

DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION record_whatsapp_status(text, text, text) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION record_whatsapp_status(text, text, text) TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;
