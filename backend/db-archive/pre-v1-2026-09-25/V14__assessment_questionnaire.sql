-- V14 · AN ASSESSMENT THE CLIENT ANSWERS: A TEMPLATE, AND ONE SENT FROM IT
--
-- The redesign's assessments are a QUESTIONNAIRE: a trainer builds a template
-- — which tape measurements to take, which questions to ask — and sends it to
-- a client, who answers it in the portal. Called *assessment* everywhere (the
-- product owner's decision, 23 Sep 2026), never *check-in*.
--
--   THE NAME IS FREE BECAUSE V5 NO LONGER TAKES IT
--
-- V5 had created an `assessment` table for a trainer-taken tape "sitting". It
-- was removed from V5 before V5 ever shipped (23 Sep 2026, product owner's
-- decision), so the plain names go to this feature: `assessment_template` (the
-- form) and `assessment` (one sent to one client, carrying their readings and
-- answers). What survives of V5 — the measuring cadence on `client` / `trainer`
-- and `body_metric` corrections — shares only a vocabulary with this: the
-- catalogue's tape measurements use V5's ids (`weight`, `body_fat`, `chest`,
-- `waist`, `hip`, `arm`) for the six they share, so one measurement never has
-- two spellings. Readings are NOT written to `body_metric`: a number a client
-- sent back and a tape the trainer read are two different claims, and a chart
-- that silently mixed them could not say which it was drawing.
--
--   THE CATALOGUE IS CODE, NOT A TABLE
--
-- `AssessmentCatalogue` holds the 21 measurements and the 11-question bank,
-- like V5's `MetricCatalogue`: a trainer PICKS from it and cannot add to it,
-- because a measurement is only worth taking if it is taken the same way twice.
-- It includes health items (Vitals, visceral fat, the "did anything hurt"
-- question) by the product owner's recorded decision, kept isolable so they can
-- be withdrawn in one change.
--
--   STATUS IS DERIVED, NEVER STORED
--
-- booked (not sent) · waiting (sent, not due) · missed (due, nothing back) ·
-- done (completed). Three instants and the clock, computed in the list query
-- itself so a filter chip's count and the rows it opens cannot disagree.
--
--   A SENT ASSESSMENT OUTLIVES ITS TEMPLATE
--
-- Deleting a template (soft) sets `template_id` NULL on every assessment sent
-- from it, in the same transaction — an assessment stopped being the template
-- the moment it went out, and a cascade would take a client's answers with it.
-- The FK is
-- also `ON DELETE SET NULL` for the hard delete that should never happen. The
-- asked COUNTS are frozen on the assessment when it is sent; what is asked is read
-- from the live template, as the redesign specifies.
--
-- Both tables are tier 1 for staff. `assessment` also gets a tier-4
-- client policy now, because module 11's portal reads and answers it; nothing
-- the client may write is reachable until those routes exist. Neither enters
-- sync. Timestamps go over the wire as ISO strings — the one deliberate
-- exception to epoch ms, because that is what the web's assessment screens read.

CREATE TABLE public.assessment_template (
    id           uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id   uuid NOT NULL,
    name         varchar(120) NOT NULL,
    description  text,
    measurements jsonb DEFAULT '{"on": true, "keys": []}'::jsonb NOT NULL,
    questions    jsonb DEFAULT '{"on": true, "items": []}'::jsonb NOT NULL,
    created_at   timestamp with time zone DEFAULT now() NOT NULL,
    updated_at   timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at   timestamp with time zone,
    tenant_id    uuid NOT NULL,
    CONSTRAINT assessment_template_pkey PRIMARY KEY (id),
    CONSTRAINT assessment_template_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id),
    CONSTRAINT assessment_template_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id)
);

CREATE TABLE public.assessment (
    id                 uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id          uuid NOT NULL,
    trainer_id         uuid NOT NULL,
    template_id        uuid,
    name               varchar(120) NOT NULL,
    due_at             timestamp with time zone NOT NULL,
    sent_at            timestamp with time zone,
    completed_at       timestamp with time zone,
    read_at            timestamp with time zone,
    measurements_asked integer DEFAULT 0 NOT NULL,
    questions_asked    integer DEFAULT 0 NOT NULL,
    readings           jsonb DEFAULT '[]'::jsonb NOT NULL,
    answers            jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at         timestamp with time zone DEFAULT now() NOT NULL,
    updated_at         timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at         timestamp with time zone,
    tenant_id          uuid NOT NULL,
    CONSTRAINT assessment_pkey PRIMARY KEY (id),
    CONSTRAINT assessment_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id),
    CONSTRAINT assessment_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id),
    CONSTRAINT assessment_template_id_fkey FOREIGN KEY (template_id)
        REFERENCES public.assessment_template(id) ON DELETE SET NULL,
    CONSTRAINT assessment_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id),
    CONSTRAINT assessment_asked_nonnegative CHECK (measurements_asked >= 0 AND questions_asked >= 0)
);

CREATE INDEX idx_assessment_template_trainer ON public.assessment_template
    USING btree (trainer_id, updated_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX idx_assessment_template_tenant ON public.assessment_template USING btree (tenant_id);

-- The list's read: one trainer's assessments, newest due first.
CREATE INDEX idx_assessment_trainer ON public.assessment
    USING btree (trainer_id, due_at DESC, id) WHERE (deleted_at IS NULL);
-- The detail's history and the portal: one client's assessments.
CREATE INDEX idx_assessment_client ON public.assessment
    USING btree (client_id, completed_at) WHERE (deleted_at IS NULL);
CREATE INDEX idx_assessment_template ON public.assessment
    USING btree (template_id) WHERE (template_id IS NOT NULL);
CREATE INDEX idx_assessment_tenant ON public.assessment USING btree (tenant_id);

CREATE TRIGGER trg_assessment_template_stamp_tenant  BEFORE INSERT ON public.assessment_template
    FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();
CREATE TRIGGER trg_assessment_template_freeze_tenant BEFORE UPDATE ON public.assessment_template
    FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();
CREATE TRIGGER trg_assessment_template_updated_at    BEFORE UPDATE ON public.assessment_template
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_assessment_stamp_tenant  BEFORE INSERT ON public.assessment
    FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();
CREATE TRIGGER trg_assessment_freeze_tenant BEFORE UPDATE ON public.assessment
    FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();
CREATE TRIGGER trg_assessment_updated_at    BEFORE UPDATE ON public.assessment
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.assessment_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment  ENABLE ROW LEVEL SECURITY;

CREATE POLICY assessment_template_tenant ON public.assessment_template TO inclineyou_app
    USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids()))))
    WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));

CREATE POLICY assessment_tenant ON public.assessment TO inclineyou_app
    USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids()))))
    WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));

CREATE POLICY assessment_client ON public.assessment TO inclineyou_app
    USING (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids()))))
    WITH CHECK (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids()))));

COMMENT ON TABLE public.assessment_template IS
    'The questionnaire a trainer sends: {on, keys[]} of catalogue measurements and {on, items[]} of questions. See V14.';
COMMENT ON TABLE public.assessment IS
    'One assessment sent to one client, with their readings [{key,value}] and answers [{questionId,yes,rating,text,optionIds}]. Status is derived, never stored. See V14.';
