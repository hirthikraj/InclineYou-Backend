-- V21 · THE PRE-LAUNCH SCHEMA REVIEW: TIGHTEN THE WALLS, STATE THE RULES, START THE CLOCK
--
-- A whole-schema review on 24 Sep 2026, against the v1 scope (trainer web app
-- alone — `WEB_LAUNCH.md` §3) and against the next three releases (portal, team,
-- gym). Nothing here drops a column, renames one or changes what an existing
-- response carries: the standing law holds. What it does is close the places
-- where the database said less than the code believed, in seven parts.
--
--   1. WHAT THE REQUEST ROLE MAY DO — grants narrowed to what the code uses.
--   2. WHO MAY WRITE THE SHARED CATALOGUE AND THE WORKSPACE ROOT — policies.
--   3. THE SECURITY DEFINER FUNCTIONS CHECK THEIR CALLER.
--   4. A CHILD ROW SITS IN ITS PARENT'S WORKSPACE — composite foreign keys.
--   5. THE RULES THE CODE ALREADY KEEPS, WRITTEN DOWN — CHECK constraints.
--   6. THE SYNC CURSOR MOVES ON EVERY WRITE — the missing updated_at triggers.
--   7. INDEXES FOR THE HOT PATHS, AND NONE THAT ONLY COST WRITES.
--   8. WHAT v1 NEEDS AND DID NOT HAVE — the trial clock (MUST-16), who entered
--      an assessment (MUST-21), and the trainer's time zone.
--
-- `release/schema.html` (rendered from `schema.xml`) carries the review this
-- came from, finding by finding, under its *Review* tab.

-- ═══ 1. WHAT THE REQUEST ROLE MAY DO ════════════════════════════════════════
--
-- V1 granted `inclineyou_app` SELECT, INSERT, UPDATE and DELETE on every table,
-- and ALTER DEFAULT PRIVILEGES made every FUTURE table the same. Two problems.
--
-- DELETE. Nothing in this product is hard-deleted — `deleted_at` is the delete,
-- because sync has to carry the tombstone — and yet the role every request runs
-- as could remove any row it can see. Two tables are the deliberate exceptions
-- and keep it: `attention_dismissal` (a dismissal is undone by removing it, and
-- its unique key would otherwise refuse the next one) and `web_session` (the
-- hourly `SessionSweeper`). `otp_request` gains a sweeper in the same change and
-- keeps it for that.
--
-- UPDATE on the logs. `package_adjustment`, `client_assignment` and
-- `team_activity` are append-only by design — a mistake is corrected by writing
-- another row — and no statement in the code updates one. Now the database says
-- so too, which is what makes "the log is the audit" true against a bug.
--
-- The default. A new table was born fully writable by the request role, BEFORE
-- anybody had written its policy — the one ordering in which silence is a hole.
-- From here a migration that creates a table grants what that table needs, in
-- the same file, beside its `ENABLE ROW LEVEL SECURITY`. `SCHEMA.md` says so.

DO $$
BEGIN
    EXECUTE 'REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM inclineyou_app';
    EXECUTE 'GRANT DELETE ON public.attention_dismissal, public.web_session, public.otp_request TO inclineyou_app';
    EXECUTE 'REVOKE UPDATE ON public.package_adjustment, public.client_assignment, public.team_activity FROM inclineyou_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public
             REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — V21 grants skipped';
END $$;

-- ═══ 2. WHO MAY WRITE THE SHARED CATALOGUE AND THE WORKSPACE ROOT ═══════════
--
--   `exercise` — READ BY EVERYBODY, WRITTEN TO THE GLOBAL LIBRARY BY NOBODY'S REQUEST
--
-- V39's tier-3 policy was one clause for every command: `tenant_id IS NULL OR
-- tenant_id = ANY (app_tenant_ids())`, with no actor test. Its WITH CHECK
-- therefore admitted any row with a NULL tenant — so any request, a client's
-- included, could add to, edit or tombstone the library every trainer builds
-- from, and a custom movement written with `is_custom = false` skipped the
-- stamp trigger and went global. Split now:
--
--   · SELECT — unchanged: the catalogue plus your own workspaces' movements.
--   · writes by staff — only a CUSTOM row, only in the workspace you stand in.
--   · writes to the global library — only the `system` actor, which is what
--     `ExerciseSeeder` now declares itself as at boot. No request can be it:
--     `TenantContext` hands a request `staff`, `client` or nothing.

DROP POLICY exercise_catalogue ON public.exercise;

CREATE POLICY exercise_catalogue_read ON public.exercise FOR SELECT TO inclineyou_app
    USING (((tenant_id IS NULL) OR (tenant_id = ANY (public.app_tenant_ids()))));

CREATE POLICY exercise_custom_write ON public.exercise TO inclineyou_app
    USING (((public.app_actor() = 'staff'::text) AND is_custom AND (tenant_id = ANY (public.app_tenant_ids()))))
    WITH CHECK (((public.app_actor() = 'staff'::text) AND is_custom AND (tenant_id = public.app_tenant_id())));

CREATE POLICY exercise_catalogue_seed ON public.exercise TO inclineyou_app
    USING (((public.app_actor() = 'system'::text) AND (NOT is_custom) AND (tenant_id IS NULL)))
    WITH CHECK (((public.app_actor() = 'system'::text) AND (NOT is_custom) AND (tenant_id IS NULL)));

--   `tenant` — A MEMBER READS IT; ONLY ITS OWNER RENAMES IT
--
-- `tenant_self` was FOR ALL with no actor and no role test, so any member of a
-- workspace — a coach, a client whose tenant set included it — could UPDATE its
-- name, status or `primary_app_user_id`. No code writes `tenant` from a request
-- at all (the four `ensure_*` triggers do, as SECURITY DEFINER), so the request
-- role gets SELECT for members and UPDATE for the owner, and no INSERT policy.

DROP POLICY tenant_self ON public.tenant;

CREATE POLICY tenant_self ON public.tenant FOR SELECT TO inclineyou_app
    USING ((id = ANY (public.app_tenant_ids())));

CREATE POLICY tenant_owner_update ON public.tenant FOR UPDATE TO inclineyou_app
    USING (((public.app_actor() = 'staff'::text) AND public.app_owns_tenant(id)))
    WITH CHECK (((public.app_actor() = 'staff'::text) AND public.app_owns_tenant(id)));

--   `tenant_member` — NO REQUEST MINTS A MEMBERSHIP, AND NONE PROMOTES TO OWNER
--
-- `tenant_member_tenant` was FOR ALL, so a staff request could INSERT a
-- membership row — `role = 'owner'` included — into the workspace it stood in.
-- Memberships are only ever created by the SECURITY DEFINER triggers
-- (`ensure_home_membership`, `ensure_membership_for_user`, `mirror_team_member`);
-- the code UPDATEs them (`TenantService.makeHome`, `.updateRole`,
-- `.updateEconomics`) and nothing else. So: SELECT and UPDATE only, and a
-- trigger refusing the one update the application also refuses — making
-- somebody an owner — when it comes from the request role rather than from a
-- definer function.

DROP POLICY tenant_member_tenant ON public.tenant_member;

CREATE POLICY tenant_member_tenant ON public.tenant_member FOR SELECT TO inclineyou_app
    USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids()))));

CREATE POLICY tenant_member_update ON public.tenant_member FOR UPDATE TO inclineyou_app
    USING (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids()))))
    WITH CHECK (((public.app_actor() = 'staff'::text) AND (tenant_id = ANY (public.app_tenant_ids()))));

CREATE FUNCTION public.refuse_owner_promotion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- current_user is the request role only for a statement the application
    -- issued itself; inside a SECURITY DEFINER function it is the owner.
    IF current_user = 'inclineyou_app'
       AND NEW.role = 'owner' AND OLD.role IS DISTINCT FROM 'owner' THEN
        RAISE EXCEPTION 'a request may not make a workspace member an owner'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_tenant_member_no_owner_promotion BEFORE UPDATE ON public.tenant_member
    FOR EACH ROW EXECUTE FUNCTION public.refuse_owner_promotion();

-- ═══ 3. THE SECURITY DEFINER FUNCTIONS CHECK THEIR CALLER ═══════════════════
--
--   `app_owns_tenant()` — NOT CALLABLE BY PUBLIC, AND DELIBERATELY STILL VOLATILE
--
-- It was executable by PUBLIC, which made it a yes/no oracle over other
-- people's workspaces for any role that can connect.
--
-- It looks like it should be STABLE, and it must not be. Creating a team
-- inserts the `team` row, whose BEFORE trigger (`ensure_team_tenant`) inserts
-- the `tenant` row in the same statement; the policy's WITH CHECK then asks
-- this function whether the caller owns that tenant. A STABLE function reads
-- the statement's starting snapshot and cannot see the row the trigger just
-- wrote, so the answer is "no" and the team is refused. VOLATILE takes a fresh
-- snapshot and sees it. Found by `TenantIsolationTest` while this migration was
-- being written; the per-row cost is paid only on the `team` tables, which are
-- small and out of v1.

REVOKE ALL ON FUNCTION public.app_owns_tenant(uuid) FROM PUBLIC;
DO $$
BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.app_owns_tenant(uuid) TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

--   `portal_change_client_phone()` — ONLY A CLIENT, ONLY ITS OWN NUMBER
--
-- V20 fixed V19's guard by reading an empty `app_phone()` as "no session phone,
-- so no check" — which left the function a primitive that moves ANY number to
-- ANY number, on every roster and on the identity row, for any caller whose
-- connection carried no phone: a scheduler, a boot-time runner, a bug. Under the
-- request role it now demands a client session whose proven phone IS the old
-- number, with no empty-string escape. `session_user` is the login role even
-- inside SECURITY DEFINER, so the owner — the test suite, a DBA — is unaffected,
-- which is the distinction V20 was reaching for.

CREATE OR REPLACE FUNCTION public.portal_change_client_phone(old_phone text, new_phone text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
    moved integer;
BEGIN
    -- The request role: a client session, and its proven phone is the old one.
    -- An empty app_phone() fails this test instead of skipping it.
    IF session_user = 'inclineyou_app'
       AND (app_actor() <> 'client' OR app_phone() <> old_phone) THEN
        RAISE EXCEPTION 'a request may only move its own number'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- The owner (tests, a DBA): V20's rule, bound only when a phone is set.
    IF app_phone() <> '' AND app_phone() <> old_phone THEN
        RAISE EXCEPTION 'a request may only move its own number'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    UPDATE client SET phone = new_phone, updated_at = now()
     WHERE phone = old_phone AND deleted_at IS NULL;
    GET DIAGNOSTICS moved = ROW_COUNT;
    UPDATE app_user SET phone = new_phone, updated_at = now()
     WHERE phone = old_phone AND deleted_at IS NULL;
    RETURN moved;
END;
$$;

--   `mint_trainer_notification()` — ONLY INTO A BELL WHOSE OWNER HAS A CLAIM ON THE CLIENT
--
-- It took any recipient and any client and wrote the row, so one code path with
-- a wrong id — or a request that could reach it with a forged one — put a
-- stranger's client name and an amount into another trainer's bell. Now the
-- recipient must have a claim on the client, and there are exactly four:
--
--   · they coach the client (`client.trainer_id`);
--   · the client is in their home workspace (a solo practice);
--   · they are a live member of the client's workspace (a team or gym); or
--   · the client was reassigned AWAY from them (`client_assignment`) — the
--     'team' notification exists precisely to tell the losing coach.
--
-- Membership alone is not enough, because `tenant_member` rows hang off
-- `app_user`, which a trainer created before their first sign-in lacks.
-- A refused mint returns NULL rather than raising, the V18 rule: a notification
-- is never the reason the write that caused it fails.

CREATE OR REPLACE FUNCTION public.mint_trainer_notification(
        recipient uuid, kind_in varchar, client uuid, amount_in numeric,
        subject_in timestamp with time zone, text_in varchar)
    RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
    workspace uuid;
    minted uuid;
BEGIN
    IF kind_in NOT IN ('payment', 'cancelled', 'metric', 'team') THEN
        RAISE EXCEPTION 'unknown trainer notification kind: %', kind_in;
    END IF;
    IF client IS NOT NULL THEN
        SELECT c.tenant_id INTO workspace FROM client c WHERE c.id = client;
        IF workspace IS NULL THEN
            RETURN NULL;
        END IF;
        IF NOT (
               EXISTS (SELECT 1 FROM client c WHERE c.id = client AND c.trainer_id = recipient)
            OR EXISTS (SELECT 1 FROM trainer t WHERE t.id = recipient AND t.home_tenant_id = workspace)
            OR EXISTS (SELECT 1 FROM tenant_member tm
                       JOIN app_user au ON au.id = tm.app_user_id AND au.deleted_at IS NULL
                       JOIN trainer t   ON t.phone = au.phone
                       WHERE t.id = recipient AND tm.tenant_id = workspace AND tm.deleted_at IS NULL)
            OR EXISTS (SELECT 1 FROM client_assignment ca
                       WHERE ca.client_id = client AND ca.from_trainer_id = recipient)
        ) THEN
            RETURN NULL;
        END IF;
    ELSE
        SELECT t.home_tenant_id INTO workspace FROM trainer t WHERE t.id = recipient;
    END IF;
    INSERT INTO trainer_notification (trainer_id, kind, client_id, amount, subject_at, text, tenant_id)
    VALUES (recipient, kind_in, client, amount_in, subject_in, left(text_in, 120), workspace)
    RETURNING id INTO minted;
    RETURN minted;
END;
$$;

-- ═══ 4. A CHILD ROW SITS IN ITS PARENT'S WORKSPACE ══════════════════════════
--
-- `stamp_tenant_id()` takes the workspace the request stands in BEFORE it looks
-- at the parent (V17 says so and works around it), and no constraint compared
-- the two. So a payment against a pack in workspace A, written while standing
-- in B, was stamped B — a row in one business's books pointing at another's.
-- It cannot happen in v1 (one workspace per trainer) and it would have been
-- invisible when it did: tier 2 reads the active workspace alone, so each half
-- looks complete on its own.
--
-- The standard answer: a UNIQUE (id, tenant_id) on the parent and a foreign
-- key on (parent_id, tenant_id) from the child. MATCH SIMPLE, so a NULL parent
-- (a payment with no pack) is not checked, exactly like the single-column key
-- beside it. The single-column keys stay — they are what `SCHEMA.md` and every
-- reader already name. Validated against the data here; a mismatch fails this
-- migration rather than surviving it.

ALTER TABLE public.client           ADD CONSTRAINT client_id_tenant_key           UNIQUE (id, tenant_id);
ALTER TABLE public.package          ADD CONSTRAINT package_id_tenant_key          UNIQUE (id, tenant_id);
ALTER TABLE public.program          ADD CONSTRAINT program_id_tenant_key          UNIQUE (id, tenant_id);
ALTER TABLE public.workout_session  ADD CONSTRAINT workout_session_id_tenant_key  UNIQUE (id, tenant_id);

ALTER TABLE public.package           ADD CONSTRAINT package_client_same_tenant           FOREIGN KEY (client_id, tenant_id)          REFERENCES public.client (id, tenant_id);
ALTER TABLE public.payment           ADD CONSTRAINT payment_client_same_tenant           FOREIGN KEY (client_id, tenant_id)          REFERENCES public.client (id, tenant_id);
ALTER TABLE public.payment           ADD CONSTRAINT payment_package_same_tenant          FOREIGN KEY (package_id, tenant_id)         REFERENCES public.package (id, tenant_id);
ALTER TABLE public.package_adjustment ADD CONSTRAINT package_adjustment_package_same_tenant FOREIGN KEY (package_id, tenant_id)     REFERENCES public.package (id, tenant_id);
ALTER TABLE public.program           ADD CONSTRAINT program_client_same_tenant           FOREIGN KEY (client_id, tenant_id)          REFERENCES public.client (id, tenant_id);
ALTER TABLE public.program_exercise  ADD CONSTRAINT program_exercise_program_same_tenant FOREIGN KEY (program_id, tenant_id)         REFERENCES public.program (id, tenant_id);
ALTER TABLE public.scheduled_session ADD CONSTRAINT scheduled_session_client_same_tenant FOREIGN KEY (client_id, tenant_id)          REFERENCES public.client (id, tenant_id);
ALTER TABLE public.workout_session   ADD CONSTRAINT workout_session_client_same_tenant   FOREIGN KEY (client_id, tenant_id)          REFERENCES public.client (id, tenant_id);
ALTER TABLE public.workout_exercise  ADD CONSTRAINT workout_exercise_session_same_tenant FOREIGN KEY (workout_session_id, tenant_id) REFERENCES public.workout_session (id, tenant_id);
ALTER TABLE public.set_log           ADD CONSTRAINT set_log_session_same_tenant          FOREIGN KEY (workout_session_id, tenant_id) REFERENCES public.workout_session (id, tenant_id);
ALTER TABLE public.body_metric       ADD CONSTRAINT body_metric_client_same_tenant       FOREIGN KEY (client_id, tenant_id)          REFERENCES public.client (id, tenant_id);
ALTER TABLE public.assessment        ADD CONSTRAINT assessment_client_same_tenant        FOREIGN KEY (client_id, tenant_id)          REFERENCES public.client (id, tenant_id);
ALTER TABLE public.client_note       ADD CONSTRAINT client_note_client_same_tenant       FOREIGN KEY (client_id, tenant_id)          REFERENCES public.client (id, tenant_id);

--   `scheduled_session.pack_package_id` HAD NO FOREIGN KEY AT ALL
--
-- It names the package a done session was charged to — the one column that ties
-- the diary to the money book — and nothing checked it pointed anywhere.

ALTER TABLE public.scheduled_session
    ADD CONSTRAINT scheduled_session_pack_package_id_fkey FOREIGN KEY (pack_package_id) REFERENCES public.package (id),
    ADD CONSTRAINT scheduled_session_pack_package_same_tenant FOREIGN KEY (pack_package_id, tenant_id) REFERENCES public.package (id, tenant_id);

-- ═══ 5. THE RULES THE CODE ALREADY KEEPS, WRITTEN DOWN ══════════════════════
--
-- Forty-six tables carried seven CHECK constraints. V6 decided, for profile
-- VOCABULARIES (gender, specialities, languages), that the list lives in Java so
-- a fifth answer is a line of code, and that decision stands — none of those
-- columns is constrained here. What is constrained is the other kind of column:
-- the ones where a value outside the set is not a new answer but a corrupt row.
-- Money that is negative. A percentage over a hundred. A window that ends
-- before it starts. A state machine's state that no code branches on.
--
-- Each value list below was taken from every writer — the backend's SQL and
-- validation sets, the web, the phone's sync push, the portal, and the three
-- seed scripts — not from the documentation, which was short by several
-- (`workout_exercise.source = 'program'` from the portal, `package.type =
-- 'single'`, RPE 10.5 from the phone's half-step). Each is validated as it is
-- added, so a row that breaks one fails this migration rather than surviving it.
--
-- Deliberately NOT constrained, because they are vocabularies with more than one
-- live spelling today and a CHECK would turn a spelling into an outage:
-- `payment.method` (the web writes upi · cash · card · bank · gym, the phone
-- upi_intent · cash · gym_front_office · front_office), `client.status`
-- (active · paused · archived · invited · inactive), every profile list V6
-- covers, the nudge and attention kinds, `body_metric.metric_type` / `unit`, and
-- phone numbers — the test fixtures and seeds write nine- and twelve-digit ones,
-- so a format rule is a normaliser's job first (see the review, finding E2).
--
-- One cost worth knowing before relaxing any of these: both sync pushes run in
-- ONE transaction, so a row that breaks a CHECK rolls back the device's whole
-- batch. Every value set below therefore includes everything a phone build has
-- ever written, and the ranges are the ones the sync code already enforces.
--
-- A new state is still a code change first; since V21 it is also one line in a
-- migration: DROP CONSTRAINT and ADD it back with the new value.

--   STATE MACHINES — the money book, the diary, the log, the workspace

ALTER TABLE public.payment
    ADD CONSTRAINT payment_status       CHECK (status IN ('pending', 'paid', 'confirmed', 'overdue', 'write_off')),
    ADD CONSTRAINT payment_collected_by CHECK (collected_by IN ('trainer', 'gym'));
ALTER TABLE public.package
    ADD CONSTRAINT package_status CHECK (status IN ('active', 'completed', 'expired', 'cancelled', 'refunded')),
    ADD CONSTRAINT package_type   CHECK (type IN ('session_pack', 'monthly', 'single'));
ALTER TABLE public.pack
    ADD CONSTRAINT pack_type   CHECK (type IN ('session_pack', 'monthly', 'single')),
    ADD CONSTRAINT pack_status CHECK (status IN ('active', 'inactive')),
    ADD CONSTRAINT pack_owner  CHECK (owner IN ('trainer', 'gym'));
ALTER TABLE public.package_adjustment
    ADD CONSTRAINT package_adjustment_kind CHECK (kind IN ('pause', 'resume', 'extend', 'sessions'));
ALTER TABLE public.gym_settlement
    ADD CONSTRAINT gym_settlement_status CHECK (status IN ('due', 'settled'));
ALTER TABLE public.scheduled_session
    ADD CONSTRAINT scheduled_session_status        CHECK (status IN ('scheduled', 'done', 'no_show', 'cancelled')),
    ADD CONSTRAINT scheduled_session_cancelled_by  CHECK (cancelled_by IS NULL OR cancelled_by IN ('client', 'trainer')),
    ADD CONSTRAINT scheduled_session_delivery_mode CHECK (delivery_mode IS NULL OR delivery_mode IN ('floor', 'remote'));
ALTER TABLE public.client
    ADD CONSTRAINT client_delivery_mode CHECK (delivery_mode IS NULL OR delivery_mode IN ('floor', 'remote'));
ALTER TABLE public.program
    ADD CONSTRAINT program_status CHECK (status IN ('active', 'completed', 'paused'));
ALTER TABLE public.workout_session
    ADD CONSTRAINT workout_session_logged_by CHECK (logged_by IN ('trainer', 'client'));
ALTER TABLE public.workout_exercise
    ADD CONSTRAINT workout_exercise_source CHECK (source IN ('planned', 'unplanned', 'program'));
ALTER TABLE public.exercise
    ADD CONSTRAINT exercise_status   CHECK (status IN ('published', 'draft')),
    ADD CONSTRAINT exercise_log_type CHECK (log_type IS NULL OR log_type IN ('weight_reps', 'reps'));
ALTER TABLE public.app_user
    ADD CONSTRAINT app_user_role CHECK (role IN ('trainer', 'client', 'gym_admin'));
ALTER TABLE public.tenant
    ADD CONSTRAINT tenant_type   CHECK (type IN ('solo', 'team', 'gym')),
    ADD CONSTRAINT tenant_status CHECK (status IN ('active', 'suspended', 'closed'));
ALTER TABLE public.tenant_member
    ADD CONSTRAINT tenant_member_role   CHECK (role IN ('owner', 'admin', 'coach', 'gym_admin', 'gym_staff', 'client')),
    ADD CONSTRAINT tenant_member_status CHECK (status IN ('invited', 'active', 'declined', 'removed'));
ALTER TABLE public.team_member
    ADD CONSTRAINT team_member_role   CHECK (role IN ('owner', 'admin', 'coach')),
    ADD CONSTRAINT team_member_status CHECK (status IN ('invited', 'active', 'declined', 'removed'));

--   MONEY — never negative; a percentage is a percentage

ALTER TABLE public.payment
    ADD CONSTRAINT payment_amount_nonnegative CHECK (amount >= 0),
    ADD CONSTRAINT payment_gym_share_nonnegative CHECK (gym_share_amount IS NULL OR gym_share_amount >= 0),
    ADD CONSTRAINT payment_share_percent_range CHECK (share_percent IS NULL OR share_percent BETWEEN 0 AND 100),
    ADD CONSTRAINT payment_currency_code CHECK (currency ~ '^[A-Z]{3}$');
ALTER TABLE public.package
    ADD CONSTRAINT package_amount_nonnegative CHECK (amount >= 0),
    ADD CONSTRAINT package_discount_nonnegative CHECK (discount_amount IS NULL OR discount_amount >= 0),
    ADD CONSTRAINT package_written_off_nonnegative CHECK (written_off_amount IS NULL OR written_off_amount >= 0),
    ADD CONSTRAINT package_paused_days_nonnegative CHECK (paused_days >= 0),
    ADD CONSTRAINT package_sessions_nonnegative CHECK ((sessions_total IS NULL OR sessions_total >= 0)
                                                   AND (sessions_remaining IS NULL OR sessions_remaining >= 0)),
    ADD CONSTRAINT package_currency_code CHECK (currency ~ '^[A-Z]{3}$');
ALTER TABLE public.pack
    ADD CONSTRAINT pack_amount_nonnegative CHECK (amount >= 0),
    ADD CONSTRAINT pack_sessions_positive CHECK (sessions IS NULL OR sessions > 0),
    ADD CONSTRAINT pack_currency_code CHECK (currency ~ '^[A-Z]{3}$');
ALTER TABLE public.gym_settlement
    ADD CONSTRAINT gym_settlement_amount_nonnegative CHECK (amount >= 0),
    ADD CONSTRAINT gym_settlement_period_format CHECK (period ~ '^[0-9]{4}-[0-9]{2}$');
ALTER TABLE public.client
    ADD CONSTRAINT client_trainer_split_range CHECK (trainer_split_percent IS NULL OR trainer_split_percent BETWEEN 0 AND 100),
    ADD CONSTRAINT client_assignment_margin_range CHECK (assignment_margin_percent IS NULL OR assignment_margin_percent BETWEEN 0 AND 100);
ALTER TABLE public.trainer
    ADD CONSTRAINT trainer_gym_share_range CHECK (gym_share_percent IS NULL OR gym_share_percent BETWEEN 0 AND 100);
ALTER TABLE public.tenant_member
    ADD CONSTRAINT tenant_member_percent_range CHECK ((revenue_share_percent IS NULL OR revenue_share_percent BETWEEN 0 AND 100)
                                                  AND (assignment_margin_percent IS NULL OR assignment_margin_percent BETWEEN 0 AND 100));
ALTER TABLE public.client_assignment
    ADD CONSTRAINT client_assignment_margin_range CHECK (actor_margin_percent IS NULL OR actor_margin_percent BETWEEN 0 AND 100);

--   RANGES — the ones the sync code already enforces, now for every writer

ALTER TABLE public.working_hours
    ADD CONSTRAINT working_hours_weekday CHECK (weekday BETWEEN 0 AND 6),          -- 0 = Monday (SyncService)
    ADD CONSTRAINT working_hours_window  CHECK (start_minute >= 0 AND end_minute <= 1440 AND start_minute < end_minute);
ALTER TABLE public.time_block
    ADD CONSTRAINT time_block_window CHECK (ends_at > starts_at);
ALTER TABLE public.program_exercise
    ADD CONSTRAINT program_exercise_day_of_week CHECK (day_of_week IS NULL OR day_of_week BETWEEN 1 AND 7),  -- ISO, 1 = Monday
    ADD CONSTRAINT program_exercise_nonnegative CHECK ((week IS NULL OR week >= 0) AND (sets IS NULL OR sets >= 0)
                                                   AND (reps IS NULL OR reps >= 0) AND (rest_seconds IS NULL OR rest_seconds >= 0)
                                                   AND (duration_seconds IS NULL OR duration_seconds >= 0)
                                                   AND (target_load IS NULL OR target_load >= 0));
ALTER TABLE public.workout_exercise
    ADD CONSTRAINT workout_exercise_nonnegative CHECK ((target_sets IS NULL OR target_sets >= 0)
                                                   AND (target_reps IS NULL OR target_reps >= 0)
                                                   AND (rest_seconds IS NULL OR rest_seconds >= 0));
-- set_number 0 is a REST call that omitted it (a primitive int); RPE runs to
-- 10.5 because the phone's stepper has a half-step toggle above 10.
ALTER TABLE public.set_log
    ADD CONSTRAINT set_log_ranges CHECK (set_number >= 0 AND (reps IS NULL OR reps >= 0)
                                     AND (load_kg IS NULL OR load_kg >= 0)
                                     AND (rpe IS NULL OR rpe BETWEEN 0 AND 10.5));
ALTER TABLE public.scheduled_session
    ADD CONSTRAINT scheduled_session_duration_positive CHECK (duration_minutes IS NULL OR duration_minutes > 0),
    ADD CONSTRAINT scheduled_session_pack_delta CHECK (pack_delta IS NULL OR pack_delta BETWEEN -1 AND 0);
ALTER TABLE public.body_metric
    ADD CONSTRAINT body_metric_value_nonnegative CHECK (value >= 0);
ALTER TABLE public.client
    ADD CONSTRAINT client_physical_ranges CHECK ((height_cm IS NULL OR height_cm BETWEEN 0 AND 300)
                                             AND (sessions_per_week IS NULL OR sessions_per_week BETWEEN 0 AND 14)
                                             AND (session_duration_minutes IS NULL OR session_duration_minutes > 0)
                                             AND (assessment_interval_days IS NULL OR assessment_interval_days > 0));
ALTER TABLE public.trainer
    ADD CONSTRAINT trainer_assessment_interval_positive CHECK (assessment_interval_days IS NULL OR assessment_interval_days > 0);

--   URLS AND SHAPES — what a client's browser will render as a link or parse

-- The catalogue is text-only: the Gym visual artwork is unlicensed, and until
-- now only the seeder kept that rule. A custom movement may carry the trainer's
-- own link, but only an http(s) one — a stored `javascript:` URL rendered as a
-- link is script in somebody else's browser. The trainer's four profile links
-- are canonicalised in Java (V33–V35); the scheme rule holds against any other
-- writer.
ALTER TABLE public.exercise
    ADD CONSTRAINT exercise_catalogue_text_only CHECK (is_custom OR (image_url IS NULL AND video_url IS NULL)),
    ADD CONSTRAINT exercise_media_scheme CHECK ((image_url IS NULL OR image_url ~* '^https?://')
                                            AND (video_url IS NULL OR video_url ~* '^https?://'));
ALTER TABLE public.trainer
    ADD CONSTRAINT trainer_link_scheme CHECK ((map_link IS NULL OR map_link ~* '^https?://')
                                          AND (intro_video_url IS NULL OR intro_video_url ~* '^https://')
                                          AND (instagram_url IS NULL OR instagram_url ~* '^https://')
                                          AND (youtube_url IS NULL OR youtube_url ~* '^https://')),
    ADD CONSTRAINT trainer_lists_are_arrays CHECK (jsonb_typeof(specialities) = 'array' AND jsonb_typeof(certifications) = 'array'
                                               AND jsonb_typeof(languages) = 'array' AND jsonb_typeof(training_modes) = 'array'
                                               AND jsonb_typeof(service_areas) = 'array'),
    ADD CONSTRAINT trainer_metadata_object CHECK (jsonb_typeof(metadata) = 'object');

-- "Open metadata" (the conventions table) is an object, so the next optional
-- field is a key — never a bare string or an array somebody has to migrate.
ALTER TABLE public.client        ADD CONSTRAINT client_metadata_object        CHECK (metadata IS NULL OR jsonb_typeof(metadata) = 'object');
ALTER TABLE public.exercise      ADD CONSTRAINT exercise_metadata_object      CHECK (metadata IS NULL OR jsonb_typeof(metadata) = 'object');
ALTER TABLE public.tenant        ADD CONSTRAINT tenant_metadata_object        CHECK (jsonb_typeof(metadata) = 'object');
ALTER TABLE public.team          ADD CONSTRAINT team_metadata_object          CHECK (jsonb_typeof(metadata) = 'object');
ALTER TABLE public.working_hours ADD CONSTRAINT working_hours_metadata_object CHECK (jsonb_typeof(metadata) = 'object');
ALTER TABLE public.time_block    ADD CONSTRAINT time_block_metadata_object    CHECK (jsonb_typeof(metadata) = 'object');
ALTER TABLE public.assessment    ADD CONSTRAINT assessment_answers_are_arrays CHECK (jsonb_typeof(readings) = 'array' AND jsonb_typeof(answers) = 'array');

-- ═══ 6. THE SYNC CURSOR MOVES ON EVERY WRITE ════════════════════════════════
--
-- Seven tables had `updated_at` and no trigger to move it; `schema.xml`'s
-- convention said "their writers set it explicitly". A convention is a promise
-- made by the next person to write an UPDATE, and `working_hours` is written
-- through `/v1/sync/push`, where a row whose `updated_at` did not move is a row
-- no other device ever pulls. The trigger makes it structural. It sets the
-- server's clock, which is what every other synced table already does.

CREATE TRIGGER trg_client_note_updated_at          BEFORE UPDATE ON public.client_note          FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_working_hours_updated_at        BEFORE UPDATE ON public.working_hours        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_time_block_updated_at           BEFORE UPDATE ON public.time_block           FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_batch_updated_at                BEFORE UPDATE ON public.batch                FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_nudge_template_updated_at       BEFORE UPDATE ON public.nudge_template       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_attention_dismissal_updated_at  BEFORE UPDATE ON public.attention_dismissal  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_invoice_counter_updated_at      BEFORE UPDATE ON public.invoice_counter      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ═══ 7. INDEXES FOR THE HOT PATHS, AND NONE THAT ONLY COST WRITES ═══════════
--
-- The v1 engineering priority is that logging a set is extremely fast, and the
-- screens around it read along foreign keys that had no index:
--
--   · opening the log for a booked session  — workout_session.scheduled_session_id
--   · "last time" and exercise history       — workout_session (client_id, session_date)
--   · every amount-due figure                — payment.package_id (sum per pack)
--   · a session's pack charge                — scheduled_session.pack_package_id
--   · a program's diary and its log          — scheduled_session / workout_session.program_id
--   · the rest of the unindexed foreign keys — program.template_id, package.pack_id,
--                                               workout_exercise.exercise_id

CREATE INDEX idx_workout_session_scheduled ON public.workout_session USING btree (scheduled_session_id)
    WHERE (scheduled_session_id IS NOT NULL AND deleted_at IS NULL);
CREATE INDEX idx_workout_session_client_date ON public.workout_session USING btree (client_id, session_date DESC)
    WHERE (deleted_at IS NULL);
CREATE INDEX idx_workout_session_program ON public.workout_session USING btree (program_id)
    WHERE (program_id IS NOT NULL);
CREATE INDEX idx_payment_package ON public.payment USING btree (package_id)
    WHERE (package_id IS NOT NULL AND deleted_at IS NULL);
CREATE INDEX idx_scheduled_session_pack_package ON public.scheduled_session USING btree (pack_package_id)
    WHERE (pack_package_id IS NOT NULL);
CREATE INDEX idx_scheduled_session_program ON public.scheduled_session USING btree (program_id)
    WHERE (program_id IS NOT NULL AND deleted_at IS NULL);
CREATE INDEX idx_program_template ON public.program USING btree (template_id)
    WHERE (template_id IS NOT NULL);
CREATE INDEX idx_package_pack ON public.package USING btree (pack_id)
    WHERE (pack_id IS NOT NULL);
CREATE INDEX idx_workout_exercise_exercise ON public.workout_exercise USING btree (exercise_id);

-- Twenty-six indexes were a strict prefix of another index on the same table
-- with the same predicate, so the planner never needs them and every insert
-- pays for them — on `set_log`'s neighbours, on every write. Twenty are the
-- `idx_<t>_tenant` twin of `idx_<t>_tenant_trainer`, which answers the same
-- `tenant_id` lookup (and backs the same foreign key) from its leading column.

DROP INDEX public.idx_attention_dismissal_tenant;
DROP INDEX public.idx_attention_dismissal_trainer;
DROP INDEX public.idx_batch_tenant;
DROP INDEX public.idx_body_metric_client_id;
DROP INDEX public.idx_client_tenant;
DROP INDEX public.idx_client_phone;
DROP INDEX public.idx_client_note_tenant;
DROP INDEX public.idx_exercise_favourite_tenant;
DROP INDEX public.idx_gym_settlement_tenant;
DROP INDEX public.idx_nudge_log_tenant;
DROP INDEX public.idx_nudge_rule_tenant;
DROP INDEX public.idx_nudge_template_tenant;
DROP INDEX public.idx_otp_request_phone;
DROP INDEX public.idx_pack_tenant;
DROP INDEX public.idx_pack_trainer_id;
DROP INDEX public.idx_package_tenant;
DROP INDEX public.idx_package_adjustment_tenant;
DROP INDEX public.idx_payment_trainer_id;
DROP INDEX public.idx_payment_tenant;
DROP INDEX public.idx_program_tenant;
DROP INDEX public.idx_scheduled_session_tenant;
DROP INDEX public.idx_template_tenant;
DROP INDEX public.idx_time_block_tenant;
DROP INDEX public.idx_weekly_report_tenant;
DROP INDEX public.idx_working_hours_tenant;
DROP INDEX public.idx_workout_session_tenant;

-- ═══ 8. WHAT v1 NEEDS AND DID NOT HAVE ══════════════════════════════════════
--
--   `subscription` — THE TRIAL CLOCK (MUST-16)
--
-- The one billing component that cannot arrive after the first signup: a
-- trainer recorded against a schema with no trial start has no honest expiry,
-- ever (runbook §4b). So the clock starts in the database, by trigger, on the
-- trainer row's insert — no signup path, present or future, can skip it.
--
-- Keyed on `trainer_id` and carrying NO `tenant_id`: a seat is a coaching
-- trainer, and V37 lets one trainer coach in two workspaces, so a
-- tenant-scoped subscription would bill one person twice. It joins `trainer`
-- and `app_user` on the deliberately-not-policied list, scoped in code by the
-- caller's own `trainer_id`. The request role may read it and move its state;
-- it may not create one or remove one.
--
-- `state` is the runbook's machine: trialing → active → past_due → grace
-- (read-only) → free. `plan` is `PRICING.md`'s ladder. The provider columns are
-- nullable and unused until the rail (MUST-17): a hosted redirect writes a
-- mandate id, and the webhook — the source of truth — moves `state`.

CREATE TABLE public.subscription (
    trainer_id           uuid NOT NULL,
    plan                 varchar(12) DEFAULT 'pro' NOT NULL,
    state                varchar(12) DEFAULT 'trialing' NOT NULL,
    trial_started_at     timestamp with time zone DEFAULT now() NOT NULL,
    trial_ends_at        timestamp with time zone DEFAULT (now() + interval '30 days') NOT NULL,
    current_period_end   timestamp with time zone,
    grace_until          timestamp with time zone,
    provider             varchar(16),
    provider_customer_id varchar(64),
    provider_mandate_id  varchar(64),
    cancelled_at         timestamp with time zone,
    created_at           timestamp with time zone DEFAULT now() NOT NULL,
    updated_at           timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT subscription_pkey PRIMARY KEY (trainer_id),
    CONSTRAINT subscription_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id),
    CONSTRAINT subscription_plan CHECK (plan IN ('free', 'pro', 'team')),
    CONSTRAINT subscription_state CHECK (state IN ('trialing', 'active', 'past_due', 'grace', 'free', 'cancelled')),
    CONSTRAINT subscription_trial_window CHECK (trial_ends_at > trial_started_at),
    CONSTRAINT subscription_provider CHECK (provider IS NULL OR provider IN ('razorpay', 'cashfree', 'manual'))
);

CREATE UNIQUE INDEX uq_subscription_provider_mandate ON public.subscription USING btree (provider, provider_mandate_id)
    WHERE (provider_mandate_id IS NOT NULL);
-- The alert the runbook asks for: trials expiring this week.
CREATE INDEX idx_subscription_trial_ends ON public.subscription USING btree (trial_ends_at)
    WHERE ((state)::text = 'trialing');

CREATE TRIGGER trg_subscription_updated_at BEFORE UPDATE ON public.subscription
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE FUNCTION public.ensure_subscription() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
BEGIN
    INSERT INTO subscription (trainer_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
    RETURN NULL;
END $$;

CREATE TRIGGER trg_trainer_subscription AFTER INSERT ON public.trainer
    FOR EACH ROW EXECUTE FUNCTION public.ensure_subscription();

-- Every trainer that already exists gets a trial that started when they did.
-- Only development databases exist today; this is what keeps them honest.
INSERT INTO public.subscription (trainer_id, trial_started_at, trial_ends_at, created_at)
SELECT t.id, t.created_at, t.created_at + interval '30 days', t.created_at
FROM public.trainer t
ON CONFLICT DO NOTHING;

DO $$
BEGIN
    EXECUTE 'GRANT SELECT, UPDATE ON public.subscription TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

COMMENT ON TABLE public.subscription IS
    'The trainer''s own plan and trial clock (MUST-16). One row per trainer, created by trigger on trainer insert. No tenant_id and not policied: a seat is a coaching trainer, who spans workspaces. See V21.';
COMMENT ON COLUMN public.subscription.state IS
    'trialing → active → past_due → grace (read-only) → free; cancelled. Never a locked door: every state still reads the money book (PRICING.md §8). See V21.';

--   `assessment.entered_by` — WHO TYPED THE ANSWERS (MUST-21)
--
-- With the portal off, the trainer takes the assessment in the session. When
-- the portal ships, a trainer-entered answer must not be presented as the
-- client's own words — so the row says who entered it. NULL until completed;
-- every assessment completed before this migration was answered in the portal.

ALTER TABLE public.assessment
    ADD COLUMN entered_by varchar(8),
    ADD CONSTRAINT assessment_entered_by CHECK (entered_by IS NULL OR entered_by IN ('client', 'trainer'));

UPDATE public.assessment SET entered_by = 'client' WHERE completed_at IS NOT NULL AND entered_by IS NULL;

COMMENT ON COLUMN public.assessment.entered_by IS
    'client | trainer — who typed the readings and answers. NULL until completed. A trainer-entered answer is never shown as the client''s own. See V21 (MUST-21).';

--   `trainer.timezone` — WHOSE "TODAY"
--
-- `workout_session.session_date` is a DATE and `working_hours` are minutes past
-- midnight — both in a zone nobody wrote down, which is IST by assumption. The
-- export (MUST-20) promises dates in IST, and the first trainer coaching a
-- client in Dubai online is the first place the assumption is wrong. An IANA
-- name, defaulting to the one every row so far was written in.

ALTER TABLE public.trainer
    ADD COLUMN timezone varchar(64) DEFAULT 'Asia/Kolkata' NOT NULL;

COMMENT ON COLUMN public.trainer.timezone IS
    'IANA zone the trainer''s dates and working hours are in. Defaults to Asia/Kolkata, which every row before V21 assumed. See V21.';
