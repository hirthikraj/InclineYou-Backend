-- V39 — the four tables that had no owner at all, plus the catalogue, plus the
-- two triggers that make `tenant_id` mean what this design says it means.
--
-- `set_log`, `program_exercise` and `workout_exercise` have carried no ownership
-- column since V1 — they are reachable only by joining a parent, which is why
-- `ProgressService` checks ownership once at the gate and then filters on
-- `client_id` alone. That was survivable while a filter was all there was. It is
-- not survivable under RLS: a policy on a table with no owner column has to be an
-- `EXISTS` subquery, evaluated per row, on exactly the three tables the progress
-- and workout-log queries scan hardest. So they get a real column.
--
-- `body_metric` is the fourth: it has a `client_id` and deliberately no
-- `trainer_id` (V1 — "ownership is reached through the client"). Same treatment,
-- same reason.

-- ─── body_metric — via its client ────────────────────────────────────────────
ALTER TABLE body_metric ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE body_metric x SET tenant_id = c.tenant_id
FROM client c WHERE c.id = x.client_id AND x.tenant_id IS NULL;
ALTER TABLE body_metric ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_body_metric_tenant ON body_metric (tenant_id);

-- ─── program_exercise — via its program ──────────────────────────────────────
ALTER TABLE program_exercise ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE program_exercise x SET tenant_id = p.tenant_id
FROM program p WHERE p.id = x.program_id AND x.tenant_id IS NULL;
ALTER TABLE program_exercise ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_program_exercise_tenant ON program_exercise (tenant_id);

-- ─── workout_exercise — via its session ──────────────────────────────────────
ALTER TABLE workout_exercise ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE workout_exercise x SET tenant_id = w.tenant_id
FROM workout_session w WHERE w.id = x.workout_session_id AND x.tenant_id IS NULL;
ALTER TABLE workout_exercise ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workout_exercise_tenant ON workout_exercise (tenant_id);

-- ─── set_log — via its session ───────────────────────────────────────────────
ALTER TABLE set_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE set_log x SET tenant_id = w.tenant_id
FROM workout_session w WHERE w.id = x.workout_session_id AND x.tenant_id IS NULL;
ALTER TABLE set_log ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_set_log_tenant ON set_log (tenant_id);

-- ─── exercise — the one nullable tenant column in the schema ─────────────────
--
-- NULL means THE SHARED CATALOGUE: the seeded library, readable by every tenant
-- and owned by none. Only `is_custom` rows get a tenant, and a custom exercise
-- written in a gym belongs to the gym — it does not follow the trainer back to
-- their private practice, because the person who typed it was being paid by the
-- gym at the time.
ALTER TABLE exercise ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id);
UPDATE exercise x SET tenant_id = t.home_tenant_id
FROM trainer t
WHERE t.id = x.trainer_id AND x.is_custom AND x.tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_exercise_tenant ON exercise (tenant_id) WHERE tenant_id IS NOT NULL;

-- ─── the request's identity, read from session state ─────────────────────────
--
-- Four settings, set by the application on every connection borrow (see
-- `TenantAwareDataSource`). Each helper is STABLE so the planner may hoist it out
-- of a scan, and each uses the two-argument `current_setting(..., true)` so an
-- UNSET value is NULL rather than an error.
--
-- NULL is the whole safety property: `tenant_id = NULL` is not true, it is
-- unknown, so a policy comparing against an unset setting matches NOTHING. A
-- context that failed to be set STARVES a query. It must never widen one.

CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

COMMENT ON FUNCTION app_tenant_id() IS
'The ACTIVE workspace: where writes land and how far the money book reads. Always exactly one.';

CREATE OR REPLACE FUNCTION app_tenant_ids() RETURNS uuid[]
LANGUAGE sql STABLE AS
$$ SELECT COALESCE(
       NULLIF(current_setting('app.tenant_ids', true), '')::uuid[],
       ARRAY[]::uuid[]) $$;

COMMENT ON FUNCTION app_tenant_ids() IS
'The READ scope: every workspace this person is a live member of, or just the active one when they have asked for a single workspace view. Empty array matches nothing.';

CREATE OR REPLACE FUNCTION app_trainer_id() RETURNS uuid
LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.trainer_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_client_ids() RETURNS uuid[]
LANGUAGE sql STABLE AS
$$ SELECT COALESCE(
       NULLIF(current_setting('app.client_ids', true), '')::uuid[],
       ARRAY[]::uuid[]) $$;

COMMENT ON FUNCTION app_client_ids() IS
'A client-role caller''s own client rows, across every roster they are on. A set, not one id, because the same person under two arrangements is two rows.';

-- ─── stamp on insert ─────────────────────────────────────────────────────────
--
-- This is what keeps 53 INSERT statements from needing 53 edits, and it answers
-- in three steps, most specific first:
--
--   1. the statement said which workspace  → leave it alone. The backfill, the
--      seeds and the sync push all still write explicitly.
--   2. the request is standing in one      → use that. This is the production
--      path, and it is the one that makes a gym client a gym row when the same
--      coach also has private clients.
--   3. neither                             → inherit from the row's PARENT.
--
-- Step 3 is not a convenience. "A child row belongs where its parent does" is a
-- real invariant — a set log cannot be in a different workspace from the session
-- it belongs to — and enforcing it here means the four tables that have no owner
-- column of their own can never acquire an inconsistent one. It is also what
-- lets a seed script, a migration and a background job write correct rows
-- without each of them having to remember to set a session variable.
--
-- The parent columns are read through `to_jsonb(NEW)` so ONE function serves all
-- 28 tables instead of 28 near-identical ones. That costs a row-to-json
-- conversion, which is why it happens only after step 2 has already failed —
-- on the production path this branch is never reached.
--
-- Order matters: `client_id` beats `trainer_id`, because a plan, a payment or a
-- session belongs where its CLIENT is coached, and the same coach may be
-- coaching in two workspaces at once. That is the whole point of the design.
CREATE OR REPLACE FUNCTION stamp_tenant_id() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    row_json jsonb;
    parent   text;
    resolved uuid;
BEGIN
    IF NEW.tenant_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    NEW.tenant_id := app_tenant_id();
    IF NEW.tenant_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    row_json := to_jsonb(NEW);

    parent := row_json ->> 'client_id';
    IF parent IS NOT NULL THEN
        SELECT c.tenant_id INTO resolved FROM client c WHERE c.id = parent::uuid;
        IF resolved IS NOT NULL THEN NEW.tenant_id := resolved; RETURN NEW; END IF;
    END IF;

    parent := row_json ->> 'program_id';
    IF parent IS NOT NULL THEN
        SELECT p.tenant_id INTO resolved FROM program p WHERE p.id = parent::uuid;
        IF resolved IS NOT NULL THEN NEW.tenant_id := resolved; RETURN NEW; END IF;
    END IF;

    parent := row_json ->> 'workout_session_id';
    IF parent IS NOT NULL THEN
        SELECT w.tenant_id INTO resolved FROM workout_session w WHERE w.id = parent::uuid;
        IF resolved IS NOT NULL THEN NEW.tenant_id := resolved; RETURN NEW; END IF;
    END IF;

    parent := row_json ->> 'package_id';
    IF parent IS NOT NULL THEN
        SELECT pk.tenant_id INTO resolved FROM package pk WHERE pk.id = parent::uuid;
        IF resolved IS NOT NULL THEN NEW.tenant_id := resolved; RETURN NEW; END IF;
    END IF;

    parent := row_json ->> 'team_id';
    IF parent IS NOT NULL THEN
        SELECT t.tenant_id INTO resolved FROM team t WHERE t.id = parent::uuid;
        IF resolved IS NOT NULL THEN NEW.tenant_id := resolved; RETURN NEW; END IF;
    END IF;

    parent := row_json ->> 'trainer_id';
    IF parent IS NOT NULL THEN
        SELECT tr.home_tenant_id INTO resolved FROM trainer tr WHERE tr.id = parent::uuid;
        IF resolved IS NOT NULL THEN NEW.tenant_id := resolved; RETURN NEW; END IF;
    END IF;

    -- Still nothing. The NOT NULL constraint refuses the row, which is the
    -- correct outcome for a write whose owner cannot be established — a default
    -- here would put somebody's data in a workspace chosen by a coin toss.
    RETURN NEW;
END $$;

-- `exercise` is the exception: a NULL there is the shared catalogue, which is a
-- meaningful value rather than a missing one. Only a custom exercise is stamped.
CREATE OR REPLACE FUNCTION stamp_tenant_id_if_custom() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    resolved uuid;
BEGIN
    IF NEW.tenant_id IS NOT NULL OR NOT NEW.is_custom THEN
        RETURN NEW;
    END IF;
    NEW.tenant_id := app_tenant_id();
    IF NEW.tenant_id IS NULL AND NEW.trainer_id IS NOT NULL THEN
        SELECT tr.home_tenant_id INTO resolved FROM trainer tr WHERE tr.id = NEW.trainer_id;
        NEW.tenant_id := resolved;
    END IF;
    RETURN NEW;
END $$;

-- ─── every trainer has a workspace, from the moment they exist ───────────────
--
-- A trainer with no `home_tenant_id` is a trainer whose rows have nowhere to go,
-- and the constraint above would refuse every one of them. Rather than making
-- that somebody's job in application code — where it would be forgotten by the
-- second write path, and there are already three — the database creates the
-- workspace with the account.
--
-- `solo` and named after the trainer. That is what the V37 backfill did for
-- every trainer who already existed, and it is what should happen to every
-- trainer who ever will.
-- SECURITY DEFINER because this trigger CREATES the very row that row-level
-- security keys on. Under the app role the workspace does not exist yet, so
-- there is no membership to satisfy `tenant`'s policy with, and the insert is
-- refused — which would make signing up impossible the moment RLS is on. The
-- alternative, an INSERT policy on `tenant`, could only be WITH CHECK (true):
-- no wall at all on the root table. Running as the owner keeps the write
-- narrow instead — this function's INSERT is fixed text derived from NEW, so
-- there is no caller-supplied SQL to widen it. search_path is pinned for the
-- usual reason: a SECURITY DEFINER function that resolves names through the
-- caller's path is a privilege-escalation primitive.
CREATE OR REPLACE FUNCTION ensure_home_tenant() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    new_tenant uuid;
    owner_user uuid;
BEGIN
    IF NEW.home_tenant_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT au.id INTO owner_user
    FROM app_user au WHERE au.phone = NEW.phone AND au.deleted_at IS NULL;

    INSERT INTO tenant (type, name, status, primary_app_user_id, metadata)
    VALUES ('solo',
            COALESCE(NULLIF(TRIM(NEW.name), ''), 'My practice'),
            'active',
            owner_user,
            jsonb_build_object('created_with_trainer', NEW.id::text))
    RETURNING id INTO new_tenant;

    NEW.home_tenant_id := new_tenant;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_trainer_home_tenant ON trainer;
CREATE TRIGGER trg_trainer_home_tenant BEFORE INSERT ON trainer
    FOR EACH ROW EXECUTE FUNCTION ensure_home_tenant();

-- The membership row that goes with it, once the trainer row exists. AFTER
-- rather than BEFORE, because `tenant_member` points at `app_user` and the
-- lookup is by phone — a trainer signing up has one, a seeded trainer may not,
-- and a missing app_user must not stop the account being created.
-- SECURITY DEFINER for the same reason as ensure_home_tenant() above.
CREATE OR REPLACE FUNCTION ensure_home_membership() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    INSERT INTO tenant_member (tenant_id, app_user_id, role, status, is_home)
    SELECT NEW.home_tenant_id, au.id, 'owner', 'active',
           NOT EXISTS (SELECT 1 FROM tenant_member h
                        WHERE h.app_user_id = au.id AND h.is_home AND h.deleted_at IS NULL)
    FROM app_user au
    WHERE au.phone = NEW.phone AND au.deleted_at IS NULL
    ON CONFLICT DO NOTHING;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_trainer_home_membership ON trainer;
CREATE TRIGGER trg_trainer_home_membership AFTER INSERT ON trainer
    FOR EACH ROW EXECUTE FUNCTION ensure_home_membership();

-- ─── ...and from the other side, because the two rows race ───────────────────
--
-- The trigger above finds the `app_user` by phone, which quietly assumes the
-- account row is already there when the trainer row lands. It is not: sign-up
-- creates both in one transaction and Hibernate flushes `trainer` first, so on
-- the real path the SELECT matches nothing, no membership is written, and the
-- trainer ends up with a home workspace they are not a member of — a workspace
-- switcher that is empty for every trainer who ever signs up.
--
-- Rather than reorder two saves in one service (the next write path would get
-- it wrong again, and there are already three), the pair completes from
-- whichever side lands second. ON CONFLICT DO NOTHING makes running twice
-- harmless, so the two triggers do not need to know about each other.
CREATE OR REPLACE FUNCTION ensure_membership_for_user() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    INSERT INTO tenant_member (tenant_id, app_user_id, role, status, is_home)
    SELECT t.home_tenant_id, NEW.id, 'owner', 'active',
           NOT EXISTS (SELECT 1 FROM tenant_member h
                        WHERE h.app_user_id = NEW.id AND h.is_home AND h.deleted_at IS NULL)
    FROM trainer t
    WHERE t.phone = NEW.phone
      AND t.deleted_at IS NULL
      AND t.home_tenant_id IS NOT NULL
    ON CONFLICT DO NOTHING;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_app_user_home_membership ON app_user;
CREATE TRIGGER trg_app_user_home_membership AFTER INSERT ON app_user
    FOR EACH ROW EXECUTE FUNCTION ensure_membership_for_user();

-- ─── a team is a workspace, from the moment it exists ────────────────────────
--
-- Same argument as the trainer trigger above, one rung up. V37 backfilled a
-- `team`-type tenant for every team that already existed; without this, every
-- team created afterwards would have a NULL `tenant_id` and its
-- `team_activity`, `client_assignment` and `team_member` rows would have
-- nowhere to be stamped.
--
-- Doing it in the database rather than in `TeamService` is the same choice for
-- the same reason: there is more than one write path into `team`, and a rule
-- that lives in one of them is a rule the others will break.
-- SECURITY DEFINER for the same reason as ensure_home_tenant() above.
CREATE OR REPLACE FUNCTION ensure_team_tenant() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    new_tenant uuid;
    owner_user uuid;
BEGIN
    IF NEW.tenant_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT au.id INTO owner_user
    FROM trainer t
    JOIN app_user au ON au.phone = t.phone AND au.deleted_at IS NULL
    WHERE t.id = NEW.owner_trainer_id;

    INSERT INTO tenant (type, name, status, primary_app_user_id, metadata)
    VALUES ('team',
            COALESCE(NULLIF(TRIM(NEW.name), ''), 'My team'),
            'active',
            owner_user,
            jsonb_build_object('created_with_team', NEW.id::text))
    RETURNING id INTO new_tenant;

    NEW.tenant_id := new_tenant;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_team_tenant ON team;
CREATE TRIGGER trg_team_tenant BEFORE INSERT ON team
    FOR EACH ROW EXECUTE FUNCTION ensure_team_tenant();

ALTER TABLE team ALTER COLUMN tenant_id SET NOT NULL;

-- ─── `team_member` mirrors into `tenant_member` ──────────────────────────────
--
-- `tenant_member` is the authority for who may enter a workspace; `team_member`
-- keeps being written because the additive-only law forbids dropping it and
-- because it is in the sync surface. Two tables holding one fact is how one fact
-- becomes two, so the mirror is a trigger rather than a line in a service that
-- the next write path will forget.
--
-- `is_home` is deliberately FALSE: a coach who joins somebody's team still opens
-- into their own practice, which is where all their existing data is.
-- SECURITY DEFINER for the same reason as ensure_home_tenant() above.
CREATE OR REPLACE FUNCTION mirror_team_member() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    IF NEW.trainer_id IS NULL THEN
        -- An invite sent to a phone that has no account yet. There is nobody to
        -- make a member of anything until they sign in and the row is bound.
        RETURN NULL;
    END IF;

    INSERT INTO tenant_member (tenant_id, app_user_id, role, status, is_home)
    SELECT tm.tenant_id, au.id, NEW.role, NEW.status, FALSE
    FROM team tm
    JOIN trainer t   ON t.id = NEW.trainer_id
    JOIN app_user au ON au.phone = t.phone AND au.deleted_at IS NULL
    WHERE tm.id = NEW.team_id
    ON CONFLICT (tenant_id, app_user_id, role) WHERE deleted_at IS NULL
    DO UPDATE SET status = EXCLUDED.status, deleted_at = NULL;

    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_team_member_mirror ON team_member;
CREATE TRIGGER trg_team_member_mirror AFTER INSERT OR UPDATE ON team_member
    FOR EACH ROW EXECUTE FUNCTION mirror_team_member();

-- ─── refuse to move ──────────────────────────────────────────────────────────
--
-- THIS TRIGGER IS THE DESIGN. Everything about tenancy here rests on a row being
-- stamped where it was created and never moving: it is why joining a gym costs no
-- bulk UPDATE, why leaving one cascades into nothing, and why an audit of "who
-- could ever have read this row" has one answer for the life of the row.
--
-- A convention would have been enough right up until the first well-meant
-- `UPDATE ... SET tenant_id`. Reassigning a client changes `trainer_id`, which is
-- exactly the operation most likely to reach for this column by mistake.
CREATE OR REPLACE FUNCTION freeze_tenant_id() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        RAISE EXCEPTION
            'tenant_id is immutable: % cannot move from % to %',
            TG_TABLE_NAME, OLD.tenant_id, NEW.tenant_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

-- ─── attach both triggers to every table that carries the column ─────────────
DROP TRIGGER IF EXISTS trg_client_stamp_tenant ON client;
CREATE TRIGGER trg_client_stamp_tenant BEFORE INSERT ON client
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_client_freeze_tenant ON client;
CREATE TRIGGER trg_client_freeze_tenant BEFORE UPDATE ON client
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_client_note_stamp_tenant ON client_note;
CREATE TRIGGER trg_client_note_stamp_tenant BEFORE INSERT ON client_note
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_client_note_freeze_tenant ON client_note;
CREATE TRIGGER trg_client_note_freeze_tenant BEFORE UPDATE ON client_note
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_template_stamp_tenant ON template;
CREATE TRIGGER trg_template_stamp_tenant BEFORE INSERT ON template
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_template_freeze_tenant ON template;
CREATE TRIGGER trg_template_freeze_tenant BEFORE UPDATE ON template
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_program_stamp_tenant ON program;
CREATE TRIGGER trg_program_stamp_tenant BEFORE INSERT ON program
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_program_freeze_tenant ON program;
CREATE TRIGGER trg_program_freeze_tenant BEFORE UPDATE ON program
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_scheduled_session_stamp_tenant ON scheduled_session;
CREATE TRIGGER trg_scheduled_session_stamp_tenant BEFORE INSERT ON scheduled_session
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_scheduled_session_freeze_tenant ON scheduled_session;
CREATE TRIGGER trg_scheduled_session_freeze_tenant BEFORE UPDATE ON scheduled_session
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_working_hours_stamp_tenant ON working_hours;
CREATE TRIGGER trg_working_hours_stamp_tenant BEFORE INSERT ON working_hours
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_working_hours_freeze_tenant ON working_hours;
CREATE TRIGGER trg_working_hours_freeze_tenant BEFORE UPDATE ON working_hours
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_time_block_stamp_tenant ON time_block;
CREATE TRIGGER trg_time_block_stamp_tenant BEFORE INSERT ON time_block
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_time_block_freeze_tenant ON time_block;
CREATE TRIGGER trg_time_block_freeze_tenant BEFORE UPDATE ON time_block
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_batch_stamp_tenant ON batch;
CREATE TRIGGER trg_batch_stamp_tenant BEFORE INSERT ON batch
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_batch_freeze_tenant ON batch;
CREATE TRIGGER trg_batch_freeze_tenant BEFORE UPDATE ON batch
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_workout_session_stamp_tenant ON workout_session;
CREATE TRIGGER trg_workout_session_stamp_tenant BEFORE INSERT ON workout_session
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_workout_session_freeze_tenant ON workout_session;
CREATE TRIGGER trg_workout_session_freeze_tenant BEFORE UPDATE ON workout_session
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_pack_stamp_tenant ON pack;
CREATE TRIGGER trg_pack_stamp_tenant BEFORE INSERT ON pack
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_pack_freeze_tenant ON pack;
CREATE TRIGGER trg_pack_freeze_tenant BEFORE UPDATE ON pack
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_package_stamp_tenant ON package;
CREATE TRIGGER trg_package_stamp_tenant BEFORE INSERT ON package
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_package_freeze_tenant ON package;
CREATE TRIGGER trg_package_freeze_tenant BEFORE UPDATE ON package
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_package_adjustment_stamp_tenant ON package_adjustment;
CREATE TRIGGER trg_package_adjustment_stamp_tenant BEFORE INSERT ON package_adjustment
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_package_adjustment_freeze_tenant ON package_adjustment;
CREATE TRIGGER trg_package_adjustment_freeze_tenant BEFORE UPDATE ON package_adjustment
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_payment_stamp_tenant ON payment;
CREATE TRIGGER trg_payment_stamp_tenant BEFORE INSERT ON payment
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_payment_freeze_tenant ON payment;
CREATE TRIGGER trg_payment_freeze_tenant BEFORE UPDATE ON payment
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_gym_settlement_stamp_tenant ON gym_settlement;
CREATE TRIGGER trg_gym_settlement_stamp_tenant BEFORE INSERT ON gym_settlement
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_gym_settlement_freeze_tenant ON gym_settlement;
CREATE TRIGGER trg_gym_settlement_freeze_tenant BEFORE UPDATE ON gym_settlement
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_nudge_rule_stamp_tenant ON nudge_rule;
CREATE TRIGGER trg_nudge_rule_stamp_tenant BEFORE INSERT ON nudge_rule
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_nudge_rule_freeze_tenant ON nudge_rule;
CREATE TRIGGER trg_nudge_rule_freeze_tenant BEFORE UPDATE ON nudge_rule
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_nudge_log_stamp_tenant ON nudge_log;
CREATE TRIGGER trg_nudge_log_stamp_tenant BEFORE INSERT ON nudge_log
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_nudge_log_freeze_tenant ON nudge_log;
CREATE TRIGGER trg_nudge_log_freeze_tenant BEFORE UPDATE ON nudge_log
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_nudge_template_stamp_tenant ON nudge_template;
CREATE TRIGGER trg_nudge_template_stamp_tenant BEFORE INSERT ON nudge_template
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_nudge_template_freeze_tenant ON nudge_template;
CREATE TRIGGER trg_nudge_template_freeze_tenant BEFORE UPDATE ON nudge_template
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_weekly_report_stamp_tenant ON weekly_report;
CREATE TRIGGER trg_weekly_report_stamp_tenant BEFORE INSERT ON weekly_report
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_weekly_report_freeze_tenant ON weekly_report;
CREATE TRIGGER trg_weekly_report_freeze_tenant BEFORE UPDATE ON weekly_report
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_attention_dismissal_stamp_tenant ON attention_dismissal;
CREATE TRIGGER trg_attention_dismissal_stamp_tenant BEFORE INSERT ON attention_dismissal
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_attention_dismissal_freeze_tenant ON attention_dismissal;
CREATE TRIGGER trg_attention_dismissal_freeze_tenant BEFORE UPDATE ON attention_dismissal
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_exercise_favourite_stamp_tenant ON exercise_favourite;
CREATE TRIGGER trg_exercise_favourite_stamp_tenant BEFORE INSERT ON exercise_favourite
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_exercise_favourite_freeze_tenant ON exercise_favourite;
CREATE TRIGGER trg_exercise_favourite_freeze_tenant BEFORE UPDATE ON exercise_favourite
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_team_member_stamp_tenant ON team_member;
CREATE TRIGGER trg_team_member_stamp_tenant BEFORE INSERT ON team_member
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_team_member_freeze_tenant ON team_member;
CREATE TRIGGER trg_team_member_freeze_tenant BEFORE UPDATE ON team_member
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_client_assignment_stamp_tenant ON client_assignment;
CREATE TRIGGER trg_client_assignment_stamp_tenant BEFORE INSERT ON client_assignment
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_client_assignment_freeze_tenant ON client_assignment;
CREATE TRIGGER trg_client_assignment_freeze_tenant BEFORE UPDATE ON client_assignment
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_team_activity_stamp_tenant ON team_activity;
CREATE TRIGGER trg_team_activity_stamp_tenant BEFORE INSERT ON team_activity
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_team_activity_freeze_tenant ON team_activity;
CREATE TRIGGER trg_team_activity_freeze_tenant BEFORE UPDATE ON team_activity
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_body_metric_stamp_tenant ON body_metric;
CREATE TRIGGER trg_body_metric_stamp_tenant BEFORE INSERT ON body_metric
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_body_metric_freeze_tenant ON body_metric;
CREATE TRIGGER trg_body_metric_freeze_tenant BEFORE UPDATE ON body_metric
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_program_exercise_stamp_tenant ON program_exercise;
CREATE TRIGGER trg_program_exercise_stamp_tenant BEFORE INSERT ON program_exercise
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_program_exercise_freeze_tenant ON program_exercise;
CREATE TRIGGER trg_program_exercise_freeze_tenant BEFORE UPDATE ON program_exercise
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_workout_exercise_stamp_tenant ON workout_exercise;
CREATE TRIGGER trg_workout_exercise_stamp_tenant BEFORE INSERT ON workout_exercise
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_workout_exercise_freeze_tenant ON workout_exercise;
CREATE TRIGGER trg_workout_exercise_freeze_tenant BEFORE UPDATE ON workout_exercise
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_set_log_stamp_tenant ON set_log;
CREATE TRIGGER trg_set_log_stamp_tenant BEFORE INSERT ON set_log
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_set_log_freeze_tenant ON set_log;
CREATE TRIGGER trg_set_log_freeze_tenant BEFORE UPDATE ON set_log
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
DROP TRIGGER IF EXISTS trg_tenant_member_stamp_tenant ON tenant_member;
CREATE TRIGGER trg_tenant_member_stamp_tenant BEFORE INSERT ON tenant_member
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
DROP TRIGGER IF EXISTS trg_tenant_member_freeze_tenant ON tenant_member;
CREATE TRIGGER trg_tenant_member_freeze_tenant BEFORE UPDATE ON tenant_member
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
-- `exercise` last, with the custom-only stamp described above.
DROP TRIGGER IF EXISTS trg_exercise_stamp_tenant ON exercise;
CREATE TRIGGER trg_exercise_stamp_tenant BEFORE INSERT ON exercise
    FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id_if_custom();
DROP TRIGGER IF EXISTS trg_exercise_freeze_tenant ON exercise;
CREATE TRIGGER trg_exercise_freeze_tenant BEFORE UPDATE ON exercise
    FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();

-- `tenant` itself is keyed on `id`, so there is nothing to stamp or freeze.
