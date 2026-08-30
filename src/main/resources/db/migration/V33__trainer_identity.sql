-- Trainer identity — the part of the profile a CLIENT reads, not the trainer.
--
-- V8 collected the six setup answers, and every one of them is a fact the app
-- itself consumes: `experience_band` and `specialities` filter, `languages`
-- has a GIN index because clients search on it, `upi_vpa` is a payment rail.
-- These three are different in kind. Nothing in XRep branches on a headline.
-- They exist so that the person deciding whether to accept an invite can see
-- who is asking — which is why they land next to `name`, the one other column
-- on this table that has always been for somebody else's eyes.
--
-- WHAT IS NOT HERE: the profile photo. It needs a store the backend does not
-- have — there is no multipart endpoint, no object-store config and no image
-- pipeline anywhere in this service — so it is a pass of its own rather than a
-- column smuggled in on the back of three text fields. Until it lands, the
-- initials avatar `NameForm.tsx` already draws is the trainer's face, and its
-- copy already promises this ("until profile photos arrive").
--
-- Additive only: three nullable columns on an existing table. NULL means never
-- answered, which is what every trainer created before today is.

ALTER TABLE trainer
    -- One line, under the name, wherever the trainer is introduced:
    -- "Strength & fat-loss coach · Indiranagar".
    ADD COLUMN IF NOT EXISTS headline TEXT,

    -- 100-200 words, capped in code at 1200 characters.
    ADD COLUMN IF NOT EXISTS bio TEXT,

    -- A YouTube link, optional, stored CANONICAL — the server reduces whatever
    -- was pasted (youtu.be, /shorts, /embed, a share URL trailing a timestamp
    -- and a tracking parameter) to https://www.youtube.com/watch?v=<id>. A
    -- consumer that wants to embed extracts the id and never re-parses the six
    -- shapes a trainer can paste.
    ADD COLUMN IF NOT EXISTS intro_video_url TEXT;

-- TEXT rather than VARCHAR(n) on all three, deliberately, and the reason is the
-- additive-only law itself. Every length here is a PRODUCT decision that will be
-- argued again — 80 characters of headline, 1200 of bio — and under a law that
-- forbids retyping a column, a VARCHAR(80) makes "let them write 100" a
-- migration. TEXT costs nothing in Postgres (same storage, same index
-- behaviour) and puts the cap in `TrainerService`, where changing it is a
-- one-line change and old rows stay readable either way.
