-- Where a trainer works, and how — the second half of the profile a CLIENT
-- reads, and the first columns on `trainer` that are about a PLACE.
--
-- V33 added the three columns nothing in the product branches on (headline,
-- bio, intro video) so the person deciding whether to accept an invite can see
-- who is asking. These four answer the next question that person has, and the
-- product does not branch on any of them either: WHERE, and HOW.
--
-- ── WHY THIS IS NOT `work_mode` AND `gym_name`, WHICH ALREADY EXIST ─────────
--
-- It sits beside them and does not replace them, because they answer a
-- different question. `work_mode` (V23) and `gym_name` (V11) are the MONEY
-- BOOK's defaults hint: which price lists exist on the packs step, who collects
-- at add-client time, what heads the gym group on the Money screen. Their own
-- migrations say so in bold — "a HINT, not a type", "it must never gate a
-- feature" — and that stands unchanged here.
--
-- `training_modes` is a different fact. A trainer whose `work_mode` is 'gym'
-- may still take home visits on Sundays and coach two people online; a trainer
-- who is 'independent' may work out of a studio they do not own. The commercial
-- arrangement and the way the coaching is actually delivered are not the same
-- answer, and collapsing them would make one of the two lie. So the profile tab
-- shows both, and the money book keeps reading only the first.
--
-- Additive only: four nullable / defaulted columns on an existing table. NULL
-- and `[]` both mean never answered, which is what every trainer created before
-- today is.

ALTER TABLE trainer
    -- A link to the gym or studio on a map, exactly as the trainer pasted it
    -- from the share sheet. NOT canonicalised, unlike `intro_video_url`: a
    -- YouTube link reduces to a watch URL because an 11-character id is the
    -- whole fact, whereas a maps URL carries a place id, a name, coordinates
    -- and sometimes a plus code in shapes that differ per provider and per
    -- country. There is no `MapLink.java` to write that would not eventually
    -- break somebody's working link, so this is stored verbatim and only
    -- checked for being an http(s) URL at all.
    ADD COLUMN IF NOT EXISTS map_link TEXT,

    -- How the coaching is delivered: 'gym_floor' | 'home_visit' | 'online' |
    -- 'hybrid'. Ids, JSONB, `custom:`-prefixed for anything typed — the same
    -- shape and the same contract as V8's `specialities` / `certifications` /
    -- `languages`, so `TrainerService.clean()` applies unchanged.
    --
    -- Plain strings rather than an enum or a check constraint, the same call
    -- V23 made for `work_mode` and V8 made for `experience_band`: a fifth mode
    -- should be a code change, not a migration under a law that forbids
    -- editing one that has run.
    ADD COLUMN IF NOT EXISTS training_modes JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- The localities a trainer actually travels to — free text, one entry per
    -- area ("Indiranagar", "HSR Layout"). Not a catalogue: India has no
    -- locality list this product could ship that would be right in two cities,
    -- and a dropdown that does not contain somebody's neighbourhood is worse
    -- than a field. Capped by `TrainerService.clean()` like every other list.
    --
    -- This is the answer 'home_visit' creates the need for: a mode that says
    -- "I come to you" with no answer to "how far" is not information a client
    -- can act on.
    ADD COLUMN IF NOT EXISTS service_areas JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Clients filter coaches by how they can be trained, the same way they already
-- filter by language — so this gets the same GIN index now rather than after it
-- is slow. Answers `training_modes @> '["online"]'`.
CREATE INDEX IF NOT EXISTS idx_trainer_training_modes ON trainer USING GIN (training_modes);
