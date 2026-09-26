-- V19 · A CLIENT CAN CHANGE THEIR NUMBER
--
-- The portal's phone change is the trainer's ladder (V36): prove the current
-- number, name the new one, prove it too. Two of its steps need to see past the
-- client lens, and each gets one narrow SECURITY DEFINER function rather than a
-- wider policy:
--
--   `portal_phone_in_use(phone)` — "is this number already somebody on
--   InclineYou?" A trainer, an identity row, or ANY live roster in ANY
--   workspace. A client's RLS sees only its own rows, so the honest answer needs
--   to look further — and it answers only yes or no, never whose.
--
--   `portal_change_client_phone(old, new)` — moves the number on EVERY client
--   row that carries it (every roster, in every workspace — a declined one too,
--   which the client lens cannot see) and on the `app_user` identity row, in one
--   statement each. It refuses to run unless `old` is the calling session's own
--   phone (`app_phone()`) whenever the request has one, so a request can only
--   ever move its own number; the OTP proofs of both numbers happen in the
--   service before it is called.
--
-- No tables change. Additive.

CREATE FUNCTION public.portal_phone_in_use(candidate text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
    SELECT EXISTS (SELECT 1 FROM app_user WHERE phone = candidate)
        OR EXISTS (SELECT 1 FROM trainer WHERE phone = candidate)
        OR EXISTS (SELECT 1 FROM client WHERE phone = candidate AND deleted_at IS NULL);
$$;

CREATE FUNCTION public.portal_change_client_phone(old_phone text, new_phone text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
    moved integer;
BEGIN
    IF app_phone() IS NOT NULL AND app_phone() <> old_phone THEN
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

REVOKE ALL ON FUNCTION public.portal_phone_in_use(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_change_client_phone(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_phone_in_use(text) TO inclineyou_app;
GRANT EXECUTE ON FUNCTION public.portal_change_client_phone(text, text) TO inclineyou_app;
