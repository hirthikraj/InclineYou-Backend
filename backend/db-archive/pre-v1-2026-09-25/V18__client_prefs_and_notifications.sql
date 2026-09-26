-- V18 · THE CLIENT'S SETTINGS, AND THE CLIENT'S BELL
--
--   `client_prefs` — THE ONE TABLE THE TRAINER'S HALF NEVER READS
--
-- What the client chose in the portal: hide their weight on their own screens,
-- which kinds of notification they want, and a nominee (an emergency contact).
-- The portal's visibility card promises the trainer cannot see these, so there
-- is NO staff policy at all — not even a read. One row per client row, created
-- on the first write; no row means the defaults (weight shown, every switch on,
-- no nominee).
--
-- The nominee is a THIRD person's name and number, given without their
-- knowledge — DPDP §14 territory. Stored as the product specifies, and dropped
-- with this row when the client leaves (module 11e). Whether the nominee is ever
-- told, and how the privacy screen words it, are the product owner's to settle;
-- nothing here contacts them.
--
--   `client_notification` — FACTS FOR THE CLIENT'S BELL
--
-- `kind` note · plan · session · pack · best, plus `amount`, `subject_at` and a
-- per-kind `text` (a session's verb, a pack's verb or method, a plan's name, a
-- milestone's label); the portal writes the sentence. The feed shows 21 days.
--
--   THE GATE ACTS AT THE MOMENT OF SENDING
--
-- A kind switched off produces no row — rather than a row hidden on read, which
-- would refill weeks the client was never told about the moment they switched it
-- back on. The minters are TRAINER routes (a session booked, a pack sold, a plan
-- applied), and a trainer may not read `client_prefs` — so every mint goes
-- through `mint_client_notification()`, a SECURITY DEFINER function that reads
-- the one switch and writes the row into the client's own workspace, or writes
-- nothing. A refused mint is never a reason to fail the write that caused it.
--
-- Client-only RLS on both tables; no INSERT for anybody but the function. Not in
-- sync. Additive.

CREATE TABLE public.client_prefs (
    client_id               uuid NOT NULL,
    hide_weight             boolean DEFAULT false NOT NULL,
    notify_program_updated  boolean DEFAULT true NOT NULL,
    notify_session_reminder boolean DEFAULT true NOT NULL,
    notify_trainer_note     boolean DEFAULT true NOT NULL,
    notify_personal_best    boolean DEFAULT true NOT NULL,
    notify_pack_changed     boolean DEFAULT true NOT NULL,
    nominee_name            varchar(80),
    nominee_phone           varchar(15),
    created_at              timestamp with time zone DEFAULT now() NOT NULL,
    updated_at              timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at              timestamp with time zone,
    tenant_id               uuid NOT NULL,
    CONSTRAINT client_prefs_pkey PRIMARY KEY (client_id),
    CONSTRAINT client_prefs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id),
    CONSTRAINT client_prefs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id)
);

CREATE TABLE public.client_notification (
    id         uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id  uuid NOT NULL,
    kind       varchar(12) NOT NULL,
    amount     numeric(10,2),
    subject_at timestamp with time zone,
    text       varchar(160),
    at         timestamp with time zone DEFAULT now() NOT NULL,
    read_at    timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    tenant_id  uuid NOT NULL,
    CONSTRAINT client_notification_pkey PRIMARY KEY (id),
    CONSTRAINT client_notification_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id),
    CONSTRAINT client_notification_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id),
    CONSTRAINT client_notification_kind CHECK (kind IN ('note', 'plan', 'session', 'pack', 'best'))
);

CREATE INDEX idx_client_prefs_tenant ON public.client_prefs USING btree (tenant_id);
CREATE INDEX idx_client_notification_feed ON public.client_notification
    USING btree (client_id, at DESC, id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_client_notification_tenant ON public.client_notification USING btree (tenant_id);

CREATE TRIGGER trg_client_prefs_freeze_tenant BEFORE UPDATE ON public.client_prefs
    FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();
CREATE TRIGGER trg_client_prefs_updated_at    BEFORE UPDATE ON public.client_prefs
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_client_notification_freeze_tenant BEFORE UPDATE ON public.client_notification
    FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();

ALTER TABLE public.client_prefs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_notification ENABLE ROW LEVEL SECURITY;

-- The client alone. There is deliberately no staff policy on either table.
CREATE POLICY client_prefs_client ON public.client_prefs TO inclineyou_app
    USING (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids()))))
    WITH CHECK (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids()))));
CREATE POLICY client_notification_read ON public.client_notification FOR SELECT TO inclineyou_app
    USING (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids()))));
CREATE POLICY client_notification_mark ON public.client_notification FOR UPDATE TO inclineyou_app
    USING (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids()))))
    WITH CHECK (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids()))));

-- THE ONE WRITE PATH, AND THE GATE. Reads the one switch the kind maps to (no
-- prefs row = every switch on), and writes into the client's workspace — or
-- writes nothing and returns NULL.
CREATE FUNCTION public.mint_client_notification(
        client uuid, kind_in varchar, amount_in numeric,
        subject_in timestamp with time zone, text_in varchar)
    RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
    allowed boolean := true;
    workspace uuid;
    minted uuid;
BEGIN
    IF kind_in NOT IN ('note', 'plan', 'session', 'pack', 'best') THEN
        RAISE EXCEPTION 'unknown client notification kind: %', kind_in;
    END IF;
    SELECT CASE kind_in
               WHEN 'note'    THEN p.notify_trainer_note
               WHEN 'plan'    THEN p.notify_program_updated
               WHEN 'session' THEN p.notify_session_reminder
               WHEN 'pack'    THEN p.notify_pack_changed
               WHEN 'best'    THEN p.notify_personal_best
           END
      INTO allowed
      FROM client_prefs p WHERE p.client_id = client AND p.deleted_at IS NULL;
    IF allowed IS FALSE THEN
        RETURN NULL;
    END IF;
    SELECT c.tenant_id INTO workspace FROM client c WHERE c.id = client AND c.deleted_at IS NULL;
    IF workspace IS NULL THEN
        RETURN NULL;
    END IF;
    INSERT INTO client_notification (client_id, kind, amount, subject_at, text, tenant_id)
    VALUES (client, kind_in, amount_in, subject_in, left(text_in, 160), workspace)
    RETURNING id INTO minted;
    RETURN minted;
END;
$$;

REVOKE ALL ON FUNCTION public.mint_client_notification(uuid, varchar, numeric, timestamp with time zone, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mint_client_notification(uuid, varchar, numeric, timestamp with time zone, varchar) TO inclineyou_app;

COMMENT ON TABLE public.client_prefs IS
    'The client''s own settings (hide weight, five notification switches, a nominee). Client-only RLS: the trainer''s half never reads it. See V18.';
COMMENT ON TABLE public.client_notification IS
    'Facts for the client''s bell (note | plan | session | pack | best). Minted only by mint_client_notification(), gated by client_prefs at the moment of sending. See V18.';
