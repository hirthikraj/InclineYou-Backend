-- A row in *Needs you today* that the trainer has silenced.
--
-- The action queue on Today ranks work by what it costs to ignore, and it earns
-- its place by being trustworthy: "trainers will trust the list precisely because
-- it's sometimes empty." A list that cannot be silenced is not trustworthy — it is
-- a list that argues with the trainer every morning about a client they have
-- already dealt with off-app, and the way that argument ends is the trainer
-- stopping reading the list.
--
-- So dismissal has memory, and the memory is HERE rather than in the browser.
-- Three reasons, in order of how much they cost when ignored:
--
--   1 · A gym desktop is shared. `localStorage` would silence a row for whoever
--       sits down next, and only on that machine — so the same trainer on their
--       own laptop gets the row back, and their colleague never sees it.
--   2 · A dismissal is a fact about a client, not a preference of a device. The
--       phone will want to read these rows, and a browser key it cannot reach is
--       a second opinion about what needs doing.
--   3 · A snooze has to EXPIRE, and an expiry needs a clock both halves agree on.
--
-- ─── WHAT THIS IS NOT ────────────────────────────────────────────────────────
--
-- Not a nudge. `nudge_log` records messages that went out, and the phone computes
-- its once-per-client-per-7-days cooldown from that table
-- (`app/src/nudges/rules.ts`) — so a dismissal written there would suppress the
-- real reminder it was never about. Different fact, different table.
--
-- Not sync. Nothing here reaches the sync envelope: the web is online-only, and
-- a silence authored on a phone with no signal is one replayed at an unknown
-- later time — the same argument V26 makes for the team tables. When the phone
-- adopts this it reads it over REST like the team screens do.
--
-- Additive only, per the schema law: one new table, no ALTER, no backfill. Every
-- trainer on the day this ships has silenced nothing, which is the correct
-- starting state and needs no row to express it.

CREATE TABLE IF NOT EXISTS attention_dismissal (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

    trainer_id    UUID         NOT NULL REFERENCES trainer(id),
    client_id     UUID         NOT NULL REFERENCES client(id),

    -- Which JOB was silenced, not which row. `AttentionItem.kind` on both halves:
    -- 'pack' | 'overdue' | 'missed' | 'quiet' | 'no-program' | 'unmarked' |
    -- 'milestone' | 'log'.
    --
    -- The queue is already one row per client per kind — "a trainer who owes you
    -- money and hasn't logged a workout is two different jobs, but three overdue
    -- invoices are one" — so this is the same grain as the thing being silenced.
    -- Silencing a client's money must not silence their empty pack.
    --
    -- Not constrained to a fixed set, for the reason the statuses aren't: an
    -- eighth kind should cost a deploy, not a migration.
    kind          VARCHAR(30)  NOT NULL,

    -- The band it sat in WHEN it was silenced — 'pack-ending', 'due-soon', and so
    -- on, from `ATTENTION_BANDS`.
    --
    -- This is the column that stops a dismissal becoming a blindfold. "Pack ends
    -- in 2 sessions" dismissed on Monday must NOT keep the row hidden when the
    -- pack hits zero on Thursday: that is a different, worse fact, and the
    -- trainer silenced the first one. So the reader compares the live band
    -- against this one and resurfaces the row when the condition has got worse.
    -- Recording only "dismissed" would hide the escalation with the noise.
    band          VARCHAR(30)  NOT NULL,

    -- NULL means dismissed for good; a timestamp means snoozed until then.
    --
    -- One nullable column rather than a boolean and a date, because the two can
    -- disagree and this cannot: a row is live if `snoozed_until IS NULL OR
    -- snoozed_until > NOW()`, one predicate, and no state where a permanent
    -- dismissal also carries an expiry nobody reads.
    snoozed_until TIMESTAMPTZ,

    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- One silence per client per job. Dismissing the same job again UPDATES it —
    -- a snooze extended, or a snooze made permanent — rather than stacking rows
    -- that would each have to be checked. `ON CONFLICT` in the service depends on
    -- this constraint existing.
    CONSTRAINT attention_dismissal_one_per_job UNIQUE (trainer_id, client_id, kind)
);

-- The only query on a hot path: every dismissal this trainer still has live, read
-- once per load of Today. `created_at` is not in it — the reader wants all of them
-- and sorts nothing.
CREATE INDEX IF NOT EXISTS idx_attention_dismissal_trainer
    ON attention_dismissal (trainer_id);

-- Drawn on one client's file, and the route that restores a single silence.
CREATE INDEX IF NOT EXISTS idx_attention_dismissal_client
    ON attention_dismissal (client_id);

-- No `deleted_at`. Restoring a row means the trainer wants the job BACK in the
-- list, and a soft-deleted silence is a silence the unique constraint still
-- counts — the next dismissal of the same job would collide with a tombstone.
-- Un-dismissing deletes.
