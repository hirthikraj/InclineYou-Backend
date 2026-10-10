-- V11 · the client portal (PRD of 10 Oct 2026; schema proposal on release/proposed-schema.html).
--
-- Additive only: nothing is dropped, renamed or repurposed. It adds
--   · 16 columns on seven existing tables,
--   · seven tables: client_invite and push_subscription are new; client_prefs, client_notification,
--     workout_feedback, client_message and milestone were designed for the portal in the later schema
--     and are adapted here to V1 (workout_session is now scheduled_session; phones are E.164),
--   · the client lens of row-level security — V1 defines app_client_ids() but no policy uses it, so a
--     client could read nothing — with a column guard on every table a client may write,
--   · the portal's functions, and three existing functions extended in place (erase_clients,
--     erase_account, purge_closed_tenants) so the new rows are erased and purged with the rest.
--
-- One database role (inclineyou_app) serves staff and clients alike, so a client's column limits
-- cannot be column GRANTs: they are BEFORE UPDATE guards that read app_actor().

-- ─── 1. columns on existing tables ───────────────────────────────────────────

-- client: who accepted, when the portal was last opened (the lead measure), who ended it, and the
-- trainer's two per-client overrides.
ALTER TABLE client
    ADD COLUMN accepted_policy_version varchar(20),
    ADD COLUMN last_portal_seen_at     timestamptz,
    ADD COLUMN removed_by              varchar(8),
    ADD COLUMN portal_show_money       boolean,
    ADD COLUMN reminders_excluded      boolean NOT NULL DEFAULT false;
-- Every removal before this column was a trainer's, so that is the backfill.
UPDATE client SET removed_by = 'trainer' WHERE removed_at IS NOT NULL;
ALTER TABLE client ADD CONSTRAINT client_accepted_version
    CHECK (accepted_policy_version IS NULL OR accepted_at IS NOT NULL);
ALTER TABLE client ADD CONSTRAINT client_removed_by
    CHECK (removed_by IS NULL OR (removed_at IS NOT NULL AND removed_by IN ('trainer', 'client')));
CREATE INDEX idx_client_portal_seen ON client (trainer_id, last_portal_seen_at)
    WHERE membership_status = 'accepted' AND deleted_at IS NULL;

-- trainer: the reminder switch, its timing, whether clients see what they owe, and when they last opened the bell.
ALTER TABLE trainer
    ADD COLUMN session_reminders  boolean     NOT NULL DEFAULT false,
    ADD COLUMN reminder_timing    varchar(16) NOT NULL DEFAULT 'evening_before',
    ADD COLUMN clients_see_money  boolean     NOT NULL DEFAULT true,
    -- the bell is derived (no notification table); this is the one stored fact it needs: when the trainer last looked
    ADD COLUMN bell_seen_at       timestamptz;
ALTER TABLE trainer ADD CONSTRAINT trainer_reminder_timing
    CHECK (reminder_timing IN ('evening_before', 'two_hours_before'));

-- scheduled_session: who logs it. 'client' is a self-run day the client does alone: not in the
-- trainer's diary, no clash check, no package charge (a trigger below refuses it).
ALTER TABLE scheduled_session
    ADD COLUMN logged_by      varchar(8) NOT NULL DEFAULT 'trainer',
    ADD COLUMN paused_seconds integer    NOT NULL DEFAULT 0;
ALTER TABLE scheduled_session ADD CONSTRAINT scheduled_session_logged_by
    CHECK (logged_by IN ('trainer', 'client'));
ALTER TABLE scheduled_session ADD CONSTRAINT scheduled_session_client_logged
    CHECK (logged_by = 'trainer' OR (status IN ('scheduled', 'done') AND slot_id IS NULL AND delivery_mode IS NULL));
ALTER TABLE scheduled_session ADD CONSTRAINT scheduled_session_paused CHECK (paused_seconds >= 0);
CREATE INDEX idx_scheduled_session_client_logged ON scheduled_session (client_id, scheduled_at DESC)
    WHERE logged_by = 'client' AND deleted_at IS NULL;

-- set_log: who typed the set.
ALTER TABLE set_log ADD COLUMN entered_by varchar(8) NOT NULL DEFAULT 'trainer';
ALTER TABLE set_log ADD CONSTRAINT set_log_entered_by CHECK (entered_by IN ('trainer', 'client'));

-- session_exercise: where a swap came from (the swap itself is already swapped_from_exercise_id).
ALTER TABLE session_exercise ADD COLUMN swap_source varchar(10);
ALTER TABLE session_exercise ADD CONSTRAINT session_exercise_swap_source
    CHECK (swap_source IS NULL OR (swapped_from_exercise_id IS NOT NULL AND swap_source IN ('library', 'approved')));

-- client_note: a note the trainer chose to show the client. Private by default, so every note
-- already written stays private.
ALTER TABLE client_note
    ADD COLUMN shared_with_client boolean NOT NULL DEFAULT false,
    ADD COLUMN shared_at          timestamptz;
ALTER TABLE client_note ADD CONSTRAINT client_note_shared CHECK (shared_with_client = (shared_at IS NOT NULL));
CREATE INDEX idx_client_note_shared ON client_note (client_id, created_at DESC)
    WHERE shared_with_client AND deleted_at IS NULL;

-- assessment_template: marks the template the product ships a default for (the weekly check-in).
ALTER TABLE assessment_template ADD COLUMN system_key varchar(24);
ALTER TABLE assessment_template ADD CONSTRAINT assessment_template_system_key
    CHECK (system_key IS NULL OR system_key IN ('weekly_check_in'));
CREATE UNIQUE INDEX uq_assessment_template_system ON assessment_template (trainer_id, system_key)
    WHERE system_key IS NOT NULL AND deleted_at IS NULL;

-- ─── 2. tables ───────────────────────────────────────────────────────────────

-- The invite a trainer sends: the only way a client gets an account. Only the token's SHA-256 is stored.
CREATE TABLE client_invite (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    trainer_id uuid NOT NULL,
    client_id uuid NOT NULL,
    phone varchar(16) NOT NULL,
    token_hash varchar(64) NOT NULL,
    status varchar(12) DEFAULT 'pending' NOT NULL,
    expires_at timestamptz DEFAULT (now() + interval '14 days') NOT NULL,
    decline_reason varchar(16),
    revoked_reason varchar(20),
    policy_version varchar(20),
    accepted_at timestamptz,
    declined_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT client_invite_pkey PRIMARY KEY (id),
    CONSTRAINT client_invite_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id),
    CONSTRAINT client_invite_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id),
    CONSTRAINT client_invite_client_id_fkey FOREIGN KEY (client_id) REFERENCES client (id),
    CONSTRAINT client_invite_client_same_tenant FOREIGN KEY (client_id, tenant_id) REFERENCES client (id, tenant_id),
    CONSTRAINT client_invite_status CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
    CONSTRAINT client_invite_token_format CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT client_invite_phone_format CHECK (phone ~ '^\+[1-9][0-9]{6,14}$' AND (phone !~ '^\+91' OR phone ~ '^\+91[6-9][0-9]{9}$')),
    CONSTRAINT client_invite_window CHECK (expires_at > created_at),
    CONSTRAINT client_invite_accepted CHECK ((status = 'accepted') = (accepted_at IS NOT NULL AND policy_version IS NOT NULL)),
    CONSTRAINT client_invite_declined CHECK ((status = 'declined') = (declined_at IS NOT NULL AND decline_reason IS NOT NULL)
        AND (decline_reason IS NULL OR decline_reason IN ('not_for_me', 'age_requirement'))),
    CONSTRAINT client_invite_revoked CHECK ((status = 'revoked') = (revoked_at IS NOT NULL AND revoked_reason IS NOT NULL)
        AND (revoked_reason IS NULL OR revoked_reason IN ('replaced', 'number_changed', 'trainer', 'client_removed', 'erased')))
);
CREATE UNIQUE INDEX uq_client_invite_token ON client_invite (token_hash);
CREATE UNIQUE INDEX uq_client_invite_pending ON client_invite (client_id) WHERE status = 'pending';
CREATE INDEX idx_client_invite_phone_pending ON client_invite (phone) WHERE status = 'pending';
CREATE INDEX idx_client_invite_tenant_trainer ON client_invite (tenant_id, trainer_id, created_at DESC);

-- A browser's permission to receive push, per person. Revoked, never deleted.
CREATE TABLE push_subscription (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    app_user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh varchar(100) NOT NULL,
    auth varchar(50) NOT NULL,
    user_agent varchar(300),
    last_success_at timestamptz,
    revoked_at timestamptz,
    revoked_reason varchar(16),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT push_subscription_pkey PRIMARY KEY (id),
    CONSTRAINT push_subscription_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES app_user (id),
    CONSTRAINT push_subscription_revoked CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL)
        AND (revoked_reason IS NULL OR revoked_reason IN ('expired', 'sign_out', 'user', 'erased')))
);
CREATE UNIQUE INDEX uq_push_subscription_endpoint ON push_subscription (endpoint);
CREATE INDEX idx_push_subscription_user ON push_subscription (app_user_id) WHERE revoked_at IS NULL;

-- The client's own settings, one row per client row. No row means every switch is on.
CREATE TABLE client_prefs (
    client_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    hide_weight boolean DEFAULT false NOT NULL,
    notify_program_updated boolean DEFAULT true NOT NULL,
    notify_session_reminder boolean DEFAULT true NOT NULL,
    notify_trainer_note boolean DEFAULT true NOT NULL,
    notify_personal_best boolean DEFAULT true NOT NULL,
    notify_pack_changed boolean DEFAULT true NOT NULL,
    notify_checkin boolean DEFAULT true NOT NULL,
    auto_rest_timer boolean DEFAULT true NOT NULL,
    channel_whatsapp boolean DEFAULT true NOT NULL,
    channel_push boolean DEFAULT true NOT NULL,
    whatsapp_opt_in_at timestamptz,
    nominee_name varchar(80),
    nominee_phone varchar(16),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    CONSTRAINT client_prefs_pkey PRIMARY KEY (client_id),
    CONSTRAINT client_prefs_client_id_fkey FOREIGN KEY (client_id) REFERENCES client (id),
    CONSTRAINT client_prefs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id),
    CONSTRAINT client_prefs_client_same_tenant FOREIGN KEY (client_id, tenant_id) REFERENCES client (id, tenant_id),
    CONSTRAINT client_prefs_nominee CHECK ((nominee_name IS NULL) = (nominee_phone IS NULL)),
    CONSTRAINT client_prefs_nominee_phone CHECK (nominee_phone IS NULL OR nominee_phone ~ '^\+[1-9][0-9]{6,14}$'),
    CONSTRAINT client_prefs_nominee_name CHECK (nominee_name IS NULL OR btrim(nominee_name) <> '')
);
CREATE INDEX idx_client_prefs_tenant ON client_prefs (tenant_id);

-- The client's notification bell and the delivery log of the session reminder. Written only by
-- mint_client_notification().
CREATE TABLE client_notification (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    client_id uuid NOT NULL,
    kind varchar(12) NOT NULL,
    amount numeric(10,2),
    subject_at timestamptz,
    text varchar(160),
    session_id uuid,
    send_after timestamptz,
    whatsapp_status varchar(12) DEFAULT 'not_sent' NOT NULL,
    whatsapp_skip_reason varchar(20),
    whatsapp_message_id varchar(100),
    whatsapp_sent_at timestamptz,
    whatsapp_error varchar(200),
    push_sent_at timestamptz,
    at timestamptz DEFAULT now() NOT NULL,
    read_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    CONSTRAINT client_notification_pkey PRIMARY KEY (id),
    CONSTRAINT client_notification_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id),
    CONSTRAINT client_notification_client_id_fkey FOREIGN KEY (client_id) REFERENCES client (id),
    CONSTRAINT client_notification_client_same_tenant FOREIGN KEY (client_id, tenant_id) REFERENCES client (id, tenant_id),
    CONSTRAINT client_notification_session_owner FOREIGN KEY (session_id, client_id, tenant_id) REFERENCES scheduled_session (id, client_id, tenant_id),
    CONSTRAINT client_notification_kind CHECK (kind IN ('note', 'plan', 'session', 'pack', 'best', 'checkin', 'reminder')),
    CONSTRAINT client_notification_reminder CHECK (kind <> 'reminder' OR (session_id IS NOT NULL AND text IS NOT NULL)),
    CONSTRAINT client_notification_delivery_only_reminder CHECK (kind = 'reminder' OR (whatsapp_status = 'not_sent' AND send_after IS NULL)),
    CONSTRAINT client_notification_whatsapp_status CHECK (whatsapp_status IN ('not_sent', 'queued', 'sent', 'delivered', 'failed', 'skipped')),
    CONSTRAINT client_notification_skip CHECK ((whatsapp_status = 'skipped') = (whatsapp_skip_reason IS NOT NULL)
        AND (whatsapp_skip_reason IS NULL OR whatsapp_skip_reason IN ('trainer_off', 'client_opt_out', 'client_excluded', 'no_opt_in', 'session_changed', 'window_passed'))),
    CONSTRAINT client_notification_sent CHECK ((whatsapp_status IN ('sent', 'delivered')) = (whatsapp_sent_at IS NOT NULL AND whatsapp_message_id IS NOT NULL))
);
CREATE INDEX idx_client_notification_feed ON client_notification (client_id, at DESC, id);
CREATE INDEX idx_client_notification_tenant ON client_notification (tenant_id);
CREATE UNIQUE INDEX uq_client_notification_reminder ON client_notification (session_id)
    WHERE kind = 'reminder' AND whatsapp_status <> 'skipped' AND deleted_at IS NULL;
CREATE INDEX idx_client_notification_due ON client_notification (send_after) WHERE whatsapp_status = 'queued';
CREATE UNIQUE INDEX uq_client_notification_message ON client_notification (whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;

-- How a workout felt, in the client's own words. One row per session.
CREATE TABLE workout_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    session_id uuid NOT NULL,
    client_id uuid NOT NULL,
    effort varchar(8),
    note text,
    at timestamptz DEFAULT now() NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    CONSTRAINT workout_feedback_pkey PRIMARY KEY (id),
    CONSTRAINT workout_feedback_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id),
    CONSTRAINT workout_feedback_session_id_fkey FOREIGN KEY (session_id) REFERENCES scheduled_session (id),
    CONSTRAINT workout_feedback_client_id_fkey FOREIGN KEY (client_id) REFERENCES client (id),
    CONSTRAINT workout_feedback_client_same_tenant FOREIGN KEY (client_id, tenant_id) REFERENCES client (id, tenant_id),
    CONSTRAINT workout_feedback_session_owner FOREIGN KEY (session_id, client_id, tenant_id) REFERENCES scheduled_session (id, client_id, tenant_id),
    CONSTRAINT workout_feedback_effort CHECK (effort IS NULL OR effort IN ('easy', 'right', 'hard')),
    CONSTRAINT workout_feedback_note CHECK (note IS NULL OR (btrim(note) <> '' AND char_length(note) <= 1000))
);
CREATE UNIQUE INDEX workout_feedback_one_per_session ON workout_feedback (session_id);
CREATE INDEX idx_workout_feedback_client ON workout_feedback (client_id);
CREATE INDEX idx_workout_feedback_tenant ON workout_feedback (tenant_id);

-- A line from the trainer to one client: the note on Home, the note after a session, the weekly word.
CREATE TABLE client_message (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    client_id uuid NOT NULL,
    trainer_id uuid NOT NULL,
    session_id uuid,
    body text NOT NULL,
    kind varchar(12) DEFAULT 'note' NOT NULL,
    at timestamptz DEFAULT now() NOT NULL,
    read_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    CONSTRAINT client_message_pkey PRIMARY KEY (id),
    CONSTRAINT client_message_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id),
    CONSTRAINT client_message_client_id_fkey FOREIGN KEY (client_id) REFERENCES client (id),
    CONSTRAINT client_message_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id),
    CONSTRAINT client_message_client_same_tenant FOREIGN KEY (client_id, tenant_id) REFERENCES client (id, tenant_id),
    CONSTRAINT client_message_session_owner FOREIGN KEY (session_id, client_id, tenant_id) REFERENCES scheduled_session (id, client_id, tenant_id),
    CONSTRAINT client_message_kind CHECK (kind IN ('note', 'recap', 'weekly')),
    CONSTRAINT client_message_body CHECK (btrim(body) <> '' AND char_length(body) <= 1000),
    CONSTRAINT client_message_recap CHECK ((kind = 'recap') = (session_id IS NOT NULL))
);
CREATE INDEX idx_client_message_client ON client_message (client_id, at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_client_message_tenant ON client_message (tenant_id);
CREATE UNIQUE INDEX uq_client_message_recap ON client_message (session_id) WHERE kind = 'recap' AND deleted_at IS NULL;

-- Something that happened on a day: stored, not derived, and fired once.
CREATE TABLE milestone (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    client_id uuid NOT NULL,
    kind varchar(20) NOT NULL,
    label text NOT NULL,
    value numeric,
    at timestamptz DEFAULT now() NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    CONSTRAINT milestone_pkey PRIMARY KEY (id),
    CONSTRAINT milestone_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id),
    CONSTRAINT milestone_client_id_fkey FOREIGN KEY (client_id) REFERENCES client (id),
    CONSTRAINT milestone_client_same_tenant FOREIGN KEY (client_id, tenant_id) REFERENCES client (id, tenant_id),
    CONSTRAINT milestone_label CHECK (btrim(label) <> '')
);
CREATE INDEX idx_milestone_client ON milestone (client_id, at DESC);
CREATE INDEX idx_milestone_tenant ON milestone (tenant_id);
CREATE UNIQUE INDEX uq_milestone_once ON milestone (client_id, kind, value);

COMMENT ON TABLE client_invite IS 'The invite a trainer sends so a client can open the portal; the only way a client gets an account. Only the token''s SHA-256 is stored.';
COMMENT ON TABLE push_subscription IS 'A browser''s permission to receive push, per person. Revoked, never deleted.';
COMMENT ON TABLE client_prefs IS 'The client''s own settings, one row per client row. No row means every switch is on. The trainer''s half never reads it.';
COMMENT ON TABLE client_notification IS 'The client''s notification bell and the delivery log of the session reminder. Written only by mint_client_notification().';
COMMENT ON TABLE workout_feedback IS 'How a workout felt, in the client''s own words. One row per session.';
COMMENT ON TABLE client_message IS 'A line from the trainer to one client, shown in the portal.';
COMMENT ON TABLE milestone IS 'Something that happened on a day, stored rather than derived, and fired once.';

-- ─── 3. triggers ─────────────────────────────────────────────────────────────

CREATE TRIGGER trg_client_invite_stamp_tenant BEFORE INSERT ON client_invite FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_client_invite_freeze_tenant BEFORE UPDATE ON client_invite FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_client_invite_updated_at BEFORE UPDATE ON client_invite FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_push_subscription_updated_at BEFORE UPDATE ON push_subscription FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_client_prefs_stamp_tenant BEFORE INSERT ON client_prefs FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_client_prefs_freeze_tenant BEFORE UPDATE ON client_prefs FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_client_prefs_updated_at BEFORE UPDATE ON client_prefs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_client_notification_stamp_tenant BEFORE INSERT ON client_notification FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_client_notification_freeze_tenant BEFORE UPDATE ON client_notification FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_client_notification_updated_at BEFORE UPDATE ON client_notification FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_workout_feedback_stamp_tenant BEFORE INSERT ON workout_feedback FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_workout_feedback_freeze_tenant BEFORE UPDATE ON workout_feedback FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_workout_feedback_updated_at BEFORE UPDATE ON workout_feedback FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_client_message_stamp_tenant BEFORE INSERT ON client_message FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_client_message_freeze_tenant BEFORE UPDATE ON client_message FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_client_message_updated_at BEFORE UPDATE ON client_message FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_milestone_stamp_tenant BEFORE INSERT ON milestone FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_milestone_freeze_tenant BEFORE UPDATE ON milestone FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();

-- A workout the client did alone can never charge a pack. Charging is service code
-- (SessionChargeService); this is the backstop. It applies to every role.
CREATE FUNCTION refuse_client_logged_charge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.kind = 'session' AND EXISTS (SELECT 1 FROM scheduled_session s WHERE s.id = NEW.session_id AND s.logged_by = 'client') THEN
        RAISE EXCEPTION 'a session the client logged alone cannot charge a package' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_package_adjustment_no_client_charge BEFORE INSERT ON package_adjustment
    FOR EACH ROW EXECUTE FUNCTION refuse_client_logged_charge();

-- The column guard. Row policies cannot limit columns and staff and clients share one role, so a
-- client's UPDATE is checked here: only the columns named in the trigger's arguments may change.
-- It applies to the request role only: a SECURITY DEFINER function runs as the owner and is
-- trusted with what it writes. Erasure is exempt, like the append-only guards.
CREATE FUNCTION guard_client_columns() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE changed text;
BEGIN
    IF current_user <> 'inclineyou_app' OR app_actor() <> 'client' OR app_erasing() THEN
        RETURN NEW;
    END IF;
    SELECT n.key INTO changed
    FROM jsonb_each(to_jsonb(NEW)) AS n(key, value)
    WHERE n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key)
      AND n.key <> ALL (TG_ARGV)
    LIMIT 1;
    IF changed IS NOT NULL THEN
        RAISE EXCEPTION 'a client may not change %.%', TG_TABLE_NAME, changed USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_client_client_guard BEFORE UPDATE ON client FOR EACH ROW EXECUTE FUNCTION guard_client_columns(
    'name', 'goal', 'height_cm', 'timezone', 'activity_level', 'last_portal_seen_at', 'removed_ack_at', 'updated_at');
CREATE TRIGGER trg_scheduled_session_client_guard BEFORE UPDATE ON scheduled_session FOR EACH ROW EXECUTE FUNCTION guard_client_columns(
    'workout_id', 'scheduled_at', 'duration_minutes', 'ends_at', 'status', 'started_at', 'ended_at', 'paused_seconds', 'updated_at');
CREATE TRIGGER trg_session_exercise_client_guard BEFORE UPDATE ON session_exercise FOR EACH ROW EXECUTE FUNCTION guard_client_columns(
    'exercise_id', 'position', 'source', 'swapped_from_exercise_id', 'swap_reason', 'swap_source', 'removed_at', 'notes', 'updated_at');
CREATE TRIGGER trg_set_log_client_guard BEFORE UPDATE ON set_log FOR EACH ROW EXECUTE FUNCTION guard_client_columns(
    'load_value', 'effort_value', 'rpe', 'notes', 'done_at', 'entered_by', 'updated_at');
CREATE TRIGGER trg_assessment_client_guard BEFORE UPDATE ON assessment FOR EACH ROW EXECUTE FUNCTION guard_client_columns(
    'readings', 'answers', 'completed_at', 'entered_by', 'updated_at');
CREATE TRIGGER trg_client_prefs_client_guard BEFORE UPDATE ON client_prefs FOR EACH ROW EXECUTE FUNCTION guard_client_columns(
    'hide_weight', 'notify_program_updated', 'notify_session_reminder', 'notify_trainer_note', 'notify_personal_best',
    'notify_pack_changed', 'notify_checkin', 'auto_rest_timer', 'channel_whatsapp', 'channel_push', 'whatsapp_opt_in_at',
    'nominee_name', 'nominee_phone', 'updated_at');
CREATE TRIGGER trg_workout_feedback_client_guard BEFORE UPDATE ON workout_feedback FOR EACH ROW EXECUTE FUNCTION guard_client_columns(
    'effort', 'note', 'at', 'updated_at');
CREATE TRIGGER trg_client_notification_client_guard BEFORE UPDATE ON client_notification FOR EACH ROW EXECUTE FUNCTION guard_client_columns(
    'read_at', 'updated_at');
CREATE TRIGGER trg_client_message_client_guard BEFORE UPDATE ON client_message FOR EACH ROW EXECUTE FUNCTION guard_client_columns(
    'read_at', 'updated_at');

-- ─── 4. row-level security: the staff tier on the new tables ────────────────

ALTER TABLE client_invite ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_notification ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestone ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_invite_tenant ON client_invite TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY client_notification_tenant ON client_notification TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY workout_feedback_tenant ON workout_feedback TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY client_message_tenant ON client_message TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
CREATE POLICY milestone_tenant ON milestone TO inclineyou_app
    USING (app_actor() = 'staff' AND tenant_id = ANY (app_tenant_ids()))
    WITH CHECK (app_actor() = 'staff' AND tenant_id = app_tenant_id());
-- client_prefs has no staff policy: the trainer's half never reads it.

-- ─── 5. row-level security: the client lens ─────────────────────────────────
-- Permissive, so each ORs with the staff tier: a client legitimately reads rows in a workspace they
-- are not a member of. app_client_ids() is set from the client's accepted rows at sign-in.

-- who the client is
CREATE POLICY client_client ON client FOR SELECT TO inclineyou_app
    USING (app_actor() = 'client' AND id = ANY (app_client_ids()));
CREATE POLICY client_client_update ON client FOR UPDATE TO inclineyou_app
    USING (app_actor() = 'client' AND id = ANY (app_client_ids()))
    WITH CHECK (app_actor() = 'client' AND id = ANY (app_client_ids()));

-- sessions: the trainer's, and the client's own self-run days
CREATE POLICY scheduled_session_client ON scheduled_session FOR SELECT TO inclineyou_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids()));
CREATE POLICY scheduled_session_client_insert ON scheduled_session FOR INSERT TO inclineyou_app
    WITH CHECK (app_actor() = 'client' AND client_id = ANY (app_client_ids()) AND logged_by = 'client'
        AND trainer_id = (SELECT c.trainer_id FROM client c WHERE c.id = client_id));
CREATE POLICY scheduled_session_client_update ON scheduled_session FOR UPDATE TO inclineyou_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids()) AND logged_by = 'client')
    WITH CHECK (app_actor() = 'client' AND client_id = ANY (app_client_ids()) AND logged_by = 'client');

CREATE POLICY session_exercise_client ON session_exercise FOR SELECT TO inclineyou_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids()));
CREATE POLICY session_exercise_client_insert ON session_exercise FOR INSERT TO inclineyou_app
    WITH CHECK (app_actor() = 'client' AND client_id = ANY (app_client_ids())
        AND EXISTS (SELECT 1 FROM scheduled_session s WHERE s.id = session_id AND s.logged_by = 'client'));
CREATE POLICY session_exercise_client_update ON session_exercise FOR UPDATE TO inclineyou_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids())
        AND EXISTS (SELECT 1 FROM scheduled_session s WHERE s.id = session_id AND s.logged_by = 'client'))
    WITH CHECK (app_actor() = 'client' AND client_id = ANY (app_client_ids())
        AND EXISTS (SELECT 1 FROM scheduled_session s WHERE s.id = session_id AND s.logged_by = 'client'));

-- set_log has no client_id, so it reaches the client through its exercise
CREATE POLICY set_log_client ON set_log FOR SELECT TO inclineyou_app
    USING (app_actor() = 'client' AND EXISTS (
        SELECT 1 FROM session_exercise se WHERE se.id = session_exercise_id AND se.client_id = ANY (app_client_ids())));
CREATE POLICY set_log_client_insert ON set_log FOR INSERT TO inclineyou_app
    WITH CHECK (app_actor() = 'client' AND entered_by = 'client' AND EXISTS (
        SELECT 1 FROM session_exercise se JOIN scheduled_session s ON s.id = se.session_id
        WHERE se.id = session_exercise_id AND se.client_id = ANY (app_client_ids()) AND s.logged_by = 'client'));
CREATE POLICY set_log_client_update ON set_log FOR UPDATE TO inclineyou_app
    USING (app_actor() = 'client' AND EXISTS (
        SELECT 1 FROM session_exercise se JOIN scheduled_session s ON s.id = se.session_id
        WHERE se.id = session_exercise_id AND se.client_id = ANY (app_client_ids()) AND s.logged_by = 'client'))
    WITH CHECK (app_actor() = 'client' AND entered_by = 'client' AND EXISTS (
        SELECT 1 FROM session_exercise se JOIN scheduled_session s ON s.id = se.session_id
        WHERE se.id = session_exercise_id AND se.client_id = ANY (app_client_ids()) AND s.logged_by = 'client'));

-- the plan
CREATE POLICY program_client ON program FOR SELECT TO inclineyou_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids()));
CREATE POLICY workout_client ON workout FOR SELECT TO inclineyou_app
    USING (app_actor() = 'client' AND EXISTS (SELECT 1 FROM program p WHERE p.id = program_id AND p.client_id = ANY (app_client_ids())));
CREATE POLICY workout_exercise_client ON workout_exercise FOR SELECT TO inclineyou_app
    USING (app_actor() = 'client' AND EXISTS (
        SELECT 1 FROM workout w JOIN program p ON p.id = w.program_id
        WHERE w.id = workout_id AND p.client_id = ANY (app_client_ids())));
CREATE POLICY workout_set_client ON workout_set FOR SELECT TO inclineyou_app
    USING (app_actor() = 'client' AND EXISTS (
        SELECT 1 FROM workout_exercise we JOIN workout w ON w.id = we.workout_id JOIN program p ON p.id = w.program_id
        WHERE we.id = workout_exercise_id AND p.client_id = ANY (app_client_ids())));
-- the library is already readable (exercise_catalogue_read); this opens only a trainer's own
-- exercise that the client's plan, or a swap in the client's sessions, uses
CREATE POLICY exercise_client ON exercise FOR SELECT TO inclineyou_app
    USING (app_actor() = 'client' AND tenant_id IS NOT NULL AND (
        EXISTS (SELECT 1 FROM workout_exercise we JOIN workout w ON w.id = we.workout_id JOIN program p ON p.id = w.program_id
                WHERE we.exercise_id = exercise.id AND p.client_id = ANY (app_client_ids()))
        OR EXISTS (SELECT 1 FROM session_exercise se WHERE se.exercise_id = exercise.id AND se.client_id = ANY (app_client_ids()))));

-- assessments the trainer has sent, and answering one
CREATE POLICY assessment_client ON assessment FOR SELECT TO inclineyou_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids()) AND sent_at IS NOT NULL AND deleted_at IS NULL);
CREATE POLICY assessment_client_answer ON assessment FOR UPDATE TO inclineyou_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids()) AND sent_at IS NOT NULL AND completed_at IS NULL)
    -- entered_by is NULL until the check-in is submitted (assessment_entered_by_on_completion), so a draft saved
    -- for later carries NULL and the submit sets 'client' together with completed_at; 'trainer' is never hers to write.
    WITH CHECK (app_actor() = 'client' AND client_id = ANY (app_client_ids()) AND (entered_by = 'client' OR entered_by IS NULL));

-- the money wall: the client's own, only when the trainer allows it (D-18)
CREATE FUNCTION client_can_see_money(p_client uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
    SELECT COALESCE(c.portal_show_money, t.clients_see_money, false)
    FROM client c JOIN trainer t ON t.id = c.trainer_id
    WHERE c.id = p_client
$$;
CREATE POLICY package_client ON package FOR SELECT TO inclineyou_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids()) AND client_can_see_money(client_id));
CREATE POLICY package_adjustment_client ON package_adjustment FOR SELECT TO inclineyou_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids()) AND client_can_see_money(client_id));
CREATE POLICY payment_client ON payment FOR SELECT TO inclineyou_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids()) AND client_can_see_money(client_id));

-- the trainer's side of the conversation, and the client's own settings
CREATE POLICY client_note_shared_read ON client_note FOR SELECT TO inclineyou_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids()) AND shared_with_client AND deleted_at IS NULL);
CREATE POLICY client_prefs_client ON client_prefs TO inclineyou_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids()))
    WITH CHECK (app_actor() = 'client' AND client_id = ANY (app_client_ids()));
CREATE POLICY client_notification_client ON client_notification FOR SELECT TO inclineyou_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids()) AND deleted_at IS NULL);
CREATE POLICY client_notification_client_read ON client_notification FOR UPDATE TO inclineyou_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids()))
    WITH CHECK (app_actor() = 'client' AND client_id = ANY (app_client_ids()));
CREATE POLICY workout_feedback_client ON workout_feedback TO inclineyou_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids()))
    WITH CHECK (app_actor() = 'client' AND client_id = ANY (app_client_ids()));
CREATE POLICY client_message_client ON client_message FOR SELECT TO inclineyou_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids()) AND deleted_at IS NULL);
CREATE POLICY client_message_client_read ON client_message FOR UPDATE TO inclineyou_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids()))
    WITH CHECK (app_actor() = 'client' AND client_id = ANY (app_client_ids()));
CREATE POLICY milestone_client ON milestone FOR SELECT TO inclineyou_app
    USING (app_actor() = 'client' AND client_id = ANY (app_client_ids()) AND deleted_at IS NULL);

-- ─── 6. functions ────────────────────────────────────────────────────────────

-- What an invite page shows before anyone has a session. Read-only: opening a link changes nothing,
-- because WhatsApp fetches the links it shows. A token that does not exist, has expired or was
-- revoked all answer 'expired', so a guess teaches nothing.
CREATE FUNCTION invite_card(p_token_hash varchar) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE inv client_invite%ROWTYPE; tr record;
BEGIN
    SELECT * INTO inv FROM client_invite WHERE token_hash = p_token_hash;
    IF NOT FOUND OR inv.status IN ('declined', 'revoked') OR (inv.status = 'pending' AND inv.expires_at <= now()) THEN
        RETURN jsonb_build_object('state', 'expired');
    END IF;
    IF inv.status = 'accepted' THEN
        RETURN jsonb_build_object('state', 'used');
    END IF;
    SELECT t.name, b.headline, b.bio, b.intro_video_url, b.certifications, b.specialities, b.languages,
           b.instagram_url, b.youtube_url
      INTO tr
      FROM trainer t LEFT JOIN trainer_business b ON b.trainer_id = t.id
     WHERE t.id = inv.trainer_id;
    RETURN jsonb_build_object(
        'state', 'valid', 'invite_id', inv.id,
        'phone_masked', repeat('•', 5) || right(inv.phone, 4),
        'trainer', jsonb_build_object('name', tr.name, 'headline', tr.headline, 'bio', tr.bio, 'intro_video_url', tr.intro_video_url,
                                      'certifications', tr.certifications, 'specialities', tr.specialities, 'languages', tr.languages,
                                      'instagram_url', tr.instagram_url, 'youtube_url', tr.youtube_url));
END $$;

-- The same card for a number that has already proved itself and so holds no token: the D-16 path (the login page
-- found a pending invite for the number) and a client invited by a second trainer. A row that is not for the
-- signed-in number answers 'expired', exactly like an unknown id, so an id teaches nothing.
CREATE FUNCTION invite_card_by_id(p_invite uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE inv client_invite%ROWTYPE;
BEGIN
    SELECT * INTO inv FROM client_invite WHERE id = p_invite;
    IF NOT FOUND OR (session_user = 'inclineyou_app' AND app_actor() <> 'system' AND inv.phone IS DISTINCT FROM app_phone()) THEN
        RETURN jsonb_build_object('state', 'expired');
    END IF;
    RETURN invite_card(inv.token_hash);
END $$;

-- Note on identity checks in the functions below: they are SECURITY DEFINER, so inside them current_user is
-- the function's owner and never the caller. The request role is recognised by session_user, which
-- is the login the connection was made with.

-- The login page's D-16 lookup: the unexpired pending invites for a number the caller has proved.
CREATE FUNCTION pending_invites_for_phone(p_phone text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
BEGIN
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system' AND p_phone IS DISTINCT FROM app_phone() THEN
        RAISE EXCEPTION 'invites can be listed only for the number that signed in' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object('invite_id', i.id, 'trainer_name', t.name, 'headline', b.headline) ORDER BY i.created_at)
          FROM client_invite i
          JOIN trainer t ON t.id = i.trainer_id
          LEFT JOIN trainer_business b ON b.trainer_id = t.id
         WHERE i.phone = p_phone AND i.status = 'pending' AND i.expires_at > now()), '[]'::jsonb);
END $$;

-- "Let me in": one transaction, idempotent. The caller has already proved the number with a code, so
-- the function checks that the signed-in number is the number on the invite. Under 18 ends the
-- invite; a number that already belongs to a trainer cannot become a client (one number, one role).
CREATE FUNCTION accept_client_invite(p_invite uuid, p_date_of_birth date, p_policy_version varchar) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE inv client_invite%ROWTYPE; c client%ROWTYPE; au app_user%ROWTYPE; t trainer%ROWTYPE;
BEGIN
    SELECT * INTO inv FROM client_invite WHERE id = p_invite FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('result', 'expired'); END IF;
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system' AND inv.phone IS DISTINCT FROM app_phone() THEN
        RAISE EXCEPTION 'an invite can be accepted only by the number it was sent to' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF inv.status = 'accepted' THEN
        RETURN jsonb_build_object('result', 'accepted', 'client_id', inv.client_id);
    END IF;
    IF inv.status <> 'pending' OR inv.expires_at <= now() THEN RETURN jsonb_build_object('result', 'expired'); END IF;
    IF p_date_of_birth IS NULL OR p_policy_version IS NULL THEN
        RAISE EXCEPTION 'a date of birth and the notice version are required' USING ERRCODE = 'invalid_parameter_value';
    END IF;

    SELECT * INTO c FROM client WHERE id = inv.client_id FOR UPDATE;
    IF c.phone IS DISTINCT FROM inv.phone OR c.erased_at IS NOT NULL OR c.deleted_at IS NOT NULL THEN
        UPDATE client_invite SET status = 'revoked', revoked_at = now(),
               revoked_reason = CASE WHEN c.erased_at IS NOT NULL THEN 'erased' ELSE 'number_changed' END
         WHERE id = inv.id;
        RETURN jsonb_build_object('result', 'expired');
    END IF;

    -- adults only (decided 25 Sep 2026): the invite ends, and the trainer is told only that the age requirement was not met
    IF p_date_of_birth > (current_date - interval '18 years')::date OR p_date_of_birth < DATE '1900-01-01' THEN
        UPDATE client_invite SET status = 'declined', declined_at = now(), decline_reason = 'age_requirement' WHERE id = inv.id;
        UPDATE client SET membership_status = 'declined', declined_at = now() WHERE id = c.id;
        RETURN jsonb_build_object('result', 'age_requirement');
    END IF;

    SELECT * INTO au FROM app_user WHERE phone = inv.phone;
    IF FOUND AND (au.role <> 'client' OR au.deleted_at IS NOT NULL) THEN
        RETURN jsonb_build_object('result', 'unavailable');
    END IF;
    IF NOT FOUND THEN
        INSERT INTO app_user (phone, role, privacy_accepted_at, privacy_policy_version)
        VALUES (inv.phone, 'client', now(), p_policy_version) RETURNING * INTO au;
    ELSIF au.privacy_policy_version IS DISTINCT FROM p_policy_version THEN
        UPDATE app_user SET privacy_accepted_at = now(), privacy_policy_version = p_policy_version WHERE id = au.id;
    END IF;

    UPDATE client SET date_of_birth = p_date_of_birth, membership_status = 'accepted', accepted_at = now(),
                      accepted_policy_version = p_policy_version, declined_at = NULL
     WHERE id = c.id;
    SELECT * INTO t FROM trainer WHERE id = c.trainer_id;
    INSERT INTO client_prefs (client_id, tenant_id, whatsapp_opt_in_at)
    VALUES (c.id, c.tenant_id, CASE WHEN t.session_reminders THEN now() END)
    ON CONFLICT (client_id) DO UPDATE
        SET whatsapp_opt_in_at = COALESCE(client_prefs.whatsapp_opt_in_at, EXCLUDED.whatsapp_opt_in_at), deleted_at = NULL;
    UPDATE client_invite SET status = 'accepted', accepted_at = now(), policy_version = p_policy_version WHERE id = inv.id;
    RETURN jsonb_build_object('result', 'accepted', 'client_id', c.id, 'app_user_id', au.id);
END $$;

-- "Leave this trainer": the client ends the arrangement. Their history was offered for download first
-- (in the app); retained rows follow the erasure rules. Pending invites on the row are revoked.
CREATE FUNCTION client_leave_trainer(p_client uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
BEGIN
    IF session_user = 'inclineyou_app' AND NOT (app_actor() = 'client' AND p_client = ANY (app_client_ids())) THEN
        RAISE EXCEPTION 'client % is not yours to leave', p_client USING ERRCODE = 'insufficient_privilege';
    END IF;
    UPDATE client SET membership_status = 'removed', removed_at = now(), removed_by = 'client'
     WHERE id = p_client AND membership_status = 'accepted';
    UPDATE client_invite SET status = 'revoked', revoked_at = now(), revoked_reason = 'client_removed'
     WHERE client_id = p_client AND status = 'pending';
END $$;

-- A client's packages without a single amount. package_client is gated by the trainer's money switch, and a row
-- policy cannot hide a column, so "show the sessions left, hide the price" cannot be a policy on the table. This
-- returns only what is not money — sessions, dates, status — for the client's own row, whatever the switch says.
-- package_adjustment stays gated: its history is the ledger, and the portal omits it when money is off.
CREATE FUNCTION client_package_balance(p_client uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
BEGIN
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system'
       AND NOT (app_actor() = 'client' AND p_client = ANY (app_client_ids())) THEN
        RAISE EXCEPTION 'packages can be read only for your own rows' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                   'id', p.id, 'name', p.name, 'status', p.status, 'basis', p.basis,
                   'sessions_total', p.sessions_total, 'sessions_left', p.sessions_remaining,
                   'starts_on', p.start_date, 'ends_on', p.end_date,
                   'paused', p.paused_at IS NOT NULL, 'closed_at', p.closed_at)
               ORDER BY (p.status = 'active') DESC, p.created_at DESC)
          FROM (SELECT * FROM package WHERE client_id = p_client AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 20) p
    ), '[]'::jsonb);
END $$;

-- The one writer of client_notification. It checks the client's own switch for the kind, and for a
-- session reminder also the trainer's switch, the client's exclusion and the WhatsApp opt-in, and
-- writes the row (or a 'skipped' row that says why). Idempotent on the session. Never called by a client.
CREATE FUNCTION mint_client_notification(p_client uuid, p_kind varchar, p_text varchar,
                                         p_session uuid DEFAULT NULL, p_subject_at timestamptz DEFAULT NULL,
                                         p_amount numeric DEFAULT NULL, p_send_after timestamptz DEFAULT NULL) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE c client%ROWTYPE; p client_prefs%ROWTYPE; t trainer%ROWTYPE; gate boolean; skip text; new_id uuid;
BEGIN
    IF session_user = 'inclineyou_app' AND app_actor() = 'client' THEN
        RAISE EXCEPTION 'a notification is written for a client, never by one' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT * INTO c FROM client WHERE id = p_client AND membership_status = 'accepted' AND erased_at IS NULL AND deleted_at IS NULL;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO p FROM client_prefs WHERE client_id = p_client AND deleted_at IS NULL;   -- no row = every switch on
    gate := CASE p_kind
        WHEN 'plan'     THEN COALESCE(p.notify_program_updated, true)
        WHEN 'session'  THEN COALESCE(p.notify_session_reminder, true)
        WHEN 'reminder' THEN COALESCE(p.notify_session_reminder, true)
        WHEN 'note'     THEN COALESCE(p.notify_trainer_note, true)
        WHEN 'best'     THEN COALESCE(p.notify_personal_best, true)
        WHEN 'pack'     THEN COALESCE(p.notify_pack_changed, true)
        WHEN 'checkin'  THEN COALESCE(p.notify_checkin, true)
        ELSE false END;
    IF NOT gate THEN RETURN NULL; END IF;

    IF p_kind <> 'reminder' THEN
        INSERT INTO client_notification (tenant_id, client_id, kind, amount, subject_at, text, session_id)
        VALUES (c.tenant_id, p_client, p_kind, p_amount, p_subject_at, p_text, p_session) RETURNING id INTO new_id;
        RETURN new_id;
    END IF;

    SELECT * INTO t FROM trainer WHERE id = c.trainer_id;
    skip := CASE WHEN NOT t.session_reminders THEN 'trainer_off'
                 WHEN c.reminders_excluded THEN 'client_excluded'
                 WHEN NOT COALESCE(p.channel_whatsapp, true) THEN 'client_opt_out'
                 WHEN p.whatsapp_opt_in_at IS NULL THEN 'no_opt_in' END;
    INSERT INTO client_notification (tenant_id, client_id, kind, subject_at, text, session_id, send_after, whatsapp_status, whatsapp_skip_reason)
    VALUES (c.tenant_id, p_client, 'reminder', p_subject_at, p_text, p_session, p_send_after,
            CASE WHEN skip IS NULL THEN 'queued' ELSE 'skipped' END, skip)
    ON CONFLICT (session_id) WHERE kind = 'reminder' AND whatsapp_status <> 'skipped' AND deleted_at IS NULL DO NOTHING
    RETURNING id INTO new_id;
    IF new_id IS NULL THEN
        SELECT id INTO new_id FROM client_notification
         WHERE session_id = p_session AND kind = 'reminder' AND whatsapp_status <> 'skipped' AND deleted_at IS NULL;
    END IF;
    RETURN new_id;
END $$;

-- ─── 7. erasure and purge, extended in place ─────────────────────────────────
-- The three functions below are V1's, unchanged except for the lines marked V11 (and one security fix in erase_account).

CREATE OR REPLACE FUNCTION erase_clients(ids uuid[], p_requested_by text, p_parent uuid DEFAULT NULL) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE n integer;
BEGIN
    PERFORM set_config('inclineyou.erasing', 'on', true);
    ids := ARRAY(SELECT id FROM client WHERE id = ANY(ids) AND erased_at IS NULL);

    -- V11: the portal's own rows. Personal from end to end (a message, a feedback note, a number on an
    -- invite, a nominee), and they point at the sessions deleted below, so they go first.
    DELETE FROM client_message      WHERE client_id = ANY(ids);
    DELETE FROM client_notification WHERE client_id = ANY(ids);
    DELETE FROM workout_feedback    WHERE client_id = ANY(ids);
    DELETE FROM milestone           WHERE client_id = ANY(ids);
    DELETE FROM client_prefs        WHERE client_id = ANY(ids);
    DELETE FROM client_invite       WHERE client_id = ANY(ids);

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

CREATE OR REPLACE FUNCTION erase_account(p_app_user uuid, p_requested_by text DEFAULT 'self') RETURNS uuid
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
    -- V11 fix: this was `current_user`, which inside a SECURITY DEFINER function is the owner, so the
    -- check never fired and any request could erase any account. session_user is the login role.
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system' AND person.phone IS DISTINCT FROM app_phone() THEN
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
    -- V11: a browser belongs to a person, so its push permission is revoked with the account
    UPDATE push_subscription SET revoked_at = now(), revoked_reason = 'erased' WHERE app_user_id = person.id AND revoked_at IS NULL;
    UPDATE app_user SET phone = NULL, erased_at = now(), deleted_at = COALESCE(deleted_at, now()) WHERE id = person.id;
    UPDATE erasure_log SET completed_at = now() WHERE id = log_id;

    PERFORM set_config('inclineyou.erasing', 'off', true);
    RETURN log_id;
END $$;

CREATE OR REPLACE FUNCTION purge_closed_tenants() RETURNS integer
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
        FOREACH tbl IN ARRAY ARRAY['workout_feedback', 'client_message', 'client_notification', 'milestone', 'client_prefs', 'client_invite',  -- V11
                                   'set_log', 'session_exercise', 'nudge_log', 'package_adjustment', 'payment',
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

-- ─── 8. what the request role may touch ──────────────────────────────────────
-- SELECT, INSERT, UPDATE on every new table; no DELETE: rows are tombstoned, revoked or erased by the
-- definer functions. client_prefs, client_notification and milestone are written by the same role
-- under the policies above.
DO $$
BEGIN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON client_invite, push_subscription, client_prefs, client_notification,
                                             workout_feedback, client_message, milestone TO inclineyou_app';
    EXECUTE 'REVOKE ALL ON FUNCTION invite_card(varchar), invite_card_by_id(uuid), client_package_balance(uuid), pending_invites_for_phone(text),
                                    accept_client_invite(uuid, date, varchar), client_leave_trainer(uuid),
                                    mint_client_notification(uuid, varchar, varchar, uuid, timestamptz, numeric, timestamptz),
                                    client_can_see_money(uuid) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION invite_card(varchar), invite_card_by_id(uuid), client_package_balance(uuid), pending_invites_for_phone(text),
                                       accept_client_invite(uuid, date, varchar), client_leave_trainer(uuid),
                                       mint_client_notification(uuid, varchar, varchar, uuid, timestamptz, numeric, timestamptz),
                                       client_can_see_money(uuid) TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;
