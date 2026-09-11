-- V42 — row level security. The cutover.
--
-- Everything before this migration was additive and inert. This one changes how
-- every query in the product resolves — but only for connections made as
-- `xrep_app`, which nothing uses until the connection string moves. So the
-- deploy that turns this on is a configuration change, revertible in one push,
-- and not a migration rollback.
--
-- ── Why this exists when 383 queries already filter by trainer_id ────────────
--
-- Because 383 places to remember is 383 places to forget, and one forgotten
-- `AND trainer_id` is a cross-customer disclosure that no test, review or type
-- would catch. RLS makes the predicate implicit: the planner applies it whether
-- or not the author thought about it.
--
-- The application filters STAY. This is the backstop, not the replacement. A
-- forgotten filter now returns empty instead of somebody else's rows, which
-- surfaces as the 404 this codebase already documents for a wrong id.
--
-- ── Why there is no FORCE ROW LEVEL SECURITY ─────────────────────────────────
--
-- Because it would apply to the table OWNER, and the owner is Flyway. Every
-- future migration that backfills a column across all tenants, and all three seed
-- scripts, would silently see nothing and quietly do nothing — the worst
-- available failure, because it succeeds. Isolation comes from the app connecting
-- as a role that does not own the tables, which is the same guarantee by a
-- mechanism that cannot take the migrations down with it.
--
-- ── The four tiers ──────────────────────────────────────────────────────────
--
--   1  my workspaces      tenant_id = ANY (app_tenant_ids())    coaching tables
--   2  active workspace   tenant_id = app_tenant_id()           money, private notes
--   3  catalogue          tenant_id IS NULL OR in my workspaces exercise
--   4  client lens        client_id = ANY (app_client_ids())    what a client owns
--
-- Tier 2 is the money wall, and it is deliberately NOT keyed on trainer_id. In a
-- gym the collector of record is the gym, so its administrators must be able to
-- read payments whose trainer_id is a coach — a trainer_id predicate would block
-- exactly the person who banked the money. The database's rule is "money belongs
-- to one workspace and you must be standing in it"; who inside that workspace may
-- see whose is an application question, answered in TenantRevenueService.
--
-- Tiers 1 and 4 are both PERMISSIVE and therefore OR together, which is correct:
-- a client legitimately reads rows in a workspace they are not staff of.

-- ─── the runtime role ────────────────────────────────────────────────────────
--
-- Wrapped in a DO block because a managed Postgres may not grant CREATEROLE to
-- the migration user. If it cannot be created here it is an ops step; the
-- policies below are still correct, they simply have nobody to apply to yet.
DO $$
BEGIN
    BEGIN
        -- The password is a Flyway placeholder, so a real deployment sets
        -- APP_DB_PASSWORD and never has a credential in version control.
        -- The default is a local-development value and is worthless
        -- anywhere the database is not already on localhost.
        --
        -- The password is set whether or not the role already exists. A role
        -- is a property of the CLUSTER, not of a database, so it outlives
        -- DROP DATABASE: a `CREATE ROLE` guarded by IF NOT EXISTS would run
        -- once on the first database ever built on that server and then be
        -- skipped forever, leaving every later APP_DB_PASSWORD silently
        -- ineffective and the app unable to log in.
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'xrep_app') THEN
            EXECUTE format('CREATE ROLE xrep_app LOGIN PASSWORD %L', '${appRolePassword}');
        ELSE
            EXECUTE format('ALTER ROLE xrep_app LOGIN PASSWORD %L', '${appRolePassword}');
        END IF;
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE WARNING 'could not create or alter role xrep_app — create it manually, then re-run the grants in V42';
    END;
END $$;

DO $$
BEGIN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO xrep_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO xrep_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO xrep_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public
             GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO xrep_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role xrep_app is absent — grants skipped';
END $$;

-- Flyway's own history table must stay readable to nobody but the owner.
DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON flyway_schema_history FROM xrep_app';
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL;
END $$;

-- ─── who is asking ───────────────────────────────────────────────────────────
--
-- 'staff' — a trainer, admin or gym user acting inside a workspace.
-- 'client' — somebody reading their own training through the client lens.
--
-- Set explicitly by `TenantAwareDataSource` rather than inferred from whether
-- some other setting is empty, because a policy that guesses the actor is a
-- policy that guesses wrong once. Unset returns '', which matches neither tier.
CREATE OR REPLACE FUNCTION app_actor() RETURNS text
LANGUAGE sql STABLE AS
$$ SELECT COALESCE(NULLIF(current_setting('app.actor', true), ''), '') $$;

-- The number that was proved, and the answer to a chicken-and-egg problem.
--
-- `app.tenant_ids` is what tier 1 filters on — but it is itself computed by
-- READING `tenant_member`, which is tier 1. A caller with no workspaces yet
-- could never discover the workspaces they belong to.
--
-- So authentication sets one more thing: the phone it just proved. It is the
-- only identity fact that exists before any workspace is known, and the two
-- SELECT-only policies below use it to let a person find their own memberships
-- and nothing else. Deliberately `FOR SELECT` — discovering a membership must
-- never be a way to write one.
CREATE OR REPLACE FUNCTION app_phone() RETURNS text
LANGUAGE sql STABLE AS
$$ SELECT COALESCE(NULLIF(current_setting('app.phone', true), ''), '') $$;


-- ─── tier 1 — my workspaces ──────────────────────────────────────────────────
--
-- READ across every workspace this person belongs to, so one trainer sees one
-- working day even when their 07:00 is private and their 18:00 is a gym client.
-- WRITE into the ACTIVE one only, which is what `app_tenant_id()` in the check
-- clause says: you may look across, you may only put things down where you
-- are standing.

ALTER TABLE client ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_tenant ON client;
CREATE POLICY client_tenant ON client FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE template ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS template_tenant ON template;
CREATE POLICY template_tenant ON template FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE program ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_tenant ON program;
CREATE POLICY program_tenant ON program FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE program_exercise ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_exercise_tenant ON program_exercise;
CREATE POLICY program_exercise_tenant ON program_exercise FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE scheduled_session ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scheduled_session_tenant ON scheduled_session;
CREATE POLICY scheduled_session_tenant ON scheduled_session FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE working_hours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS working_hours_tenant ON working_hours;
CREATE POLICY working_hours_tenant ON working_hours FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE time_block ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS time_block_tenant ON time_block;
CREATE POLICY time_block_tenant ON time_block FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE batch ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS batch_tenant ON batch;
CREATE POLICY batch_tenant ON batch FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE workout_session ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workout_session_tenant ON workout_session;
CREATE POLICY workout_session_tenant ON workout_session FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE workout_exercise ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workout_exercise_tenant ON workout_exercise;
CREATE POLICY workout_exercise_tenant ON workout_exercise FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE set_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS set_log_tenant ON set_log;
CREATE POLICY set_log_tenant ON set_log FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE body_metric ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS body_metric_tenant ON body_metric;
CREATE POLICY body_metric_tenant ON body_metric FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE nudge_rule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nudge_rule_tenant ON nudge_rule;
CREATE POLICY nudge_rule_tenant ON nudge_rule FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE nudge_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nudge_log_tenant ON nudge_log;
CREATE POLICY nudge_log_tenant ON nudge_log FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE nudge_template ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nudge_template_tenant ON nudge_template;
CREATE POLICY nudge_template_tenant ON nudge_template FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE weekly_report ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS weekly_report_tenant ON weekly_report;
CREATE POLICY weekly_report_tenant ON weekly_report FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE attention_dismissal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attention_dismissal_tenant ON attention_dismissal;
CREATE POLICY attention_dismissal_tenant ON attention_dismissal FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE exercise_favourite ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exercise_favourite_tenant ON exercise_favourite;
CREATE POLICY exercise_favourite_tenant ON exercise_favourite FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE team ENABLE ROW LEVEL SECURITY;
-- ─── writing into a workspace you own ────────────────────────────────────────
--
-- Creating a team CREATES a workspace: `ensure_team_tenant` (V39) mints a
-- `team`-type tenant in a BEFORE INSERT trigger and stamps the row with it.
-- That tenant is by definition not the caller's ACTIVE one — they were sitting
-- in their own practice a microsecond ago, and the membership that would put it
-- in `app.tenant_ids` is written by a trigger that has not fired yet. A
-- WITH CHECK of `tenant_id = app_tenant_id()` therefore refuses the one insert
-- that every team begins with, and no trainer could ever create a team.
--
-- The rule that fixes it is a real one rather than a hole: you may write into a
-- workspace you OWN, whether or not it is the one you are looking at. For an
-- ordinary trainer that is their own solo tenant, so this widens nothing; it
-- only admits the moment a workspace comes into existence.
--
-- SECURITY DEFINER because it reads `tenant`, whose own policy is keyed on
-- membership — the membership this insert is in the middle of creating.
-- VOLATILE, not STABLE, and that is the whole reason this works. The workspace
-- is created by a BEFORE INSERT trigger on `team`, so by the time the WITH CHECK
-- runs it exists — but only in a version of the transaction newer than the
-- snapshot the outer INSERT took. A STABLE function reuses that snapshot and
-- cannot see the row it is being asked about, so the check fails on the one case
-- it exists for. VOLATILE takes a fresh one per call.
CREATE OR REPLACE FUNCTION app_owns_tenant(target uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
    SELECT EXISTS (
        SELECT 1 FROM tenant t
        JOIN app_user au ON au.id = t.primary_app_user_id
        WHERE t.id = target
          AND au.phone = app_phone()
          AND au.deleted_at IS NULL
          AND t.deleted_at IS NULL
    );
$$;

DROP POLICY IF EXISTS team_tenant ON team;
CREATE POLICY team_tenant ON team FOR ALL TO xrep_app
    -- The read side needs the same widening as the write side, and for
    -- the same moment: `app.tenant_ids` was computed when the request
    -- began, so a workspace created DURING the request is not in it.
    -- Without this the insert succeeds and the read-back that every
    -- create does to return the new row finds nothing — a 500 on the
    -- happy path.
    USING (app_actor() = 'staff'
           AND (tenant_id = ANY (app_tenant_ids()) OR app_owns_tenant(tenant_id)))
    WITH CHECK (app_actor() = 'staff'
                AND (tenant_id = app_tenant_id() OR app_owns_tenant(tenant_id)));

ALTER TABLE team_member ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS team_member_tenant ON team_member;
CREATE POLICY team_member_tenant ON team_member FOR ALL TO xrep_app
    -- The read side needs the same widening as the write side, and for
    -- the same moment: `app.tenant_ids` was computed when the request
    -- began, so a workspace created DURING the request is not in it.
    -- Without this the insert succeeds and the read-back that every
    -- create does to return the new row finds nothing — a 500 on the
    -- happy path.
    USING (app_actor() = 'staff'
           AND (tenant_id = ANY (app_tenant_ids()) OR app_owns_tenant(tenant_id)))
    WITH CHECK (app_actor() = 'staff'
                AND (tenant_id = app_tenant_id() OR app_owns_tenant(tenant_id)));

ALTER TABLE client_assignment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_assignment_tenant ON client_assignment;
CREATE POLICY client_assignment_tenant ON client_assignment FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE team_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS team_activity_tenant ON team_activity;
CREATE POLICY team_activity_tenant ON team_activity FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE tenant_member ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_member_tenant ON tenant_member;
CREATE POLICY tenant_member_tenant ON tenant_member FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());


-- ─── tier 2 — the money wall ─────────────────────────────────────────────────
--
-- One workspace, singular, for read as well as write. A trainer switching to
-- their private practice stops seeing the gym's takings in the same moment the
-- switcher moves, and a total is therefore never a mix of two businesses.
--
-- `client_note` is here rather than in tier 1 for the reason SCHEMA.md gives it
-- a trainer_id at all: it is what somebody wrote about a person, and it is not
-- widened by anything.

ALTER TABLE pack ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pack_tenant ON pack;
CREATE POLICY pack_tenant ON pack FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = app_tenant_id())
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE package ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS package_tenant ON package;
CREATE POLICY package_tenant ON package FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = app_tenant_id())
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE package_adjustment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS package_adjustment_tenant ON package_adjustment;
CREATE POLICY package_adjustment_tenant ON package_adjustment FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = app_tenant_id())
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE payment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_tenant ON payment;
CREATE POLICY payment_tenant ON payment FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = app_tenant_id())
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE gym_settlement ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gym_settlement_tenant ON gym_settlement;
CREATE POLICY gym_settlement_tenant ON gym_settlement FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = app_tenant_id())
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());

ALTER TABLE client_note ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_note_tenant ON client_note;
CREATE POLICY client_note_tenant ON client_note FOR ALL TO xrep_app
    USING (app_actor() = 'staff' AND tenant_id = app_tenant_id())
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());


-- ─── tier 3 — the catalogue ──────────────────────────────────────────────────
--
-- NULL means the shared library: seeded, owned by nobody, readable by everyone
-- including a client reading their own plan. A custom exercise belongs to the
-- workspace it was written in.
--
-- No `app_actor()` guard, and that is deliberate — this is the one table both
-- kinds of caller read the same way.
ALTER TABLE exercise ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exercise_catalogue ON exercise;
CREATE POLICY exercise_catalogue ON exercise FOR ALL TO xrep_app
    USING (tenant_id IS NULL OR tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (tenant_id IS NULL OR tenant_id = app_tenant_id());

-- ─── the workspace rows themselves ───────────────────────────────────────────
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_self ON tenant;
CREATE POLICY tenant_self ON tenant FOR ALL TO xrep_app
    USING (id = ANY (app_tenant_ids()))
    WITH CHECK (id = ANY (app_tenant_ids()));

-- ─── bootstrap: finding your own memberships ─────────────────────────────────
--
-- Read-only, keyed on the proved phone, and narrow enough that it grants nothing
-- but the answer to "where do I belong". Without these two the tier-1 policies
-- above are unreachable, because the set they filter on is stored in a table
-- they filter.
DROP POLICY IF EXISTS tenant_member_self ON tenant_member;
CREATE POLICY tenant_member_self ON tenant_member FOR SELECT TO xrep_app
    USING (app_phone() <> '' AND app_user_id IN (
        SELECT au.id FROM app_user au
        WHERE au.phone = app_phone() AND au.deleted_at IS NULL));

DROP POLICY IF EXISTS tenant_mine ON tenant;
CREATE POLICY tenant_mine ON tenant FOR SELECT TO xrep_app
    USING (app_phone() <> '' AND id IN (
        SELECT tm.tenant_id FROM tenant_member tm
        JOIN app_user au ON au.id = tm.app_user_id
        WHERE au.phone = app_phone()
          AND au.deleted_at IS NULL
          AND tm.deleted_at IS NULL
          AND tm.status = 'active'));


-- ─── tier 4 — the client lens ────────────────────────────────────────────────
--
-- A client is not staff of anything and gets no tier-1 or tier-2 access at all;
-- what they get is their OWN rows, across every roster they are on. The set is
-- plural because the same person under two arrangements is two client rows —
-- which is the requirement this whole design exists to serve.
--
-- Four of these are EXISTS subqueries because the table has no `client_id` to
-- compare. That cost is paid ONLY on client-role requests, which read one
-- person's own history; the trainer-side hot paths use tier 1, which is an index
-- lookup on `tenant_id`. Giving `set_log` a `client_id` purely to flatten this
-- policy would denormalise a hot table for the benefit of the cold path.

DROP POLICY IF EXISTS client_client ON client;
CREATE POLICY client_client ON client FOR ALL TO xrep_app
    USING (app_actor() = 'client' AND id = ANY (app_client_ids()))
    WITH CHECK (app_actor() = 'client' AND id = ANY (app_client_ids()));

DROP POLICY IF EXISTS body_metric_client ON body_metric;
CREATE POLICY body_metric_client ON body_metric FOR ALL TO xrep_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids()))
    WITH CHECK (app_actor() = 'client' AND client_id = ANY (app_client_ids()));

DROP POLICY IF EXISTS program_client ON program;
CREATE POLICY program_client ON program FOR ALL TO xrep_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids()))
    WITH CHECK (app_actor() = 'client' AND client_id = ANY (app_client_ids()));

DROP POLICY IF EXISTS scheduled_session_client ON scheduled_session;
CREATE POLICY scheduled_session_client ON scheduled_session FOR ALL TO xrep_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids()))
    WITH CHECK (app_actor() = 'client' AND client_id = ANY (app_client_ids()));

DROP POLICY IF EXISTS workout_session_client ON workout_session;
CREATE POLICY workout_session_client ON workout_session FOR ALL TO xrep_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids()))
    WITH CHECK (app_actor() = 'client' AND client_id = ANY (app_client_ids()));

DROP POLICY IF EXISTS weekly_report_client ON weekly_report;
CREATE POLICY weekly_report_client ON weekly_report FOR ALL TO xrep_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids()))
    WITH CHECK (app_actor() = 'client' AND client_id = ANY (app_client_ids()));

DROP POLICY IF EXISTS package_client ON package;
CREATE POLICY package_client ON package FOR ALL TO xrep_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids()))
    WITH CHECK (app_actor() = 'client' AND client_id = ANY (app_client_ids()));

DROP POLICY IF EXISTS payment_client ON payment;
CREATE POLICY payment_client ON payment FOR ALL TO xrep_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids()))
    WITH CHECK (app_actor() = 'client' AND client_id = ANY (app_client_ids()));

DROP POLICY IF EXISTS program_exercise_client ON program_exercise;
CREATE POLICY program_exercise_client ON program_exercise FOR ALL TO xrep_app
    USING (app_actor() = 'client' AND EXISTS (SELECT 1 FROM program p
                 WHERE p.id = program_exercise.program_id
                   AND p.client_id = ANY (app_client_ids())))
    WITH CHECK (app_actor() = 'client' AND EXISTS (SELECT 1 FROM program p
                 WHERE p.id = program_exercise.program_id
                   AND p.client_id = ANY (app_client_ids())));

DROP POLICY IF EXISTS workout_exercise_client ON workout_exercise;
CREATE POLICY workout_exercise_client ON workout_exercise FOR ALL TO xrep_app
    USING (app_actor() = 'client' AND EXISTS (SELECT 1 FROM workout_session w
                 WHERE w.id = workout_exercise.workout_session_id
                   AND w.client_id = ANY (app_client_ids())))
    WITH CHECK (app_actor() = 'client' AND EXISTS (SELECT 1 FROM workout_session w
                 WHERE w.id = workout_exercise.workout_session_id
                   AND w.client_id = ANY (app_client_ids())));

DROP POLICY IF EXISTS set_log_client ON set_log;
CREATE POLICY set_log_client ON set_log FOR ALL TO xrep_app
    USING (app_actor() = 'client' AND EXISTS (SELECT 1 FROM workout_session w
                 WHERE w.id = set_log.workout_session_id
                   AND w.client_id = ANY (app_client_ids())))
    WITH CHECK (app_actor() = 'client' AND EXISTS (SELECT 1 FROM workout_session w
                 WHERE w.id = set_log.workout_session_id
                   AND w.client_id = ANY (app_client_ids())));

DROP POLICY IF EXISTS template_client ON template;
CREATE POLICY template_client ON template FOR ALL TO xrep_app
    USING (app_actor() = 'client' AND EXISTS (SELECT 1 FROM program p
                 WHERE p.template_id = template.id
                   AND p.client_id = ANY (app_client_ids())))
    WITH CHECK (app_actor() = 'client' AND EXISTS (SELECT 1 FROM program p
                 WHERE p.template_id = template.id
                   AND p.client_id = ANY (app_client_ids())));


-- ─── what is deliberately NOT policied ───────────────────────────────────────
--
--   app_user      a PERSON, not a workspace. The whole requirement is that one
--                 person spans tenants, so a policy here would have to pick one
--                 and be wrong. Reached pre-authentication.
--   trainer       an identity and a public-facing profile. V33-V35 built it for
--                 an audience wider than any one tenant — the person deciding
--                 whether to accept an invite — and it is scoped in app code.
--   otp_request   pre-authentication by definition; there is no tenant yet when
--                 the row is written.
--   web_session   authentication state, consulted BEFORE a tenant context exists.
--                 A policy on it would have to be satisfied by the very context
--                 it is being read to establish.
--
-- All four are guarded by application code and by not being reachable with a
-- caller-supplied key. Any new table that is not in one of the four tiers above
-- must be added to this list with its reason, or it is an oversight.
