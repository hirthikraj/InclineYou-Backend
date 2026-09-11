-- V37 — the tenant root.
--
-- Until now this schema had one ownership column, `trainer_id`, and it answered
-- two different questions at once: WHO COACHES this client, and WHOSE BOOKS the
-- row belongs to. Those were the same fact only because a trainer had exactly
-- one working life.
--
-- They are not the same fact any more. One person coaches privately AND at a
-- gym, with different clients in each; the same human can be a client under two
-- different arrangements. So the two questions get two columns:
--
--   trainer_id  — who coaches. Unchanged, still NOT NULL, still what every
--                 existing query filters on.
--   tenant_id   — whose books. New, added in V38/V39, and IMMUTABLE: a row is
--                 stamped with the workspace it was created in and never moves.
--
-- Immutability is the load-bearing property. Because a row is stamped where it
-- was created, nothing has to be re-stamped when a trainer joins a gym, leaves
-- one, or is removed from a team — their private clients were never in the gym's
-- tenant and the gym's clients were never in the private one. V39 enforces it
-- with a trigger rather than trusting it as a convention.
--
-- This migration adds only the root and the memberships, and moves no data. It
-- is inert: nothing in the application reads these tables until V42 turns on the
-- policies and the connection string moves to `xrep_app`.

-- ─── the workspace ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 'solo' | 'team' | 'gym'.
    --
    -- All three OWN ROWS. What differs is how many people are in them and what
    -- roles exist, which is what lets one mechanism serve a lone trainer, a team
    -- and a gym instead of the gym console needing an isolation scheme of its
    -- own. VARCHAR and not an ENUM, per the schema's convention: adding a fourth
    -- kind must be a code change, not a migration on a live table.
    type                VARCHAR(20)  NOT NULL,

    name                VARCHAR(160) NOT NULL,

    -- 'active' | 'suspended' | 'closed'. A whole workspace can be switched off
    -- with one column, which is the first thing `trainer_id` could never do.
    status              VARCHAR(20)  NOT NULL DEFAULT 'active',

    -- Who owns and pays. NOT an ownership column for the DATA — that is
    -- `tenant_id` on the rows themselves — and deliberately nullable, because a
    -- gym org can exist before any one person is named as its owner.
    primary_app_user_id UUID         REFERENCES app_user(id),

    metadata            JSONB        NOT NULL DEFAULT '{}',

    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

DROP TRIGGER IF EXISTS trg_tenant_updated_at ON tenant;
CREATE TRIGGER trg_tenant_updated_at
    BEFORE UPDATE ON tenant
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_tenant_type ON tenant (type) WHERE deleted_at IS NULL;

-- ─── who may enter a workspace, and as what ──────────────────────────────────
--
-- THIS TABLE IS THE MULTI-TENANCY. One person, N rows. A trainer who coaches
-- privately and at a gym has two: (solo tenant, coach) and (gym tenant, coach).
-- A trainer who is also somebody's client has a third.
--
-- It is also the `user_role (app_user_id, role, scope_type, scope_id, status)`
-- that SCHEMA.md scheduled for the gym platform. `tenant_id` replaces
-- (scope_type, scope_id) outright, because the tenant already carries its type —
-- so this is that table, and the gym platform must not add a second one.
--
-- `app_user.role` is NOT dropped and NOT repurposed. It narrows to "the role the
-- app opens in" for builds that predate this, and `is_home` below takes over the
-- job going forward.
CREATE TABLE IF NOT EXISTS tenant_member (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    tenant_id   UUID        NOT NULL REFERENCES tenant(id),
    app_user_id UUID        NOT NULL REFERENCES app_user(id),

    -- 'owner' | 'admin' | 'coach' | 'gym_admin' | 'gym_staff' | 'client'.
    -- The owner is not a fourth kind of admin; it is the admin who cannot be
    -- removed — the same reading `team_member.role` already has.
    role        VARCHAR(20) NOT NULL,

    -- 'invited' | 'active' | 'declined' | 'removed'.
    status      VARCHAR(20) NOT NULL DEFAULT 'active',

    -- Which workspace the app opens in. One per person, enforced below.
    is_home     BOOLEAN     NOT NULL DEFAULT FALSE,

    -- What this member keeps of what they collect in this tenant. NULL = all of
    -- it, which is the right default and the only correct answer for a solo
    -- tenant. A percentage rather than an amount for the same reason
    -- `trainer.gym_share_percent` is: the split is the agreement, the money is
    -- the consequence.
    revenue_share_percent     NUMERIC(5,2),

    -- An admin's cut of revenue from clients THEY assigned to somebody else.
    -- NULL = none, which is what every member starts with. This is the margin an
    -- admin earns for running the roster, and it is stored on the membership
    -- because it is a property of their role in this workspace, not of any one
    -- client — the per-assignment copy is frozen onto `client_assignment` in V40
    -- for the same reason V11 froze `share_percent` onto the payment.
    assignment_margin_percent NUMERIC(5,2),

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);

DROP TRIGGER IF EXISTS trg_tenant_member_updated_at ON tenant_member;
CREATE TRIGGER trg_tenant_member_updated_at
    BEFORE UPDATE ON tenant_member
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One live row per (workspace, person, role). Two roles in one workspace is
-- legitimate — a gym's owner who also coaches — so `role` is part of the key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_member_live
    ON tenant_member (tenant_id, app_user_id, role) WHERE deleted_at IS NULL;

-- Exactly one home per person. A partial unique index rather than a column on
-- `app_user`, because the fact being constrained is about a membership.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_member_home
    ON tenant_member (app_user_id) WHERE is_home AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_member_user
    ON tenant_member (app_user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tenant_member_tenant
    ON tenant_member (tenant_id, status) WHERE deleted_at IS NULL;

-- ─── the two tables that point at a tenant rather than carrying one ──────────
--
-- `trainer` gets NO tenant_id, and that is the whole point of the design: a
-- trainer SPANS tenants, so a single column would have to pick one and be wrong.
-- What it gets is a default — where a new row goes when the caller has not said
-- otherwise, and the key V38's backfill joins on.
ALTER TABLE trainer
    ADD COLUMN IF NOT EXISTS home_tenant_id UUID REFERENCES tenant(id);

-- A team IS a tenant. The `team` row stays because the additive-only law forbids
-- dropping it and because `team_member` is in the sync surface; from here it is
-- the satellite that carries the team-specific settings (seat limit, logo) while
-- the tenant carries identity and membership.
ALTER TABLE team
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);

-- ─── backfill ────────────────────────────────────────────────────────────────
--
-- Every row in this database predates tenants, so every one of them resolves to
-- its trainer's own `solo` workspace. Teams and gyms start empty and fill from
-- new work. NOTHING MOVES — which is the point of stamping at creation.
--
-- The link between a new tenant and the row it was created for is carried in
-- `metadata` rather than in a temporary column: it is a fact worth keeping (it
-- says this workspace was made by a migration, not by a person) and it avoids
-- depending on CTE materialisation rules for correctness.

INSERT INTO tenant (type, name, status, primary_app_user_id, metadata, created_at)
SELECT 'solo',
       COALESCE(NULLIF(TRIM(t.name), ''), 'My practice'),
       -- Soft-deleted trainers get a workspace too, marked closed. They still
       -- own rows, and V38 declares tenant_id NOT NULL — a trainer with no
       -- tenant would be a row the backfill could not resolve.
       CASE WHEN t.deleted_at IS NULL THEN 'active' ELSE 'closed' END,
       au.id,
       jsonb_build_object('backfill', 'v37', 'trainer_id', t.id::text),
       t.created_at
FROM trainer t
LEFT JOIN app_user au ON au.phone = t.phone AND au.deleted_at IS NULL;

UPDATE trainer t
SET home_tenant_id = tn.id
FROM tenant tn
WHERE tn.type = 'solo'
  AND tn.metadata->>'trainer_id' = t.id::text
  AND t.home_tenant_id IS NULL;

INSERT INTO tenant (type, name, status, primary_app_user_id, metadata, created_at)
SELECT 'team',
       COALESCE(NULLIF(TRIM(tm.name), ''), 'My team'),
       CASE WHEN tm.deleted_at IS NULL THEN 'active' ELSE 'closed' END,
       au.id,
       jsonb_build_object('backfill', 'v37', 'team_id', tm.id::text),
       tm.created_at
FROM team tm
LEFT JOIN trainer ow ON ow.id = tm.owner_trainer_id
LEFT JOIN app_user au ON au.phone = ow.phone AND au.deleted_at IS NULL;

UPDATE team tm
SET tenant_id = tn.id
FROM tenant tn
WHERE tn.type = 'team'
  AND tn.metadata->>'team_id' = tm.id::text
  AND tm.tenant_id IS NULL;

-- Every trainer owns their own solo workspace, and it is where their app opens.
INSERT INTO tenant_member (tenant_id, app_user_id, role, status, is_home, created_at)
SELECT t.home_tenant_id, au.id, 'owner', 'active', TRUE, t.created_at
FROM trainer t
JOIN app_user au ON au.phone = t.phone AND au.deleted_at IS NULL
WHERE t.home_tenant_id IS NOT NULL
  AND t.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- Team memberships become tenant memberships. `is_home` stays FALSE: a coach in
-- somebody's team still opens into their own practice, which is where all their
-- existing data is.
INSERT INTO tenant_member (tenant_id, app_user_id, role, status, is_home, created_at)
SELECT tm.tenant_id, au.id, mem.role, mem.status, FALSE, mem.created_at
FROM team_member mem
JOIN team tm      ON tm.id = mem.team_id
JOIN trainer t    ON t.id = mem.trainer_id
JOIN app_user au  ON au.phone = t.phone AND au.deleted_at IS NULL
WHERE mem.deleted_at IS NULL
  AND mem.trainer_id IS NOT NULL
  AND tm.tenant_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- A client is a member of the workspace they are coached in, with role 'client'.
-- That is what makes "the same person under two arrangements" two memberships
-- rather than a special case.
INSERT INTO tenant_member (tenant_id, app_user_id, role, status, is_home, created_at)
SELECT DISTINCT ON (t.home_tenant_id, au.id)
       t.home_tenant_id, au.id, 'client',
       CASE WHEN c.membership_status IN ('removed', 'declined') THEN 'removed' ELSE 'active' END,
       FALSE, c.created_at
FROM client c
JOIN trainer t   ON t.id = c.trainer_id
JOIN app_user au ON au.phone = c.phone AND au.deleted_at IS NULL
WHERE c.deleted_at IS NULL
  AND c.phone IS NOT NULL
  AND t.home_tenant_id IS NOT NULL
ORDER BY t.home_tenant_id, au.id, c.created_at
ON CONFLICT DO NOTHING;

-- Anyone left without a home — somebody who is only ever a client — opens into
-- their earliest membership. Done last, and one row per person, because the
-- partial unique index above allows exactly one.
WITH homeless AS (
    SELECT DISTINCT tmb.app_user_id
    FROM tenant_member tmb
    WHERE tmb.deleted_at IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM tenant_member h
          WHERE h.app_user_id = tmb.app_user_id AND h.is_home AND h.deleted_at IS NULL
      )
), pick AS (
    SELECT DISTINCT ON (tmb.app_user_id) tmb.id
    FROM tenant_member tmb
    JOIN homeless ON homeless.app_user_id = tmb.app_user_id
    WHERE tmb.deleted_at IS NULL AND tmb.status = 'active'
    ORDER BY tmb.app_user_id, tmb.created_at, tmb.id
)
UPDATE tenant_member SET is_home = TRUE
WHERE id IN (SELECT id FROM pick);
