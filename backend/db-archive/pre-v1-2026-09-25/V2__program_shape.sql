-- V2 · A CLIENT'S COPY OWNS ITS OWN SHAPE
--
-- Assigning has always made an independent copy: `POST /v1/templates/{id}/apply`
-- writes a `program` with its own `program_exercise` rows in one transaction and
-- nothing reaches back through `program.template_id` afterwards. That is the
-- whole reason the two tables exist.
--
-- What the copy could not own until now is its SHAPE. `template` carries
-- `day_labels`, `weeks` and `training_days` (the historical V20/V24 columns) and
-- `program` carried none of them, so every screen that wanted a plan's layout
-- had to look it up through `template_id` — which is exactly the reach-back the
-- design forbids, and it is why nothing could edit a copy.
--
-- Renaming Day 2 for one client, running them nine weeks where the blueprint
-- runs eight, adding a fourth training day: every one of those is a change to
-- the shape, for one person. A lookup through `template_id` would either write
-- it onto the blueprint — changing it for everybody — or drop it.
--
--   `synced_at` — WHEN THE COPY LAST TOOK THE BLUEPRINT
--
-- Apply, and resync, and nothing else. `AssignmentResponse.behindTemplate` used
-- to be `program.updated_at < template.updated_at`, which was sound only while
-- `updated_at` could not move for any other reason. It can now: a trainer tuning
-- one client's copy this morning bumps it past a blueprint edited yesterday, and
-- the copy reads as up to date having never received that edit. **Editing a copy
-- is not the same act as taking the blueprint**, so it gets its own stamp.
--
-- Additive, per the standing law: four nullable columns, no drop, no rename, no
-- change to any existing response field.

ALTER TABLE public.program
    ADD COLUMN day_labels    jsonb,
    ADD COLUMN weeks         integer,
    ADD COLUMN training_days text,
    ADD COLUMN synced_at     timestamptz;

COMMENT ON COLUMN public.program.day_labels IS
    'The copy''s own day names, keyed by WEEKDAY (ISO, 1 = Monday) — not by the template''s ordinal slot. See V2.';
COMMENT ON COLUMN public.program.weeks IS
    'How long this client''s block runs. Taken from the template at apply and editable per client.';
COMMENT ON COLUMN public.program.training_days IS
    'CSV of the WEEKDAYS this client trains, the same encoding template.training_days uses for ordinal slots.';
COMMENT ON COLUMN public.program.synced_at IS
    'When this copy last TOOK the blueprint — apply or resync. Not when it was last edited.';

-- ── THE BACKFILL, AND THE TRANSLATION IN IT ─────────────────────────────────
--
-- A template's days are ORDINAL SLOTS ("Day 1" is the first day this program
-- trains, never Monday) and a copy's are CONCRETE WEEKDAYS: `copyBlueprintInto`
-- translates `program_exercise.day_of_week` through `program.schedule` at apply,
-- and has since V24. So the copy's shape has to be translated the same way, or
-- it would describe a week the rows underneath it do not sit in.
--
-- Copying `day_labels` verbatim is the trap. A client training Mon/Tue/Thu/Fri
-- takes slots 1,2,3,4 onto weekdays 1,2,4,5 — so the blueprint's label for slot
-- 3 would land on Wednesday, a day they do not train, and Thursday would have no
-- name at all. Every label is re-keyed through the schedule the client chose.

UPDATE public.program p
SET day_labels = (
        SELECT jsonb_object_agg(e ->> 'weekday', t.day_labels -> (e ->> 'day'))
        FROM jsonb_array_elements(p.schedule) e
        WHERE t.day_labels ? (e ->> 'day')
    )
FROM public.template t
WHERE t.id = p.template_id
  AND p.day_labels IS NULL
  AND p.schedule IS NOT NULL
  AND jsonb_typeof(p.schedule) = 'array'
  AND t.day_labels IS NOT NULL;

-- `weeks` needs no translation: a block's length is the same fact on both sides.
UPDATE public.program p
SET weeks = t.weeks
FROM public.template t
WHERE t.id = p.template_id AND p.weeks IS NULL AND t.weeks IS NOT NULL;

-- The weekdays this client actually trains, read from the schedule they chose
-- rather than from the template's slots — and falling back to the copy's OWN
-- rows, which are the truth for a program written before `schedule` existed or
-- created from scratch with no template behind it at all.
UPDATE public.program p
SET training_days = COALESCE(
        (SELECT string_agg(DISTINCT e ->> 'weekday', ',' ORDER BY e ->> 'weekday')
         FROM jsonb_array_elements(p.schedule) e
         WHERE p.schedule IS NOT NULL AND jsonb_typeof(p.schedule) = 'array'),
        (SELECT string_agg(DISTINCT pe.day_of_week::text, ',' ORDER BY pe.day_of_week::text)
         FROM public.program_exercise pe
         WHERE pe.program_id = p.id AND pe.deleted_at IS NULL AND pe.day_of_week IS NOT NULL)
    )
WHERE p.training_days IS NULL;

-- ── AND `synced_at` IS THE MOMENT THE COPY WAS TAKEN ────────────────────────
--
-- `created_at`, not `updated_at`. A copy resynced before this migration has an
-- `updated_at` that moved for that reason and we cannot tell which moves were
-- resyncs — so this reads as "took the blueprint at apply and not since", which
-- is the conservative answer: the worst it can do is offer a push that is
-- already a no-op, where the other direction would hide one that is not.
--
-- `updated_at` is deliberately NOT touched by any statement in this file. It
-- drives the sync cursor, and moving it would push every program on the server
-- to every phone as though a trainer had edited it.

UPDATE public.program SET synced_at = created_at WHERE synced_at IS NULL;
