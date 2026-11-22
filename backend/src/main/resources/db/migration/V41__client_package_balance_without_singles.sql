-- V41 — a single-session sale is not the client's package (21 Nov 2026, review fix).
--
-- Since V32/V33 a session sold on its own is a one-session package row (package.session_id set, "Single session"), active from the
-- moment the session is booked. client_package_balance() (V11) listed every package newest first, and the portal's Package screen and
-- Home's pack card take the first active one as "your package" — so a client with a 12-session pack and one extra session sold singly
-- saw "Single session · 1 of 1", and their past packs filled with one row per single session (up to twenty). Replaced in place to leave
-- single-session sales out; their money stays on the money screen. Everything else is V11's, unchanged; the grants stand.

CREATE OR REPLACE FUNCTION client_package_balance(p_client uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
BEGIN
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system'
       AND NOT (app_actor() = 'client' AND p_client = ANY (app_client_ids())) THEN
        RAISE EXCEPTION 'packages can be read only for your own rows' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                   'id', p.id, 'name', p.name, 'status', p.status, 'basis', p.basis,
                   'sessions_total', p.sessions_total, 'sessions_left', p.sessions_remaining,
                   'starts_on', p.start_date, 'ends_on', p.end_date,
                   'paused', p.paused_at IS NOT NULL, 'closed_at', p.closed_at)
               ORDER BY (p.status = 'active') DESC, p.created_at DESC)
          FROM (SELECT * FROM package WHERE client_id = p_client AND deleted_at IS NULL AND session_id IS NULL ORDER BY created_at DESC LIMIT 20) p
    ), '[]'::jsonb);
END $$;
