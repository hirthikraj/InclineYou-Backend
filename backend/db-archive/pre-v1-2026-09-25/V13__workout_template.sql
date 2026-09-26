-- V13 · A WORKOUT IS ONE REUSABLE SESSION, PRESCRIBED SET BY SET
--
-- The redesign's `/programs/workouts`: a trainer saves "Upper A" once — its
-- movements, each set's load and effort, the alternatives, the headings that
-- split it into a warm-up and a main block — and pours it into any program day.
--
--   NOT A `template` WITH ONE WEEK
--
-- A program's week sheet prescribes a row as "N × reps". A workout prescribes
-- each SET, with a load kind (%1RM, a weight, a range, bodyweight, RPE…) and an
-- effort kind (reps, time, distance, to max) of its own — "3 × 8 at 70%, then a
-- back-off set to failure" is the ordinary case, not an edge. Forcing that into
-- `template.structure` would be a second dialect of the same blob, so it is its
-- own table with its own shape.
--
--   ONE BLOB, WRITTEN WHOLE
--
-- `exercises` (each with its `sets[]` and `alternatives[]`) and `dividers`
-- (`{label, beforeIndex}` headings) are JSONB and are only ever replaced whole
-- by `PUT` — there is deliberately no per-exercise PATCH, because two write
-- granularities on one blob is how a half-saved session happens. Stored in the
-- wire's own camelCase: nothing but the web reads it, and nothing enters sync.
-- `exerciseCount` and `setCount` are COUNTED on read and never stored.
--
--   A PROGRAM ROW IS A COPY, SO NOTHING POINTS HERE
--
-- Pouring a workout into a program day copies its movements, carrying only V10's
-- `workout_name` (and a freshly minted `workout_id`). No foreign key reaches this
-- table, so a soft delete cascades into nothing and a program keeps every row it
-- was given.
--
-- Tier 1, like every coaching table: a trainer reads across their workspaces and
-- writes where they are standing. Whether a team can read a teammate's workouts,
-- like `GET /v1/team/templates`, is a later call and not modelled.

CREATE TABLE public.workout_template (
    id         uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    name       varchar(120) NOT NULL,
    notes      text,
    exercises  jsonb DEFAULT '[]'::jsonb NOT NULL,
    dividers   jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    tenant_id  uuid NOT NULL,
    CONSTRAINT workout_template_pkey PRIMARY KEY (id),
    CONSTRAINT workout_template_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id),
    CONSTRAINT workout_template_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id)
);

-- The shelf's only read: one trainer's live rows, most recently touched first.
CREATE INDEX idx_workout_template_trainer ON public.workout_template
    USING btree (trainer_id, updated_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX idx_workout_template_tenant ON public.workout_template USING btree (tenant_id);

CREATE TRIGGER trg_workout_template_stamp_tenant  BEFORE INSERT ON public.workout_template
    FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();
CREATE TRIGGER trg_workout_template_freeze_tenant BEFORE UPDATE ON public.workout_template
    FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();
CREATE TRIGGER trg_workout_template_updated_at    BEFORE UPDATE ON public.workout_template
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.workout_template ENABLE ROW LEVEL SECURITY;

CREATE POLICY workout_template_tenant ON public.workout_template TO inclineyou_app
    USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids()))))
    WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));

COMMENT ON TABLE public.workout_template IS
    'One reusable session, prescribed per set. exercises/dividers are camelCase JSONB written whole by PUT; counts are derived on read. Nothing references it — a program row is a copy. Not in sync. See V13.';
