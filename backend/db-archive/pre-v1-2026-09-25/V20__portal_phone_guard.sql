-- V20 · THE PHONE-MOVE GUARD READ THE WRONG "NOTHING"
--
-- V19's `portal_change_client_phone()` refused to run unless the old number
-- was the calling session's own phone "whenever the request has one", tested
-- as `app_phone() IS NOT NULL`. But `app_phone()` (V1) deliberately answers ''
-- — never NULL — when no phone is set, so the guard fired on every call from a
-- context without one. Found by `PortalAccountTest`. Fixed forward, per the
-- standing law (V19 has run): '' now reads as "no session phone", exactly as the
-- other `app_*()` helpers treat it. Under the request role a client's session
-- always carries its phone, so the guard still binds every real request.

CREATE OR REPLACE FUNCTION public.portal_change_client_phone(old_phone text, new_phone text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
    moved integer;
BEGIN
    IF app_phone() <> '' AND app_phone() <> old_phone THEN
        RAISE EXCEPTION 'a request may only move its own number';
    END IF;
    UPDATE client SET phone = new_phone, updated_at = now()
     WHERE phone = old_phone AND deleted_at IS NULL;
    GET DIAGNOSTICS moved = ROW_COUNT;
    UPDATE app_user SET phone = new_phone, updated_at = now()
     WHERE phone = old_phone AND deleted_at IS NULL;
    RETURN moved;
END;
$$;
