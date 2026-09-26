-- V9 · A CUSTOM MOVEMENT CAN BE A DRAFT, AND A MOVEMENT CAN CARRY CUES
--
--   `exercise.status`
--
-- The redesigned library lets a trainer *Save as draft* a movement they are
-- still writing up, and filters by `source` — the catalogue, their own, their
-- drafts. A draft must not appear in the library a program is built from until
-- it is finished, so the default read excludes it.
--
-- A STATUS and not an `is_draft` flag, because `archived` is the known next
-- value and a second boolean beside the first is how a row ends up both.
-- `DEFAULT 'published' NOT NULL`, so every catalogue row and every custom
-- movement already written reads as what it has always been: live. Drafts only
-- ever exist on custom rows — nothing writes one into the global library.
--
-- Not in the phone's custom-exercise upsert, so a phone editing the name of a
-- web draft can neither publish it nor un-publish it. It does ride the pull
-- (`SELECT *`), and a phone that predates it shows a draft as an ordinary
-- movement — deliberately preferred over filtering drafts out of the pull,
-- because a program row pointing at an exercise the phone was never sent is a
-- blank on the log screen, which is the worse failure.
--
--   `exercise.secondary_targets` · `exercise.form_cues`
--
-- JSONB lists the redesigned exercise panel draws: the muscles a movement
-- works besides its target, and the short coaching cues ("brace before you
-- unrack"). BOTH ARE LEFT EMPTY. The mock generates cues for every catalogue
-- row, and those must NOT be seeded: a generated form cue served as real is a
-- coaching instruction nobody wrote, and a trainer repeating it to a client is
-- the product putting words in their mouth. Filling them is a content pass of
-- its own, authored by a person. Until then the wire carries `[]`.
--
-- Additive. Nothing here changes what an existing read returns except three
-- fields appended to the end of `ExerciseResponse`.

ALTER TABLE public.exercise
    ADD COLUMN status            varchar(12) DEFAULT 'published' NOT NULL,
    ADD COLUMN secondary_targets jsonb,
    ADD COLUMN form_cues         jsonb;

COMMENT ON COLUMN public.exercise.status IS
    'published | draft (archived is the known next value). Drafts exist only on custom rows and are hidden from the default library read. Not in the phone''s push upsert. See V9.';
COMMENT ON COLUMN public.exercise.form_cues IS
    'JSONB list of short coaching cues. Deliberately unseeded: generated cues must never be served as real. NULL reads as []. See V9.';
COMMENT ON COLUMN public.exercise.secondary_targets IS
    'JSONB list of muscles worked besides `target`. Unseeded; NULL reads as []. See V9.';
