-- V17 · A CLIENT CAN LOG THEIR OWN WORKOUT
--
-- The portal's workout flow: start (or resume) a log for today's session, save
-- each set, swap a movement for the one the trainer approved, and finish with
-- how it felt. The log itself is the ordinary `workout_session` /
-- `workout_exercise` / `set_log` — the same rows the trainer's console and the
-- phone write, so a session the trainer opened and a session the client opened
-- are one log, not two. Their tier-4 client policies already cover every
-- command, so those tables need nothing here.
--
--   `workout_feedback` — HOW IT FELT, IN THE CLIENT'S WORDS
--
-- One row per workout (`UNIQUE`): an effort (`easy` · `right` · `hard`) and a
-- note, upserted on every finish. It is the client's own answer — they write it,
-- the trainer reads it (tier 1) and cannot edit it.
--
--   FINISHING DOES NOT MOVE MONEY
--
-- By the product owner's decision (23 Sep 2026) a client finishing their own log
-- closes the log and nothing else: the booked session stays `scheduled` for the
-- trainer to mark, and it surfaces as unmarked on Today. A client never moves the
-- trainer's money book — the rule the phone's client sync already keeps.
--
--   A MILESTONE THE CLIENT'S FINISH CAN FIRE
--
-- Every 25th finished workout mints a `milestone` — so the client role gets an
-- INSERT on its own milestones. `uq_milestone_once` (V16) makes a retried finish
-- harmless.
--
--   TENANT, SET EXPLICITLY
--
-- `stamp_tenant_id()` takes the request's workspace before it looks at the
-- parent row, and a client's request "stands" in the FIRST of possibly several
-- workspaces. Every portal insert therefore sets `tenant_id` from the resolved
-- client row itself, so a client on two rosters writes into the right book.

CREATE TABLE public.workout_feedback (
    id                 uuid DEFAULT gen_random_uuid() NOT NULL,
    workout_session_id uuid NOT NULL,
    client_id          uuid NOT NULL,
    effort             varchar(8),
    note               text,
    at                 timestamp with time zone DEFAULT now() NOT NULL,
    created_at         timestamp with time zone DEFAULT now() NOT NULL,
    updated_at         timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at         timestamp with time zone,
    tenant_id          uuid NOT NULL,
    CONSTRAINT workout_feedback_pkey PRIMARY KEY (id),
    CONSTRAINT workout_feedback_one_per_workout UNIQUE (workout_session_id),
    CONSTRAINT workout_feedback_workout_fkey FOREIGN KEY (workout_session_id) REFERENCES public.workout_session(id),
    CONSTRAINT workout_feedback_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id),
    CONSTRAINT workout_feedback_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id),
    CONSTRAINT workout_feedback_effort CHECK (effort IS NULL OR effort IN ('easy', 'right', 'hard'))
);

CREATE INDEX idx_workout_feedback_client ON public.workout_feedback USING btree (client_id);
CREATE INDEX idx_workout_feedback_tenant ON public.workout_feedback USING btree (tenant_id);

CREATE TRIGGER trg_workout_feedback_stamp_tenant  BEFORE INSERT ON public.workout_feedback
    FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();
CREATE TRIGGER trg_workout_feedback_freeze_tenant BEFORE UPDATE ON public.workout_feedback
    FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();
CREATE TRIGGER trg_workout_feedback_updated_at    BEFORE UPDATE ON public.workout_feedback
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.workout_feedback ENABLE ROW LEVEL SECURITY;

-- Staff READ it; they never write it — it is the client's answer.
CREATE POLICY workout_feedback_staff_read ON public.workout_feedback FOR SELECT TO inclineyou_app
    USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids()))));
CREATE POLICY workout_feedback_client ON public.workout_feedback TO inclineyou_app
    USING (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids()))))
    WITH CHECK (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids()))));

CREATE POLICY milestone_client_insert ON public.milestone FOR INSERT TO inclineyou_app
    WITH CHECK (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids()))));

COMMENT ON TABLE public.workout_feedback IS
    'How a workout felt, in the client''s words (effort easy|right|hard + note). One per workout; client-written, trainer-read. See V17.';
