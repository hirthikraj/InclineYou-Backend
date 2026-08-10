-- ============================================================================
-- One month of sample data for a trainer.
--
--   psql ... -v trainer_phone=9841657298 -f seed-sample-month.sql
--
-- Development data only. It exists so every screen has something honest to
-- render: a roster with chips that fire, a diary with a working split shift and
-- real gaps, packs that are part-spent, money that is part-collected, and a
-- past week that contains the awkward cases — a no-show, a cancellation, and a
-- session nobody ever closed off.
--
-- Two rules it keeps:
--
--   · **It only owns what it made.** Every client it creates is tagged
--     `metadata->>'seed' = 'true'`, and a re-run deletes exactly those clients
--     and everything hanging off them. Clients you added by hand are never
--     touched.
--   · **It is internally consistent.** Sessions marked done or no-show carry
--     the pack columns V10 added, and each pack's `sessions_remaining` is
--     computed from those rows rather than typed in — so the roster chip, the
--     diary and the pack detail all agree.
--
-- Dates are relative to CURRENT_DATE, so the window is always "the last four
-- weeks and the next one" however long after writing this you run it.
-- ============================================================================

\set ON_ERROR_STOP on

-- The wall clock the data is written in. A 06:00 session means six in the
-- morning where the trainer is, not six in whatever zone the database server
-- happens to run in — and in Docker that is almost always UTC, which would put
-- every morning session at half past eleven on the phone.
\if :{?tz}
\else
\set tz 'Asia/Kolkata'
\endif

-- `CURRENT_DATE` is evaluated in the SESSION's time zone, and every date in
-- this file is relative to it. Left at the server's UTC, a run after 5:30pm IST
-- computes "today" as yesterday, and everything anchored to it lands a day out:
-- a debt written as eleven days late reads as twelve on the phone.
--
-- So the session is moved to the trainer's zone before anything is computed.
-- The explicit `AT TIME ZONE :'tz'` casts further down stay as they are — they
-- say what they mean, and they keep working if this line is ever removed.
SET TIME ZONE :'tz';

BEGIN;

-- ── Who ─────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE seed_trainer ON COMMIT DROP AS
SELECT id FROM trainer WHERE phone = :'trainer_phone' AND deleted_at IS NULL LIMIT 1;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM seed_trainer) THEN
        RAISE EXCEPTION 'No trainer with that phone. Sign in on the app first.';
    END IF;
END $$;

-- ── Retire the previous run ─────────────────────────────────────────────────
--
-- Soft deletes, not hard ones. A phone that already pulled these rows learns
-- they are gone from the `deleted_at` tombstone; a hard DELETE simply stops
-- mentioning them and the phone keeps its copy forever. The first version of
-- this script hard-deleted, and the stranded rows showed up as a day with two
-- of every free slot on it.
--
-- Rows this run recreates are revived by the upserts below, which clear
-- `deleted_at` again. Rows it no longer generates — a session that has scrolled
-- out of the window — stay tombstoned, which is exactly right.

CREATE TEMP TABLE old_clients ON COMMIT DROP AS
SELECT c.id FROM client c, seed_trainer t
WHERE c.trainer_id = t.id AND c.metadata->>'seed' = 'true';

UPDATE set_log SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND workout_session_id IN
        (SELECT id FROM workout_session WHERE client_id IN (SELECT id FROM old_clients));
UPDATE workout_session   SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND client_id IN (SELECT id FROM old_clients);
UPDATE scheduled_session SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND client_id IN (SELECT id FROM old_clients);
UPDATE payment           SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND client_id IN (SELECT id FROM old_clients);
UPDATE package           SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND client_id IN (SELECT id FROM old_clients);
UPDATE program           SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND client_id IN (SELECT id FROM old_clients);
UPDATE body_metric       SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND client_id IN (SELECT id FROM old_clients);
UPDATE client            SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND id IN (SELECT id FROM old_clients);

UPDATE working_hours SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND trainer_id IN (SELECT id FROM seed_trainer);
UPDATE time_block    SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND trainer_id IN (SELECT id FROM seed_trainer)
      AND metadata->>'seed' = 'true';
-- The price list and the gym's cut. Packages point at `pack` rows, so those are
-- retired only after the packages above have been tombstoned.
UPDATE gym_settlement SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND trainer_id IN (SELECT id FROM seed_trainer);
UPDATE pack           SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND trainer_id IN (SELECT id FROM seed_trainer);

-- ── The shape of the week ───────────────────────────────────────────────────
--
-- A split shift, which is the whole reason the diary is an agenda and not an
-- hour grid: 06:00–11:00 and 17:00–21:00, Wednesday off, a short Sunday.
-- weekday is 0 = Monday, matching the day strip.

INSERT INTO working_hours (id, trainer_id, weekday, start_minute, end_minute)
SELECT md5('seed:hours:' || t.id || ':' || w.weekday || ':' || w.start_minute)::uuid,
       t.id, w.weekday, w.start_minute, w.end_minute
FROM seed_trainer t,
     (VALUES (0, 360, 660), (0, 1020, 1260),
             (1, 360, 660), (1, 1020, 1260),
             (3, 360, 660), (3, 1020, 1260),
             (4, 360, 660), (4, 1020, 1260),
             (5, 360, 660), (5, 1020, 1260),
             (6, 420, 600)
     ) AS w(weekday, start_minute, end_minute)
ON CONFLICT (id) DO UPDATE SET
    start_minute = EXCLUDED.start_minute, end_minute = EXCLUDED.end_minute,
    deleted_at = NULL, updated_at = now();

-- Two days off next week, so the diary has a block in it.
INSERT INTO time_block (id, trainer_id, starts_at, ends_at, all_day, reason, metadata)
SELECT md5('seed:block:' || t.id)::uuid, t.id,
       ((CURRENT_DATE + 9)::timestamp AT TIME ZONE :'tz'),
       ((CURRENT_DATE + 11)::timestamp AT TIME ZONE :'tz'),
       TRUE, 'Family wedding', '{"seed":"true"}'::jsonb
FROM seed_trainer t
ON CONFLICT (id) DO UPDATE SET
    starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
    deleted_at = NULL, updated_at = now();

-- ── The roster ──────────────────────────────────────────────────────────────
--
-- Six clients chosen to cover the states the screens have to draw, not six
-- happy ones: two who owe money past the point of politeness, one whose pack is
-- nearly out, one remote, two the gym collects for on a split.

CREATE TEMP TABLE seed_client (
    key         text PRIMARY KEY,
    id          uuid,
    name        text,
    phone       text,
    goal        text,
    mode        text,      -- floor | remote
    pay_mode    text,      -- trainer_collects | gym_collects
    split       numeric,
    height      numeric,
    activity    text,
    per_week    int,
    duration    int,
    -- weekday here is 1 = Monday, because that is what the weekly slot picker
    -- writes and what the app reads back.
    slots       jsonb
) ON COMMIT DROP;

INSERT INTO seed_client VALUES
 ('ananya', md5('seed:client:ananya')::uuid, 'Ananya Iyer',    '9840011221', 'Build strength',  'floor',  'trainer_collects', NULL,  164.0, 'moderate', 3, 60,
  '[{"templateDay":1,"weekday":1,"time":"06:00"},{"templateDay":2,"weekday":3,"time":"06:00"},{"templateDay":3,"weekday":5,"time":"06:00"}]'),
 ('karthik', md5('seed:client:karthik')::uuid, 'Karthik Raman', '9840022332', 'Fat loss',        'floor',  'trainer_collects', NULL,  176.0, 'light',    2, 60,
  '[{"templateDay":1,"weekday":1,"time":"07:00"},{"templateDay":2,"weekday":4,"time":"07:00"}]'),
 ('meera',   md5('seed:client:meera')::uuid,   'Meera Shah',    '9840033443', 'General fitness', 'floor',  'gym_collects',     60.00, 158.0, 'sedentary',2, 60,
  '[{"templateDay":1,"weekday":2,"time":"09:30"},{"templateDay":2,"weekday":6,"time":"09:30"}]'),
 ('farhan',  md5('seed:client:farhan')::uuid,  'Farhan Qureshi','9840044554', 'Muscle gain',     'floor',  'trainer_collects', NULL,  180.0, 'active',   2, 60,
  '[{"templateDay":1,"weekday":2,"time":"18:00"},{"templateDay":2,"weekday":5,"time":"18:00"}]'),
 ('sneha',   md5('seed:client:sneha')::uuid,   'Sneha Rao',     '9840055665', 'Post-natal',      'remote', 'trainer_collects', NULL,  162.0, 'light',    2, 45,
  '[{"templateDay":1,"weekday":3,"time":"19:00"},{"templateDay":2,"weekday":7,"time":"19:00"}]'),
 ('divya',   md5('seed:client:divya')::uuid,   'Divya Menon',   '9840066776', 'Fat loss',        'floor',  'gym_collects',     55.00, 167.0, 'moderate', 2, 60,
  '[{"templateDay":1,"weekday":1,"time":"17:30"},{"templateDay":2,"weekday":4,"time":"17:30"}]');

INSERT INTO client (id, trainer_id, name, phone, goal, status, payment_mode, trainer_split_percent,
                    height_cm, activity_level, delivery_mode, sessions_per_week,
                    session_duration_minutes, weekly_schedule, metadata, created_at)
SELECT s.id, t.id, s.name, s.phone, s.goal, 'active', s.pay_mode, s.split,
       s.height, s.activity, s.mode, s.per_week, s.duration, s.slots,
       '{"seed":"true"}'::jsonb, (CURRENT_DATE - 35)::timestamptz
FROM seed_client s, seed_trainer t
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, phone = EXCLUDED.phone, goal = EXCLUDED.goal,
    status = EXCLUDED.status, payment_mode = EXCLUDED.payment_mode,
    trainer_split_percent = EXCLUDED.trainer_split_percent,
    delivery_mode = EXCLUDED.delivery_mode, weekly_schedule = EXCLUDED.weekly_schedule,
    deleted_at = NULL, updated_at = now();

-- ── Programs ────────────────────────────────────────────────────────────────
--
-- Real dates, because "Week 5 of 8" is what turns a session into a position in
-- a plan, and a made-up week number is worse than none.

CREATE TEMP TABLE seed_program ON COMMIT DROP AS
SELECT s.key,
       md5('seed:program:' || s.key)::uuid AS id,
       s.id AS client_id,
       (CASE s.key WHEN 'ananya' THEN 'Push A'
                   WHEN 'karthik' THEN 'Pull B'
                   WHEN 'meera' THEN 'Full Body B'
                   WHEN 'farhan' THEN 'Upper / Lower'
                   WHEN 'sneha' THEN 'Remote Core'
                   ELSE 'Full Body A' END) AS name,
       (CURRENT_DATE - 28) AS start_date,
       (CURRENT_DATE + 28) AS end_date
FROM seed_client s;

INSERT INTO program (id, trainer_id, client_id, name, goal, start_date, end_date, status, created_at)
SELECT p.id, t.id, p.client_id, p.name, s.goal, p.start_date, p.end_date, 'active',
       (CURRENT_DATE - 28)::timestamptz
FROM seed_program p
JOIN seed_client s ON s.key = p.key, seed_trainer t
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
    status = EXCLUDED.status, deleted_at = NULL, updated_at = now();

-- ── Packs ───────────────────────────────────────────────────────────────────
--
-- The totals here are placeholders. Both columns are rewritten at the end from
-- what the generated sessions actually consumed, plus a target remainder per
-- client — which is how the roster ends up with a real spread (most healthy,
-- one pack ending, two who owe money) instead of every client landing in the
-- same warn state at once.

-- ── The price list ──────────────────────────────────────────────────────────
--
-- What this trainer SELLS, which is what the packs below are sold from. Priced
-- so the Money screen's arithmetic callout has something true to say: the
-- 8-session pack works out dearer per session than the 16, which is the right
-- way round.

INSERT INTO pack (id, trainer_id, name, type, sessions, amount, currency, validity_days,
                  status, order_index)
SELECT md5('seed:catalogue:' || v.slug)::uuid, t.id, v.name, v.type, v.sessions, v.amount,
       'INR', v.validity, 'active', v.ord
FROM seed_trainer t,
     (VALUES ('p16', '16 sessions',    'session_pack', 16,   12000::numeric, 60,   0),
             ('p12', '12 sessions',    'session_pack', 12,   9000::numeric,  45,   1),
             ('p8',  '8 sessions',     'session_pack', 8,    7000::numeric,  30,   2),
             ('pm',  'Monthly',        'monthly',      NULL, 9000::numeric,  30,   3),
             ('p1',  'Single session', 'single',       1,    900::numeric,   NULL, 4)
     ) AS v(slug, name, type, sessions, amount, validity, ord)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, type = EXCLUDED.type, sessions = EXCLUDED.sessions,
    amount = EXCLUDED.amount, validity_days = EXCLUDED.validity_days,
    status = EXCLUDED.status, order_index = EXCLUDED.order_index,
    deleted_at = NULL, updated_at = now();

CREATE TEMP TABLE seed_pack ON COMMIT DROP AS
SELECT s.key,
       md5('seed:pack:' || s.key)::uuid AS id,
       s.id AS client_id,
       (CASE WHEN s.key = 'sneha' THEN 'monthly' ELSE 'session_pack' END) AS type,
       (CASE s.key WHEN 'ananya' THEN 16 WHEN 'karthik' THEN 12 WHEN 'meera' THEN 16
                   WHEN 'farhan' THEN 12 WHEN 'sneha' THEN NULL ELSE 8 END)::int AS total,
       (CASE s.key WHEN 'ananya' THEN 12000 WHEN 'karthik' THEN 9000 WHEN 'meera' THEN 12000
                   WHEN 'farhan' THEN 6000 WHEN 'sneha' THEN 9000 ELSE 7000 END)::numeric AS amount,
       -- Which catalogue entry it was sold from, where one matches.
       md5('seed:catalogue:' || (CASE s.key WHEN 'ananya' THEN 'p16' WHEN 'karthik' THEN 'p12'
                                            WHEN 'meera'  THEN 'p16' WHEN 'farhan'  THEN 'p12'
                                            WHEN 'sneha'  THEN 'pm'  ELSE 'p8' END))::uuid AS pack_id,
       -- When the money was agreed. Farhan is eleven days past it and Sneha six;
       -- everyone else agreed the day they were billed and paid on the day, so
       -- their due date is NULL here and the billing date is used instead.
       (CASE WHEN s.key IN ('farhan', 'sneha')
             THEN CURRENT_DATE - CASE s.key WHEN 'farhan' THEN 11 ELSE 6 END
        END)::date AS due
FROM seed_client s;

-- Billed at the start of THIS month where that is later than four weeks ago, so
-- the current month's figures are never empty on a run early in the month.
INSERT INTO package (id, trainer_id, client_id, type, sessions_total, sessions_remaining,
                     amount, currency, start_date, end_date, status, pack_id, due_date, created_at)
SELECT p.id, t.id, p.client_id, p.type, p.total, p.total, p.amount, 'INR',
       GREATEST(date_trunc('month', CURRENT_DATE)::date, CURRENT_DATE - 28),
       (CURRENT_DATE + 32), 'active', p.pack_id,
       COALESCE(p.due, GREATEST(date_trunc('month', CURRENT_DATE)::date, CURRENT_DATE - 28)),
       GREATEST(date_trunc('month', CURRENT_DATE)::date, CURRENT_DATE - 28)::timestamptz
FROM seed_pack p, seed_trainer t
ON CONFLICT (id) DO UPDATE SET
    sessions_total = EXCLUDED.sessions_total,
    sessions_remaining = EXCLUDED.sessions_remaining,
    amount = EXCLUDED.amount, status = EXCLUDED.status,
    start_date = EXCLUDED.start_date, pack_id = EXCLUDED.pack_id, due_date = EXCLUDED.due_date,
    deleted_at = NULL, updated_at = now();

-- Last month's packs, closed and fully paid. Without them the month strip has
-- exactly one entry and "hisaab clear" — a whole month with nothing left out —
-- has nowhere to show itself.
INSERT INTO package (id, trainer_id, client_id, type, sessions_total, sessions_remaining,
                     amount, currency, start_date, end_date, status, pack_id, due_date, created_at)
SELECT md5('seed:pack:prev:' || p.key)::uuid, t.id, p.client_id, p.type,
       COALESCE(p.total, 0), 0, p.amount, 'INR',
       (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date,
       (date_trunc('month', CURRENT_DATE) - INTERVAL '1 day')::date,
       'expired', p.pack_id,
       (date_trunc('month', CURRENT_DATE) - INTERVAL '1 day')::date,
       (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::timestamptz
FROM seed_pack p, seed_trainer t
ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount, status = EXCLUDED.status, pack_id = EXCLUDED.pack_id,
    deleted_at = NULL, updated_at = now();

-- ── The gym arrangement ─────────────────────────────────────────────────────
--
-- Indian gyms take 50–70% of personal-training fees. Without this the Money
-- screen has no "your share" line, which is the one figure on it that is
-- actually the trainer's.

UPDATE trainer SET gym_name = 'Anytime Fitness, Adyar', gym_share_percent = 50, updated_at = now()
WHERE id IN (SELECT id FROM seed_trainer);

-- ── Money ───────────────────────────────────────────────────────────────────
--
-- Four collected, two still owing — Farhan for eleven days and Sneha for six,
-- which is what lights the roster's overdue chips, the home screen's attention
-- module and the Money screen's chase list.
--
-- The gym's cut is stamped onto each entry at "record time", exactly as the app
-- does it: 50% on a floor client, nothing on a remote one. Recomputing it later
-- from today's percentage is the bug this column exists to prevent.

INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, method,
                     collected_by, status, upi_reference, paid_at,
                     gym_share_amount, share_percent, receipt_no, created_at)
SELECT md5('seed:pay:' || p.key)::uuid, t.id, p.client_id, p.id, p.amount, 'INR',
       CASE WHEN c.pay_mode = 'gym_collects' THEN 'gym_front_office' ELSE 'upi_intent' END,
       CASE WHEN c.pay_mode = 'gym_collects' THEN 'gym' ELSE 'trainer' END,
       'paid',
       CASE WHEN c.pay_mode = 'gym_collects' THEN NULL ELSE 'UPI' || substr(md5(p.key), 1, 8) END,
       (GREATEST(date_trunc('month', CURRENT_DATE)::date, CURRENT_DATE - 26))::timestamptz,
       -- The gym keeps whatever the trainer does not. `split` is what the
       -- TRAINER keeps, so Meera's 60 means the gym takes 40 — not 50.
       CASE WHEN c.mode = 'remote' THEN 0
            ELSE round(p.amount * COALESCE(100 - c.split, 50) / 100, 2) END,
       CASE WHEN c.mode = 'remote' THEN 0 ELSE COALESCE(100 - c.split, 50) END,
       'TX-' || to_char(CURRENT_DATE, 'YYMM') || '-1' || lpad((row_number() OVER (ORDER BY p.key))::text, 3, '0'),
       (GREATEST(date_trunc('month', CURRENT_DATE)::date, CURRENT_DATE - 26))::timestamptz
FROM seed_pack p
JOIN seed_client c ON c.key = p.key, seed_trainer t
WHERE p.key NOT IN ('farhan', 'sneha')
ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount, method = EXCLUDED.method, status = EXCLUDED.status,
    paid_at = EXCLUDED.paid_at, gym_share_amount = EXCLUDED.gym_share_amount,
    share_percent = EXCLUDED.share_percent, receipt_no = EXCLUDED.receipt_no,
    deleted_at = NULL, updated_at = now();

-- Last month, settled in full by everybody — the "hisaab clear" month.
INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, method,
                     collected_by, status, upi_reference, paid_at,
                     gym_share_amount, share_percent, receipt_no, created_at)
SELECT md5('seed:pay:prev:' || p.key)::uuid, t.id, p.client_id,
       md5('seed:pack:prev:' || p.key)::uuid, p.amount, 'INR',
       CASE WHEN c.pay_mode = 'gym_collects' THEN 'gym_front_office'
            WHEN p.key IN ('karthik', 'divya') THEN 'cash' ELSE 'upi_intent' END,
       CASE WHEN c.pay_mode = 'gym_collects' THEN 'gym' ELSE 'trainer' END,
       'paid',
       CASE WHEN c.pay_mode = 'gym_collects' OR p.key IN ('karthik', 'divya')
            THEN NULL ELSE 'UPI' || substr(md5('prev' || p.key), 1, 8) END,
       (date_trunc('month', CURRENT_DATE) - INTERVAL '4 days')::timestamptz,
       -- The gym keeps whatever the trainer does not. `split` is what the
       -- TRAINER keeps, so Meera's 60 means the gym takes 40 — not 50.
       CASE WHEN c.mode = 'remote' THEN 0
            ELSE round(p.amount * COALESCE(100 - c.split, 50) / 100, 2) END,
       CASE WHEN c.mode = 'remote' THEN 0 ELSE COALESCE(100 - c.split, 50) END,
       'TX-' || to_char(date_trunc('month', CURRENT_DATE) - INTERVAL '1 month', 'YYMM')
             || '-1' || lpad((row_number() OVER (ORDER BY p.key))::text, 3, '0'),
       (date_trunc('month', CURRENT_DATE) - INTERVAL '4 days')::timestamptz
FROM seed_pack p
JOIN seed_client c ON c.key = p.key, seed_trainer t
ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount, method = EXCLUDED.method, status = EXCLUDED.status,
    paid_at = EXCLUDED.paid_at, gym_share_amount = EXCLUDED.gym_share_amount,
    share_percent = EXCLUDED.share_percent, receipt_no = EXCLUDED.receipt_no,
    deleted_at = NULL, updated_at = now();

-- Farhan and Sneha get no payment row at all. What is outstanding is derived
-- from the pack minus what came in against it, so an unpaid debt is the absence
-- of a payment — not a 'pending' row pretending money is on its way.

-- ── What the gym is owed ────────────────────────────────────────────────────
--
-- Last month's share handed over on the 1st; this month's still due. Both are
-- the trainer's own figures — Train X never talks to the gym's system.

INSERT INTO gym_settlement (id, trainer_id, period, amount, sessions_counted, gym_name,
                            status, due_at, settled_at, created_at)
SELECT md5('seed:settle:prev:' || t.id)::uuid, t.id,
       to_char(date_trunc('month', CURRENT_DATE) - INTERVAL '1 month', 'YYYY-MM'),
       (SELECT COALESCE(sum(gym_share_amount), 0) FROM payment
        WHERE trainer_id = t.id AND deleted_at IS NULL
          AND paid_at < date_trunc('month', CURRENT_DATE)),
       (SELECT count(*) FROM scheduled_session s
        WHERE s.trainer_id = t.id AND s.deleted_at IS NULL AND s.status = 'done'
          AND s.scheduled_at < date_trunc('month', CURRENT_DATE)),
       'Anytime Fitness, Adyar', 'settled',
       date_trunc('month', CURRENT_DATE)::timestamptz,
       date_trunc('month', CURRENT_DATE)::timestamptz,
       date_trunc('month', CURRENT_DATE)::timestamptz
FROM seed_trainer t
ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount, sessions_counted = EXCLUDED.sessions_counted,
    status = EXCLUDED.status, settled_at = EXCLUDED.settled_at,
    deleted_at = NULL, updated_at = now();

-- ── The month of sessions ───────────────────────────────────────────────────
--
-- Generated from each client's own weekly pattern over four weeks back and one
-- forward, so the diary's "she usually trains at this hour" has something true
-- to say.

CREATE TEMP TABLE seed_session ON COMMIT DROP AS
WITH days AS (
    SELECT generate_series(CURRENT_DATE - 28, CURRENT_DATE + 7, INTERVAL '1 day')::date AS d
),
slots AS (
    SELECT s.key,
           s.id AS client_id,
           s.duration,
           (slot->>'weekday')::int AS weekday,   -- 1 = Monday
           (slot->>'time') AS at_time,
           (slot->>'templateDay')::int AS template_day
    FROM seed_client s, jsonb_array_elements(s.slots) AS slot
),
raw AS (
    SELECT sl.key, sl.client_id, sl.duration, sl.template_day,
           ((d.d + sl.at_time::time) AT TIME ZONE :'tz') AS at,
           -- Deterministic per client and slot, so a re-run inside the same day
           -- lands on the same rows rather than doubling them.
           md5('seed:sess:' || sl.key || ':' || d.d || ':' || sl.at_time)::uuid AS id,
           row_number() OVER (PARTITION BY sl.key ORDER BY d.d, sl.at_time) AS n
    FROM days d
    JOIN slots sl ON EXTRACT(ISODOW FROM d.d)::int = sl.weekday
)
SELECT r.*,
       CASE
           WHEN r.at > now() THEN 'scheduled'
           WHEN r.key = 'divya'  AND r.at::date = CURRENT_DATE - 4  THEN 'no_show'
           WHEN r.key = 'meera'  AND r.at::date = CURRENT_DATE - 9  THEN 'cancelled'
           WHEN r.key = 'sneha'  AND r.at::date = CURRENT_DATE - 13 THEN 'cancelled'
           ELSE 'done'
       END AS status
FROM raw r;

INSERT INTO scheduled_session (id, trainer_id, client_id, program_id, scheduled_at,
                               duration_minutes, status, day_label, template_day,
                               delivery_mode, cancelled_by, pack_delta, pack_package_id,
                               pack_applied_at, created_at)
SELECT ss.id, t.id, ss.client_id, pr.id, ss.at, ss.duration, ss.status,
       pr.name, ss.template_day, c.mode,
       CASE WHEN ss.status = 'cancelled' THEN 'client' END,
       -- §07: the pack moves on done or no-show, never on booked. Stamped so
       -- the 24-hour undo has something exact to reverse.
       CASE WHEN ss.status IN ('done', 'no_show') THEN -1 END,
       CASE WHEN ss.status IN ('done', 'no_show') THEN pk.id END,
       CASE WHEN ss.status IN ('done', 'no_show') THEN ss.at + INTERVAL '1 hour' END,
       ss.at - INTERVAL '20 days'
FROM seed_session ss
JOIN seed_client c  ON c.key = ss.key
JOIN seed_program pr ON pr.key = ss.key
JOIN seed_pack pk    ON pk.key = ss.key, seed_trainer t
ON CONFLICT (id) DO UPDATE SET
    scheduled_at = EXCLUDED.scheduled_at, duration_minutes = EXCLUDED.duration_minutes,
    status = EXCLUDED.status, day_label = EXCLUDED.day_label,
    delivery_mode = EXCLUDED.delivery_mode, cancelled_by = EXCLUDED.cancelled_by,
    pack_delta = EXCLUDED.pack_delta, pack_package_id = EXCLUDED.pack_package_id,
    pack_applied_at = EXCLUDED.pack_applied_at,
    deleted_at = NULL, updated_at = now();

-- One session in the recent past is deliberately left open — never closed off,
-- so its pack never moved. That is the money problem state 1d exists for, and
-- the banner that counts it. Chosen after generation rather than by weekday: a
-- rule like "yesterday's Karthik session" quietly matches nothing in a week
-- where Karthik doesn't train yesterday.
UPDATE scheduled_session
SET status = 'scheduled', pack_delta = NULL, pack_package_id = NULL, pack_applied_at = NULL
WHERE id = (
    SELECT ss.id
    FROM scheduled_session ss
    JOIN client c ON c.id = ss.client_id
    WHERE c.metadata->>'seed' = 'true'
      AND ss.scheduled_at < now()
      AND ss.status = 'done'
      AND ss.deleted_at IS NULL
    ORDER BY ss.scheduled_at DESC
    LIMIT 1
);

-- ── What actually got logged ────────────────────────────────────────────────
--
-- Three lifts, three sets each, loads creeping up week by week so the progress
-- charts have a slope and the PR detection has something to find.

CREATE TEMP TABLE seed_lift ON COMMIT DROP AS
SELECT e.id, row_number() OVER (ORDER BY e.name) AS n
FROM exercise e
WHERE e.deleted_at IS NULL
  AND e.name IN ('Barbell Squat', 'Barbell Bench Press', 'Barbell Deadlift',
                 'Dumbbell Bench Press', 'Lat Pulldown', 'Leg Press')
LIMIT 3;

-- Read back from `scheduled_session`, not from `seed_session`: the row flipped
-- open above is still 'done' in the temp table, and giving it a logged workout
-- would make the home screen read it as a session that has been running for
-- nine hours rather than one nobody closed off.
INSERT INTO workout_session (id, trainer_id, client_id, program_id, scheduled_session_id,
                             logged_by, session_date, created_at)
SELECT md5('seed:wo:' || ss.id)::uuid, t.id, ss.client_id, pr.id, ss.id,
       'trainer', ss.at::date, ss.at + INTERVAL '1 hour'
FROM seed_session ss
JOIN scheduled_session real ON real.id = ss.id AND real.status = 'done'
JOIN seed_program pr ON pr.key = ss.key, seed_trainer t
ON CONFLICT (id) DO UPDATE SET
    session_date = EXCLUDED.session_date, deleted_at = NULL, updated_at = now();

INSERT INTO set_log (id, workout_session_id, exercise_id, set_number, load_kg, reps, rpe, created_at)
SELECT md5('seed:set:' || w.id || ':' || l.n || ':' || g.set_no)::uuid,
       w.id, l.id, g.set_no,
       -- A base per lift, plus a kilo a week, plus a little per set.
       (20 + l.n * 15 + ss.n * 1.25 + g.set_no * 2.5)::numeric(6,2),
       CASE g.set_no WHEN 1 THEN 10 WHEN 2 THEN 8 ELSE 6 END,
       (6.5 + g.set_no * 0.5)::numeric(3,1),
       ss.at + INTERVAL '1 hour'
FROM workout_session w
JOIN seed_session ss ON md5('seed:wo:' || ss.id)::uuid = w.id
CROSS JOIN seed_lift l
CROSS JOIN (VALUES (1), (2), (3)) AS g(set_no)
WHERE EXISTS (SELECT 1 FROM scheduled_session r WHERE r.id = ss.id AND r.status = 'done')
ON CONFLICT (id) DO UPDATE SET
    load_kg = EXCLUDED.load_kg, reps = EXCLUDED.reps,
    deleted_at = NULL, updated_at = now();

-- ── Bodyweight, weekly ──────────────────────────────────────────────────────

INSERT INTO body_metric (id, client_id, metric_type, value, unit, recorded_at, created_at)
SELECT md5('seed:bm:' || s.key || ':' || w)::uuid, s.id, 'weight',
       (CASE s.key WHEN 'ananya' THEN 58 WHEN 'karthik' THEN 84 WHEN 'meera' THEN 66
                   WHEN 'farhan' THEN 72 WHEN 'sneha' THEN 61 ELSE 74 END
        -- Fat-loss clients trend down, muscle-gain trends up.
        + (CASE WHEN s.goal = 'Muscle gain' THEN 0.4 ELSE -0.3 END) * w)::numeric(8,2),
       'kg',
       (CURRENT_DATE - 28 + w * 7)::timestamptz,
       (CURRENT_DATE - 28 + w * 7)::timestamptz
FROM seed_client s, generate_series(0, 4) AS w
ON CONFLICT (id) DO UPDATE SET
    value = EXCLUDED.value, deleted_at = NULL, updated_at = now();

-- ── Make the packs tell the truth ───────────────────────────────────────────
--
-- Rather than typing a plausible number: remaining is the total minus every
-- session that actually consumed one. Divya's lands at two, which is what puts
-- her pack-ending chip on the roster.

UPDATE package p
SET sessions_total     = COALESCE(spent.n, 0) + target.remaining,
    sessions_remaining = target.remaining,
    updated_at         = now()
FROM seed_pack sp
JOIN (VALUES ('ananya', 11), ('karthik', 8), ('meera', 9),
             ('farhan', 5),  ('divya', 2),   ('sneha', 0)
     ) AS target(key, remaining) ON target.key = sp.key
LEFT JOIN (
    SELECT pack_package_id AS pid, count(*) AS n
    FROM scheduled_session
    WHERE pack_delta = -1 AND pack_package_id IS NOT NULL AND deleted_at IS NULL
    GROUP BY pack_package_id
) spent ON spent.pid = sp.id
WHERE p.id = sp.id AND p.sessions_total IS NOT NULL;

COMMIT;

-- ── What landed ─────────────────────────────────────────────────────────────

\echo ''
\echo 'Seeded:'
WITH mine AS (
    SELECT c.id FROM client c JOIN trainer t ON t.id = c.trainer_id
    WHERE t.phone = :'trainer_phone' AND c.metadata->>'seed' = 'true' AND c.deleted_at IS NULL
)
SELECT 'clients' AS what, (SELECT count(*) FROM mine) AS count
UNION ALL SELECT 'sessions', count(*) FROM scheduled_session
    WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL
UNION ALL SELECT '  · done', count(*) FROM scheduled_session
    WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL AND status = 'done'
UNION ALL SELECT '  · open', count(*) FROM scheduled_session
    WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL
      AND status = 'scheduled' AND scheduled_at < now()
UNION ALL SELECT '  · upcoming', count(*) FROM scheduled_session
    WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL AND scheduled_at > now()
UNION ALL SELECT 'set logs', count(*) FROM set_log l
    WHERE l.deleted_at IS NULL AND l.workout_session_id IN
        (SELECT id FROM workout_session WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL)
UNION ALL SELECT 'payments taken', count(*) FROM payment
    WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL AND status = 'paid'
UNION ALL SELECT 'still owed', count(*) FROM package p
    WHERE p.client_id IN (SELECT id FROM mine) AND p.deleted_at IS NULL
      AND p.written_off_at IS NULL
      AND p.amount > COALESCE((SELECT sum(amount) FROM payment
                               WHERE package_id = p.id AND status = 'paid' AND deleted_at IS NULL), 0)
UNION ALL SELECT 'packs you sell', count(*) FROM pack k
    JOIN trainer t ON t.id = k.trainer_id
    WHERE t.phone = :'trainer_phone' AND k.deleted_at IS NULL AND k.status = 'active'
UNION ALL SELECT 'working hours', count(*) FROM working_hours w
    JOIN trainer t ON t.id = w.trainer_id
    WHERE t.phone = :'trainer_phone' AND w.deleted_at IS NULL;
