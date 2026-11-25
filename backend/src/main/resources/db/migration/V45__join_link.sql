-- V45 — the trainer's join link and the requests it takes (22 Nov 2026, the owner's call).
--
-- Until now a client arrived only through a personal invite the trainer sent to a number they had typed in. The join link
-- is one public address per trainer per workspace (/join/{slug}) — for an Instagram bio, a WhatsApp status, a QR code on
-- the gym wall — through which somebody the trainer has not met yet can ASK to train with them. Decided with the owner:
--
--   · REQUESTS ONLY. A join is never a client. It is a join_request that waits until the trainer approves it, so the rule
--     "only a number a trainer added can ever sign in" still holds: approving IS adding. There is no "accept
--     automatically" switch.
--   · THE NUMBER IS PROVED before a request exists: the page sends an ordinary sign_in code over WhatsApp, and
--     submit_join_request() refuses a number other than app.phone. A request therefore never carries somebody else's
--     number, and a stranger cannot fill the trainer's list with made-up ones.
--   · CONSENT IS GIVEN ON THE JOIN PAGE: the privacy notice (its version), the "fit to train" tick (V42) and a date of
--     birth of 18 or over (adults only, 25 Sep 2026). Approval makes the client exactly as an accepted invite would —
--     approve_join_request() builds the client row and a pending invite and then runs accept_client_invite() itself
--     with the joiner's proved number — so the portal, its app_user and client_prefs come from the one act that has
--     always made them.
--   · PLANS ARE PAID LATER. The trainer chooses packs from their own price list (pack) to show on the page; the joiner may
--     pick one; approval hands the trainer on to selling it. There is no payment on the page (no gateway at launch).
--   · THE ALLOWLIST GATES TRAINERS. A client number gets in because an allowlisted trainer approved it.
--
-- Personal data on a request does not outlive its purpose: approval moves the name, number, date of birth and gender to
-- the client row and the answers to a private client_note, then scrubs them off the request; a declined or unanswered
-- request is deleted 30 days on by purge_join_requests() (SYSTEM only, the daily JoinRequestSweeper).
--
-- Backend + web only, like V30 and V32–V44: nothing enters sync.

-- ─── 1. the link: one per trainer per workspace ──────────────────────────────

CREATE TABLE join_link (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    trainer_id uuid NOT NULL,
    slug varchar(40) NOT NULL,
    taking_joins boolean DEFAULT false NOT NULL,
    welcome_line varchar(200),
    questions jsonb DEFAULT '[]' NOT NULL,
    pack_ids uuid[] DEFAULT '{}' NOT NULL,
    allow_no_plan boolean DEFAULT true NOT NULL,
    welcome_message varchar(1000),
    check_in_template_id uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT join_link_pkey PRIMARY KEY (id),
    CONSTRAINT join_link_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id),
    CONSTRAINT join_link_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id),
    CONSTRAINT join_link_check_in_fkey FOREIGN KEY (check_in_template_id) REFERENCES assessment_template (id) ON DELETE SET NULL,
    CONSTRAINT join_link_slug CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$' AND slug !~ '--'),
    CONSTRAINT join_link_texts CHECK ((welcome_line IS NULL OR btrim(welcome_line) <> '')
        AND (welcome_message IS NULL OR btrim(welcome_message) <> '')),
    CONSTRAINT join_link_questions CHECK (jsonb_typeof(questions) = 'array' AND jsonb_array_length(questions) <= 15),
    CONSTRAINT join_link_packs CHECK (cardinality(pack_ids) <= 12),
    -- a page with no plans must let people join without one, or nobody could join at all
    CONSTRAINT join_link_some_way_in CHECK (allow_no_plan OR cardinality(pack_ids) > 0)
);
CREATE UNIQUE INDEX uq_join_link_slug ON join_link (slug);
CREATE UNIQUE INDEX uq_join_link_trainer ON join_link (tenant_id, trainer_id);

COMMENT ON TABLE join_link IS 'A trainer''s public join page, one per trainer per workspace (V45). Never makes a client by itself.';
COMMENT ON COLUMN join_link.questions IS
    '[{id, label, kind: text|choice, options: [..], required}] — the trainer''s own questions, at most 15, never about health.';
COMMENT ON COLUMN join_link.pack_ids IS 'The packs offered on the page, in order. Read through join_card(), which drops any no longer active.';

-- ─── 2. the requests ─────────────────────────────────────────────────────────

CREATE TABLE join_request (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    trainer_id uuid NOT NULL,
    join_link_id uuid NOT NULL,
    status varchar(12) DEFAULT 'pending' NOT NULL,
    name varchar(100),
    phone varchar(16),
    email varchar(254),
    date_of_birth date,
    gender varchar(20),
    pack_id uuid,
    answers jsonb DEFAULT '[]' NOT NULL,
    policy_version varchar(20) NOT NULL,
    training_terms_accepted_at timestamptz NOT NULL,
    whatsapp_reminders boolean DEFAULT false NOT NULL,
    phone_verified_at timestamptz NOT NULL,
    client_id uuid,
    decided_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT join_request_pkey PRIMARY KEY (id),
    CONSTRAINT join_request_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id),
    CONSTRAINT join_request_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id),
    CONSTRAINT join_request_link_fkey FOREIGN KEY (join_link_id) REFERENCES join_link (id) ON DELETE CASCADE,
    CONSTRAINT join_request_pack_fkey FOREIGN KEY (pack_id) REFERENCES pack (id) ON DELETE SET NULL,
    CONSTRAINT join_request_client_fkey FOREIGN KEY (client_id) REFERENCES client (id) ON DELETE SET NULL,
    CONSTRAINT join_request_status CHECK (status IN ('pending', 'approved', 'declined')),
    CONSTRAINT join_request_decided CHECK ((status = 'pending') = (decided_at IS NULL)),
    -- an approved request has handed its person to the client row and keeps none of it
    CONSTRAINT join_request_person CHECK (
        status = 'approved' AND name IS NULL AND phone IS NULL AND email IS NULL AND date_of_birth IS NULL AND gender IS NULL
            AND answers = '[]'::jsonb
        OR status <> 'approved' AND name IS NOT NULL AND btrim(name) <> '' AND phone IS NOT NULL AND date_of_birth IS NOT NULL),
    CONSTRAINT join_request_phone_format CHECK (phone IS NULL OR (phone ~ '^\+[1-9][0-9]{6,14}$' AND (phone !~ '^\+91' OR phone ~ '^\+91[6-9][0-9]{9}$'))),
    CONSTRAINT join_request_adult CHECK (date_of_birth IS NULL OR (date_of_birth >= DATE '1900-01-01'
        AND date_of_birth <= ((created_at AT TIME ZONE 'UTC') - INTERVAL '18 years')::date)),
    CONSTRAINT join_request_gender CHECK (gender IS NULL OR gender IN ('female', 'male', 'other', 'prefer_not_to_say')),
    CONSTRAINT join_request_answers CHECK (jsonb_typeof(answers) = 'array' AND jsonb_array_length(answers) <= 15)
);
-- one waiting request per number per workspace: asking again replaces it
CREATE UNIQUE INDEX uq_join_request_pending ON join_request (tenant_id, phone) WHERE status = 'pending';
CREATE INDEX idx_join_request_trainer ON join_request (tenant_id, trainer_id, status, created_at DESC);

COMMENT ON TABLE join_request IS
    'Somebody asking to train, through a join link (V45). Not a client until the trainer approves; scrubbed on approval, deleted 30 days after any other end.';

CREATE TRIGGER trg_join_link_stamp_tenant BEFORE INSERT ON join_link FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_join_link_freeze_tenant BEFORE UPDATE ON join_link FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_join_link_updated_at BEFORE UPDATE ON join_link FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_join_request_freeze_tenant BEFORE UPDATE ON join_request FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_join_request_updated_at BEFORE UPDATE ON join_request FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── 3. who may touch them ───────────────────────────────────────────────────
-- The trainer's own link and requests, in the workspaces they are in. The public page reaches them only through the
-- definer functions below. A request is never INSERTed by the request role: only submit_join_request() makes one.

ALTER TABLE join_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE join_request ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    EXECUTE 'CREATE POLICY join_link_self ON join_link TO inclineyou_app
        USING (app_actor() = ''staff'' AND trainer_id = app_trainer_id() AND tenant_id = ANY (app_tenant_ids()))
        WITH CHECK (app_actor() = ''staff'' AND trainer_id = app_trainer_id() AND tenant_id = app_tenant_id())';
    EXECUTE 'CREATE POLICY join_request_self ON join_request FOR SELECT TO inclineyou_app
        USING (app_actor() = ''staff'' AND trainer_id = app_trainer_id() AND tenant_id = ANY (app_tenant_ids()))';
    EXECUTE 'CREATE POLICY join_request_self_update ON join_request FOR UPDATE TO inclineyou_app
        USING (app_actor() = ''staff'' AND trainer_id = app_trainer_id() AND tenant_id = ANY (app_tenant_ids()))
        WITH CHECK (app_actor() = ''staff'' AND trainer_id = app_trainer_id() AND tenant_id = ANY (app_tenant_ids()))';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON join_link TO inclineyou_app';
    EXECUTE 'GRANT SELECT, UPDATE ON join_request TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — policies and grants skipped';
END $$;

-- ─── 4. the public card ──────────────────────────────────────────────────────
-- What /join/{slug} draws. Read-only, so a link preview (WhatsApp fetches what it is shown) changes nothing. A slug that
-- does not exist, a link that is off, a trainer who closed their account and a closed workspace are one answer.

CREATE FUNCTION join_card(p_slug varchar) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE l join_link%ROWTYPE; tr record; plans jsonb;
BEGIN
    SELECT jl.* INTO l FROM join_link jl
      JOIN trainer t ON t.id = jl.trainer_id
      JOIN tenant tn ON tn.id = jl.tenant_id
     WHERE jl.slug = lower(p_slug) AND jl.taking_joins AND t.deleted_at IS NULL AND tn.status = 'active';
    IF NOT FOUND THEN RETURN jsonb_build_object('state', 'closed'); END IF;

    SELECT t.name, b.headline, b.bio, b.intro_video_url, b.certifications, b.specialities, b.languages,
           b.instagram_url, b.youtube_url
      INTO tr
      FROM trainer t LEFT JOIN trainer_business b ON b.trainer_id = t.id
     WHERE t.id = l.trainer_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', p.id, 'name', p.name, 'service', p.service, 'basis', p.basis, 'sessions', p.sessions,
               'validity_days', p.validity_days, 'amount', p.amount, 'currency', p.currency) ORDER BY o.ord), '[]'::jsonb)
      INTO plans
      FROM unnest(l.pack_ids) WITH ORDINALITY AS o(pack_id, ord)
      JOIN pack p ON p.id = o.pack_id
     WHERE p.trainer_id = l.trainer_id AND p.tenant_id = l.tenant_id AND p.status = 'active' AND p.deleted_at IS NULL;

    RETURN jsonb_build_object(
        'state', 'open',
        'welcome_line', l.welcome_line,
        'questions', l.questions,
        'plans', plans,
        -- with every offered pack gone, joining without one is the only way left in
        'allow_no_plan', l.allow_no_plan OR jsonb_array_length(plans) = 0,
        'trainer', jsonb_build_object('name', tr.name, 'headline', tr.headline, 'bio', tr.bio, 'intro_video_url', tr.intro_video_url,
                                      'certifications', tr.certifications, 'specialities', tr.specialities, 'languages', tr.languages,
                                      'instagram_url', tr.instagram_url, 'youtube_url', tr.youtube_url));
END $$;

-- ─── 5. asking: one request per number per workspace ─────────────────────────
-- Runs with the number the code proved as app.phone, and refuses any other. Answers {result}:
--   received · updated (the same number asked again; the waiting request now says this) · closed · plan_unavailable ·
--   already_client (on this workspace's list already: sign in) · with_another_trainer · unavailable (a trainer's number:
--   one number, one role) · age_requirement · full (the trainer has 200 requests waiting).
-- The answers are validated by the caller against the link's questions; this function stores them as given.

CREATE FUNCTION submit_join_request(p_slug varchar, p_name varchar, p_phone varchar, p_email varchar, p_date_of_birth date,
                                    p_gender varchar, p_pack uuid, p_answers jsonb, p_policy_version varchar,
                                    p_whatsapp_reminders boolean, p_training_terms boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE l join_link%ROWTYPE; au app_user%ROWTYPE; existing uuid; waiting int;
BEGIN
    IF session_user = 'inclineyou_app' AND p_phone IS DISTINCT FROM app_phone() THEN
        RAISE EXCEPTION 'a join request is made only by the number it is for' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT COALESCE(p_training_terms, false) OR p_policy_version IS NULL OR p_date_of_birth IS NULL THEN
        RAISE EXCEPTION 'the notice, the fit-to-train tick and a date of birth are required' USING ERRCODE = 'invalid_parameter_value';
    END IF;

    SELECT jl.* INTO l FROM join_link jl
      JOIN trainer t ON t.id = jl.trainer_id
      JOIN tenant tn ON tn.id = jl.tenant_id
     WHERE jl.slug = lower(p_slug) AND jl.taking_joins AND t.deleted_at IS NULL AND tn.status = 'active'
       FOR UPDATE OF jl;
    IF NOT FOUND THEN RETURN jsonb_build_object('result', 'closed'); END IF;

    IF p_date_of_birth > (current_date - interval '18 years')::date OR p_date_of_birth < DATE '1900-01-01' THEN
        RETURN jsonb_build_object('result', 'age_requirement');
    END IF;

    IF p_pack IS NULL THEN
        IF NOT l.allow_no_plan AND EXISTS (
            SELECT 1 FROM pack p WHERE p.id = ANY (l.pack_ids) AND p.trainer_id = l.trainer_id AND p.tenant_id = l.tenant_id
               AND p.status = 'active' AND p.deleted_at IS NULL) THEN
            RETURN jsonb_build_object('result', 'plan_unavailable');
        END IF;
    ELSIF NOT (p_pack = ANY (l.pack_ids)) OR NOT EXISTS (
            SELECT 1 FROM pack p WHERE p.id = p_pack AND p.trainer_id = l.trainer_id AND p.tenant_id = l.tenant_id
               AND p.status = 'active' AND p.deleted_at IS NULL) THEN
        RETURN jsonb_build_object('result', 'plan_unavailable');
    END IF;

    SELECT * INTO au FROM app_user WHERE phone = p_phone;
    IF FOUND AND (au.role <> 'client' OR au.deleted_at IS NOT NULL) THEN
        RETURN jsonb_build_object('result', 'unavailable');
    END IF;
    IF EXISTS (SELECT 1 FROM client c WHERE c.tenant_id = l.tenant_id AND c.phone = p_phone AND c.deleted_at IS NULL
                  AND c.status <> 'archived' AND c.membership_status NOT IN ('removed', 'declined')) THEN
        RETURN jsonb_build_object('result', 'already_client');
    END IF;
    IF EXISTS (SELECT 1 FROM client c WHERE c.phone = p_phone AND c.deleted_at IS NULL
                  AND c.membership_status IN ('accepted', 'paused')) THEN
        RETURN jsonb_build_object('result', 'with_another_trainer');
    END IF;

    SELECT id INTO existing FROM join_request WHERE tenant_id = l.tenant_id AND phone = p_phone AND status = 'pending' FOR UPDATE;
    IF existing IS NOT NULL THEN
        UPDATE join_request
           SET trainer_id = l.trainer_id, join_link_id = l.id, name = btrim(p_name), email = NULLIF(btrim(p_email), ''),
               date_of_birth = p_date_of_birth, gender = p_gender, pack_id = p_pack, answers = COALESCE(p_answers, '[]'::jsonb),
               policy_version = p_policy_version, training_terms_accepted_at = now(),
               whatsapp_reminders = COALESCE(p_whatsapp_reminders, false), phone_verified_at = now(), created_at = now()
         WHERE id = existing;
        RETURN jsonb_build_object('result', 'updated', 'request_id', existing);
    END IF;

    SELECT count(*) INTO waiting FROM join_request WHERE join_link_id = l.id AND status = 'pending';
    IF waiting >= 200 THEN RETURN jsonb_build_object('result', 'full'); END IF;

    INSERT INTO join_request (tenant_id, trainer_id, join_link_id, name, phone, email, date_of_birth, gender, pack_id, answers,
                              policy_version, training_terms_accepted_at, whatsapp_reminders, phone_verified_at)
    VALUES (l.tenant_id, l.trainer_id, l.id, btrim(p_name), p_phone, NULLIF(btrim(p_email), ''), p_date_of_birth, p_gender, p_pack,
            COALESCE(p_answers, '[]'::jsonb), p_policy_version, now(), COALESCE(p_whatsapp_reminders, false), now())
    RETURNING id INTO existing;
    RETURN jsonb_build_object('result', 'received', 'request_id', existing);
END $$;

-- ─── 6. approving: the request becomes a client, exactly as an accepted invite would ─
-- The trainer's own request, in a workspace they are in. Idempotent: an approved one answers its client again. Answers
-- {result}: approved (+ client_id, pack_id, check_in_template_id) · not_pending (declined) · already_client ·
-- with_another_trainer · unavailable. On anything but approved nothing is written, and the request stays as it was.
--
-- The client row and a pending invite are made here, then accept_client_invite() — the one act that has always made a
-- client's account — runs with the joiner's number as app.phone for that call only: the number was proved by its code
-- when the request was made, and the consent it records is the one given on the join page.

CREATE FUNCTION approve_join_request(p_request uuid, p_client_type varchar) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE r join_request%ROWTYPE; l join_link%ROWTYPE; au app_user%ROWTYPE; new_client uuid; new_invite uuid;
        prev_phone text; accepted jsonb; note text;
BEGIN
    SELECT * INTO r FROM join_request WHERE id = p_request FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('result', 'not_found'); END IF;
    IF session_user = 'inclineyou_app' AND NOT (app_actor() = 'staff' AND r.trainer_id = app_trainer_id()
                                                 AND r.tenant_id = ANY (app_tenant_ids())) THEN
        RETURN jsonb_build_object('result', 'not_found');
    END IF;
    IF r.status = 'approved' THEN
        RETURN jsonb_build_object('result', 'approved', 'client_id', r.client_id, 'pack_id', r.pack_id);
    END IF;
    IF r.status <> 'pending' THEN RETURN jsonb_build_object('result', 'not_pending'); END IF;
    IF p_client_type IS NULL OR p_client_type NOT IN ('independent', 'gym') THEN
        RAISE EXCEPTION 'client type must be independent or gym' USING ERRCODE = 'invalid_parameter_value';
    END IF;

    SELECT * INTO au FROM app_user WHERE phone = r.phone;
    IF FOUND AND (au.role <> 'client' OR au.deleted_at IS NOT NULL) THEN
        RETURN jsonb_build_object('result', 'unavailable');
    END IF;
    IF EXISTS (SELECT 1 FROM client c WHERE c.tenant_id = r.tenant_id AND c.phone = r.phone AND c.deleted_at IS NULL
                  AND c.status <> 'archived' AND c.membership_status NOT IN ('removed', 'declined')) THEN
        RETURN jsonb_build_object('result', 'already_client');
    END IF;
    IF EXISTS (SELECT 1 FROM client c WHERE c.phone = r.phone AND c.deleted_at IS NULL
                  AND c.membership_status IN ('accepted', 'paused')) THEN
        RETURN jsonb_build_object('result', 'with_another_trainer');
    END IF;

    INSERT INTO client (tenant_id, trainer_id, name, phone, date_of_birth, gender, client_type, status, membership_status, invited_at)
    VALUES (r.tenant_id, r.trainer_id, r.name, r.phone, r.date_of_birth, r.gender, p_client_type, 'prospect', 'invited', now())
    RETURNING id INTO new_client;
    -- The invite is bookkeeping, never a link: its token is random and was never shown to anybody.
    INSERT INTO client_invite (tenant_id, trainer_id, client_id, phone, token_hash)
    VALUES (r.tenant_id, r.trainer_id, new_client, r.phone,
            encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex'))
    RETURNING id INTO new_invite;

    prev_phone := current_setting('app.phone', true);
    PERFORM set_config('app.phone', r.phone, true);
    accepted := accept_client_invite(new_invite, r.date_of_birth, r.policy_version, r.whatsapp_reminders, true);
    PERFORM set_config('app.phone', COALESCE(prev_phone, ''), true);
    IF accepted ->> 'result' IS DISTINCT FROM 'accepted' THEN
        -- every reason accept could refuse was checked above; reaching here is a race, and nothing is kept
        RAISE EXCEPTION 'join request % could not be accepted: %', p_request, accepted ->> 'result' USING ERRCODE = 'serialization_failure';
    END IF;

    -- What they told the trainer, kept where the trainer keeps what they know about a client: a private note.
    SELECT string_agg(line, E'\n' ORDER BY n) INTO note FROM (
        SELECT 0 AS n, 'Email: ' || r.email AS line WHERE r.email IS NOT NULL
        UNION ALL
        SELECT o.n, (a ->> 'label') || E'\n' || COALESCE(NULLIF(a ->> 'answer', ''), '—')
          FROM jsonb_array_elements(r.answers) WITH ORDINALITY AS o(a, n)
    ) x;
    IF note IS NOT NULL THEN
        INSERT INTO client_note (tenant_id, client_id, trainer_id, body)
        VALUES (r.tenant_id, new_client, r.trainer_id, left('From the join form' || E'\n\n' || note, 4000));
    END IF;

    SELECT * INTO l FROM join_link WHERE id = r.join_link_id;
    IF l.welcome_message IS NOT NULL THEN
        INSERT INTO client_message (tenant_id, client_id, trainer_id, body, kind)
        VALUES (r.tenant_id, new_client, r.trainer_id, l.welcome_message, 'note');
    END IF;

    UPDATE join_request
       SET status = 'approved', decided_at = now(), client_id = new_client,
           name = NULL, phone = NULL, email = NULL, date_of_birth = NULL, gender = NULL, answers = '[]'::jsonb
     WHERE id = r.id;
    RETURN jsonb_build_object('result', 'approved', 'client_id', new_client, 'pack_id', r.pack_id,
                              'check_in_template_id', l.check_in_template_id);
END $$;

-- ─── 7. forgetting ───────────────────────────────────────────────────────────
-- A declined request, and one nobody answered, is deleted 30 days after it was made or decided. Approved ones hold no
-- person already. Requests in a closed workspace go at once.

CREATE FUNCTION purge_join_requests() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE n integer;
BEGIN
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system' THEN
        RAISE EXCEPTION 'only the system purges join requests' USING ERRCODE = 'insufficient_privilege';
    END IF;
    DELETE FROM join_request jr
     WHERE (jr.status = 'declined' AND jr.decided_at < now() - interval '30 days')
        OR (jr.status = 'pending' AND jr.created_at < now() - interval '30 days')
        OR (jr.status <> 'approved' AND EXISTS (SELECT 1 FROM tenant tn WHERE tn.id = jr.tenant_id AND tn.status <> 'active'));
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END $$;

DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION join_card(varchar), submit_join_request(varchar, varchar, varchar, varchar, date, varchar, uuid, jsonb, varchar, boolean, boolean),
                     approve_join_request(uuid, varchar), purge_join_requests() FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION join_card(varchar), submit_join_request(varchar, varchar, varchar, varchar, date, varchar, uuid, jsonb, varchar, boolean, boolean),
                     approve_join_request(uuid, varchar), purge_join_requests() TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;
