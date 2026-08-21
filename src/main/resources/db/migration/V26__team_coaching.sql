-- Team coaching: a senior trainer runs a team of trainers.
--
-- See `agent/XRep_team_coaching_prd.md`. The one sentence worth repeating here,
-- because every table below is shaped by it:
--
--     A TEAM IS A VISIBILITY GRANT, NEVER A CHANGE OF OWNER.
--
-- Eighteen tables in this schema carry `trainer_id` and filter on it, and that
-- column keeps meaning exactly what it has always meant — the coach whose book
-- this row is in. Team coaching does not rewrite it in bulk and does not add a
-- second owner. What it adds is a resolver: for a caller who is an owner or an
-- admin, the SET of trainer ids they may READ widens from {me} to {me + my
-- team}. Reads widen; ownership does not move.
--
-- Which is why there is no `team_id` on `client`, `program`, `payment`, or
-- anything else. A row belongs to a coach, a coach belongs to a team, and the
-- team is one join away. Denormalising `team_id` onto eighteen tables would
-- create eighteen places for it to go stale the day a coach leaves.
--
-- Additive only, per the schema law: three new tables, no ALTER, no backfill,
-- no drops. Every trainer on the day this ships has no team, which is the
-- correct starting state and needs no row written to express it.

-- ─── team ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Exactly one owner, always, and denormalised here as well as being a
    -- `team_member` row with role='owner'. Two representations of one fact is
    -- normally a smell; here it buys the cheap answer to "is this caller the
    -- owner" without a join, on a value that changes only in the single
    -- transaction that transfers ownership and updates both.
    owner_trainer_id UUID         NOT NULL REFERENCES trainer(id),

    name             VARCHAR(120) NOT NULL,

    -- Nullable, and nothing writes it yet: there is no file upload anywhere in
    -- this product. The column is the hook, so that adding team branding later
    -- is a code change and not a migration on a live table — the same bet V18
    -- made on `gym_admin`.
    logo_url         VARCHAR(500),

    -- NULL means unlimited. Enforced when an invite is ACCEPTED rather than
    -- when it is sent, because seats are consumed by people and not by
    -- intentions: an owner should be able to invite six for five seats and let
    -- the first five in.
    seat_limit       INT,

    metadata         JSONB        NOT NULL DEFAULT '{}'::jsonb,

    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_team_owner
    ON team (owner_trainer_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_team_updated_at ON team;
CREATE TRIGGER trg_team_updated_at
    BEFORE UPDATE ON team
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── team_member ─────────────────────────────────────────────────────────────
-- One row per coach per team, and pending invites live here too rather than in
-- a separate `team_invite` table. An invite IS a membership that has not been
-- agreed to — exactly the shape V18 chose for `client.membership_status` — and
-- splitting the two would mean accepting an invite deletes one row and writes
-- another, losing the invitation date that answers "how long has this coach
-- been with us".
CREATE TABLE IF NOT EXISTS team_member (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    team_id               UUID        NOT NULL REFERENCES team(id),

    -- NULLABLE, and that is the point: an invite can precede the account.
    --
    -- A gym owner invites a coach who has never heard of XRep. There is no
    -- trainer row to point at yet, so the row is written against the phone
    -- number and bound to a trainer id the first time that number signs in.
    -- Which makes the invite an acquisition channel and not merely an internal
    -- permission grant — the strongest reason to accept the nullable column.
    trainer_id            UUID        REFERENCES trainer(id),

    -- The number the invite was sent to. Kept after binding rather than
    -- cleared: it is the evidence of who was actually invited, and a phone
    -- number on a trainer row can be changed afterwards.
    invited_phone         VARCHAR(15),

    -- 'owner' | 'admin' | 'coach' — a plain string, like every other status in
    -- this schema, so adding a role is a code change and not a migration.
    --
    -- The owner is not a fourth kind of admin. It is the admin who cannot be
    -- removed, which is the only difference that needs to exist.
    role                  VARCHAR(20) NOT NULL,

    -- 'invited' | 'active' | 'declined' | 'removed'
    status                VARCHAR(20) NOT NULL,

    invited_by_trainer_id UUID        REFERENCES trainer(id),

    -- Four moments, four columns — not one `status_changed_at`. A membership
    -- can be invited, accepted, and later removed, and the invitation date is
    -- still the answer to a question somebody asks. Same reasoning as V18.
    invited_at            TIMESTAMPTZ,
    joined_at             TIMESTAMPTZ,
    declined_at           TIMESTAMPTZ,
    removed_at            TIMESTAMPTZ,

    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at            TIMESTAMPTZ,

    -- A member row has to identify somebody. Before binding that is the phone;
    -- after binding it is the trainer id; it is never neither.
    CONSTRAINT team_member_identifies_somebody
        CHECK (trainer_id IS NOT NULL OR invited_phone IS NOT NULL)
);

-- ONE TEAM PER TRAINER, enforced rather than assumed.
--
-- Same reasoning as `app_user.role` being exclusive. A coach in two teams makes
-- three questions unanswerable: whose library do they see, which team's admins
-- can read their clients, and whose seat are they occupying. One team, one
-- answer, and nothing downstream has to ask twice. This index is also the
-- backstop against two invites being accepted concurrently — the loser gets a
-- constraint violation the service turns into a 409, which is the correct
-- outcome and cheaper than a lock.
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_member_active_trainer
    ON team_member (trainer_id)
    WHERE status = 'active' AND deleted_at IS NULL AND trainer_id IS NOT NULL;

-- One owner per team, for the same reason: `team.owner_trainer_id` and this row
-- are two views of one fact, and the database should refuse to hold a third.
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_member_one_owner
    ON team_member (team_id)
    WHERE role = 'owner' AND status = 'active' AND deleted_at IS NULL;

-- The same number cannot be invited twice into one team. Re-inviting after a
-- decline or a removal is allowed and deliberate — a coach who said no in March
-- may say yes in April, and a rule that outlived the refusal it describes would
-- strand them forever. (Same carve-out `ClientPhoneGuard` makes for ended
-- memberships.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_member_pending_invite
    ON team_member (team_id, invited_phone)
    WHERE status = 'invited' AND deleted_at IS NULL AND invited_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_team_member_team
    ON team_member (team_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_team_member_trainer
    ON team_member (trainer_id) WHERE deleted_at IS NULL;

-- The binding lookup: "does this number have an invite waiting". Read on every
-- sign-in of a trainer with no team, so it earns its index.
CREATE INDEX IF NOT EXISTS idx_team_member_invited_phone
    ON team_member (invited_phone, status) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_team_member_updated_at ON team_member;
CREATE TRIGGER trg_team_member_updated_at
    BEFORE UPDATE ON team_member
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── client_assignment ───────────────────────────────────────────────────────
-- Every reassignment of a client from one coach to another. Written by the
-- feature that lands in Phase 2; created here because it belongs to this
-- migration's subject and a second migration for the same feature is a second
-- thing to remember.
--
-- It does two jobs, and the second one is not obvious.
--
--   1. THE AUDIT LOG. A reassignment touches two people's books, and one of
--      them may not have been in the room. Who moved whom, when, at whose
--      instruction, and what happened to the training plan.
--
--   2. THE SYNC TOMBSTONE SOURCE — and without it the feature is broken on its
--      first use. `/v1/sync/pull` filters `trainer_id = :tid`. When a client is
--      reassigned away from coach A, their rows stop matching A's filter, so
--      they appear in neither `updated` nor `deleted` and STAY ON A's PHONE
--      FOREVER: a live, editable, server-invisible copy of somebody else's
--      client. These rows are what lets the pull say "this left your scope" to
--      a device that only ever sees its own slice.
--
-- No `updated_at`, no `deleted_at`: an append-only log of things that happened.
-- A move made in error is undone by making the opposite move, which writes a
-- second row. Deleting the evidence is not an available operation — and the
-- tombstone logic in §5.2 of the PRD depends on the history being complete, so
-- a deletable row here would be a correctness bug and not just a policy one.
CREATE TABLE IF NOT EXISTS client_assignment (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

    client_id         UUID         NOT NULL REFERENCES client(id),
    team_id           UUID         NOT NULL REFERENCES team(id),

    from_trainer_id   UUID         NOT NULL REFERENCES trainer(id),
    to_trainer_id     UUID         NOT NULL REFERENCES trainer(id),

    -- The admin who did it, who may be neither party.
    actor_trainer_id  UUID         NOT NULL REFERENCES trainer(id),

    -- 'keep' | 'clear' — did the training plan move with the client, or does
    -- the new coach start fresh. The admin's answer, recorded because the two
    -- produce different rows and somebody will ask later which was chosen.
    program_action    VARCHAR(20)  NOT NULL,

    -- Optional reason, shown to both coaches.
    note              VARCHAR(500),

    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- "What left my scope since my last pull" — the tombstone query, and the only
-- one on the hot path.
CREATE INDEX IF NOT EXISTS idx_client_assignment_from
    ON client_assignment (from_trainer_id, created_at);

-- "Did a later move bring them back" — the NOT EXISTS guard that keeps
-- A → B → A from deleting a client who returned.
CREATE INDEX IF NOT EXISTS idx_client_assignment_client
    ON client_assignment (client_id, created_at);

CREATE INDEX IF NOT EXISTS idx_client_assignment_team
    ON client_assignment (team_id, created_at);
