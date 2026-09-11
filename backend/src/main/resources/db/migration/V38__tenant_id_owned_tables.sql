-- V38 — `tenant_id` on every table that carries a `trainer_id`.
--
-- Mechanical, and long. Each table follows the same four steps: add the column
-- nullable, backfill it, make it NOT NULL, index it. Nullable-then-backfill
-- rather than NOT NULL with a DEFAULT, because there is no default that would be
-- right — the correct value is a join away, and a wrong one written by a DEFAULT
-- would be indistinguishable from a right one afterwards.
--
-- Every row here predates tenants, so every one resolves to its trainer's own
-- `solo` workspace (`trainer.home_tenant_id`, V37). Teams and gyms start empty.
--
-- Two things NOT done here, both deliberate:
--
--   * The FK is declared but tenant_id is NOT added to any sync payload. A phone
--     already holds exactly one trainer's slice because the pull filtered it, and
--     `trainer_id` on the device is documented as not being a security boundary.
--     Adding the column to the wire would cost a WatermelonDB migration under a
--     law that forbids ever taking it back, and buy nothing.
--
--   * The existing single-column `idx_*_trainer_id` indexes are NOT dropped. The
--     composite `(tenant_id, trainer_id)` added below supersedes them for the
--     queries RLS will rewrite, but dropping an index a live plan may be using is
--     a separate decision with its own migration (V43, once plans are confirmed).


-- ─── client ───────────────────────────────────────────────────────────────────────────
-- A client belongs to the workspace they were signed up in, and that is
-- what makes the same human under two arrangements two rows in two tenants.
ALTER TABLE client ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE client x SET tenant_id = t.home_tenant_id
FROM trainer t WHERE t.id = x.trainer_id AND x.tenant_id IS NULL;
ALTER TABLE client ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_tenant ON client (tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_tenant_trainer ON client (tenant_id, trainer_id);

-- ─── client_note ──────────────────────────────────────────────────────────────────────
-- The note follows its AUTHOR's workspace. It is tier 2 in V42 — private to
-- the trainer who wrote it, like the money book.
ALTER TABLE client_note ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE client_note x SET tenant_id = t.home_tenant_id
FROM trainer t WHERE t.id = x.trainer_id AND x.tenant_id IS NULL;
ALTER TABLE client_note ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_note_tenant ON client_note (tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_note_tenant_trainer ON client_note (tenant_id, trainer_id);

-- ─── template ─────────────────────────────────────────────────────────────────────────
ALTER TABLE template ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE template x SET tenant_id = t.home_tenant_id
FROM trainer t WHERE t.id = x.trainer_id AND x.tenant_id IS NULL;
ALTER TABLE template ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_template_tenant ON template (tenant_id);
CREATE INDEX IF NOT EXISTS idx_template_tenant_trainer ON template (tenant_id, trainer_id);

-- ─── program ──────────────────────────────────────────────────────────────────────────
ALTER TABLE program ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE program x SET tenant_id = t.home_tenant_id
FROM trainer t WHERE t.id = x.trainer_id AND x.tenant_id IS NULL;
ALTER TABLE program ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_program_tenant ON program (tenant_id);
CREATE INDEX IF NOT EXISTS idx_program_tenant_trainer ON program (tenant_id, trainer_id);

-- ─── scheduled_session ────────────────────────────────────────────────────────────────
ALTER TABLE scheduled_session ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE scheduled_session x SET tenant_id = t.home_tenant_id
FROM trainer t WHERE t.id = x.trainer_id AND x.tenant_id IS NULL;
ALTER TABLE scheduled_session ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scheduled_session_tenant ON scheduled_session (tenant_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_session_tenant_trainer ON scheduled_session (tenant_id, trainer_id);

-- ─── working_hours ────────────────────────────────────────────────────────────────────
ALTER TABLE working_hours ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE working_hours x SET tenant_id = t.home_tenant_id
FROM trainer t WHERE t.id = x.trainer_id AND x.tenant_id IS NULL;
ALTER TABLE working_hours ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_working_hours_tenant ON working_hours (tenant_id);
CREATE INDEX IF NOT EXISTS idx_working_hours_tenant_trainer ON working_hours (tenant_id, trainer_id);

-- ─── time_block ───────────────────────────────────────────────────────────────────────
ALTER TABLE time_block ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE time_block x SET tenant_id = t.home_tenant_id
FROM trainer t WHERE t.id = x.trainer_id AND x.tenant_id IS NULL;
ALTER TABLE time_block ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_time_block_tenant ON time_block (tenant_id);
CREATE INDEX IF NOT EXISTS idx_time_block_tenant_trainer ON time_block (tenant_id, trainer_id);

-- ─── batch ────────────────────────────────────────────────────────────────────────────
ALTER TABLE batch ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE batch x SET tenant_id = t.home_tenant_id
FROM trainer t WHERE t.id = x.trainer_id AND x.tenant_id IS NULL;
ALTER TABLE batch ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_batch_tenant ON batch (tenant_id);
CREATE INDEX IF NOT EXISTS idx_batch_tenant_trainer ON batch (tenant_id, trainer_id);

-- ─── workout_session ──────────────────────────────────────────────────────────────────
ALTER TABLE workout_session ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE workout_session x SET tenant_id = t.home_tenant_id
FROM trainer t WHERE t.id = x.trainer_id AND x.tenant_id IS NULL;
ALTER TABLE workout_session ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workout_session_tenant ON workout_session (tenant_id);
CREATE INDEX IF NOT EXISTS idx_workout_session_tenant_trainer ON workout_session (tenant_id, trainer_id);

-- ─── pack ─────────────────────────────────────────────────────────────────────────────
-- The price list. Money, so tier 2 — a gym's prices are not a coach's.
ALTER TABLE pack ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE pack x SET tenant_id = t.home_tenant_id
FROM trainer t WHERE t.id = x.trainer_id AND x.tenant_id IS NULL;
ALTER TABLE pack ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pack_tenant ON pack (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pack_tenant_trainer ON pack (tenant_id, trainer_id);

-- ─── package ──────────────────────────────────────────────────────────────────────────
-- Money. Tier 2 in V42: readable only while standing in this workspace.
ALTER TABLE package ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE package x SET tenant_id = t.home_tenant_id
FROM trainer t WHERE t.id = x.trainer_id AND x.tenant_id IS NULL;
ALTER TABLE package ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_package_tenant ON package (tenant_id);
CREATE INDEX IF NOT EXISTS idx_package_tenant_trainer ON package (tenant_id, trainer_id);

-- ─── package_adjustment ───────────────────────────────────────────────────────────────
-- Money.
ALTER TABLE package_adjustment ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE package_adjustment x SET tenant_id = t.home_tenant_id
FROM trainer t WHERE t.id = x.trainer_id AND x.tenant_id IS NULL;
ALTER TABLE package_adjustment ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_package_adjustment_tenant ON package_adjustment (tenant_id);
CREATE INDEX IF NOT EXISTS idx_package_adjustment_tenant_trainer ON package_adjustment (tenant_id, trainer_id);

-- ─── payment ──────────────────────────────────────────────────────────────────────────
-- Money. Tier 2 in V42.
ALTER TABLE payment ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE payment x SET tenant_id = t.home_tenant_id
FROM trainer t WHERE t.id = x.trainer_id AND x.tenant_id IS NULL;
ALTER TABLE payment ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_tenant ON payment (tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_tenant_trainer ON payment (tenant_id, trainer_id);

-- ─── gym_settlement ───────────────────────────────────────────────────────────────────
-- Money.
ALTER TABLE gym_settlement ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE gym_settlement x SET tenant_id = t.home_tenant_id
FROM trainer t WHERE t.id = x.trainer_id AND x.tenant_id IS NULL;
ALTER TABLE gym_settlement ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gym_settlement_tenant ON gym_settlement (tenant_id);
CREATE INDEX IF NOT EXISTS idx_gym_settlement_tenant_trainer ON gym_settlement (tenant_id, trainer_id);

-- ─── nudge_rule ───────────────────────────────────────────────────────────────────────
ALTER TABLE nudge_rule ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE nudge_rule x SET tenant_id = t.home_tenant_id
FROM trainer t WHERE t.id = x.trainer_id AND x.tenant_id IS NULL;
ALTER TABLE nudge_rule ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nudge_rule_tenant ON nudge_rule (tenant_id);
CREATE INDEX IF NOT EXISTS idx_nudge_rule_tenant_trainer ON nudge_rule (tenant_id, trainer_id);

-- ─── nudge_log ────────────────────────────────────────────────────────────────────────
-- The once-per-client-per-7-days cap is computed per `client` ROW, and the
-- same human in two tenants is two client rows — so two arrangements can each
-- send in one week. That is correct: two coaches, two relationships.
ALTER TABLE nudge_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE nudge_log x SET tenant_id = t.home_tenant_id
FROM trainer t WHERE t.id = x.trainer_id AND x.tenant_id IS NULL;
ALTER TABLE nudge_log ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nudge_log_tenant ON nudge_log (tenant_id);
CREATE INDEX IF NOT EXISTS idx_nudge_log_tenant_trainer ON nudge_log (tenant_id, trainer_id);

-- ─── nudge_template ───────────────────────────────────────────────────────────────────
ALTER TABLE nudge_template ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE nudge_template x SET tenant_id = t.home_tenant_id
FROM trainer t WHERE t.id = x.trainer_id AND x.tenant_id IS NULL;
ALTER TABLE nudge_template ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nudge_template_tenant ON nudge_template (tenant_id);
CREATE INDEX IF NOT EXISTS idx_nudge_template_tenant_trainer ON nudge_template (tenant_id, trainer_id);

-- ─── weekly_report ────────────────────────────────────────────────────────────────────
ALTER TABLE weekly_report ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE weekly_report x SET tenant_id = t.home_tenant_id
FROM trainer t WHERE t.id = x.trainer_id AND x.tenant_id IS NULL;
ALTER TABLE weekly_report ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_weekly_report_tenant ON weekly_report (tenant_id);
CREATE INDEX IF NOT EXISTS idx_weekly_report_tenant_trainer ON weekly_report (tenant_id, trainer_id);

-- ─── attention_dismissal ──────────────────────────────────────────────────────────────
ALTER TABLE attention_dismissal ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE attention_dismissal x SET tenant_id = t.home_tenant_id
FROM trainer t WHERE t.id = x.trainer_id AND x.tenant_id IS NULL;
ALTER TABLE attention_dismissal ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attention_dismissal_tenant ON attention_dismissal (tenant_id);
CREATE INDEX IF NOT EXISTS idx_attention_dismissal_tenant_trainer ON attention_dismissal (tenant_id, trainer_id);

-- ─── exercise_favourite ───────────────────────────────────────────────────────────────
ALTER TABLE exercise_favourite ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE exercise_favourite x SET tenant_id = t.home_tenant_id
FROM trainer t WHERE t.id = x.trainer_id AND x.tenant_id IS NULL;
ALTER TABLE exercise_favourite ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exercise_favourite_tenant ON exercise_favourite (tenant_id);
CREATE INDEX IF NOT EXISTS idx_exercise_favourite_tenant_trainer ON exercise_favourite (tenant_id, trainer_id);


-- ─── the team tables ─────────────────────────────────────────────────────────
--
-- These four carry the TEAM's tenant, not a coach's. That is what lets a coach
-- be removed with a single `team_member` update and no cascade into client data:
-- the permission rows live in the team's workspace, the client rows never did.

-- ─── team_member ──────────────────────────────────────────────────────────────────────
ALTER TABLE team_member ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE team_member x SET tenant_id = tm.tenant_id
FROM team tm WHERE tm.id = x.team_id AND x.tenant_id IS NULL;
ALTER TABLE team_member ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_team_member_tenant ON team_member (tenant_id);

-- ─── client_assignment ────────────────────────────────────────────────────────────────
ALTER TABLE client_assignment ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE client_assignment x SET tenant_id = tm.tenant_id
FROM team tm WHERE tm.id = x.team_id AND x.tenant_id IS NULL;
ALTER TABLE client_assignment ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_assignment_tenant ON client_assignment (tenant_id);

-- ─── team_activity ────────────────────────────────────────────────────────────────────
ALTER TABLE team_activity ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE team_activity x SET tenant_id = tm.tenant_id
FROM team tm WHERE tm.id = x.team_id AND x.tenant_id IS NULL;
ALTER TABLE team_activity ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_team_activity_tenant ON team_activity (tenant_id);


-- ─── one constraint relaxed, and why it is not a repurposing ─────────────────
--
-- `client_assignment.team_id` was NOT NULL because reassignment only existed
-- inside a team. A gym reassigns too, and a gym is not a team — there is no
-- `team` row to point at. The column keeps its exact meaning ("the team this
-- happened in, if it was a team"); it simply becomes answerable with "none".
--
-- Nothing reads it that would break: `client_assignment` is a server-side audit
-- log and tombstone source, not a sync collection, so no phone holds a copy that
-- could meet a NULL it did not expect. `tenant_id` above is NOT NULL and is now
-- the column that always answers "where did this happen".
ALTER TABLE client_assignment ALTER COLUMN team_id DROP NOT NULL;
