-- InclineYou — the v1 schema, as a fresh baseline (25 Sep 2026).
--
-- This file replaces the earlier baseline and V2–V22, which are archived in
-- backend/db-archive/pre-v1-2026-09-25/ and never run. It builds exactly the 41
-- tables agreed and approved in release/proposed-schema.html — that page, not
-- this file, carries the reasoning for every column, key and rule; read it to
-- find out WHY something is shaped as it is. What is held for a later release is
-- release/later-schema.html.
--
-- From here the law is the usual one: never edit a migration that has run;
-- append V2, V3 …; schema evolution is additive.
--
-- Every workspace row carries trainer_id (who coaches) and tenant_id (whose
-- books). tenant_id is stamped on insert (stamp_tenant_id) and frozen on update
-- (freeze_tenant_id); the row-level security policies near the end are the wall.

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
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'inclineyou_app') THEN
            EXECUTE format('CREATE ROLE inclineyou_app LOGIN PASSWORD %L', '${appRolePassword}');
        ELSE
            EXECUTE format('ALTER ROLE inclineyou_app LOGIN PASSWORD %L', '${appRolePassword}');
        END IF;
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE WARNING 'could not create or alter role inclineyou_app — create it manually, then re-run the grants in V42';
    END;
END $$;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET search_path = public, pg_catalog;

-- ─── the request context ─────────────────────────────────────────────────────
--
-- Six settings TenantAwareDataSource writes on every borrow. Every policy reads
-- them through these, and an unset one is worth nothing: NULL, or an empty set.

CREATE FUNCTION app_actor() RETURNS text LANGUAGE sql STABLE
    AS $$ SELECT COALESCE(NULLIF(current_setting('app.actor', true), ''), '') $$;
CREATE FUNCTION app_phone() RETURNS text LANGUAGE sql STABLE
    AS $$ SELECT COALESCE(NULLIF(current_setting('app.phone', true), ''), '') $$;
CREATE FUNCTION app_tenant_id() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;
CREATE FUNCTION app_tenant_ids() RETURNS uuid[] LANGUAGE sql STABLE
    AS $$ SELECT COALESCE(NULLIF(current_setting('app.tenant_ids', true), '')::uuid[], ARRAY[]::uuid[]) $$;
CREATE FUNCTION app_trainer_id() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.trainer_id', true), '')::uuid $$;
CREATE FUNCTION app_client_ids() RETURNS uuid[] LANGUAGE sql STABLE
    AS $$ SELECT COALESCE(NULLIF(current_setting('app.client_ids', true), '')::uuid[], ARRAY[]::uuid[]) $$;

-- Set only inside the erasure functions, so the append-only guards let an
-- erasure scrub free text off rows that are otherwise never changed.
CREATE FUNCTION app_erasing() RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT COALESCE(current_setting('inclineyou.erasing', true), 'off') = 'on' $$;

-- The owner of a workspace is its one live owner membership (there is no
-- owner column on tenant). Definer, because tenant_member is itself policied.
CREATE FUNCTION app_owns_tenant(target uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
    SELECT EXISTS (
        SELECT 1 FROM tenant_member tm JOIN app_user au ON au.id = tm.app_user_id
        WHERE tm.tenant_id = target AND tm.role = 'owner' AND tm.status = 'active'
          AND tm.deleted_at IS NULL AND au.deleted_at IS NULL AND au.phone = app_phone())
$$;

-- ─── check functions (IMMUTABLE, used by CHECK constraints) ─────────────────

-- readings: an object of numbers above 0 and below 100,000, keyed only by what the form asked.
CREATE FUNCTION assessment_readings_valid(form jsonb, readings jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT jsonb_typeof(readings) = 'object' AND NOT EXISTS (
        SELECT 1 FROM jsonb_each(readings) r
        WHERE jsonb_typeof(r.value) <> 'number'
           OR (r.value)::text::numeric <= 0 OR (r.value)::text::numeric >= 100000
           OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(form -> 'measurements', '[]')) m
                          WHERE m ->> 'key' = r.key))
$$;

-- answers: an object of objects, keyed only by the form's question ids. Per-kind rules stay in code.
CREATE FUNCTION assessment_answers_valid(form jsonb, answers jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT jsonb_typeof(answers) = 'object' AND NOT EXISTS (
        SELECT 1 FROM jsonb_each(answers) a
        WHERE jsonb_typeof(a.value) <> 'object'
           OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(form -> 'questions', '[]')) q
                          WHERE q ->> 'id' = a.key))
$$;

-- ─── the workspace wall: stamping and freezing tenant_id ─────────────────────

-- Fills tenant_id when the insert leaves it NULL: the active workspace, else the
-- parent row's, else the trainer's home. Also fills currency from the workspace
-- on the money tables. Never stamps an InclineYou catalogue row, which belongs
-- to every workspace and has no tenant_id by construction.
CREATE FUNCTION stamp_tenant_id() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    row_json jsonb := to_jsonb(NEW);
    parent   text;
    resolved uuid;
    cur      text;
BEGIN
    IF row_json ->> 'origin' = 'inclineyou' THEN
        RETURN NEW;
    END IF;
    IF NEW.tenant_id IS NULL THEN
        NEW.tenant_id := app_tenant_id();
    END IF;
    IF NEW.tenant_id IS NULL THEN
        FOREACH parent IN ARRAY ARRAY['client_id', 'program_id', 'workout_id', 'workout_exercise_id',
                                      'session_id', 'session_exercise_id', 'package_id'] LOOP
            CONTINUE WHEN row_json ->> parent IS NULL;
            EXECUTE format('SELECT tenant_id FROM %I WHERE id = $1',
                           CASE parent WHEN 'client_id' THEN 'client' WHEN 'program_id' THEN 'program'
                                       WHEN 'workout_id' THEN 'workout' WHEN 'workout_exercise_id' THEN 'workout_exercise'
                                       WHEN 'session_id' THEN 'scheduled_session'
                                       WHEN 'session_exercise_id' THEN 'session_exercise' ELSE 'package' END)
               INTO resolved USING (row_json ->> parent)::uuid;
            IF resolved IS NOT NULL THEN NEW.tenant_id := resolved; EXIT; END IF;
        END LOOP;
    END IF;
    IF NEW.tenant_id IS NULL AND row_json ->> 'trainer_id' IS NOT NULL THEN
        SELECT home_tenant_id INTO resolved FROM trainer WHERE id = (row_json ->> 'trainer_id')::uuid;
        NEW.tenant_id := resolved;
    END IF;
    -- Nothing found: NOT NULL refuses the row, which is right for a write whose
    -- workspace cannot be established.
    IF row_json ? 'currency' AND row_json ->> 'currency' IS NULL AND NEW.tenant_id IS NOT NULL THEN
        SELECT currency INTO cur FROM tenant WHERE id = NEW.tenant_id;
        NEW := jsonb_populate_record(NEW, jsonb_build_object('currency', cur));
    END IF;
    RETURN NEW;
END $$;

-- exercise: only a trainer's own row belongs to a workspace.
CREATE FUNCTION stamp_tenant_id_if_trainer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE resolved uuid;
BEGIN
    IF NEW.tenant_id IS NOT NULL OR NEW.origin <> 'trainer' THEN
        RETURN NEW;
    END IF;
    NEW.tenant_id := app_tenant_id();
    IF NEW.tenant_id IS NULL AND NEW.trainer_id IS NOT NULL THEN
        SELECT home_tenant_id INTO resolved FROM trainer WHERE id = NEW.trainer_id;
        NEW.tenant_id := resolved;
    END IF;
    RETURN NEW;
END $$;

CREATE FUNCTION freeze_tenant_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        RAISE EXCEPTION 'tenant_id is immutable: % cannot move from % to %', TG_TABLE_NAME, OLD.tenant_id, NEW.tenant_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

-- tenant_member / tenant_invite: copy the workspace's kind, so the composite
-- keys can prove the role is one that kind of workspace has.
CREATE FUNCTION stamp_tenant_type() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
BEGIN
    SELECT type INTO NEW.tenant_type FROM tenant WHERE id = NEW.tenant_id;
    RETURN NEW;
END $$;

CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$;

-- ─── tenant ─────────────────────────────────────────────────────────────────

CREATE FUNCTION freeze_tenant_type() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.type IS DISTINCT FROM OLD.type THEN
        RAISE EXCEPTION 'a workspace''s kind is fixed at creation (% cannot become %)', OLD.type, NEW.type
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE FUNCTION set_tenant_status_changed_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        NEW.status_changed_at := now();
    END IF;
    RETURN NEW;
END $$;

-- ─── tenant_member ──────────────────────────────────────────────────────────

CREATE FUNCTION refuse_owner_promotion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    -- current_user is the request role only for a statement the application
    -- issued itself; inside a SECURITY DEFINER function it is the owner.
    IF current_user = 'inclineyou_app' AND NEW.role = 'owner' AND OLD.role IS DISTINCT FROM 'owner' THEN
        RAISE EXCEPTION 'a request may not make a workspace member an owner' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END $$;

-- ─── what a new trainer gets: a workspace, its membership, a practice row, a trial ─

-- BEFORE INSERT on trainer: the solo workspace, named after the trainer.
CREATE FUNCTION ensure_home_tenant() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE new_tenant uuid;
BEGIN
    IF NEW.home_tenant_id IS NOT NULL THEN
        RETURN NEW;
    END IF;
    INSERT INTO tenant (type, name, timezone)
    VALUES ('solo', COALESCE(NULLIF(btrim(NEW.name), ''), 'My practice'), NEW.timezone)
    RETURNING id INTO new_tenant;
    NEW.home_tenant_id := new_tenant;
    RETURN NEW;
END $$;

-- AFTER INSERT on trainer: the owner membership of that workspace.
CREATE FUNCTION ensure_home_membership() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
BEGIN
    INSERT INTO tenant_member (tenant_id, tenant_type, app_user_id, role, status, is_home)
    SELECT NEW.home_tenant_id, t.type, NEW.app_user_id, 'owner', 'active',
           NOT EXISTS (SELECT 1 FROM tenant_member h WHERE h.app_user_id = NEW.app_user_id AND h.is_home AND h.deleted_at IS NULL)
    FROM tenant t WHERE t.id = NEW.home_tenant_id
    ON CONFLICT DO NOTHING;
    RETURN NULL;
END $$;

-- AFTER INSERT on app_user: a trainer always references its person, so a
-- trainer row cannot exist before its app_user; this covers a person whose
-- trainer row was written first by support, and is otherwise a no-op.
CREATE FUNCTION ensure_membership_for_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
BEGIN
    INSERT INTO tenant_member (tenant_id, tenant_type, app_user_id, role, status, is_home)
    SELECT tr.home_tenant_id, t.type, NEW.id, 'owner', 'active', true
    FROM trainer tr JOIN tenant t ON t.id = tr.home_tenant_id
    WHERE tr.app_user_id = NEW.id AND tr.deleted_at IS NULL
    ON CONFLICT DO NOTHING;
    RETURN NULL;
END $$;

-- AFTER INSERT on trainer: the empty practice row, so every read is an inner join.
CREATE FUNCTION ensure_trainer_business() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
BEGIN
    INSERT INTO trainer_business (trainer_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
    RETURN NULL;
END $$;

-- AFTER INSERT on trainer: the trial, at the current Pro price for India.
CREATE FUNCTION ensure_subscription() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
BEGIN
    INSERT INTO subscription (trainer_id, plan, price_amount, currency, billing_country, price_region, plan_price_id)
    SELECT NEW.id, 'pro', pp.amount, pp.currency, 'IN', 'india', pp.id
    FROM plan_price pp
    WHERE pp.plan = 'pro' AND pp.region = 'india' AND pp.valid_from <= now()
    ORDER BY pp.valid_from DESC LIMIT 1
    ON CONFLICT DO NOTHING;
    RETURN NULL;
END $$;

-- AFTER UPDATE OF name on trainer: a solo workspace follows its trainer's name
-- until the owner names it something else.
CREATE FUNCTION follow_solo_tenant_name() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
BEGIN
    UPDATE tenant SET name = COALESCE(NULLIF(btrim(NEW.name), ''), 'My practice')
    WHERE id = NEW.home_tenant_id AND type = 'solo' AND status = 'active'
      AND name = COALESCE(NULLIF(btrim(OLD.name), ''), 'My practice');
    RETURN NULL;
END $$;

-- ─── subscription ───────────────────────────────────────────────────────────

CREATE FUNCTION freeze_subscription_price() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW.plan_price_id, NEW.price_region, NEW.price_amount, NEW.currency, NEW.billing_country)
       IS DISTINCT FROM (OLD.plan_price_id, OLD.price_region, OLD.price_amount, OLD.currency, OLD.billing_country)
       AND NOT (OLD.state = 'trialing' AND OLD.provider IS NULL) THEN
        RAISE EXCEPTION 'subscription % is paid for: its price is fixed', OLD.trainer_id USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

-- ─── client ─────────────────────────────────────────────────────────────────

-- AFTER INSERT on client: the empty plan row, so every client has exactly one.
CREATE FUNCTION ensure_client_schedule() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO client_schedule (client_id, tenant_id) VALUES (NEW.id, NEW.tenant_id) ON CONFLICT DO NOTHING;
    RETURN NULL;
END $$;

-- ─── assessment ─────────────────────────────────────────────────────────────

-- The form is re-copied while the row is untouched and frozen once it is sent
-- or anything has been entered.
CREATE FUNCTION freeze_assessment_form() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.form IS DISTINCT FROM OLD.form
       AND (OLD.sent_at IS NOT NULL OR OLD.completed_at IS NOT NULL OR OLD.readings <> '{}' OR OLD.answers <> '{}') THEN
        RAISE EXCEPTION 'assessment % has been sent or answered: its form is fixed', OLD.id USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

-- ─── functions from the agreed page ─────────────────────────────────────────

CREATE FUNCTION set_session_ends_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.ends_at := NEW.scheduled_at + make_interval(mins => NEW.duration_minutes);
  RETURN NEW;
END $$;

CREATE FUNCTION package_adjustment_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF app_erasing() THEN RETURN NEW; END IF;   -- erase_clients() scrubs reason
  IF OLD.reversed_at IS NULL AND NEW.reversed_at IS NOT NULL
     AND (to_jsonb(NEW) - 'reversed_at') = (to_jsonb(OLD) - 'reversed_at') THEN
    RETURN NEW;                                   -- undoing a session charge, once
  END IF;
  RAISE EXCEPTION 'package_adjustment is append-only: only a session charge''s reversed_at may be set, once'
    USING ERRCODE = 'check_violation';
END $$;

CREATE FUNCTION apply_package_adjustment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pkg package%ROWTYPE; tz text;
BEGIN
  SELECT * INTO pkg FROM package WHERE id = NEW.package_id FOR UPDATE;
  IF TG_OP = 'UPDATE' THEN                                     -- the one update append-only allows: undoing a charge
    PERFORM set_config('inclineyou.package_adjusting', 'on', true);
    UPDATE package SET sessions_remaining = sessions_remaining + 1 WHERE id = pkg.id;
    PERFORM set_config('inclineyou.package_adjusting', 'off', true);
    RETURN NEW;
  END IF;
  IF NEW.kind <> 'due_date' AND pkg.status <> 'active' THEN
    RAISE EXCEPTION 'package % is %: only a running package can be %', pkg.id, pkg.status, NEW.kind USING ERRCODE = 'check_violation';
  END IF;
  CASE NEW.kind
  WHEN 'pause' THEN
    IF pkg.paused_at IS NOT NULL THEN RAISE EXCEPTION 'package % is already paused', pkg.id USING ERRCODE = 'check_violation'; END IF;
    pkg.paused_at := NEW.effective_at;
  WHEN 'resume' THEN                                           -- the pause's length is measured, never typed
    IF pkg.paused_at IS NULL THEN RAISE EXCEPTION 'package % is not paused', pkg.id USING ERRCODE = 'check_violation'; END IF;
    SELECT timezone INTO tz FROM trainer WHERE id = pkg.trainer_id;
    NEW.days := greatest(0, (NEW.effective_at AT TIME ZONE tz)::date - (pkg.paused_at AT TIME ZONE tz)::date);
    pkg.paused_at := NULL;
    pkg.paused_days := pkg.paused_days + NEW.days;
    pkg.end_date := pkg.end_date + NEW.days;                   -- no expiry stays no expiry
  WHEN 'extend' THEN
    IF pkg.end_date IS NULL THEN RAISE EXCEPTION 'package % never expires: there is nothing to extend', pkg.id USING ERRCODE = 'check_violation'; END IF;
    pkg.end_date := pkg.end_date + NEW.days;
  WHEN 'sessions' THEN                                         -- package_basis refuses a count below what is used
    pkg.sessions_total := pkg.sessions_total + NEW.sessions;
    pkg.sessions_remaining := pkg.sessions_remaining + NEW.sessions;
  WHEN 'session' THEN                                          -- and refuses a charge with nothing left
    IF pkg.paused_at IS NOT NULL THEN RAISE EXCEPTION 'package % is paused: a paused package is not charged', pkg.id USING ERRCODE = 'check_violation'; END IF;
    pkg.sessions_remaining := pkg.sessions_remaining - 1;
  WHEN 'due_date' THEN
    NEW.previous_due_date := pkg.due_date;
    pkg.due_date := NEW.due_date;
  END CASE;
  PERFORM set_config('inclineyou.package_adjusting', 'on', true);
  UPDATE package SET sessions_total = pkg.sessions_total, sessions_remaining = pkg.sessions_remaining, end_date = pkg.end_date,
                     due_date = pkg.due_date, paused_at = pkg.paused_at, paused_days = pkg.paused_days
  WHERE id = pkg.id;
  PERFORM set_config('inclineyou.package_adjusting', 'off', true);
  RETURN NEW;
END $$;

CREATE FUNCTION guard_package_balance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('inclineyou.package_adjusting', true), 'off') = 'on' THEN RETURN NEW; END IF;
  IF NEW.due_date IS DISTINCT FROM OLD.due_date
     OR ((NEW.sessions_total, NEW.sessions_remaining, NEW.end_date, NEW.paused_at, NEW.paused_days)
          IS DISTINCT FROM (OLD.sessions_total, OLD.sessions_remaining, OLD.end_date, OLD.paused_at, OLD.paused_days)
         AND EXISTS (SELECT 1 FROM package_adjustment WHERE package_id = OLD.id)) THEN
    RAISE EXCEPTION 'package %: sessions, dates and pauses change only through package_adjustment', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION freeze_package_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.name, NEW.service, NEW.basis, NEW.amount, NEW.discount_amount, NEW.trainer_share_percent,
      NEW.trainer_share_amount, NEW.currency, NEW.start_date)
     IS DISTINCT FROM
     (OLD.name, OLD.service, OLD.basis, OLD.amount, OLD.discount_amount, OLD.trainer_share_percent,
      OLD.trainer_share_amount, OLD.currency, OLD.start_date)
     AND EXISTS (SELECT 1 FROM payment WHERE package_id = OLD.id AND status IN ('paid', 'write_off', 'refund')
                 AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'package % has money collected against it: its terms are frozen — sell a new package instead', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION check_package_client_type() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ctype text; powner text;
BEGIN
  SELECT client_type INTO ctype FROM client WHERE id = NEW.client_id;
  IF NEW.pack_id IS NOT NULL THEN SELECT owner INTO powner FROM pack WHERE id = NEW.pack_id; END IF;
  IF ctype = 'gym' AND (coalesce(powner, 'gym') <> 'gym'
                        OR num_nonnulls(NEW.trainer_share_percent, NEW.trainer_share_amount) = 0) THEN
    RAISE EXCEPTION 'a gym client buys the gym''s packs only, with the trainer''s share on them' USING ERRCODE = 'check_violation';
  END IF;
  IF ctype = 'independent' AND (coalesce(powner, 'trainer') <> 'trainer'
                                OR num_nonnulls(NEW.trainer_share_percent, NEW.trainer_share_amount) > 0) THEN
    RAISE EXCEPTION 'an independent client buys the trainer''s own packs only' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION freeze_refunded_package() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'package % was refunded: it stays closed', OLD.id USING ERRCODE = 'check_violation';
END $$;

CREATE FUNCTION stamp_payment_collector() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT CASE client_type WHEN 'gym' THEN 'gym' ELSE 'trainer' END INTO NEW.collected_by
    FROM client WHERE id = NEW.client_id;
  ELSE
    NEW.collected_by := OLD.collected_by;      -- who took it is history: a later change of client type rewrites no row
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION check_package_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total numeric; paid numeric; forgiven numeric; returned numeric;
BEGIN
  IF NEW.status NOT IN ('write_off', 'refund') OR NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  SELECT amount INTO total FROM package WHERE id = NEW.package_id FOR UPDATE;   -- one ledger change at a time per package
  SELECT coalesce(sum(amount) FILTER (WHERE status = 'paid'), 0),
         coalesce(sum(amount) FILTER (WHERE status = 'write_off'), 0),
         coalesce(sum(amount) FILTER (WHERE status = 'refund'), 0)
    INTO paid, forgiven, returned
    FROM payment WHERE package_id = NEW.package_id AND deleted_at IS NULL AND id <> NEW.id;
  IF NEW.status = 'write_off' AND paid + forgiven + NEW.amount > total THEN
    RAISE EXCEPTION 'write-off of % exceeds what is still due on package % (%)', NEW.amount, NEW.package_id, total - paid - forgiven
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'refund' AND (paid < total OR forgiven > 0) THEN
    RAISE EXCEPTION 'package % is not fully paid: only a fully paid package can be refunded', NEW.package_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'refund' AND returned + NEW.amount > paid THEN
    RAISE EXCEPTION 'refund of % exceeds what was paid on package % (%)', NEW.amount, NEW.package_id, paid - returned
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION freeze_refund() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF app_erasing() THEN RETURN NEW; END IF;   -- erase_clients() scrubs note
  RAISE EXCEPTION 'payment % is a refund: a refund cannot be changed or undone', OLD.id USING ERRCODE = 'check_violation';
END $$;

CREATE FUNCTION refuse_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF app_erasing() THEN RETURN NEW; END IF;
  RAISE EXCEPTION '% is append-only: a row is never changed', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END $$;

-- ─── erasure ─────────────────────────────────────────────────────────────────
--
-- Three ways a client's data is erased — a trainer deleting one client, the
-- client erasing their own account, a trainer erasing theirs — and all three run
-- erase_clients(). What goes: everything about the person. What stays: a
-- nameless "Former client" row carrying only the trainer's ledger (logged
-- sessions, packages, payments, as amounts and dates), until the workspace is
-- purged. Definer functions: the request role holds no DELETE on most of these
-- tables, and an erasure must reach rows the caller's policies would hide.

CREATE FUNCTION erase_clients(ids uuid[], p_requested_by text, p_parent uuid DEFAULT NULL) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE n integer;
BEGIN
    PERFORM set_config('inclineyou.erasing', 'on', true);
    ids := ARRAY(SELECT id FROM client WHERE id = ANY(ids) AND erased_at IS NULL);

    -- the plan and the diary still to come
    DELETE FROM nudge_log            WHERE client_id = ANY(ids);
    DELETE FROM scheduled_session s  WHERE s.client_id = ANY(ids) AND s.status = 'scheduled' AND s.started_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM session_exercise x WHERE x.session_id = s.id)
        AND NOT EXISTS (SELECT 1 FROM package_adjustment a WHERE a.session_id = s.id);
    -- what stays keeps its date and length, not which slot or workout it came from
    UPDATE scheduled_session SET workout_id = NULL, slot_id = NULL, notes = NULL WHERE client_id = ANY(ids);
    DELETE FROM client_schedule_slot WHERE client_id = ANY(ids);
    DELETE FROM client_schedule      WHERE client_id = ANY(ids);

    -- the client's programs, and everything under them
    DELETE FROM workout_set ws USING workout_exercise we, workout w, program p
        WHERE ws.workout_exercise_id = we.id AND we.workout_id = w.id AND w.program_id = p.id AND p.client_id = ANY(ids);
    DELETE FROM workout_exercise we USING workout w, program p
        WHERE we.workout_id = w.id AND w.program_id = p.id AND p.client_id = ANY(ids) AND we.alternative_of IS NOT NULL;
    DELETE FROM workout_exercise we USING workout w, program p
        WHERE we.workout_id = w.id AND w.program_id = p.id AND p.client_id = ANY(ids);
    UPDATE workout SET copied_from_workout_id = NULL
        WHERE copied_from_workout_id IN (SELECT w.id FROM workout w JOIN program p ON p.id = w.program_id WHERE p.client_id = ANY(ids));
    DELETE FROM workout w USING program p WHERE w.program_id = p.id AND p.client_id = ANY(ids);
    UPDATE program SET copied_from_program_id = NULL, synced_at = NULL
        WHERE copied_from_program_id IN (SELECT id FROM program WHERE client_id = ANY(ids));
    DELETE FROM program WHERE client_id = ANY(ids);

    -- measurements, notes, reminders, silences: personal from end to end
    DELETE FROM assessment          WHERE client_id = ANY(ids);
    DELETE FROM assessment_schedule WHERE client_id = ANY(ids);
    DELETE FROM client_note         WHERE client_id = ANY(ids);
    DELETE FROM attention_dismissal WHERE client_id = ANY(ids);

    -- the free text on everything that stays
    UPDATE session_exercise SET notes = NULL WHERE client_id = ANY(ids) AND notes IS NOT NULL;
    UPDATE set_log sl SET notes = NULL FROM session_exercise x
        WHERE sl.session_exercise_id = x.id AND x.client_id = ANY(ids) AND sl.notes IS NOT NULL;
    UPDATE payment SET note = NULL, reference = NULL WHERE client_id = ANY(ids);
    UPDATE package_adjustment SET reason = NULL WHERE client_id = ANY(ids) AND reason IS NOT NULL;
    UPDATE client_assignment SET note = NULL WHERE client_id = ANY(ids) AND note IS NOT NULL;

    -- the row itself: nameless, off every list
    UPDATE client SET name = NULL, phone = NULL, date_of_birth = NULL, goal = NULL, height_cm = NULL,
                      activity_level = NULL, timezone = NULL, metadata = NULL, archive_note = NULL,
                      erased_at = now(), deleted_at = COALESCE(deleted_at, now())
    WHERE id = ANY(ids);
    GET DIAGNOSTICS n = ROW_COUNT;

    -- one audit row per client a trainer (or support) deleted on its own; an
    -- account erasure is recorded once, on its account row
    IF p_parent IS NULL THEN
        INSERT INTO erasure_log (kind, tenant_id, client_id, requested_by, completed_at)
        SELECT 'client', c.tenant_id, c.id, p_requested_by, now() FROM client c WHERE c.id = ANY(ids);
    END IF;

    PERFORM set_config('inclineyou.erasing', 'off', true);
    RETURN n;
END $$;

-- The one erasure a trainer starts from the app: one client they coach.
CREATE FUNCTION erase_client(p_client uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM client WHERE id = p_client AND erased_at IS NULL
                     AND trainer_id = app_trainer_id() AND tenant_id = ANY(app_tenant_ids())) THEN
        RAISE EXCEPTION 'client % is not one you coach', p_client USING ERRCODE = 'insufficient_privilege';
    END IF;
    PERFORM erase_clients(ARRAY[p_client], 'trainer');
END $$;

-- A person erased: their client rows on every roster, and, for a trainer, the
-- workspaces they own (closed for the purge) and their own profile. The row
-- ids stay as tombstones so other workspaces' rows still resolve.
CREATE FUNCTION erase_account(p_app_user uuid, p_requested_by text DEFAULT 'self') RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE
    person   app_user%ROWTYPE;
    tr       trainer%ROWTYPE;
    log_id   uuid;
    ws       record;
BEGIN
    SELECT * INTO person FROM app_user WHERE id = p_app_user AND erased_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no live account %', p_app_user USING ERRCODE = 'no_data_found';
    END IF;
    IF current_user = 'inclineyou_app' AND app_actor() <> 'system' AND person.phone IS DISTINCT FROM app_phone() THEN
        RAISE EXCEPTION 'an account can be erased only by its own person' USING ERRCODE = 'insufficient_privilege';
    END IF;
    PERFORM set_config('inclineyou.erasing', 'on', true);

    INSERT INTO erasure_log (kind, app_user_id, requested_by) VALUES ('account', person.id, p_requested_by)
    RETURNING id INTO log_id;

    -- as somebody's client, on every roster
    PERFORM erase_clients(ARRAY(SELECT id FROM client WHERE phone = person.phone), p_requested_by, log_id);

    SELECT * INTO tr FROM trainer WHERE app_user_id = person.id AND erased_at IS NULL;
    IF FOUND THEN
        -- the workspaces they own: every client in them, then closed for the purge
        FOR ws IN SELECT t.id FROM tenant t JOIN tenant_member tm ON tm.tenant_id = t.id
                  WHERE tm.app_user_id = person.id AND tm.role = 'owner' AND tm.deleted_at IS NULL AND t.status <> 'closed' LOOP
            PERFORM erase_clients(ARRAY(SELECT id FROM client WHERE tenant_id = ws.id), p_requested_by, log_id);
            UPDATE tenant SET status = 'closed', purge_after = now(), name = 'Closed workspace', metadata = '{}' WHERE id = ws.id;
            INSERT INTO erasure_log (kind, parent_id, tenant_id, requested_by) VALUES ('workspace', log_id, ws.id, p_requested_by);
        END LOOP;
        DELETE FROM trainer_business WHERE trainer_id = tr.id;
        DELETE FROM working_hours    WHERE trainer_id = tr.id;
        DELETE FROM nudge_template   WHERE trainer_id = tr.id;
        UPDATE subscription SET state = 'cancelled', cancelled_at = COALESCE(cancelled_at, now()) WHERE trainer_id = tr.id;
        UPDATE trainer SET name = NULL, email = NULL, gender = NULL, fcm_token = NULL, metadata = '{}',
                           erased_at = now(), deleted_at = COALESCE(deleted_at, now())
        WHERE id = tr.id;
    END IF;

    UPDATE tenant_member SET status = 'removed', ended_at = COALESCE(ended_at, now()), is_home = false
    WHERE app_user_id = person.id AND status <> 'removed';
    UPDATE web_session SET revoked_at = now(), revoked_reason = 'erased' WHERE app_user_id = person.id AND revoked_at IS NULL;
    UPDATE app_user SET phone = NULL, erased_at = now(), deleted_at = COALESCE(deleted_at, now()) WHERE id = person.id;
    UPDATE erasure_log SET completed_at = now() WHERE id = log_id;

    PERFORM set_config('inclineyou.erasing', 'off', true);
    RETURN log_id;
END $$;

-- Hard-deletes the rows of every closed workspace that is due. Run by a
-- scheduled job; the tenant row stays, because trainer.home_tenant_id and
-- other workspaces' rows point at it.
CREATE FUNCTION purge_closed_tenants() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE
    t       record;
    tbl     text;
    n       integer;
    counts  jsonb;
    done    integer := 0;
BEGIN
    PERFORM set_config('inclineyou.erasing', 'on', true);
    FOR t IN SELECT id FROM tenant WHERE status = 'closed' AND purged_at IS NULL AND purge_after <= now() FOR UPDATE LOOP
        counts := '{}';
        UPDATE web_session SET active_tenant_id = NULL WHERE active_tenant_id = t.id;
        UPDATE scheduled_session SET workout_id = NULL WHERE tenant_id = t.id;
        -- children first; a client referenced by an erasure record is already nameless and stays
        FOREACH tbl IN ARRAY ARRAY['set_log', 'session_exercise', 'nudge_log', 'package_adjustment', 'payment',
                                   'attention_dismissal', 'package', 'pack', 'scheduled_session', 'workout_set',
                                   'workout_exercise', 'workout', 'program', 'assessment', 'assessment_schedule',
                                   'assessment_template', 'client_note', 'client_schedule_slot', 'client_schedule',
                                   'client_assignment', 'trainer_payout', 'gym_arrangement', 'trainer_exercise',
                                   'tenant_invite'] LOOP
            IF tbl = 'workout_exercise' THEN
                EXECUTE 'DELETE FROM workout_exercise WHERE tenant_id = $1 AND alternative_of IS NOT NULL' USING t.id;
            END IF;
            IF tbl IN ('program', 'workout') THEN
                EXECUTE format('UPDATE %I SET %I = NULL WHERE tenant_id = $1', tbl,
                               CASE tbl WHEN 'program' THEN 'copied_from_program_id' ELSE 'copied_from_workout_id' END) USING t.id;
                IF tbl = 'program' THEN EXECUTE 'UPDATE program SET synced_at = NULL WHERE tenant_id = $1' USING t.id; END IF;
            END IF;
            EXECUTE format('DELETE FROM %I WHERE tenant_id = $1', tbl) USING t.id;
            GET DIAGNOSTICS n = ROW_COUNT;
            counts := counts || jsonb_build_object(tbl, n);
        END LOOP;
        DELETE FROM exercise WHERE tenant_id = t.id
            AND NOT EXISTS (SELECT 1 FROM workout_exercise we WHERE we.exercise_id = exercise.id)
            AND NOT EXISTS (SELECT 1 FROM session_exercise x WHERE x.exercise_id = exercise.id OR x.swapped_from_exercise_id = exercise.id);
        GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('exercise', n);
        DELETE FROM client WHERE tenant_id = t.id AND NOT EXISTS (SELECT 1 FROM erasure_log e WHERE e.client_id = client.id);
        GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('client', n);
        UPDATE tenant_member SET invited_by_member_id = NULL WHERE tenant_id = t.id;
        DELETE FROM tenant_member WHERE tenant_id = t.id;
        GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('tenant_member', n);
        UPDATE tenant SET purged_at = now() WHERE id = t.id;
        UPDATE erasure_log SET completed_at = now(), row_counts = counts WHERE kind = 'workspace' AND tenant_id = t.id AND completed_at IS NULL;
        done := done + 1;
    END LOOP;
    PERFORM set_config('inclineyou.erasing', 'off', true);
    RETURN done;
END $$;

-- ─── tables ──────────────────────────────────────────────────────────────

CREATE TABLE tenant (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type varchar(20) NOT NULL,
    name varchar(160) NOT NULL,
    status varchar(20) DEFAULT 'active' NOT NULL,
    country char(2) DEFAULT 'IN' NOT NULL,
    currency varchar(3) DEFAULT 'INR' NOT NULL,
    timezone varchar(64) DEFAULT 'Asia/Kolkata' NOT NULL,
    metadata jsonb DEFAULT '{}' NOT NULL,
    status_changed_at timestamptz DEFAULT now() NOT NULL,
    purge_after timestamptz,
    purged_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT tenant_pkey PRIMARY KEY (id),
    CONSTRAINT tenant_metadata_object CHECK ((jsonb_typeof(metadata) = 'object'::text)),
    CONSTRAINT tenant_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'suspended'::character varying, 'closed'::character varying])::text[]))),
    CONSTRAINT tenant_type CHECK (((type)::text = ANY ((ARRAY['solo'::character varying, 'team'::character varying, 'gym'::character varying])::text[]))),
    CONSTRAINT tenant_purge CHECK ((purge_after IS NULL OR status = 'closed') AND (purged_at IS NULL OR (status = 'closed' AND purge_after IS NOT NULL AND purged_at >= purge_after))),
    CONSTRAINT tenant_country_code CHECK (country ~ '^[A-Z]{2}$'),
    CONSTRAINT tenant_currency_code CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE TABLE tenant_member (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    tenant_type varchar(20) NOT NULL,
    app_user_id uuid NOT NULL,
    role varchar(20) NOT NULL,
    status varchar(20) DEFAULT 'active' NOT NULL,
    is_home boolean DEFAULT false NOT NULL,
    invited_by_member_id uuid,
    joined_at timestamptz DEFAULT now() NOT NULL,
    ended_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    CONSTRAINT tenant_member_pkey PRIMARY KEY (id),
    CONSTRAINT tenant_member_status CHECK (status IN ('active', 'removed')),
    CONSTRAINT tenant_member_ended CHECK ((status = 'removed') = (ended_at IS NOT NULL)),
    CONSTRAINT tenant_member_home_live CHECK (NOT (is_home AND status = 'removed'))
);

CREATE TABLE tenant_role (
    tenant_type varchar(20) NOT NULL,
    role varchar(20) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT tenant_role_pkey PRIMARY KEY (tenant_type, role),
    CONSTRAINT tenant_role_type CHECK (tenant_type IN ('solo', 'team', 'gym'))
);

CREATE TABLE tenant_invite (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    tenant_type varchar(20) NOT NULL,
    phone varchar(16) NOT NULL,
    role varchar(20) NOT NULL,
    invited_by_member_id uuid NOT NULL,
    status varchar(20) DEFAULT 'pending' NOT NULL,
    expires_at timestamptz DEFAULT (now() + '14 days'::interval) NOT NULL,
    responded_at timestamptz,
    member_id uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT tenant_invite_pkey PRIMARY KEY (id),
    CONSTRAINT tenant_invite_status CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
    CONSTRAINT tenant_invite_not_owner CHECK (role <> 'owner'),
    CONSTRAINT tenant_invite_responded CHECK ((status = 'pending') = (responded_at IS NULL)),
    CONSTRAINT tenant_invite_member CHECK ((status = 'accepted') = (member_id IS NOT NULL)),
    CONSTRAINT tenant_invite_phone_format CHECK (phone ~ '^\+[1-9][0-9]{6,14}$' AND (phone !~ '^\+91' OR phone ~ '^\+91[6-9][0-9]{9}$'))
);

CREATE TABLE app_user (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone varchar(16),
    role varchar(20) NOT NULL,
    privacy_accepted_at timestamptz,
    privacy_policy_version varchar(20),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    erased_at timestamptz,
    CONSTRAINT app_user_pkey PRIMARY KEY (id),
    CONSTRAINT app_user_role CHECK (((role)::text = ANY ((ARRAY['trainer'::character varying, 'client'::character varying, 'gym_admin'::character varying])::text[]))),
    CONSTRAINT app_user_erased CHECK ((erased_at IS NULL) = (phone IS NOT NULL) AND (erased_at IS NULL OR deleted_at IS NOT NULL)),
    CONSTRAINT app_user_phone_format CHECK (phone IS NULL OR (phone ~ '^\+[1-9][0-9]{6,14}$' AND (phone !~ '^\+91' OR phone ~ '^\+91[6-9][0-9]{9}$'))),
    CONSTRAINT app_user_privacy_pair CHECK ((privacy_accepted_at IS NULL) = (privacy_policy_version IS NULL))
);

CREATE TABLE otp_request (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone varchar(16) NOT NULL,
    purpose varchar(20) NOT NULL,
    otp_hash varchar(255) NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    wrong_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamptz,
    request_ip inet,
    provider_message_id varchar(100),
    delivery_status varchar(12),
    delivery_error varchar(64),
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT otp_request_pkey PRIMARY KEY (id),
    CONSTRAINT otp_request_purpose CHECK (purpose IN ('sign_in', 'change_phone_old', 'change_phone_new')),
    CONSTRAINT otp_request_phone_format CHECK (phone ~ '^\+[1-9][0-9]{6,14}$' AND (phone !~ '^\+91' OR phone ~ '^\+91[6-9][0-9]{9}$')),
    CONSTRAINT otp_request_delivery_status CHECK (delivery_status IS NULL OR delivery_status IN ('queued', 'sent', 'delivered', 'read', 'failed')),
    CONSTRAINT otp_request_delivery_error CHECK (delivery_error IS NULL OR delivery_status = 'failed'),
    CONSTRAINT otp_request_window CHECK (expires_at > created_at AND (consumed_at IS NULL OR consumed_at >= created_at) AND wrong_attempts >= 0)
);

CREATE TABLE trainer (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    app_user_id uuid NOT NULL,
    name varchar(100),
    email varchar(254),
    gender varchar(24),
    timezone varchar(64) DEFAULT 'Asia/Kolkata' NOT NULL,
    metadata jsonb DEFAULT '{}' NOT NULL,
    fcm_token text,
    setup_completed_at timestamptz,
    home_tenant_id uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    erased_at timestamptz,
    CONSTRAINT trainer_pkey PRIMARY KEY (id),
    CONSTRAINT trainer_metadata_object CHECK ((jsonb_typeof(metadata) = 'object'::text)),
    CONSTRAINT trainer_erased_scrubbed CHECK (erased_at IS NULL AND name IS NOT NULL OR erased_at IS NOT NULL AND deleted_at IS NOT NULL AND name IS NULL AND email IS NULL AND gender IS NULL AND fcm_token IS NULL AND metadata = '{}')
);

CREATE TABLE trainer_business (
    trainer_id uuid NOT NULL,
    training_modes jsonb DEFAULT '[]' NOT NULL,
    service_areas jsonb DEFAULT '[]' NOT NULL,
    map_link text,
    gym_name varchar(120),
    upi_vpa varchar(100),
    experience_band varchar(20),
    certifications jsonb DEFAULT '[]' NOT NULL,
    specialities jsonb DEFAULT '[]' NOT NULL,
    languages jsonb DEFAULT '[]' NOT NULL,
    headline text,
    bio text,
    intro_video_url text,
    instagram_url text,
    youtube_url text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT trainer_business_pkey PRIMARY KEY (trainer_id),
    CONSTRAINT trainer_business_link_scheme CHECK ((((map_link IS NULL) OR (map_link ~* '^https?://'::text)) AND ((intro_video_url IS NULL) OR (intro_video_url ~* '^https://'::text)) AND ((instagram_url IS NULL) OR (instagram_url ~* '^https://'::text)) AND ((youtube_url IS NULL) OR (youtube_url ~* '^https://'::text)))),
    CONSTRAINT trainer_business_lists_are_arrays CHECK (((jsonb_typeof(specialities) = 'array'::text) AND (jsonb_typeof(certifications) = 'array'::text) AND (jsonb_typeof(languages) = 'array'::text) AND (jsonb_typeof(training_modes) = 'array'::text) AND (jsonb_typeof(service_areas) = 'array'::text))),
    CONSTRAINT trainer_business_gym_needs_floor CHECK ((gym_name IS NULL) OR (training_modes ? 'gym_floor'::text))
);

CREATE TABLE web_session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_hash varchar(64) NOT NULL,
    app_user_id uuid NOT NULL,
    role varchar(20) NOT NULL,
    active_tenant_id uuid,
    issued_at timestamptz DEFAULT now() NOT NULL,
    last_seen_at timestamptz DEFAULT now() NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    revoked_reason varchar(16),
    user_agent varchar(300),
    created_ip inet,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT web_session_pkey PRIMARY KEY (id),
    CONSTRAINT web_session_role CHECK (role IN ('trainer', 'client', 'gym_admin')),
    CONSTRAINT web_session_window CHECK (expires_at > issued_at),
    CONSTRAINT web_session_revoked CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL) AND (revoked_at IS NULL OR revoked_at >= issued_at)),
    CONSTRAINT web_session_revoked_reason CHECK (revoked_reason IS NULL OR revoked_reason IN ('sign_out', 'sign_out_all', 'phone_changed', 'erased', 'support'))
);

CREATE TABLE subscription (
    trainer_id uuid NOT NULL,
    plan varchar(12) DEFAULT 'pro' NOT NULL,
    state varchar(12) DEFAULT 'trialing' NOT NULL,
    price_amount numeric(10,2) NOT NULL,
    currency varchar(3) NOT NULL,
    billing_country char(2) DEFAULT 'IN' NOT NULL,
    price_region varchar(16) DEFAULT 'india' NOT NULL,
    plan_price_id uuid NOT NULL,
    trial_started_at timestamptz DEFAULT now() NOT NULL,
    trial_ends_at timestamptz DEFAULT (now() + '30 days'::interval) NOT NULL,
    current_period_end timestamptz,
    grace_until timestamptz,
    provider varchar(16),
    provider_customer_id varchar(64),
    provider_mandate_id varchar(64),
    cancelled_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT subscription_pkey PRIMARY KEY (trainer_id),
    CONSTRAINT subscription_plan CHECK (plan IN ('free', 'pro', 'team')),
    CONSTRAINT subscription_state CHECK (state IN ('trialing', 'active', 'past_due', 'grace', 'cancelled')),
    CONSTRAINT subscription_provider CHECK (provider IS NULL OR provider IN ('razorpay', 'cashfree', 'manual')),
    CONSTRAINT subscription_trial_window CHECK (trial_ends_at > trial_started_at),
    CONSTRAINT subscription_price CHECK (price_amount > 0 AND currency ~ '^[A-Z]{3}$' AND (billing_country <> 'IN' OR currency = 'INR')),
    CONSTRAINT subscription_billing_country CHECK (billing_country ~ '^[A-Z]{2}$'),
    CONSTRAINT subscription_price_region CHECK (price_region IN ('india', 'europe', 'asia', 'rest_of_world')),
    CONSTRAINT subscription_region_country CHECK ((billing_country = 'IN') = (price_region = 'india')),
    CONSTRAINT subscription_state_shape CHECK ((state <> 'trialing' OR plan = 'pro') AND (plan <> 'free' OR state IN ('active', 'cancelled')) AND (state NOT IN ('active', 'past_due') OR plan = 'free' OR (provider IS NOT NULL AND current_period_end IS NOT NULL)) AND (state <> 'grace' OR grace_until IS NOT NULL) AND (state <> 'cancelled' OR cancelled_at IS NOT NULL) AND (provider IS NOT NULL OR (provider_customer_id IS NULL AND provider_mandate_id IS NULL)))
);

CREATE TABLE plan_price (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan varchar(12) NOT NULL,
    region varchar(16) NOT NULL,
    currency varchar(3) NOT NULL,
    amount numeric(10,2) NOT NULL,
    valid_from timestamptz NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT plan_price_pkey PRIMARY KEY (id),
    CONSTRAINT plan_price_plan CHECK (plan IN ('pro', 'team')),
    CONSTRAINT plan_price_region CHECK (region IN ('india', 'europe', 'asia', 'rest_of_world')),
    CONSTRAINT plan_price_currency_code CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT plan_price_india_inr CHECK (region <> 'india' OR currency = 'INR'),
    CONSTRAINT plan_price_amount CHECK (amount > 0)
);

CREATE TABLE billing_event (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider varchar(16) NOT NULL,
    provider_event_id varchar(100) NOT NULL,
    event_type varchar(60) NOT NULL,
    trainer_id uuid,
    occurred_at timestamptz,
    received_at timestamptz DEFAULT now() NOT NULL,
    processed_at timestamptz,
    outcome varchar(12),
    payload jsonb DEFAULT '{}' NOT NULL,
    CONSTRAINT billing_event_pkey PRIMARY KEY (id),
    CONSTRAINT billing_event_provider CHECK (provider IN ('razorpay', 'cashfree', 'manual')),
    CONSTRAINT billing_event_outcome CHECK (outcome IS NULL OR outcome IN ('applied', 'duplicate', 'stale', 'ignored', 'unmatched', 'failed')),
    CONSTRAINT billing_event_processed CHECK ((outcome IS NULL) = (processed_at IS NULL)),
    CONSTRAINT billing_event_unmatched CHECK (trainer_id IS NOT NULL OR outcome IS NULL OR outcome IN ('unmatched', 'failed')),
    CONSTRAINT billing_event_payload_object CHECK (jsonb_typeof(payload) = 'object')
);

CREATE TABLE client (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    trainer_id uuid NOT NULL,
    name varchar(100),
    phone varchar(16),
    date_of_birth date,
    goal text,
    height_cm numeric(5,1),
    activity_level varchar(20),
    timezone varchar(64),
    metadata jsonb,
    status varchar(20) DEFAULT 'active' NOT NULL,
    paused_at timestamptz,
    paused_until date,
    archived_at timestamptz,
    archive_reason varchar(20),
    archive_note varchar(200),
    client_type varchar(12) NOT NULL,
    membership_status varchar(20) DEFAULT 'not_invited' NOT NULL,
    invited_at timestamptz,
    accepted_at timestamptz,
    declined_at timestamptz,
    removed_at timestamptz,
    removed_ack_at timestamptz,
    stale_at timestamptz,
    stale_reason varchar(40),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    erased_at timestamptz,
    CONSTRAINT client_pkey PRIMARY KEY (id),
    CONSTRAINT client_name_present CHECK (name IS NULL OR btrim(name) <> ''),
    CONSTRAINT client_text_lengths CHECK ((goal IS NULL OR char_length(goal) <= 1000) AND (archive_note IS NULL OR char_length(archive_note) <= 200)),
    CONSTRAINT client_phone_format CHECK (phone IS NULL OR (phone ~ '^\+[1-9][0-9]{6,14}$' AND (phone !~ '^\+91' OR phone ~ '^\+91[6-9][0-9]{9}$'))),
    CONSTRAINT client_adult CHECK (date_of_birth IS NULL OR date_of_birth <= ((updated_at AT TIME ZONE 'UTC') - INTERVAL '18 years')::date),
    CONSTRAINT client_birth_date_floor CHECK (date_of_birth IS NULL OR date_of_birth >= DATE '1900-01-01'),
    CONSTRAINT client_physical_ranges CHECK (height_cm IS NULL OR height_cm BETWEEN 50 AND 250),
    CONSTRAINT client_activity_level CHECK (activity_level IS NULL OR activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
    CONSTRAINT client_metadata_object CHECK (metadata IS NULL OR jsonb_typeof(metadata) = 'object'),
    CONSTRAINT client_status CHECK (status IN ('active', 'paused', 'inactive', 'archived')),
    CONSTRAINT client_status_dates CHECK ((status = 'paused') = (paused_at IS NOT NULL) AND (status = 'archived') = (archived_at IS NOT NULL)),
    CONSTRAINT client_type CHECK (client_type IN ('independent', 'gym')),
    CONSTRAINT client_pause_window CHECK (paused_until IS NULL OR status = 'paused'),
    CONSTRAINT client_archive CHECK ((archived_at IS NULL) = (archive_reason IS NULL) AND (archive_note IS NULL OR archived_at IS NOT NULL)),
    CONSTRAINT client_archive_reason CHECK (archive_reason IS NULL OR archive_reason IN ('goal_reached', 'moved_away', 'cost', 'no_time', 'switched_trainer', 'other')),
    CONSTRAINT client_membership_status CHECK (membership_status IN ('not_invited', 'invited', 'accepted', 'declined', 'paused', 'removed')),
    CONSTRAINT client_membership_dates CHECK ((membership_status IN ('not_invited', 'removed') OR invited_at IS NOT NULL) AND (membership_status <> 'accepted' OR accepted_at IS NOT NULL) AND (membership_status <> 'declined' OR declined_at IS NOT NULL) AND (membership_status <> 'removed' OR removed_at IS NOT NULL)),
    CONSTRAINT client_stale_pair CHECK ((stale_at IS NULL) = (stale_reason IS NULL)),
    CONSTRAINT client_stale_reason CHECK (stale_reason IS NULL OR stale_reason IN ('trainer_left', 'trainer_unavailable', 'manual')),
    CONSTRAINT client_erased_scrubbed CHECK (erased_at IS NULL AND name IS NOT NULL OR erased_at IS NOT NULL AND deleted_at IS NOT NULL AND name IS NULL AND phone IS NULL AND goal IS NULL AND metadata IS NULL AND height_cm IS NULL AND activity_level IS NULL AND date_of_birth IS NULL AND timezone IS NULL AND archive_note IS NULL)
);

CREATE TABLE client_schedule (
    client_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    sessions_per_week smallint,
    session_duration_minutes smallint,
    delivery_mode varchar(16),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT client_schedule_pkey PRIMARY KEY (client_id),
    CONSTRAINT client_schedule_ranges CHECK ((sessions_per_week IS NULL OR sessions_per_week BETWEEN 0 AND 14) AND (session_duration_minutes IS NULL OR session_duration_minutes BETWEEN 1 AND 480)),
    CONSTRAINT client_schedule_delivery_mode CHECK (delivery_mode IS NULL OR delivery_mode IN ('floor', 'home_visit', 'remote'))
);

CREATE TABLE client_schedule_slot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    client_id uuid NOT NULL,
    weekday smallint NOT NULL,
    start_time time NOT NULL,
    duration_minutes smallint,
    delivery_mode varchar(16),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    CONSTRAINT client_schedule_slot_pkey PRIMARY KEY (id),
    CONSTRAINT client_schedule_slot_weekday CHECK (weekday BETWEEN 1 AND 7),
    CONSTRAINT client_schedule_slot_duration CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 480),
    CONSTRAINT client_schedule_slot_delivery_mode CHECK (delivery_mode IS NULL OR delivery_mode IN ('floor', 'home_visit', 'remote'))
);

CREATE TABLE client_note (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    client_id uuid NOT NULL,
    trainer_id uuid NOT NULL,
    body text NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    CONSTRAINT client_note_pkey PRIMARY KEY (id),
    CONSTRAINT client_note_body CHECK (btrim(body) <> '' AND char_length(body) <= 4000)
);

CREATE TABLE assessment_schedule (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    trainer_id uuid NOT NULL,
    client_id uuid NOT NULL,
    template_id uuid NOT NULL,
    interval_days smallint NOT NULL,
    next_due_on date NOT NULL,
    ended_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    CONSTRAINT assessment_schedule_pkey PRIMARY KEY (id),
    CONSTRAINT assessment_schedule_interval CHECK (interval_days BETWEEN 1 AND 366),
    CONSTRAINT assessment_schedule_ended CHECK (ended_at IS NULL OR ended_at >= created_at)
);

CREATE TABLE assessment_template (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    trainer_id uuid NOT NULL,
    name varchar(120) NOT NULL,
    description text,
    measurements jsonb DEFAULT '{"on": true, "keys": []}' NOT NULL,
    questions jsonb DEFAULT '{"on": true, "items": []}' NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    CONSTRAINT assessment_template_pkey PRIMARY KEY (id),
    CONSTRAINT assessment_template_name CHECK (btrim(name) <> ''),
    CONSTRAINT assessment_template_description_length CHECK (description IS NULL OR char_length(description) <= 2000),
    CONSTRAINT assessment_template_measurements_shape CHECK (jsonb_typeof(measurements) = 'object' AND jsonb_typeof(measurements->'on') = 'boolean' AND jsonb_typeof(measurements->'keys') = 'array'),
    CONSTRAINT assessment_template_questions_shape CHECK (jsonb_typeof(questions) = 'object' AND jsonb_typeof(questions->'on') = 'boolean' AND jsonb_typeof(questions->'items') = 'array' AND jsonb_array_length(questions->'items') <= 50)
);

CREATE TABLE assessment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    trainer_id uuid NOT NULL,
    client_id uuid NOT NULL,
    template_id uuid NOT NULL,
    schedule_id uuid,
    name varchar(120) NOT NULL,
    form jsonb NOT NULL,
    due_on date NOT NULL,
    sent_at timestamptz,
    completed_at timestamptz,
    read_at timestamptz,
    entered_by varchar(8),
    readings jsonb DEFAULT '{}' NOT NULL,
    answers jsonb DEFAULT '{}' NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    CONSTRAINT assessment_pkey PRIMARY KEY (id),
    CONSTRAINT assessment_name CHECK (btrim(name) <> ''),
    CONSTRAINT assessment_form_shape CHECK (jsonb_typeof(form) = 'object' AND jsonb_typeof(form->'measurements') = 'array' AND jsonb_typeof(form->'questions') = 'array'),
    CONSTRAINT assessment_readings_valid CHECK (assessment_readings_valid(form, readings)),
    CONSTRAINT assessment_answers_valid CHECK (assessment_answers_valid(form, answers)),
    CONSTRAINT assessment_entered_by CHECK (entered_by IS NULL OR entered_by IN ('client', 'trainer')),
    CONSTRAINT assessment_entered_by_on_completion CHECK ((completed_at IS NULL) = (entered_by IS NULL)),
    CONSTRAINT assessment_read_after_return CHECK (read_at IS NULL OR completed_at IS NOT NULL)
);

CREATE TABLE program (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    origin varchar(12) NOT NULL,
    tenant_id uuid,
    trainer_id uuid,
    client_id uuid,
    name varchar(150) NOT NULL,
    goal varchar(16),
    description text,
    weeks smallint DEFAULT 1 NOT NULL,
    days smallint DEFAULT 1 NOT NULL,
    status varchar(16),
    start_date date,
    end_date date,
    copied_from_program_id uuid,
    synced_at timestamptz,
    revised_at timestamptz DEFAULT now() NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    CONSTRAINT program_pkey PRIMARY KEY (id),
    CONSTRAINT program_name CHECK (btrim(name) <> ''),
    CONSTRAINT program_goal CHECK (goal IS NULL OR goal IN ('weight_loss', 'strength', 'muscle_gain', 'rehab', 'general')),
    CONSTRAINT program_description CHECK (description IS NULL OR char_length(description) <= 2000),
    CONSTRAINT program_length CHECK (weeks BETWEEN 1 AND 52 AND days BETWEEN 1 AND 7),
    CONSTRAINT program_status CHECK (status IS NULL OR status IN ('active', 'paused', 'completed')),
    CONSTRAINT program_kind CHECK ((client_id IS NULL) = (status IS NULL) AND (client_id IS NOT NULL OR (start_date IS NULL AND end_date IS NULL))),
    CONSTRAINT program_dates CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date),
    CONSTRAINT program_copied_from CHECK ((synced_at IS NULL) = (copied_from_program_id IS NULL)),
    CONSTRAINT program_origin_ownership CHECK ((origin = 'inclineyou' AND trainer_id IS NULL AND tenant_id IS NULL AND client_id IS NULL) OR (origin = 'trainer' AND trainer_id IS NOT NULL AND tenant_id IS NOT NULL))
);

CREATE TABLE certified_program (
    program_id uuid NOT NULL,
    origin varchar(12) DEFAULT 'inclineyou' NOT NULL,
    summary varchar(300) NOT NULL,
    level varchar(16) NOT NULL,
    equipment varchar(16) NOT NULL,
    reviewed_at timestamptz,
    is_sample boolean DEFAULT false NOT NULL,
    used_count integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT certified_program_pkey PRIMARY KEY (program_id),
    CONSTRAINT certified_program_origin CHECK (origin = 'inclineyou'),
    CONSTRAINT certified_program_summary CHECK (btrim(summary) <> ''),
    CONSTRAINT certified_program_level CHECK (level IN ('beginner', 'intermediate', 'advanced')),
    CONSTRAINT certified_program_equipment CHECK (equipment IN ('full_gym', 'dumbbells', 'bodyweight')),
    CONSTRAINT certified_program_used_count CHECK (used_count >= 0),
    CONSTRAINT certified_program_sample CHECK (NOT is_sample OR reviewed_at IS NULL)
);

CREATE TABLE workout (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    origin varchar(12) NOT NULL,
    tenant_id uuid,
    trainer_id uuid,
    program_id uuid,
    week smallint,
    day smallint,
    position smallint,
    name varchar(120) NOT NULL,
    notes text,
    copied_from_workout_id uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    CONSTRAINT workout_pkey PRIMARY KEY (id),
    CONSTRAINT workout_name CHECK (btrim(name) <> ''),
    CONSTRAINT workout_notes CHECK (notes IS NULL OR char_length(notes) <= 2000),
    CONSTRAINT workout_placement CHECK ((program_id IS NULL) = (week IS NULL) AND (program_id IS NULL) = (day IS NULL) AND (program_id IS NULL) = (position IS NULL)),
    CONSTRAINT workout_origin_ownership CHECK ((origin = 'inclineyou' AND trainer_id IS NULL AND tenant_id IS NULL) OR (origin = 'trainer' AND trainer_id IS NOT NULL AND tenant_id IS NOT NULL)),
    CONSTRAINT workout_ranges CHECK ((week IS NULL OR week BETWEEN 1 AND 52) AND (day IS NULL OR day BETWEEN 1 AND 7) AND (position IS NULL OR position >= 0))
);

CREATE TABLE workout_exercise (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    workout_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    position smallint NOT NULL,
    alternative_of uuid,
    main_id uuid GENERATED ALWAYS AS (CASE WHEN alternative_of IS NULL THEN id END) STORED,
    group_id uuid,
    section varchar(60),
    notes text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT workout_exercise_pkey PRIMARY KEY (id),
    CONSTRAINT workout_exercise_position CHECK (position >= 0),
    CONSTRAINT workout_exercise_alternative CHECK (alternative_of IS NULL OR (position BETWEEN 1 AND 2 AND group_id IS NULL AND section IS NULL)),
    CONSTRAINT workout_exercise_text CHECK ((section IS NULL OR btrim(section) <> '') AND (notes IS NULL OR char_length(notes) <= 500))
);

CREATE TABLE workout_set (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    workout_exercise_id uuid NOT NULL,
    position smallint NOT NULL,
    load_kind varchar(16) DEFAULT 'weight' NOT NULL,
    load_value numeric(7,2),
    effort_kind varchar(16) DEFAULT 'reps' NOT NULL,
    effort_value numeric(8,2),
    rest_seconds smallint,
    tempo varchar(20),
    notes varchar(200),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT workout_set_pkey PRIMARY KEY (id),
    CONSTRAINT workout_set_position CHECK (position BETWEEN 1 AND 30),
    CONSTRAINT workout_set_load_kind CHECK (load_kind IN ('percent_1rm', 'level', 'weight', 'weight_range', 'bodyweight', 'rpe_level', 'rpe_weight')),
    CONSTRAINT workout_set_effort_kind CHECK (effort_kind IN ('reps', 'rep_interval', 'time', 'distance', 'max_reps', 'max_time', 'max_distance')),
    CONSTRAINT workout_set_values CHECK ((load_value IS NULL OR load_value >= 0) AND (effort_value IS NULL OR effort_value >= 0) AND (load_kind <> 'bodyweight' OR load_value IS NULL) AND (effort_kind NOT LIKE 'max\_%' OR effort_value IS NULL) AND (rest_seconds IS NULL OR rest_seconds BETWEEN 0 AND 3600))
);

CREATE TABLE scheduled_session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    trainer_id uuid NOT NULL,
    client_id uuid NOT NULL,
    workout_id uuid,
    slot_id uuid,
    scheduled_at timestamptz NOT NULL,
    duration_minutes smallint NOT NULL,
    ends_at timestamptz NOT NULL,
    status varchar(20) DEFAULT 'scheduled' NOT NULL,
    delivery_mode varchar(16),
    notes text,
    started_at timestamptz,
    ended_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    CONSTRAINT scheduled_session_pkey PRIMARY KEY (id),
    CONSTRAINT scheduled_session_status CHECK (status IN ('scheduled', 'done', 'no_show', 'cancelled')),
    CONSTRAINT scheduled_session_delivery_mode CHECK (delivery_mode IS NULL OR delivery_mode IN ('floor', 'home_visit', 'remote')),
    CONSTRAINT scheduled_session_duration CHECK (duration_minutes BETWEEN 1 AND 480),
    CONSTRAINT scheduled_session_ends CHECK (ends_at > scheduled_at),
    CONSTRAINT scheduled_session_log CHECK ((started_at IS NULL OR status IN ('scheduled', 'done')) AND (ended_at IS NULL OR (started_at IS NOT NULL AND ended_at >= started_at)))
);

CREATE TABLE working_hours (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    weekday smallint NOT NULL,
    start_time time NOT NULL,
    end_time time NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    CONSTRAINT working_hours_pkey PRIMARY KEY (id),
    CONSTRAINT working_hours_weekday CHECK (weekday BETWEEN 1 AND 7),
    CONSTRAINT working_hours_window CHECK (start_time < end_time)
);

CREATE TABLE session_exercise (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    session_id uuid NOT NULL,
    client_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    position smallint NOT NULL,
    source varchar(12) DEFAULT 'planned' NOT NULL,
    planned_from uuid,
    swapped_from_exercise_id uuid,
    swap_reason varchar(16),
    removed_at timestamptz,
    notes varchar(500),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT session_exercise_pkey PRIMARY KEY (id),
    CONSTRAINT session_exercise_position CHECK (position >= 0),
    CONSTRAINT session_exercise_source CHECK (source IN ('planned', 'added')),
    CONSTRAINT session_exercise_swap CHECK ((swapped_from_exercise_id IS NULL OR swapped_from_exercise_id <> exercise_id) AND (swap_reason IS NULL OR (swapped_from_exercise_id IS NOT NULL AND swap_reason IN ('unavailable', 'difficulty'))))
);

CREATE TABLE set_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    session_exercise_id uuid NOT NULL,
    position smallint NOT NULL,
    planned boolean DEFAULT true NOT NULL,
    load_kind varchar(16) NOT NULL,
    effort_kind varchar(16) NOT NULL,
    target_load_value numeric(7,2),
    target_effort_value numeric(8,2),
    rest_seconds smallint,
    tempo varchar(20),
    load_value numeric(7,2),
    effort_value numeric(8,2),
    rpe numeric(3,1),
    notes varchar(200),
    done_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT set_log_pkey PRIMARY KEY (id),
    CONSTRAINT set_log_position CHECK (position BETWEEN 1 AND 50),
    CONSTRAINT set_log_kinds CHECK (load_kind IN ('percent_1rm', 'level', 'weight', 'weight_range', 'bodyweight', 'rpe_level', 'rpe_weight') AND effort_kind IN ('reps', 'rep_interval', 'time', 'distance', 'max_reps', 'max_time', 'max_distance')),
    CONSTRAINT set_log_targets CHECK ((target_load_value IS NULL OR (target_load_value >= 0 AND load_kind <> 'bodyweight')) AND (target_effort_value IS NULL OR (target_effort_value >= 0 AND effort_kind NOT LIKE 'max\_%')) AND (planned OR (target_load_value IS NULL AND target_effort_value IS NULL)) AND (rest_seconds IS NULL OR rest_seconds BETWEEN 0 AND 3600)),
    CONSTRAINT set_log_actuals CHECK ((load_value IS NULL OR load_value BETWEEN 0 AND 2000) AND (effort_value IS NULL OR effort_value BETWEEN 0 AND 86400) AND (rpe IS NULL OR (rpe BETWEEN 1 AND 10 AND rpe * 2 = trunc(rpe * 2)))),
    CONSTRAINT set_log_done CHECK ((done_at IS NULL AND num_nonnulls(load_value, effort_value, rpe) = 0 AND planned) OR (done_at IS NOT NULL AND num_nonnulls(load_value, effort_value) >= 1))
);

CREATE TABLE erasure_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind varchar(12) NOT NULL,
    parent_id uuid,
    app_user_id uuid,
    tenant_id uuid,
    client_id uuid,
    requested_by varchar(12) NOT NULL,
    requested_at timestamptz DEFAULT now() NOT NULL,
    completed_at timestamptz,
    row_counts jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT erasure_log_pkey PRIMARY KEY (id),
    CONSTRAINT erasure_log_kind CHECK (kind IN ('account', 'workspace', 'client')),
    CONSTRAINT erasure_log_requested_by CHECK (requested_by IN ('self', 'trainer', 'support')),
    CONSTRAINT erasure_log_subject CHECK ((kind = 'account' AND app_user_id IS NOT NULL AND tenant_id IS NULL AND client_id IS NULL AND parent_id IS NULL AND requested_by <> 'trainer') OR (kind = 'workspace' AND tenant_id IS NOT NULL AND app_user_id IS NULL AND client_id IS NULL) OR (kind = 'client' AND client_id IS NOT NULL AND tenant_id IS NOT NULL AND app_user_id IS NULL AND parent_id IS NULL AND requested_by <> 'self')),
    CONSTRAINT erasure_log_counts_object CHECK (jsonb_typeof(row_counts) = 'object')
);

CREATE TABLE exercise (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name varchar(150) NOT NULL,
    muscle_group varchar(50),
    equipment varchar(50),
    movement_pattern varchar(50),
    description text,
    origin varchar(12) NOT NULL,
    trainer_id uuid,
    source_id varchar(100),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    level varchar(20),
    metadata jsonb,
    log_type varchar(20),
    body_part varchar(30),
    target varchar(50),
    tenant_id uuid,
    status varchar(12) DEFAULT 'published' NOT NULL,
    secondary_targets jsonb,
    form_cues jsonb,
    CONSTRAINT exercise_pkey PRIMARY KEY (id),
    CONSTRAINT exercise_draft_trainer_only CHECK ((((status)::text <> 'draft'::text) OR ((origin)::text = 'trainer'::text))),
    CONSTRAINT exercise_log_type CHECK (((log_type IS NULL) OR ((log_type)::text = ANY ((ARRAY['weight_reps'::character varying, 'reps'::character varying])::text[])))),
    CONSTRAINT exercise_metadata_object CHECK (((metadata IS NULL) OR (jsonb_typeof(metadata) = 'object'::text))),
    CONSTRAINT exercise_origin_ownership CHECK (((((origin)::text = 'inclineyou'::text) AND (trainer_id IS NULL) AND (tenant_id IS NULL) AND (source_id IS NOT NULL)) OR (((origin)::text = 'trainer'::text) AND (trainer_id IS NOT NULL) AND (tenant_id IS NOT NULL) AND (source_id IS NULL)))),
    CONSTRAINT exercise_status CHECK (((status)::text = ANY ((ARRAY['published'::character varying, 'draft'::character varying])::text[])))
);

CREATE TABLE trainer_exercise (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    is_favourite boolean DEFAULT false NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    tenant_id uuid NOT NULL,
    CONSTRAINT trainer_exercise_pkey PRIMARY KEY (id)
);

CREATE TABLE pack (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    name varchar(80) NOT NULL,
    service varchar(12) NOT NULL,
    basis varchar(10) DEFAULT 'sessions' NOT NULL,
    sessions integer,
    amount numeric(10,2) NOT NULL,
    currency varchar(3) NOT NULL,
    validity_days integer,
    status varchar(20) DEFAULT 'active' NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    owner varchar(20) DEFAULT 'trainer' NOT NULL,
    trainer_share_percent numeric(5,2),
    trainer_share_amount numeric(10,2),
    tenant_id uuid NOT NULL,
    CONSTRAINT pack_pkey PRIMARY KEY (id),
    CONSTRAINT pack_amount_nonnegative CHECK ((amount >= (0)::numeric)),
    CONSTRAINT pack_currency_code CHECK (((currency)::text ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT pack_owner CHECK (((owner)::text = ANY ((ARRAY['trainer'::character varying, 'gym'::character varying])::text[]))),
    CONSTRAINT pack_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying])::text[]))),
    CONSTRAINT pack_service CHECK (service IN ('floor', 'home_visit', 'remote', 'programming')),
    CONSTRAINT pack_basis CHECK (basis IN ('sessions', 'period') AND (basis = 'sessions') = (sessions IS NOT NULL) AND (sessions IS NULL OR sessions BETWEEN 1 AND 500) AND (basis = 'sessions' OR validity_days IS NOT NULL) AND (validity_days IS NULL OR validity_days BETWEEN 1 AND 730) AND (service <> 'programming' OR basis = 'period')),
    CONSTRAINT pack_gym_floor CHECK (owner <> 'gym' OR service = 'floor'),
    CONSTRAINT pack_trainer_share CHECK ((owner = 'gym') = (num_nonnulls(trainer_share_percent, trainer_share_amount) = 1) AND (trainer_share_percent IS NULL OR trainer_share_percent BETWEEN 0 AND 100) AND (trainer_share_amount IS NULL OR trainer_share_amount BETWEEN 0 AND amount))
);

CREATE TABLE package (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    client_id uuid NOT NULL,
    name varchar(80) NOT NULL,
    service varchar(12) NOT NULL,
    basis varchar(10) DEFAULT 'sessions' NOT NULL,
    sessions_total integer,
    sessions_remaining integer,
    amount numeric(10,2) NOT NULL,
    currency varchar(3) NOT NULL,
    start_date date,
    end_date date,
    status varchar(20) DEFAULT 'active' NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    pack_id uuid,
    due_date date,
    discount_amount numeric(10,2),
    trainer_share_percent numeric(5,2),
    trainer_share_amount numeric(10,2),
    paused_at timestamptz,
    paused_days integer DEFAULT 0 NOT NULL,
    closed_at timestamptz,
    tenant_id uuid NOT NULL,
    CONSTRAINT package_pkey PRIMARY KEY (id),
    CONSTRAINT package_amount_nonnegative CHECK ((amount >= (0)::numeric)),
    CONSTRAINT package_currency_code CHECK (((currency)::text ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT package_discount_nonnegative CHECK (((discount_amount IS NULL) OR (discount_amount >= (0)::numeric))),
    CONSTRAINT package_paused_days_nonnegative CHECK ((paused_days >= 0)),
    CONSTRAINT package_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'completed'::character varying, 'expired'::character varying, 'cancelled'::character varying, 'refunded'::character varying])::text[]))),
    CONSTRAINT package_service CHECK (service IN ('floor', 'home_visit', 'remote', 'programming')),
    CONSTRAINT package_basis CHECK (basis IN ('sessions', 'period') AND (basis = 'sessions') = (sessions_total IS NOT NULL) AND (sessions_total IS NULL) = (sessions_remaining IS NULL) AND (sessions_total IS NULL OR (sessions_total >= 0 AND sessions_remaining BETWEEN 0 AND sessions_total)) AND (service <> 'programming' OR basis = 'period')),
    CONSTRAINT package_trainer_share CHECK (num_nonnulls(trainer_share_percent, trainer_share_amount) <= 1 AND (trainer_share_percent IS NULL OR trainer_share_percent BETWEEN 0 AND 100) AND (trainer_share_amount IS NULL OR trainer_share_amount BETWEEN 0 AND amount) AND (num_nonnulls(trainer_share_percent, trainer_share_amount) = 0 OR service = 'floor')),
    CONSTRAINT package_name CHECK (btrim(name) <> ''),
    CONSTRAINT package_closed CHECK ((status = 'active') = (closed_at IS NULL))
);

CREATE TABLE package_adjustment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    trainer_id uuid NOT NULL,
    package_id uuid NOT NULL,
    client_id uuid NOT NULL,
    kind varchar(12) NOT NULL,
    days integer DEFAULT 0 NOT NULL,
    sessions integer DEFAULT 0 NOT NULL,
    session_id uuid,
    reason varchar(200),
    effective_at timestamptz DEFAULT now() NOT NULL,
    due_date date,
    previous_due_date date,
    reversed_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT package_adjustment_pkey PRIMARY KEY (id),
    CONSTRAINT package_adjustment_kind CHECK (kind IN ('pause', 'resume', 'extend', 'sessions', 'session', 'due_date')),
    CONSTRAINT package_adjustment_shape CHECK ((kind = 'pause' AND days = 0 AND sessions = 0) OR (kind = 'resume' AND days >= 0 AND sessions = 0) OR (kind = 'extend' AND days BETWEEN 1 AND 3650 AND sessions = 0) OR (kind = 'sessions' AND days = 0 AND sessions <> 0 AND sessions BETWEEN -500 AND 500) OR (kind = 'session' AND days = 0 AND sessions = -1) OR (kind = 'due_date' AND days = 0 AND sessions = 0)),
    CONSTRAINT package_adjustment_charge CHECK ((kind = 'session') = (session_id IS NOT NULL) AND (reversed_at IS NULL OR (kind = 'session' AND reversed_at >= created_at))),
    CONSTRAINT package_adjustment_due CHECK (kind = 'due_date' OR (due_date IS NULL AND previous_due_date IS NULL))
);

CREATE TABLE payment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    trainer_id uuid NOT NULL,
    client_id uuid NOT NULL,
    package_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency varchar(3) NOT NULL,
    collected_by varchar(8) NOT NULL,
    method varchar(16),
    status varchar(10) DEFAULT 'pending' NOT NULL,
    reference varchar(64),
    paid_at timestamptz,
    written_off_at timestamptz,
    refunded_at timestamptz,
    note varchar(500),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    CONSTRAINT payment_pkey PRIMARY KEY (id),
    CONSTRAINT payment_amount CHECK (amount > 0 AND currency ~ '^[A-Z]{3}$'),
    CONSTRAINT payment_collected_by CHECK (collected_by IN ('trainer', 'gym')),
    CONSTRAINT payment_method CHECK (method IS NULL OR method IN ('upi', 'cash', 'bank_transfer')),
    CONSTRAINT payment_status CHECK (status IN ('pending', 'paid', 'write_off', 'refund')),
    CONSTRAINT payment_state_shape CHECK ((status = 'paid') = (paid_at IS NOT NULL) AND (status = 'write_off') = (written_off_at IS NOT NULL) AND (status = 'refund') = (refunded_at IS NOT NULL)),
    CONSTRAINT payment_collector CHECK ((collected_by = 'gym' AND method IS NULL AND reference IS NULL) OR (collected_by = 'trainer' AND (status = 'write_off' OR method IS NOT NULL) AND (reference IS NULL OR method IN ('upi', 'bank_transfer'))))
);

CREATE TABLE gym_arrangement (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    trainer_id uuid NOT NULL,
    gym_name varchar(120) NOT NULL,
    base_kind varchar(8),
    base_amount numeric(10,2) DEFAULT 0 NOT NULL,
    currency varchar(3) NOT NULL,
    starts_month date NOT NULL,
    ends_month date,
    note varchar(500),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    CONSTRAINT gym_arrangement_pkey PRIMARY KEY (id),
    CONSTRAINT gym_arrangement_base CHECK (base_amount >= 0 AND (base_amount = 0) = (base_kind IS NULL) AND (base_kind IS NULL OR base_kind IN ('minimum', 'basic'))),
    CONSTRAINT gym_arrangement_months CHECK (extract(day FROM starts_month) = 1 AND (ends_month IS NULL OR (extract(day FROM ends_month) = 1 AND ends_month >= starts_month))),
    CONSTRAINT gym_arrangement_gym_name CHECK (btrim(gym_name) <> '' AND currency ~ '^[A-Z]{3}$')
);

CREATE TABLE trainer_payout (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    trainer_id uuid NOT NULL,
    gym_name varchar(120) NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency varchar(3) NOT NULL,
    method varchar(16),
    reference varchar(64),
    note varchar(500),
    received_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    CONSTRAINT trainer_payout_pkey PRIMARY KEY (id),
    CONSTRAINT trainer_payout_amount CHECK (amount > 0 AND currency ~ '^[A-Z]{3}$'),
    CONSTRAINT trainer_payout_gym_name CHECK (btrim(gym_name) <> ''),
    CONSTRAINT trainer_payout_method CHECK (method IS NULL OR method IN ('upi', 'cash', 'bank_transfer'))
);

CREATE TABLE nudge_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    trainer_id uuid NOT NULL,
    client_id uuid NOT NULL,
    reason varchar(16) NOT NULL,
    template varchar(24) NOT NULL,
    channel varchar(16) DEFAULT 'whatsapp_manual' NOT NULL,
    package_id uuid,
    session_id uuid,
    message varchar(1000) NOT NULL,
    sent_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT nudge_log_pkey PRIMARY KEY (id),
    CONSTRAINT nudge_log_reason CHECK (reason IN ('dues', 'pack_ending', 'no_show', 'lapsed', 'session', 'manual')),
    CONSTRAINT nudge_log_template CHECK (template IN ('payment_reminder', 'renewal', 'missed_session', 're_engagement', 'session_reminder', 'session_summary', 'well_done', 'check_in')),
    CONSTRAINT nudge_log_channel CHECK (channel IN ('whatsapp_manual', 'whatsapp_auto', 'portal')),
    CONSTRAINT nudge_log_subject CHECK ((package_id IS NULL OR reason IN ('dues', 'pack_ending')) AND (session_id IS NULL OR reason IN ('no_show', 'session'))),
    CONSTRAINT nudge_log_message CHECK (btrim(message) <> '')
);

CREATE TABLE nudge_template (
    trainer_id uuid NOT NULL,
    template varchar(24) NOT NULL,
    body varchar(1000) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT nudge_template_pkey PRIMARY KEY (trainer_id, template),
    CONSTRAINT nudge_template_name CHECK (template IN ('payment_reminder', 'renewal', 'missed_session', 're_engagement', 'session_reminder', 'session_summary', 'well_done', 'check_in')),
    CONSTRAINT nudge_template_body CHECK (btrim(body) <> '')
);

CREATE TABLE attention_dismissal (
    trainer_id uuid NOT NULL,
    client_id uuid NOT NULL,
    kind varchar(16) NOT NULL,
    band varchar(16) NOT NULL,
    snoozed_until timestamptz,
    tenant_id uuid NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT attention_dismissal_pkey PRIMARY KEY (trainer_id, client_id, kind),
    CONSTRAINT attention_dismissal_band CHECK ((kind = 'pack' AND band IN ('pack-empty', 'pack-ending', 'pack-expiring')) OR (kind = 'overdue' AND band IN ('overdue-late', 'due-soon')) OR (kind = 'missed' AND band IN ('missed')) OR (kind = 'quiet' AND band IN ('quiet')) OR (kind = 'no-program' AND band IN ('no-program')) OR (kind = 'unmarked' AND band IN ('unmarked')) OR (kind = 'milestone' AND band IN ('milestone')) OR (kind = 'log' AND band IN ('log-open')))
);

CREATE TABLE client_assignment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    client_id uuid NOT NULL,
    from_trainer_id uuid NOT NULL,
    to_trainer_id uuid NOT NULL,
    assigned_by_member_id uuid NOT NULL,
    program_action varchar(8) NOT NULL,
    reason varchar(20) DEFAULT 'manual' NOT NULL,
    note varchar(500),
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT client_assignment_pkey PRIMARY KEY (id),
    CONSTRAINT client_assignment_moves CHECK (from_trainer_id <> to_trainer_id),
    CONSTRAINT client_assignment_program_action CHECK (program_action IN ('keep', 'clear')),
    CONSTRAINT client_assignment_reason CHECK (reason IN ('trainer_left', 'trainer_unavailable', 'manual'))
);


-- ─── indexes ─────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX uq_tenant_id_type ON tenant (id, type);
CREATE UNIQUE INDEX uq_tenant_id_currency ON tenant (id, currency);
CREATE INDEX idx_tenant_purge_due ON tenant (purge_after) WHERE status = 'closed' AND purged_at IS NULL;
CREATE INDEX idx_tenant_member_tenant ON tenant_member (tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenant_member_user ON tenant_member (app_user_id, status) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_tenant_member_home ON tenant_member (app_user_id) WHERE is_home AND (deleted_at IS NULL);
CREATE UNIQUE INDEX uq_tenant_member_live ON tenant_member (tenant_id, app_user_id, role) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_tenant_member_id_tenant ON tenant_member (id, tenant_id);
CREATE UNIQUE INDEX uq_tenant_member_owner ON tenant_member (tenant_id) WHERE role = 'owner' AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_tenant_invite_pending ON tenant_invite (tenant_id, phone, role) WHERE status = 'pending';
CREATE INDEX idx_tenant_invite_phone ON tenant_invite (phone) WHERE status = 'pending';
CREATE UNIQUE INDEX app_user_phone_key ON app_user (phone);
CREATE INDEX idx_otp_request_active ON otp_request (phone, purpose, created_at DESC) WHERE consumed_at IS NULL;
CREATE INDEX idx_otp_request_phone_created_at ON otp_request (phone, created_at DESC);
CREATE INDEX idx_otp_request_phone_locked_until ON otp_request (phone, locked_until DESC) WHERE locked_until IS NOT NULL;
CREATE INDEX idx_otp_request_ip_created_at ON otp_request (request_ip, created_at DESC) WHERE request_ip IS NOT NULL;
CREATE INDEX idx_otp_request_created_at ON otp_request (created_at);
CREATE UNIQUE INDEX uq_otp_request_provider_message ON otp_request (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE UNIQUE INDEX trainer_app_user_id_key ON trainer (app_user_id);
CREATE INDEX idx_trainer_business_languages ON trainer_business USING gin (languages);
CREATE INDEX idx_trainer_business_training_modes ON trainer_business USING gin (training_modes);
CREATE UNIQUE INDEX web_session_token_hash_key ON web_session (token_hash);
CREATE INDEX idx_web_session_user_live ON web_session (app_user_id, last_seen_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX idx_web_session_expiry ON web_session (expires_at);
CREATE INDEX idx_subscription_trial_ends ON subscription (trial_ends_at) WHERE state = 'trialing';
CREATE INDEX idx_subscription_grace_until ON subscription (grace_until) WHERE state = 'grace';
CREATE UNIQUE INDEX uq_subscription_provider_mandate ON subscription (provider, provider_mandate_id) WHERE provider_mandate_id IS NOT NULL;
CREATE UNIQUE INDEX uq_plan_price_from ON plan_price (plan, region, valid_from);
CREATE UNIQUE INDEX uq_plan_price_terms ON plan_price (id, region, currency, amount);
CREATE UNIQUE INDEX uq_billing_event_provider_event ON billing_event (provider, provider_event_id);
CREATE INDEX idx_billing_event_last_applied ON billing_event (trainer_id, occurred_at DESC) WHERE outcome = 'applied';
CREATE INDEX idx_billing_event_pending ON billing_event (received_at) WHERE processed_at IS NULL;
CREATE UNIQUE INDEX client_id_tenant_key ON client (id, tenant_id);
CREATE UNIQUE INDEX uq_client_phone_live ON client (tenant_id, phone) WHERE phone IS NOT NULL AND deleted_at IS NULL AND status <> 'archived' AND membership_status NOT IN ('removed', 'declined');
CREATE INDEX idx_client_membership_status ON client (phone, membership_status) WHERE (phone IS NOT NULL) AND (deleted_at IS NULL);
CREATE INDEX idx_client_tenant_trainer ON client (tenant_id, trainer_id);
CREATE INDEX idx_client_trainer_id ON client (trainer_id);
CREATE INDEX idx_client_stale ON client (tenant_id, stale_at) WHERE (stale_at IS NOT NULL) AND (deleted_at IS NULL);
CREATE UNIQUE INDEX uq_client_schedule_client_tenant ON client_schedule (client_id, tenant_id);
CREATE UNIQUE INDEX uq_client_schedule_slot_live ON client_schedule_slot (client_id, weekday, start_time) WHERE deleted_at IS NULL;
CREATE INDEX idx_client_schedule_slot_week ON client_schedule_slot (tenant_id, weekday, start_time) WHERE deleted_at IS NULL;
CREATE INDEX idx_client_note_list ON client_note (client_id, trainer_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_client_note_tenant_trainer ON client_note (tenant_id, trainer_id);
CREATE UNIQUE INDEX uq_assessment_schedule_live ON assessment_schedule (client_id, template_id) WHERE deleted_at IS NULL AND ended_at IS NULL;
CREATE UNIQUE INDEX uq_assessment_schedule_id_client_template ON assessment_schedule (id, client_id, template_id);
CREATE INDEX idx_assessment_schedule_due ON assessment_schedule (trainer_id, next_due_on) WHERE deleted_at IS NULL AND ended_at IS NULL;
CREATE INDEX idx_assessment_schedule_client ON assessment_schedule (client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_assessment_schedule_tenant ON assessment_schedule (tenant_id);
CREATE UNIQUE INDEX uq_assessment_template_id_tenant ON assessment_template (id, tenant_id);
CREATE UNIQUE INDEX uq_assessment_template_name ON assessment_template (tenant_id, trainer_id, lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX idx_assessment_template_tenant ON assessment_template (tenant_id);
CREATE INDEX idx_assessment_trainer ON assessment (trainer_id, due_on DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX idx_assessment_client ON assessment (client_id, completed_at) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_assessment_schedule_open ON assessment (schedule_id) WHERE schedule_id IS NOT NULL AND completed_at IS NULL AND deleted_at IS NULL;
CREATE INDEX idx_assessment_schedule ON assessment (schedule_id) WHERE schedule_id IS NOT NULL;
CREATE INDEX idx_assessment_template ON assessment (template_id);
CREATE INDEX idx_assessment_tenant ON assessment (tenant_id);
CREATE UNIQUE INDEX uq_program_owner ON program (id, trainer_id, tenant_id);
CREATE UNIQUE INDEX uq_program_id_origin ON program (id, origin);
CREATE UNIQUE INDEX uq_program_client_active ON program (client_id) WHERE status = 'active' AND deleted_at IS NULL;
CREATE INDEX idx_program_shelf ON program (trainer_id, updated_at DESC) WHERE client_id IS NULL AND deleted_at IS NULL;
CREATE INDEX idx_program_client ON program (client_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_program_copied_from ON program (copied_from_program_id) WHERE copied_from_program_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_program_tenant_trainer ON program (tenant_id, trainer_id);
CREATE UNIQUE INDEX uq_workout_id_tenant ON workout (id, tenant_id);
CREATE UNIQUE INDEX uq_workout_slot ON workout (program_id, week, day, position) WHERE deleted_at IS NULL;
CREATE INDEX idx_workout_shelf ON workout (trainer_id, updated_at DESC) WHERE program_id IS NULL AND deleted_at IS NULL;
CREATE INDEX idx_workout_tenant_trainer ON workout (tenant_id, trainer_id);
CREATE UNIQUE INDEX uq_workout_exercise_order ON workout_exercise (workout_id, position) WHERE alternative_of IS NULL;
CREATE UNIQUE INDEX uq_workout_exercise_alternative ON workout_exercise (alternative_of, position) WHERE alternative_of IS NOT NULL;
CREATE UNIQUE INDEX uq_workout_exercise_main ON workout_exercise (main_id, workout_id);
CREATE UNIQUE INDEX uq_workout_exercise_id_tenant ON workout_exercise (id, tenant_id);
CREATE INDEX idx_workout_exercise_exercise ON workout_exercise (exercise_id);
CREATE UNIQUE INDEX uq_workout_set_order ON workout_set (workout_exercise_id, position);
CREATE INDEX idx_scheduled_session_diary ON scheduled_session (trainer_id, scheduled_at) INCLUDE (ends_at, status, client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_scheduled_session_client ON scheduled_session (client_id, scheduled_at) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_scheduled_session_owner ON scheduled_session (id, client_id, tenant_id);
CREATE UNIQUE INDEX uq_scheduled_session_client_start ON scheduled_session (client_id, scheduled_at) WHERE deleted_at IS NULL AND status <> 'cancelled';
CREATE INDEX idx_scheduled_session_tenant_trainer ON scheduled_session (tenant_id, trainer_id);
CREATE INDEX idx_scheduled_session_workout ON scheduled_session (workout_id) WHERE workout_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_working_hours_window ON working_hours (trainer_id, weekday, start_time) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_session_exercise_order ON session_exercise (session_id, position);
CREATE UNIQUE INDEX uq_session_exercise_id_tenant ON session_exercise (id, tenant_id);
CREATE INDEX idx_session_exercise_history ON session_exercise (client_id, exercise_id);
CREATE UNIQUE INDEX uq_set_log_order ON set_log (session_exercise_id, position);
CREATE INDEX idx_erasure_log_pending ON erasure_log (tenant_id) WHERE kind = 'workspace' AND completed_at IS NULL;
CREATE INDEX idx_exercise_body_part ON exercise (body_part);
CREATE INDEX idx_exercise_muscle_group ON exercise (muscle_group);
CREATE INDEX idx_exercise_tenant ON exercise (tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_exercise_trainer_id ON exercise (trainer_id);
CREATE UNIQUE INDEX uq_exercise_source_id ON exercise (source_id) WHERE source_id IS NOT NULL;
CREATE UNIQUE INDEX idx_trainer_exercise_pair ON trainer_exercise (trainer_id, exercise_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_trainer_exercise_tenant_trainer ON trainer_exercise (tenant_id, trainer_id);
CREATE INDEX idx_pack_tenant_trainer ON pack (tenant_id, trainer_id);
CREATE INDEX idx_pack_price_list ON pack (trainer_id, owner, service, order_index) WHERE deleted_at IS NULL;
CREATE INDEX idx_package_client_id ON package (client_id);
CREATE INDEX idx_package_live ON package (trainer_id) WHERE ((status)::text = 'active'::text) AND (deleted_at IS NULL);
CREATE INDEX idx_package_pack ON package (pack_id) WHERE pack_id IS NOT NULL;
CREATE INDEX idx_package_tenant_trainer ON package (tenant_id, trainer_id);
CREATE INDEX idx_package_trainer_id ON package (trainer_id);
CREATE UNIQUE INDEX uq_package_owner ON package (id, client_id, tenant_id);
CREATE INDEX idx_package_charge ON package (client_id, service, start_date) WHERE basis = 'sessions' AND status = 'active' AND deleted_at IS NULL;
CREATE INDEX idx_package_adjustment_package ON package_adjustment (package_id, effective_at);
CREATE UNIQUE INDEX uq_package_adjustment_live_charge ON package_adjustment (session_id) WHERE kind = 'session' AND reversed_at IS NULL;
CREATE INDEX idx_package_adjustment_tenant_trainer ON package_adjustment (tenant_id, trainer_id);
CREATE INDEX idx_payment_package ON payment (package_id) INCLUDE (amount, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_payment_client ON payment (client_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_payment_book ON payment (trainer_id, paid_at) WHERE status = 'paid' AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_payment_one_refund ON payment (package_id) WHERE status = 'refund' AND deleted_at IS NULL;
CREATE INDEX idx_payment_refunds ON payment (trainer_id, refunded_at) WHERE status = 'refund' AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_payment_reference ON payment (trainer_id, reference) WHERE reference IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_payment_tenant_trainer ON payment (tenant_id, trainer_id);
CREATE UNIQUE INDEX uq_gym_arrangement_open ON gym_arrangement (trainer_id) WHERE ends_month IS NULL AND deleted_at IS NULL;
CREATE INDEX idx_gym_arrangement_trainer ON gym_arrangement (trainer_id, starts_month) WHERE deleted_at IS NULL;
CREATE INDEX idx_gym_arrangement_tenant_trainer ON gym_arrangement (tenant_id, trainer_id);
CREATE INDEX idx_trainer_payout_trainer ON trainer_payout (trainer_id, gym_name, received_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_trainer_payout_tenant_trainer ON trainer_payout (tenant_id, trainer_id);
CREATE INDEX idx_nudge_log_client_sent ON nudge_log (client_id, sent_at DESC);
CREATE INDEX idx_nudge_log_trainer_sent ON nudge_log (trainer_id, sent_at DESC);
CREATE INDEX idx_nudge_log_tenant_trainer ON nudge_log (tenant_id, trainer_id);
CREATE INDEX idx_attention_dismissal_client ON attention_dismissal (client_id);
CREATE INDEX idx_attention_dismissal_tenant_trainer ON attention_dismissal (tenant_id, trainer_id);
CREATE INDEX idx_client_assignment_client ON client_assignment (client_id, created_at);
CREATE INDEX idx_client_assignment_from ON client_assignment (from_trainer_id, created_at);
CREATE INDEX idx_client_assignment_to ON client_assignment (to_trainer_id, created_at);
CREATE INDEX idx_client_assignment_tenant ON client_assignment (tenant_id, created_at);

CREATE UNIQUE INDEX uq_client_schedule_slot_id_client ON client_schedule_slot (id, client_id);

-- ─── foreign keys ────────────────────────────────────────────────────────

ALTER TABLE tenant_member ADD CONSTRAINT tenant_member_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES app_user (id);
ALTER TABLE tenant_member ADD CONSTRAINT tenant_member_tenant_kind_fkey FOREIGN KEY (tenant_id, tenant_type) REFERENCES tenant (id, type);
ALTER TABLE tenant_member ADD CONSTRAINT tenant_member_role_fkey FOREIGN KEY (tenant_type, role) REFERENCES tenant_role (tenant_type, role);
ALTER TABLE tenant_member ADD CONSTRAINT tenant_member_invited_by_fkey FOREIGN KEY (invited_by_member_id, tenant_id) REFERENCES tenant_member (id, tenant_id);
ALTER TABLE tenant_invite ADD CONSTRAINT tenant_invite_tenant_kind_fkey FOREIGN KEY (tenant_id, tenant_type) REFERENCES tenant (id, type);
ALTER TABLE tenant_invite ADD CONSTRAINT tenant_invite_role_fkey FOREIGN KEY (tenant_type, role) REFERENCES tenant_role (tenant_type, role);
ALTER TABLE tenant_invite ADD CONSTRAINT tenant_invite_invited_by_fkey FOREIGN KEY (invited_by_member_id, tenant_id) REFERENCES tenant_member (id, tenant_id);
ALTER TABLE tenant_invite ADD CONSTRAINT tenant_invite_member_id_fkey FOREIGN KEY (member_id, tenant_id) REFERENCES tenant_member (id, tenant_id);
ALTER TABLE trainer ADD CONSTRAINT trainer_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES app_user (id);
ALTER TABLE trainer ADD CONSTRAINT trainer_home_tenant_id_fkey FOREIGN KEY (home_tenant_id) REFERENCES tenant (id);
ALTER TABLE trainer_business ADD CONSTRAINT trainer_business_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id);
ALTER TABLE web_session ADD CONSTRAINT web_session_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES app_user (id);
ALTER TABLE web_session ADD CONSTRAINT web_session_active_tenant_id_fkey FOREIGN KEY (active_tenant_id) REFERENCES tenant (id);
ALTER TABLE subscription ADD CONSTRAINT subscription_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id);
ALTER TABLE subscription ADD CONSTRAINT subscription_plan_price_fkey FOREIGN KEY (plan_price_id, price_region, currency, price_amount) REFERENCES plan_price (id, region, currency, amount);
ALTER TABLE billing_event ADD CONSTRAINT billing_event_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES subscription (trainer_id);
ALTER TABLE client ADD CONSTRAINT client_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id);
ALTER TABLE client ADD CONSTRAINT client_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE client_schedule ADD CONSTRAINT client_schedule_client_id_fkey FOREIGN KEY (client_id) REFERENCES client (id);
ALTER TABLE client_schedule ADD CONSTRAINT client_schedule_client_same_tenant FOREIGN KEY (client_id, tenant_id) REFERENCES client (id, tenant_id);
ALTER TABLE client_schedule ADD CONSTRAINT client_schedule_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE client_schedule_slot ADD CONSTRAINT client_schedule_slot_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE client_schedule_slot ADD CONSTRAINT client_schedule_slot_client_id_fkey FOREIGN KEY (client_id) REFERENCES client_schedule (client_id);
ALTER TABLE client_schedule_slot ADD CONSTRAINT client_schedule_slot_same_tenant FOREIGN KEY (client_id, tenant_id) REFERENCES client_schedule (client_id, tenant_id);
ALTER TABLE client_note ADD CONSTRAINT client_note_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE client_note ADD CONSTRAINT client_note_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id);
ALTER TABLE client_note ADD CONSTRAINT client_note_client_id_fkey FOREIGN KEY (client_id) REFERENCES client (id);
ALTER TABLE client_note ADD CONSTRAINT client_note_client_same_tenant FOREIGN KEY (client_id, tenant_id) REFERENCES client (id, tenant_id);
ALTER TABLE assessment_schedule ADD CONSTRAINT assessment_schedule_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE assessment_schedule ADD CONSTRAINT assessment_schedule_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id);
ALTER TABLE assessment_schedule ADD CONSTRAINT assessment_schedule_client_id_fkey FOREIGN KEY (client_id) REFERENCES client (id);
ALTER TABLE assessment_schedule ADD CONSTRAINT assessment_schedule_client_same_tenant FOREIGN KEY (client_id, tenant_id) REFERENCES client (id, tenant_id);
ALTER TABLE assessment_schedule ADD CONSTRAINT assessment_schedule_template_id_fkey FOREIGN KEY (template_id) REFERENCES assessment_template (id);
ALTER TABLE assessment_schedule ADD CONSTRAINT assessment_schedule_template_same_tenant FOREIGN KEY (template_id, tenant_id) REFERENCES assessment_template (id, tenant_id);
ALTER TABLE assessment_template ADD CONSTRAINT assessment_template_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE assessment_template ADD CONSTRAINT assessment_template_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id);
ALTER TABLE assessment ADD CONSTRAINT assessment_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE assessment ADD CONSTRAINT assessment_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id);
ALTER TABLE assessment ADD CONSTRAINT assessment_client_id_fkey FOREIGN KEY (client_id) REFERENCES client (id);
ALTER TABLE assessment ADD CONSTRAINT assessment_client_same_tenant FOREIGN KEY (client_id, tenant_id) REFERENCES client (id, tenant_id);
ALTER TABLE assessment ADD CONSTRAINT assessment_template_id_fkey FOREIGN KEY (template_id) REFERENCES assessment_template (id);
ALTER TABLE assessment ADD CONSTRAINT assessment_template_same_tenant FOREIGN KEY (template_id, tenant_id) REFERENCES assessment_template (id, tenant_id);
ALTER TABLE assessment ADD CONSTRAINT assessment_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES assessment_schedule (id);
ALTER TABLE assessment ADD CONSTRAINT assessment_schedule_matches FOREIGN KEY (schedule_id, client_id, template_id) REFERENCES assessment_schedule (id, client_id, template_id);
ALTER TABLE program ADD CONSTRAINT program_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE program ADD CONSTRAINT program_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id);
ALTER TABLE program ADD CONSTRAINT program_client_id_fkey FOREIGN KEY (client_id) REFERENCES client (id);
ALTER TABLE program ADD CONSTRAINT program_client_same_tenant FOREIGN KEY (client_id, tenant_id) REFERENCES client (id, tenant_id);
ALTER TABLE program ADD CONSTRAINT program_copied_from_program_id_fkey FOREIGN KEY (copied_from_program_id) REFERENCES program (id);
ALTER TABLE certified_program ADD CONSTRAINT certified_program_is_inclineyou FOREIGN KEY (program_id, origin) REFERENCES program (id, origin);
ALTER TABLE workout ADD CONSTRAINT workout_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE workout ADD CONSTRAINT workout_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id);
ALTER TABLE workout ADD CONSTRAINT workout_program_id_fkey FOREIGN KEY (program_id) REFERENCES program (id);
ALTER TABLE workout ADD CONSTRAINT workout_program_owner FOREIGN KEY (program_id, trainer_id, tenant_id) REFERENCES program (id, trainer_id, tenant_id) ON UPDATE CASCADE;
ALTER TABLE workout ADD CONSTRAINT workout_copied_from_workout_id_fkey FOREIGN KEY (copied_from_workout_id) REFERENCES workout (id);
ALTER TABLE workout_exercise ADD CONSTRAINT workout_exercise_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE workout_exercise ADD CONSTRAINT workout_exercise_workout_id_fkey FOREIGN KEY (workout_id) REFERENCES workout (id);
ALTER TABLE workout_exercise ADD CONSTRAINT workout_exercise_same_tenant FOREIGN KEY (workout_id, tenant_id) REFERENCES workout (id, tenant_id);
ALTER TABLE workout_exercise ADD CONSTRAINT workout_exercise_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES exercise (id);
ALTER TABLE workout_exercise ADD CONSTRAINT workout_exercise_alternative_of_main FOREIGN KEY (alternative_of, workout_id) REFERENCES workout_exercise (main_id, workout_id) ON DELETE CASCADE;
ALTER TABLE workout_set ADD CONSTRAINT workout_set_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE workout_set ADD CONSTRAINT workout_set_workout_exercise_id_fkey FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercise (id) ON DELETE CASCADE;
ALTER TABLE workout_set ADD CONSTRAINT workout_set_same_tenant FOREIGN KEY (workout_exercise_id, tenant_id) REFERENCES workout_exercise (id, tenant_id) ON DELETE CASCADE;
ALTER TABLE scheduled_session ADD CONSTRAINT scheduled_session_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE scheduled_session ADD CONSTRAINT scheduled_session_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id);
ALTER TABLE scheduled_session ADD CONSTRAINT scheduled_session_client_id_fkey FOREIGN KEY (client_id) REFERENCES client (id);
ALTER TABLE scheduled_session ADD CONSTRAINT scheduled_session_client_same_tenant FOREIGN KEY (client_id, tenant_id) REFERENCES client (id, tenant_id);
ALTER TABLE scheduled_session ADD CONSTRAINT scheduled_session_workout_id_fkey FOREIGN KEY (workout_id) REFERENCES workout (id);
ALTER TABLE scheduled_session ADD CONSTRAINT scheduled_session_slot_same_client FOREIGN KEY (slot_id, client_id) REFERENCES client_schedule_slot (id, client_id);
ALTER TABLE working_hours ADD CONSTRAINT working_hours_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id);
ALTER TABLE session_exercise ADD CONSTRAINT session_exercise_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE session_exercise ADD CONSTRAINT session_exercise_session_owner FOREIGN KEY (session_id, client_id, tenant_id) REFERENCES scheduled_session (id, client_id, tenant_id);
ALTER TABLE session_exercise ADD CONSTRAINT session_exercise_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES exercise (id);
ALTER TABLE session_exercise ADD CONSTRAINT session_exercise_planned_from_fkey FOREIGN KEY (planned_from) REFERENCES workout_exercise (id) ON DELETE SET NULL;
ALTER TABLE session_exercise ADD CONSTRAINT session_exercise_swapped_from_fkey FOREIGN KEY (swapped_from_exercise_id) REFERENCES exercise (id);
ALTER TABLE set_log ADD CONSTRAINT set_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE set_log ADD CONSTRAINT set_log_same_tenant FOREIGN KEY (session_exercise_id, tenant_id) REFERENCES session_exercise (id, tenant_id) ON DELETE CASCADE;
ALTER TABLE erasure_log ADD CONSTRAINT erasure_log_client_fkey FOREIGN KEY (client_id) REFERENCES client (id);
ALTER TABLE erasure_log ADD CONSTRAINT erasure_log_parent_fkey FOREIGN KEY (parent_id) REFERENCES erasure_log (id);
ALTER TABLE erasure_log ADD CONSTRAINT erasure_log_app_user_fkey FOREIGN KEY (app_user_id) REFERENCES app_user (id);
ALTER TABLE erasure_log ADD CONSTRAINT erasure_log_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE exercise ADD CONSTRAINT exercise_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id);
ALTER TABLE exercise ADD CONSTRAINT exercise_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE trainer_exercise ADD CONSTRAINT trainer_exercise_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id);
ALTER TABLE trainer_exercise ADD CONSTRAINT trainer_exercise_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES exercise (id);
ALTER TABLE trainer_exercise ADD CONSTRAINT trainer_exercise_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE pack ADD CONSTRAINT pack_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id);
ALTER TABLE pack ADD CONSTRAINT pack_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE pack ADD CONSTRAINT pack_tenant_currency_fkey FOREIGN KEY (tenant_id, currency) REFERENCES tenant (id, currency);
ALTER TABLE package ADD CONSTRAINT package_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id);
ALTER TABLE package ADD CONSTRAINT package_client_id_fkey FOREIGN KEY (client_id) REFERENCES client (id);
ALTER TABLE package ADD CONSTRAINT package_client_same_tenant FOREIGN KEY (client_id, tenant_id) REFERENCES client (id, tenant_id);
ALTER TABLE package ADD CONSTRAINT package_pack_id_fkey FOREIGN KEY (pack_id) REFERENCES pack (id);
ALTER TABLE package ADD CONSTRAINT package_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE package ADD CONSTRAINT package_tenant_currency_fkey FOREIGN KEY (tenant_id, currency) REFERENCES tenant (id, currency);
ALTER TABLE package_adjustment ADD CONSTRAINT package_adjustment_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE package_adjustment ADD CONSTRAINT package_adjustment_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id);
ALTER TABLE package_adjustment ADD CONSTRAINT package_adjustment_package_owner FOREIGN KEY (package_id, client_id, tenant_id) REFERENCES package (id, client_id, tenant_id);
ALTER TABLE package_adjustment ADD CONSTRAINT package_adjustment_session_owner FOREIGN KEY (session_id, client_id, tenant_id) REFERENCES scheduled_session (id, client_id, tenant_id);
ALTER TABLE payment ADD CONSTRAINT payment_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE payment ADD CONSTRAINT payment_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id);
ALTER TABLE payment ADD CONSTRAINT payment_package_owner FOREIGN KEY (package_id, client_id, tenant_id) REFERENCES package (id, client_id, tenant_id);
ALTER TABLE payment ADD CONSTRAINT payment_tenant_currency_fkey FOREIGN KEY (tenant_id, currency) REFERENCES tenant (id, currency);
ALTER TABLE gym_arrangement ADD CONSTRAINT gym_arrangement_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE gym_arrangement ADD CONSTRAINT gym_arrangement_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id);
ALTER TABLE gym_arrangement ADD CONSTRAINT gym_arrangement_tenant_currency_fkey FOREIGN KEY (tenant_id, currency) REFERENCES tenant (id, currency);
ALTER TABLE trainer_payout ADD CONSTRAINT trainer_payout_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE trainer_payout ADD CONSTRAINT trainer_payout_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id);
ALTER TABLE trainer_payout ADD CONSTRAINT trainer_payout_tenant_currency_fkey FOREIGN KEY (tenant_id, currency) REFERENCES tenant (id, currency);
ALTER TABLE nudge_log ADD CONSTRAINT nudge_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE nudge_log ADD CONSTRAINT nudge_log_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id);
ALTER TABLE nudge_log ADD CONSTRAINT nudge_log_client_same_tenant FOREIGN KEY (client_id, tenant_id) REFERENCES client (id, tenant_id);
ALTER TABLE nudge_log ADD CONSTRAINT nudge_log_package_owner FOREIGN KEY (package_id, client_id, tenant_id) REFERENCES package (id, client_id, tenant_id);
ALTER TABLE nudge_log ADD CONSTRAINT nudge_log_session_owner FOREIGN KEY (session_id, client_id, tenant_id) REFERENCES scheduled_session (id, client_id, tenant_id);
ALTER TABLE nudge_template ADD CONSTRAINT nudge_template_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id);
ALTER TABLE attention_dismissal ADD CONSTRAINT attention_dismissal_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE attention_dismissal ADD CONSTRAINT attention_dismissal_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id);
ALTER TABLE attention_dismissal ADD CONSTRAINT attention_dismissal_client_same_tenant FOREIGN KEY (client_id, tenant_id) REFERENCES client (id, tenant_id);
ALTER TABLE client_assignment ADD CONSTRAINT client_assignment_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id);
ALTER TABLE client_assignment ADD CONSTRAINT client_assignment_client_id_fkey FOREIGN KEY (client_id) REFERENCES client (id);
ALTER TABLE client_assignment ADD CONSTRAINT client_assignment_client_same_tenant FOREIGN KEY (client_id, tenant_id) REFERENCES client (id, tenant_id);
ALTER TABLE client_assignment ADD CONSTRAINT client_assignment_from_trainer_id_fkey FOREIGN KEY (from_trainer_id) REFERENCES trainer (id);
ALTER TABLE client_assignment ADD CONSTRAINT client_assignment_to_trainer_id_fkey FOREIGN KEY (to_trainer_id) REFERENCES trainer (id);
ALTER TABLE client_assignment ADD CONSTRAINT client_assignment_assigned_by_fkey FOREIGN KEY (assigned_by_member_id, tenant_id) REFERENCES tenant_member (id, tenant_id);


-- ─── triggers ────────────────────────────────────────────────────────────

CREATE TRIGGER trg_tenant_updated_at BEFORE UPDATE ON tenant FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tenant_freeze_type BEFORE UPDATE ON tenant FOR EACH ROW EXECUTE FUNCTION freeze_tenant_type();
CREATE TRIGGER trg_tenant_status_changed_at BEFORE UPDATE ON tenant FOR EACH ROW EXECUTE FUNCTION set_tenant_status_changed_at();
CREATE TRIGGER trg_tenant_member_freeze_tenant BEFORE UPDATE ON tenant_member FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_tenant_member_no_owner_promotion BEFORE UPDATE ON tenant_member FOR EACH ROW EXECUTE FUNCTION refuse_owner_promotion();
CREATE TRIGGER trg_tenant_member_stamp_tenant BEFORE INSERT ON tenant_member FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_tenant_member_updated_at BEFORE UPDATE ON tenant_member FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tenant_member_stamp_type BEFORE INSERT ON tenant_member FOR EACH ROW EXECUTE FUNCTION stamp_tenant_type();
CREATE TRIGGER trg_tenant_invite_freeze_tenant BEFORE UPDATE ON tenant_invite FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_tenant_invite_stamp_type BEFORE INSERT ON tenant_invite FOR EACH ROW EXECUTE FUNCTION stamp_tenant_type();
CREATE TRIGGER trg_tenant_invite_updated_at BEFORE UPDATE ON tenant_invite FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_app_user_home_membership AFTER INSERT ON app_user FOR EACH ROW EXECUTE FUNCTION ensure_membership_for_user();
CREATE TRIGGER trg_app_user_updated_at BEFORE UPDATE ON app_user FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_trainer_home_membership AFTER INSERT ON trainer FOR EACH ROW EXECUTE FUNCTION ensure_home_membership();
CREATE TRIGGER trg_trainer_home_tenant BEFORE INSERT ON trainer FOR EACH ROW EXECUTE FUNCTION ensure_home_tenant();
CREATE TRIGGER trg_trainer_business AFTER INSERT ON trainer FOR EACH ROW EXECUTE FUNCTION ensure_trainer_business();
CREATE TRIGGER trg_trainer_subscription AFTER INSERT ON trainer FOR EACH ROW EXECUTE FUNCTION ensure_subscription();
CREATE TRIGGER trg_trainer_updated_at BEFORE UPDATE ON trainer FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_trainer_follow_solo_name AFTER UPDATE OF name ON trainer FOR EACH ROW EXECUTE FUNCTION follow_solo_tenant_name();
CREATE TRIGGER trg_trainer_business_updated_at BEFORE UPDATE ON trainer_business FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_web_session_updated_at BEFORE UPDATE ON web_session FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_subscription_updated_at BEFORE UPDATE ON subscription FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_subscription_freeze_price BEFORE UPDATE ON subscription FOR EACH ROW EXECUTE FUNCTION freeze_subscription_price();
CREATE TRIGGER trg_client_schedule_row AFTER INSERT ON client FOR EACH ROW EXECUTE FUNCTION ensure_client_schedule();
CREATE TRIGGER trg_client_freeze_tenant BEFORE UPDATE ON client FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_client_stamp_tenant BEFORE INSERT ON client FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_client_updated_at BEFORE UPDATE ON client FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_client_schedule_stamp_tenant BEFORE INSERT ON client_schedule FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_client_schedule_freeze_tenant BEFORE UPDATE ON client_schedule FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_client_schedule_updated_at BEFORE UPDATE ON client_schedule FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_client_schedule_slot_stamp_tenant BEFORE INSERT ON client_schedule_slot FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_client_schedule_slot_freeze_tenant BEFORE UPDATE ON client_schedule_slot FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_client_schedule_slot_updated_at BEFORE UPDATE ON client_schedule_slot FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_client_note_stamp_tenant BEFORE INSERT ON client_note FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_client_note_freeze_tenant BEFORE UPDATE ON client_note FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_client_note_updated_at BEFORE UPDATE ON client_note FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_assessment_schedule_stamp_tenant BEFORE INSERT ON assessment_schedule FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_assessment_schedule_freeze_tenant BEFORE UPDATE ON assessment_schedule FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_assessment_schedule_updated_at BEFORE UPDATE ON assessment_schedule FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_assessment_template_stamp_tenant BEFORE INSERT ON assessment_template FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_assessment_template_freeze_tenant BEFORE UPDATE ON assessment_template FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_assessment_template_updated_at BEFORE UPDATE ON assessment_template FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_assessment_stamp_tenant BEFORE INSERT ON assessment FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_assessment_freeze_tenant BEFORE UPDATE ON assessment FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_assessment_freeze_form BEFORE UPDATE ON assessment FOR EACH ROW EXECUTE FUNCTION freeze_assessment_form();
CREATE TRIGGER trg_assessment_updated_at BEFORE UPDATE ON assessment FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_program_stamp_tenant BEFORE INSERT ON program FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_program_freeze_tenant BEFORE UPDATE ON program FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_program_updated_at BEFORE UPDATE ON program FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_certified_program_updated_at BEFORE UPDATE ON certified_program FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_workout_stamp_tenant BEFORE INSERT ON workout FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_workout_freeze_tenant BEFORE UPDATE ON workout FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_workout_updated_at BEFORE UPDATE ON workout FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_workout_exercise_stamp_tenant BEFORE INSERT ON workout_exercise FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_workout_exercise_freeze_tenant BEFORE UPDATE ON workout_exercise FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_workout_exercise_updated_at BEFORE UPDATE ON workout_exercise FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_workout_set_stamp_tenant BEFORE INSERT ON workout_set FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_workout_set_freeze_tenant BEFORE UPDATE ON workout_set FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_workout_set_updated_at BEFORE UPDATE ON workout_set FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_scheduled_session_stamp_tenant BEFORE INSERT ON scheduled_session FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_scheduled_session_freeze_tenant BEFORE UPDATE ON scheduled_session FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_scheduled_session_ends_at BEFORE INSERT OR UPDATE OF scheduled_at, duration_minutes ON scheduled_session FOR EACH ROW EXECUTE FUNCTION set_session_ends_at();
CREATE TRIGGER trg_scheduled_session_updated_at BEFORE UPDATE ON scheduled_session FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_working_hours_updated_at BEFORE UPDATE ON working_hours FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_session_exercise_stamp_tenant BEFORE INSERT ON session_exercise FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_session_exercise_freeze_tenant BEFORE UPDATE ON session_exercise FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_session_exercise_updated_at BEFORE UPDATE ON session_exercise FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_set_log_stamp_tenant BEFORE INSERT ON set_log FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_set_log_freeze_tenant BEFORE UPDATE ON set_log FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_set_log_updated_at BEFORE UPDATE ON set_log FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_exercise_freeze_tenant BEFORE UPDATE ON exercise FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_exercise_stamp_tenant BEFORE INSERT ON exercise FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id_if_trainer();
CREATE TRIGGER trg_exercise_updated_at BEFORE UPDATE ON exercise FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_trainer_exercise_freeze_tenant BEFORE UPDATE ON trainer_exercise FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_trainer_exercise_stamp_tenant BEFORE INSERT ON trainer_exercise FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_trainer_exercise_updated_at BEFORE UPDATE ON trainer_exercise FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pack_freeze_tenant BEFORE UPDATE ON pack FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_pack_stamp_tenant BEFORE INSERT ON pack FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_pack_updated_at BEFORE UPDATE ON pack FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_package_freeze_tenant BEFORE UPDATE ON package FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_package_stamp_tenant BEFORE INSERT ON package FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_package_freeze_terms BEFORE UPDATE ON package FOR EACH ROW EXECUTE FUNCTION freeze_package_terms();
CREATE TRIGGER trg_package_guard_balance BEFORE UPDATE ON package FOR EACH ROW EXECUTE FUNCTION guard_package_balance();
CREATE TRIGGER trg_package_client_type BEFORE INSERT OR UPDATE OF client_id, pack_id, trainer_share_percent, trainer_share_amount ON package FOR EACH ROW EXECUTE FUNCTION check_package_client_type();
CREATE TRIGGER trg_package_refunded_final BEFORE UPDATE OF status, closed_at ON package FOR EACH ROW WHEN (OLD.status = 'refunded') EXECUTE FUNCTION freeze_refunded_package();
CREATE TRIGGER trg_package_updated_at BEFORE UPDATE ON package FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_package_adjustment_stamp_tenant BEFORE INSERT ON package_adjustment FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_package_adjustment_freeze_tenant BEFORE UPDATE ON package_adjustment FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_package_adjustment_append_only BEFORE UPDATE ON package_adjustment FOR EACH ROW EXECUTE FUNCTION package_adjustment_append_only();
CREATE TRIGGER trg_package_adjustment_apply BEFORE INSERT OR UPDATE OF reversed_at ON package_adjustment FOR EACH ROW EXECUTE FUNCTION apply_package_adjustment();
CREATE TRIGGER trg_payment_stamp_tenant BEFORE INSERT ON payment FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_payment_freeze_tenant BEFORE UPDATE ON payment FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_payment_collector BEFORE INSERT OR UPDATE OF collected_by ON payment FOR EACH ROW EXECUTE FUNCTION stamp_payment_collector();
CREATE TRIGGER trg_payment_ledger BEFORE INSERT OR UPDATE OF status, amount, deleted_at ON payment FOR EACH ROW EXECUTE FUNCTION check_package_ledger();
CREATE TRIGGER trg_payment_freeze_refund BEFORE UPDATE ON payment FOR EACH ROW WHEN (OLD.status = 'refund') EXECUTE FUNCTION freeze_refund();
CREATE TRIGGER trg_payment_updated_at BEFORE UPDATE ON payment FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_gym_arrangement_stamp_tenant BEFORE INSERT ON gym_arrangement FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_gym_arrangement_freeze_tenant BEFORE UPDATE ON gym_arrangement FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_gym_arrangement_updated_at BEFORE UPDATE ON gym_arrangement FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_trainer_payout_stamp_tenant BEFORE INSERT ON trainer_payout FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_trainer_payout_freeze_tenant BEFORE UPDATE ON trainer_payout FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_trainer_payout_updated_at BEFORE UPDATE ON trainer_payout FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_nudge_log_stamp_tenant BEFORE INSERT ON nudge_log FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_nudge_log_freeze_tenant BEFORE UPDATE ON nudge_log FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_nudge_log_append_only BEFORE UPDATE ON nudge_log FOR EACH ROW EXECUTE FUNCTION refuse_update();
CREATE TRIGGER trg_nudge_template_updated_at BEFORE UPDATE ON nudge_template FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_attention_dismissal_stamp_tenant BEFORE INSERT ON attention_dismissal FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_attention_dismissal_freeze_tenant BEFORE UPDATE ON attention_dismissal FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_attention_dismissal_updated_at BEFORE UPDATE ON attention_dismissal FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_client_assignment_stamp_tenant BEFORE INSERT ON client_assignment FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_client_assignment_freeze_tenant BEFORE UPDATE ON client_assignment FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();

-- ─── the trainer's part of every gym-desk payment ───────────────────────────

CREATE VIEW payment_trainer_share WITH (security_invoker = true) AS   -- or it would read past the RLS policies
SELECT id AS payment_id, package_id, client_id, trainer_id, status, paid_at, refunded_at,
       round(cum * ratio, 2) - round((cum - signed) * ratio, 2) AS share          -- negative on a refund
FROM (
  SELECT y.id, y.package_id, y.client_id, y.trainer_id, y.status, y.paid_at, y.refunded_at, s.signed,
         sum(s.signed) OVER (PARTITION BY y.package_id ORDER BY coalesce(y.paid_at, y.refunded_at), y.id) AS cum,
         CASE WHEN k.trainer_share_percent IS NOT NULL THEN k.trainer_share_percent / 100
              WHEN k.trainer_share_amount  IS NOT NULL AND k.amount > 0 THEN k.trainer_share_amount / k.amount END AS ratio
  FROM   payment y JOIN package k ON k.id = y.package_id,
         LATERAL (SELECT CASE y.status WHEN 'refund' THEN -y.amount ELSE y.amount END AS signed) s
  WHERE  y.collected_by = 'gym' AND y.status IN ('paid', 'refund') AND y.deleted_at IS NULL
) x WHERE ratio IS NOT NULL;

-- ─── row-level security ────────────────────────────────────────────────────
--
-- Tier 1, my workspaces: read across every workspace the trainer belongs to, write into the active one.
-- Tier 2, active workspace only: the money wall, and client notes.
-- Tier 3, catalogue: InclineYou rows (tenant_id NULL) are readable by everyone and written only by the seeders.
-- Person policies: rows about one person, on the trainer id the request carries.
-- ENABLE, not FORCE: the owner (Flyway, the definer functions, the test suite) is not subject to them.

ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_invite ENABLE ROW LEVEL SECURITY;
ALTER TABLE client ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_schedule_slot ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_note ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment ENABLE ROW LEVEL SECURITY;
ALTER TABLE program ENABLE ROW LEVEL SECURITY;
ALTER TABLE certified_program ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_exercise ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_set ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_exercise ENABLE ROW LEVEL SECURITY;
ALTER TABLE set_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_exercise ENABLE ROW LEVEL SECURITY;
ALTER TABLE pack ENABLE ROW LEVEL SECURITY;
ALTER TABLE package ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_adjustment ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_arrangement ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_payout ENABLE ROW LEVEL SECURITY;
ALTER TABLE nudge_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE nudge_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE attention_dismissal ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_assignment ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_tenant ON client TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY client_schedule_tenant ON client_schedule TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY client_schedule_slot_tenant ON client_schedule_slot TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY assessment_schedule_tenant ON assessment_schedule TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY assessment_template_tenant ON assessment_template TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY assessment_tenant ON assessment TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY scheduled_session_tenant ON scheduled_session TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY session_exercise_tenant ON session_exercise TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY set_log_tenant ON set_log TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY trainer_exercise_tenant ON trainer_exercise TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY nudge_log_tenant ON nudge_log TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY attention_dismissal_tenant ON attention_dismissal TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY client_assignment_tenant ON client_assignment TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY program_tenant ON program TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY workout_tenant ON workout TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY workout_exercise_tenant ON workout_exercise TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY workout_set_tenant ON workout_set TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY client_note_tenant ON client_note TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = app_tenant_id())
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY pack_tenant ON pack TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = app_tenant_id())
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY package_tenant ON package TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = app_tenant_id())
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY package_adjustment_tenant ON package_adjustment TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = app_tenant_id())
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY payment_tenant ON payment TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = app_tenant_id())
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY gym_arrangement_tenant ON gym_arrangement TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = app_tenant_id())
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY trainer_payout_tenant ON trainer_payout TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = app_tenant_id())
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY program_catalogue ON program FOR SELECT TO inclineyou_app USING (tenant_id IS NULL);
CREATE POLICY program_catalogue_seed ON program TO inclineyou_app
    USING (app_actor() = 'system' AND tenant_id IS NULL) WITH CHECK (app_actor() = 'system' AND tenant_id IS NULL);
CREATE POLICY workout_catalogue ON workout FOR SELECT TO inclineyou_app USING (tenant_id IS NULL);
CREATE POLICY workout_catalogue_seed ON workout TO inclineyou_app
    USING (app_actor() = 'system' AND tenant_id IS NULL) WITH CHECK (app_actor() = 'system' AND tenant_id IS NULL);
CREATE POLICY workout_exercise_catalogue ON workout_exercise FOR SELECT TO inclineyou_app USING (tenant_id IS NULL);
CREATE POLICY workout_exercise_catalogue_seed ON workout_exercise TO inclineyou_app
    USING (app_actor() = 'system' AND tenant_id IS NULL) WITH CHECK (app_actor() = 'system' AND tenant_id IS NULL);
CREATE POLICY workout_set_catalogue ON workout_set FOR SELECT TO inclineyou_app USING (tenant_id IS NULL);
CREATE POLICY workout_set_catalogue_seed ON workout_set TO inclineyou_app
    USING (app_actor() = 'system' AND tenant_id IS NULL) WITH CHECK (app_actor() = 'system' AND tenant_id IS NULL);
CREATE POLICY certified_program_catalogue ON certified_program FOR SELECT TO inclineyou_app USING (true);
CREATE POLICY certified_program_seed ON certified_program TO inclineyou_app
    USING (app_actor() = 'system') WITH CHECK (app_actor() = 'system');
CREATE POLICY exercise_catalogue_read ON exercise FOR SELECT TO inclineyou_app
    USING (tenant_id IS NULL OR tenant_id = ANY (app_tenant_ids()));
CREATE POLICY exercise_custom_write ON exercise TO inclineyou_app
    USING (app_actor() = 'staff' AND origin = 'trainer' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND origin = 'trainer' AND tenant_id = app_tenant_id());
CREATE POLICY exercise_catalogue_seed ON exercise TO inclineyou_app
    USING (app_actor() = 'system' AND origin = 'inclineyou' AND tenant_id IS NULL)
    WITH CHECK (app_actor() = 'system' AND origin = 'inclineyou' AND tenant_id IS NULL);
CREATE POLICY working_hours_self ON working_hours TO inclineyou_app
    USING (trainer_id = app_trainer_id()) WITH CHECK (trainer_id = app_trainer_id());
CREATE POLICY nudge_template_self ON nudge_template TO inclineyou_app
    USING (trainer_id = app_trainer_id()) WITH CHECK (trainer_id = app_trainer_id());
CREATE POLICY tenant_self ON tenant FOR SELECT TO inclineyou_app USING (id = ANY (app_tenant_ids()));
CREATE POLICY tenant_mine ON tenant FOR SELECT TO inclineyou_app USING (app_phone() <> '' AND id IN (
    SELECT tm.tenant_id FROM tenant_member tm JOIN app_user au ON au.id = tm.app_user_id
    WHERE au.phone = app_phone() AND au.deleted_at IS NULL AND tm.deleted_at IS NULL AND tm.status = 'active'));
CREATE POLICY tenant_owner_update ON tenant FOR UPDATE TO inclineyou_app
    USING (app_actor() = 'staff' AND app_owns_tenant(id)) WITH CHECK (app_actor() = 'staff' AND app_owns_tenant(id));
CREATE POLICY tenant_member_self ON tenant_member FOR SELECT TO inclineyou_app USING (app_phone() <> '' AND app_user_id IN (
    SELECT au.id FROM app_user au WHERE au.phone = app_phone() AND au.deleted_at IS NULL));
CREATE POLICY tenant_member_tenant ON tenant_member FOR SELECT TO inclineyou_app USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()));
CREATE POLICY tenant_member_update ON tenant_member FOR UPDATE TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids())) WITH CHECK (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()));
CREATE POLICY tenant_invite_staff ON tenant_invite TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id() AND EXISTS (
        SELECT 1 FROM tenant_member tm JOIN app_user au ON au.id = tm.app_user_id
        WHERE tm.id = invited_by_member_id AND tm.tenant_id = tenant_invite.tenant_id AND tm.status = 'active'
          AND tm.deleted_at IS NULL AND tm.role IN ('owner', 'admin') AND au.phone = app_phone()));

-- ─── what the request role may touch ────────────────────────────────────────
--
-- SELECT, INSERT, UPDATE on every table; DELETE only where a row is meant to be
-- removed rather than tombstoned. The exceptions narrow from there.
DO $$
BEGIN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO inclineyou_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO inclineyou_app';
    -- un-silence, reset a wording, sign out, sweep a code, a mistaken extra set,
    -- a workout rewritten, a week edited
    EXECUTE 'GRANT DELETE ON attention_dismissal, nudge_template, web_session, otp_request, set_log,
                               workout_exercise, workout_set, working_hours TO inclineyou_app';
    -- reference and price lists: read only
    EXECUTE 'REVOKE INSERT, UPDATE ON tenant_role, plan_price FROM inclineyou_app';
    -- a seat is created by ensure_subscription() and moved by billing events
    EXECUTE 'REVOKE INSERT ON subscription FROM inclineyou_app';
    -- append-only logs (the triggers say so too)
    EXECUTE 'REVOKE UPDATE ON client_assignment, nudge_log FROM inclineyou_app';
    -- written only by the definer functions, read by support
    EXECUTE 'REVOKE ALL ON erasure_log FROM inclineyou_app';
    EXECUTE 'GRANT SELECT ON payment_trainer_share TO inclineyou_app';
    EXECUTE 'REVOKE ALL ON FUNCTION erase_clients(uuid[], text, uuid) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION erase_client(uuid), erase_account(uuid, text), purge_closed_tenants(), app_owns_tenant(uuid) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION erase_client(uuid), erase_account(uuid, text), purge_closed_tenants(), app_owns_tenant(uuid) TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;

-- Flyway's own history table stays readable to nobody but the owner.
DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON flyway_schema_history FROM inclineyou_app';
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL;
END $$;

-- ─── reference rows ──────────────────────────────────────────────────────────

INSERT INTO tenant_role (tenant_type, role) VALUES
    ('solo', 'owner'), ('solo', 'client'),
    ('team', 'owner'), ('team', 'admin'), ('team', 'coach'), ('team', 'client'),
    ('gym',  'owner'), ('gym',  'admin'), ('gym',  'coach'), ('gym',  'staff'), ('gym', 'client');

-- The Pro price for India: ₹499 a month, GST inclusive. A price rise is a new
-- row, and applies to new signups only (subscription copies its row).
INSERT INTO plan_price (plan, region, currency, amount, valid_from)
VALUES ('pro', 'india', 'INR', 499.00, TIMESTAMPTZ '2026-09-01 00:00:00+05:30');
