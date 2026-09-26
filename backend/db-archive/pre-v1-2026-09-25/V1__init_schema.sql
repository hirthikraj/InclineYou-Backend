-- InclineYou — the baseline schema.
--
-- This is a CONSOLIDATED BASELINE, not the first of a series of small steps.
-- It is the exact end state of the forty-two migrations that built this schema
-- between the first commit and the rename to InclineYou, flattened into one
-- file on 11 Sep 2026 because no database anywhere had to be carried forward:
-- there was no deployment, and the only instance was a developer's Docker
-- volume that was thrown away and rebuilt from this file.
--
-- Those forty-two files carried a great deal of reasoning in their comments —
-- why a column is nullable, which product argument a table settles, what a
-- constraint is defending against. Flattening the DDL cannot carry prose, so
-- none of it is here. It is not lost: the files are in git history, and the
-- standing arguments live in `SCHEMA.md` (every table and column), `TENANCY.md`
-- (the two ownership axes and the four policy tiers) and `API.md` (the wire).
-- Read those, not this file, to find out WHY something is shaped as it is.
--
-- ─── the rules, which did not change ─────────────────────────────────────────
--
-- From here the old law applies again, and applies to every future migration:
-- schema evolution is ADDITIVE-ONLY. Append a new V{n}__name.sql; never edit a
-- migration that has run; never drop or repurpose a column; never remove a
-- response field. Trainers' phones carry data we cannot refetch and old builds
-- must keep working. The client's WatermelonDB migrations in
-- `../app/src/db/migrations.ts` follow the same law and move in lockstep — they
-- were reset to schema v1 in the same change, for the same reason.
--
-- All PKs are client-generated UUIDs so an offline write has a key the server
-- accepts as-is. `updated_at` drives the sync cursor. Deletes are soft
-- (`deleted_at IS NULL` = alive) because sync has to propagate the tombstone.
-- Every row carries both `trainer_id` (who coaches) and `tenant_id` (whose
-- books); `tenant_id` is stamped on insert and frozen by trigger, and the
-- row-level security policies at the foot of this file are the wall.

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

-- ─── the schema ─────────────────────────────────────────────────────────────


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;
SET search_path = public, pg_catalog;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: app_actor(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_actor() RETURNS text
    LANGUAGE sql STABLE
    AS $$ SELECT COALESCE(NULLIF(current_setting('app.actor', true), ''), '') $$;


--
-- Name: app_client_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_client_ids() RETURNS uuid[]
    LANGUAGE sql STABLE
    AS $$ SELECT COALESCE(
       NULLIF(current_setting('app.client_ids', true), '')::uuid[],
       ARRAY[]::uuid[]) $$;


--
-- Name: FUNCTION app_client_ids(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_client_ids() IS 'A client-role caller''s own client rows, across every roster they are on. A set, not one id, because the same person under two arrangements is two rows.';


--
-- Name: app_owns_tenant(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_owns_tenant(target uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
    SELECT EXISTS (
        SELECT 1 FROM tenant t
        JOIN app_user au ON au.id = t.primary_app_user_id
        WHERE t.id = target
          AND au.phone = app_phone()
          AND au.deleted_at IS NULL
          AND t.deleted_at IS NULL
    );
$$;


--
-- Name: app_phone(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_phone() RETURNS text
    LANGUAGE sql STABLE
    AS $$ SELECT COALESCE(NULLIF(current_setting('app.phone', true), ''), '') $$;


--
-- Name: app_tenant_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_tenant_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;


--
-- Name: FUNCTION app_tenant_id(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_tenant_id() IS 'The ACTIVE workspace: where writes land and how far the money book reads. Always exactly one.';


--
-- Name: app_tenant_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_tenant_ids() RETURNS uuid[]
    LANGUAGE sql STABLE
    AS $$ SELECT COALESCE(
       NULLIF(current_setting('app.tenant_ids', true), '')::uuid[],
       ARRAY[]::uuid[]) $$;


--
-- Name: FUNCTION app_tenant_ids(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.app_tenant_ids() IS 'The READ scope: every workspace this person is a live member of, or just the active one when they have asked for a single workspace view. Empty array matches nothing.';


--
-- Name: app_trainer_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_trainer_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.trainer_id', true), '')::uuid $$;


--
-- Name: ensure_home_membership(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_home_membership() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
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


--
-- Name: ensure_home_tenant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_home_tenant() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
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


--
-- Name: ensure_membership_for_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_membership_for_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
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


--
-- Name: ensure_team_tenant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_team_tenant() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
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


--
-- Name: freeze_tenant_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.freeze_tenant_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        RAISE EXCEPTION
            'tenant_id is immutable: % cannot move from % to %',
            TG_TABLE_NAME, OLD.tenant_id, NEW.tenant_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;


--
-- Name: mirror_team_member(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mirror_team_member() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
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


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: stamp_tenant_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stamp_tenant_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: stamp_tenant_id_if_custom(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stamp_tenant_id_if_custom() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_user (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone character varying(15) NOT NULL,
    role character varying(20) NOT NULL,
    privacy_accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: attention_dismissal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attention_dismissal (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    client_id uuid NOT NULL,
    kind character varying(30) NOT NULL,
    band character varying(30) NOT NULL,
    snoozed_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL
);


--
-- Name: batch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.batch (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    name character varying(120) NOT NULL,
    capacity integer DEFAULT 10 NOT NULL,
    min_size integer DEFAULT 4 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    tenant_id uuid NOT NULL
);


--
-- Name: body_metric; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.body_metric (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    metric_type character varying(30) NOT NULL,
    value numeric(8,2) NOT NULL,
    unit character varying(10) NOT NULL,
    notes text,
    recorded_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    tenant_id uuid NOT NULL
);


--
-- Name: client; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    phone character varying(15),
    goal text,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    payment_mode character varying(20) DEFAULT 'trainer_collects'::character varying NOT NULL,
    trainer_split_percent numeric(5,2),
    height_cm numeric(5,1),
    activity_level character varying(20),
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    sessions_per_week integer,
    session_duration_minutes integer,
    weekly_schedule jsonb,
    delivery_mode character varying(16),
    paused_at timestamp with time zone,
    membership_status character varying(20) DEFAULT 'accepted'::character varying NOT NULL,
    invited_at timestamp with time zone,
    accepted_at timestamp with time zone,
    declined_at timestamp with time zone,
    removed_at timestamp with time zone,
    removed_ack_at timestamp with time zone,
    tenant_id uuid NOT NULL,
    stale_at timestamp with time zone,
    stale_reason character varying(40),
    assigned_by_app_user_id uuid,
    assignment_margin_percent numeric(5,2),
    assigned_at timestamp with time zone
);


--
-- Name: client_assignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_assignment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    team_id uuid,
    from_trainer_id uuid NOT NULL,
    to_trainer_id uuid NOT NULL,
    actor_trainer_id uuid NOT NULL,
    program_action character varying(20) NOT NULL,
    note character varying(500),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    actor_margin_percent numeric(5,2),
    reason character varying(40)
);


--
-- Name: client_note; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_note (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    trainer_id uuid NOT NULL,
    body text NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    tenant_id uuid NOT NULL
);


--
-- Name: exercise; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercise (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(150) NOT NULL,
    muscle_group character varying(50),
    equipment character varying(50),
    movement_pattern character varying(50),
    description text,
    image_url text,
    video_url text,
    is_custom boolean DEFAULT false NOT NULL,
    trainer_id uuid,
    source_id character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    level character varying(20),
    metadata jsonb,
    log_type character varying(20),
    body_part character varying(30),
    target character varying(50),
    tenant_id uuid
);


--
-- Name: exercise_favourite; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercise_favourite (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    tenant_id uuid NOT NULL
);


--
-- Name: gym_settlement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gym_settlement (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    period character varying(7) NOT NULL,
    amount numeric(10,2) NOT NULL,
    sessions_counted integer,
    gym_name character varying(120),
    status character varying(20) DEFAULT 'due'::character varying NOT NULL,
    due_at timestamp with time zone,
    settled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    tenant_id uuid NOT NULL
);


--
-- Name: nudge_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nudge_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    client_id uuid NOT NULL,
    channel character varying(20) DEFAULT 'whatsapp'::character varying NOT NULL,
    template_name character varying(100),
    status character varying(20) DEFAULT 'sent'::character varying NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    message text,
    tenant_id uuid NOT NULL
);


--
-- Name: nudge_rule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nudge_rule (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    kind character varying(30) NOT NULL,
    threshold integer,
    action character varying(10) DEFAULT 'ask'::character varying NOT NULL,
    message text,
    enabled boolean DEFAULT true NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    tenant_id uuid NOT NULL
);


--
-- Name: nudge_template; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nudge_template (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    name character varying(50) NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    tenant_id uuid NOT NULL
);


--
-- Name: otp_request; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otp_request (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone character varying(15) NOT NULL,
    otp_hash character varying(255) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    wrong_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone
);


--
-- Name: pack; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pack (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    name character varying(80) NOT NULL,
    type character varying(20) DEFAULT 'session_pack'::character varying NOT NULL,
    sessions integer,
    amount numeric(10,2) NOT NULL,
    currency character varying(3) DEFAULT 'INR'::character varying NOT NULL,
    validity_days integer,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    owner character varying(20) DEFAULT 'trainer'::character varying NOT NULL,
    tenant_id uuid NOT NULL
);


--
-- Name: package; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.package (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    client_id uuid NOT NULL,
    type character varying(20) DEFAULT 'session_pack'::character varying NOT NULL,
    sessions_total integer,
    sessions_remaining integer,
    amount numeric(10,2) NOT NULL,
    currency character varying(3) DEFAULT 'INR'::character varying NOT NULL,
    start_date date,
    end_date date,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    pack_id uuid,
    due_date date,
    written_off_at timestamp with time zone,
    written_off_amount numeric(10,2),
    discount_amount numeric(10,2),
    paused_at timestamp with time zone,
    paused_days integer DEFAULT 0 NOT NULL,
    closed_at timestamp with time zone,
    tenant_id uuid NOT NULL
);


--
-- Name: package_adjustment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.package_adjustment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    package_id uuid NOT NULL,
    trainer_id uuid NOT NULL,
    kind character varying(20) NOT NULL,
    days integer DEFAULT 0 NOT NULL,
    reason text,
    effective_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL
);


--
-- Name: payment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    client_id uuid NOT NULL,
    package_id uuid,
    amount numeric(10,2) NOT NULL,
    currency character varying(3) DEFAULT 'INR'::character varying NOT NULL,
    method character varying(30) DEFAULT 'upi_intent'::character varying NOT NULL,
    collected_by character varying(10) DEFAULT 'trainer'::character varying NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    upi_reference character varying(100),
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    gym_share_amount numeric(10,2),
    share_percent numeric(5,2),
    receipt_no character varying(30),
    note text,
    tenant_id uuid NOT NULL
);


--
-- Name: program; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.program (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    client_id uuid NOT NULL,
    template_id uuid,
    name character varying(150) NOT NULL,
    goal text,
    start_date date,
    end_date date,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    schedule jsonb,
    tenant_id uuid NOT NULL
);


--
-- Name: program_exercise; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.program_exercise (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    program_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    sets integer,
    reps integer,
    rest_seconds integer,
    target_load numeric(6,2),
    notes text,
    day_of_week integer,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    week integer,
    duration_seconds integer,
    tempo text,
    alt_exercise_id uuid,
    group_id uuid,
    set_detail jsonb,
    tenant_id uuid NOT NULL
);


--
-- Name: scheduled_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    client_id uuid NOT NULL,
    program_id uuid,
    scheduled_at timestamp with time zone NOT NULL,
    duration_minutes integer,
    status character varying(20) DEFAULT 'scheduled'::character varying NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    day_label character varying(100),
    template_day integer,
    delivery_mode character varying(16),
    series_id uuid,
    cancelled_by character varying(16),
    pack_delta integer,
    pack_package_id uuid,
    pack_applied_at timestamp with time zone,
    moved_from_at timestamp with time zone,
    client_confirmed_at timestamp with time zone,
    batch_id uuid,
    tenant_id uuid NOT NULL
);


--
-- Name: set_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.set_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workout_session_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    set_number integer NOT NULL,
    load_kg numeric(6,2),
    reps integer,
    rpe numeric(3,1),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    tenant_id uuid NOT NULL
);


--
-- Name: team; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_trainer_id uuid NOT NULL,
    name character varying(120) NOT NULL,
    logo_url character varying(500),
    seat_limit integer,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    tenant_id uuid NOT NULL
);


--
-- Name: team_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    actor_trainer_id uuid NOT NULL,
    subject_trainer_id uuid NOT NULL,
    client_id uuid,
    entity_type character varying(30) NOT NULL,
    entity_id uuid NOT NULL,
    action character varying(20) NOT NULL,
    summary character varying(300) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    CONSTRAINT team_activity_is_a_crossing CHECK ((actor_trainer_id <> subject_trainer_id))
);


--
-- Name: team_member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_member (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    trainer_id uuid,
    invited_phone character varying(15),
    role character varying(20) NOT NULL,
    status character varying(20) NOT NULL,
    invited_by_trainer_id uuid,
    invited_at timestamp with time zone,
    joined_at timestamp with time zone,
    declined_at timestamp with time zone,
    removed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    tenant_id uuid NOT NULL,
    CONSTRAINT team_member_identifies_somebody CHECK (((trainer_id IS NOT NULL) OR (invited_phone IS NOT NULL)))
);


--
-- Name: template; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.template (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    name character varying(150) NOT NULL,
    goal text,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    structure jsonb,
    day_labels jsonb,
    weeks integer,
    training_days text,
    tenant_id uuid NOT NULL
);


--
-- Name: tenant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type character varying(20) NOT NULL,
    name character varying(160) NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    primary_app_user_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: tenant_member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_member (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    app_user_id uuid NOT NULL,
    role character varying(20) NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    is_home boolean DEFAULT false NOT NULL,
    revenue_share_percent numeric(5,2),
    assignment_margin_percent numeric(5,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: COLUMN tenant_member.revenue_share_percent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tenant_member.revenue_share_percent IS 'What this member keeps of what they collect in this workspace. NULL = 100%, which is the correct default for a solo tenant.';


--
-- Name: COLUMN tenant_member.assignment_margin_percent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tenant_member.assignment_margin_percent IS 'An admin''s cut of revenue from clients they assigned to somebody else. NULL = none. Frozen per handover onto client_assignment.actor_margin_percent.';


--
-- Name: time_block; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_block (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    all_day boolean DEFAULT false NOT NULL,
    reason character varying(120),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    tenant_id uuid NOT NULL
);


--
-- Name: trainer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trainer (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone character varying(15) NOT NULL,
    name character varying(100) NOT NULL,
    upi_vpa character varying(100),
    fcm_token text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    experience_band character varying(20),
    specialities jsonb DEFAULT '[]'::jsonb NOT NULL,
    certifications jsonb DEFAULT '[]'::jsonb NOT NULL,
    languages jsonb DEFAULT '[]'::jsonb NOT NULL,
    setup_completed_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    gym_name character varying(120),
    gym_share_percent numeric(5,2),
    work_mode character varying(20),
    headline text,
    bio text,
    intro_video_url text,
    map_link text,
    training_modes jsonb DEFAULT '[]'::jsonb NOT NULL,
    service_areas jsonb DEFAULT '[]'::jsonb NOT NULL,
    instagram_url text,
    youtube_url text,
    email character varying(254),
    home_tenant_id uuid
);


--
-- Name: web_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.web_session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_hash character varying(64) NOT NULL,
    subject character varying(64) NOT NULL,
    phone character varying(15) NOT NULL,
    role character varying(20) NOT NULL,
    app_user_id uuid,
    tenant_id uuid,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    user_agent character varying(300),
    created_ip character varying(64),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: weekly_report; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weekly_report (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    client_id uuid NOT NULL,
    week_start date NOT NULL,
    week_end date NOT NULL,
    sessions_kept integer DEFAULT 0 NOT NULL,
    sessions_planned integer DEFAULT 0 NOT NULL,
    trained_days character varying(20),
    volume_kg numeric(12,2) DEFAULT 0 NOT NULL,
    sets_done integer DEFAULT 0 NOT NULL,
    new_bests integer DEFAULT 0 NOT NULL,
    best_line text,
    best_previous text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    tenant_id uuid NOT NULL
);


--
-- Name: working_hours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.working_hours (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    weekday smallint NOT NULL,
    start_minute smallint NOT NULL,
    end_minute smallint NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    tenant_id uuid NOT NULL
);


--
-- Name: workout_exercise; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workout_exercise (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workout_session_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    source character varying(20) DEFAULT 'planned'::character varying NOT NULL,
    swapped_from_exercise_id uuid,
    target_sets integer,
    target_reps integer,
    rest_seconds integer,
    removed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    tenant_id uuid NOT NULL
);


--
-- Name: workout_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workout_session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_id uuid NOT NULL,
    client_id uuid NOT NULL,
    program_id uuid,
    scheduled_session_id uuid,
    logged_by character varying(10) DEFAULT 'trainer'::character varying NOT NULL,
    session_date date NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    ended_at timestamp with time zone,
    tenant_id uuid NOT NULL
);


--
-- Name: app_user app_user_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_phone_key UNIQUE (phone);


--
-- Name: app_user app_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_pkey PRIMARY KEY (id);


--
-- Name: attention_dismissal attention_dismissal_one_per_job; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attention_dismissal
    ADD CONSTRAINT attention_dismissal_one_per_job UNIQUE (trainer_id, client_id, kind);


--
-- Name: attention_dismissal attention_dismissal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attention_dismissal
    ADD CONSTRAINT attention_dismissal_pkey PRIMARY KEY (id);


--
-- Name: batch batch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch
    ADD CONSTRAINT batch_pkey PRIMARY KEY (id);


--
-- Name: body_metric body_metric_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.body_metric
    ADD CONSTRAINT body_metric_pkey PRIMARY KEY (id);


--
-- Name: client_assignment client_assignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_assignment
    ADD CONSTRAINT client_assignment_pkey PRIMARY KEY (id);


--
-- Name: client_note client_note_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_note
    ADD CONSTRAINT client_note_pkey PRIMARY KEY (id);


--
-- Name: client client_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client
    ADD CONSTRAINT client_pkey PRIMARY KEY (id);


--
-- Name: exercise_favourite exercise_favourite_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_favourite
    ADD CONSTRAINT exercise_favourite_pkey PRIMARY KEY (id);


--
-- Name: exercise exercise_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise
    ADD CONSTRAINT exercise_pkey PRIMARY KEY (id);


--
-- Name: gym_settlement gym_settlement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gym_settlement
    ADD CONSTRAINT gym_settlement_pkey PRIMARY KEY (id);


--
-- Name: nudge_log nudge_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nudge_log
    ADD CONSTRAINT nudge_log_pkey PRIMARY KEY (id);


--
-- Name: nudge_rule nudge_rule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nudge_rule
    ADD CONSTRAINT nudge_rule_pkey PRIMARY KEY (id);


--
-- Name: nudge_template nudge_template_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nudge_template
    ADD CONSTRAINT nudge_template_pkey PRIMARY KEY (id);


--
-- Name: otp_request otp_request_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_request
    ADD CONSTRAINT otp_request_pkey PRIMARY KEY (id);


--
-- Name: pack pack_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pack
    ADD CONSTRAINT pack_pkey PRIMARY KEY (id);


--
-- Name: package_adjustment package_adjustment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_adjustment
    ADD CONSTRAINT package_adjustment_pkey PRIMARY KEY (id);


--
-- Name: package package_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package
    ADD CONSTRAINT package_pkey PRIMARY KEY (id);


--
-- Name: payment payment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_pkey PRIMARY KEY (id);


--
-- Name: program_exercise program_exercise_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_exercise
    ADD CONSTRAINT program_exercise_pkey PRIMARY KEY (id);


--
-- Name: program program_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program
    ADD CONSTRAINT program_pkey PRIMARY KEY (id);


--
-- Name: scheduled_session scheduled_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_session
    ADD CONSTRAINT scheduled_session_pkey PRIMARY KEY (id);


--
-- Name: set_log set_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_log
    ADD CONSTRAINT set_log_pkey PRIMARY KEY (id);


--
-- Name: team_activity team_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_activity
    ADD CONSTRAINT team_activity_pkey PRIMARY KEY (id);


--
-- Name: team_member team_member_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_member
    ADD CONSTRAINT team_member_pkey PRIMARY KEY (id);


--
-- Name: team team_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team
    ADD CONSTRAINT team_pkey PRIMARY KEY (id);


--
-- Name: template template_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template
    ADD CONSTRAINT template_pkey PRIMARY KEY (id);


--
-- Name: tenant_member tenant_member_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_member
    ADD CONSTRAINT tenant_member_pkey PRIMARY KEY (id);


--
-- Name: tenant tenant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant
    ADD CONSTRAINT tenant_pkey PRIMARY KEY (id);


--
-- Name: time_block time_block_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_block
    ADD CONSTRAINT time_block_pkey PRIMARY KEY (id);


--
-- Name: trainer trainer_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer
    ADD CONSTRAINT trainer_phone_key UNIQUE (phone);


--
-- Name: trainer trainer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer
    ADD CONSTRAINT trainer_pkey PRIMARY KEY (id);


--
-- Name: web_session web_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_session
    ADD CONSTRAINT web_session_pkey PRIMARY KEY (id);


--
-- Name: web_session web_session_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_session
    ADD CONSTRAINT web_session_token_hash_key UNIQUE (token_hash);


--
-- Name: weekly_report weekly_report_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_report
    ADD CONSTRAINT weekly_report_pkey PRIMARY KEY (id);


--
-- Name: working_hours working_hours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.working_hours
    ADD CONSTRAINT working_hours_pkey PRIMARY KEY (id);


--
-- Name: workout_exercise workout_exercise_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_exercise
    ADD CONSTRAINT workout_exercise_pkey PRIMARY KEY (id);


--
-- Name: workout_session workout_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_session
    ADD CONSTRAINT workout_session_pkey PRIMARY KEY (id);


--
-- Name: idx_attention_dismissal_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attention_dismissal_client ON public.attention_dismissal USING btree (client_id);


--
-- Name: idx_attention_dismissal_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attention_dismissal_tenant ON public.attention_dismissal USING btree (tenant_id);


--
-- Name: idx_attention_dismissal_tenant_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attention_dismissal_tenant_trainer ON public.attention_dismissal USING btree (tenant_id, trainer_id);


--
-- Name: idx_attention_dismissal_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attention_dismissal_trainer ON public.attention_dismissal USING btree (trainer_id);


--
-- Name: idx_batch_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batch_tenant ON public.batch USING btree (tenant_id);


--
-- Name: idx_batch_tenant_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batch_tenant_trainer ON public.batch USING btree (tenant_id, trainer_id);


--
-- Name: idx_batch_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batch_trainer ON public.batch USING btree (trainer_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_body_metric_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_body_metric_client_id ON public.body_metric USING btree (client_id);


--
-- Name: idx_body_metric_recorded_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_body_metric_recorded_at ON public.body_metric USING btree (client_id, recorded_at);


--
-- Name: idx_body_metric_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_body_metric_tenant ON public.body_metric USING btree (tenant_id);


--
-- Name: idx_client_assignment_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_assignment_client ON public.client_assignment USING btree (client_id, created_at);


--
-- Name: idx_client_assignment_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_assignment_from ON public.client_assignment USING btree (from_trainer_id, created_at);


--
-- Name: idx_client_assignment_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_assignment_team ON public.client_assignment USING btree (team_id, created_at);


--
-- Name: idx_client_assignment_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_assignment_tenant ON public.client_assignment USING btree (tenant_id);


--
-- Name: idx_client_membership_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_membership_status ON public.client USING btree (phone, membership_status) WHERE ((phone IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: idx_client_note_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_note_client ON public.client_note USING btree (client_id, created_at DESC);


--
-- Name: idx_client_note_pinned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_note_pinned ON public.client_note USING btree (client_id, created_at DESC) WHERE (pinned AND (deleted_at IS NULL));


--
-- Name: idx_client_note_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_note_tenant ON public.client_note USING btree (tenant_id);


--
-- Name: idx_client_note_tenant_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_note_tenant_trainer ON public.client_note USING btree (tenant_id, trainer_id);


--
-- Name: idx_client_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_phone ON public.client USING btree (phone) WHERE ((phone IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: idx_client_stale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_stale ON public.client USING btree (tenant_id, stale_at) WHERE ((stale_at IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: idx_client_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_tenant ON public.client USING btree (tenant_id);


--
-- Name: idx_client_tenant_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_tenant_trainer ON public.client USING btree (tenant_id, trainer_id);


--
-- Name: idx_client_trainer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_trainer_id ON public.client USING btree (trainer_id);


--
-- Name: idx_exercise_body_part; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_body_part ON public.exercise USING btree (body_part);


--
-- Name: idx_exercise_favourite_pair; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_exercise_favourite_pair ON public.exercise_favourite USING btree (trainer_id, exercise_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_exercise_favourite_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_favourite_tenant ON public.exercise_favourite USING btree (tenant_id);


--
-- Name: idx_exercise_favourite_tenant_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_favourite_tenant_trainer ON public.exercise_favourite USING btree (tenant_id, trainer_id);


--
-- Name: idx_exercise_favourite_trainer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_favourite_trainer_id ON public.exercise_favourite USING btree (trainer_id);


--
-- Name: idx_exercise_muscle_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_muscle_group ON public.exercise USING btree (muscle_group);


--
-- Name: idx_exercise_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_tenant ON public.exercise USING btree (tenant_id) WHERE (tenant_id IS NOT NULL);


--
-- Name: idx_exercise_trainer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_trainer_id ON public.exercise USING btree (trainer_id);


--
-- Name: idx_gym_settlement_period; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_gym_settlement_period ON public.gym_settlement USING btree (trainer_id, period) WHERE (deleted_at IS NULL);


--
-- Name: idx_gym_settlement_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gym_settlement_tenant ON public.gym_settlement USING btree (tenant_id);


--
-- Name: idx_gym_settlement_tenant_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gym_settlement_tenant_trainer ON public.gym_settlement USING btree (tenant_id, trainer_id);


--
-- Name: idx_gym_settlement_trainer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gym_settlement_trainer_id ON public.gym_settlement USING btree (trainer_id);


--
-- Name: idx_nudge_log_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nudge_log_client_id ON public.nudge_log USING btree (client_id);


--
-- Name: idx_nudge_log_client_sent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nudge_log_client_sent ON public.nudge_log USING btree (client_id, sent_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_nudge_log_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nudge_log_tenant ON public.nudge_log USING btree (tenant_id);


--
-- Name: idx_nudge_log_tenant_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nudge_log_tenant_trainer ON public.nudge_log USING btree (tenant_id, trainer_id);


--
-- Name: idx_nudge_log_trainer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nudge_log_trainer_id ON public.nudge_log USING btree (trainer_id);


--
-- Name: idx_nudge_log_trainer_sent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nudge_log_trainer_sent ON public.nudge_log USING btree (trainer_id, sent_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_nudge_rule_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_nudge_rule_kind ON public.nudge_rule USING btree (trainer_id, kind) WHERE (deleted_at IS NULL);


--
-- Name: idx_nudge_rule_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nudge_rule_tenant ON public.nudge_rule USING btree (tenant_id);


--
-- Name: idx_nudge_rule_tenant_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nudge_rule_tenant_trainer ON public.nudge_rule USING btree (tenant_id, trainer_id);


--
-- Name: idx_nudge_rule_trainer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nudge_rule_trainer_id ON public.nudge_rule USING btree (trainer_id);


--
-- Name: idx_nudge_template_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_nudge_template_name ON public.nudge_template USING btree (trainer_id, name) WHERE (deleted_at IS NULL);


--
-- Name: idx_nudge_template_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nudge_template_tenant ON public.nudge_template USING btree (tenant_id);


--
-- Name: idx_nudge_template_tenant_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nudge_template_tenant_trainer ON public.nudge_template USING btree (tenant_id, trainer_id);


--
-- Name: idx_nudge_template_trainer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nudge_template_trainer_id ON public.nudge_template USING btree (trainer_id);


--
-- Name: idx_otp_request_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_request_phone ON public.otp_request USING btree (phone);


--
-- Name: idx_otp_request_phone_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_request_phone_created_at ON public.otp_request USING btree (phone, created_at DESC);


--
-- Name: idx_otp_request_phone_locked_until; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_request_phone_locked_until ON public.otp_request USING btree (phone, locked_until DESC) WHERE (locked_until IS NOT NULL);


--
-- Name: idx_pack_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pack_tenant ON public.pack USING btree (tenant_id);


--
-- Name: idx_pack_tenant_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pack_tenant_trainer ON public.pack USING btree (tenant_id, trainer_id);


--
-- Name: idx_pack_trainer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pack_trainer_id ON public.pack USING btree (trainer_id);


--
-- Name: idx_pack_trainer_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pack_trainer_owner ON public.pack USING btree (trainer_id, owner);


--
-- Name: idx_package_adjustment_package; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_package_adjustment_package ON public.package_adjustment USING btree (package_id, effective_at);


--
-- Name: idx_package_adjustment_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_package_adjustment_tenant ON public.package_adjustment USING btree (tenant_id);


--
-- Name: idx_package_adjustment_tenant_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_package_adjustment_tenant_trainer ON public.package_adjustment USING btree (tenant_id, trainer_id);


--
-- Name: idx_package_adjustment_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_package_adjustment_trainer ON public.package_adjustment USING btree (trainer_id, created_at DESC);


--
-- Name: idx_package_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_package_client_id ON public.package USING btree (client_id);


--
-- Name: idx_package_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_package_live ON public.package USING btree (trainer_id) WHERE (((status)::text = 'active'::text) AND (deleted_at IS NULL));


--
-- Name: idx_package_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_package_tenant ON public.package USING btree (tenant_id);


--
-- Name: idx_package_tenant_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_package_tenant_trainer ON public.package USING btree (tenant_id, trainer_id);


--
-- Name: idx_package_trainer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_package_trainer_id ON public.package USING btree (trainer_id);


--
-- Name: idx_payment_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_client_id ON public.payment USING btree (client_id);


--
-- Name: idx_payment_paid_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_paid_at ON public.payment USING btree (trainer_id, paid_at);


--
-- Name: idx_payment_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_tenant ON public.payment USING btree (tenant_id);


--
-- Name: idx_payment_tenant_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_tenant_trainer ON public.payment USING btree (tenant_id, trainer_id);


--
-- Name: idx_payment_trainer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_trainer_id ON public.payment USING btree (trainer_id);


--
-- Name: idx_program_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_client_id ON public.program USING btree (client_id);


--
-- Name: idx_program_exercise_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_exercise_group ON public.program_exercise USING btree (program_id, group_id) WHERE ((group_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: idx_program_exercise_program_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_exercise_program_id ON public.program_exercise USING btree (program_id);


--
-- Name: idx_program_exercise_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_exercise_tenant ON public.program_exercise USING btree (tenant_id);


--
-- Name: idx_program_exercise_week; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_exercise_week ON public.program_exercise USING btree (program_id, week, day_of_week) WHERE (deleted_at IS NULL);


--
-- Name: idx_program_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_tenant ON public.program USING btree (tenant_id);


--
-- Name: idx_program_tenant_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_tenant_trainer ON public.program USING btree (tenant_id, trainer_id);


--
-- Name: idx_program_trainer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_trainer_id ON public.program USING btree (trainer_id);


--
-- Name: idx_scheduled_session_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_session_batch ON public.scheduled_session USING btree (batch_id) WHERE ((batch_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: idx_scheduled_session_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_session_client_id ON public.scheduled_session USING btree (client_id);


--
-- Name: idx_scheduled_session_delivery_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_session_delivery_mode ON public.scheduled_session USING btree (trainer_id, delivery_mode) WHERE ((delivery_mode IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: idx_scheduled_session_scheduled_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_session_scheduled_at ON public.scheduled_session USING btree (scheduled_at);


--
-- Name: idx_scheduled_session_series; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_session_series ON public.scheduled_session USING btree (series_id) WHERE ((series_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: idx_scheduled_session_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_session_tenant ON public.scheduled_session USING btree (tenant_id);


--
-- Name: idx_scheduled_session_tenant_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_session_tenant_trainer ON public.scheduled_session USING btree (tenant_id, trainer_id);


--
-- Name: idx_scheduled_session_trainer_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_session_trainer_at ON public.scheduled_session USING btree (trainer_id, scheduled_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_scheduled_session_trainer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_session_trainer_id ON public.scheduled_session USING btree (trainer_id);


--
-- Name: idx_set_log_exercise_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_set_log_exercise_id ON public.set_log USING btree (exercise_id);


--
-- Name: idx_set_log_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_set_log_tenant ON public.set_log USING btree (tenant_id);


--
-- Name: idx_set_log_workout_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_set_log_workout_session_id ON public.set_log USING btree (workout_session_id);


--
-- Name: idx_team_activity_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_activity_client ON public.team_activity USING btree (client_id, created_at DESC) WHERE (client_id IS NOT NULL);


--
-- Name: idx_team_activity_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_activity_subject ON public.team_activity USING btree (subject_trainer_id, created_at DESC);


--
-- Name: idx_team_activity_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_activity_team ON public.team_activity USING btree (team_id, created_at DESC);


--
-- Name: idx_team_activity_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_activity_tenant ON public.team_activity USING btree (tenant_id);


--
-- Name: idx_team_member_invited_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_member_invited_phone ON public.team_member USING btree (invited_phone, status) WHERE (deleted_at IS NULL);


--
-- Name: idx_team_member_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_member_team ON public.team_member USING btree (team_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_team_member_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_member_tenant ON public.team_member USING btree (tenant_id);


--
-- Name: idx_team_member_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_member_trainer ON public.team_member USING btree (trainer_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_team_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_owner ON public.team USING btree (owner_trainer_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_template_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_template_tenant ON public.template USING btree (tenant_id);


--
-- Name: idx_template_tenant_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_template_tenant_trainer ON public.template USING btree (tenant_id, trainer_id);


--
-- Name: idx_template_trainer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_template_trainer_id ON public.template USING btree (trainer_id);


--
-- Name: idx_tenant_member_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_member_tenant ON public.tenant_member USING btree (tenant_id, status) WHERE (deleted_at IS NULL);


--
-- Name: idx_tenant_member_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_member_user ON public.tenant_member USING btree (app_user_id, status) WHERE (deleted_at IS NULL);


--
-- Name: idx_tenant_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_type ON public.tenant USING btree (type) WHERE (deleted_at IS NULL);


--
-- Name: idx_time_block_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_block_tenant ON public.time_block USING btree (tenant_id);


--
-- Name: idx_time_block_tenant_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_block_tenant_trainer ON public.time_block USING btree (tenant_id, trainer_id);


--
-- Name: idx_time_block_trainer_range; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_block_trainer_range ON public.time_block USING btree (trainer_id, starts_at, ends_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_trainer_languages; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trainer_languages ON public.trainer USING gin (languages);


--
-- Name: idx_trainer_training_modes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trainer_training_modes ON public.trainer USING gin (training_modes);


--
-- Name: idx_web_session_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_session_expiry ON public.web_session USING btree (expires_at) WHERE (revoked_at IS NULL);


--
-- Name: idx_web_session_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_session_subject ON public.web_session USING btree (subject, revoked_at);


--
-- Name: idx_weekly_report_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weekly_report_tenant ON public.weekly_report USING btree (tenant_id);


--
-- Name: idx_weekly_report_tenant_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weekly_report_tenant_trainer ON public.weekly_report USING btree (tenant_id, trainer_id);


--
-- Name: idx_weekly_report_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weekly_report_trainer ON public.weekly_report USING btree (trainer_id, week_start DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_weekly_report_week; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_weekly_report_week ON public.weekly_report USING btree (client_id, week_start) WHERE (deleted_at IS NULL);


--
-- Name: idx_working_hours_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_working_hours_tenant ON public.working_hours USING btree (tenant_id);


--
-- Name: idx_working_hours_tenant_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_working_hours_tenant_trainer ON public.working_hours USING btree (tenant_id, trainer_id);


--
-- Name: idx_working_hours_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_working_hours_trainer ON public.working_hours USING btree (trainer_id, weekday) WHERE (deleted_at IS NULL);


--
-- Name: idx_workout_exercise_pair; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_workout_exercise_pair ON public.workout_exercise USING btree (workout_session_id, exercise_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_workout_exercise_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_exercise_session ON public.workout_exercise USING btree (workout_session_id);


--
-- Name: idx_workout_exercise_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_exercise_tenant ON public.workout_exercise USING btree (tenant_id);


--
-- Name: idx_workout_session_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_session_client_id ON public.workout_session USING btree (client_id);


--
-- Name: idx_workout_session_session_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_session_session_date ON public.workout_session USING btree (session_date);


--
-- Name: idx_workout_session_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_session_tenant ON public.workout_session USING btree (tenant_id);


--
-- Name: idx_workout_session_tenant_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_session_tenant_trainer ON public.workout_session USING btree (tenant_id, trainer_id);


--
-- Name: idx_workout_session_trainer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_session_trainer_id ON public.workout_session USING btree (trainer_id);


--
-- Name: uq_exercise_source_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_exercise_source_id ON public.exercise USING btree (source_id) WHERE (source_id IS NOT NULL);


--
-- Name: uq_team_member_active_trainer; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_team_member_active_trainer ON public.team_member USING btree (trainer_id) WHERE (((status)::text = 'active'::text) AND (deleted_at IS NULL) AND (trainer_id IS NOT NULL));


--
-- Name: uq_team_member_one_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_team_member_one_owner ON public.team_member USING btree (team_id) WHERE (((role)::text = 'owner'::text) AND ((status)::text = 'active'::text) AND (deleted_at IS NULL));


--
-- Name: uq_team_member_pending_invite; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_team_member_pending_invite ON public.team_member USING btree (team_id, invited_phone) WHERE (((status)::text = 'invited'::text) AND (deleted_at IS NULL) AND (invited_phone IS NOT NULL));


--
-- Name: uq_tenant_member_home; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_tenant_member_home ON public.tenant_member USING btree (app_user_id) WHERE (is_home AND (deleted_at IS NULL));


--
-- Name: uq_tenant_member_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_tenant_member_live ON public.tenant_member USING btree (tenant_id, app_user_id, role) WHERE (deleted_at IS NULL);


--
-- Name: app_user trg_app_user_home_membership; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_user_home_membership AFTER INSERT ON public.app_user FOR EACH ROW EXECUTE FUNCTION public.ensure_membership_for_user();


--
-- Name: app_user trg_app_user_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_user_updated_at BEFORE UPDATE ON public.app_user FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: attention_dismissal trg_attention_dismissal_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_attention_dismissal_freeze_tenant BEFORE UPDATE ON public.attention_dismissal FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: attention_dismissal trg_attention_dismissal_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_attention_dismissal_stamp_tenant BEFORE INSERT ON public.attention_dismissal FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: batch trg_batch_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_batch_freeze_tenant BEFORE UPDATE ON public.batch FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: batch trg_batch_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_batch_stamp_tenant BEFORE INSERT ON public.batch FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: body_metric trg_body_metric_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_body_metric_freeze_tenant BEFORE UPDATE ON public.body_metric FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: body_metric trg_body_metric_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_body_metric_stamp_tenant BEFORE INSERT ON public.body_metric FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: body_metric trg_body_metric_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_body_metric_updated_at BEFORE UPDATE ON public.body_metric FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: client_assignment trg_client_assignment_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_client_assignment_freeze_tenant BEFORE UPDATE ON public.client_assignment FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: client_assignment trg_client_assignment_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_client_assignment_stamp_tenant BEFORE INSERT ON public.client_assignment FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: client trg_client_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_client_freeze_tenant BEFORE UPDATE ON public.client FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: client_note trg_client_note_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_client_note_freeze_tenant BEFORE UPDATE ON public.client_note FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: client_note trg_client_note_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_client_note_stamp_tenant BEFORE INSERT ON public.client_note FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: client trg_client_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_client_stamp_tenant BEFORE INSERT ON public.client FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: client trg_client_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_client_updated_at BEFORE UPDATE ON public.client FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: exercise_favourite trg_exercise_favourite_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_exercise_favourite_freeze_tenant BEFORE UPDATE ON public.exercise_favourite FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: exercise_favourite trg_exercise_favourite_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_exercise_favourite_stamp_tenant BEFORE INSERT ON public.exercise_favourite FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: exercise_favourite trg_exercise_favourite_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_exercise_favourite_updated_at BEFORE UPDATE ON public.exercise_favourite FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: exercise trg_exercise_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_exercise_freeze_tenant BEFORE UPDATE ON public.exercise FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: exercise trg_exercise_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_exercise_stamp_tenant BEFORE INSERT ON public.exercise FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id_if_custom();


--
-- Name: exercise trg_exercise_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_exercise_updated_at BEFORE UPDATE ON public.exercise FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: gym_settlement trg_gym_settlement_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gym_settlement_freeze_tenant BEFORE UPDATE ON public.gym_settlement FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: gym_settlement trg_gym_settlement_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gym_settlement_stamp_tenant BEFORE INSERT ON public.gym_settlement FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: gym_settlement trg_gym_settlement_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gym_settlement_updated_at BEFORE UPDATE ON public.gym_settlement FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: nudge_log trg_nudge_log_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_nudge_log_freeze_tenant BEFORE UPDATE ON public.nudge_log FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: nudge_log trg_nudge_log_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_nudge_log_stamp_tenant BEFORE INSERT ON public.nudge_log FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: nudge_log trg_nudge_log_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_nudge_log_updated_at BEFORE UPDATE ON public.nudge_log FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: nudge_rule trg_nudge_rule_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_nudge_rule_freeze_tenant BEFORE UPDATE ON public.nudge_rule FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: nudge_rule trg_nudge_rule_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_nudge_rule_stamp_tenant BEFORE INSERT ON public.nudge_rule FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: nudge_rule trg_nudge_rule_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_nudge_rule_updated_at BEFORE UPDATE ON public.nudge_rule FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: nudge_template trg_nudge_template_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_nudge_template_freeze_tenant BEFORE UPDATE ON public.nudge_template FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: nudge_template trg_nudge_template_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_nudge_template_stamp_tenant BEFORE INSERT ON public.nudge_template FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: pack trg_pack_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pack_freeze_tenant BEFORE UPDATE ON public.pack FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: pack trg_pack_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pack_stamp_tenant BEFORE INSERT ON public.pack FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: pack trg_pack_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pack_updated_at BEFORE UPDATE ON public.pack FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: package_adjustment trg_package_adjustment_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_package_adjustment_freeze_tenant BEFORE UPDATE ON public.package_adjustment FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: package_adjustment trg_package_adjustment_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_package_adjustment_stamp_tenant BEFORE INSERT ON public.package_adjustment FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: package trg_package_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_package_freeze_tenant BEFORE UPDATE ON public.package FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: package trg_package_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_package_stamp_tenant BEFORE INSERT ON public.package FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: package trg_package_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_package_updated_at BEFORE UPDATE ON public.package FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: payment trg_payment_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payment_freeze_tenant BEFORE UPDATE ON public.payment FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: payment trg_payment_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payment_stamp_tenant BEFORE INSERT ON public.payment FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: payment trg_payment_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payment_updated_at BEFORE UPDATE ON public.payment FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: program_exercise trg_program_exercise_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_program_exercise_freeze_tenant BEFORE UPDATE ON public.program_exercise FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: program_exercise trg_program_exercise_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_program_exercise_stamp_tenant BEFORE INSERT ON public.program_exercise FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: program_exercise trg_program_exercise_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_program_exercise_updated_at BEFORE UPDATE ON public.program_exercise FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: program trg_program_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_program_freeze_tenant BEFORE UPDATE ON public.program FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: program trg_program_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_program_stamp_tenant BEFORE INSERT ON public.program FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: program trg_program_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_program_updated_at BEFORE UPDATE ON public.program FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: scheduled_session trg_scheduled_session_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_scheduled_session_freeze_tenant BEFORE UPDATE ON public.scheduled_session FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: scheduled_session trg_scheduled_session_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_scheduled_session_stamp_tenant BEFORE INSERT ON public.scheduled_session FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: scheduled_session trg_scheduled_session_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_scheduled_session_updated_at BEFORE UPDATE ON public.scheduled_session FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: set_log trg_set_log_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_log_freeze_tenant BEFORE UPDATE ON public.set_log FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: set_log trg_set_log_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_log_stamp_tenant BEFORE INSERT ON public.set_log FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: set_log trg_set_log_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_log_updated_at BEFORE UPDATE ON public.set_log FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: team_activity trg_team_activity_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_team_activity_freeze_tenant BEFORE UPDATE ON public.team_activity FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: team_activity trg_team_activity_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_team_activity_stamp_tenant BEFORE INSERT ON public.team_activity FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: team_member trg_team_member_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_team_member_freeze_tenant BEFORE UPDATE ON public.team_member FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: team_member trg_team_member_mirror; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_team_member_mirror AFTER INSERT OR UPDATE ON public.team_member FOR EACH ROW EXECUTE FUNCTION public.mirror_team_member();


--
-- Name: team_member trg_team_member_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_team_member_stamp_tenant BEFORE INSERT ON public.team_member FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: team_member trg_team_member_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_team_member_updated_at BEFORE UPDATE ON public.team_member FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: team trg_team_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_team_tenant BEFORE INSERT ON public.team FOR EACH ROW EXECUTE FUNCTION public.ensure_team_tenant();


--
-- Name: team trg_team_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_team_updated_at BEFORE UPDATE ON public.team FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: template trg_template_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_template_freeze_tenant BEFORE UPDATE ON public.template FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: template trg_template_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_template_stamp_tenant BEFORE INSERT ON public.template FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: template trg_template_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_template_updated_at BEFORE UPDATE ON public.template FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tenant_member trg_tenant_member_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tenant_member_freeze_tenant BEFORE UPDATE ON public.tenant_member FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: tenant_member trg_tenant_member_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tenant_member_stamp_tenant BEFORE INSERT ON public.tenant_member FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: tenant_member trg_tenant_member_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tenant_member_updated_at BEFORE UPDATE ON public.tenant_member FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tenant trg_tenant_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tenant_updated_at BEFORE UPDATE ON public.tenant FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: time_block trg_time_block_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_time_block_freeze_tenant BEFORE UPDATE ON public.time_block FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: time_block trg_time_block_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_time_block_stamp_tenant BEFORE INSERT ON public.time_block FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: trainer trg_trainer_home_membership; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_trainer_home_membership AFTER INSERT ON public.trainer FOR EACH ROW EXECUTE FUNCTION public.ensure_home_membership();


--
-- Name: trainer trg_trainer_home_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_trainer_home_tenant BEFORE INSERT ON public.trainer FOR EACH ROW EXECUTE FUNCTION public.ensure_home_tenant();


--
-- Name: trainer trg_trainer_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_trainer_updated_at BEFORE UPDATE ON public.trainer FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: web_session trg_web_session_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_web_session_updated_at BEFORE UPDATE ON public.web_session FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: weekly_report trg_weekly_report_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_weekly_report_freeze_tenant BEFORE UPDATE ON public.weekly_report FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: weekly_report trg_weekly_report_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_weekly_report_stamp_tenant BEFORE INSERT ON public.weekly_report FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: weekly_report trg_weekly_report_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_weekly_report_updated_at BEFORE UPDATE ON public.weekly_report FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: working_hours trg_working_hours_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_working_hours_freeze_tenant BEFORE UPDATE ON public.working_hours FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: working_hours trg_working_hours_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_working_hours_stamp_tenant BEFORE INSERT ON public.working_hours FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: workout_exercise trg_workout_exercise_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_workout_exercise_freeze_tenant BEFORE UPDATE ON public.workout_exercise FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: workout_exercise trg_workout_exercise_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_workout_exercise_stamp_tenant BEFORE INSERT ON public.workout_exercise FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: workout_exercise trg_workout_exercise_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_workout_exercise_updated_at BEFORE UPDATE ON public.workout_exercise FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: workout_session trg_workout_session_freeze_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_workout_session_freeze_tenant BEFORE UPDATE ON public.workout_session FOR EACH ROW EXECUTE FUNCTION public.freeze_tenant_id();


--
-- Name: workout_session trg_workout_session_stamp_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_workout_session_stamp_tenant BEFORE INSERT ON public.workout_session FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();


--
-- Name: workout_session trg_workout_session_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_workout_session_updated_at BEFORE UPDATE ON public.workout_session FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: attention_dismissal attention_dismissal_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attention_dismissal
    ADD CONSTRAINT attention_dismissal_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id);


--
-- Name: attention_dismissal attention_dismissal_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attention_dismissal
    ADD CONSTRAINT attention_dismissal_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: attention_dismissal attention_dismissal_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attention_dismissal
    ADD CONSTRAINT attention_dismissal_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id);


--
-- Name: batch batch_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch
    ADD CONSTRAINT batch_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: batch batch_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch
    ADD CONSTRAINT batch_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id);


--
-- Name: body_metric body_metric_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.body_metric
    ADD CONSTRAINT body_metric_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id);


--
-- Name: body_metric body_metric_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.body_metric
    ADD CONSTRAINT body_metric_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: client client_assigned_by_app_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client
    ADD CONSTRAINT client_assigned_by_app_user_id_fkey FOREIGN KEY (assigned_by_app_user_id) REFERENCES public.app_user(id);


--
-- Name: client_assignment client_assignment_actor_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_assignment
    ADD CONSTRAINT client_assignment_actor_trainer_id_fkey FOREIGN KEY (actor_trainer_id) REFERENCES public.trainer(id);


--
-- Name: client_assignment client_assignment_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_assignment
    ADD CONSTRAINT client_assignment_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id);


--
-- Name: client_assignment client_assignment_from_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_assignment
    ADD CONSTRAINT client_assignment_from_trainer_id_fkey FOREIGN KEY (from_trainer_id) REFERENCES public.trainer(id);


--
-- Name: client_assignment client_assignment_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_assignment
    ADD CONSTRAINT client_assignment_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.team(id);


--
-- Name: client_assignment client_assignment_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_assignment
    ADD CONSTRAINT client_assignment_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: client_assignment client_assignment_to_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_assignment
    ADD CONSTRAINT client_assignment_to_trainer_id_fkey FOREIGN KEY (to_trainer_id) REFERENCES public.trainer(id);


--
-- Name: client_note client_note_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_note
    ADD CONSTRAINT client_note_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id);


--
-- Name: client_note client_note_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_note
    ADD CONSTRAINT client_note_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: client_note client_note_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_note
    ADD CONSTRAINT client_note_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id);


--
-- Name: client client_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client
    ADD CONSTRAINT client_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: client client_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client
    ADD CONSTRAINT client_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id);


--
-- Name: exercise_favourite exercise_favourite_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_favourite
    ADD CONSTRAINT exercise_favourite_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercise(id);


--
-- Name: exercise_favourite exercise_favourite_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_favourite
    ADD CONSTRAINT exercise_favourite_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: exercise_favourite exercise_favourite_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_favourite
    ADD CONSTRAINT exercise_favourite_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id);


--
-- Name: exercise exercise_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise
    ADD CONSTRAINT exercise_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: exercise exercise_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise
    ADD CONSTRAINT exercise_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id);


--
-- Name: gym_settlement gym_settlement_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gym_settlement
    ADD CONSTRAINT gym_settlement_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: gym_settlement gym_settlement_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gym_settlement
    ADD CONSTRAINT gym_settlement_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id);


--
-- Name: nudge_log nudge_log_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nudge_log
    ADD CONSTRAINT nudge_log_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id);


--
-- Name: nudge_log nudge_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nudge_log
    ADD CONSTRAINT nudge_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: nudge_log nudge_log_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nudge_log
    ADD CONSTRAINT nudge_log_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id);


--
-- Name: nudge_rule nudge_rule_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nudge_rule
    ADD CONSTRAINT nudge_rule_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: nudge_rule nudge_rule_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nudge_rule
    ADD CONSTRAINT nudge_rule_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id);


--
-- Name: nudge_template nudge_template_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nudge_template
    ADD CONSTRAINT nudge_template_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: nudge_template nudge_template_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nudge_template
    ADD CONSTRAINT nudge_template_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id);


--
-- Name: pack pack_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pack
    ADD CONSTRAINT pack_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: pack pack_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pack
    ADD CONSTRAINT pack_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id);


--
-- Name: package_adjustment package_adjustment_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_adjustment
    ADD CONSTRAINT package_adjustment_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.package(id);


--
-- Name: package_adjustment package_adjustment_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_adjustment
    ADD CONSTRAINT package_adjustment_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: package_adjustment package_adjustment_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_adjustment
    ADD CONSTRAINT package_adjustment_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id);


--
-- Name: package package_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package
    ADD CONSTRAINT package_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id);


--
-- Name: package package_pack_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package
    ADD CONSTRAINT package_pack_id_fkey FOREIGN KEY (pack_id) REFERENCES public.pack(id);


--
-- Name: package package_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package
    ADD CONSTRAINT package_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: package package_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package
    ADD CONSTRAINT package_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id);


--
-- Name: payment payment_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id);


--
-- Name: payment payment_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.package(id);


--
-- Name: payment payment_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: payment payment_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id);


--
-- Name: program program_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program
    ADD CONSTRAINT program_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id);


--
-- Name: program_exercise program_exercise_alt_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_exercise
    ADD CONSTRAINT program_exercise_alt_exercise_id_fkey FOREIGN KEY (alt_exercise_id) REFERENCES public.exercise(id);


--
-- Name: program_exercise program_exercise_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_exercise
    ADD CONSTRAINT program_exercise_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercise(id);


--
-- Name: program_exercise program_exercise_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_exercise
    ADD CONSTRAINT program_exercise_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.program(id);


--
-- Name: program_exercise program_exercise_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_exercise
    ADD CONSTRAINT program_exercise_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: program program_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program
    ADD CONSTRAINT program_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.template(id);


--
-- Name: program program_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program
    ADD CONSTRAINT program_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: program program_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program
    ADD CONSTRAINT program_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id);


--
-- Name: scheduled_session scheduled_session_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_session
    ADD CONSTRAINT scheduled_session_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batch(id);


--
-- Name: scheduled_session scheduled_session_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_session
    ADD CONSTRAINT scheduled_session_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id);


--
-- Name: scheduled_session scheduled_session_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_session
    ADD CONSTRAINT scheduled_session_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.program(id);


--
-- Name: scheduled_session scheduled_session_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_session
    ADD CONSTRAINT scheduled_session_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: scheduled_session scheduled_session_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_session
    ADD CONSTRAINT scheduled_session_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id);


--
-- Name: set_log set_log_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_log
    ADD CONSTRAINT set_log_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercise(id);


--
-- Name: set_log set_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_log
    ADD CONSTRAINT set_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: set_log set_log_workout_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_log
    ADD CONSTRAINT set_log_workout_session_id_fkey FOREIGN KEY (workout_session_id) REFERENCES public.workout_session(id);


--
-- Name: team_activity team_activity_actor_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_activity
    ADD CONSTRAINT team_activity_actor_trainer_id_fkey FOREIGN KEY (actor_trainer_id) REFERENCES public.trainer(id);


--
-- Name: team_activity team_activity_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_activity
    ADD CONSTRAINT team_activity_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id);


--
-- Name: team_activity team_activity_subject_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_activity
    ADD CONSTRAINT team_activity_subject_trainer_id_fkey FOREIGN KEY (subject_trainer_id) REFERENCES public.trainer(id);


--
-- Name: team_activity team_activity_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_activity
    ADD CONSTRAINT team_activity_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.team(id);


--
-- Name: team_activity team_activity_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_activity
    ADD CONSTRAINT team_activity_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: team_member team_member_invited_by_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_member
    ADD CONSTRAINT team_member_invited_by_trainer_id_fkey FOREIGN KEY (invited_by_trainer_id) REFERENCES public.trainer(id);


--
-- Name: team_member team_member_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_member
    ADD CONSTRAINT team_member_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.team(id);


--
-- Name: team_member team_member_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_member
    ADD CONSTRAINT team_member_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: team_member team_member_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_member
    ADD CONSTRAINT team_member_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id);


--
-- Name: team team_owner_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team
    ADD CONSTRAINT team_owner_trainer_id_fkey FOREIGN KEY (owner_trainer_id) REFERENCES public.trainer(id);


--
-- Name: team team_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team
    ADD CONSTRAINT team_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: template template_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template
    ADD CONSTRAINT template_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: template template_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template
    ADD CONSTRAINT template_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id);


--
-- Name: tenant_member tenant_member_app_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_member
    ADD CONSTRAINT tenant_member_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES public.app_user(id);


--
-- Name: tenant_member tenant_member_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_member
    ADD CONSTRAINT tenant_member_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: tenant tenant_primary_app_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant
    ADD CONSTRAINT tenant_primary_app_user_id_fkey FOREIGN KEY (primary_app_user_id) REFERENCES public.app_user(id);


--
-- Name: time_block time_block_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_block
    ADD CONSTRAINT time_block_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: time_block time_block_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_block
    ADD CONSTRAINT time_block_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id);


--
-- Name: trainer trainer_home_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer
    ADD CONSTRAINT trainer_home_tenant_id_fkey FOREIGN KEY (home_tenant_id) REFERENCES public.tenant(id);


--
-- Name: web_session web_session_app_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_session
    ADD CONSTRAINT web_session_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES public.app_user(id);


--
-- Name: web_session web_session_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_session
    ADD CONSTRAINT web_session_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: weekly_report weekly_report_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_report
    ADD CONSTRAINT weekly_report_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id);


--
-- Name: weekly_report weekly_report_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_report
    ADD CONSTRAINT weekly_report_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: weekly_report weekly_report_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_report
    ADD CONSTRAINT weekly_report_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id);


--
-- Name: working_hours working_hours_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.working_hours
    ADD CONSTRAINT working_hours_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: working_hours working_hours_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.working_hours
    ADD CONSTRAINT working_hours_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id);


--
-- Name: workout_exercise workout_exercise_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_exercise
    ADD CONSTRAINT workout_exercise_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercise(id);


--
-- Name: workout_exercise workout_exercise_swapped_from_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_exercise
    ADD CONSTRAINT workout_exercise_swapped_from_exercise_id_fkey FOREIGN KEY (swapped_from_exercise_id) REFERENCES public.exercise(id);


--
-- Name: workout_exercise workout_exercise_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_exercise
    ADD CONSTRAINT workout_exercise_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: workout_exercise workout_exercise_workout_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_exercise
    ADD CONSTRAINT workout_exercise_workout_session_id_fkey FOREIGN KEY (workout_session_id) REFERENCES public.workout_session(id);


--
-- Name: workout_session workout_session_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_session
    ADD CONSTRAINT workout_session_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id);


--
-- Name: workout_session workout_session_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_session
    ADD CONSTRAINT workout_session_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.program(id);


--
-- Name: workout_session workout_session_scheduled_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_session
    ADD CONSTRAINT workout_session_scheduled_session_id_fkey FOREIGN KEY (scheduled_session_id) REFERENCES public.scheduled_session(id);


--
-- Name: workout_session workout_session_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_session
    ADD CONSTRAINT workout_session_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: workout_session workout_session_trainer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_session
    ADD CONSTRAINT workout_session_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id);


--
-- Name: attention_dismissal; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attention_dismissal ENABLE ROW LEVEL SECURITY;

--
-- Name: attention_dismissal attention_dismissal_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attention_dismissal_tenant ON public.attention_dismissal TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids())))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: batch; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.batch ENABLE ROW LEVEL SECURITY;

--
-- Name: batch batch_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY batch_tenant ON public.batch TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids())))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: body_metric; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.body_metric ENABLE ROW LEVEL SECURITY;

--
-- Name: body_metric body_metric_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY body_metric_client ON public.body_metric TO inclineyou_app USING (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids())))) WITH CHECK (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids()))));


--
-- Name: body_metric body_metric_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY body_metric_tenant ON public.body_metric TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids())))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: client; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client ENABLE ROW LEVEL SECURITY;

--
-- Name: client_assignment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_assignment ENABLE ROW LEVEL SECURITY;

--
-- Name: client_assignment client_assignment_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_assignment_tenant ON public.client_assignment TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids())))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: client client_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_client ON public.client TO inclineyou_app USING (((public.app_actor() = 'client'::text) AND (id = ANY (public.app_client_ids())))) WITH CHECK (((public.app_actor() = 'client'::text) AND (id = ANY (public.app_client_ids()))));


--
-- Name: client_note; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_note ENABLE ROW LEVEL SECURITY;

--
-- Name: client_note client_note_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_note_tenant ON public.client_note TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id()))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: client client_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_tenant ON public.client TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids())))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: exercise; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exercise ENABLE ROW LEVEL SECURITY;

--
-- Name: exercise exercise_catalogue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exercise_catalogue ON public.exercise TO inclineyou_app USING (((tenant_id IS NULL) OR (tenant_id = ANY (public.app_tenant_ids())))) WITH CHECK (((tenant_id IS NULL) OR (tenant_id = public.app_tenant_id())));


--
-- Name: exercise_favourite; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exercise_favourite ENABLE ROW LEVEL SECURITY;

--
-- Name: exercise_favourite exercise_favourite_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exercise_favourite_tenant ON public.exercise_favourite TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids())))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: gym_settlement; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gym_settlement ENABLE ROW LEVEL SECURITY;

--
-- Name: gym_settlement gym_settlement_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gym_settlement_tenant ON public.gym_settlement TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id()))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: nudge_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nudge_log ENABLE ROW LEVEL SECURITY;

--
-- Name: nudge_log nudge_log_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nudge_log_tenant ON public.nudge_log TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids())))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: nudge_rule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nudge_rule ENABLE ROW LEVEL SECURITY;

--
-- Name: nudge_rule nudge_rule_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nudge_rule_tenant ON public.nudge_rule TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids())))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: nudge_template; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nudge_template ENABLE ROW LEVEL SECURITY;

--
-- Name: nudge_template nudge_template_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nudge_template_tenant ON public.nudge_template TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids())))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: pack; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pack ENABLE ROW LEVEL SECURITY;

--
-- Name: pack pack_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pack_tenant ON public.pack TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id()))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: package; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.package ENABLE ROW LEVEL SECURITY;

--
-- Name: package_adjustment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.package_adjustment ENABLE ROW LEVEL SECURITY;

--
-- Name: package_adjustment package_adjustment_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY package_adjustment_tenant ON public.package_adjustment TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id()))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: package package_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY package_client ON public.package TO inclineyou_app USING (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids())))) WITH CHECK (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids()))));


--
-- Name: package package_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY package_tenant ON public.package TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id()))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: payment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment ENABLE ROW LEVEL SECURITY;

--
-- Name: payment payment_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payment_client ON public.payment TO inclineyou_app USING (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids())))) WITH CHECK (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids()))));


--
-- Name: payment payment_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payment_tenant ON public.payment TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id()))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: program; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.program ENABLE ROW LEVEL SECURITY;

--
-- Name: program program_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_client ON public.program TO inclineyou_app USING (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids())))) WITH CHECK (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids()))));


--
-- Name: program_exercise; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.program_exercise ENABLE ROW LEVEL SECURITY;

--
-- Name: program_exercise program_exercise_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_exercise_client ON public.program_exercise TO inclineyou_app USING (((public.app_actor() = 'client'::text) AND (EXISTS ( SELECT 1
   FROM public.program p
  WHERE ((p.id = program_exercise.program_id) AND (p.client_id = ANY (public.app_client_ids()))))))) WITH CHECK (((public.app_actor() = 'client'::text) AND (EXISTS ( SELECT 1
   FROM public.program p
  WHERE ((p.id = program_exercise.program_id) AND (p.client_id = ANY (public.app_client_ids())))))));


--
-- Name: program_exercise program_exercise_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_exercise_tenant ON public.program_exercise TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids())))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: program program_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_tenant ON public.program TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids())))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: scheduled_session; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scheduled_session ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduled_session scheduled_session_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scheduled_session_client ON public.scheduled_session TO inclineyou_app USING (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids())))) WITH CHECK (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids()))));


--
-- Name: scheduled_session scheduled_session_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scheduled_session_tenant ON public.scheduled_session TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids())))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: set_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.set_log ENABLE ROW LEVEL SECURITY;

--
-- Name: set_log set_log_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY set_log_client ON public.set_log TO inclineyou_app USING (((public.app_actor() = 'client'::text) AND (EXISTS ( SELECT 1
   FROM public.workout_session w
  WHERE ((w.id = set_log.workout_session_id) AND (w.client_id = ANY (public.app_client_ids()))))))) WITH CHECK (((public.app_actor() = 'client'::text) AND (EXISTS ( SELECT 1
   FROM public.workout_session w
  WHERE ((w.id = set_log.workout_session_id) AND (w.client_id = ANY (public.app_client_ids())))))));


--
-- Name: set_log set_log_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY set_log_tenant ON public.set_log TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids())))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: team; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team ENABLE ROW LEVEL SECURITY;

--
-- Name: team_activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: team_activity team_activity_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_activity_tenant ON public.team_activity TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids())))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: team_member; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_member ENABLE ROW LEVEL SECURITY;

--
-- Name: team_member team_member_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_member_tenant ON public.team_member TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND ((tenant_id = ANY (public.app_tenant_ids())) OR public.app_owns_tenant(tenant_id)))) WITH CHECK (((public.app_actor() = 'staff'::text) AND ((tenant_id = public.app_tenant_id()) OR public.app_owns_tenant(tenant_id))));


--
-- Name: team team_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY team_tenant ON public.team TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND ((tenant_id = ANY (public.app_tenant_ids())) OR public.app_owns_tenant(tenant_id)))) WITH CHECK (((public.app_actor() = 'staff'::text) AND ((tenant_id = public.app_tenant_id()) OR public.app_owns_tenant(tenant_id))));


--
-- Name: template; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.template ENABLE ROW LEVEL SECURITY;

--
-- Name: template template_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY template_client ON public.template TO inclineyou_app USING (((public.app_actor() = 'client'::text) AND (EXISTS ( SELECT 1
   FROM public.program p
  WHERE ((p.template_id = template.id) AND (p.client_id = ANY (public.app_client_ids()))))))) WITH CHECK (((public.app_actor() = 'client'::text) AND (EXISTS ( SELECT 1
   FROM public.program p
  WHERE ((p.template_id = template.id) AND (p.client_id = ANY (public.app_client_ids())))))));


--
-- Name: template template_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY template_tenant ON public.template TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids())))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: tenant; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_member; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_member ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_member tenant_member_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_member_self ON public.tenant_member FOR SELECT TO inclineyou_app USING (((public.app_phone() <> ''::text) AND (app_user_id IN ( SELECT au.id
   FROM public.app_user au
  WHERE (((au.phone)::text = public.app_phone()) AND (au.deleted_at IS NULL))))));


--
-- Name: tenant_member tenant_member_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_member_tenant ON public.tenant_member TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids())))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: tenant tenant_mine; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_mine ON public.tenant FOR SELECT TO inclineyou_app USING (((public.app_phone() <> ''::text) AND (id IN ( SELECT tm.tenant_id
   FROM (public.tenant_member tm
     JOIN public.app_user au ON ((au.id = tm.app_user_id)))
  WHERE (((au.phone)::text = public.app_phone()) AND (au.deleted_at IS NULL) AND (tm.deleted_at IS NULL) AND ((tm.status)::text = 'active'::text))))));


--
-- Name: tenant tenant_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_self ON public.tenant TO inclineyou_app USING ((id = ANY (public.app_tenant_ids()))) WITH CHECK ((id = ANY (public.app_tenant_ids())));


--
-- Name: time_block; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.time_block ENABLE ROW LEVEL SECURITY;

--
-- Name: time_block time_block_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY time_block_tenant ON public.time_block TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids())))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: weekly_report; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.weekly_report ENABLE ROW LEVEL SECURITY;

--
-- Name: weekly_report weekly_report_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY weekly_report_client ON public.weekly_report TO inclineyou_app USING (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids())))) WITH CHECK (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids()))));


--
-- Name: weekly_report weekly_report_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY weekly_report_tenant ON public.weekly_report TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids())))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: working_hours; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.working_hours ENABLE ROW LEVEL SECURITY;

--
-- Name: working_hours working_hours_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY working_hours_tenant ON public.working_hours TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids())))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: workout_exercise; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workout_exercise ENABLE ROW LEVEL SECURITY;

--
-- Name: workout_exercise workout_exercise_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workout_exercise_client ON public.workout_exercise TO inclineyou_app USING (((public.app_actor() = 'client'::text) AND (EXISTS ( SELECT 1
   FROM public.workout_session w
  WHERE ((w.id = workout_exercise.workout_session_id) AND (w.client_id = ANY (public.app_client_ids()))))))) WITH CHECK (((public.app_actor() = 'client'::text) AND (EXISTS ( SELECT 1
   FROM public.workout_session w
  WHERE ((w.id = workout_exercise.workout_session_id) AND (w.client_id = ANY (public.app_client_ids())))))));


--
-- Name: workout_exercise workout_exercise_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workout_exercise_tenant ON public.workout_exercise TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids())))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- Name: workout_session; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workout_session ENABLE ROW LEVEL SECURITY;

--
-- Name: workout_session workout_session_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workout_session_client ON public.workout_session TO inclineyou_app USING (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids())))) WITH CHECK (((public.app_actor() = 'client'::text) AND (client_id = ANY (public.app_client_ids()))));


--
-- Name: workout_session workout_session_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workout_session_tenant ON public.workout_session TO inclineyou_app USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids())))) WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = public.app_tenant_id())));


--
-- PostgreSQL database dump complete
--



-- ─── what the runtime role may touch ────────────────────────────────────────

DO $$
BEGIN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO inclineyou_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO inclineyou_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO inclineyou_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public
             GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;

-- Flyway's own history table must stay readable to nobody but the owner.
DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON flyway_schema_history FROM inclineyou_app';
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL;
END $$;
