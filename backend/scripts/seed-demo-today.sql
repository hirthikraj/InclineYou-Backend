-- The Today demo, on the v1 schema. Run through seed-demo-today.sh.
--
-- Everything is dated relative to the moment it runs, in the workspace's clock
-- (Asia/Kolkata), so a re-run the next morning is a fresh, plausible day rather
-- than yesterday's. Every client it creates is tagged metadata->>'seed' =
-- 'today'; a re-run tombstones those and their tail before rebuilding.

\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE k ON COMMIT DROP AS
SELECT t.id AS tid,
       coalesce(t.home_tenant_id,
                (SELECT tm.tenant_id FROM tenant_member tm
                 WHERE tm.app_user_id = u.id AND tm.status = 'active'
                 ORDER BY tm.is_home DESC LIMIT 1)) AS ten,
       (now() AT TIME ZONE 'Asia/Kolkata')::date AS today
FROM trainer t
JOIN app_user u ON u.id = t.app_user_id
WHERE u.phone = :'trainer_phone' AND t.deleted_at IS NULL;

DO $$
BEGIN
  IF (SELECT count(*) FROM k) <> 1 OR (SELECT ten FROM k) IS NULL THEN
    RAISE EXCEPTION 'no trainer with a workspace for that phone — sign in on the web once first';
  END IF;
END $$;

-- The triggers that stamp tenant_id read it from the session, as a request would.
SELECT set_config('app.tenant_id', (SELECT ten::text FROM k), true),
       set_config('app.trainer_id', (SELECT tid::text FROM k), true),
       set_config('app.actor', 'staff', true);

/* ── retire the previous run ─────────────────────────────────────────────── */

CREATE TEMP TABLE old_clients ON COMMIT DROP AS
SELECT c.id FROM client c, k
WHERE c.trainer_id = k.tid AND c.deleted_at IS NULL AND c.metadata ->> 'seed' = 'today';

UPDATE payment SET deleted_at = now() WHERE client_id IN (SELECT id FROM old_clients) AND deleted_at IS NULL;
UPDATE package SET deleted_at = now() WHERE client_id IN (SELECT id FROM old_clients) AND deleted_at IS NULL;
UPDATE scheduled_session SET deleted_at = now() WHERE client_id IN (SELECT id FROM old_clients) AND deleted_at IS NULL;
UPDATE assessment SET deleted_at = now() WHERE client_id IN (SELECT id FROM old_clients) AND deleted_at IS NULL;
UPDATE workout SET deleted_at = now()
WHERE program_id IN (SELECT id FROM program WHERE client_id IN (SELECT id FROM old_clients)) AND deleted_at IS NULL;
UPDATE program SET deleted_at = now() WHERE client_id IN (SELECT id FROM old_clients) AND deleted_at IS NULL;
UPDATE client_note SET deleted_at = now() WHERE client_id IN (SELECT id FROM old_clients) AND deleted_at IS NULL;
UPDATE client_schedule_slot SET deleted_at = now() WHERE client_id IN (SELECT id FROM old_clients) AND deleted_at IS NULL;
DELETE FROM attention_dismissal WHERE client_id IN (SELECT id FROM old_clients);
DELETE FROM nudge_log WHERE client_id IN (SELECT id FROM old_clients);
UPDATE client SET deleted_at = now() WHERE id IN (SELECT id FROM old_clients);

UPDATE working_hours SET deleted_at = now() FROM k WHERE trainer_id = k.tid AND deleted_at IS NULL;
UPDATE assessment_template SET deleted_at = now() FROM k
WHERE assessment_template.trainer_id = k.tid AND name = 'Monthly check' AND deleted_at IS NULL;

/* ── the trainer ─────────────────────────────────────────────────────────── */

UPDATE trainer SET name = coalesce(name, 'Arun Prakash'), setup_completed_at = coalesce(setup_completed_at, now())
FROM k WHERE trainer.id = k.tid;

-- A split shift every day, so the ribbon has ground whatever day this runs.
INSERT INTO working_hours (trainer_id, weekday, start_time, end_time)
SELECT k.tid, d, w.s::time, w.e::time
FROM k, generate_series(1, 7) d, (VALUES ('06:00', '11:00'), ('17:00', '22:00')) w(s, e);

/* ── the roster ──────────────────────────────────────────────────────────── */

-- slot: today's start time, or null for nobody on today's diary.
CREATE TEMP TABLE r ON COMMIT DROP AS
SELECT gen_random_uuid() AS id, v.*
FROM (VALUES
  ('vikram',  'Vikram Singh',   '+919876500001', 'active',   'independent', 'floor',      null,    60),
  ('meera',   'Meera Iyer',     '+919876500002', 'active',   'independent', 'floor',      '07:15', 60),
  ('priya',   'Priya Nair',     '+919876500003', 'active',   'independent', 'floor',      '08:30', 60),
  ('sneha',   'Sneha Kulkarni', '+919876500004', 'active',   'gym',         'floor',      '09:45', 60),
  ('arjun',   'Arjun Reddy',    '+919876500005', 'active',   'independent', 'floor',      '17:00', 60),
  ('karthik', 'Karthik Menon',  '+919876500006', 'active',   'independent', 'home_visit', '18:15', 45),
  ('divya',   'Divya Menon',    '+919876500007', 'active',   'independent', 'remote',     '19:30', 45),
  ('rohan',   'Rohan Das',      '+919876500008', 'active',   'independent', 'floor',      null,    60),
  ('anjali',  'Anjali Rao',     '+919876500009', 'paused',   'independent', 'floor',      null,    60),
  ('farhan',  'Farhan Ali',     '+919876500010', 'archived', 'independent', 'floor',      null,    60)
) v(key, name, phone, status, client_type, mode, slot, minutes);

INSERT INTO client (id, trainer_id, name, phone, status, client_type, metadata, goal,
                    paused_at, paused_until, archived_at, archive_reason)
SELECT r.id, k.tid, r.name, r.phone, r.status, r.client_type, '{"seed": "today"}'::jsonb,
       CASE r.key WHEN 'meera' THEN 'Deadlift bodyweight by December'
                  WHEN 'priya' THEN 'Lose 6 kg before the wedding' END,
       CASE WHEN r.status = 'paused' THEN now() - interval '12 days' END,
       CASE WHEN r.status = 'paused' THEN k.today - 2 END,
       CASE WHEN r.status = 'archived' THEN now() - interval '40 days' END,
       CASE WHEN r.status = 'archived' THEN 'moved_away' END
FROM r, k;

UPDATE client_schedule cs SET sessions_per_week = 3, session_duration_minutes = r.minutes, delivery_mode = r.mode
FROM r WHERE cs.client_id = r.id;

INSERT INTO client_schedule_slot (client_id, weekday, start_time)
SELECT r.id, extract(isodow FROM k.today + o)::int, r.slot::time
FROM r, k, (VALUES (0), (2), (4)) w(o)
WHERE r.slot IS NOT NULL;

INSERT INTO client_note (client_id, trainer_id, body, pinned)
SELECT r.id, k.tid, v.body, true
FROM r, k, (VALUES ('meera', 'Prefers the squat rack by the window'),
                   ('priya', 'Wedding on the 14th of next month')) v(key, body)
WHERE r.key = v.key;

/* ── programs: everybody coached has one except Arjun (the no-program row) ─ */

CREATE TEMP TABLE pg ON COMMIT DROP AS
SELECT gen_random_uuid() AS id, r.id AS client_id, r.key, v.name, v.weeks, v.started
FROM r, (VALUES ('vikram',  'Hypertrophy block', 12, 50),
                ('meera',   'Strength base',      8, 24),
                ('priya',   'Fat loss phase 1',   8, 10),
                ('sneha',   'Gym starter',        6, 17),
                ('karthik', 'Home strength',      8, 38),
                ('divya',   'Mobility & core',    6,  3),
                ('rohan',   'Strength base',      8, 45)) v(key, name, weeks, started)
WHERE r.key = v.key;

INSERT INTO program (id, origin, trainer_id, client_id, name, weeks, days, status, start_date, end_date)
SELECT pg.id, 'trainer', k.tid, pg.client_id, pg.name, pg.weeks, 3, 'active',
       k.today - pg.started, k.today - pg.started + pg.weeks * 7 - 1
FROM pg, k;

INSERT INTO workout (origin, trainer_id, program_id, week, day, position, name)
SELECT 'trainer', k.tid, pg.id, w, d, 0,
       (ARRAY['Full Body A', 'Full Body B', 'Full Body C'])[d]
FROM pg, k, generate_series(1, pg.weeks) w, generate_series(1, 3) d;

/* ── the diary ───────────────────────────────────────────────────────────── */

-- History: each coached client on their slot every other day for four weeks,
-- with the shape each queue row needs written over it below.
CREATE TEMP TABLE ses ON COMMIT DROP AS
SELECT gen_random_uuid() AS id, r.id AS client_id, r.key, r.minutes, r.mode,
       ((k.today - off) + r.slot::time) AT TIME ZONE 'Asia/Kolkata' AS at,
       off
FROM r, k, generate_series(2, 28, 2) off
WHERE r.slot IS NOT NULL;

-- Today, tomorrow and the day after.
INSERT INTO ses
SELECT gen_random_uuid(), r.id, r.key, r.minutes, r.mode,
       ((k.today + d) + r.slot::time) AT TIME ZONE 'Asia/Kolkata', -d
FROM r, k, generate_series(0, 2) d
WHERE r.slot IS NOT NULL;

-- Vikram: exactly a hundred delivered sessions, the latest yesterday — the
-- milestone row. Nothing on his diary today, or finishing it would make 101.
INSERT INTO ses
SELECT gen_random_uuid(), r.id, r.key, r.minutes, r.mode,
       ((k.today - 1 - n * 3) + '06:00'::time) AT TIME ZONE 'Asia/Kolkata', 1 + n * 3
FROM r, k, generate_series(0, 99) n
WHERE r.key = 'vikram';

-- Rohan: trained until twelve days ago, then nothing — gone quiet.
INSERT INTO ses
SELECT gen_random_uuid(), r.id, r.key, r.minutes, r.mode,
       ((k.today - off) + '08:30'::time + interval '4 hours') AT TIME ZONE 'Asia/Kolkata', off
FROM r, k, generate_series(12, 40, 3) off
WHERE r.key = 'rohan';

-- Sneha: yesterday's session, which nobody marked.
INSERT INTO ses
SELECT gen_random_uuid(), r.id, r.key, r.minutes, r.mode,
       ((k.today - 1) + r.slot::time) AT TIME ZONE 'Asia/Kolkata', 1
FROM r, k WHERE r.key = 'sneha';

INSERT INTO scheduled_session (id, trainer_id, client_id, workout_id, scheduled_at, duration_minutes,
                               status, started_at, ended_at, notes)
SELECT s.id, k.tid, s.client_id,
       (SELECT w.id FROM workout w JOIN pg ON pg.id = w.program_id
        WHERE pg.client_id = s.client_id AND w.deleted_at IS NULL
          AND w.week = least(pg.weeks, greatest(1, ((k.today - s.off) - (k.today - pg.started)) / 7 + 1))
          AND w.day = 1 + (abs(s.off) / 2) % 3),
       s.at, s.minutes,
       CASE
         -- the two newest settled sessions of Karthik's are no-shows
         WHEN s.key = 'karthik' AND s.off IN (2, 4) THEN 'no_show'
         WHEN s.key = 'sneha' AND s.off = 1 THEN 'scheduled'
         WHEN s.at + make_interval(mins => s.minutes) <= now() THEN 'done'
         ELSE 'scheduled'
       END,
       -- a log on every delivered session, and on the one happening right now
       CASE WHEN (s.at + make_interval(mins => s.minutes) <= now() AND NOT (s.key = 'karthik' AND s.off IN (2, 4))
                  AND NOT (s.key = 'sneha' AND s.off = 1))
                 OR (s.at <= now() AND now() < s.at + make_interval(mins => s.minutes))
            THEN s.at + interval '2 minutes' END,
       CASE WHEN s.at + make_interval(mins => s.minutes) <= now() AND NOT (s.key = 'karthik' AND s.off IN (2, 4))
                 AND NOT (s.key = 'sneha' AND s.off = 1)
            THEN s.at + make_interval(mins => s.minutes - 3) END,
       CASE WHEN s.off = 0 AND s.key = 'meera' THEN 'Bring the long band' END
FROM ses s, k;

-- Today's logs get real work in them: four movements, three sets each.
INSERT INTO session_exercise (session_id, client_id, exercise_id, position)
SELECT s.id, s.client_id, e.id, e.n - 1
FROM scheduled_session s
JOIN k ON true
JOIN LATERAL (SELECT id, row_number() OVER (ORDER BY name) AS n
              FROM exercise WHERE name IN ('Barbell full squat', 'Barbell bench press', 'Barbell deadlift', 'Pull-up')
                AND deleted_at IS NULL
              ORDER BY name LIMIT 4) e ON true
WHERE s.client_id IN (SELECT id FROM r) AND s.started_at IS NOT NULL
  AND s.scheduled_at >= (k.today - 7)::timestamp AT TIME ZONE 'Asia/Kolkata'
  AND s.deleted_at IS NULL;

INSERT INTO set_log (session_exercise_id, position, load_kind, effort_kind, load_value, effort_value, done_at)
SELECT se.id, p, 'weight', 'reps', 20 + se.position * 10 + p * 2.5, 10 - p,
       s.started_at + make_interval(mins => se.position * 12 + p * 3)
FROM session_exercise se
JOIN scheduled_session s ON s.id = se.session_id
CROSS JOIN generate_series(1, 3) p
WHERE se.client_id IN (SELECT id FROM r)
  AND s.started_at + make_interval(mins => se.position * 12 + p * 3) <= now();

/* ── the money book ──────────────────────────────────────────────────────── */

CREATE TEMP TABLE kp ON COMMIT DROP AS
SELECT gen_random_uuid() AS id, r.id AS client_id, v.*
FROM r, (VALUES
  -- key       name                     service       basis       total left  amount    start due  end   share  status
  ('meera',   '12 sessions · floor',    'floor',      'sessions', 12,   2,    9000.00,  -24, -20,  36,  null, 'active'),
  ('priya',   '10 sessions · floor',    'floor',      'sessions', 10,   6,    7500.00,  -40, -40,   3,  null, 'active'),
  ('vikram',  '24 sessions · floor',    'floor',      'sessions', 24,   9,   16800.00,   -2,  -2,  88,  null, 'active'),
  ('vikram',  '24 sessions · floor',    'floor',      'sessions', 24,   0,   16800.00,  -35, -35, -2,  null, 'completed'),
  ('sneha',   'Gym PT · 8 sessions',    'floor',      'sessions',  8,   5,    8000.00,  -17,   4,  43,  60.0, 'active'),
  ('arjun',   '12 sessions · floor',    'floor',      'sessions', 12,  12,    8400.00,   -1,   5,  59,  null, 'active'),
  ('karthik', 'Monthly · home visits',  'home_visit', 'period',   null, null, 6000.00,  -12, -12, 18,  null, 'active'),
  ('divya',   'Monthly · online',       'remote',     'period',   null, null, 3000.00,    0,   0, 30,  null, 'active'),
  ('rohan',   '8 sessions · floor',     'floor',      'sessions',  8,   5,    6000.00,  -45, -45, 15,  null, 'active'),
  ('anjali',  '8 sessions · floor',     'floor',      'sessions',  8,   4,    6000.00,  -50, -50, 10,  null, 'active')
) v(key, name, service, basis, total, remaining, amount, start_off, due_off, end_off, share, status)
WHERE r.key = v.key;

INSERT INTO package (id, trainer_id, client_id, name, service, basis, sessions_total, sessions_remaining,
                     amount, currency, start_date, end_date, due_date, status, closed_at,
                     trainer_share_percent, paused_at, created_at)
SELECT kp.id, k.tid, kp.client_id, kp.name, kp.service, kp.basis, kp.total, kp.remaining,
       kp.amount, 'INR', k.today + kp.start_off, k.today + kp.end_off, k.today + kp.due_off, kp.status,
       CASE WHEN kp.status <> 'active' THEN now() - interval '2 days' END,
       kp.share,
       CASE WHEN kp.key = 'anjali' THEN now() - interval '12 days' END,
       ((k.today + kp.start_off)::timestamp AT TIME ZONE 'Asia/Kolkata') + interval '9 hours'
FROM kp, k;

INSERT INTO payment (trainer_id, client_id, package_id, amount, currency, collected_by, method, status, reference, paid_at)
SELECT k.tid, kp.client_id, kp.id, v.amount, 'INR', 'trainer', v.method, 'paid', v.ref,
       now() - make_interval(days => v.days_ago)
FROM kp, k, (VALUES
  ('meera',   -24, 4000.00,  'upi',  'UPI88120034', 5),
  ('priya',   -40, 7500.00,  'upi',  'UPI88120035', 39),
  ('vikram',   -2, 16800.00, 'upi',  'UPI88120036', 2),
  ('vikram',  -35, 16800.00, 'bank_transfer', 'NEFT55012', 34),
  ('arjun',    -1, 2000.00,  'cash', null,          1),
  ('karthik', -12, 6000.00,  'cash', null,          11),
  ('divya',     0, 3000.00,  'upi',  'UPI88120037', 0),
  ('rohan',   -45, 6000.00,  'upi',  'UPI88120038', 44),
  ('anjali',  -50, 6000.00,  'cash', null,          49)
) v(key, start_off, amount, method, ref, days_ago)
WHERE kp.key = v.key AND kp.start_off = v.start_off;

/* ── the rest of what Today reads ────────────────────────────────────────── */

-- Karthik was checked on yesterday, so his row ranks below the uncontacted.
INSERT INTO nudge_log (trainer_id, client_id, reason, template, message, sent_at)
SELECT k.tid, r.id, 'no_show', 'missed_session', 'Hi Karthik, missed you this week — all well?', now() - interval '1 day'
FROM r, k WHERE r.key = 'karthik';

INSERT INTO assessment_template (trainer_id, name)
SELECT k.tid, 'Monthly check' FROM k;

INSERT INTO assessment (trainer_id, client_id, template_id, name, form, due_on, readings, completed_at, entered_by)
SELECT k.tid, r.id, t.id, 'Monthly check',
       '{"measurements": [{"key": "weight"}, {"key": "waist"}], "questions": [{"id": "q1"}]}'::jsonb,
       k.today + v.due_off, v.readings::jsonb, v.completed, CASE WHEN v.completed IS NOT NULL THEN 'trainer' END
FROM r, k,
     (SELECT id FROM assessment_template WHERE name = 'Monthly check' AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1) t,
     (VALUES ('meera',  0,   '{}',                              null::timestamptz),
             ('rohan', -5,   '{}',                              null),
             ('priya', -28,  '{"weight": 68.5, "waist": 81}',  now() - interval '28 days')) v(key, due_off, readings, completed)
WHERE r.key = v.key;

COMMIT;

/* ── what was built ──────────────────────────────────────────────────────── */

SELECT to_char(s.scheduled_at AT TIME ZONE 'Asia/Kolkata', 'Dy HH24:MI') AS "today & tomorrow",
       c.name AS client, s.status,
       CASE WHEN s.started_at IS NOT NULL AND s.ended_at IS NULL THEN 'running' ELSE '' END AS log
FROM scheduled_session s
JOIN client c ON c.id = s.client_id
JOIN trainer t ON t.id = s.trainer_id
JOIN app_user u ON u.id = t.app_user_id
WHERE u.phone = :'trainer_phone' AND s.deleted_at IS NULL AND c.metadata ->> 'seed' = 'today'
  AND s.scheduled_at >= (now() AT TIME ZONE 'Asia/Kolkata')::date::timestamp AT TIME ZONE 'Asia/Kolkata'
  AND s.scheduled_at < ((now() AT TIME ZONE 'Asia/Kolkata')::date + 2)::timestamp AT TIME ZONE 'Asia/Kolkata'
ORDER BY s.scheduled_at;
