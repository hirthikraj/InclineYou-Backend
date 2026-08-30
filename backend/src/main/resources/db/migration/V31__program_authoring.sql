-- Screen 05 · Programs · the four things a blueprint could not say.
--
-- `webapp-programs.html` §05 asks for three of these and prices each one at a
-- single nullable field: an ALTERNATE for when the kit is taken, a SUPERSET,
-- and per-set reps with any set taken to FAILURE. The fourth — TEMPO — comes
-- from the product brief of 28 Aug 2026, which asks for it per exercise beside
-- sets, reps, load and rest.
--
-- All four already have somewhere to live on the TEMPLATE side, because
-- `template.structure` is jsonb and a new key in a blueprint entry needs no
-- migration. What they had nowhere to live is the CLIENT'S COPY:
-- `program_exercise` is fixed columns, and `TemplateService.apply` copies
-- column by column. So a superset authored on a template would have been
-- silently flattened the moment it was assigned to somebody — which is the
-- worst possible failure, because the trainer would see it on the blueprint and
-- the client would never get it.
--
-- Additive only. Four nullable columns, nothing renamed, retyped, dropped or
-- repurposed, and each one degrades honestly in a build that predates it —
-- which is the whole test under the additive-only law and the reason none of
-- them is a sentinel value in a field that already means something else.

ALTER TABLE program_exercise
    -- TEMPO. "3010" — four digits, eccentric / pause / concentric / pause, in
    -- seconds. Free text rather than four smallint columns because trainers
    -- write it as one token, say it as one token, and the notations in use
    -- disagree about the order — "31X0" has an X in it, and a column typed as a
    -- number could not hold the notation the trainer actually uses.
    --
    -- An old reader draws no tempo. The prescription is exactly the
    -- prescription it was.
    ADD COLUMN IF NOT EXISTS tempo            TEXT,

    -- ALTERNATE. "or the chest press machine, when the bench is taken." One
    -- nullable FK, and the substitute inherits this row's prescription rather
    -- than carrying its own — a second set of numbers on every row doubles the
    -- editing surface to serve the rarer half of the case.
    --
    -- An old reader draws no alternate and the plan is exactly the plan it was.
    ADD COLUMN IF NOT EXISTS alt_exercise_id  UUID REFERENCES exercise (id),

    -- SUPERSET. Members share this key and sit adjacent in `order_index`.
    --
    -- A shared key on adjacent rows rather than a nested structure, and that is
    -- the entire reason it is safe: an old reader that knows nothing about
    -- groups renders two exercises in order and the client does them back to
    -- back — a superset performed as straight sets. Degraded, not wrong. A
    -- nested container would have been unwalkable by the same reader.
    --
    -- Not an FK to anything. It is a correlation id, minted by whichever half
    -- created the group, and its only meaning is "these rows are one block".
    ADD COLUMN IF NOT EXISTS group_id         UUID,

    -- PER-SET DETAIL. `[{"reps":12},{"reps":12},{"toFailure":true}]` — one
    -- object per set, in order.
    --
    -- "Four sets, the last two to failure" is an ordinary prescription and an
    -- exercise-level mode cannot say it: there is nothing for "the last two" to
    -- attach to. So `sets` stops being the whole story and this is the rest of
    -- it.
    --
    -- The scalar `sets` and `reps` columns STAY, and stay authoritative while
    -- the sets agree: a straight 4 × 12 writes `sets=4, reps=12` here as it
    -- always did and an old build is exactly right. The moment the sets
    -- diverge, `reps` is written NULL and `sets` keeps the count — so an old
    -- build reads "4 sets", which is incomplete but true. It is never handed a
    -- number that is wrong for half the sets, and never a sentinel like
    -- `reps = -1` that it would render as "minus one reps".
    --
    -- jsonb rather than a child table because the blueprint it mirrors is
    -- already JSON, because a new synced table costs a sync contract, and
    -- because it leaves room for a per-set rest or load later without another
    -- migration.
    ADD COLUMN IF NOT EXISTS set_detail       JSONB;

-- Members of one superset are read together, always, and always within one
-- program. Partial on the group being present, because the overwhelming
-- majority of rows are straight sets and have none.
CREATE INDEX IF NOT EXISTS idx_program_exercise_group
    ON program_exercise (program_id, group_id)
    WHERE group_id IS NOT NULL AND deleted_at IS NULL;

-- ─── template · nothing to add, and that is worth writing down ───────────────
--
-- `template.weeks` (V20) and `template.training_days` (V24) already exist and
-- are already the authority for how long a program runs and which ordinal day
-- slots it lays out. What was missing was never a column — it was that
-- `CreateTemplateRequest` and `UpdateTemplateRequest` had no fields for them,
-- so every template ever authored over REST wrote NULL to both and the day
-- layout had to be inferred back from wherever exercises happened to land.
--
-- That inference has a trap in it, and it is the one the design set names: the
-- first exercise goes on Day 1, Day 1 becomes the only day the program has, and
-- there is nowhere left to put Day 2's first exercise. A day exists when the
-- trainer lays it out, not when something lands on it. Fixed on the DTO, not
-- here.
