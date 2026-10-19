-- Three months of one trainer's working life, on the v1 schema (V1–V26), with the client portal behind it.
-- Run through seed-three-months.sh <trainer-phone>.
--
-- WHAT IT DOES TO THE TRAINER YOU NAME
--   It HARD-DELETES everything the trainer's workspace holds — clients, diary, logs,
--   packages, payments, programs, assessments, nudges, the portal's messages / bell /
--   feedback / milestones / invites, price list, custom exercises, and the sign-in rows of
--   the clients it seeded — and rebuilds it. The trainer's own sign-in (app_user, trainer,
--   tenant, tenant_member, subscription) is kept, so you stay signed in. Development only;
--   never run it against production.
--
-- WHAT IT BUILDS (dated relative to the day it runs, in the workspace's clock)
--   14 clients: 11 active (two of them gym clients), 1 paused, 1 archived,
--   1 prospect — and the states a roster only shows when they exist: a client who went
--   quiet and one with money outstanding.
--   13 weeks of diary behind today and 2 weeks ahead, on a timetable with one
--   person on the floor at a time (asserted before COMMIT, not just claimed).
--   Programs, workouts and per-set logs; a money book that obeys the ledger triggers
--   (every package is charged by package_adjustment, every payment is capped by the
--   package) including a pause, an extension, a bonus, a moved due date, a write-off and a
--   refund; a gym arrangement with payouts; assessments; nudges; notes.
--
-- THE CLIENT PORTAL (V11–V25) — every portal state a trainer can meet is on the roster:
--   9 clients who accepted their invite and have a client sign-in (app_user role 'client',
--   client_prefs, an accepted client_invite), one of them PAUSED (the paused wall), one who
--   LEFT (the removed wall, farhan), one with a LIVE invite link that is printed at the end
--   (arjun), one who declined (kavya), one never invited (nisha), one prospect (ritu).
--   For the accepted clients: the trainer's recap / weekly / free notes, the bell (plan, note,
--   session, pack, best, check-in, session reminders in every WhatsApp delivery state),
--   how-it-felt feedback, session-count milestones, notes shared by the trainer, workouts a
--   client did alone on a Sunday (logged_by = 'client' — not in the trainer's diary), and
--   assessments the client took in the portal: a monthly body check and a weekly check-in,
--   with some waiting, some late, and some returned for the trainer to read.
--   Signing in as a client: the OTP is printed in the backend log (OTP_DELIVERY=log) —
--   use any of the phones the summary lists.
--
-- Package sizes are fixed per client and consumption is measured, so which pack is
-- "ending" or "empty" depends on the day this runs. The summary at the end prints
-- the state it landed in.

\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.h(t text) RETURNS int LANGUAGE sql IMMUTABLE
AS $$ SELECT (hashtext(t)::bigint & 2147483647)::int $$;
CREATE FUNCTION pg_temp.ist(d date, t time) RETURNS timestamptz LANGUAGE sql IMMUTABLE
AS $$ SELECT (d + t) AT TIME ZONE 'Asia/Kolkata' $$;

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

/* ── 1. wipe the workspace's books ───────────────────────────────────────── */

-- The clients' sign-ins go with the clients they were made for. Found by phone BEFORE the client rows go.
CREATE TEMP TABLE old_client_users ON COMMIT DROP AS
SELECT u.id FROM app_user u
WHERE u.role = 'client' AND u.phone IN (SELECT c.phone FROM client c WHERE c.tenant_id = (SELECT ten FROM k) AND c.phone IS NOT NULL);
DELETE FROM web_session         WHERE app_user_id IN (SELECT id FROM old_client_users);
DELETE FROM push_subscription   WHERE app_user_id IN (SELECT id FROM old_client_users);
DELETE FROM tenant_member       WHERE app_user_id IN (SELECT id FROM old_client_users);

DELETE FROM client_notification WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM client_message      WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM workout_feedback    WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM milestone           WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM client_prefs        WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM client_invite       WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM nudge_log           WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM attention_dismissal WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM package_adjustment  WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM payment             WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM session_exercise    WHERE tenant_id = (SELECT ten FROM k);   -- set_log goes with it
DELETE FROM scheduled_session   WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM package             WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM trainer_payout      WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM gym_arrangement     WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM pack                WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM assessment          WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM assessment_schedule WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM assessment_template WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM workout_exercise    WHERE tenant_id = (SELECT ten FROM k);   -- workout_set goes with it
DELETE FROM workout             WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM program             WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM client_note         WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM client_assignment   WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM client_schedule_slot WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM client_schedule     WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM client              WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM app_user            WHERE id IN (SELECT id FROM old_client_users);
DELETE FROM trainer_exercise    WHERE tenant_id = (SELECT ten FROM k);
DELETE FROM exercise            WHERE tenant_id = (SELECT ten FROM k);   -- custom ones; the library has no tenant
DELETE FROM nudge_template      WHERE trainer_id = (SELECT tid FROM k);
DELETE FROM working_hours       WHERE trainer_id = (SELECT tid FROM k);

/* ── 2. the trainer, and the week they work ──────────────────────────────── */

UPDATE trainer_business tb SET
  training_modes = '["gym_floor", "home_visit", "online"]',
  service_areas  = '["Adyar", "Besant Nagar", "Velachery", "T. Nagar"]',
  map_link       = 'https://maps.google.com/?q=Iron+Temple+Fitness+Adyar+Chennai',
  gym_name       = 'Iron Temple Fitness',
  upi_vpa        = 'inclineyou.demo@okicici',
  experience_band = '6_10',
  certifications = '["k11_cpt", "cpr"]',
  specialities   = '["strength", "weight_loss", "muscle_gain"]',
  languages      = '["ta", "en"]',
  headline       = coalesce(tb.headline, 'Strength and fitness coach'),
  bio            = 'Eight years on the floor in Chennai. I coach strength first — a deadlift you trust is worth more than a diet you resent — and I keep the plan simple enough that you can follow it on a day I am not in the room.'
FROM k WHERE tb.trainer_id = k.tid;

-- Mon–Sat, a split shift: 06:00–11:00 and 17:00–22:00. Sunday is off.
INSERT INTO working_hours (trainer_id, weekday, start_time, end_time)
SELECT k.tid, d, w.s::time, w.e::time
FROM k, generate_series(1, 6) d, (VALUES ('06:00', '11:00'), ('17:00', '22:00')) w(s, e);

/* ── 3. the exercise vocabulary this seed draws on ───────────────────────── */

-- The library is the InclineYou catalogue (exercise-library/exercises-india.json, loaded by ExerciseSeeder), found by
-- its permanent id: source_id = 'inclineyou-' || id. Start the backend once first so the library exists.
-- Two customs the trainer made themselves, to show the "yours" case.
INSERT INTO exercise (name, muscle_group, equipment, movement_pattern, origin, trainer_id, description, log_type)
SELECT v.name, v.mg, v.eq, v.mp, 'trainer', k.tid, v.descr, v.lt
FROM k, (VALUES
  ('Sled drag · gym turf',    'quads', 'sled',   'carry', 'Harness or straps, backwards walk, short steps. Time under tension, not speed.', 'weight_distance'),
  ('Towel-assisted pull-up',  'lats',  'towel',  'pull',  'Loop a towel over the bar and hold both ends; the towel takes some of the load.',   'reps')
) v(name, mg, eq, mp, descr, lt);

-- key → library exercise, and how a set of it is prescribed (load kind, base load for a 1.0 client, effort).
CREATE TEMP TABLE ex ON COMMIT DROP AS
SELECT v.key, v.sid, v.load_kind, v.base_load, v.effort_kind, v.base_effort, v.rest,
       (SELECT e.id FROM exercise e
        WHERE e.source_id = 'inclineyou-' || v.sid AND e.deleted_at IS NULL) AS id
FROM (VALUES
  ('squat',    'barbell-back-squat',                'weight',     40.0, 'reps',     10, 120),
  ('gsquat',   'dumbbell-goblet-squat',             'weight',     12.0, 'reps',     12,  75),
  ('rdl',      'barbell-romanian-deadlift',         'weight',     40.0, 'reps',     10, 105),
  ('dbrdl',    'dumbbell-romanian-deadlift',        'weight',     12.0, 'reps',     12,  75),
  ('dl',       'barbell-deadlift',                  'weight',     50.0, 'reps',      8, 150),
  ('bench',    'barbell-bench-press',               'weight',     30.0, 'reps',     10, 120),
  ('dbbench',  'dumbbell-bench-press',              'weight',     12.0, 'reps',     10,  90),
  ('ohp',      'dumbbell-seated-shoulder-press',    'weight',     10.0, 'reps',     10,  90),
  ('row',      'cable-seated-row',                  'weight',     25.0, 'reps',     12,  75),
  ('dbrow',    'dumbbell-bent-over-row',            'weight',     12.0, 'reps',     10,  75),
  ('pulldown', 'cable-wide-grip-lat-pulldown',      'weight',     25.0, 'reps',     12,  75),
  ('lunge',    'dumbbell-forward-lunge',            'weight',      8.0, 'reps',     10,  75),
  ('glute',    'barbell-glute-bridge',              'weight',     40.0, 'reps',     12,  90),
  ('legcurl',  'lying-leg-curl',                    'weight',     25.0, 'reps',     12,  60),
  ('legext',   'leg-extension',                     'weight',     25.0, 'reps',     12,  60),
  ('curl',     'dumbbell-curl',                     'weight',      8.0, 'reps',     12,  60),
  ('tri',      'cable-v-bar-pushdown',              'weight',     15.0, 'reps',     12,  60),
  ('stepup',   'dumbbell-step-up',                  'weight',      8.0, 'reps',     10,  75),
  ('kbswing',  'kettlebell-swing',                  'weight',     12.0, 'reps',     15,  60),
  ('farmer',   'dumbbell-farmers-walk',             'weight',     16.0, 'distance', 40,  75),
  ('calf',     'dumbbell-standing-calf-raise',      'weight',     12.0, 'reps',     15,  45),
  ('pushup',   'push-up',                           'bodyweight',  NULL, 'reps',     12,  60),
  ('deadbug',  'dead-bug',                          'bodyweight',  NULL, 'reps',     10,  45),
  ('plank',    'plank',                             'bodyweight',  NULL, 'time',     40,  45),
  ('bapu',     'band-assisted-pull-up',             'bodyweight',  NULL, 'reps',      6,  90),
  -- The mobility flow's movements (section 6's two standalone workouts).
  ('hip9090',  '90-90-hip-switch',                  'bodyweight',  NULL, 'reps',      8,  20),
  ('catcow',   'cat-cow',                           'bodyweight',  NULL, 'reps',     10,  15),
  ('wgs',      'worlds-greatest-stretch',           'bodyweight',  NULL, 'reps',      6,  20),
  ('tspine',   'thoracic-extension-on-roller',      'bodyweight',  NULL, 'reps',      8,  20),
  ('ankle',    'ankle-circles',                     'bodyweight',  NULL, 'reps',     10,  15),
  ('sqhold',   'deep-squat-hold',                   'bodyweight',  NULL, 'time',     45,  30)
) v(key, sid, load_kind, base_load, effort_kind, base_effort, rest);

-- Compatibility with the library, checked rather than assumed: the kinds this seed writes for a movement must be the
-- kinds its library log_type gives (the same mapping LogTypes.kindsOf applies when a trainer adds it to a session).
-- If the library changes a movement's log type, the seed stops here and names it instead of writing a set shape the
-- app would never have produced.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(ex.key || ' (' || ex.sid || '): library says ' || coalesce(e.log_type, 'weight_reps') ||
                    ', seed writes ' || ex.load_kind || ' x ' || ex.effort_kind, '; ') INTO bad
  FROM ex JOIN exercise e ON e.id = ex.id
  WHERE (CASE WHEN e.log_type IS NULL OR e.log_type LIKE 'weight%' THEN 'weight' ELSE 'bodyweight' END) <> ex.load_kind
     OR (CASE WHEN e.log_type IN ('time', 'weight_time') THEN 'time'
              WHEN e.log_type IN ('distance', 'weight_distance') THEN 'distance' ELSE 'reps' END) <> ex.effort_kind;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'seed and library disagree on how a movement is counted: %', bad;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM ex WHERE id IS NULL) THEN
    RAISE EXCEPTION 'exercise library is missing (start the backend once so ExerciseSeeder loads it): %', (SELECT string_agg(sid, ', ') FROM ex WHERE id IS NULL);
  END IF;
END $$;

INSERT INTO trainer_exercise (trainer_id, exercise_id, is_favourite)
SELECT k.tid, ex.id, true FROM k, ex WHERE ex.key IN ('squat', 'bench', 'dl', 'gsquat', 'kbswing');

/* ── 4. the price list ───────────────────────────────────────────────────── */

INSERT INTO pack (trainer_id, name, service, basis, sessions, amount, currency, validity_days, order_index,
                  owner, trainer_share_percent)
SELECT k.tid, v.name, v.service, v.basis, v.sessions, v.amount, 'INR', v.validity, v.ord, v.owner, v.share
FROM k, (VALUES
  ('8 sessions · floor',              'floor',       'sessions',   8,  6000.00,  45, 0, 'trainer', NULL::numeric),
  ('12 sessions · floor',             'floor',       'sessions',  12,  9000.00,  60, 1, 'trainer', NULL),
  ('24 sessions · floor',             'floor',       'sessions',  24, 16800.00, 120, 2, 'trainer', NULL),
  ('12 sessions · home visits',       'home_visit',  'sessions',  12, 10800.00,  60, 3, 'trainer', NULL),
  ('Monthly · home visits',           'home_visit',  'period',  NULL,  7000.00,  30, 4, 'trainer', NULL),
  ('Monthly · online',                'remote',      'period',  NULL,  3000.00,  30, 5, 'trainer', NULL),
  ('Programming · 3 months',          'programming', 'period',  NULL,  4500.00,  90, 6, 'trainer', NULL),
  ('12 sessions · Iron Temple',       'floor',       'sessions',  12, 10000.00,  60, 7, 'gym',     60),
  ('24 sessions · Iron Temple',       'floor',       'sessions',  24, 18000.00, 120, 8, 'gym',     60)
) v(name, service, basis, sessions, amount, validity, ord, owner, share);

/* ── 5. the roster ───────────────────────────────────────────────────────── */

-- begin: how many days ago coaching started inside the 91-day window · since: when the
-- client first appeared (older than the window for the long-standing ones) ·
-- stop/gen_to: day offsets (negative = past) — see the diary below.
CREATE TEMP TABLE r ON COMMIT DROP AS
SELECT gen_random_uuid() AS id, v.*
FROM (VALUES
  --  key       name                  phone            status      ctype         mode          min begin since style      f     goal                                          dob           height activity   mship         reason            stop gen_to
  ('meera',   'Meera Iyer',          '+919884010101', 'active',   'independent','floor',       60,  91, 180, 'barbell', 0.75, 'Deadlift bodyweight by December',                 '1992-03-14', 163.0, 'light',    'accepted',   NULL::text,       NULL::int, 14),
  ('vikram',  'Vikram Singh',        '+919884010102', 'active',   'independent','floor',       60,  91, 240, 'barbell', 1.30, 'Add 8 kg of muscle before the new year',           '1988-11-02', 178.0, 'moderate', 'accepted',   NULL,             NULL,      14),
  ('priya',   'Priya Nair',          '+919884010103', 'active',   'independent','floor',       60,  86,  86, 'db',      0.50, 'Lose 6 kg before the wedding',                    '1995-07-21', 160.0, 'sedentary','accepted',   NULL,             NULL,      14),
  ('sneha',   'Sneha Kulkarni',      '+919884010104', 'active',   'gym',        'floor',       60,  60,  60, 'db',      0.50, 'Tone up and build a gym habit',                   '1997-01-30', 158.0, 'light',    'accepted',NULL,             NULL,      14),
  ('arjun',   'Arjun Reddy',         '+919884010105', 'active',   'independent','floor',       60,  33,  33, 'db',      0.90, 'Gain size, he is 62 kg at 176 cm',                '2001-05-09', 176.0, 'moderate', 'invited',    NULL,             NULL,      14),
  ('karthik', 'Karthik Menon',       '+919884010106', 'active',   'independent','home_visit',  45,  91, 150, 'home',    0.80, 'Stay strong through a desk job and a bad back',   '1984-09-17', 172.0, 'sedentary','accepted',NULL,             NULL,      14),
  ('divya',   'Divya Menon',         '+919884010107', 'active',   'independent','remote',      45,  62,  62, 'home',    0.50, 'Mobility and core, travels for work',             '1990-12-05', 165.0, 'light',    'accepted',NULL,             NULL,      14),
  ('rohan',   'Rohan Das',           '+919884010108', 'active',   'independent','floor',       60,  76,  76, 'barbell', 1.00, 'Get back to lifting after a long layoff',         '1993-04-26', 174.0, 'moderate', 'accepted',NULL,             NULL,     -22),
  ('kavya',   'Kavya Subramanian',   '+919884010109', 'active',   'independent','floor',       60,  91, 130, 'db',      0.55, 'Tone arms and legs, no bulk',                     '1996-08-11', 161.0, 'light',    'declined',   NULL,             NULL,      14),
  ('suresh',  'Suresh Babu',         '+919884010110', 'active',   'independent','floor',       60,  55,  55, 'barbell', 1.10, 'Bench 100 kg',                                    '1986-02-19', 179.0, 'active',   'accepted',NULL,             NULL,      14),
  ('nisha',   'Nisha Fernandes',     '+919884010111', 'active',   'gym',        'floor',       60,  45,  45, 'db',      0.55, 'Get fit after the baby',                          '1994-10-03', 164.0, 'light',    'not_invited',NULL,             NULL,      14),
  ('anjali',  'Anjali Rao',          '+919884010114', 'paused',   'independent','floor',       60,  85,  85, 'db',      0.50, 'Lose 8 kg',                                        '1991-05-15', 162.0, 'light',    'accepted','client_paused', -22,       -7),
  ('farhan',  'Farhan Ali',          '+919884010115', 'archived', 'independent','floor',       60,  78,  78, 'barbell', 0.95, 'Get stronger',                                     '1995-09-01', 175.0, 'moderate', 'removed','client_archived',-36,      -22),
  ('ritu',    'Ritu Sharma',         '+919884010116', 'prospect', 'independent','floor',       60,   3,   3, 'db',      0.50, 'Wants to start after Diwali',                     '1998-02-12', 159.0, 'sedentary','not_invited',NULL,             NULL,      14)
) v(key, name, phone, status, ctype, mode, minutes, begin, since, style, f, goal, dob, height, activity, mship, reason, stop, gen_to);

INSERT INTO client (id, trainer_id, name, phone, status, client_type, metadata, goal, date_of_birth, height_cm,
                    activity_level, membership_status, invited_at, accepted_at, accepted_policy_version, declined_at,
                    removed_at, removed_by, paused_at, paused_until, archived_at, archive_reason, archive_note, created_at)
SELECT r.id, k.tid, r.name, r.phone, r.status, r.ctype, '{"seed": "three_months"}'::jsonb, r.goal,
       r.dob::date, r.height, r.activity, r.mship,
       CASE WHEN r.mship <> 'not_invited' THEN pg_temp.ist(k.today - r.since + 1, '11:00') END,
       CASE WHEN r.mship IN ('accepted', 'removed') THEN pg_temp.ist(k.today - r.since + 2, '19:30') END,
       CASE WHEN r.mship IN ('accepted', 'removed') THEN '2026-09' END,           -- the notice in force (app.privacy.policy-version)
       CASE WHEN r.mship = 'declined' THEN pg_temp.ist(k.today - r.since + 4, '12:00') END,
       CASE WHEN r.mship = 'removed' THEN now() - interval '36 days' END,          -- Farhan left; the trainer archived him the day after
       CASE WHEN r.mship = 'removed' THEN 'client' END,
       CASE WHEN r.status = 'paused' THEN now() - interval '21 days' END,
       CASE WHEN r.status = 'paused' THEN k.today + 9 END,
       CASE WHEN r.status = 'archived' THEN now() - interval '35 days' END,
       CASE WHEN r.status = 'archived' THEN 'cost' END,
       CASE WHEN r.status = 'archived' THEN 'Moved to a cheaper gym package' END,
       pg_temp.ist(k.today - r.since, '10:00')
FROM r, k;

-- The weekly timetable. One person on the floor at a time: 06:00 · 07:15 · 08:30 · 09:45 and
-- 17:00 · 18:15 · 19:30 · 20:45 on a 75-minute pitch. day_no is the program day the slot trains.
CREATE TEMP TABLE sl ON COMMIT DROP AS
SELECT gen_random_uuid() AS id, v.*
FROM (VALUES
  ('meera',   1, '06:00'::time, 1), ('meera',   3, '06:00', 2), ('meera',   5, '06:00', 3),
  ('vikram',  1, '07:15', 1),       ('vikram',  3, '07:15', 2), ('vikram',  5, '07:15', 3),
  ('priya',   1, '08:30', 1),       ('priya',   3, '08:30', 2), ('priya',   5, '08:30', 3),
  ('sneha',   1, '09:45', 1),       ('sneha',   3, '09:45', 2), ('sneha',   5, '09:45', 3),
  ('arjun',   1, '17:00', 1),       ('arjun',   3, '17:00', 2),
  ('karthik', 1, '18:15', 1),       ('karthik', 3, '18:15', 2), ('karthik', 5, '18:15', 3),
  ('rohan',   1, '20:45', 1),       ('rohan',   3, '20:45', 2), ('rohan',   5, '20:45', 3),
  ('kavya',   2, '06:00', 1),       ('kavya',   4, '06:00', 2), ('kavya',   6, '06:00', 3),
  ('suresh',  2, '07:15', 1),       ('suresh',  4, '07:15', 2), ('suresh',  6, '07:15', 3),
  ('nisha',   2, '08:30', 1),       ('nisha',   4, '08:30', 2), ('nisha',   6, '08:30', 3),
  ('divya',   2, '17:00', 1),       ('divya',   4, '17:00', 2),
  ('anjali',  2, '19:30', 1),       ('anjali',  4, '19:30', 2), ('anjali',  6, '19:30', 3),
  ('farhan',  2, '20:45', 1),       ('farhan',  4, '20:45', 2)
) v(key, weekday, t, day_no);

UPDATE client_schedule cs
SET sessions_per_week = (SELECT count(*) FROM sl WHERE sl.key = r.key),
    session_duration_minutes = r.minutes,
    delivery_mode = r.mode
FROM r WHERE cs.client_id = r.id AND r.status <> 'prospect';

INSERT INTO client_schedule_slot (id, client_id, weekday, start_time, duration_minutes, delivery_mode, program_day)
SELECT sl.id, r.id, sl.weekday, sl.t, r.minutes, r.mode, sl.day_no
FROM sl JOIN r ON r.key = sl.key;

INSERT INTO client_note (client_id, trainer_id, body, pinned, created_at)
SELECT r.id, k.tid, v.body, v.pinned, now() - make_interval(days => v.ago)
FROM r, k, (VALUES
  ('meera',   'Prefers the squat rack by the window. Left shoulder clicks on overhead work — keep it neutral-grip.', true,  85),
  ('meera',   'Wants a deadlift at her own bodyweight by December. Currently pulling 62.5 for sets of five.',         false, 30),
  ('vikram',  'Works night shifts on Thursdays, so Friday mornings are heavy-fatigue. Do not programme singles on a Friday.', true, 80),
  ('priya',   'Wedding on the 14th of next month. Photographer has asked for shoulders and back — bias the accessories.', true, 40),
  ('priya',   'Referred her cousin Kavya. Gave two bonus sessions.',                                                false, 22),
  ('sneha',   'Gym membership is through Iron Temple. Packs are bought at the front desk.',                          true,  58),
  ('arjun',   'Needs to eat more, not train more: asked him to log breakfast for a week.',                           true,  25),
  ('karthik', 'Home visit — second-floor flat, no lift. Adjustable dumbbells are by the balcony door.',              true,  88),
  ('karthik', 'Back tightens after long flights. Hip hinge and dead bug before anything loaded.',                    false, 45),
  ('divya',   'Online only. Sends a video of the first set of each lift; reply the same evening.',                   true,  60),
  ('rohan',   'Stopped replying after the block ended. Still owes the balance on the last pack.',                    true,  17),
  ('kavya',   'Does not want to get bulky — reassure, then explain why we are still lifting heavy.',                 true,  88),
  ('suresh',  'Travelling for work most of last month: extended the pack by two weeks.',                             false, 32),
  ('nisha',   'Eight months post-natal. Cleared by her doctor for strength work. No crunches, no planks yet.',       true,  43),
  ('anjali',  'Paused for a family wedding and a trip home to Hyderabad. Back after the 15th.',                      true,  21),
  ('farhan',  'Left because of cost, not because of the coaching. Door is open.',                                    false, 35),
  ('ritu',    'Came in for a free assessment on a Saturday. Starting after Diwali, wants mornings.',                 true,   9)
) v(key, body, pinned, ago)
WHERE r.key = v.key;

/* ── 6. programs: templates first, then each client's blocks ─────────────── */

-- How each style trains each day. Everyone's program is built from these, scaled by their strength factor.
CREATE TEMP TABLE sty ON COMMIT DROP AS
SELECT * FROM (VALUES
  ('barbell',1,0,'squat','Main lifts',4),  ('barbell',1,1,'rdl','Main lifts',3),     ('barbell',1,2,'lunge','Accessory',3),
  ('barbell',1,3,'glute','Accessory',3),   ('barbell',1,4,'legcurl','Accessory',3),  ('barbell',1,5,'plank','Core',3),
  ('barbell',2,0,'bench','Main lifts',4),  ('barbell',2,1,'row','Main lifts',3),     ('barbell',2,2,'ohp','Accessory',3),
  ('barbell',2,3,'pulldown','Accessory',3),('barbell',2,4,'curl','Accessory',3),     ('barbell',2,5,'tri','Accessory',3),
  ('barbell',3,0,'dl','Main lifts',4),     ('barbell',3,1,'pushup','Main lifts',3),  ('barbell',3,2,'dbrow','Accessory',3),
  ('barbell',3,3,'stepup','Accessory',3),  ('barbell',3,4,'kbswing','Accessory',3),  ('barbell',3,5,'bapu','Core',3),
  ('db',1,0,'gsquat','Main lifts',4),      ('db',1,1,'dbrdl','Main lifts',3),        ('db',1,2,'lunge','Accessory',3),
  ('db',1,3,'glute','Accessory',3),        ('db',1,4,'legext','Accessory',3),        ('db',1,5,'deadbug','Core',3),
  ('db',2,0,'dbbench','Main lifts',4),     ('db',2,1,'row','Main lifts',3),          ('db',2,2,'ohp','Accessory',3),
  ('db',2,3,'pulldown','Accessory',3),     ('db',2,4,'curl','Accessory',3),          ('db',2,5,'tri','Accessory',3),
  ('db',3,0,'kbswing','Main lifts',4),     ('db',3,1,'pushup','Main lifts',3),       ('db',3,2,'dbrow','Accessory',3),
  ('db',3,3,'stepup','Accessory',3),       ('db',3,4,'farmer','Accessory',3),        ('db',3,5,'plank','Core',3),
  ('home',1,0,'gsquat','Main lifts',4),    ('home',1,1,'dbrdl','Main lifts',3),      ('home',1,2,'stepup','Accessory',3),
  ('home',1,3,'deadbug','Core',3),         ('home',1,4,'plank','Core',3),
  ('home',2,0,'pushup','Main lifts',4),    ('home',2,1,'dbrow','Main lifts',3),      ('home',2,2,'ohp','Accessory',3),
  ('home',2,3,'curl','Accessory',3),       ('home',2,4,'farmer','Accessory',3),
  ('home',3,0,'kbswing','Main lifts',4),   ('home',3,1,'lunge','Main lifts',3),      ('home',3,2,'dbbench','Accessory',3),
  ('home',3,3,'deadbug','Core',3),         ('home',3,4,'plank','Core',3)
) v(style, day, pos, ex, section, sets);

-- Library templates the trainer built. A standalone workout (program_id null) follows.
CREATE TEMP TABLE tpl ON COMMIT DROP AS
SELECT gen_random_uuid() AS id, v.*
FROM (VALUES
  ('Beginner full body · 3 day', 8, 3, 'db',      0.60, 'general',     'Three full-body days a week. The first thing a new client gets.'),
  ('Strength base · 3 day',      8, 3, 'barbell', 1.00, 'strength',    'Squat, press and pull, linear progression, deload every fourth week.'),
  ('Home strength · 3 day',      6, 3, 'home',    0.70, 'general',     'Dumbbells and a bench only. For home-visit clients.'),
  ('Fat loss circuit · 3 day',   8, 3, 'db',      0.60, 'weight_loss', 'Short rests, big movements, a finisher on every day.')
) v(name, weeks, days, style, f, goal, descr);

INSERT INTO program (id, origin, trainer_id, name, goal, description, weeks, days, created_at)
SELECT t.id, 'trainer', k.tid, t.name, t.goal, t.descr, t.weeks, t.days, now() - interval '100 days'
FROM tpl t, k;

-- Each client's blocks. The older ones are completed, the current one active; Anjali's is paused with her.
CREATE TEMP TABLE pg ON COMMIT DROP AS
SELECT gen_random_uuid() AS id, r.id AS client_id, v.key, v.name, v.weeks, v.style, r.f,
       (SELECT count(*) FROM sl WHERE sl.key = v.key)::int AS days,
       v.status, v.start_off, v.copy,
       (SELECT today FROM k) - v.start_off AS sd,
       (SELECT today FROM k) - v.start_off + v.weeks * 7 - 1 AS ed,
       CASE WHEN v.copy LIKE 'tpl:%'  THEN (SELECT t.id FROM tpl t WHERE t.name = substr(v.copy, 5))
            WHEN v.copy LIKE 'cert:%' THEN (SELECT p.id FROM program p WHERE p.origin = 'inclineyou'
                                              AND p.name = substr(v.copy, 6) AND p.deleted_at IS NULL LIMIT 1) END AS copy_id
FROM r JOIN (VALUES
  ('meera',   'Strength base',       8, 'barbell', 91, 'completed', NULL::text),
  ('meera',   'Strength block 2',   10, 'barbell', 35, 'active',    NULL),
  ('vikram',  'Strength base',       8, 'barbell', 91, 'completed', NULL),
  ('vikram',  'Hypertrophy block',  12, 'barbell', 35, 'active',    NULL),
  ('priya',   'Fat loss phase 1',    8, 'db',      86, 'completed', NULL),
  ('priya',   'Fat loss phase 2',    8, 'db',      30, 'active',    'tpl:Fat loss circuit · 3 day'),
  ('sneha',   'Gym starter',        12, 'db',      60, 'active',    'cert:Beginner full body'),
  ('arjun',   'Muscle gain base',    8, 'db',      33, 'active',    NULL),
  ('karthik', 'Home basics',         6, 'home',    91, 'completed', NULL),
  ('karthik', 'Home strength',      12, 'home',    49, 'active',    NULL),
  ('divya',   'Online starter',      6, 'home',    62, 'completed', NULL),
  ('divya',   'Mobility & core',     6, 'home',    20, 'active',    NULL),
  ('rohan',   'Strength base',       8, 'barbell', 76, 'completed', NULL),
  ('kavya',   'Beginner full body',  8, 'db',      91, 'completed', 'tpl:Beginner full body · 3 day'),
  ('kavya',   'Toning plan',        12, 'db',      35, 'active',    NULL),
  ('suresh',  'Powerbuilding',      12, 'barbell', 55, 'active',    NULL),
  ('nisha',   'Gym starter',        10, 'db',      45, 'active',    'cert:Beginner full body'),
  ('anjali',  'Fat loss phase 1',   12, 'db',      85, 'paused',    NULL),
  ('farhan',  'Strength base',       8, 'barbell', 78, 'completed', NULL)
) v(key, name, weeks, style, start_off, status, copy) ON v.key = r.key;

INSERT INTO program (id, origin, trainer_id, client_id, name, weeks, days, status, start_date, end_date,
                     copied_from_program_id, synced_at, created_at)
SELECT pg.id, 'trainer', k.tid, pg.client_id, pg.name, pg.weeks, pg.days, pg.status, pg.sd, pg.ed,
       pg.copy_id, CASE WHEN pg.copy_id IS NOT NULL THEN pg_temp.ist(pg.sd - 1, '18:00') END,
       pg_temp.ist(pg.sd - 1, '18:00')
FROM pg, k;

SELECT certified_program_count_use(pg.copy_id) FROM pg WHERE pg.copy LIKE 'cert:%' AND pg.copy_id IS NOT NULL;

-- Workouts, their exercises and their prescribed sets, for templates and client programs alike.
CREATE TEMP TABLE allp ON COMMIT DROP AS
SELECT id, weeks, days, style, f FROM tpl
UNION ALL SELECT id, weeks, days, style, f FROM pg;

INSERT INTO workout (origin, trainer_id, program_id, week, day, position, name)
SELECT 'trainer', k.tid, a.id, w, d, 0,
       (CASE a.style WHEN 'home' THEN ARRAY['Lower & core', 'Upper & carry', 'Conditioning']
                     ELSE ARRAY['Lower body', 'Upper body', 'Full body'] END)[d]
FROM allp a, k, generate_series(1, a.weeks) w, generate_series(1, a.days) d;

-- The two standalone workouts (the Workouts page's Templates tab). They had a name and notes and nothing in them —
-- the movements below were only ever written for program days — so the builder opened both as *This workout is
-- empty*. Ids are kept so their movements and sets can be written after the program days'.
CREATE TEMP TABLE sw ON COMMIT DROP AS
SELECT gen_random_uuid() AS id, v.*
FROM (VALUES ('mobility', 'Mobility flow · 15 min', 'Hips, thoracic spine, ankles. Slow, nasal breathing.'),
             ('finisher', 'Finisher · 10 min', 'Kettlebell swings and farmer carries, 30 on / 30 off.')) v(key, name, notes);

INSERT INTO workout (id, origin, trainer_id, name, notes)
SELECT sw.id, 'trainer', k.tid, sw.name, sw.notes FROM sw, k;

-- What is in them: position, movement, section, sets, and the rest that overrides the movement's own (null keeps it).
-- The finisher is 30 on / 30 off, so its rests are 30 s; its loads are the movement's base, unscaled.
CREATE TEMP TABLE swx ON COMMIT DROP AS
SELECT * FROM (VALUES
  ('mobility', 0, 'catcow',  'Warm-up',  2, NULL::int), ('mobility', 1, 'hip9090', 'Mobility', 2, NULL),
  ('mobility', 2, 'wgs',     'Mobility', 2, NULL),      ('mobility', 3, 'tspine',  'Mobility', 2, NULL),
  ('mobility', 4, 'ankle',   'Mobility', 2, NULL),      ('mobility', 5, 'sqhold',  'Mobility', 2, NULL),
  ('finisher', 0, 'kbswing', 'Finisher', 4, 30),        ('finisher', 1, 'farmer',  'Finisher', 4, 30)
) v(wkey, pos, ex, section, sets, rest);

INSERT INTO workout_exercise (workout_id, exercise_id, position, section)
SELECT wk.id, ex.id, s.pos, s.section
FROM workout wk
JOIN allp a ON a.id = wk.program_id
JOIN sty s ON s.style = a.style AND s.day = wk.day
JOIN ex ON ex.key = s.ex;

INSERT INTO workout_set (workout_exercise_id, position, load_kind, load_value, effort_kind, effort_value, rest_seconds)
SELECT we.id, p, ex.load_kind,
       CASE WHEN ex.load_kind = 'weight' THEN
         greatest(2.5, round(ex.base_load * a.f * (1 + 0.03 * (wk.week - 1))
                             * CASE WHEN wk.week % 4 = 0 THEN 0.9 ELSE 1 END / 2.5) * 2.5) END,
       ex.effort_kind,
       CASE WHEN ex.effort_kind = 'time' THEN least(90, ex.base_effort + 5 * (wk.week - 1)) ELSE ex.base_effort END,
       ex.rest
FROM workout_exercise we
JOIN workout wk ON wk.id = we.workout_id
JOIN allp a ON a.id = wk.program_id
JOIN sty s ON s.style = a.style AND s.day = wk.day AND s.pos = we.position
JOIN ex ON ex.key = s.ex
CROSS JOIN generate_series(1, s.sets) p;

INSERT INTO workout_exercise (workout_id, exercise_id, position, section)
SELECT sw.id, ex.id, x.pos, x.section
FROM swx x JOIN sw ON sw.key = x.wkey JOIN ex ON ex.key = x.ex;

INSERT INTO workout_set (workout_exercise_id, position, load_kind, load_value, effort_kind, effort_value, rest_seconds)
SELECT we.id, p, ex.load_kind, CASE WHEN ex.load_kind = 'weight' THEN ex.base_load END,
       ex.effort_kind, ex.base_effort, coalesce(x.rest, ex.rest)
FROM swx x
JOIN sw ON sw.key = x.wkey
JOIN workout_exercise we ON we.workout_id = sw.id AND we.position = x.pos
JOIN ex ON ex.key = x.ex
CROSS JOIN generate_series(1, x.sets) p;

/* ── 7. the gym ──────────────────────────────────────────────────────────── */

INSERT INTO gym_arrangement (trainer_id, gym_name, base_kind, base_amount, currency, starts_month, ends_month, note)
SELECT k.tid, 'Iron Temple Fitness', 'minimum', v.amt, 'INR', v.s, v.e, v.note
FROM k, (VALUES
  (12000.00, (date_trunc('month', (SELECT today FROM k)) - interval '3 months')::date,
             (date_trunc('month', (SELECT today FROM k)) - interval '2 months')::date,
             'Minimum ₹12,000 a month, or 60% of what the front desk collects — whichever is larger'),
  (15000.00, (date_trunc('month', (SELECT today FROM k)) - interval '1 month')::date,
             NULL::date,
             'Minimum raised to ₹15,000 from September')
) v(amt, s, e, note);

/* ── 8. the diary ────────────────────────────────────────────────────────── */

-- Every slot on every day of the 13 weeks behind today and the 2 ahead, from the day coaching began.
CREATE TEMP TABLE ses ON COMMIT DROP AS
SELECT gen_random_uuid() AS id, r.id AS client_id, r.key, sl.id AS slot_id, r.mode, r.minutes, sl.day_no,
       d::date AS day, pg_temp.ist(d::date, sl.t) AS at,
       pg_temp.h(r.key || d::date::text) AS h,        -- by key, not id: the same diary every run
       false AS opened,
       NULL::text AS outcome, NULL::text AS cancel_reason, NULL::text AS note,
       'trainer'::text AS logged_by
FROM r
JOIN sl ON sl.key = r.key
CROSS JOIN k
JOIN LATERAL generate_series(k.today - r.begin, k.today + r.gen_to, interval '1 day') d
  ON extract(isodow FROM d)::int = sl.weekday;

UPDATE ses s SET
  outcome = CASE
    WHEN r.reason IS NOT NULL AND (s.day - k.today) > r.stop                      THEN 'cancelled'
    WHEN s.day BETWEEN k.today - 52 AND k.today - 50                              THEN 'cancelled'   -- the trainer was away
    WHEN s.at + make_interval(mins => s.minutes) > now()                          THEN 'scheduled'
    WHEN s.h % 100 < 84                                                            THEN 'done'
    WHEN s.h % 100 < 90                                                            THEN 'no_show'
    ELSE 'cancelled' END,
  cancel_reason = CASE
    WHEN r.reason IS NOT NULL AND (s.day - k.today) > r.stop                      THEN r.reason
    WHEN s.day BETWEEN k.today - 52 AND k.today - 50                              THEN 'trainer'
    WHEN s.at + make_interval(mins => s.minutes) <= now() AND s.h % 100 >= 90
         THEN CASE WHEN s.h % 100 < 98 THEN 'client' ELSE 'trainer' END END
FROM r, k WHERE r.id = s.client_id;

-- The shapes the Today queue and the attention rows are written to find.
UPDATE ses SET outcome = 'no_show'                                          -- Rohan stopped turning up before he stopped booking
WHERE key = 'rohan' AND outcome = 'done' AND day >= (SELECT today FROM k) - 28;

UPDATE ses s SET outcome = 'no_show', cancel_reason = NULL                  -- Karthik: his two latest are no-shows
FROM (SELECT id FROM ses WHERE key = 'karthik' AND outcome = 'done' ORDER BY at DESC LIMIT 2) x
WHERE s.id = x.id;

-- Every session that has already happened is settled (done, no-show or cancelled): nothing is left unmarked or half-logged,
-- so Today's hero never shows a forgotten session as a running one.

UPDATE ses SET note = (ARRAY['Left knee a little tight, kept depth shallow', 'Hit a rep PR on the main lift',
                             'Short on sleep — dropped the last set', 'Great energy today',
                             'Asked about protein; sent the cheat sheet', 'Shoulder niggle, swapped the press'])[1 + h % 6]
WHERE outcome = 'done' AND h % 25 = 0;

-- Workouts a client did ALONE, from the portal, on the trainer's day off: logged_by = 'client', no slot, no delivery
-- mode, never charged to a pack, and not in the trainer's diary. They run the day their own plan names, on the program
-- that was live that Sunday (a Sunday between blocks gets none).
INSERT INTO ses (id, client_id, key, slot_id, mode, minutes, day_no, day, at, h, opened, outcome, cancel_reason, note, logged_by)
SELECT gen_random_uuid(), r.id, r.key, NULL, NULL, 40 + pg_temp.h(r.key || d::date::text || 'len') % 15,
       1 + pg_temp.h(r.key || d::date::text || 'day') % (SELECT count(*) FROM sl WHERE sl.key = r.key)::int,
       d::date, pg_temp.ist(d::date, '07:30'), pg_temp.h(r.key || d::date::text || 'solo'), false, 'done', NULL,
       CASE WHEN pg_temp.h(r.key || d::date::text || 'n') % 4 = 0 THEN 'Did this one at home, felt good' END, 'client'
FROM r CROSS JOIN k
JOIN LATERAL generate_series(k.today - least(r.begin, 63), k.today - 1, interval '1 day') d ON extract(isodow FROM d) = 7
WHERE r.key IN ('meera', 'vikram', 'priya', 'divya', 'suresh', 'karthik')
  AND pg_temp.h(r.key || d::date::text || 'solo') % 100 < 55;

DELETE FROM ses s                                                    -- no live program that day: nothing to run
WHERE s.logged_by = 'client' AND NOT EXISTS (
  SELECT 1 FROM pg JOIN workout wk ON wk.program_id = pg.id
  WHERE pg.client_id = s.client_id AND s.day BETWEEN pg.sd AND pg.ed
    AND wk.week = least(pg.weeks, (s.day - pg.sd) / 7 + 1) AND wk.day = s.day_no);

INSERT INTO scheduled_session (id, trainer_id, client_id, workout_id, slot_id, scheduled_at, duration_minutes,
                               status, delivery_mode, cancel_reason, started_at, ended_at, notes, created_at,
                               logged_by, paused_seconds)
SELECT s.id, k.tid, s.client_id,
       (SELECT wk.id FROM workout wk JOIN pg ON pg.id = wk.program_id
        WHERE pg.client_id = s.client_id AND s.day BETWEEN pg.sd AND pg.ed
          AND wk.week = least(pg.weeks, (s.day - pg.sd) / 7 + 1) AND wk.day = s.day_no
        LIMIT 1),
       s.slot_id, s.at, s.minutes, s.outcome, s.mode, s.cancel_reason,
       CASE WHEN s.outcome = 'done' OR s.opened THEN s.at + interval '3 minutes' END,
       CASE WHEN s.outcome = 'done' THEN s.at + make_interval(mins => s.minutes - 3) END,
       s.note,
       CASE WHEN s.logged_by = 'client' THEN s.at - interval '10 minutes' ELSE least(s.at, now()) - interval '9 days' END,
       s.logged_by,
       CASE WHEN s.logged_by = 'client' THEN s.h % 240 ELSE 0 END
FROM ses s, k;

/* ── 9. what was logged in the sessions ──────────────────────────────────── */

-- Swaps: the bench was taken, the squat was too hard that day.
CREATE TEMP TABLE swp ON COMMIT DROP AS
SELECT f.id AS from_id, t.id AS to_id, v.reason, v.every, v.lf
FROM (VALUES ('bench', 'dbbench', 'unavailable', 9, 0.40), ('squat', 'gsquat', 'difficulty', 12, 0.30)) v(fk, tk, reason, every, lf)
JOIN ex f ON f.key = v.fk JOIN ex t ON t.key = v.tk;

INSERT INTO session_exercise (session_id, client_id, exercise_id, position, source, planned_from,
                              swapped_from_exercise_id, swap_reason)
SELECT s.id, s.client_id, coalesce(sw.to_id, we.exercise_id), we.position, 'planned', we.id,
       CASE WHEN sw.to_id IS NOT NULL THEN we.exercise_id END, sw.reason
FROM scheduled_session s
JOIN workout_exercise we ON we.workout_id = s.workout_id
LEFT JOIN swp sw ON sw.from_id = we.exercise_id AND pg_temp.h(s.id::text || we.position::text) % sw.every = 0
                 AND s.logged_by = 'trainer'
WHERE s.started_at IS NOT NULL AND s.tenant_id = (SELECT ten FROM k);

-- A movement the trainer added on the day.
INSERT INTO session_exercise (session_id, client_id, exercise_id, position, source)
SELECT s.id, s.client_id, (SELECT id FROM ex WHERE key = 'plank'),
       (SELECT max(position) + 1 FROM session_exercise WHERE session_id = s.id), 'added'
FROM scheduled_session s
WHERE s.status = 'done' AND s.logged_by = 'trainer' AND s.workout_id IS NOT NULL AND pg_temp.h(s.id::text || 'add') % 7 = 0
  AND s.tenant_id = (SELECT ten FROM k);

-- Clients with no program (Lakshmi, and the days a block had lapsed): the trainer builds the session as it goes.
INSERT INTO session_exercise (session_id, client_id, exercise_id, position, source)
SELECT s.id, s.client_id, ex.id, v.pos, 'added'
FROM scheduled_session s
JOIN (VALUES (0, 'glute'), (1, 'stepup'), (2, 'deadbug'), (3, 'plank')) v(pos, key) ON true
JOIN ex ON ex.key = v.key
WHERE s.status = 'done' AND s.logged_by = 'trainer' AND s.workout_id IS NULL AND s.tenant_id = (SELECT ten FROM k);

UPDATE session_exercise se SET removed_at = s.started_at + interval '40 minutes'
FROM scheduled_session s
WHERE s.id = se.session_id AND se.source = 'planned' AND se.position = 5
  AND s.status = 'done' AND s.logged_by = 'trainer' AND pg_temp.h(se.id::text) % 40 = 0 AND s.tenant_id = (SELECT ten FROM k);

-- Planned sets: the prescription copied, the actuals a little below or above it.
INSERT INTO set_log (session_exercise_id, position, planned, load_kind, effort_kind,
                     target_load_value, target_effort_value, rest_seconds,
                     load_value, effort_value, rpe, done_at, entered_by)
SELECT se.id, ws.position, true, ws.load_kind, ws.effort_kind, ws.load_value, ws.effort_value, ws.rest_seconds,
       CASE WHEN d.done AND ws.load_kind = 'weight' THEN
         greatest(2.5, round((ws.load_value * coalesce(sw.lf, 1)
                              + CASE WHEN x.h % 11 = 0 THEN 2.5 WHEN x.h % 7 = 0 THEN -2.5 ELSE 0 END) / 2.5) * 2.5) END,
       CASE WHEN d.done THEN
         greatest(1, ws.effort_value - CASE WHEN ws.effort_kind = 'reps'
                                            THEN (x.h % 4 = 0)::int + (ws.position = 3 AND x.h % 2 = 0)::int ELSE 0 END) END,
       CASE WHEN d.done THEN least(9.5, 6 + 0.5 * (ws.position - 1) + 0.5 * (x.h % 3)) END,
       CASE WHEN d.done THEN s.started_at + make_interval(mins => se.position * 8 + ws.position * 2) END,
       s.logged_by
FROM session_exercise se
JOIN scheduled_session s ON s.id = se.session_id
JOIN workout_set ws ON ws.workout_exercise_id = se.planned_from
LEFT JOIN swp sw ON sw.from_id = se.swapped_from_exercise_id AND sw.to_id = se.exercise_id
CROSS JOIN LATERAL (SELECT pg_temp.h(se.id::text || ws.position::text) AS h) x
CROSS JOIN LATERAL (SELECT se.removed_at IS NULL AND (s.status = 'done' OR se.position < 2) AS done) d
WHERE se.source = 'planned' AND s.tenant_id = (SELECT ten FROM k);

-- Added movements: unplanned sets, no targets.
INSERT INTO set_log (session_exercise_id, position, planned, load_kind, effort_kind, load_value, effort_value, rpe, done_at)
SELECT se.id, p, false, ex.load_kind, ex.effort_kind,
       CASE WHEN ex.load_kind = 'weight' THEN greatest(2.5, round(ex.base_load * r.f * 0.8 / 2.5) * 2.5) END,
       ex.base_effort, 7, s.started_at + make_interval(mins => 40 + se.position * 3 + p * 2)
FROM session_exercise se
JOIN scheduled_session s ON s.id = se.session_id
JOIN r ON r.id = se.client_id
JOIN ex ON ex.id = se.exercise_id
CROSS JOIN generate_series(1, 2) p
WHERE se.source = 'added' AND s.tenant_id = (SELECT ten FROM k)
  AND s.started_at + make_interval(mins => 40 + se.position * 3 + p * 2) <= s.ended_at;

/* ── 10. the money book ──────────────────────────────────────────────────── */

-- Done sessions, numbered per client: a session is paid for by whichever pack its number falls in.
CREATE TEMP TABLE dn ON COMMIT DROP AS
SELECT s.id, s.client_id, s.ended_at, s.scheduled_at,
       row_number() OVER (PARTITION BY s.client_id ORDER BY s.scheduled_at) AS rn
FROM scheduled_session s
WHERE s.status = 'done' AND s.logged_by = 'trainer' AND s.tenant_id = (SELECT ten FROM k);   -- a solo workout charges nothing

-- Pack size sequence per client. A pack exists only once the client has reached it.
CREATE TEMP TABLE pp ON COMMIT DROP AS
SELECT * FROM (VALUES
  ('meera',   1, '24 sessions · floor',       'full',        NULL::int),
  ('meera',   2, '12 sessions · floor',       'full',        NULL),
  ('meera',   3, '12 sessions · floor',       'full',        NULL),
  ('vikram',  1, '24 sessions · floor',       'full',        NULL),
  ('vikram',  2, '24 sessions · floor',       'full',        NULL),
  ('priya',   1, '12 sessions · floor',       'full',        NULL),
  ('priya',   2, '12 sessions · floor',       'two',         NULL),
  ('priya',   3, '12 sessions · floor',       'full',        NULL),
  ('sneha',   1, '12 sessions · Iron Temple', 'full',        NULL),
  ('sneha',   2, '12 sessions · Iron Temple', 'full',        NULL),
  ('arjun',   1, '12 sessions · floor',       'full',        NULL),
  ('karthik', 1, '12 sessions · home visits', 'full',        NULL),
  ('karthik', 2, '12 sessions · home visits', 'full',        NULL),
  ('karthik', 3, '12 sessions · home visits', 'full',        NULL),
  ('rohan',   1, '12 sessions · floor',       'full',        NULL),
  ('rohan',   2, '12 sessions · floor',       'part:6000',   -14),
  ('kavya',   1, '12 sessions · floor',       'wo:500',      NULL),
  ('kavya',   2, '12 sessions · floor',       'full',        NULL),
  ('kavya',   3, '12 sessions · floor',       'full',        NULL),
  ('suresh',  1, '12 sessions · floor',       'full',        NULL),
  ('suresh',  2, '12 sessions · floor',       'none',        3),
  ('nisha',   1, '12 sessions · Iron Temple', 'full',        NULL),
  ('nisha',   2, '12 sessions · Iron Temple', 'full',        NULL),
  ('anjali',  1, '12 sessions · floor',       'full',        NULL),
  ('anjali',  2, '24 sessions · floor',       'full',        NULL),
  ('farhan',  1, '12 sessions · floor',       'full+refund', NULL)
) v(key, seq, pack, pay, due_off);

CREATE TEMP TABLE sp ON COMMIT DROP AS
SELECT gen_random_uuid() AS id, r.id AS client_id, pp.key, pp.seq, pk.id AS pack_id, pk.name, pk.service,
       pk.sessions AS total, pk.amount, pk.validity_days, pk.trainer_share_percent AS share, pp.pay, pp.due_off,
       coalesce(sum(pk.sessions) OVER (PARTITION BY pp.key ORDER BY pp.seq
                                       ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS before
FROM pp
JOIN r ON r.key = pp.key
JOIN pack pk ON pk.name = pp.pack AND pk.tenant_id = (SELECT ten FROM k) AND pk.deleted_at IS NULL;

DELETE FROM sp WHERE before >= (SELECT count(*) FROM dn WHERE dn.client_id = sp.client_id);

ALTER TABLE sp ADD first_day date;
UPDATE sp SET first_day = (SELECT (min(dn.scheduled_at) AT TIME ZONE 'Asia/Kolkata')::date FROM dn
                           WHERE dn.client_id = sp.client_id AND dn.rn > sp.before AND dn.rn <= sp.before + sp.total);

-- The monthly packs (online, home visits): a new one every thirty days.
CREATE TEMP TABLE pm ON COMMIT DROP AS
SELECT gen_random_uuid() AS id, r.id AS client_id, v.key, pk.id AS pack_id, pk.name, pk.service, pk.amount,
       pk.validity_days, (SELECT today FROM k) - v.start_off AS start_date
FROM (VALUES ('divya', 'Monthly · online', 62), ('divya', 'Monthly · online', 32), ('divya', 'Monthly · online', 2)
             ) v(key, pack, start_off)
JOIN r ON r.key = v.key
JOIN pack pk ON pk.name = v.pack AND pk.tenant_id = (SELECT ten FROM k) AND pk.deleted_at IS NULL;

-- Every package, whichever basis, in one list.
CREATE TEMP TABLE pk ON COMMIT DROP AS
SELECT sp.id, sp.client_id, sp.key, sp.pack_id, sp.name, sp.service, 'sessions'::text AS basis, sp.total,
       sp.amount, sp.first_day AS start_date,
       sp.first_day + sp.validity_days AS end_date,
       coalesce((SELECT today FROM k) + sp.due_off, sp.first_day) AS due_date,
       sp.share, sp.pay, pg_temp.ist(sp.first_day - 1, '19:00') AS created_at, sp.seq
FROM sp
UNION ALL
SELECT pm.id, pm.client_id, pm.key, pm.pack_id, pm.name, pm.service, 'period', NULL::int, pm.amount,
       pm.start_date, pm.start_date + pm.validity_days, pm.start_date, NULL::numeric, 'full',
       pg_temp.ist(pm.start_date, '09:00'), NULL::int
FROM pm;

-- Suresh's pack was extended by two weeks; the end it was first sold with is therefore two weeks earlier.
UPDATE pk SET end_date = (SELECT today FROM k) - 9 WHERE key = 'suresh' AND seq = 2;

INSERT INTO package (id, trainer_id, client_id, pack_id, name, service, basis, sessions_total, sessions_remaining,
                     amount, currency, start_date, end_date, due_date, trainer_share_percent, created_at)
SELECT pk.id, k.tid, pk.client_id, pk.pack_id, pk.name, pk.service, pk.basis, pk.total, pk.total,
       pk.amount, 'INR', pk.start_date, pk.end_date, pk.due_date, pk.share, pk.created_at
FROM pk, k;

-- Payments. Gym clients pay the gym: no method, no reference, and the trigger stamps who collected.
CREATE TEMP TABLE pay ON COMMIT DROP AS
SELECT gen_random_uuid() AS id, pk.id AS package_id, pk.client_id, pk.key, q.amount, q.status, q.at,
       (r.ctype = 'gym') AS gym,
       row_number() OVER (ORDER BY q.at, pk.id) AS n,
       pg_temp.h(pk.id::text || q.status) % 100 AS h
FROM pk
JOIN r ON r.id = pk.client_id
CROSS JOIN LATERAL (
  SELECT * FROM (VALUES
    -- the whole price, at the front desk or on UPI, the evening before the first session
    (pk.amount, 'paid', pk.created_at, pk.pay IN ('full', 'full+refund')),
    -- half now, half sixteen days later
    (round(pk.amount / 2), 'paid', pk.created_at, pk.pay = 'two'),
    (pk.amount - round(pk.amount / 2), 'paid', pk.created_at + interval '16 days', pk.pay = 'two'),
    -- a part payment that is never completed
    (CASE WHEN pk.pay LIKE 'part:%' THEN substr(pk.pay, 6)::numeric END, 'paid', pk.created_at, pk.pay LIKE 'part:%'),
    -- a discount forgiven after the fact
    (CASE WHEN pk.pay LIKE 'wo:%' THEN pk.amount - substr(pk.pay, 4)::numeric END, 'paid', pk.created_at, pk.pay LIKE 'wo:%'),
    (CASE WHEN pk.pay LIKE 'wo:%' THEN substr(pk.pay, 4)::numeric END, 'write_off', pk.created_at + interval '20 days', pk.pay LIKE 'wo:%')
  ) v(amount, status, at, applies) WHERE v.applies AND v.at <= now()
) q;

INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, collected_by, method, status,
                     reference, paid_at, written_off_at, created_at)
SELECT p.id, k.tid, p.client_id, p.package_id, p.amount, 'INR', CASE WHEN p.gym THEN 'gym' ELSE 'trainer' END,
       CASE WHEN p.gym OR p.status = 'write_off' THEN NULL
            WHEN p.h < 55 THEN 'upi' WHEN p.h < 80 THEN 'cash' ELSE 'bank_transfer' END,
       p.status,
       CASE WHEN NOT p.gym AND p.status = 'paid' AND p.h < 55 THEN 'UPI' || (412000000 + p.n)::text
            WHEN NOT p.gym AND p.status = 'paid' AND p.h >= 80 THEN 'NEFT' || (550100 + p.n)::text END,
       CASE WHEN p.status = 'paid' THEN p.at END,
       CASE WHEN p.status = 'write_off' THEN p.at END,
       p.at
FROM pay p, k
ORDER BY p.at, p.n;

-- Each session is charged to the pack it falls in, in the order it happened.
INSERT INTO package_adjustment (trainer_id, package_id, client_id, kind, sessions, session_id, effective_at, created_at)
SELECT k.tid, sp.id, dn.client_id, 'session', -1, dn.id, dn.ended_at, dn.ended_at
FROM dn
JOIN sp ON sp.client_id = dn.client_id AND dn.rn > sp.before AND dn.rn <= sp.before + sp.total
CROSS JOIN k
ORDER BY dn.ended_at;

-- A package that has used every session is complete; a monthly one is complete when its month is.
UPDATE package p SET status = 'completed',
       closed_at = (SELECT max(a.effective_at) FROM package_adjustment a WHERE a.package_id = p.id AND a.kind = 'session')
WHERE p.tenant_id = (SELECT ten FROM k) AND p.basis = 'sessions' AND p.sessions_remaining = 0 AND p.status = 'active';

UPDATE package p SET status = 'completed', closed_at = pg_temp.ist(p.end_date, '23:59')
WHERE p.tenant_id = (SELECT ten FROM k) AND p.basis = 'period' AND p.end_date < (SELECT today FROM k) AND p.status = 'active';

-- The life a package has: pause, extend, a bonus, a due date moved.
INSERT INTO package_adjustment (trainer_id, package_id, client_id, kind, days, sessions, reason, effective_at, created_at, due_date)
SELECT k.tid, cur.id, cur.client_id, v.kind, v.days, v.sessions, v.reason,
       now() - make_interval(days => v.ago), now() - make_interval(days => v.ago),
       CASE WHEN v.kind = 'due_date' THEN (SELECT today FROM k) - 14 END
FROM k,
     (VALUES ('suresh', 'extend',   14, 0, 'Travelling for work, two weeks added', 30),
             ('priya',  'sessions',  0, 2, 'Referral bonus: brought her cousin',   22),
             ('rohan',  'due_date',  0, 0, 'Asked for time until salary day',      20),
             ('anjali', 'pause',     0, 0, 'Away for a family wedding',            21)) v(key, kind, days, sessions, reason, ago)
JOIN LATERAL (SELECT p.id, p.client_id FROM package p JOIN r ON r.id = p.client_id
              WHERE r.key = v.key AND p.deleted_at IS NULL AND p.basis = 'sessions'
              ORDER BY (p.status = 'active') DESC, p.created_at DESC LIMIT 1) cur ON true;

-- Farhan finished ten of twelve, left, and was refunded the two he had not used.
INSERT INTO payment (trainer_id, client_id, package_id, amount, currency, collected_by, method, status, refunded_at, created_at)
SELECT k.tid, p.client_id, p.id, 1500.00, 'INR', 'trainer', 'upi', 'refund', now() - interval '34 days', now() - interval '34 days'
FROM k, package p JOIN r ON r.id = p.client_id
WHERE r.key = 'farhan' AND p.deleted_at IS NULL;

UPDATE package p SET status = 'refunded', closed_at = now() - interval '34 days'
FROM r WHERE r.id = p.client_id AND r.key = 'farhan' AND p.status IN ('active', 'completed');

-- The gym pays the trainer's share in parts, rarely naming a month.
INSERT INTO trainer_payout (trainer_id, gym_name, amount, currency, method, reference, note, received_at)
SELECT k.tid, 'Iron Temple Fitness', v.amt, 'INR', 'bank_transfer', v.ref, v.note, v.at
FROM k, (VALUES
  (12000.00, 'NEFT 4471820',  'July, in full',                  pg_temp.ist((date_trunc('month', (SELECT today FROM k)) - interval '2 months')::date + 7, '16:30')),
  (12000.00, 'NEFT 5039912',  'August, in full',                pg_temp.ist((date_trunc('month', (SELECT today FROM k)) - interval '1 month')::date + 9, '12:10')),
  ( 9000.00, 'NEFT 5610377',  'Part of September — rest to follow', pg_temp.ist(least((date_trunc('month', (SELECT today FROM k)))::date + 3, (SELECT today FROM k)), '17:45'))
) v(amt, ref, note, at);

/* ── 11. assessments ─────────────────────────────────────────────────────── */

INSERT INTO assessment_template (id, trainer_id, name, description, measurements, questions, created_at)
SELECT v.id, k.tid, v.name, v.descr, v.m::jsonb, v.q::jsonb, now() - interval '95 days'
FROM k, (VALUES
  (gen_random_uuid(), 'Monthly body check', 'Weight, composition and tape, every thirty days.',
   '{"on": true, "keys": ["weight", "body_fat", "waist", "hip", "chest", "arm"]}',
   '{"on": true, "items": [{"id": "q_pain", "text": "Did anything hurt or feel off while training?", "kind": "yesno", "scale": null, "options": [], "allowMultiple": false, "allowCustom": false}]}'),
  (gen_random_uuid(), 'Block review', 'At the end of a program: how the block went, and a movement screen.',
   '{"on": true, "keys": ["weight", "waist", "pushups", "plank"]}',
   '{"on": true, "items": [{"id": "q_progress", "text": "How would you rate your overall progress this block?", "kind": "rating", "scale": 10, "options": [], "allowMultiple": false, "allowCustom": false}, {"id": "q_consistency", "text": "How consistent were you with your training sessions?", "kind": "choice", "scale": null, "options": [{"id": "a", "text": "100% — hit every session"}, {"id": "b", "text": "75 to 99% — missed one or two"}, {"id": "c", "text": "50 to 74% — missed several"}, {"id": "d", "text": "Below 50% — struggled to show up"}], "allowMultiple": false, "allowCustom": false}, {"id": "q_blockers", "text": "What got in the way most often?", "kind": "choice", "scale": null, "options": [{"id": "a", "text": "Work"}, {"id": "b", "text": "Travel"}, {"id": "c", "text": "Illness"}, {"id": "d", "text": "Motivation"}, {"id": "e", "text": "Nothing, it was a clean block"}], "allowMultiple": true, "allowCustom": false}, {"id": "q_strongest", "text": "Which lift felt strongest this block?", "kind": "text", "scale": null, "options": [], "allowMultiple": false, "allowCustom": false}]}')
) v(id, name, descr, m, q);

-- The product's own weekly check-in (system_key), offered to clients under "Start a new one" in the portal:
-- weight, how the week felt out of five, one free line. The monthly body check is sent by its cycle, not started by a client.
INSERT INTO assessment_template (trainer_id, name, description, measurements, questions, system_key, client_can_start, created_at)
SELECT k.tid, 'Weekly check-in', 'A quick weekly word: weight, how the week felt, anything to tell me.',
       '{"on": true, "keys": ["weight"]}'::jsonb,
       '{"on": true, "items": [{"id": "q_energy", "text": "Energy this week", "kind": "rating", "scale": 5, "options": [], "allowMultiple": false, "allowCustom": false}, {"id": "q_note", "text": "Anything you want to tell me?", "kind": "text", "scale": null, "options": [], "allowMultiple": false, "allowCustom": false}]}'::jsonb,
       'weekly_check_in', true, now() - interval '95 days'
FROM k;

-- Where each client''s body is now, and how fast it is moving (kg or cm per thirty days; negative is gaining).
CREATE TEMP TABLE ap ON COMMIT DROP AS
SELECT r.id AS client_id, r.mship, v.*, r.begin
FROM r JOIN (VALUES
  --  key       next  weight  wl    fat   fl   waist wal  hip   chest arm
  ('meera',    3,   62.4,   0.4,  27.5, 0.5, 76.0, 1.0,  98.0,  90.0, 27.5),
  ('vikram',   9,   82.5,  -0.7,  17.8, 0.2, 84.0, 0.0,  99.0, 105.0, 36.0),
  ('priya',   14,   69.2,   1.9,  33.5, 0.9, 82.0, 2.0, 102.0,  94.0, 29.0),
  ('sneha',   20,   74.8,   1.1,  36.0, 0.6, 90.0, 1.5, 106.0,  98.0, 30.0),
  ('arjun',    6,   78.1,  -0.8,  22.5, 0.0, 87.0, 0.0,  99.0, 100.0, 33.0),
  ('kavya',   12,   64.0,   0.8,  30.0, 0.7, 77.0, 1.2, 100.0,  91.0, 26.5),
  ('suresh',  -5,   91.5,   1.0,  26.0, 0.5,100.0, 1.5, 106.0, 108.0, 35.0)
) v(key, next_off, w, wl, fat, fl, waist, wal, hip, chest, arm) ON v.key = r.key;

INSERT INTO assessment_schedule (client_id, trainer_id, template_id, interval_days, next_due_on)
SELECT ap.client_id, k.tid, t.id, 30, k.today + ap.next_off
FROM ap, k, assessment_template t WHERE t.name = 'Monthly body check' AND t.tenant_id = k.ten;

-- The 30-day cadence backwards from the next due date: one completed assessment per past month, the next one open.
CREATE TEMP TABLE aa ON COMMIT DROP AS
SELECT ap.*, n, (SELECT today FROM k) + ap.next_off - 30 * n AS due
FROM ap, generate_series(0, 3) n
WHERE n = 0 OR ((SELECT today FROM k) + ap.next_off - 30 * n <= (SELECT today FROM k)
                AND (SELECT today FROM k) - ((SELECT today FROM k) + ap.next_off - 30 * n) < ap.begin);

INSERT INTO assessment (client_id, trainer_id, template_id, schedule_id, name, form, due_on,
                        sent_at, completed_at, read_at, entered_by, readings, answers, created_at)
SELECT aa.client_id, k.tid, t.id, sc.id, 'Monthly body check',
       '{"measurements": [{"key": "weight", "label": "Body weight", "group": "Body composition", "unit": "kg"}, {"key": "body_fat", "label": "Body fat", "group": "Body composition", "unit": "%"}, {"key": "waist", "label": "Waist, at the navel", "group": "Girths", "unit": "cm"}, {"key": "hip", "label": "Hips, at the widest", "group": "Girths", "unit": "cm"}, {"key": "chest", "label": "Chest, at the nipple", "group": "Girths", "unit": "cm"}, {"key": "arm", "label": "Upper arm, right", "group": "Girths", "unit": "cm"}], "questions": [{"id": "q_pain", "text": "Did anything hurt or feel off while training?", "kind": "yesno", "scale": null, "options": [], "allowMultiple": false, "allowCustom": false}]}'::jsonb,
       aa.due,
       -- A client on the portal is SENT the assessment on its due day (the cycle's send_to_client); every second one comes back
       -- from the client, the rest were taken by the trainer in the session. The open one waits when its day has come.
       CASE WHEN aa.mship = 'accepted' AND aa.due <= k.today AND (aa.n = 0 OR aa.n % 2 = 1) THEN pg_temp.ist(aa.due, '08:00') END,
       CASE WHEN aa.n > 0 AND aa.mship = 'accepted' AND aa.n % 2 = 1 THEN pg_temp.ist(aa.due + 1, '19:40')
            WHEN aa.n > 0 THEN pg_temp.ist(aa.due, '08:15') END,
       CASE WHEN aa.n > 1 AND aa.mship = 'accepted' AND aa.n % 2 = 1 THEN pg_temp.ist(aa.due + 2, '09:00') END,   -- the trainer has read it
       CASE WHEN aa.n > 0 THEN CASE WHEN aa.mship = 'accepted' AND aa.n % 2 = 1 THEN 'client' ELSE 'trainer' END END,
       CASE WHEN aa.n > 0 THEN jsonb_build_object(
         'weight',   round(aa.w + aa.wl * (k.today - aa.due) / 30.0, 1),
         'body_fat', round(aa.fat + aa.fl * (k.today - aa.due) / 30.0, 1),
         'waist',    round((aa.waist + aa.wal * (k.today - aa.due) / 30.0) * 2) / 2,
         'hip',      round((aa.hip + 0.5 * aa.wal * (k.today - aa.due) / 30.0) * 2) / 2,
         'chest',    aa.chest,
         'arm',      round((aa.arm - 0.1 * (k.today - aa.due) / 30.0) * 2) / 2) ELSE '{}'::jsonb END,
       CASE WHEN aa.n > 0 THEN jsonb_build_object('q_pain', jsonb_build_object('yes', pg_temp.h(aa.client_id::text || aa.n::text) % 6 = 0)) ELSE '{}'::jsonb END,
       pg_temp.ist(aa.due - 2, '10:00')
FROM aa CROSS JOIN k
JOIN assessment_template t ON t.name = 'Monthly body check' AND t.tenant_id = k.ten
JOIN assessment_schedule sc ON sc.client_id = aa.client_id AND sc.template_id = t.id;

-- The block-end review, taken in the session when a program finishes.
INSERT INTO assessment (client_id, trainer_id, template_id, name, form, due_on, completed_at, entered_by, readings, answers, created_at)
SELECT r.id, k.tid, t.id, 'Block review',
       '{"measurements": [{"key": "weight", "label": "Body weight", "group": "Body composition", "unit": "kg"}, {"key": "waist", "label": "Waist, at the navel", "group": "Girths", "unit": "cm"}, {"key": "pushups", "label": "Push-ups in 60 seconds", "group": "Movement", "unit": "reps"}, {"key": "plank", "label": "Plank hold", "group": "Movement", "unit": "seconds"}], "questions": [{"id": "q_progress", "text": "How would you rate your overall progress this block?", "kind": "rating", "scale": 10, "options": [], "allowMultiple": false, "allowCustom": false}, {"id": "q_consistency", "text": "How consistent were you with your training sessions?", "kind": "choice", "scale": null, "options": [{"id": "a", "text": "100% — hit every session"}, {"id": "b", "text": "75 to 99% — missed one or two"}, {"id": "c", "text": "50 to 74% — missed several"}, {"id": "d", "text": "Below 50% — struggled to show up"}], "allowMultiple": false, "allowCustom": false}, {"id": "q_blockers", "text": "What got in the way most often?", "kind": "choice", "scale": null, "options": [{"id": "a", "text": "Work"}, {"id": "b", "text": "Travel"}, {"id": "c", "text": "Illness"}, {"id": "d", "text": "Motivation"}, {"id": "e", "text": "Nothing, it was a clean block"}], "allowMultiple": true, "allowCustom": false}, {"id": "q_strongest", "text": "Which lift felt strongest this block?", "kind": "text", "scale": null, "options": [], "allowMultiple": false, "allowCustom": false}]}'::jsonb,
       k.today - v.ago, pg_temp.ist(k.today - v.ago, '07:45'), 'trainer', v.readings::jsonb, v.answers::jsonb,
       pg_temp.ist(k.today - v.ago - 3, '10:00')
FROM r, k, assessment_template t,
     (VALUES
       ('meera',  36, '{"weight": 63.1, "waist": 77.5, "pushups": 22, "plank": 70}',
                     '{"q_progress": {"rating": 8}, "q_consistency": {"optionIds": ["a"]}, "q_blockers": {"optionIds": ["e"]}, "q_strongest": {"text": "Deadlift — pulled 60 for five"}}'),
       ('vikram', 36, '{"weight": 80.6, "waist": 84.5, "pushups": 41, "plank": 105}',
                     '{"q_progress": {"rating": 7}, "q_consistency": {"optionIds": ["b"]}, "q_blockers": {"optionIds": ["a", "b"]}, "q_strongest": {"text": "Bench"}}'),
       ('priya',  31, '{"weight": 72.9, "waist": 87.0, "pushups": 9, "plank": 40}',
                     '{"q_progress": {"rating": 9}, "q_consistency": {"optionIds": ["a"]}, "q_blockers": {"optionIds": ["e"]}, "q_strongest": {"text": "Goblet squat"}}'),
       ('kavya',  36, '{"weight": 66.0, "waist": 80.0, "pushups": 12, "plank": 50}',
                     '{"q_progress": {"rating": 6}, "q_consistency": {"optionIds": ["b"]}, "q_blockers": {"optionIds": ["a"]}, "q_strongest": {"text": "Leg press — no, the lunges"}}')
     ) v(key, ago, readings, answers)
WHERE r.key = v.key AND t.name = 'Block review' AND t.tenant_id = k.ten;

/* ── 12. nudges the trainer has sent ─────────────────────────────────────── */

INSERT INTO nudge_template (trainer_id, template, body)
SELECT k.tid, v.t, v.b
FROM k, (VALUES
  ('payment_reminder', 'Hi {name}, a gentle reminder — ₹{amount} is pending on your pack. UPI to inclineyou.demo@okicici whenever convenient. Thank you!'),
  ('renewal',          'Hi {name}, you have {remaining} sessions left on your pack. Shall I set up the next one so we do not lose momentum?')
) v(t, b);

INSERT INTO nudge_log (trainer_id, client_id, reason, template, package_id, session_id, message, sent_at)
SELECT k.tid, r.id, v.reason, v.template,
       CASE WHEN v.reason IN ('dues', 'pack_ending') THEN
         (SELECT p.id FROM package p WHERE p.client_id = r.id AND p.deleted_at IS NULL ORDER BY p.created_at DESC LIMIT 1) END,
       CASE WHEN v.reason IN ('no_show', 'session') THEN
         (SELECT s.id FROM scheduled_session s WHERE s.client_id = r.id AND s.deleted_at IS NULL
            AND s.status = CASE v.reason WHEN 'no_show' THEN 'no_show' ELSE 'done' END
          ORDER BY s.scheduled_at DESC LIMIT 1) END,
       v.message, now() - make_interval(days => v.ago)
FROM r, k, (VALUES
  ('rohan',   'dues',        'payment_reminder', 'Hi Rohan, a gentle reminder — ₹3,000 is pending on your pack. UPI to inclineyou.demo@okicici whenever convenient. Thank you!', 16),
  ('rohan',   'lapsed',      're_engagement',    'Hi Rohan, it has been a while — everything alright? Happy to start light whenever you are ready.', 10),
  ('karthik', 'no_show',     'missed_session',   'Hi Karthik, missed you this week — all well? We can move the visit to Saturday if that helps.', 1),
  ('meera',   'pack_ending', 'renewal',          'Hi Meera, you have ' || (SELECT p.sessions_remaining FROM package p JOIN r r2 ON r2.id = p.client_id
                                                   WHERE r2.key = 'meera' AND p.status = 'active' LIMIT 1)
                                                   || ' sessions left on your pack. Shall I set up the next one so we do not lose momentum?', 3),
  ('priya',   'session',     'well_done',        'Priya — goblet squat for 20 kg today. Four weeks ago that was 12. Proud of you.', 9),
  ('sneha',   'manual',      'check_in',         'Hi Sneha, how are you finding the new split? Tell me if anything feels off.', 20),
  ('kavya',   'manual',      'check_in',         'Hi Kavya, wanted to check in on the shoulder — better?', 58),
  ('vikram',  'session',     'well_done',        'Vikram, 80 kg for sets of five on the bench. That is a new best.', 44),
  ('arjun',   'session',     'session_reminder', 'Hi Arjun, tomorrow 5 pm. Bring a banana and your water bottle.', 4),
  ('divya',   'session',     'session_summary',  'Divya, today: goblet squat 4×12, push-ups 3×10, dead bug 3×10. Eat well, send me the form video tonight.', 6),
  ('anjali',  'manual',      'check_in',         'Hi Anjali, safe travels! Message me the day you are back and we will restart gently.', 20)
) v(key, reason, template, message, ago)
WHERE r.key = v.key;

INSERT INTO attention_dismissal (trainer_id, client_id, kind, band, snoozed_until)
SELECT k.tid, r.id, 'quiet', 'quiet', now() + interval '5 days'
FROM r, k WHERE r.key = 'anjali';

/* ── 12b. the weekly check-in cycles ─────────────────────────────────────── */

-- Two clients on a seven-day cycle, taking it in the portal: Divya's came due this morning and is waiting; Karthik's is
-- three days late. The rest of the weeks came back from the client; the trainer has read all but the latest.
INSERT INTO assessment_schedule (client_id, trainer_id, template_id, interval_days, next_due_on, send_to_client)
SELECT r.id, k.tid, t.id, 7, k.today + v.off, true
FROM k
JOIN assessment_template t ON t.system_key = 'weekly_check_in' AND t.tenant_id = k.ten
CROSS JOIN (VALUES ('divya', 0), ('karthik', -3)) v(key, off)
JOIN r ON r.key = v.key;

CREATE TEMP TABLE wk ON COMMIT DROP AS
SELECT r.id AS client_id, r.key, sc.id AS schedule_id, sc.template_id, n, sc.next_due_on - 7 * n AS due,
       CASE r.key WHEN 'divya' THEN 61.8 ELSE 79.9 END AS w0
FROM r
JOIN assessment_schedule sc ON sc.client_id = r.id
JOIN assessment_template t ON t.id = sc.template_id AND t.system_key = 'weekly_check_in'
CROSS JOIN k
CROSS JOIN generate_series(0, 12) n
WHERE n = 0 OR (sc.next_due_on - 7 * n <= k.today AND k.today - (sc.next_due_on - 7 * n) < r.begin - 3);

INSERT INTO assessment (client_id, trainer_id, template_id, schedule_id, name, form, due_on,
                        sent_at, completed_at, read_at, entered_by, readings, answers, created_at)
SELECT wk.client_id, k.tid, wk.template_id, wk.schedule_id, 'Weekly check-in',
       '{"measurements": [{"key": "weight", "label": "Body weight", "group": "Body composition", "unit": "kg"}], "questions": [{"id": "q_energy", "text": "Energy this week", "kind": "rating", "scale": 5, "options": [], "allowMultiple": false, "allowCustom": false}, {"id": "q_note", "text": "Anything you want to tell me?", "kind": "text", "scale": null, "options": [], "allowMultiple": false, "allowCustom": false}]}'::jsonb,
       wk.due,
       least(pg_temp.ist(wk.due, '07:00'), now() - interval '1 minute'),
       CASE WHEN wk.n > 0 THEN pg_temp.ist(wk.due, '07:00') + make_interval(hours => 3 + pg_temp.h(wk.key || wk.n::text) % 30) END,
       CASE WHEN wk.n > 1 THEN pg_temp.ist(wk.due + 2, '08:30') END,
       CASE WHEN wk.n > 0 THEN 'client' END,
       CASE WHEN wk.n > 0 THEN jsonb_build_object('weight', round(wk.w0 + 0.12 * wk.n + (pg_temp.h(wk.key || wk.n::text || 'w') % 5 - 2) * 0.1, 1))
            ELSE '{}'::jsonb END,
       CASE WHEN wk.n > 0 THEN jsonb_build_object(
              'q_energy', jsonb_build_object('rating', CASE WHEN pg_temp.h(wk.key || wk.n::text || 'e') % 9 = 0 THEN 2 ELSE 3 + pg_temp.h(wk.key || wk.n::text || 'e') % 3 END),
              'q_note',   jsonb_build_object('text', (ARRAY['Good week, slept well.', 'Travel made Wednesday hard but I got the rest done.',
                                                            'Back felt fine all week.', 'Busy at work, trained twice instead of three times.',
                                                            'Felt stronger on the lifts than last week.', 'Nothing to report.'])[1 + pg_temp.h(wk.key || wk.n::text || 'q') % 6]))
            ELSE '{}'::jsonb END,
       pg_temp.ist(wk.due - 7, '10:00')
FROM wk CROSS JOIN k;

/* ── 12c. the client portal ──────────────────────────────────────────────── */

-- The trainer's own switches for what clients see: session reminders on, evening before, money visible.
UPDATE trainer SET session_reminders = true, reminder_timing = 'evening_before', clients_see_money = true
WHERE id = (SELECT tid FROM k);

-- The accounts. accept_client_invite() makes exactly this: an app_user with role 'client' and the notice's version.
-- Farhan has one too: he accepted, then left, so he opens the "removed" wall and nothing behind it.
INSERT INTO app_user (phone, role, privacy_accepted_at, privacy_policy_version, created_at)
SELECT c.phone, 'client', c.accepted_at, c.accepted_policy_version, c.accepted_at
FROM client c JOIN r ON r.id = c.id
WHERE c.membership_status IN ('accepted', 'removed');

-- Arjun's link is live: sent three days ago, good for fourteen. Only the token's SHA-256 is stored, so the raw token is
-- derived from a fixed phrase and printed at the end — the one place a seed can show a working link.
UPDATE client SET invited_at = now() - interval '3 days' WHERE id = (SELECT id FROM r WHERE key = 'arjun');

CREATE TEMP TABLE link ON COMMIT DROP AS
SELECT rtrim(translate(encode(sha256(convert_to('inclineyou-seed-invite-arjun', 'UTF8')), 'base64'), '+/', '-_'), '=') AS token;

INSERT INTO client_invite (trainer_id, client_id, phone, token_hash, status, expires_at, decline_reason, policy_version,
                           accepted_at, declined_at, created_at, updated_at)
SELECT k.tid, c.id, c.phone,
       CASE WHEN r.key = 'arjun' THEN encode(sha256(convert_to((SELECT token FROM link), 'UTF8')), 'hex')
            ELSE encode(sha256(convert_to('inclineyou-seed-used-' || r.key, 'UTF8')), 'hex') END,
       CASE c.membership_status WHEN 'invited' THEN 'pending' WHEN 'declined' THEN 'declined' ELSE 'accepted' END,
       c.invited_at + interval '14 days',
       CASE WHEN c.membership_status = 'declined' THEN 'not_for_me' END,
       CASE WHEN c.membership_status IN ('accepted', 'removed') THEN c.accepted_policy_version END,
       CASE WHEN c.membership_status IN ('accepted', 'removed') THEN c.accepted_at END,
       CASE WHEN c.membership_status = 'declined' THEN c.declined_at END,
       c.invited_at, coalesce(c.accepted_at, c.declined_at, c.invited_at)
FROM client c JOIN r ON r.id = c.id CROSS JOIN k
WHERE c.membership_status IN ('invited', 'accepted', 'declined', 'removed');

-- The client's own settings. A client with no row has every switch on, so only people who changed something need one — but
-- every accepted client gets a row, because accept_client_invite() writes one.
INSERT INTO client_prefs (client_id, hide_weight, notify_session_reminder, notify_personal_best, auto_rest_timer,
                          channel_whatsapp, channel_push, whatsapp_opt_in_at, nominee_name, nominee_phone)
SELECT r.id, v.hide, v.rem, v.pb, v.rest, v.wa, v.push,
       CASE WHEN v.opt THEN c.accepted_at + interval '4 minutes' END, v.nn, v.np
FROM (VALUES
  --  key       hide_weight  reminders  best   rest   whatsapp  push   opt-in  nominee
  ('meera',   false, true,  true,  true,  true,  true,  true,  NULL::text,   NULL::text),
  ('vikram',  false, true,  false, false, true,  true,  true,  NULL,          NULL),
  ('priya',   true,  true,  true,  true,  true,  true,  true,  'Lata Nair',   '+919884020103'),   -- hides her weight: the wedding
  ('sneha',   false, true,  true,  true,  true,  false, true,  NULL,          NULL),
  ('karthik', false, true,  true,  true,  true,  true,  false, NULL,          NULL),               -- excluded from reminders below
  ('divya',   false, true,  true,  false, true,  true,  true,  NULL,          NULL),
  ('rohan',   false, true,  true,  false, false, false, false, NULL,          NULL),               -- everything off: gone quiet
  ('suresh',  false, true,  true,  true,  true,  true,  false, 'Geetha Babu', '+919884020110'),   -- never opted in to WhatsApp
  ('anjali',  false, true,  true,  true,  true,  true,  true,  NULL,          NULL),
  ('farhan',  false, true,  true,  true,  true,  true,  false, NULL,          NULL)
) v(key, hide, rem, pb, rest, wa, push, opt, nn, np)
JOIN r ON r.key = v.key
JOIN client c ON c.id = r.id;

-- When each of them last opened the portal (the lead measure), who the trainer left out of reminders, and the one client
-- whose money the trainer hides regardless of the workspace switch.
UPDATE client c SET last_portal_seen_at = now() - make_interval(hours => v.hrs), reminders_excluded = v.excl, portal_show_money = v.pm
FROM (VALUES
  ('meera',    2, false, NULL::boolean), ('vikram',  20, false, NULL), ('priya',    5, false, false),
  ('sneha',  140, false, NULL),         ('karthik', 70, true,  NULL), ('divya',    9, false, NULL),
  ('rohan',  980, false, NULL),         ('suresh',  48, false, NULL), ('anjali',  550, false, NULL)
) v(key, hrs, excl, pm)
JOIN r ON r.key = v.key
WHERE c.id = r.id;

-- Notes the trainer chose to show the client. Private is the default, and most notes here are exactly that.
UPDATE client_note n SET shared_with_client = true, shared_at = n.created_at + interval '1 hour'
FROM r
WHERE n.client_id = r.id AND (
     (r.key = 'meera'   AND n.body LIKE 'Wants a deadlift%')
  OR (r.key = 'priya'   AND n.body LIKE 'Wedding on the 14th%')
  OR (r.key = 'sneha'   AND n.body LIKE 'Gym membership%')
  OR (r.key = 'divya'   AND n.body LIKE 'Online only%')
  OR (r.key = 'karthik' AND n.body LIKE 'Back tightens%'));

-- Everyone with a live portal row, with the switches the bell honours (mint_client_notification() reads the same ones).
CREATE TEMP TABLE pc ON COMMIT DROP AS
SELECT r.id AS client_id, r.key, r.status AS cstatus, split_part(r.name, ' ', 1) AS first,
       coalesce(p.notify_program_updated, true) AS n_plan, coalesce(p.notify_session_reminder, true) AS n_session,
       coalesce(p.notify_trainer_note, true) AS n_note,    coalesce(p.notify_personal_best, true)   AS n_best,
       coalesce(p.notify_pack_changed, true) AS n_pack,    coalesce(p.notify_checkin, true)         AS n_checkin,
       coalesce(p.channel_whatsapp, true) AS wa, p.whatsapp_opt_in_at IS NOT NULL AS opted, c.reminders_excluded AS excl,
       coalesce(c.portal_show_money, t.clients_see_money) AS money
FROM r
JOIN client c ON c.id = r.id
JOIN trainer t ON t.id = c.trainer_id
LEFT JOIN client_prefs p ON p.client_id = r.id
WHERE c.membership_status = 'accepted';

CREATE TEMP TABLE tr ON COMMIT DROP AS
SELECT split_part(t.name, ' ', 1) AS first FROM trainer t JOIN k ON k.tid = t.id;

/* messages from the trainer: a recap after some sessions, the weekly word, and a free note */

INSERT INTO client_message (trainer_id, client_id, session_id, body, kind, at, read_at, created_at)
SELECT k.tid, s.client_id, s.id,
       'Well done, ' || pc.first || '. ' || (ARRAY['Strong session — every set landed. Eat well and sleep early tonight.',
         'Loads moved up on the main lift. Keep the same next time, and add a rep if it feels easy.',
         'A tough one, and you stayed with it. Rest tomorrow; walk if you can.',
         'Form on the second lift was much better than last week. Remember to brace before you lift.',
         'Short on time today but the main work got done. Stretch tonight.',
         'Sore the day after is normal — drink water and keep moving gently.'])[1 + pg_temp.h(pc.key || s.scheduled_at::text || 'recap') % 6],
       'recap', least(s.ended_at + interval '35 minutes', now()),
       CASE WHEN s.ended_at < now() - interval '2 days' THEN s.ended_at + interval '3 hours' END,
       least(s.ended_at + interval '35 minutes', now())
FROM scheduled_session s
JOIN pc ON pc.client_id = s.client_id
CROSS JOIN k
WHERE s.status = 'done' AND s.logged_by = 'trainer' AND s.tenant_id = k.ten AND s.deleted_at IS NULL
  AND (pg_temp.h(pc.key || s.scheduled_at::text || 'recap') % 7 = 0
       OR s.id = (SELECT l.id FROM scheduled_session l WHERE l.client_id = s.client_id AND l.status = 'done' AND l.logged_by = 'trainer'
                  ORDER BY l.scheduled_at DESC LIMIT 1));

-- The weekly word, on Sunday evening, for the last three weeks: what they did, and one line for the week ahead.
INSERT INTO client_message (trainer_id, client_id, body, kind, at, read_at, created_at)
SELECT k.tid, pc.client_id,
       'Week of ' || to_char(w.mon, 'FMDD Mon') || ': you trained ' || c.cnt || CASE WHEN c.cnt = 1 THEN ' time. ' ELSE ' times. ' END ||
       (ARRAY['Keep the same rhythm next week.', 'Next week we push the main lift a little.',
              'Protein and sleep are the two things to protect this week.'])[1 + pg_temp.h(pc.key || w.mon::text) % 3],
       'weekly', pg_temp.ist(w.mon + 6, '19:00'),
       CASE WHEN w.mon + 6 < k.today - 2 THEN pg_temp.ist(w.mon + 6, '21:30') END,
       pg_temp.ist(w.mon + 6, '19:00')
FROM pc
CROSS JOIN k
CROSS JOIN LATERAL (SELECT date_trunc('week', (k.today - 7 * g)::timestamp)::date AS mon FROM generate_series(1, 3) g) w
CROSS JOIN LATERAL (SELECT count(*) AS cnt FROM scheduled_session s
                    WHERE s.client_id = pc.client_id AND s.status = 'done' AND s.logged_by = 'trainer'
                      AND (s.scheduled_at AT TIME ZONE 'Asia/Kolkata')::date >= w.mon
                      AND (s.scheduled_at AT TIME ZONE 'Asia/Kolkata')::date < w.mon + 7) c
WHERE pc.cstatus = 'active' AND pc.key <> 'rohan' AND c.cnt > 0;

-- A free note, in the trainer's own words. Rohan's has not been opened: he has not opened anything in forty days.
INSERT INTO client_message (trainer_id, client_id, body, kind, at, read_at, created_at)
SELECT k.tid, r.id, v.body, 'note', pg_temp.ist(k.today - v.ago, '18:30'),
       CASE WHEN v.seen THEN pg_temp.ist(k.today - v.ago, '21:00') END, pg_temp.ist(k.today - v.ago, '18:30')
FROM k, (VALUES
  ('meera',   9, true,  'Pulled 62.5 for five on Friday. Two more sessions like that and we test a heavier single — proud of you.'),
  ('vikram', 16, true,  'New block starts Monday: more volume, same lifts. Eat a little more on training days.'),
  ('priya',   2, false, 'The photographer wants shoulders and back, so I have added two accessories to your upper day. Please keep your water up this week.'),
  ('sneha',  21, true,  'If you can, take the Tuesday slot — the floor is quieter and we can use the cables freely.'),
  ('karthik', 4, true,  'No stress about this week. If the back is stiff, do the hinge drill and the dead bug from your plan and message me.'),
  ('divya',  12, true,  'Great form videos this month. Send me the first set of your squats tonight and I will reply before breakfast.'),
  ('rohan',  12, false, 'Hi Rohan, whenever you are ready we restart light — no pressure and nothing to explain. Your pack is still here.'),
  ('suresh',  3, false, 'Bench is moving: 95 for a clean single is closer than you think. Sleep and protein this week.'),
  ('anjali', 22, true,  'Safe travels, and enjoy the wedding. Walk every day and message me the day you are back.')
) v(key, ago, seen, body)
JOIN r ON r.key = v.key;

/* how the sessions felt, in the client's own words — and what they did alone */

INSERT INTO workout_feedback (session_id, client_id, effort, note, at, created_at)
SELECT s.id, s.client_id,
       CASE WHEN x.e < 22 THEN 'easy' WHEN x.e < 78 THEN 'right' ELSE 'hard' END,
       CASE WHEN x.n % 4 = 0 THEN (ARRAY['Legs felt heavy today', 'Loved the finisher', 'Left shoulder a bit tight on pressing',
                                         'Felt strong — could have gone heavier', 'Slept badly, still got through it',
                                         'Good session, thanks'])[1 + x.n % 6] END,
       least(s.ended_at + interval '12 minutes', now()), least(s.ended_at + interval '12 minutes', now())
FROM scheduled_session s
JOIN pc ON pc.client_id = s.client_id
CROSS JOIN LATERAL (SELECT pg_temp.h(pc.key || s.scheduled_at::text || 'eff') % 100 AS e, pg_temp.h(pc.key || s.scheduled_at::text || 'fb') AS n) x
WHERE s.status = 'done' AND s.ended_at IS NOT NULL AND s.tenant_id = (SELECT ten FROM k) AND s.deleted_at IS NULL
  AND (s.logged_by = 'client' OR x.n % 100 < 40);

-- The moments finishing a session leaves behind: the 1st, 10th, 25th and 50th, fired once, on the day.
INSERT INTO milestone (client_id, kind, label, value, at, created_at)
SELECT dn.client_id, 'sessions_' || dn.rn,
       CASE WHEN dn.rn = 1 THEN 'Your first session'
            ELSE dn.rn || CASE WHEN dn.rn % 10 = 1 AND dn.rn <> 11 THEN 'st' WHEN dn.rn % 10 = 2 AND dn.rn <> 12 THEN 'nd'
                               WHEN dn.rn % 10 = 3 AND dn.rn <> 13 THEN 'rd' ELSE 'th' END || ' session' END,
       dn.rn, dn.ended_at, dn.ended_at
FROM dn JOIN pc ON pc.client_id = dn.client_id
WHERE dn.rn IN (1, 10, 25, 50);

/* the bell — what mint_client_notification() would have written, by kind */

-- plan: a program the trainer built for them
INSERT INTO client_notification (client_id, kind, text, at, read_at, created_at)
SELECT pc.client_id, 'plan', 'Your program was updated: ' || pg.name, pg_temp.ist(pg.sd - 1, '18:00'),
       pg_temp.ist(pg.sd - 1, '21:00'), pg_temp.ist(pg.sd - 1, '18:00')
FROM pc JOIN pg ON pg.client_id = pc.client_id
WHERE pc.n_plan;

-- note: a free note from the trainer
INSERT INTO client_notification (client_id, kind, text, at, read_at, created_at)
SELECT m.client_id, 'note', left('A note from ' || tr.first || ': ' || m.body, 160), m.at, m.read_at, m.at
FROM client_message m JOIN pc ON pc.client_id = m.client_id CROSS JOIN tr
WHERE m.kind = 'note' AND pc.n_note;

-- session: one the trainer cancelled (away for three days) — the client is told on the day it was cancelled
INSERT INTO client_notification (client_id, kind, text, session_id, subject_at, at, read_at, created_at)
SELECT s.client_id, 'session',
       'Your session on ' || to_char(s.scheduled_at AT TIME ZONE 'Asia/Kolkata', 'FMDay, FMDD Mon') || ' is cancelled — ' || tr.first || ' is away.',
       s.id, s.scheduled_at, s.scheduled_at - interval '3 days', s.scheduled_at - interval '3 days' + interval '2 hours',
       s.scheduled_at - interval '3 days'
FROM scheduled_session s JOIN pc ON pc.client_id = s.client_id CROSS JOIN tr
WHERE s.status = 'cancelled' AND s.cancel_reason = 'trainer' AND s.logged_by = 'trainer' AND pc.n_session
  AND s.tenant_id = (SELECT ten FROM k);

-- pack: a payment the trainer recorded (only for clients who may see money, and only what the trainer collected) …
INSERT INTO client_notification (client_id, kind, text, amount, subject_at, at, read_at, created_at)
SELECT p.client_id, 'pack', 'Payment of ₹' || to_char(p.amount, 'FM999,999,990') || ' received. Thank you!', p.amount, p.paid_at, p.paid_at,
       CASE WHEN p.paid_at < now() - interval '3 days' THEN p.paid_at + interval '5 hours' END, p.paid_at
FROM payment p JOIN pc ON pc.client_id = p.client_id
WHERE p.status = 'paid' AND p.collected_by = 'trainer' AND p.deleted_at IS NULL AND p.paid_at > now() - interval '60 days'
  AND pc.n_pack AND pc.money AND p.tenant_id = (SELECT ten FROM k);

-- … and a pack about to run out (sessions, not money, so the money switch does not apply)
INSERT INTO client_notification (client_id, kind, text, at, read_at, created_at)
SELECT pk.client_id, 'pack',
       pk.sessions_remaining || CASE WHEN pk.sessions_remaining = 1 THEN ' session' ELSE ' sessions' END || ' left on ' || pk.name,
       coalesce(last.at, now()), NULL, coalesce(last.at, now())
FROM package pk JOIN pc ON pc.client_id = pk.client_id
CROSS JOIN LATERAL (SELECT max(a.effective_at) AS at FROM package_adjustment a WHERE a.package_id = pk.id AND a.kind = 'session') last
WHERE pk.status = 'active' AND pk.basis = 'sessions' AND pk.sessions_remaining BETWEEN 1 AND 3 AND pk.deleted_at IS NULL
  AND pc.n_pack AND pk.tenant_id = (SELECT ten FROM k);

-- best: the heaviest set of each client's two heaviest lifts, noticed on the day it happened
INSERT INTO client_notification (client_id, kind, text, session_id, subject_at, at, read_at, created_at)
SELECT b.client_id, 'best', 'New best: ' || b.name, b.session_id, b.at, b.at + interval '10 minutes',
       CASE WHEN b.at < now() - interval '3 days' THEN b.at + interval '6 hours' END, b.at + interval '10 minutes'
FROM (
  SELECT m.*, row_number() OVER (PARTITION BY m.client_id ORDER BY m.load_value DESC) AS rk
  FROM (
    SELECT DISTINCT ON (s.client_id, se.exercise_id) s.client_id, e.name, l.load_value, s.id AS session_id, s.ended_at AS at
    FROM set_log l
    JOIN session_exercise se ON se.id = l.session_exercise_id
    JOIN scheduled_session s ON s.id = se.session_id
    JOIN exercise e ON e.id = se.exercise_id
    WHERE l.done_at IS NOT NULL AND l.load_kind = 'weight' AND l.effort_kind = 'reps' AND l.load_value IS NOT NULL
      AND s.status = 'done' AND s.ended_at IS NOT NULL AND s.tenant_id = (SELECT ten FROM k)
    ORDER BY s.client_id, se.exercise_id, l.load_value DESC, s.ended_at DESC
  ) m
) b JOIN pc ON pc.client_id = b.client_id
WHERE b.rk <= 2 AND pc.n_best;

-- checkin: an assessment sent to the portal (waiting ones stay unread)
INSERT INTO client_notification (client_id, kind, text, subject_at, at, read_at, created_at)
SELECT a.client_id, 'checkin', 'Your ' || a.name || ' is ready — it takes about two minutes.', pg_temp.ist(a.due_on, '00:00'),
       a.sent_at, CASE WHEN a.completed_at IS NOT NULL THEN a.sent_at + interval '1 hour' END, a.sent_at
FROM assessment a JOIN pc ON pc.client_id = a.client_id
WHERE a.sent_at IS NOT NULL AND a.deleted_at IS NULL AND pc.n_checkin AND a.tenant_id = (SELECT ten FROM k);

-- reminder: the WhatsApp reminder the evening before each session, in every delivery state it can be in —
-- delivered, queued for later, and skipped for the three reasons a client can cause (excluded, opted out, never opted in).
INSERT INTO client_notification (client_id, kind, text, session_id, subject_at, send_after, at, read_at, created_at,
                                 whatsapp_status, whatsapp_skip_reason, whatsapp_message_id, whatsapp_sent_at)
SELECT s.client_id, 'reminder',
       'Session tomorrow at ' || to_char(s.scheduled_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') || ' with ' || tr.first || '.',
       s.id, s.scheduled_at, x.sa, least(x.sa, now() - interval '1 hour'),     -- a queued one was written when the session was booked, not when it will be sent
       CASE WHEN x.sa < now() - interval '1 day' THEN x.sa + interval '2 hours' END, least(x.sa, now() - interval '1 hour'),
       CASE WHEN x.skip IS NOT NULL THEN 'skipped' WHEN x.sa <= now() THEN 'delivered' ELSE 'queued' END,
       x.skip,
       CASE WHEN x.skip IS NULL AND x.sa <= now() THEN 'wamid.seed' || replace(s.id::text, '-', '') END,
       CASE WHEN x.skip IS NULL AND x.sa <= now() THEN x.sa + interval '40 seconds' END
FROM scheduled_session s
JOIN pc ON pc.client_id = s.client_id
CROSS JOIN tr
CROSS JOIN LATERAL (SELECT pg_temp.ist((s.scheduled_at AT TIME ZONE 'Asia/Kolkata')::date - 1, '18:00') AS sa,
                           CASE WHEN pc.excl THEN 'client_excluded' WHEN NOT pc.wa THEN 'client_opt_out'
                                WHEN NOT pc.opted THEN 'no_opt_in' END AS skip) x
WHERE s.status IN ('done', 'scheduled', 'no_show') AND s.logged_by = 'trainer' AND s.deleted_at IS NULL AND pc.n_session
  AND s.tenant_id = (SELECT ten FROM k)
  AND s.scheduled_at BETWEEN now() - interval '14 days' AND now() + interval '7 days';

/* ── 13. it must be a diary the product could have produced ──────────────── */

DO $$
DECLARE bad text;
BEGIN
  -- One person on the floor at a time, measured against each session's own length.
  SELECT string_agg(a.id::text, ', ') INTO bad
  FROM scheduled_session a
  JOIN scheduled_session b ON b.trainer_id = a.trainer_id AND a.id < b.id
                          AND a.scheduled_at < b.ends_at AND b.scheduled_at < a.ends_at
  WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL AND a.status <> 'cancelled' AND b.status <> 'cancelled'
    AND a.logged_by = 'trainer' AND b.logged_by = 'trainer'
    AND a.tenant_id = (SELECT ten FROM k);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'overlapping sessions: %', bad; END IF;

  -- Nothing runs outside the working week.
  SELECT string_agg(DISTINCT s.id::text, ', ') INTO bad
  FROM scheduled_session s
  WHERE s.tenant_id = (SELECT ten FROM k) AND s.deleted_at IS NULL AND s.logged_by = 'trainer'
    AND NOT EXISTS (SELECT 1 FROM working_hours w
                    WHERE w.trainer_id = s.trainer_id AND w.weekday = extract(isodow FROM s.scheduled_at AT TIME ZONE 'Asia/Kolkata')
                      AND (s.scheduled_at AT TIME ZONE 'Asia/Kolkata')::time >= w.start_time
                      AND (s.ends_at AT TIME ZONE 'Asia/Kolkata')::time <= w.end_time);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'sessions outside working hours: %', bad; END IF;

  -- A running package is not past its end.
  SELECT string_agg(p.name, ', ') INTO bad FROM package p
  WHERE p.tenant_id = (SELECT ten FROM k) AND p.status = 'active' AND p.end_date < (SELECT today FROM k);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'active package already past its end: %', bad; END IF;

  -- Every done session was charged to a package, or belongs to a client on a monthly one.
  SELECT string_agg(DISTINCT r.name, ', ') INTO bad
  FROM scheduled_session s JOIN r ON r.id = s.client_id
  WHERE s.status = 'done' AND s.logged_by = 'trainer' AND s.tenant_id = (SELECT ten FROM k)
    AND r.key NOT IN ('divya')
    AND NOT EXISTS (SELECT 1 FROM package_adjustment a WHERE a.session_id = s.id AND a.kind = 'session');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'done sessions not covered by any pack (enlarge pp): %', bad; END IF;
END $$;

COMMIT;

/* ── what was built ──────────────────────────────────────────────────────── */

\echo
\echo '── roster ──'
SELECT c.name, c.status, c.client_type AS type,
       (SELECT count(*) FROM scheduled_session s WHERE s.client_id = c.id AND s.status = 'done') AS done,
       (SELECT count(*) FROM scheduled_session s WHERE s.client_id = c.id AND s.status = 'no_show') AS no_show,
       (SELECT count(*) FROM scheduled_session s WHERE s.client_id = c.id AND s.status = 'cancelled') AS cancelled,
       (SELECT count(*) FROM scheduled_session s WHERE s.client_id = c.id AND s.status = 'scheduled'
          AND s.scheduled_at > now()) AS ahead
FROM client c JOIN trainer t ON t.id = c.trainer_id JOIN app_user u ON u.id = t.app_user_id
WHERE u.phone = :'trainer_phone' AND c.deleted_at IS NULL ORDER BY c.created_at, c.name;

\echo
\echo '── money book ──'
SELECT c.name, p.name AS package, p.status, p.sessions_remaining AS left, p.amount,
       coalesce((SELECT sum(y.amount) FROM payment y WHERE y.package_id = p.id AND y.status = 'paid' AND y.deleted_at IS NULL), 0) AS paid,
       p.end_date, p.paused_at IS NOT NULL AS paused
FROM package p JOIN client c ON c.id = p.client_id JOIN trainer t ON t.id = p.trainer_id JOIN app_user u ON u.id = t.app_user_id
WHERE u.phone = :'trainer_phone' AND p.deleted_at IS NULL ORDER BY c.name, p.created_at;

\echo
\echo '── row counts ──'
SELECT 'clients' AS "table", count(*) FROM client c JOIN trainer t ON t.id = c.trainer_id JOIN app_user u ON u.id = t.app_user_id WHERE u.phone = :'trainer_phone' AND c.deleted_at IS NULL
UNION ALL SELECT 'sessions', count(*) FROM scheduled_session s JOIN trainer t ON t.id = s.trainer_id JOIN app_user u ON u.id = t.app_user_id WHERE u.phone = :'trainer_phone'
UNION ALL SELECT 'set logs', count(*) FROM set_log l JOIN session_exercise se ON se.id = l.session_exercise_id JOIN scheduled_session s ON s.id = se.session_id JOIN trainer t ON t.id = s.trainer_id JOIN app_user u ON u.id = t.app_user_id WHERE u.phone = :'trainer_phone'
UNION ALL SELECT 'packages', count(*) FROM package p JOIN trainer t ON t.id = p.trainer_id JOIN app_user u ON u.id = t.app_user_id WHERE u.phone = :'trainer_phone'
UNION ALL SELECT 'payments', count(*) FROM payment p JOIN trainer t ON t.id = p.trainer_id JOIN app_user u ON u.id = t.app_user_id WHERE u.phone = :'trainer_phone'
UNION ALL SELECT 'assessments', count(*) FROM assessment a JOIN trainer t ON t.id = a.trainer_id JOIN app_user u ON u.id = t.app_user_id WHERE u.phone = :'trainer_phone';

\echo
\echo '── client portal (sign in with the phone; the OTP is printed in the backend log) ──'
SELECT c.name, c.phone, c.membership_status AS membership, c.status,
       (SELECT count(*) FROM client_message m WHERE m.client_id = c.id) AS messages,
       (SELECT count(*) FROM client_notification n WHERE n.client_id = c.id) AS bell,
       (SELECT count(*) FROM client_notification n WHERE n.client_id = c.id AND n.read_at IS NULL) AS unread,
       (SELECT count(*) FROM workout_feedback f WHERE f.client_id = c.id) AS felt,
       (SELECT count(*) FROM milestone m WHERE m.client_id = c.id) AS marks,
       (SELECT count(*) FROM scheduled_session s WHERE s.client_id = c.id AND s.logged_by = 'client') AS solo,
       (SELECT count(*) FROM assessment a WHERE a.client_id = c.id AND a.sent_at IS NOT NULL AND a.completed_at IS NULL) AS waiting
FROM client c JOIN trainer t ON t.id = c.trainer_id JOIN app_user u ON u.id = t.app_user_id
WHERE u.phone = :'trainer_phone' AND c.deleted_at IS NULL AND c.membership_status <> 'not_invited'
ORDER BY c.created_at, c.name;

\echo
\echo 'Arjun Reddy''s invite is live. Open this path on the web app (the link a trainer would send):'
SELECT '/invite/' || rtrim(translate(encode(sha256(convert_to('inclineyou-seed-invite-arjun', 'UTF8')), 'base64'), '+/', '-_'), '=') AS arjun_invite;
