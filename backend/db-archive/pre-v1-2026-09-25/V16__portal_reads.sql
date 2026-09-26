-- V16 · THE CLIENT PORTAL CAN READ ITS OWN FILE
--
-- The web's `/me/*` pages are the client's view of their coaching: today's
-- session, the plan, their workouts and sets, measurements, packs and payments,
-- what the trainer has told them, milestones, and assessments to answer. Until
-- now a client's whole API was `/v1/client/sync/*`, the offline phone's protocol.
-- This migration adds the two tables those pages read that did not exist, and
-- the narrow client-lens (tier 4) READ policies for four tables the portal must
-- read and a client could not.
--
--   `client_message` — A LINE FROM THE TRAINER TO THE CLIENT
--
-- `{body, kind: note | program | report}`, addressed to one client row. Staff
-- write it (tier 1); the client reads it and may stamp `read_at` — nothing else.
-- No trainer route writes one yet: the portal's messages read unions these with
-- the trainer's notes marked `shared_with_client` (V7).
--
--   `milestone` — SOMETHING THAT HAPPENED ON A DAY
--
-- "25th session with Asha". Stored rather than derived, because a milestone fired
-- on a particular day and a recomputation would move it. `UNIQUE (client_id, kind,
-- value)` so a retried workout finish can never fire the same one twice. Staff
-- read and write (tier 1); the client reads its own. The one planned minter is
-- the portal's `/finish` (module 11b).
--
--   FOUR NARROW READ POLICIES
--
-- Each is `FOR SELECT` and each names exactly the rows the client's own file
-- points at — never "the table":
--   · `pack` — only a pack one of the client's packages was sold from, so the
--     portal can print its name. The rest of the price list stays the trainer's.
--   · `client_note` — only a note ABOUT this client that its author marked
--     `shared_with_client`. V29's rule is intact: a teammate still reads nothing,
--     and a private note is invisible to the client whatever they ask.
--   · `assessment_template` — only a template an assessment SENT to this client
--     came from, because the portal resolves what is asked from the live template.
--   · plus `client_message` and `milestone`, new here.
--
-- Additive. Not in sync. The client's writes (workouts, answers, a weigh-in) come
-- with their own policies in the migrations that add those routes.

CREATE TABLE public.client_message (
    id         uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id  uuid NOT NULL,
    trainer_id uuid NOT NULL,
    body       text NOT NULL,
    kind       varchar(12) DEFAULT 'note' NOT NULL,
    at         timestamp with time zone DEFAULT now() NOT NULL,
    read_at    timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    tenant_id  uuid NOT NULL,
    CONSTRAINT client_message_pkey PRIMARY KEY (id),
    CONSTRAINT client_message_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id),
    CONSTRAINT client_message_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id),
    CONSTRAINT client_message_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id)
);

CREATE TABLE public.milestone (
    id         uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id  uuid NOT NULL,
    kind       varchar(20) NOT NULL,
    label      text NOT NULL,
    value      numeric,
    at         timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    tenant_id  uuid NOT NULL,
    CONSTRAINT milestone_pkey PRIMARY KEY (id),
    CONSTRAINT milestone_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id),
    CONSTRAINT milestone_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id)
);

CREATE INDEX idx_client_message_client ON public.client_message USING btree (client_id, at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX idx_client_message_tenant ON public.client_message USING btree (tenant_id);
CREATE UNIQUE INDEX uq_milestone_once ON public.milestone USING btree (client_id, kind, value) WHERE (deleted_at IS NULL);
CREATE INDEX idx_milestone_client ON public.milestone USING btree (client_id, at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX idx_milestone_tenant ON public.milestone USING btree (tenant_id);

CREATE TRIGGER trg_client_message_stamp_tenant  BEFORE INSERT ON public.client_message
    FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();
CREATE TRIGGER trg_client_message_freeze_tenant BEFORE UPDATE ON public.client_message
    FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();
CREATE TRIGGER trg_client_message_updated_at    BEFORE UPDATE ON public.client_message
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_milestone_stamp_tenant  BEFORE INSERT ON public.milestone
    FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();
CREATE TRIGGER trg_milestone_freeze_tenant BEFORE UPDATE ON public.milestone
    FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();

ALTER TABLE public.client_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestone      ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_message_tenant ON public.client_message TO inclineyou_app
    USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids()))))
    WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));
CREATE POLICY client_message_client_read ON public.client_message FOR SELECT TO inclineyou_app
    USING (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids()))));
CREATE POLICY client_message_client_mark ON public.client_message FOR UPDATE TO inclineyou_app
    USING (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids()))))
    WITH CHECK (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids()))));

CREATE POLICY milestone_tenant ON public.milestone TO inclineyou_app
    USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids()))))
    WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));
CREATE POLICY milestone_client_read ON public.milestone FOR SELECT TO inclineyou_app
    USING (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids()))));

CREATE POLICY pack_client_read ON public.pack FOR SELECT TO inclineyou_app
    USING (((public.app_actor() = 'client'::text) AND (EXISTS (
        SELECT 1 FROM public.package pk
        WHERE pk.pack_id = pack.id AND pk.client_id = ANY (public.app_client_ids())))));

CREATE POLICY client_note_shared_read ON public.client_note FOR SELECT TO inclineyou_app
    USING (((public.app_actor() = 'client'::text)
            AND (client_id = ANY (public.app_client_ids()))
            AND shared_with_client AND (deleted_at IS NULL)));

CREATE POLICY assessment_template_client_read ON public.assessment_template FOR SELECT TO inclineyou_app
    USING (((public.app_actor() = 'client'::text) AND (EXISTS (
        SELECT 1 FROM public.assessment a
        WHERE a.template_id = assessment_template.id
          AND a.client_id = ANY (public.app_client_ids())
          AND a.sent_at IS NOT NULL))));

COMMENT ON TABLE public.client_message IS
    'A line from the trainer to one client (note | program | report). Staff write; the client reads and stamps read_at. See V16.';
COMMENT ON TABLE public.milestone IS
    'Something that happened on a day ("25th session"). Stored, not derived. UNIQUE (client_id, kind, value). See V16.';
