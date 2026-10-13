-- V25 · what a client's settings and privacy screens need that a client's own connection cannot read (api-contract 1.2, ps-l1, ps-a6).
--
--   · client_reminder_offered(client) — whether the trainer has session reminders on and has not left this client out of them: the one fact
--     about the TRAINER's settings the reminder opt-in needs ("is it worth asking?"). A client cannot read the trainer's row, and must not.
--   · client_export(phone) — the person's whole data for the download (DPDP data-principal right, UC-CP-26). It is a function because the
--     removed wall must still be able to take it: a client who has left has an EMPTY lens (client_ids_for_phone answers live rows only), yet
--     their history is theirs to take with them. It answers only for the number that signed in, only rows that number holds and is not erased,
--     never a private trainer note, never another client, never the trainer's totals; and the money (packages, payments) only while the
--     trainer lets this client see money — the same switch the screens obey.

CREATE FUNCTION client_reminder_offered(p_client uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
BEGIN
    IF session_user = 'inclineyou_app' AND app_actor() <> 'system' AND NOT (app_actor() = 'client' AND p_client = ANY (app_client_ids())) THEN
        RAISE EXCEPTION 'client % is not yours', p_client USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN COALESCE((SELECT t.session_reminders AND NOT c.reminders_excluded FROM client c JOIN trainer t ON t.id = c.trainer_id WHERE c.id = p_client), false);
END $$;

CREATE FUNCTION client_export(p_phone text) RETURNS jsonb
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
                'activity_level', c.activity_level, 'timezone', c.timezone, 'status', c.membership_status, 'accepted_at', c.accepted_at,
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
                            'effort_kind', sl.effort_kind, 'effort', sl.effort_value, 'rpe', sl.rpe, 'notes', sl.notes, 'done_at', sl.done_at, 'entered_by', sl.entered_by)
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
        'packages', CASE WHEN cardinality(money) = 0 THEN NULL ELSE COALESCE((SELECT jsonb_agg(jsonb_build_object('name', k.name, 'status', k.status, 'sessions_total', k.sessions_total,
                'sessions_left', k.sessions_remaining, 'amount', k.amount, 'currency', k.currency, 'start_date', k.start_date, 'end_date', k.end_date) ORDER BY k.created_at)
              FROM package k WHERE k.client_id = ANY (money) AND k.deleted_at IS NULL), '[]'::jsonb) END,
        'payments', CASE WHEN cardinality(money) = 0 THEN NULL ELSE COALESCE((SELECT jsonb_agg(jsonb_build_object('paid_at', y.paid_at, 'amount', y.amount, 'currency', y.currency,
                'method', y.method, 'reference', y.reference, 'status', y.status, 'package', k.name) ORDER BY y.paid_at NULLS LAST, y.created_at)
              FROM payment y JOIN package k ON k.id = y.package_id WHERE y.client_id = ANY (money) AND y.deleted_at IS NULL), '[]'::jsonb) END);
END $$;

DO $$
BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION client_reminder_offered(uuid), client_export(text) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION client_reminder_offered(uuid), client_export(text) TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;
