-- The trainer's own notes about a client. The relationship layer.
--
-- Real trainer notes look like "prefers mornings, hates burpees, wife Priya,
-- getting married in Nov — wants to lean out", and none of that fits in `goal`.
-- It is the knowledge a trainer carries in their head about forty people, and
-- the thing the software has to hold if it is going to feel like it knows their
-- business rather than their invoices.
--
-- ─── THIS IS NOT A HEALTH RECORD, AND THE DISTINCTION IS LEGAL ───────────────
--
-- `XRep_MVP_interaction_map.md` is explicit and it is not a preference:
-- "**No medical or health-condition fields anywhere** — no injuries, no
-- conditions, no medications … Do not design an 'injuries / health notes' field
-- into intake", filed under *legally excluded, not deferred*, against the DPDP
-- Act 2023. NFR-8 in the requirements doc says the same, and §3.2 of the data
-- model pins the note itself: "free text; **no medical fields**".
--
-- So this table is FREE TEXT AND NOTHING ELSE. It has no injury column, no
-- condition column, no PAR-Q flag, and it must never grow one. The moment a
-- column distinguishes a health note from any other note, the product holds
-- health data whatever the column is called — which is the argument `AGENTS.md`
-- already makes for the deck's neutral *Has a note* chip, and it applies here
-- with more force because this is where the text actually lives.
--
-- A trainer typing "left knee — no deep squats" into a free-text note is the
-- same act as writing it on a paper card, and the product does not read it,
-- classify it, index it or flag it. The sanctioned path to structured health
-- data is §5 of the data model — "create a new `health_note` table with its own
-- access controls and consent" — and it is a separate, consented feature. NOT
-- this table, and not by widening this one.
--
-- ─── WHY `pinned` IS ONE COLUMN AND NOT A SECOND TABLE ───────────────────────
--
-- A trainer needs a handful of these in their face before every session and the
-- rest of them filed. That is one difference — how loudly it is shown — over
-- one kind of thing, so it is a flag on the row rather than two stores that
-- would drift and two writes to keep in step. Pinning is a decision about
-- prominence the trainer makes and unmakes; the text does not change when they
-- do, which is exactly what a column expresses and a separate table does not.
--
-- ─── WHY `trainer_id` IS HERE WHEN `client_id` ALREADY IMPLIES IT ────────────
--
-- Because a team widens reads. V26's law is that a team never moves ownership,
-- but it does let a coach see a teammate's client — and a private note is the
-- one thing on a client's file that must not travel with that widening, for the
-- same reason no role ever sees a teammate's money book. Denormalising the
-- author onto the row makes "mine and nobody else's" a predicate the query can
-- state rather than a join it has to be trusted to remember.
--
-- ─── NOT SYNC ────────────────────────────────────────────────────────────────
--
-- Nothing here reaches the sync envelope, for V28's reason and V26's before it:
-- the web is online-only, and the phone will read these over REST when it adopts
-- them. No column here is repurposed, no ALTER, no backfill — additive only, per
-- the schema law. Every trainer on the day this ships has written no notes,
-- which is the correct starting state and needs no row to express it.

CREATE TABLE IF NOT EXISTS client_note (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    client_id  UUID        NOT NULL REFERENCES client(id),

    -- The author, and the whole of the privacy rule. See above.
    trainer_id UUID        NOT NULL REFERENCES trainer(id),

    -- Free text. TEXT rather than VARCHAR(n) because there is no length at which
    -- a trainer's note about a person becomes invalid, and a cap discovered at
    -- save time loses what they just typed. The service caps it at a number that
    -- is about storage, not meaning, and says so.
    --
    -- Stored in plain text today. Encryption at rest is the deployment's job
    -- (NFR-8), and column-level encryption is a later change that does not need
    -- this shape to be different — it needs a key story this product does not
    -- have yet, and a half-built one is worse than none.
    body       TEXT        NOT NULL,

    -- Shown in the always-visible strip at the top of the client's file rather
    -- than in the notes list. Default false: a note is filed unless the trainer
    -- says otherwise, because a strip that fills up stops being read.
    pinned     BOOLEAN     NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Soft delete, unlike V28's. A dismissal is a toggle whose unique constraint
    -- a tombstone would collide with; a note is a thing the trainer WROTE, and
    -- deleting one on a mis-tap should be recoverable by us even if the UI does
    -- not offer it yet.
    deleted_at TIMESTAMPTZ
);

-- The notes tab: one client's notes, newest first. Covers the list read whole.
CREATE INDEX IF NOT EXISTS idx_client_note_client
    ON client_note (client_id, created_at DESC);

-- The strip, which loads on every open of a client file and wants only the few
-- pinned rows. Partial, because the pinned set is small and the filed set is not
-- — this index stays roughly the size of what the strip actually draws.
CREATE INDEX IF NOT EXISTS idx_client_note_pinned
    ON client_note (client_id, created_at DESC)
    WHERE pinned AND deleted_at IS NULL;
