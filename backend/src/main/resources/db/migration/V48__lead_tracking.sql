-- V48 — following up a prospect (23 Nov 2026, the owner's call).
--
-- A prospect was a status and a demo checklist, and nothing else: where they came from, what they asked about, when to
-- ring them back and what they said last time lived in the trainer's head or a notebook. Decided with the owner:
--
--   · FOUR FIELDS ON THE CLIENT, kept after they become a client, because the source → client funnel is read from them:
--       lead_source         where they came from — walk_in · referral · instagram · whatsapp · phone_call · google ·
--                           join_link · gym_desk · other. A picklist, so it can be counted; join_link is set by approval.
--       lead_source_detail  the words a picklist cannot hold ("referred by Kavya", "Gold's front desk"), 80 characters.
--       interested_pack_id  the pack on the trainer's own price list they asked about. Not a sale; nothing charges.
--       next_follow_up_on   the day to get back to them. A COLUMN, not derived from the log, so Today and the roster
--                           read it in the one roster query (the same argument as next_assessment_on).
--   · lead_contact: one row per time the trainer reached them — channel (call · whatsapp · in_person), an outcome from a
--     fixed list, a short "what they said" (280), and the follow-up date that contact set. Four outcomes close the lead
--     (too_expensive · went_elsewhere · timing_location · not_interested) and double as its lost reason. Soft-deleted,
--     for the Undo, which puts the follow-up date back to what it was (previous_follow_up_on).
--   · BEFORE CONSENT, ALLOWED. The owner's call: a contact log is the business record, like the number, the bookings and
--     the money book — not the trainer's notes, which ConsentGate still locks. The person contacted the trainer
--     themselves; the note is short and the screen says it is about the enquiry, not health.
--   · Archiving gains two reasons a prospect ends on: not_interested and no_response.
--
-- Personal like everything else on a client:
--   · erase scrubs it. Following V43, a BEFORE UPDATE OF erased_at trigger rather than a rewrite of erase_clients(): it
--     clears lead_source_detail, interested_pack_id and next_follow_up_on and deletes the client's lead_contact rows
--     (the source itself is a category and stays on the nameless tombstone). client_erased_lead holds it there.
--   · the workspace purge deletes client rows; lead_contact.client_id cascades, so it needs no change either.
--   · the trainer's soft delete clears the three (ClientJdbcRepository.delete, in Java).
--   · the client's own download (client_export, V43's replaced in place) carries the source and every contact's
--     channel, outcome and dates — never the trainer's typed note, as V38 leaves out a trainer's notes on sets.
--
-- Backend + web only, like V30 and V32–V47: nothing enters sync.

-- ─── 1. the client's four fields ─────────────────────────────────────────────

ALTER TABLE client ADD COLUMN lead_source varchar(16);
ALTER TABLE client ADD COLUMN lead_source_detail varchar(80);
ALTER TABLE client ADD COLUMN interested_pack_id uuid;
ALTER TABLE client ADD COLUMN next_follow_up_on date;

ALTER TABLE client ADD CONSTRAINT client_lead_source CHECK (lead_source IS NULL OR lead_source IN
    ('walk_in', 'referral', 'instagram', 'whatsapp', 'phone_call', 'google', 'join_link', 'gym_desk', 'other'));
ALTER TABLE client ADD CONSTRAINT client_lead_source_detail CHECK (lead_source_detail IS NULL OR btrim(lead_source_detail) <> '');
ALTER TABLE client ADD CONSTRAINT client_interested_pack_fkey FOREIGN KEY (interested_pack_id) REFERENCES pack (id) ON DELETE SET NULL;

-- The follow-ups due, for Today and the roster's sort: small, since most clients have none.
CREATE INDEX idx_client_follow_up ON client (trainer_id, next_follow_up_on) WHERE next_follow_up_on IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN client.lead_source IS 'V48: where they came from. walk_in · referral · instagram · whatsapp · phone_call · google · join_link · gym_desk · other.';
COMMENT ON COLUMN client.lead_source_detail IS 'V48: the words the source picklist cannot hold ("referred by Kavya").';
COMMENT ON COLUMN client.interested_pack_id IS 'V48: the pack on the trainer''s price list they asked about. Interest, not a sale.';
COMMENT ON COLUMN client.next_follow_up_on IS 'V48: the day to get back to them. Set by a lead_contact or by hand; cleared by a closing outcome.';

-- ─── 2. archiving: two reasons a prospect ends on ────────────────────────────

ALTER TABLE client DROP CONSTRAINT client_archive_reason;
ALTER TABLE client ADD CONSTRAINT client_archive_reason CHECK (archive_reason IS NULL OR archive_reason IN
    ('goal_reached', 'moved_away', 'cost', 'no_time', 'switched_trainer', 'other', 'not_interested', 'no_response'));

-- ─── 3. the contact log ──────────────────────────────────────────────────────

CREATE TABLE lead_contact (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    client_id uuid NOT NULL,
    trainer_id uuid NOT NULL,
    channel varchar(12) NOT NULL,
    outcome varchar(16) NOT NULL,
    note varchar(280),
    follow_up_on date,
    previous_follow_up_on date,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    CONSTRAINT lead_contact_pkey PRIMARY KEY (id),
    CONSTRAINT lead_contact_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id),
    CONSTRAINT lead_contact_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id),
    CONSTRAINT lead_contact_client_same_tenant FOREIGN KEY (client_id, tenant_id) REFERENCES client (id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT lead_contact_channel CHECK (channel IN ('call', 'whatsapp', 'in_person')),
    CONSTRAINT lead_contact_outcome CHECK (outcome IN ('interested', 'wants_trial', 'sent_price', 'call_back', 'no_answer',
        'too_expensive', 'went_elsewhere', 'timing_location', 'not_interested')),
    CONSTRAINT lead_contact_note CHECK (note IS NULL OR btrim(note) <> ''),
    -- a closing outcome ends the follow-ups; it cannot also set the next one
    CONSTRAINT lead_contact_closing CHECK (follow_up_on IS NULL
        OR outcome NOT IN ('too_expensive', 'went_elsewhere', 'timing_location', 'not_interested'))
);
CREATE INDEX idx_lead_contact_client ON lead_contact (client_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_lead_contact_tenant_trainer ON lead_contact (tenant_id, trainer_id);

CREATE TRIGGER trg_lead_contact_stamp_tenant BEFORE INSERT ON lead_contact FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_lead_contact_freeze_tenant BEFORE UPDATE ON lead_contact FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_lead_contact_updated_at BEFORE UPDATE ON lead_contact FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE lead_contact IS 'V48: each time a trainer reached a prospect (or any client) — channel, outcome, what they said, the follow-up it set. Staff tier; no client policy.';

-- Staff tier, the same as client_note: the active workspace's rows. No client policy — a client never reads it except
-- through client_export(), which leaves out the note.
ALTER TABLE lead_contact ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    EXECUTE 'CREATE POLICY lead_contact_tenant ON lead_contact TO inclineyou_app
        USING (app_actor() = ''staff'' AND tenant_id = app_tenant_id())
        WITH CHECK (app_actor() = ''staff'' AND tenant_id = app_tenant_id())';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON lead_contact TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — policies and grants skipped';
END $$;

-- ─── 4. erasure ──────────────────────────────────────────────────────────────

CREATE FUNCTION scrub_erased_client_lead() RETURNS trigger
    LANGUAGE plpgsql SET search_path TO public, pg_catalog AS $$
BEGIN
    IF NEW.erased_at IS NOT NULL AND OLD.erased_at IS NULL THEN
        NEW.lead_source_detail := NULL;
        NEW.interested_pack_id := NULL;
        NEW.next_follow_up_on := NULL;
        DELETE FROM lead_contact WHERE client_id = NEW.id;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_client_scrub_erased_lead BEFORE UPDATE OF erased_at ON client
    FOR EACH ROW EXECUTE FUNCTION scrub_erased_client_lead();

ALTER TABLE client ADD CONSTRAINT client_erased_lead CHECK (erased_at IS NULL
    OR (lead_source_detail IS NULL AND interested_pack_id IS NULL AND next_follow_up_on IS NULL));

-- ─── 5. the client's own download ────────────────────────────────────────────
-- V43's client_export(), replaced in place: 'lead_source' on each arrangement and a 'contacts' list (channel, outcome,
-- when, the follow-up it set — never the note). Same signature, so the V25 grants stand.

CREATE OR REPLACE FUNCTION client_export(p_phone text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE ids uuid[]; money uuid[];
BEGIN
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system' AND p_phone IS DISTINCT FROM app_phone() THEN
        RAISE EXCEPTION 'a download can be made only for the number that signed in' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO ids FROM client WHERE phone = p_phone AND erased_at IS NULL AND membership_status IN ('accepted', 'paused', 'removed');
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO money FROM client WHERE id = ANY (ids) AND client_can_see_money(id);

    RETURN jsonb_build_object(
        'exported_at', now(),
        'arrangements', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'trainer', t.name, 'name', c.name, 'phone', c.phone, 'date_of_birth', c.date_of_birth, 'goal', c.goal, 'height_cm', c.height_cm,
                'activity_level', c.activity_level, 'gender', c.gender, 'lead_source', c.lead_source, 'timezone', c.timezone, 'status', c.membership_status, 'accepted_at', c.accepted_at,
                'removed_at', c.removed_at, 'removed_by', c.removed_by) ORDER BY c.created_at)
              FROM client c JOIN trainer t ON t.id = c.trainer_id WHERE c.id = ANY (ids)), '[]'::jsonb),
        'programs', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', p.name, 'status', p.status, 'weeks', p.weeks, 'start_date', p.start_date, 'end_date', p.end_date,
                'workouts', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', w.name, 'week', w.week, 'day', w.day,
                    'exercises', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', e.name, 'cue', we.notes,
                        'sets', COALESCE((SELECT jsonb_agg(jsonb_build_object('position', ws.position, 'load_kind', ws.load_kind, 'load', ws.load_value,
                                'effort_kind', ws.effort_kind, 'effort', ws.effort_value, 'rest_seconds', ws.rest_seconds) ORDER BY ws.position)
                              FROM workout_set ws WHERE ws.workout_exercise_id = we.id), '[]'::jsonb)) ORDER BY we.position)
                      FROM workout_exercise we JOIN exercise e ON e.id = we.exercise_id WHERE we.workout_id = w.id AND we.alternative_of IS NULL), '[]'::jsonb))
                    ORDER BY w.week, w.day, w.position)
                  FROM workout w WHERE w.program_id = p.id AND w.deleted_at IS NULL), '[]'::jsonb)) ORDER BY p.created_at)
              FROM program p WHERE p.client_id = ANY (ids) AND p.deleted_at IS NULL), '[]'::jsonb),
        'sessions', COALESCE((SELECT jsonb_agg(jsonb_build_object('at', s.scheduled_at, 'status', s.status, 'logged_by', s.logged_by, 'started_at', s.started_at, 'ended_at', s.ended_at,
                'paused_seconds', s.paused_seconds, 'workout', w.name,
                'exercises', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', e.name, 'swapped_from', sf.name, 'removed', se.removed_at IS NOT NULL,
                    'sets', COALESCE((SELECT jsonb_agg(jsonb_build_object('position', sl.position, 'planned', sl.planned, 'load_kind', sl.load_kind, 'load', sl.load_value,
                            'effort_kind', sl.effort_kind, 'effort', sl.effort_value, 'rpe', sl.rpe, 'notes', CASE WHEN s.logged_by = 'client' THEN sl.notes END, 'done_at', sl.done_at, 'entered_by', sl.entered_by)
                            ORDER BY sl.position) FROM set_log sl WHERE sl.session_exercise_id = se.id), '[]'::jsonb)) ORDER BY se.position)
                  FROM session_exercise se JOIN exercise e ON e.id = se.exercise_id LEFT JOIN exercise sf ON sf.id = se.swapped_from_exercise_id
                 WHERE se.session_id = s.id), '[]'::jsonb)) ORDER BY s.scheduled_at)
              FROM scheduled_session s LEFT JOIN workout w ON w.id = s.workout_id
             WHERE s.client_id = ANY (ids) AND s.deleted_at IS NULL AND s.status IN ('scheduled', 'done')
               AND (s.logged_by = 'trainer' OR s.status = 'done' OR EXISTS (SELECT 1 FROM session_exercise x JOIN set_log y ON y.session_exercise_id = x.id WHERE x.session_id = s.id AND y.done_at IS NOT NULL))), '[]'::jsonb),
        'feedback', COALESCE((SELECT jsonb_agg(jsonb_build_object('session_at', s.scheduled_at, 'effort', f.effort, 'note', f.note, 'at', f.at) ORDER BY f.at)
              FROM workout_feedback f JOIN scheduled_session s ON s.id = f.session_id WHERE f.client_id = ANY (ids) AND f.deleted_at IS NULL), '[]'::jsonb),
        'assessments', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', a.name, 'due_on', a.due_on, 'sent_at', a.sent_at, 'completed_at', a.completed_at, 'entered_by', a.entered_by,
                'readings', a.readings, 'answers', a.answers, 'asked', a.form) ORDER BY a.created_at)
              FROM assessment a WHERE a.client_id = ANY (ids) AND a.deleted_at IS NULL), '[]'::jsonb),
        'messages', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', m.kind, 'body', m.body, 'at', m.at, 'read_at', m.read_at) ORDER BY m.at)
              FROM client_message m WHERE m.client_id = ANY (ids) AND m.deleted_at IS NULL), '[]'::jsonb),
        'shared_notes', COALESCE((SELECT jsonb_agg(jsonb_build_object('text', n.body, 'shared_at', n.shared_at, 'created_at', n.created_at) ORDER BY n.created_at)
              FROM client_note n WHERE n.client_id = ANY (ids) AND n.shared_with_client AND n.deleted_at IS NULL), '[]'::jsonb),
        'notices', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', x.kind, 'text', x.text, 'at', x.at, 'read_at', x.read_at) ORDER BY x.at)
              FROM client_notification x WHERE x.client_id = ANY (ids) AND x.deleted_at IS NULL), '[]'::jsonb),
        'milestones', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', ms.kind, 'label', ms.label, 'at', ms.at) ORDER BY ms.at)
              FROM milestone ms WHERE ms.client_id = ANY (ids) AND ms.deleted_at IS NULL), '[]'::jsonb),
        'preferences', COALESCE((SELECT jsonb_agg(to_jsonb(cp) - 'client_id' - 'tenant_id' - 'created_at' - 'updated_at' - 'deleted_at') FROM client_prefs cp WHERE cp.client_id = ANY (ids) AND cp.deleted_at IS NULL), '[]'::jsonb),
        'contacts', COALESCE((SELECT jsonb_agg(jsonb_build_object('channel', lc.channel, 'outcome', lc.outcome, 'at', lc.created_at,
                'follow_up_on', lc.follow_up_on) ORDER BY lc.created_at)
              FROM lead_contact lc WHERE lc.client_id = ANY (ids) AND lc.deleted_at IS NULL), '[]'::jsonb),
        'packages', CASE WHEN cardinality(money) = 0 THEN NULL ELSE COALESCE((SELECT jsonb_agg(jsonb_build_object('name', k.name, 'status', k.status, 'sessions_total', k.sessions_total,
                'sessions_left', k.sessions_remaining, 'amount', k.amount, 'currency', k.currency, 'start_date', k.start_date, 'end_date', k.end_date) ORDER BY k.created_at)
              FROM package k WHERE k.client_id = ANY (money) AND k.deleted_at IS NULL), '[]'::jsonb) END,
        'payments', CASE WHEN cardinality(money) = 0 THEN NULL ELSE COALESCE((SELECT jsonb_agg(jsonb_build_object('paid_at', y.paid_at, 'amount', y.amount, 'currency', y.currency,
                'method', y.method, 'reference', y.reference, 'status', y.status, 'package', k.name) ORDER BY y.paid_at NULLS LAST, y.created_at)
              FROM payment y JOIN package k ON k.id = y.package_id WHERE y.client_id = ANY (money) AND y.deleted_at IS NULL), '[]'::jsonb) END);
END $$;
