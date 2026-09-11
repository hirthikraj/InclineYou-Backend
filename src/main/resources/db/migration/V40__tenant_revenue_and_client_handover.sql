-- V40 — who is paid what, and what happens to a client whose coach walks away.
--
-- Two features that look unrelated and are the same feature: a workspace with
-- more than one person in it has to answer "whose money is this" and "whose
-- client is this now", and both answers have to survive somebody leaving.

-- ─── the margin, frozen onto the assignment ──────────────────────────────────
--
-- `tenant_member.assignment_margin_percent` (V37) is the admin's CURRENT rate.
-- This is the rate that applied to THIS handover, copied at the moment it
-- happened — the same argument V11 made for freezing `share_percent` onto a
-- payment instead of reading the trainer's live setting: an admin who renegotiates
-- in March must not silently restate what they earned in January.
ALTER TABLE client_assignment
    ADD COLUMN IF NOT EXISTS actor_margin_percent NUMERIC(5,2);

-- Why the handover happened, in the log as well as on the row. 'trainer_left'
-- and 'trainer_unavailable' are the two the product creates; 'manual' is an
-- admin moving a client for any other reason, which is the majority case and
-- must not be made to look like an incident.
ALTER TABLE client_assignment
    ADD COLUMN IF NOT EXISTS reason VARCHAR(40);

-- ─── a client whose coach is gone ────────────────────────────────────────────
--
-- `stale_at` is a COLUMN and not a `status` value, and that is a decision worth
-- reading twice. V30 made the same call for `paused_at` and gave the reason: a
-- new value in `status` changes what every existing `WHERE status = 'active'`
-- read returns, on the server AND on every phone already in the field that has
-- never heard of it. A stale client is still an active client — they are still
-- paying, still owed sessions, still on the roster. What is missing is a coach.
--
-- So: nothing that reads `status` changes behaviour, and the one screen that
-- cares reads `stale_at IS NOT NULL`.
ALTER TABLE client
    ADD COLUMN IF NOT EXISTS stale_at TIMESTAMPTZ;

-- 'trainer_left' | 'trainer_unavailable' | 'manual'. Free VARCHAR validated in
-- code, per the schema's convention.
ALTER TABLE client
    ADD COLUMN IF NOT EXISTS stale_reason VARCHAR(40);

-- Who put this client with this coach. The admin who earns the margin, and the
-- person a "why am I coaching them" question goes to.
--
-- An `app_user`, not a `trainer`: in a gym the person doing the assigning may be
-- an administrator who does not coach and therefore has no `trainer` row at all.
-- That is the first place in this schema where the actor is a person rather than
-- a coach, and it is the shape every gym-side actor will take.
ALTER TABLE client
    ADD COLUMN IF NOT EXISTS assigned_by_app_user_id UUID REFERENCES app_user(id);

ALTER TABLE client
    ADD COLUMN IF NOT EXISTS assignment_margin_percent NUMERIC(5,2);

ALTER TABLE client
    ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

-- The queue the handover screen is: everyone in this workspace with no working
-- coach. Partial, because it is a small set inside a large table and it should
-- stay small — a workspace where this index is big has a problem the index is
-- not going to fix.
CREATE INDEX IF NOT EXISTS idx_client_stale
    ON client (tenant_id, stale_at)
    WHERE stale_at IS NOT NULL AND deleted_at IS NULL;

-- ─── what a coach keeps ──────────────────────────────────────────────────────
--
-- `tenant_member.revenue_share_percent` (V37) is the coach's cut of what they
-- collect in that workspace. It is NULL for every existing membership, and NULL
-- means all of it — which is the only correct answer for a solo tenant and the
-- only safe one for a team that has not yet had the conversation.
--
-- Three percentages now exist and they are not the same number. Naming them here
-- because the next person to add a fourth needs to know:
--
--   trainer.gym_share_percent          what a gym that is NOT on XRep keeps of a
--                                      floor session. The trainer's own
--                                      transcription of a deal we cannot see.
--   client.trainer_split_percent       a per-client override of the above.
--   tenant_member.revenue_share_percent what a coach keeps inside a workspace
--                                      that IS on XRep, which is a real
--                                      membership rather than a hint.
--
-- The first two are V11's "defaults hint" and must never gate a feature (V23).
-- The third is authoritative, because both parties agreed to it inside a tenant
-- they both belong to.
COMMENT ON COLUMN tenant_member.revenue_share_percent IS
'What this member keeps of what they collect in this workspace. NULL = 100%, which is the correct default for a solo tenant.';

COMMENT ON COLUMN tenant_member.assignment_margin_percent IS
'An admin''s cut of revenue from clients they assigned to somebody else. NULL = none. Frozen per handover onto client_assignment.actor_margin_percent.';
