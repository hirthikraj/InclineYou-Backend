-- Screen 06 · Packages · the commercial engine's messy half.
--
-- V1 gave a sold package a count, a price and two dates. V11 gave it a debt
-- side. Neither gave it a LIFE: a package could be sold and it could be paid
-- for, and between those two facts nothing could happen to it. Real coaching
-- arrangements are full of things happening to them — a client goes to Kerala
-- for three weeks, a trainer throws in a fortnight because somebody had a bad
-- month, a twelve-session block quietly runs out and nobody notices until the
-- thirteenth session is trained for free.
--
-- Those are the three this migration is for: PAUSE, EXTEND, and CLOSE. A
-- trainer who cannot represent them in the app keeps a parallel notebook, and a
-- trainer with a parallel notebook has half-left the product.
--
-- Additive only, as always: three nullable/defaulted columns on `package`, and
-- one new table. Nothing renamed, retyped, dropped or repurposed. A build that
-- predates this keeps working — it never writes the new fields and reads them
-- as absent.

-- ─── package · the three columns ─────────────────────────────────────────────
ALTER TABLE package
    -- WHEN the pack was paused, or NULL if it is running. One column rather than
    -- a `status = 'paused'` value, and the distinction is load-bearing: a paused
    -- pack is still an ACTIVE pack — it is the client's current arrangement, it
    -- is what a renewal continues from, and it is what the money book is owed
    -- against. Only its clock has stopped. Folding pause into `status` would
    -- have made every existing `WHERE status = 'active'` read — the deck, the
    -- money book, `markDone`'s pack picker, `pack.activeClients` — silently drop
    -- a client who is on holiday, which is the opposite of what any of them mean.
    --
    -- What it DOES gate is the decrement: `ScheduledSessionService.markDone`
    -- refuses to charge a paused pack. That is one predicate in one place, which
    -- is what makes this a column and not a status.
    ADD COLUMN IF NOT EXISTS paused_at   TIMESTAMPTZ,

    -- How many days this pack has spent paused, ALL TIME. Accumulated on resume,
    -- never on pause — a pause that is still open has no length yet.
    --
    -- It exists so `end_date` can stay the honest answer to "when does this
    -- run out". Resuming pushes `end_date` out by the days that were lost, and
    -- this is the running total of how far it has been pushed. Without it,
    -- "expires 14 November" is a date nobody can reconstruct or argue with.
    ADD COLUMN IF NOT EXISTS paused_days INTEGER NOT NULL DEFAULT 0,

    -- When the pack stopped being live — sessions exhausted, or validity run
    -- out. Set in the same statement that moves `status` off 'active'.
    --
    -- Separate from `updated_at` because that moves for a rename, a discount or
    -- a sync echo, and this is a fact about the arrangement. Separate from
    -- `end_date` because that is the date the pack was SOLD to run until, and
    -- this is the date it actually stopped: they differ every time a client
    -- burns twelve sessions in six weeks of a three-month validity.
    ADD COLUMN IF NOT EXISTS closed_at   TIMESTAMPTZ;

-- The lifecycle sweep's read: this trainer's live packs, to test for exhaustion
-- and lapsed validity. Partial, because the set it scans is the small one — a
-- trainer has a handful of live packs and a growing pile of finished ones, and
-- an index over the pile would be paid for on every read of the handful.
CREATE INDEX IF NOT EXISTS idx_package_live
    ON package (trainer_id)
    WHERE status = 'active' AND deleted_at IS NULL;

-- ─── package_adjustment ──────────────────────────────────────────────────────
-- Every pause, resume and extension, with the reason the trainer gave.
--
-- ── WHY A TABLE AND NOT TWO MORE COLUMNS ────────────────────────────────────
--
-- Because the columns above answer "what is true now" and this answers "how did
-- it get that way", and only the second one survives a disagreement. A client
-- who booked twelve sessions and is looking at an expiry in December wants to
-- know why it is not November; a trainer who gave away two weeks in July wants
-- to remember that they did before giving away two more in August. `end_date`
-- alone cannot say either. It is the same argument V11 made for
-- `gym_settlement.sessions_counted` — a figure you cannot show the working for
-- is a figure the other party has to take on trust.
--
-- It is also what keeps goodwill from being invisible. An extension is the
-- cheapest thing a trainer gives away and the easiest to forget giving; a list
-- of them is the only way "I've already stretched this twice" is ever a fact
-- rather than a feeling.
--
-- ── APPEND-ONLY ─────────────────────────────────────────────────────────────
--
-- No UPDATE, no soft delete, no `deleted_at`. A pause that happened happened,
-- and a log that can be edited is not a log. Reversing an adjustment is another
-- row, which is why `days` is signed.
--
-- ── NOT SYNC ────────────────────────────────────────────────────────────────
--
-- Nothing here enters the sync envelope, for V28's and V29's reason: the web is
-- online-only and the phone will read these over REST if it ever adopts them.
-- The three columns above are likewise absent from `pushPackages`' upsert, so an
-- old build's push cannot touch them — the same guard V19's `discount_amount`
-- gets, one level stronger, since these are never sent at all.
CREATE TABLE IF NOT EXISTS package_adjustment (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    package_id   UUID        NOT NULL REFERENCES package(id),

    -- Denormalised, exactly as V29 denormalises the note's author: it makes
    -- "mine and nobody else's" a predicate the query can state rather than a
    -- join it has to be trusted to remember. A team widens reads, and a
    -- teammate's money book is the one thing no role ever sees.
    trainer_id   UUID        NOT NULL REFERENCES trainer(id),

    -- 'pause' | 'resume' | 'extend'
    --
    -- Validated in application code and stored as plain text, per V19's note —
    -- so a fourth kind one day is a code change and not a migration.
    kind         VARCHAR(20) NOT NULL,

    -- SIGNED, and in days.
    --
    --   extend  → +14, the goodwill given
    --   resume  → +21, the days the pause cost, pushed back onto `end_date`
    --   pause   →   0, because an open pause has no length yet
    --
    -- Signed rather than unsigned because reversing an adjustment is another row
    -- with a negative `days`, not an edit to this one. Summing the column over a
    -- package is exactly how far its expiry has moved from the day it was sold,
    -- which is the one number a client ever argues about.
    days         INTEGER     NOT NULL DEFAULT 0,

    -- "Kerala till the 20th." "Rough month, on me."
    --
    -- Free text, never parsed, and nullable — a trainer pausing a pack between
    -- two clients on a gym floor should not be held up by a required field. Same
    -- rule as `payment.note` and V29's body: the product stores the characters
    -- and classifies nothing. No health data, ever: "shoulder surgery" typed in
    -- here is the trainer writing on a paper card, and it stays that.
    reason       TEXT,

    -- When the adjustment took effect, which is not always when it was recorded.
    -- A trainer catching up on Sunday backdates the pause to the Thursday the
    -- client actually left, and the resume arithmetic has to use the real dates
    -- or it gives back the wrong number of days.
    effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One package's history, oldest first — the order it is read and rendered in.
CREATE INDEX IF NOT EXISTS idx_package_adjustment_package
    ON package_adjustment (package_id, effective_at);

-- The tenant filter, for any read that is not already narrowed to one package.
CREATE INDEX IF NOT EXISTS idx_package_adjustment_trainer
    ON package_adjustment (trainer_id, created_at DESC);
