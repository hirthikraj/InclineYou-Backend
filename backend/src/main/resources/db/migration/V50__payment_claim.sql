-- V50 — "I've paid": the client says so, the trainer confirms (23 Nov 2026, the owner's call).
--
-- release/business-module-plan.html. A client pays by UPI (or at the gym's desk) outside InclineYou, and until now nothing came
-- back: the trainer had to notice the money and record it. Decided with the owner:
--
--   · THE CLIENT REPORTS, THE TRAINER CONFIRMS. A payment_claim is the client's "I've paid" — amount, the day, the UPI
--     reference (UTR) if they have it, a note. It changes nothing owed. The trainer confirms it (which records an ordinary
--     payment through the existing record path — one way money enters the book) or says it has not arrived.
--   · THE UTR IS OPTIONAL FOR BOTH. The client may give it; the trainer may keep, change or add it at confirm.
--   · PART PAYMENTS ARE ALLOWED, AND THE OWNER CAN TURN THEM OFF: tenant_business.part_payments (default on). Off, a claim
--     against a pack must be for the whole of what is left on it.
--   · A CLAIM NEED NOT NAME A PACK. Indian clients often pay first ("sent ₹5,000, start me Monday"); such a claim is against the
--     client, and confirming it is where the trainer sells the pack it pays for. The book never holds loose credit.
--   · GYM CLIENTS PAY THE GYM. collector is stamped from the client's type: a gym client's claim means "I paid at the gym",
--     the trainer confirms that the gym has it, and the payment is the gym-collected kind (no method, no reference — the UTR,
--     if any, stays on the claim). client_pay_to() therefore answers nothing for a gym client: the trainer's UPI ID is never
--     offered for money owed to the gym.
--
-- How a client writes: NO insert or update policy. Two SECURITY DEFINER doors are the only way —
--   client_claim_payment()          makes one, after checking the lens, the money switch, the pack, what is left on it
--                                   (less any other open claim on it) and the part-payment switch;
--   client_withdraw_payment_claim() takes back one of the caller's own OPEN claims.
-- and client_pay_terms() tells the portal the switch, who collects and the gym's name; client_receipt() answers a receipt for
-- one of the caller's own collected payments, with the workspace's business on it (the client cannot read tenant_business). The same shape as
-- start_client_assessment (V12): a policy cannot stop a client writing a column, a door can.
--
-- Personal like everything else on a client:
--   · erase deletes the client's claims (a BEFORE UPDATE OF erased_at trigger, V43/V48's pattern); a confirmed claim's money
--     is the payment row, which erase_clients() already handles.
--   · the workspace purge deletes client rows; payment_claim.client_id cascades.
--   · the client's own download (client_export, V48's replaced in place) carries their claims while they may see money.
--
-- Backend + web only, like V30 and V32–V49: nothing enters sync.

-- ─── 1. the part-payment switch ──────────────────────────────────────────────

ALTER TABLE tenant_business ADD COLUMN part_payments boolean DEFAULT true NOT NULL;
COMMENT ON COLUMN tenant_business.part_payments IS
    'V50: may a client report paying part of what is left on a pack? Off, a claim against a pack must clear it. Owner-only, like the rest of the row.';

-- ─── 2. the claim ────────────────────────────────────────────────────────────

CREATE TABLE payment_claim (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    trainer_id uuid NOT NULL,
    client_id uuid NOT NULL,
    package_id uuid,
    amount numeric(10,2) NOT NULL,
    currency varchar(3) NOT NULL,
    paid_on date NOT NULL,
    reference varchar(64),
    note varchar(280),
    collector varchar(8) NOT NULL,
    status varchar(10) DEFAULT 'open' NOT NULL,
    payment_id uuid,
    decided_at timestamptz,
    decline_reason varchar(280),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz,
    CONSTRAINT payment_claim_pkey PRIMARY KEY (id),
    CONSTRAINT payment_claim_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id),
    CONSTRAINT payment_claim_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainer (id),
    CONSTRAINT payment_claim_client_same_tenant FOREIGN KEY (client_id, tenant_id) REFERENCES client (id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT payment_claim_package_fkey FOREIGN KEY (package_id) REFERENCES package (id),
    CONSTRAINT payment_claim_payment_fkey FOREIGN KEY (payment_id) REFERENCES payment (id),
    CONSTRAINT payment_claim_amount CHECK (amount > 0 AND currency ~ '^[A-Z]{3}$'),
    CONSTRAINT payment_claim_collector CHECK (collector IN ('trainer', 'gym')),
    CONSTRAINT payment_claim_status CHECK (status IN ('open', 'confirmed', 'declined', 'withdrawn')),
    CONSTRAINT payment_claim_texts CHECK ((reference IS NULL OR btrim(reference) <> '') AND (note IS NULL OR btrim(note) <> '')
        AND (decline_reason IS NULL OR btrim(decline_reason) <> '')),
    -- the shape of each state: only a confirmed claim points at a payment, only a declined one has a reason, and every
    -- state but open was decided at a moment
    CONSTRAINT payment_claim_state_shape CHECK ((status = 'confirmed') = (payment_id IS NOT NULL)
        AND (decline_reason IS NULL OR status = 'declined')
        AND (status = 'open') = (decided_at IS NULL))
);
-- To confirm: the open claims across a trainer's book, oldest first.
CREATE INDEX idx_payment_claim_open ON payment_claim (trainer_id, created_at) WHERE status = 'open' AND deleted_at IS NULL;
CREATE INDEX idx_payment_claim_client ON payment_claim (client_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_payment_claim_package ON payment_claim (package_id) WHERE package_id IS NOT NULL AND status = 'open' AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_payment_claim_payment ON payment_claim (payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX idx_payment_claim_tenant_trainer ON payment_claim (tenant_id, trainer_id);

CREATE TRIGGER trg_payment_claim_stamp_tenant BEFORE INSERT ON payment_claim FOR EACH ROW EXECUTE FUNCTION stamp_tenant_id();
CREATE TRIGGER trg_payment_claim_freeze_tenant BEFORE UPDATE ON payment_claim FOR EACH ROW EXECUTE FUNCTION freeze_tenant_id();
CREATE TRIGGER trg_payment_claim_updated_at BEFORE UPDATE ON payment_claim FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE payment_claim IS
    'V50: a client''s "I''ve paid" — what, when, the UTR if any. Changes nothing owed until the trainer confirms it into a payment. Staff tier; the client reads its own and writes only through client_claim_payment() / client_withdraw_payment_claim().';
COMMENT ON COLUMN payment_claim.package_id IS 'V50: the pack it pays for; NULL when the client paid before a pack was sold — confirming it sells one.';
COMMENT ON COLUMN payment_claim.collector IS 'V50: who the client paid — trainer, or the gym''s desk for a gym client. Stamped from client.client_type.';
COMMENT ON COLUMN payment_claim.payment_id IS 'V50: the payment the trainer''s confirm recorded. Set exactly when status = confirmed.';

ALTER TABLE payment_claim ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- staff: the active workspace's claims, read and decided (never made: a client makes them, through the door)
    EXECUTE 'CREATE POLICY payment_claim_tenant ON payment_claim TO inclineyou_app
        USING (app_actor() = ''staff'' AND tenant_id = app_tenant_id())
        WITH CHECK (app_actor() = ''staff'' AND tenant_id = app_tenant_id())';
    -- a client: their own, read-only, and only while they may see money — the same wall as payment_client
    EXECUTE 'CREATE POLICY payment_claim_client ON payment_claim FOR SELECT TO inclineyou_app
        USING (app_actor() = ''client'' AND client_id = ANY (app_client_ids()) AND client_can_see_money(client_id) AND deleted_at IS NULL)';
    EXECUTE 'GRANT SELECT, UPDATE ON payment_claim TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — policies and grants skipped';
END $$;

-- ─── 3. the client's doors ───────────────────────────────────────────────────

-- What the portal needs to draw "Pay" and "I've paid": the UPI ID (never for a gym client), the part-payment switch, who
-- collects and the gym's name. NULL for anyone but the client's own session while they may see money.
CREATE FUNCTION client_pay_terms(p_client uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
    SELECT jsonb_build_object(
               'upi', CASE WHEN c.client_type = 'gym' THEN NULL ELSE nullif(btrim(b.upi_vpa), '') END,
               'part_payments', b.part_payments,
               'collector', CASE WHEN c.client_type = 'gym' THEN 'gym' ELSE 'trainer' END,
               'gym_name', CASE WHEN c.client_type = 'gym' THEN nullif(btrim(tb.gym_name), '') END)
      FROM client c
      JOIN tenant_business b ON b.tenant_id = c.tenant_id
      LEFT JOIN trainer_business tb ON tb.trainer_id = c.trainer_id
     WHERE c.id = p_client
       AND c.deleted_at IS NULL
       AND app_actor() = 'client'
       AND p_client = ANY (app_client_ids())
       AND client_can_see_money(p_client)
$$;

-- "I've paid". The only way a claim is made. Answers {result, ...}:
--   created / existing (a replayed id, same client) — with id;  conflict — the id belongs to something else;
--   no_package — the pack named is not this client's, or is closed;  nothing_due — the pack owes nothing (less open claims);
--   over_due — more than is left (room);  whole_only — part payments are off and this is not all of it (room);
--   too_many — five claims already waiting;  bad_date — in the future, or more than 90 days ago.
CREATE FUNCTION client_claim_payment(p_id uuid, p_client uuid, p_package uuid, p_amount numeric, p_paid_on date,
                                     p_reference varchar, p_note varchar)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE c client%ROWTYPE; k package%ROWTYPE; existing payment_claim%ROWTYPE; part boolean; room numeric; today date;
BEGIN
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system'
       AND NOT (app_actor() = 'client' AND p_client = ANY (app_client_ids())) THEN
        RAISE EXCEPTION 'a payment can be reported only for your own row' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 OR p_amount >= 100000000 OR p_paid_on IS NULL THEN
        RAISE EXCEPTION 'amount and the day paid are required' USING ERRCODE = 'check_violation';
    END IF;

    -- Locked, so two taps at once are serial and the second sees the first's claim when it works out what is left.
    SELECT * INTO c FROM client WHERE id = p_client AND deleted_at IS NULL AND erased_at IS NULL FOR UPDATE;
    IF NOT FOUND OR NOT client_can_see_money(p_client) THEN
        RAISE EXCEPTION 'client % cannot report a payment', p_client USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO existing FROM payment_claim WHERE id = p_id;
    IF FOUND THEN
        IF existing.client_id = p_client AND existing.package_id IS NOT DISTINCT FROM p_package AND existing.amount = p_amount THEN
            RETURN jsonb_build_object('result', 'existing', 'id', existing.id);
        END IF;
        RETURN jsonb_build_object('result', 'conflict');
    END IF;

    -- the workspace's calendar, as WorkspaceClock reads it
    SELECT (now() AT TIME ZONE t.timezone)::date INTO today FROM tenant t WHERE t.id = c.tenant_id;
    IF p_paid_on > today OR p_paid_on < today - 90 THEN
        RETURN jsonb_build_object('result', 'bad_date');
    END IF;

    IF (SELECT count(*) FROM payment_claim WHERE client_id = p_client AND status = 'open' AND deleted_at IS NULL) >= 5 THEN
        RETURN jsonb_build_object('result', 'too_many');
    END IF;

    SELECT part_payments INTO part FROM tenant_business WHERE tenant_id = c.tenant_id;

    IF p_package IS NOT NULL THEN
        SELECT * INTO k FROM package
         WHERE id = p_package AND client_id = p_client AND deleted_at IS NULL AND status NOT IN ('cancelled', 'refunded')
           FOR UPDATE;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('result', 'no_package');
        END IF;
        -- what is left: the pack's price less what is paid or forgiven (check_package_ledger's sums), less what other open
        -- claims on it already say was paid
        SELECT k.amount
               - COALESCE((SELECT sum(amount) FROM payment WHERE package_id = k.id AND deleted_at IS NULL AND status IN ('paid', 'write_off')), 0)
               - COALESCE((SELECT sum(amount) FROM payment_claim WHERE package_id = k.id AND status = 'open' AND deleted_at IS NULL), 0)
          INTO room;
        IF room <= 0 THEN
            RETURN jsonb_build_object('result', 'nothing_due');
        END IF;
        IF p_amount > room THEN
            RETURN jsonb_build_object('result', 'over_due', 'room', room);
        END IF;
        IF NOT COALESCE(part, true) AND p_amount <> room THEN
            RETURN jsonb_build_object('result', 'whole_only', 'room', room);
        END IF;
    END IF;

    INSERT INTO payment_claim (id, tenant_id, trainer_id, client_id, package_id, amount, currency, paid_on, reference, note, collector)
    VALUES (p_id, c.tenant_id, c.trainer_id, p_client, p_package, p_amount,
            COALESCE(k.currency, (SELECT currency FROM tenant WHERE id = c.tenant_id)), p_paid_on,
            nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''),
            CASE WHEN c.client_type = 'gym' THEN 'gym' ELSE 'trainer' END);
    RETURN jsonb_build_object('result', 'created', 'id', p_id);
END $$;

-- Taking back one's own open claim ("I tapped it by mistake"). Answers {result}: withdrawn · already (withdrawn before) ·
-- decided (the trainer got there first) · not_found.
CREATE FUNCTION client_withdraw_payment_claim(p_claim uuid)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE pc payment_claim%ROWTYPE;
BEGIN
    SELECT * INTO pc FROM payment_claim WHERE id = p_claim AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND OR (session_user = 'inclineyou_app' AND app_actor() <> 'system'
                     AND NOT (app_actor() = 'client' AND pc.client_id = ANY (app_client_ids()))) THEN
        RETURN jsonb_build_object('result', 'not_found');
    END IF;
    IF pc.status = 'withdrawn' THEN RETURN jsonb_build_object('result', 'already'); END IF;
    IF pc.status <> 'open' THEN RETURN jsonb_build_object('result', 'decided', 'status', pc.status); END IF;
    UPDATE payment_claim SET status = 'withdrawn', decided_at = now() WHERE id = p_claim;
    RETURN jsonb_build_object('result', 'withdrawn');
END $$;

-- A receipt for one of the caller's own collected payments: what, when, how, for what, and who it was paid to. The business
-- block is the workspace's (tenant_business is staff-only, so the client reaches it through here). NULL for anything else.
CREATE FUNCTION client_receipt(p_payment uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
    SELECT jsonb_build_object(
               'id', y.id, 'paid_at', y.paid_at, 'amount', y.amount, 'currency', y.currency, 'method', y.method,
               'reference', COALESCE(y.reference, pc.reference), 'collected_by', y.collected_by, 'package', k.name,
               'client', c.name, 'trainer', t.name,
               'gym_name', CASE WHEN y.collected_by = 'gym' THEN nullif(btrim(tb.gym_name), '') END,
               'business', jsonb_build_object('name', tn.name, 'tagline', b.tagline, 'phone', b.phone, 'email', b.email,
                   'address_line1', b.address_line1, 'address_line2', b.address_line2, 'city', b.city, 'state', b.state,
                   'pincode', b.pincode))
      FROM payment y
      JOIN package k ON k.id = y.package_id
      JOIN client c ON c.id = y.client_id
      JOIN trainer t ON t.id = y.trainer_id
      JOIN tenant tn ON tn.id = y.tenant_id
      JOIN tenant_business b ON b.tenant_id = y.tenant_id
      LEFT JOIN trainer_business tb ON tb.trainer_id = y.trainer_id
      LEFT JOIN payment_claim pc ON pc.payment_id = y.id
     WHERE y.id = p_payment
       AND y.status = 'paid'
       AND y.deleted_at IS NULL
       AND app_actor() = 'client'
       AND y.client_id = ANY (app_client_ids())
       AND client_can_see_money(y.client_id)
$$;

DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION client_pay_terms(uuid), client_claim_payment(uuid, uuid, uuid, numeric, date, varchar, varchar),
        client_withdraw_payment_claim(uuid), client_receipt(uuid) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION client_pay_terms(uuid), client_claim_payment(uuid, uuid, uuid, numeric, date, varchar, varchar),
        client_withdraw_payment_claim(uuid), client_receipt(uuid) TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;

-- ─── 4. a gym client is never offered the trainer's UPI ID ───────────────────
-- V46's door, replaced in place (signature and grants unchanged): nothing for a gym client, who pays the gym.

CREATE OR REPLACE FUNCTION client_pay_to(p_client uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
    SELECT nullif(btrim(b.upi_vpa), '')
      FROM client c
      JOIN tenant_business b ON b.tenant_id = c.tenant_id
     WHERE c.id = p_client
       AND c.deleted_at IS NULL
       AND c.client_type <> 'gym'
       AND app_actor() = 'client'
       AND p_client = ANY (app_client_ids())
       AND client_can_see_money(p_client)
$$;

-- ─── 5. erasure ──────────────────────────────────────────────────────────────

CREATE FUNCTION scrub_erased_client_claims() RETURNS trigger
    LANGUAGE plpgsql SET search_path TO public, pg_catalog AS $$
BEGIN
    IF NEW.erased_at IS NOT NULL AND OLD.erased_at IS NULL THEN
        DELETE FROM payment_claim WHERE client_id = NEW.id;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_client_scrub_erased_claims BEFORE UPDATE OF erased_at ON client
    FOR EACH ROW EXECUTE FUNCTION scrub_erased_client_claims();

-- ─── 6. the client's own download ────────────────────────────────────────────
-- V48's client_export(), replaced in place: a 'payment_claims' list beside 'payments', under the same money switch.
-- Same signature, so the V25 grants stand.

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
              FROM payment y JOIN package k ON k.id = y.package_id WHERE y.client_id = ANY (money) AND y.deleted_at IS NULL), '[]'::jsonb) END,
        'payment_claims', CASE WHEN cardinality(money) = 0 THEN NULL ELSE COALESCE((SELECT jsonb_agg(jsonb_build_object('amount', pc.amount, 'currency', pc.currency,
                'paid_on', pc.paid_on, 'reference', pc.reference, 'note', pc.note, 'paid_to', pc.collector, 'status', pc.status,
                'claimed_at', pc.created_at, 'decided_at', pc.decided_at, 'decline_reason', pc.decline_reason) ORDER BY pc.created_at)
              FROM payment_claim pc WHERE pc.client_id = ANY (money) AND pc.deleted_at IS NULL), '[]'::jsonb) END);
END $$;
