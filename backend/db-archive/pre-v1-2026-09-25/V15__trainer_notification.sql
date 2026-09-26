-- V15 · THE TRAINER'S BELL: EVENTS SOMEBODY ELSE DID
--
-- The redesign's header bell. It holds only things that happened to a
-- trainer's book that they did not do themselves — a client logged a weight,
-- a client cancelled, a payment somebody else recorded, a client moved to
-- another coach. Never the trainer's own writes: a feed that echoes your own
-- taps back is a feed you learn to ignore.
--
--   ROWS ARE FACTS, NEVER SENTENCES
--
-- `kind` + `client_id` + `amount` + `subject_at` + `text`, and the web's
-- `lib/notifications/copy.ts` writes the English. `text` is the one free
-- field and its meaning is per kind: the payment method (or 'gym'), a
-- cancelled session's day label, a reading's "<value> <unit>", or — for
-- 'team' — the coach the client moved to. Four kinds: payment · cancelled ·
-- metric · team. A kind a build does not know is dropped by that build.
--
--   ONE WRITE PATH, AND IT IS A FUNCTION
--
-- The events come from OTHER actors: a teammate admin reassigning a client, a
-- client posting a weight from the portal (module 11). Neither can pass a
-- staff policy's `WITH CHECK` for somebody else's bell — the client not at
-- all — so every mint goes through `mint_trainer_notification()`, a SECURITY
-- DEFINER function that stamps the recipient's row with the workspace of the
-- CLIENT it is about. The request role may only SELECT and UPDATE (read_at)
-- through the tier-1 policy.
--
--   KEPT SHORT
--
-- The feed shows 90 days and nothing older. No push is sent from this table:
-- the bell is where a trainer looks, not something that interrupts them.
--
-- Additive; backend + web only; not in sync.

CREATE TABLE public.trainer_notification (
    id         uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    kind       varchar(16) NOT NULL,
    client_id  uuid,
    amount     numeric(10,2),
    subject_at timestamp with time zone,
    text       varchar(120),
    at         timestamp with time zone DEFAULT now() NOT NULL,
    read_at    timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id  uuid NOT NULL,
    CONSTRAINT trainer_notification_pkey PRIMARY KEY (id),
    CONSTRAINT trainer_notification_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id),
    CONSTRAINT trainer_notification_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id),
    CONSTRAINT trainer_notification_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id)
);

-- The feed's only read: one trainer, newest first.
CREATE INDEX idx_trainer_notification_feed ON public.trainer_notification
    USING btree (trainer_id, at DESC, id);
CREATE INDEX idx_trainer_notification_tenant ON public.trainer_notification USING btree (tenant_id);

CREATE TRIGGER trg_trainer_notification_freeze_tenant BEFORE UPDATE ON public.trainer_notification
    FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();

ALTER TABLE public.trainer_notification ENABLE ROW LEVEL SECURITY;

-- Read (and mark read) across your workspaces; no INSERT policy — minting is
-- the function's alone.
CREATE POLICY trainer_notification_read ON public.trainer_notification
    FOR SELECT TO inclineyou_app
    USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids()))));
CREATE POLICY trainer_notification_mark ON public.trainer_notification
    FOR UPDATE TO inclineyou_app
    USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids()))))
    WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids()))));

-- THE ONE WRITE PATH. The row lands in the workspace of the client it is about
-- (or, with no client, the recipient's home workspace). Returns the new id.
CREATE FUNCTION public.mint_trainer_notification(
        recipient uuid, kind_in varchar, client uuid, amount_in numeric,
        subject_in timestamp with time zone, text_in varchar)
    RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
    workspace uuid;
    minted uuid;
BEGIN
    IF kind_in NOT IN ('payment', 'cancelled', 'metric', 'team') THEN
        RAISE EXCEPTION 'unknown trainer notification kind: %', kind_in;
    END IF;
    IF client IS NOT NULL THEN
        SELECT c.tenant_id INTO workspace FROM client c WHERE c.id = client;
    END IF;
    IF workspace IS NULL THEN
        SELECT t.home_tenant_id INTO workspace FROM trainer t WHERE t.id = recipient;
    END IF;
    INSERT INTO trainer_notification (trainer_id, kind, client_id, amount, subject_at, text, tenant_id)
    VALUES (recipient, kind_in, client, amount_in, subject_in, left(text_in, 120), workspace)
    RETURNING id INTO minted;
    RETURN minted;
END;
$$;

REVOKE ALL ON FUNCTION public.mint_trainer_notification(uuid, varchar, uuid, numeric, timestamp with time zone, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mint_trainer_notification(uuid, varchar, uuid, numeric, timestamp with time zone, varchar) TO inclineyou_app;

COMMENT ON TABLE public.trainer_notification IS
    'The trainer''s bell: events somebody ELSE did (payment · cancelled · metric · team). Facts, not sentences. Minted only through mint_trainer_notification(). 90-day feed. Not in sync. See V15.';
