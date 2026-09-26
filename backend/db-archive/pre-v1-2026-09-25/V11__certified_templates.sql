-- V11 · CERTIFIED PROGRAMS: AUTHORED IN-HOUSE, COPIED, NEVER PROPAGATED
--
-- The redesign's *Certified* shelf: programs InclineYou authors, which a trainer
-- browses, previews and COPIES into their own shelf. Three decisions are fixed
-- (the mock repo's BACKEND-CERTIFIED-PROGRAMS.md): the programs are authored
-- in-house; using one copies it; and nothing propagates — a copy is the
-- trainer's own template from the moment it exists, and a later revision of the
-- certified original changes only the original. The builder is told the
-- original moved (`copied_from_updated_at` < the original's `updated_at`), and
-- the trainer decides.
--
--   ITS OWN TABLE, AND WHY NOT A ROW IN `template`
--
-- The handoff put certified rows in `template` under a service-account owner.
-- That cannot work under row-level security: `template.tenant_id` is NOT NULL
-- with a tier-1 policy, so a row stamped with any one workspace is invisible to
-- every other. Relaxing it to nullable would weaken a tier-1 invariant for the
-- whole table. So `certified_template` is a CATALOGUE table like the global
-- `exercise` rows: no tenant, readable by every workspace, and — unlike
-- `exercise` — writable by NO request. Its one policy is SELECT; rows arrive by
-- migration (as the two below do), and `used_count` moves only through
-- `certified_template_used()`, a SECURITY DEFINER function the copy route calls.
-- It also keeps certified rows out of `GET /v1/templates` by construction.
--
--   A BLUEPRINT KEYED ON THE CATALOGUE'S STABLE ID, NOT ITS UUID
--
-- `exercise.id` is `gen_random_uuid()` at seed time and the seeder runs AFTER
-- Flyway, so a migration can neither know nor reference a catalogue UUID. The
-- blueprint therefore names each movement by `exercise_source_id`
-- (`gymvisual-0025`, the seeder's stable key, unique by `uq_exercise_source_id`)
-- and the server resolves it to this database's `exercise.id` on every read and
-- on the copy. An entry whose movement is not in the library is dropped rather
-- than drawn blank — the same rule `parseStructure` applies to an entry with no
-- exercise. Every other key is the ordinary snake_case blueprint shape.
--
--   THE TWO ROWS BELOW ARE SAMPLES
--
-- Written 23 Sep 2026 so the shelf and its preview have something real to
-- render. `is_sample = true` and `reviewed_at IS NULL` say so on the wire:
-- `reviewedAt` is meant to be the date a qualified human reviewed the program,
-- NOT `updated_at`, and nobody has reviewed these. They are deliberately
-- conservative, textbook splits. Replace or retire them with a later migration
-- (soft delete, like everything else) once the real catalogue is authored.
--
--   AND ON `template`, THE PROVENANCE OF A COPY
--
-- `source` ('own' for every trainer row; the certified list answers
-- 'certified'), and `copied_from_id` / `_name` / `_updated_at` — taken AS AT
-- COPY TIME, so the builder can say "the original was revised since you copied
-- it" and name it even after the original is retired.
--
-- Additive. Backend + web only: `certified_template` is not in sync, and the
-- template columns ride the pull (`SELECT *`) and are not in the phone's push.

CREATE TABLE public.certified_template (
    id            uuid DEFAULT gen_random_uuid() NOT NULL,
    name          varchar(150) NOT NULL,
    goal          text,
    description   text,
    summary       text NOT NULL,
    level         varchar(20)  NOT NULL,
    equipment     varchar(20)  NOT NULL,
    structure     jsonb DEFAULT '[]'::jsonb NOT NULL,
    day_labels    jsonb,
    weeks         integer,
    training_days text,
    reviewed_at   timestamp with time zone,
    is_sample     boolean DEFAULT false NOT NULL,
    used_count    integer DEFAULT 0 NOT NULL,
    created_at    timestamp with time zone DEFAULT now() NOT NULL,
    updated_at    timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at    timestamp with time zone,
    CONSTRAINT certified_template_pkey PRIMARY KEY (id),
    CONSTRAINT certified_template_used_count_nonnegative CHECK (used_count >= 0)
);

COMMENT ON TABLE public.certified_template IS
    'InclineYou-authored programs a trainer copies. A catalogue: no tenant_id, SELECT-only for the app role, written by migration. Blueprint entries name movements by exercise_source_id. See V11.';
COMMENT ON COLUMN public.certified_template.reviewed_at IS
    'When a qualified human reviewed the program — NOT updated_at. NULL = never reviewed (every is_sample row). See V11.';

CREATE TRIGGER trg_certified_template_updated_at BEFORE UPDATE ON public.certified_template
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.certified_template ENABLE ROW LEVEL SECURITY;

-- Readable by anybody the app serves; writable by no request.
CREATE POLICY certified_template_catalogue ON public.certified_template
    FOR SELECT TO inclineyou_app USING (deleted_at IS NULL);

-- The only way `used_count` moves. SECURITY DEFINER so the copy route can bump
-- a table its role cannot UPDATE; it touches one column of one live row.
CREATE FUNCTION public.certified_template_used(target uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
    UPDATE certified_template SET used_count = used_count + 1
    WHERE id = target AND deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.certified_template_used(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.certified_template_used(uuid) TO inclineyou_app;

ALTER TABLE public.template
    ADD COLUMN source                 varchar(12) DEFAULT 'own' NOT NULL,
    ADD COLUMN copied_from_id         uuid,
    ADD COLUMN copied_from_name       varchar(150),
    ADD COLUMN copied_from_updated_at timestamp with time zone;

ALTER TABLE ONLY public.template
    ADD CONSTRAINT template_copied_from_id_fkey FOREIGN KEY (copied_from_id)
        REFERENCES public.certified_template(id) ON DELETE SET NULL;

-- `mine` on the certified list: "have I already copied this one?"
CREATE INDEX idx_template_copied_from ON public.template USING btree (trainer_id, copied_from_id)
    WHERE (copied_from_id IS NOT NULL AND deleted_at IS NULL);

COMMENT ON COLUMN public.template.source IS
    'own for every trainer row (a copy of a certified program is own too). certified is what the certified list answers. See V11.';
COMMENT ON COLUMN public.template.copied_from_updated_at IS
    'The certified original''s updated_at AS AT COPY TIME. Older than the original''s current updated_at = the original has been revised since. See V11.';

-- ── The two samples ────────────────────────────────────────────────────────

INSERT INTO public.certified_template
    (id, name, goal, description, summary, level, equipment, structure, day_labels,
     weeks, training_days, reviewed_at, is_sample)
VALUES
    ('7c1f0a52-3b8e-4d6a-9a51-0e2b6f1c0a01',
     'Full-body foundations',
     'General strength',
     'Three full-body sessions a week built on five movement patterns — squat, push, pull, hinge and brace — with dumbbells only. Two alternating days (A and B, then A again) so every pattern is trained at least twice a week while the loads are still light.',
     'A first program for a new client: three full-body days a week with dumbbells, six weeks, moderate reps. Sample program — not yet reviewed.',
     'beginner', 'dumbbells',
     CAST('[{"exercise_source_id": "gymvisual-1760", "day_of_week": 1, "order_index": 0, "week": 1, "sets": 3, "reps": 10, "rest_seconds": 90}, {"exercise_source_id": "gymvisual-0289", "day_of_week": 1, "order_index": 1, "week": 1, "sets": 3, "reps": 10, "rest_seconds": 90}, {"exercise_source_id": "gymvisual-0292", "day_of_week": 1, "order_index": 2, "week": 1, "sets": 3, "reps": 10, "rest_seconds": 90, "notes": "Each side"}, {"exercise_source_id": "gymvisual-1459", "day_of_week": 1, "order_index": 3, "week": 1, "sets": 3, "reps": 10, "rest_seconds": 90}, {"exercise_source_id": "gymvisual-0276", "day_of_week": 1, "order_index": 4, "week": 1, "sets": 3, "reps": 8, "rest_seconds": 60, "notes": "Each side"}, {"exercise_source_id": "gymvisual-0336", "day_of_week": 2, "order_index": 0, "week": 1, "sets": 3, "reps": 8, "rest_seconds": 90, "notes": "Each leg"}, {"exercise_source_id": "gymvisual-0405", "day_of_week": 2, "order_index": 1, "week": 1, "sets": 3, "reps": 10, "rest_seconds": 90}, {"exercise_source_id": "gymvisual-0662", "day_of_week": 2, "order_index": 2, "week": 1, "sets": 3, "reps": 8, "rest_seconds": 60}, {"exercise_source_id": "gymvisual-3013", "day_of_week": 2, "order_index": 3, "week": 1, "sets": 3, "reps": 12, "rest_seconds": 60}, {"exercise_source_id": "gymvisual-0294", "day_of_week": 2, "order_index": 4, "week": 1, "sets": 2, "reps": 12, "rest_seconds": 60}, {"exercise_source_id": "gymvisual-1760", "day_of_week": 3, "order_index": 0, "week": 1, "sets": 3, "reps": 10, "rest_seconds": 90}, {"exercise_source_id": "gymvisual-0314", "day_of_week": 3, "order_index": 1, "week": 1, "sets": 3, "reps": 10, "rest_seconds": 90}, {"exercise_source_id": "gymvisual-0292", "day_of_week": 3, "order_index": 2, "week": 1, "sets": 3, "reps": 10, "rest_seconds": 90, "notes": "Each side"}, {"exercise_source_id": "gymvisual-1459", "day_of_week": 3, "order_index": 3, "week": 1, "sets": 3, "reps": 10, "rest_seconds": 90}, {"exercise_source_id": "gymvisual-0276", "day_of_week": 3, "order_index": 4, "week": 1, "sets": 3, "reps": 8, "rest_seconds": 60, "notes": "Each side"}]' AS jsonb),
     '{"1":"Full body A","2":"Full body B","3":"Full body A"}',
     6, '1,2,3', NULL, true),
    ('7c1f0a52-3b8e-4d6a-9a51-0e2b6f1c0a02',
     'Upper / lower strength',
     'Strength',
     'Four sessions a week split into two upper and two lower days, each opening with a heavy compound lift in the 5–6 rep range and finishing with lighter accessory work. Needs a full gym: a barbell, a rack, a cable stack and a leg press.',
     'For a client who has trained consistently for six months or more: four days a week, upper/lower, eight weeks. Sample program — not yet reviewed.',
     'intermediate', 'full-gym',
     CAST('[{"exercise_source_id": "gymvisual-0025", "day_of_week": 1, "order_index": 0, "week": 1, "sets": 4, "reps": 6, "rest_seconds": 150, "workout_id": "w-upper-a", "workout_name": "Upper A"}, {"exercise_source_id": "gymvisual-0027", "day_of_week": 1, "order_index": 1, "week": 1, "sets": 4, "reps": 6, "rest_seconds": 150, "workout_id": "w-upper-a", "workout_name": "Upper A"}, {"exercise_source_id": "gymvisual-0091", "day_of_week": 1, "order_index": 2, "week": 1, "sets": 3, "reps": 8, "rest_seconds": 120, "workout_id": "w-upper-a", "workout_name": "Upper A"}, {"exercise_source_id": "gymvisual-0198", "day_of_week": 1, "order_index": 3, "week": 1, "sets": 3, "reps": 10, "rest_seconds": 90, "workout_id": "w-upper-a", "workout_name": "Upper A"}, {"exercise_source_id": "gymvisual-0201", "day_of_week": 1, "order_index": 4, "week": 1, "sets": 3, "reps": 12, "rest_seconds": 60, "workout_id": "w-upper-a", "workout_name": "Upper A"}, {"exercise_source_id": "gymvisual-0294", "day_of_week": 1, "order_index": 5, "week": 1, "sets": 3, "reps": 12, "rest_seconds": 60, "workout_id": "w-upper-a", "workout_name": "Upper A"}, {"exercise_source_id": "gymvisual-0043", "day_of_week": 2, "order_index": 0, "week": 1, "sets": 4, "reps": 6, "rest_seconds": 180, "workout_id": "w-lower-a", "workout_name": "Lower A"}, {"exercise_source_id": "gymvisual-0085", "day_of_week": 2, "order_index": 1, "week": 1, "sets": 3, "reps": 8, "rest_seconds": 120, "workout_id": "w-lower-a", "workout_name": "Lower A"}, {"exercise_source_id": "gymvisual-0739", "day_of_week": 2, "order_index": 2, "week": 1, "sets": 3, "reps": 10, "rest_seconds": 90, "workout_id": "w-lower-a", "workout_name": "Lower A"}, {"exercise_source_id": "gymvisual-0586", "day_of_week": 2, "order_index": 3, "week": 1, "sets": 3, "reps": 12, "rest_seconds": 60, "workout_id": "w-lower-a", "workout_name": "Lower A"}, {"exercise_source_id": "gymvisual-0605", "day_of_week": 2, "order_index": 4, "week": 1, "sets": 3, "reps": 15, "rest_seconds": 60, "workout_id": "w-lower-a", "workout_name": "Lower A"}, {"exercise_source_id": "gymvisual-0314", "day_of_week": 3, "order_index": 0, "week": 1, "sets": 4, "reps": 8, "rest_seconds": 120, "workout_id": "w-upper-b", "workout_name": "Upper B"}, {"exercise_source_id": "gymvisual-0861", "day_of_week": 3, "order_index": 1, "week": 1, "sets": 4, "reps": 10, "rest_seconds": 90, "workout_id": "w-upper-b", "workout_name": "Upper B"}, {"exercise_source_id": "gymvisual-0652", "day_of_week": 3, "order_index": 2, "week": 1, "sets": 3, "reps": 6, "rest_seconds": 120, "workout_id": "w-upper-b", "workout_name": "Upper B"}, {"exercise_source_id": "gymvisual-0405", "day_of_week": 3, "order_index": 3, "week": 1, "sets": 3, "reps": 10, "rest_seconds": 90, "workout_id": "w-upper-b", "workout_name": "Upper B"}, {"exercise_source_id": "gymvisual-0662", "day_of_week": 3, "order_index": 4, "week": 1, "sets": 2, "reps": 12, "rest_seconds": 60, "workout_id": "w-upper-b", "workout_name": "Upper B"}, {"exercise_source_id": "gymvisual-0032", "day_of_week": 4, "order_index": 0, "week": 1, "sets": 3, "reps": 5, "rest_seconds": 180, "workout_id": "w-lower-b", "workout_name": "Lower B"}, {"exercise_source_id": "gymvisual-0336", "day_of_week": 4, "order_index": 1, "week": 1, "sets": 3, "reps": 10, "rest_seconds": 90, "workout_id": "w-lower-b", "workout_name": "Lower B", "notes": "Each leg"}, {"exercise_source_id": "gymvisual-1409", "day_of_week": 4, "order_index": 2, "week": 1, "sets": 3, "reps": 10, "rest_seconds": 90, "workout_id": "w-lower-b", "workout_name": "Lower B"}, {"exercise_source_id": "gymvisual-0599", "day_of_week": 4, "order_index": 3, "week": 1, "sets": 3, "reps": 12, "rest_seconds": 60, "workout_id": "w-lower-b", "workout_name": "Lower B"}, {"exercise_source_id": "gymvisual-0276", "day_of_week": 4, "order_index": 4, "week": 1, "sets": 3, "reps": 10, "rest_seconds": 60, "workout_id": "w-lower-b", "workout_name": "Lower B", "notes": "Each side"}]' AS jsonb),
     '{"1":"Upper A","2":"Lower A","3":"Upper B","4":"Lower B"}',
     8, '1,2,3,4', NULL, true);
