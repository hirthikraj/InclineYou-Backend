-- ============================================================================
-- A realistic working week — 20 clients, one at a time, two months of logs.
--
--   psql ... -v trainer_phone=9841657298 -f seed-realistic-20.sql
--
-- The third seed, and the one that aims at PLAUSIBILITY rather than at coverage
-- or at smallness. `seed-sample-month.sql` is six clients and a month, enough to
-- draw a screen. `seed-full-demo.sql` is forty-four and every state the roster
-- can render, which is the right dataset for a design review and the wrong one
-- for anything that reads like a real trainer's book — at forty-four clients,
-- five people are booked at 6am and nobody could actually coach that.
--
-- This one is a single trainer's honest week:
--
--   · **Twenty clients, and never two in the same slot.** One trainer, one
--     person on the floor at a time. The timetable is a fixed 75-minute pitch —
--     06:00 · 07:15 · 08:30 · 09:45 in the morning, 17:00 · 18:15 · 19:30 ·
--     20:45 in the evening — and a client takes one position on each day they
--     train, derived from who else is on that day rather than typed. Forty-seven
--     sessions a week across twelve band-days, which is a full but survivable
--     book. Two assertions below refuse to commit if that ever stops being true.
--   · **No batches.** The full demo has two, and it should: a batch is one of
--     the diary's real shapes. It is also, by definition, several clients in one
--     slot — so it has no place in a dataset whose whole point is that nobody
--     shares a time. Reach for `seed-full-demo.sql` when you need to see one.
--   · **Two months of logged work.** Nine weeks of history, clamped to when each
--     client joined, and two weeks of bookings ahead. Every kept session has a
--     workout, its exercises and its sets, so the progress charts have a slope,
--     the weekly reports have something to count and the adherence strips are
--     neither all green nor invented.
--   · **V24 semantics throughout.** A template's days are ordinal slots; the
--     weekday each slot lands on is the client's, carried in `program.schedule`
--     and translated onto `program_exercise.day_of_week` exactly as
--     `POST /v1/templates/{id}/apply` does it. The older two seeds still write
--     templates the pre-V24 way, with weekdays baked into the blueprint.
--
-- The two rules it borrows from the other seeds, because they are what make a
-- seed safe to run against a database you are already using:
--
--   · **It only owns what it made.** Every client it creates is tagged
--     `metadata->>'seed' = 'real20'`, and a re-run tombstones exactly those and
--     everything hanging off them. Clients you added by hand are never touched.
--     It also retires the other two seeds' clients (`'demo'` and `'true'`): all
--     three write the trainer's working hours, price list and templates, so
--     running one over another leaves a diary with two of every shift on it.
--     They are alternatives, not layers.
--
--     Every id is `md5` of a key that starts with the trainer's phone, so
--     seeding two trainers on one database is safe and a re-run upserts instead
--     of doubling.
--   · **It is internally consistent.** Nothing here is a typed-in number that
--     could disagree with the rows beside it. Session times are computed from
--     the timetable, pack balances from the sessions that actually consumed
--     them, the gym's cut is stamped at record time from each client's own
--     split, and the weekly reports are aggregated from the sets that were
--     logged — the same arithmetic `WeeklyReportWriter` runs.
--
-- Dates are relative to CURRENT_DATE, so the window is always "the last nine
-- weeks and the next two" however long after writing this you run it.
-- ============================================================================

\set ON_ERROR_STOP on

-- The wall clock the data is written in. A 06:00 session means six in the
-- morning where the trainer is, not six in whatever zone the database server
-- runs in — and in Docker that is almost always UTC, which would put every
-- morning session at half past eleven on the phone.
\if :{?tz}
\else
\set tz 'Asia/Kolkata'
\endif

-- `CURRENT_DATE` is evaluated in the SESSION's time zone and every date below is
-- relative to it, so the session moves to the trainer's zone before anything is
-- computed. Left at UTC, a run after 5:30pm IST computes "today" as yesterday
-- and everything anchored to it lands a day out.
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
-- mentioning them and the phone keeps its copy forever.
--
-- Rows this run recreates are revived by the upserts below, which clear
-- `deleted_at` again. Rows it no longer generates — a session that has scrolled
-- out of the window — stay tombstoned, which is exactly right.

CREATE TEMP TABLE old_clients ON COMMIT DROP AS
SELECT c.id FROM client c, seed_trainer t
WHERE c.trainer_id = t.id AND c.metadata->>'seed' IN ('real20', 'demo', 'true');

UPDATE set_log SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND workout_session_id IN
        (SELECT id FROM workout_session WHERE client_id IN (SELECT id FROM old_clients));
UPDATE workout_exercise SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND workout_session_id IN
        (SELECT id FROM workout_session WHERE client_id IN (SELECT id FROM old_clients));
UPDATE workout_session   SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND client_id IN (SELECT id FROM old_clients);
UPDATE scheduled_session SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND client_id IN (SELECT id FROM old_clients);
UPDATE weekly_report     SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND client_id IN (SELECT id FROM old_clients);
UPDATE nudge_log         SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND client_id IN (SELECT id FROM old_clients);
UPDATE payment           SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND client_id IN (SELECT id FROM old_clients);
UPDATE package           SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND client_id IN (SELECT id FROM old_clients);
-- Before the programs themselves: `program_exercise` carries neither a
-- `trainer_id` nor a `client_id`, so it can only be reached through its
-- program — and once the program is tombstoned this query finds nothing. It was
-- missing here, and the rows it left behind were invisible until an id scheme
-- changed: the upserts below kept overwriting the same ids, so the stale rows
-- were silently the same rows. The moment `program_exercise.id` started hashing
-- an ordinal day instead of a weekday, the old copies stopped colliding with the
-- new ones and every plan quietly held both.
UPDATE program_exercise  SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND program_id IN
        (SELECT id FROM program WHERE client_id IN (SELECT id FROM old_clients));
UPDATE program           SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND client_id IN (SELECT id FROM old_clients);
UPDATE assessment        SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND client_id IN (SELECT id FROM old_clients);
UPDATE client            SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND id IN (SELECT id FROM old_clients);

-- Everything that hangs off the TRAINER rather than off a client. All of it is
-- rewritten below, and all of it is the kind of row that would otherwise
-- accumulate a second copy per run — a second morning shift, a second price
-- list, a second set of nudge rules.
UPDATE working_hours      SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND trainer_id IN (SELECT id FROM seed_trainer);
UPDATE time_block         SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND trainer_id IN (SELECT id FROM seed_trainer)
      AND metadata->>'seed' IN ('real20', 'demo', 'true');
-- The other seeds' batches. This one creates none — see the header — but a
-- previous run of one of them would otherwise leave its groups on the diary.
UPDATE batch              SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND trainer_id IN (SELECT id FROM seed_trainer);
UPDATE exercise_favourite SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND trainer_id IN (SELECT id FROM seed_trainer);
UPDATE nudge_rule         SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND trainer_id IN (SELECT id FROM seed_trainer);
-- The price list and the gym's cut. Packages point at `pack` rows, so those are
-- retired only after the packages above have been tombstoned.
UPDATE gym_settlement     SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND trainer_id IN (SELECT id FROM seed_trainer);
UPDATE pack               SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND trainer_id IN (SELECT id FROM seed_trainer);
-- Templates go last: `program.template_id` points at them, and the programs
-- above have already been tombstoned by the time we get here. The trainer's own
-- custom exercises are retired with them — templates reference those by id.
UPDATE template           SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND trainer_id IN (SELECT id FROM seed_trainer);
UPDATE exercise           SET deleted_at = now(), updated_at = now()
    WHERE deleted_at IS NULL AND is_custom = TRUE
      AND trainer_id IN (SELECT id FROM seed_trainer);

-- ── The trainer's own profile ───────────────────────────────────────────────
--
-- The answers onboarding collects, plus the gym arrangement and the UPI handle
-- the payment deep link is built from. Without `setup_completed_at` the app
-- decides setup is still owed and puts the flow in front of you on every launch,
-- which is the first thing that goes wrong when you seed a database and open the
-- app expecting the roster.
--
-- `work_mode = 'both'` because four of these clients are billed through the gym
-- counter and the rest pay the trainer directly. It is a defaults hint and
-- nothing else — V23 is explicit that gym-vs-freelance is decided per client.
--
-- `metadata.prefs.plateStepKg` is here for one specific reason: it is what
-- separates a personal record from a rounding error, and BOTH the phone's gold
-- circle and the server's weekly-report count read it.

UPDATE trainer SET
    upi_vpa            = COALESCE(upi_vpa, :'trainer_phone' || '@okhdfcbank'),
    gym_name           = 'Iron House, Adyar',
    gym_share_percent  = 50,
    work_mode          = 'both',
    experience_band    = '6_10',
    specialities       = '["strength","weight_loss","natal"]'::jsonb,
    certifications     = '["acsm_cpt","custom:K11 Level 3"]'::jsonb,
    languages          = '["ta","en"]'::jsonb,
    setup_completed_at = COALESCE(setup_completed_at, now() - INTERVAL '300 days'),
    metadata           = COALESCE(metadata, '{}'::jsonb)
                         || jsonb_build_object('prefs', COALESCE(metadata->'prefs', '{}'::jsonb)
                                                        || '{"plateStepKg": 2.5}'::jsonb),
    updated_at         = now()
WHERE id IN (SELECT id FROM seed_trainer);

-- One identity per phone (V18). Sign-in reads this and nothing else to decide
-- which half of the product a number belongs to.
INSERT INTO app_user (id, phone, role, privacy_accepted_at, created_at)
SELECT md5(:'trainer_phone' || ':real20:user:trainer')::uuid, :'trainer_phone', 'trainer',
       now() - INTERVAL '300 days', now() - INTERVAL '300 days'
ON CONFLICT (phone) DO NOTHING;

-- ── The shape of the week ───────────────────────────────────────────────────
--
-- A split shift, which is the whole reason the diary is an agenda and not an
-- hour grid: 06:00–11:00 and 17:00–22:00, Monday to Saturday, Sunday off.
--
-- These two windows are the timetable's frame. The four morning positions
-- (06:00, 07:15, 08:30, 09:45) and the four evening ones (17:00, 18:15, 19:30,
-- 20:45) sit inside them at a 75-minute pitch, which leaves a quarter of an hour
-- between a 60-minute session and the next — the turnaround a real floor needs
-- and the reason a client running five minutes over does not cascade.
--
-- `weekday` here is 0 = Monday … 6 = Sunday, matching V10 and the app's day
-- strip. Everywhere else in this file weekdays are ISO (1 = Monday), because
-- that is what `weekly_schedule`, `program_exercise.day_of_week` and
-- `EXTRACT(ISODOW)` all use. The `- 1` below is the only place the two meet.

INSERT INTO working_hours (id, trainer_id, weekday, start_minute, end_minute)
SELECT md5(:'trainer_phone' || ':real20:hours:' || w.weekday || ':' || w.start_minute)::uuid,
       t.id, w.weekday, w.start_minute, w.end_minute
FROM seed_trainer t,
     (VALUES (0, 360, 660), (0, 1020, 1320),
             (1, 360, 660), (1, 1020, 1320),
             (2, 360, 660), (2, 1020, 1320),
             (3, 360, 660), (3, 1020, 1320),
             (4, 360, 660), (4, 1020, 1320),
             (5, 360, 660), (5, 1020, 1320)
     ) AS w(weekday, start_minute, end_minute)
ON CONFLICT (id) DO UPDATE SET
    start_minute = EXCLUDED.start_minute, end_minute = EXCLUDED.end_minute,
    deleted_at = NULL, updated_at = now();

-- The hours the trainer is not available inside their own shift. A block is not
-- a session and must never be counted as one, which is the thing the diary's
-- agenda has to get right when the two sit next to each other.
INSERT INTO time_block (id, trainer_id, starts_at, ends_at, all_day, reason, metadata)
SELECT md5(:'trainer_phone' || ':real20:block:' || b.slug)::uuid, t.id,
       ((CURRENT_DATE + b.from_day)::timestamp + b.from_time) AT TIME ZONE :'tz',
       ((CURRENT_DATE + b.to_day)::timestamp   + b.to_time)   AT TIME ZONE :'tz',
       b.all_day, b.reason, '{"seed":"real20"}'::jsonb
FROM seed_trainer t,
     (VALUES ('past',   -9, TIME '17:00', -9, TIME '22:00', FALSE, 'Gym floor closed — annual servicing'),
             ('clinic',  3, TIME '09:00',  3, TIME '11:00', FALSE, 'Physio appointment'),
             ('travel', 11, TIME '00:00', 13, TIME '00:00', TRUE,  'Out of town')
     ) AS b(slug, from_day, from_time, to_day, to_time, all_day, reason)
ON CONFLICT (id) DO UPDATE SET
    starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
    all_day = EXCLUDED.all_day, reason = EXCLUDED.reason,
    deleted_at = NULL, updated_at = now();

-- ── The trainer's own exercises ─────────────────────────────────────────────
--
-- The library's 1,324 rows are shared and belong to nobody. These three belong
-- to this trainer, and one is `log_type = 'reps'` — the column that decides
-- whether the log asks for a weight at all. A library with no custom rows in it
-- never draws the custom badge, the edit affordance or the reps-only set row.

INSERT INTO exercise (id, name, muscle_group, equipment, movement_pattern, description,
                      is_custom, trainer_id, log_type, created_at)
SELECT md5(:'trainer_phone' || ':real20:ex:' || x.slug)::uuid, x.name, x.muscle, x.equip, x.pattern,
       x.descr, TRUE, t.id, x.log_type, (CURRENT_DATE - 200)::timestamptz
FROM seed_trainer t,
     (VALUES ('sled',   'Sled Push · Turf',   'quadriceps', 'sled machine', 'push',  'Two lengths of the turf. Load on the sled, not on the back.', 'weight_reps'),
             ('rope',   'Battle Rope Waves',  'shoulders',  'rope',         'carry', 'Thirty seconds on, thirty off. Counted as reps, not seconds.', 'reps'),
             ('farmer', 'Farmer Carry · 20m', 'forearms',   'dumbbell',     'carry', 'Twenty metres each way. The weight is per hand.', 'weight_reps')
     ) AS x(slug, name, muscle, equip, pattern, descr, log_type)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, muscle_group = EXCLUDED.muscle_group,
    equipment = EXCLUDED.equipment, description = EXCLUDED.description,
    -- `log_type` is deliberately NOT updated. It is immutable once set: every
    -- set already recorded against the exercise would stop making sense.
    deleted_at = NULL, updated_at = now();

-- Stars. Favourites sort to the top of the library, which is the only thing on
-- the exercise screen that makes 1,324 rows usable one-handed.
--
-- Matched case-insensitively and against the names the library actually carries
-- after V21 — "Barbell full squat", not "Barbell Squat". An exact-case IN list
-- against the old names resolves to nothing and the screen simply has no
-- favourites, which reads as a missing feature rather than a stale seed.
INSERT INTO exercise_favourite (id, trainer_id, exercise_id, created_at)
SELECT md5(:'trainer_phone' || ':real20:fav:' || e.id)::uuid, t.id, e.id, (CURRENT_DATE - 180)::timestamptz
FROM seed_trainer t
JOIN exercise e ON e.deleted_at IS NULL
                AND (e.is_custom = FALSE OR e.trainer_id = t.id)
                AND lower(e.name) IN ('barbell full squat', 'barbell deadlift',
                                      'barbell bench press', 'pull-up',
                                      'sled push · turf', 'battle rope waves')
ON CONFLICT (id) DO UPDATE SET deleted_at = NULL, updated_at = now();

-- ── The price list ──────────────────────────────────────────────────────────
--
-- What this trainer SELLS. Priced so the Money screen's arithmetic callout has
-- something true to say: the 8-session pack works out dearer per session than
-- the 16, which is the right way round.
--
-- Two lists, not one (V19). The trainer's own packs are theirs to price and
-- discount; the two `owner = 'gym'` rows are what the gym's counter sells, and
-- they can do neither.

INSERT INTO pack (id, trainer_id, name, type, sessions, amount, currency, validity_days,
                  status, owner, order_index)
SELECT md5(:'trainer_phone' || ':real20:catalogue:' || v.slug)::uuid, t.id, v.name, v.type,
       v.sessions, v.amount, 'INR', v.validity, v.status, v.owner, v.ord
FROM seed_trainer t,
     (VALUES ('p16', '16 sessions',    'session_pack', 16,   12000::numeric, 60,   'active', 'trainer', 0),
             ('p12', '12 sessions',    'session_pack', 12,   9600::numeric,  45,   'active', 'trainer', 1),
             ('p8',  '8 sessions',     'session_pack', 8,    7000::numeric,  30,   'active', 'trainer', 2),
             ('pm',  'Monthly online', 'monthly',      NULL, 6000::numeric,  30,   'active', 'trainer', 3),
             ('p1',  'Single session', 'single',       1,    900::numeric,   NULL, 'active', 'trainer', 4),
             ('g12', 'Gym PT · 12',    'session_pack', 12,   14000::numeric, 60,   'active', 'gym',     5),
             ('g8',  'Gym PT · 8',     'session_pack', 8,    10000::numeric, 45,   'active', 'gym',     6)
     ) AS v(slug, name, type, sessions, amount, validity, status, owner, ord)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, type = EXCLUDED.type, sessions = EXCLUDED.sessions,
    amount = EXCLUDED.amount, validity_days = EXCLUDED.validity_days,
    status = EXCLUDED.status, owner = EXCLUDED.owner, order_index = EXCLUDED.order_index,
    deleted_at = NULL, updated_at = now();

-- ── The rules ───────────────────────────────────────────────────────────────
--
-- If / then. The app seeds these on first open; a database seeded from here has
-- to carry them too, or the Nudges screen opens empty and the drafts it builds
-- from them never appear.

INSERT INTO nudge_rule (id, trainer_id, kind, threshold, action, message, enabled, order_index, created_at)
SELECT md5(:'trainer_phone' || ':real20:rule:' || r.kind)::uuid, t.id, r.kind, r.threshold,
       r.action, r.message, r.enabled, r.ord, (CURRENT_DATE - 300)::timestamptz
FROM seed_trainer t,
     (VALUES ('quiet',     7,    'ask',  NULL, TRUE,  0),
             ('pack_low',  2,    'ask',  NULL, TRUE,  1),
             ('overdue',   7,    'ask',  'Hi {name}, {amount} is still pending from {days} days back. Shall I send you the UPI link again?', TRUE, 2),
             ('well_done', NULL, 'auto', NULL, TRUE,  3),
             ('birthday',  NULL, 'ask',  NULL, FALSE, 4)
     ) AS r(kind, threshold, action, message, enabled, ord)
ON CONFLICT (id) DO UPDATE SET
    threshold = EXCLUDED.threshold, action = EXCLUDED.action, message = EXCLUDED.message,
    enabled = EXCLUDED.enabled, order_index = EXCLUDED.order_index,
    deleted_at = NULL, updated_at = now();

-- ── The program shelf ───────────────────────────────────────────────────────
--
-- Templates, written the way V24 means them: `days` is a list of ORDINAL SLOTS —
-- "Day 1", "Day 2" — not weekdays. Which weekday each slot lands on is the
-- client's choice, made at apply time and recorded in `program.schedule`. That
-- is what lets one Upper/Lower template serve a Mon/Thu client and a Tue/Fri
-- client without being duplicated, and it is why the older two seeds' templates
-- (which bake weekdays into the blueprint) are the wrong thing to copy.
--
-- Exercise ids are resolved from the library BY NAME, so the names below are the
-- exact ones the seeded library carries — upstream's own, lower-cased but for
-- the first letter, warts and all ("Barbell full squat", "Power point plank").
-- A plausible near-miss silently drops that exercise and the day comes out
-- short, which reads as a bug in the app rather than a typo in a seed. The
-- summary at the end counts the entries that resolved, so a library rename is
-- loud instead of quiet.
--
-- `authored` is how many weeks the blueprint spells out. One means "a single
-- week's shape, repeated", which is what most templates mean. `strength4` spells
-- out four, with sets up and reps down as it goes — the only way to see the week
-- switcher, `program_exercise.week` and the log's "which week is this" fallback
-- do anything at all.

CREATE TEMP TABLE r20_template (
    key      text PRIMARY KEY,
    id       uuid,
    name     text,
    goal     text,
    descr    text,
    weeks    int,      -- how long the program runs
    authored int,      -- how many weeks the blueprint spells out
    slots    text,     -- the ordinal day slots: "1,2,3"
    plan     jsonb,    -- ordinal slot → exercise names, in order
    labels   jsonb
) ON COMMIT DROP;

INSERT INTO r20_template VALUES
 ('ppl', md5(:'trainer_phone' || ':real20:template:ppl')::uuid, 'Push / Pull / Legs', 'Build strength',
  'Three days, one pattern each. The default for anybody past their first three months.', 8, 1, '1,2,3',
  '{"1":["Barbell bench press","Dumbbell incline bench press","Cable pushdown"],
    "2":["Barbell deadlift","Barbell bent over row","Barbell curl"],
    "3":["Barbell full squat","Barbell romanian deadlift","Barbell standing calf raise"]}',
  '{"1":"Push","2":"Pull","3":"Legs"}'),
 ('full3', md5(:'trainer_phone' || ':real20:template:full3')::uuid, 'Full Body · 3 Day', 'General fitness',
  'Everything every session. For two or three days a week, which is most people.', 12, 1, '1,2,3',
  '{"1":["Barbell full squat","Barbell bench press","Barbell bent over row"],
    "2":["Barbell deadlift","Dumbbell seated shoulder press","Pull-up"],
    "3":["Smith leg press","Dumbbell bench press","Cable rope elevated seated row"]}',
  '{"1":"Full Body A","2":"Full Body B","3":"Full Body C"}'),
 ('ul', md5(:'trainer_phone' || ':real20:template:ul')::uuid, 'Upper / Lower', 'Muscle gain',
  'Two days split down the middle. The evening crowd''s programme.', 8, 1, '1,2',
  '{"1":["Barbell bench press","Barbell bent over row","Dumbbell seated shoulder press"],
    "2":["Barbell full squat","Barbell romanian deadlift","Smith leg press"]}',
  '{"1":"Upper","2":"Lower"}'),
 ('beginner', md5(:'trainer_phone' || ':real20:template:beginner')::uuid, 'Beginner Full Body', 'General fitness',
  'Machines and dumbbells for the first month. Nothing that needs a spotter.', 6, 1, '1,2',
  '{"1":["Smith leg press","Dumbbell bench press","Cable rope elevated seated row"],
    "2":["Barbell glute bridge","Dumbbell seated shoulder press","Battling ropes"]}',
  '{"1":"Machines A","2":"Machines B"}'),
 ('strength4', md5(:'trainer_phone' || ':real20:template:strength4')::uuid, 'Strength · 4 Day', 'Powerlifting',
  'Four weeks written out, sets up and reps down as it goes. Week four is the heavy one.', 4, 4, '1,2,3,4',
  '{"1":["Barbell full squat","Barbell bench press","Barbell bent over row"],
    "2":["Barbell deadlift","Dumbbell seated shoulder press","Pull-up"],
    "3":["Barbell full squat","Dumbbell incline bench press","Cable low seated row"],
    "4":["Barbell romanian deadlift","Dumbbell bench press","Farmers walk"]}',
  '{"1":"Squat day","2":"Pull day","3":"Bench day","4":"Carry day"}'),
 ('remote', md5(:'trainer_phone' || ':real20:template:remote')::uuid, 'Remote Core', 'Post-natal',
  'Over a call, on a mat, with nothing that needs a rack.', 6, 1, '1,2',
  '{"1":["Power point plank","Barbell glute bridge","Mountain climber"],
    "2":["Power point plank","Dead bug","Russian twist"]}',
  '{"1":"Core A","2":"Core B"}');

INSERT INTO template (id, trainer_id, name, goal, description, structure, day_labels, weeks,
                      training_days, created_at)
SELECT st.id, t.id, st.name, st.goal, st.descr,
       -- Flattened into the array the app reads: one entry per exercise per
       -- authored week, carrying the ORDINAL DAY SLOT it sits on and the order
       -- within that day. Exercises the library doesn't have are dropped rather
       -- than written as a dangling id.
       --
       -- The join is scoped to the shared library plus THIS trainer's own
       -- exercises. Unscoped, a second trainer with a custom exercise of the
       -- same name would double every entry that mentions it.
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
                  'exercise_id',  e.id,
                  'week',         wk,
                  'sets',         CASE WHEN st.authored > 1 THEN 3 + (wk / 3) ELSE 3 + (ord % 2)::int END,
                  'reps',         CASE WHEN st.authored > 1 THEN 10 - wk
                                       WHEN ord = 1 THEN 6 ELSE 10 END,
                  'rest_seconds', CASE WHEN ord = 1 THEN 120 ELSE 60 END,
                  'target_load',  NULL,
                  'notes',        NULL,
                  'day_of_week',  slot::int,
                  'order_index',  ord - 1)
                ORDER BY wk, slot::int, ord)
         FROM generate_series(1, st.authored) AS wk,
              jsonb_each(st.plan) AS d(slot, names),
              LATERAL jsonb_array_elements_text(d.names) WITH ORDINALITY AS x(nm, ord)
         JOIN exercise e ON lower(e.name) = lower(x.nm) AND e.deleted_at IS NULL
                        AND (e.is_custom = FALSE OR e.trainer_id = t.id)
       ), '[]'::jsonb),
       st.labels, st.weeks, st.slots, (CURRENT_DATE - 200)::timestamptz
FROM r20_template st, seed_trainer t
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, goal = EXCLUDED.goal, description = EXCLUDED.description,
    structure = EXCLUDED.structure, day_labels = EXCLUDED.day_labels,
    weeks = EXCLUDED.weeks, training_days = EXCLUDED.training_days,
    deleted_at = NULL, updated_at = now();

-- ── The roster ──────────────────────────────────────────────────────────────
--
-- Twenty people, and a plausible client list rather than a catalogue of states.
-- Read the columns as the specification of one trainer's week:
--
--   tpl        which template they are on. NULL means nothing is set up yet.
--   band       am | pm — the half of the split shift they train in.
--   days       the ISO weekdays they train, ascending. Its LENGTH must equal the
--              number of ordinal slots their template has: the apply endpoint
--              refuses a schedule that doesn't cover each day exactly once
--              (`validateSchedule`), and a seed that disagrees with it is
--              writing a program the product could not have produced. The
--              assertion below enforces the same rule.
--   hist_weeks how far back their history runs, clamped to when they joined.
--              Nine weeks is the two months of logs this seed is for.
--   dark_days  a recent silence. Nothing is generated inside it, which is what
--              makes a client genuinely quiet rather than quiet-looking.
--   pay_state  paid | overdue | partial | fresh | none
--   remaining  sessions left on the live pack. NULL for monthly and for nobody.
--
-- The TIME each session lands on is not typed here. It is derived below from
-- who else trains that morning, which is the only way to be sure two people are
-- never booked at once — the failure the full demo has by construction, where
-- five clients share 6am.

CREATE TEMP TABLE r20_client (
    key        text PRIMARY KEY,
    id         uuid,
    name       text,
    phone      text,
    goal       text,
    tpl        text,
    band       text,     -- am | pm
    days       text,     -- ISO weekdays, ascending: "1,3,5"
    duration   int,
    mode       text,     -- floor | remote
    pay_mode   text,     -- trainer_collects | gym_collects
    split      numeric,  -- what the TRAINER keeps, where the gym collects
    height     numeric,
    activity   text,
    status     text,     -- active | paused | inactive | invited | archived
    membership text,     -- accepted | invited | declined | removed
    joined     int,      -- days ago
    hist_weeks int,
    dark_days  int,
    pack_slug  text,
    pay_state  text,
    remaining  int
) ON COMMIT DROP;

INSERT INTO r20_client (key, name, phone, goal, tpl, band, days, duration, mode, pay_mode,
                        split, height, activity, status, membership, joined, hist_weeks,
                        dark_days, pack_slug, pay_state, remaining) VALUES
-- ── the morning shift · 06:00 – 11:00 ───────────────────────────────────────
 ('ananya',  'Ananya Iyer',       '9840120001', 'Build strength',  'ppl',       'am', '1,3,5',   60, 'floor',  'trainer_collects', NULL, 164, 'moderate',    'active', 'accepted', 260, 9,  0, 'p16', 'paid',     11),
 ('arjun',   'Arjun Nair',        '9840120002', 'Powerlifting',    'strength4', 'am', '1,3,4,6', 60, 'floor',  'trainer_collects', NULL, 178, 'very_active', 'active', 'accepted', 240, 9,  0, 'p16', 'paid',      9),
 ('bhavana', 'Bhavana Reddy',     '9840120003', 'General fitness', 'ul',        'am', '2,5',     60, 'floor',  'gym_collects',       60, 158, 'sedentary',   'active', 'accepted', 200, 9,  0, 'g12', 'paid',      7),
 ('dinesh',  'Dinesh Kumar',      '9840120004', 'Fat loss',        'full3',     'am', '1,3,5',   60, 'floor',  'trainer_collects', NULL, 172, 'light',       'active', 'accepted', 180, 9,  0, 'p12', 'overdue',   6),
 ('gayathri','Gayathri S',        '9840120005', 'Post-natal',      'beginner',  'am', '2,4',     45, 'floor',  'trainer_collects', NULL, 160, 'light',       'active', 'accepted', 150, 9,  0, 'p8',  'paid',      4),
 ('harish',  'Harish Kumar',      '9840120006', 'Muscle gain',     'ppl',       'am', '2,4,6',   60, 'floor',  'trainer_collects', NULL, 175, 'moderate',    'active', 'accepted', 140, 9,  0, 'p16', 'partial',   8),
 -- Quiet for eleven days. No sessions in that window, so no workouts either —
 -- which is what makes the roster's "hasn't trained in 11 days" true rather than
 -- a client who merely looks idle.
 ('kavya',   'Kavya Ravi',        '9840120007', 'Fat loss',        'beginner',  'am', '3,6',     45, 'floor',  'trainer_collects', NULL, 161, 'light',       'active', 'accepted', 120, 9, 11, 'p8',  'paid',      5),
 ('meera',   'Meera Balan',       '9840120008', 'General fitness', 'full3',     'am', '2,4,6',   60, 'floor',  'gym_collects',       55, 157, 'sedentary',   'active', 'accepted', 110, 9,  0, 'g8',  'paid',      3),
 ('rohit',   'Rohit Sharma',      '9840120009', 'Muscle gain',     'ul',        'am', '1,5',     60, 'floor',  'trainer_collects', NULL, 180, 'active',      'active', 'accepted',  95, 9,  0, 'p12', 'paid',      9),
-- ── the evening shift · 17:00 – 22:00 ───────────────────────────────────────
 ('chandran','Chandran Pillai',   '9840120010', 'Fat loss',        'ul',        'pm', '2,5',     60, 'floor',  'trainer_collects', NULL, 171, 'light',       'active', 'accepted', 175, 9,  0, 'p12', 'overdue',   6),
 ('farhan',  'Farhan Qureshi',    '9840120011', 'Muscle gain',     'ul',        'pm', '1,4',     60, 'floor',  'trainer_collects', NULL, 181, 'active',      'active', 'accepted', 160, 9,  0, 'p12', 'paid',      5),
 ('imran',   'Imran Sheikh',      '9840120012', 'Build strength',  'ppl',       'pm', '1,3,5',   60, 'floor',  'trainer_collects', NULL, 177, 'moderate',    'active', 'accepted', 130, 9,  0, 'p16', 'paid',     10),
 ('jyothi',  'Jyothi Balan',      '9840120013', 'General fitness', 'beginner',  'pm', '2,4',     45, 'floor',  'gym_collects',       50, 155, 'sedentary',   'active', 'accepted', 100, 9,  0, 'g8',  'paid',      4),
 ('lakshmi', 'Lakshmi Narayanan', '9840120014', 'General fitness', 'remote',    'pm', '3,6',     45, 'remote', 'trainer_collects', NULL, 161, 'light',       'active', 'accepted',  90, 9,  0, 'pm',  'paid',   NULL),
 ('nithya',  'Nithya Krishnan',   '9840120015', 'Fat loss',        'full3',     'pm', '2,4,6',   60, 'floor',  'trainer_collects', NULL, 157, 'sedentary',   'active', 'accepted',  85, 9,  0, 'p16', 'paid',     12),
 ('priya',   'Priya Ramesh',      '9840120016', 'Fat loss',        'remote',    'pm', '1,5',     45, 'remote', 'trainer_collects', NULL, 163, 'moderate',    'active', 'accepted',  75, 9,  0, 'pm',  'paid',   NULL),
 ('sneha',   'Sneha Rao',         '9840120017', 'Post-natal',      'remote',    'pm', '2,6',     45, 'remote', 'trainer_collects', NULL, 162, 'light',       'active', 'accepted',  60, 9,  0, 'pm',  'fresh',  NULL),
 -- Paused eighteen days ago. A paused client has no FUTURE bookings either,
 -- which is the difference between paused and merely quiet.
 ('tarun',   'Tarun Gopal',       '9840120018', 'Muscle gain',     'ppl',       'pm', '1,3,6',   60, 'floor',  'trainer_collects', NULL, 176, 'light',       'paused', 'accepted',  55, 9, 18, 'p12', 'paid',      6),
 ('vikram',  'Vikram Chandra',    '9840120019', 'Build strength',  'ul',        'pm', '3,5',     60, 'floor',  'trainer_collects', NULL, 179, 'active',      'active', 'accepted',  45, 6,  0, 'p8',  'paid',      2),
 -- Signed up yesterday and nothing set up yet. No template, so no plan, no
 -- bookings and no pack — the roster's "waiting for you", which is a different
 -- thing from a client who has gone quiet.
 ('charu',   'Charu Anand',       '9840120020', 'General fitness', NULL,        NULL, NULL,      60, 'floor',  'trainer_collects', NULL, 160, 'sedentary',   'active', 'accepted',   1, 0,  0, NULL,  'none',   NULL);

UPDATE r20_client SET id = md5(:'trainer_phone' || ':real20:client:' || key)::uuid;

-- The count-match rule, checked here rather than discovered later. `apply`
-- refuses a schedule that does not cover each of the template's ordinal days
-- exactly once; a client whose `days` list is the wrong length would be a
-- program the product could not have produced.
DO $$
DECLARE bad text;
BEGIN
    SELECT string_agg(format('%s: %s days for a %s-day template', c.key,
                             cardinality(string_to_array(c.days, ',')),
                             cardinality(string_to_array(t.slots, ','))), '; ' ORDER BY c.key)
    INTO bad
    FROM r20_client c JOIN r20_template t ON t.key = c.tpl
    WHERE cardinality(string_to_array(c.days, ',')) <> cardinality(string_to_array(t.slots, ','));
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'Schedule does not cover the template''s days: %', bad;
    END IF;
END $$;

-- ── The timetable ───────────────────────────────────────────────────────────
--
-- The heart of this seed. One trainer coaches one person at a time, so a slot is
-- a scarce thing and the data has to behave like it.
--
-- Each (weekday, band) is a queue: the clients who train that morning are
-- stacked into the four positions in a stable order, and the position decides
-- the time — 06:00, 07:15, 08:30, 09:45 in the morning and 17:00, 18:15, 19:30,
-- 20:45 in the evening. Because position comes from `row_number()` over that
-- exact partition, two clients on the same day CANNOT land on the same time; it
-- is not a property somebody has to remember to preserve when they add a
-- twenty-first client.
--
-- The 75-minute pitch is what makes the frame hold with mixed durations: a
-- 45-minute call and a 60-minute floor session both fit one position, with the
-- rest of the pitch as turnaround. A session longer than 75 would not, which is
-- what the overflow check below is watching for.
--
-- The ordinal slot each weekday carries — `template_day` — is the day's position
-- in the client's own ascending list, which is exactly what
-- `parseWeeklySchedule` derives on the phone. Day 1 is the earliest weekday.

CREATE TEMP TABLE r20_slot ON COMMIT DROP AS
WITH raw AS (
    SELECT c.key, c.id AS client_id, c.duration, c.band,
           d.day::int AS weekday,
           d.ord::int AS template_day
    FROM r20_client c
    CROSS JOIN LATERAL unnest(string_to_array(c.days, ',')) WITH ORDINALITY AS d(day, ord)
    WHERE c.days IS NOT NULL
),
queued AS (
    -- Ordered by key: arbitrary, but stable across runs, which is what keeps a
    -- re-run from reshuffling everybody's 6am.
    SELECT r.*, row_number() OVER (PARTITION BY r.weekday, r.band ORDER BY r.key) AS position
    FROM raw r
)
SELECT q.key, q.client_id, q.duration, q.weekday, q.template_day, q.band, q.position,
       b.opens + (q.position - 1) * 75 AS start_minute,
       b.opens + (q.position - 1) * 75 + q.duration AS end_minute,
       b.closes,
       to_char(make_interval(mins => (b.opens + (q.position - 1) * 75)::int), 'HH24:MI') AS at_time
FROM queued q
JOIN (VALUES ('am', 360, 660), ('pm', 1020, 1320)) AS b(band, opens, closes) ON b.band = q.band;

-- Does the day still fit inside the shift? A fifth client on one morning, or a
-- 90-minute session, pushes the last position past 11:00 — and a diary that
-- books people outside the trainer's own hours contradicts itself on screen.
DO $$
DECLARE bad text;
BEGIN
    SELECT string_agg(format('%s on weekday %s runs to %s, shift closes %s', key, weekday,
                             to_char(make_interval(mins => end_minute::int), 'HH24:MI'),
                             to_char(make_interval(mins => closes::int), 'HH24:MI')),
                      '; ' ORDER BY weekday, start_minute)
    INTO bad FROM r20_slot WHERE end_minute > closes;
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'The timetable overflows the working day: %', bad;
    END IF;
END $$;

INSERT INTO client (id, trainer_id, name, phone, goal, status, payment_mode, trainer_split_percent,
                    height_cm, activity_level, delivery_mode, sessions_per_week,
                    session_duration_minutes, weekly_schedule, membership_status,
                    invited_at, accepted_at, paused_at, metadata, created_at)
SELECT c.id, t.id, c.name, c.phone, c.goal, c.status, c.pay_mode, c.split,
       c.height, c.activity, c.mode,
       NULLIF(cardinality(COALESCE(string_to_array(c.days, ','), '{}')), 0),
       c.duration,
       -- `[{templateDay, weekday, time}]`, the canonical shape in
       -- `app/src/clients/schedule.ts`. `templateDay` is the ORDINAL slot the
       -- day carries, `weekday` is the calendar day it falls on — the two
       -- meanings V24 separated.
       COALESCE((SELECT jsonb_agg(jsonb_build_object(
                          'templateDay', s.template_day,
                          'weekday',     s.weekday,
                          'time',        s.at_time) ORDER BY s.weekday)
                 FROM r20_slot s WHERE s.key = c.key), '[]'::jsonb),
       c.membership,
       (CURRENT_DATE - c.joined)::timestamptz,
       (CURRENT_DATE - c.joined + 1)::timestamptz,
       CASE WHEN c.status = 'paused' THEN (CURRENT_DATE - GREATEST(c.dark_days, 1))::timestamptz END,
       -- `pausedAt` is written into metadata as well as into its own column,
       -- because that is where `setClientStatus` puts it and it is what the
       -- roster's second line reads. The column is the server's record; the
       -- metadata key is the phone's.
       '{"seed":"real20"}'::jsonb
         || CASE WHEN c.status = 'paused'
                 THEN jsonb_build_object('pausedAt', (CURRENT_DATE - GREATEST(c.dark_days, 1))::text)
                 ELSE '{}'::jsonb END,
       (CURRENT_DATE - c.joined)::timestamptz
FROM r20_client c, seed_trainer t
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, phone = EXCLUDED.phone, goal = EXCLUDED.goal,
    status = EXCLUDED.status, payment_mode = EXCLUDED.payment_mode,
    trainer_split_percent = EXCLUDED.trainer_split_percent,
    height_cm = EXCLUDED.height_cm, activity_level = EXCLUDED.activity_level,
    delivery_mode = EXCLUDED.delivery_mode, sessions_per_week = EXCLUDED.sessions_per_week,
    session_duration_minutes = EXCLUDED.session_duration_minutes,
    weekly_schedule = EXCLUDED.weekly_schedule, membership_status = EXCLUDED.membership_status,
    invited_at = EXCLUDED.invited_at, accepted_at = EXCLUDED.accepted_at,
    paused_at = EXCLUDED.paused_at, metadata = EXCLUDED.metadata,
    created_at = EXCLUDED.created_at, deleted_at = NULL, updated_at = now();

-- One identity per phone. Everybody here has accepted, so everybody has a
-- privacy timestamp; consent is evidence and evidence has a date.
INSERT INTO app_user (id, phone, role, privacy_accepted_at, created_at)
SELECT md5(:'trainer_phone' || ':real20:user:' || c.key)::uuid, c.phone, 'client',
       (CURRENT_DATE - c.joined + 1)::timestamptz, (CURRENT_DATE - c.joined)::timestamptz
FROM r20_client c
WHERE c.phone IS NOT NULL
ON CONFLICT (phone) DO NOTHING;

-- ── Programs ────────────────────────────────────────────────────────────────
--
-- A program is a template already copied onto one client. It carries the
-- `template_id` it came from as PROVENANCE, never as authority: nothing reads a
-- program's exercises through its template, which is what makes "editing a
-- template never changes a plan somebody is halfway through" true rather than
-- aspirational.
--
-- `schedule` is the V24 mapping — which weekday and time each ordinal day landed
-- on. It is written once by apply and read by the phone on sync, and it is the
-- only record of the choice: `program_exercise` below carries the answer but not
-- the question.

CREATE TEMP TABLE r20_program ON COMMIT DROP AS
SELECT c.key,
       md5(:'trainer_phone' || ':real20:program:' || c.key)::uuid AS id,
       c.id AS client_id,
       t.id AS template_id,
       t.name,
       c.goal,
       -- Clamped to when they joined: a program cannot start before its client.
       (date_trunc('week', GREATEST(CURRENT_DATE - c.hist_weeks * 7,
                                    CURRENT_DATE - c.joined))::date) AS start_date,
       t.weeks,
       t.authored,
       CASE WHEN c.status = 'paused' THEN 'paused' ELSE 'active' END AS status
FROM r20_client c
JOIN r20_template t ON t.key = c.tpl;

INSERT INTO program (id, trainer_id, client_id, template_id, name, goal, start_date, end_date,
                     schedule, status, created_at)
SELECT p.id, t.id, p.client_id, p.template_id, p.name, p.goal, p.start_date,
       p.start_date + p.weeks * 7,
       (SELECT jsonb_agg(jsonb_build_object('day', s.template_day,
                                            'weekday', s.weekday,
                                            'time', s.at_time) ORDER BY s.template_day)
        FROM r20_slot s WHERE s.key = p.key),
       p.status, p.start_date::timestamptz
FROM r20_program p, seed_trainer t
ON CONFLICT (id) DO UPDATE SET
    template_id = EXCLUDED.template_id, name = EXCLUDED.name, goal = EXCLUDED.goal,
    start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
    schedule = EXCLUDED.schedule, status = EXCLUDED.status,
    deleted_at = NULL, updated_at = now();

-- One finished block behind the current one, so the client file's Programs tab
-- has a history rather than a single row that has always been there.
INSERT INTO program (id, trainer_id, client_id, template_id, name, goal, start_date, end_date,
                     status, created_at)
SELECT md5(:'trainer_phone' || ':real20:program:prev:' || p.key)::uuid, t.id, p.client_id,
       p.template_id, p.name || ' · block 1', p.goal,
       p.start_date - 56, p.start_date - 1, 'completed', (p.start_date - 56)::timestamptz
FROM r20_program p, seed_trainer t
WHERE p.key IN ('ananya', 'arjun', 'imran', 'nithya')
ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status, deleted_at = NULL, updated_at = now();

-- ── The copy, and the translation ───────────────────────────────────────────
--
-- Assigning a program COPIES the template's blueprint into `program_exercise`
-- rows. On a device the server does this inside `POST /v1/templates/{id}/apply`;
-- the seed has to do it too, or every client ends up with a program that has a
-- name, a start date and no exercises — and the workout log opens on "Nothing
-- planned" for somebody who plainly has a plan.
--
-- The copy is also the translation V24 introduced: the blueprint's
-- `day_of_week` is an ORDINAL SLOT, and the row that lands in the client's plan
-- carries the concrete WEEKDAY that slot was scheduled on. That is what the
-- phone's log keys on — `fetchProgramExercisesForDay` looks up
-- `program_exercise.day_of_week` by the session's weekday — so getting it wrong
-- means a plan that exists and a log that cannot find it.
--
-- `week` comes across with everything else. A four-week blueprint copies four
-- weeks of rows rather than flattening them into one week repeated four times.

INSERT INTO program_exercise (id, program_id, exercise_id, sets, reps, rest_seconds,
                              target_load, notes, day_of_week, week, order_index, created_at)
SELECT md5(:'trainer_phone' || ':real20:progex:' || p.key || ':'
           || COALESCE(entry->>'week', '1') || ':'
           || (entry->>'day_of_week') || ':' || (entry->>'order_index'))::uuid,
       p.id,
       (entry->>'exercise_id')::uuid,
       (entry->>'sets')::int,
       (entry->>'reps')::int,
       (entry->>'rest_seconds')::int,
       NULL, NULL,
       sl.weekday,
       COALESCE((entry->>'week')::int, 1),
       (entry->>'order_index')::int,
       p.start_date::timestamptz
FROM r20_program p
JOIN template tpl ON tpl.id = p.template_id
CROSS JOIN LATERAL jsonb_array_elements(tpl.structure) AS entry
JOIN r20_slot sl ON sl.key = p.key AND sl.template_day = (entry->>'day_of_week')::int
ON CONFLICT (id) DO UPDATE SET
    exercise_id = EXCLUDED.exercise_id, sets = EXCLUDED.sets, reps = EXCLUDED.reps,
    rest_seconds = EXCLUDED.rest_seconds, day_of_week = EXCLUDED.day_of_week,
    week = EXCLUDED.week, order_index = EXCLUDED.order_index,
    deleted_at = NULL, updated_at = now();

-- ── Packs sold ──────────────────────────────────────────────────────────────
--
-- The bill, as opposed to the price list. `sessions_total` and
-- `sessions_remaining` are placeholders here — both are rewritten at the end
-- from the sessions that actually consumed them, plus the target remainder on
-- the roster above. Typing a plausible number instead is how the roster chip,
-- the diary and the pack detail end up disagreeing.

CREATE TEMP TABLE r20_package ON COMMIT DROP AS
SELECT c.key,
       md5(:'trainer_phone' || ':real20:package:' || c.key)::uuid AS id,
       c.id AS client_id,
       k.id AS pack_id,
       k.type,
       k.sessions,
       CASE c.key WHEN 'harish' THEN 1000::numeric END AS discount,
       k.amount - COALESCE(CASE c.key WHEN 'harish' THEN 1000::numeric END, 0) AS amount,
       -- Billed at the start of THIS month, or four weeks ago, whichever is
       -- LATER — so the current month's figures are never empty on a run early
       -- in the month, and never quietly land in last month's column on a run
       -- late in it. Clamped to when they joined, because a pack cannot be sold
       -- to somebody who was not yet on the roster.
       GREATEST(date_trunc('month', CURRENT_DATE)::date, CURRENT_DATE - 28,
                CURRENT_DATE - c.joined) AS billed_on,
       c.pay_state,
       c.remaining,
       c.mode,
       c.pay_mode,
       c.split
FROM r20_client c
JOIN pack k ON k.id = md5(:'trainer_phone' || ':real20:catalogue:' || c.pack_slug)::uuid
WHERE c.pack_slug IS NOT NULL;

INSERT INTO package (id, trainer_id, client_id, type, sessions_total, sessions_remaining,
                     amount, currency, start_date, end_date, status, pack_id, due_date,
                     discount_amount, created_at)
SELECT p.id, t.id, p.client_id, p.type, p.sessions, p.sessions, p.amount, 'INR',
       p.billed_on, p.billed_on + 60, 'active', p.pack_id,
       -- When the money was agreed. The overdue ones are well past it; the fresh
       -- one was agreed three days ago and is not late yet, which is the
       -- distinction the chase list turns on.
       CASE p.pay_state WHEN 'overdue' THEN CURRENT_DATE - 12
                        WHEN 'partial' THEN CURRENT_DATE - 4
                        WHEN 'fresh'   THEN CURRENT_DATE + 4
                        ELSE p.billed_on END,
       p.discount,
       p.billed_on::timestamptz
FROM r20_package p, seed_trainer t
ON CONFLICT (id) DO UPDATE SET
    type = EXCLUDED.type, amount = EXCLUDED.amount, status = EXCLUDED.status,
    start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
    pack_id = EXCLUDED.pack_id, due_date = EXCLUDED.due_date,
    discount_amount = EXCLUDED.discount_amount,
    deleted_at = NULL, updated_at = now();

-- Last month's packs, closed and paid in full. Without them the month strip has
-- exactly one entry and "hisaab clear" — a whole month with nothing left out —
-- has nowhere to show itself. Only for the clients who were already here.
INSERT INTO package (id, trainer_id, client_id, type, sessions_total, sessions_remaining,
                     amount, currency, start_date, end_date, status, pack_id, due_date, created_at)
SELECT md5(:'trainer_phone' || ':real20:package:prev:' || p.key)::uuid, t.id, p.client_id, p.type,
       COALESCE(p.sessions, 0), 0, p.amount, 'INR',
       (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date,
       (date_trunc('month', CURRENT_DATE) - INTERVAL '1 day')::date,
       'expired', p.pack_id,
       (date_trunc('month', CURRENT_DATE) - INTERVAL '1 day')::date,
       (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::timestamptz
FROM r20_package p
JOIN r20_client c ON c.key = p.key, seed_trainer t
WHERE c.joined > 45
ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount, status = EXCLUDED.status, pack_id = EXCLUDED.pack_id,
    deleted_at = NULL, updated_at = now();

-- ── Money in ────────────────────────────────────────────────────────────────
--
-- The gym's cut is stamped onto each entry AT RECORD TIME, exactly as the app
-- does it — the percentage is copied onto the row and never looked up later, so
-- a contract that changes in October leaves September alone. `split` is what the
-- TRAINER keeps, so a client on 60 means the gym takes 40, not 50. Remote is
-- always zero, which is a rule in code rather than a second column.
--
-- The part payment is one row for less than the package, not a 'partial' status:
-- the balance is derived, and a status that claimed to know it would be a second
-- copy of the same fact.
INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, method,
                     collected_by, status, upi_reference, paid_at,
                     gym_share_amount, share_percent, receipt_no, note, created_at)
SELECT md5(:'trainer_phone' || ':real20:pay:' || p.key)::uuid, t.id, p.client_id, p.id,
       CASE p.pay_state WHEN 'partial' THEN round(p.amount * 0.5, 2) ELSE p.amount END,
       'INR',
       CASE WHEN p.pay_mode = 'gym_collects' THEN 'gym_front_office'
            WHEN p.key IN ('ananya', 'kavya', 'rohit') THEN 'cash'
            ELSE 'upi_intent' END,
       CASE WHEN p.pay_mode = 'gym_collects' THEN 'gym' ELSE 'trainer' END,
       'paid',
       CASE WHEN p.pay_mode = 'gym_collects' OR p.key IN ('ananya', 'kavya', 'rohit')
            THEN NULL ELSE 'UPI' || upper(substr(md5(p.key), 1, 8)) END,
       (p.billed_on + 1)::timestamptz + INTERVAL '11 hours',
       CASE WHEN p.mode = 'remote' THEN 0
            ELSE round(CASE p.pay_state WHEN 'partial' THEN p.amount * 0.5 ELSE p.amount END
                       * COALESCE(100 - p.split, 50) / 100, 2) END,
       CASE WHEN p.mode = 'remote' THEN 0 ELSE COALESCE(100 - p.split, 50) END,
       'TX-' || to_char(CURRENT_DATE, 'YYMM') || '-' || lpad((row_number() OVER (ORDER BY p.key))::text, 3, '0'),
       CASE p.pay_state WHEN 'partial' THEN 'Half now, rest after salary day.' END,
       (p.billed_on + 1)::timestamptz + INTERVAL '11 hours'
FROM r20_package p, seed_trainer t
WHERE p.pay_state IN ('paid', 'partial')
ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount, method = EXCLUDED.method, status = EXCLUDED.status,
    paid_at = EXCLUDED.paid_at, gym_share_amount = EXCLUDED.gym_share_amount,
    share_percent = EXCLUDED.share_percent, receipt_no = EXCLUDED.receipt_no,
    note = EXCLUDED.note, deleted_at = NULL, updated_at = now();

-- The bills that have gone out and not come back. A `pending` row is the record
-- that money was ASKED FOR on a date — which is what the roster ages to decide
-- whether a client is overdue or merely due. The amount owed is still derived
-- from the package minus what was collected against it, so this row never
-- double-counts.
INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, method,
                     collected_by, status, created_at)
SELECT md5(:'trainer_phone' || ':real20:pay:due:' || p.key)::uuid, t.id, p.client_id, p.id,
       p.amount, 'INR',
       CASE WHEN p.pay_mode = 'gym_collects' THEN 'gym_front_office' ELSE 'upi_intent' END,
       CASE WHEN p.pay_mode = 'gym_collects' THEN 'gym' ELSE 'trainer' END,
       CASE WHEN p.pay_state = 'overdue' THEN 'overdue' ELSE 'pending' END,
       GREATEST(p.billed_on,
                CASE p.pay_state WHEN 'overdue' THEN CURRENT_DATE - 12
                                 ELSE CURRENT_DATE - 3 END)::timestamptz
FROM r20_package p, seed_trainer t
WHERE p.pay_state IN ('overdue', 'fresh')
ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount, status = EXCLUDED.status,
    created_at = EXCLUDED.created_at, deleted_at = NULL, updated_at = now();

-- Last month, settled by everybody — the month the strip can point at and say
-- nothing was left out.
INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, method,
                     collected_by, status, upi_reference, paid_at,
                     gym_share_amount, share_percent, receipt_no, created_at)
SELECT md5(:'trainer_phone' || ':real20:pay:prev:' || p.key)::uuid, t.id, p.client_id,
       md5(:'trainer_phone' || ':real20:package:prev:' || p.key)::uuid, p.amount, 'INR',
       CASE WHEN p.pay_mode = 'gym_collects' THEN 'gym_front_office'
            WHEN p.key IN ('ananya', 'kavya', 'rohit') THEN 'cash' ELSE 'upi_intent' END,
       CASE WHEN p.pay_mode = 'gym_collects' THEN 'gym' ELSE 'trainer' END,
       'paid',
       CASE WHEN p.pay_mode = 'gym_collects' OR p.key IN ('ananya', 'kavya', 'rohit')
            THEN NULL ELSE 'UPI' || upper(substr(md5('prev' || p.key), 1, 8)) END,
       (date_trunc('month', CURRENT_DATE) - INTERVAL '4 days')::timestamptz,
       CASE WHEN p.mode = 'remote' THEN 0
            ELSE round(p.amount * COALESCE(100 - p.split, 50) / 100, 2) END,
       CASE WHEN p.mode = 'remote' THEN 0 ELSE COALESCE(100 - p.split, 50) END,
       'TX-' || to_char(date_trunc('month', CURRENT_DATE) - INTERVAL '1 month', 'YYMM')
             || '-' || lpad((row_number() OVER (ORDER BY p.key))::text, 3, '0'),
       (date_trunc('month', CURRENT_DATE) - INTERVAL '4 days')::timestamptz
FROM r20_package p
JOIN r20_client c ON c.key = p.key, seed_trainer t
WHERE c.joined > 45
ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount, method = EXCLUDED.method, status = EXCLUDED.status,
    paid_at = EXCLUDED.paid_at, gym_share_amount = EXCLUDED.gym_share_amount,
    share_percent = EXCLUDED.share_percent, receipt_no = EXCLUDED.receipt_no,
    deleted_at = NULL, updated_at = now();

-- What the gym is owed is written further down, after the sessions exist: a
-- settlement counts the sessions it covers, and computing it here would file
-- every month under nought sessions.

-- ── The diary ───────────────────────────────────────────────────────────────
--
-- Nine weeks back — the two months of history this seed is for — to two weeks
-- forward. Two weeks forward rather than one because the diary has a week
-- switcher and a week with nothing in it looks broken.
--
-- `dark_days` cuts a hole at the recent end. That is what makes a quiet client
-- genuinely quiet — no sessions, so no workouts, so nothing logged in eleven
-- days — rather than one who merely looks it.

CREATE TEMP TABLE r20_session ON COMMIT DROP AS
WITH days AS (
    SELECT generate_series(CURRENT_DATE - 63, CURRENT_DATE + 14, INTERVAL '1 day')::date AS d
),
raw AS (
    SELECT sl.key, sl.client_id, sl.duration, sl.weekday, sl.template_day,
           ((d.d + sl.at_time::time) AT TIME ZONE :'tz') AS at,
           d.d AS on_date,
           -- Deterministic per client, date and time, so a re-run inside the same
           -- day lands on the same rows rather than doubling them.
           md5(:'trainer_phone' || ':real20:sess:' || sl.key || ':' || d.d || ':' || sl.at_time)::uuid AS id,
           row_number() OVER (PARTITION BY sl.key ORDER BY d.d, sl.at_time) AS n
    FROM days d
    JOIN r20_slot sl ON EXTRACT(ISODOW FROM d.d)::int = sl.weekday
    JOIN r20_client c ON c.key = sl.key
    WHERE d.d >= GREATEST(CURRENT_DATE - c.hist_weeks * 7, CURRENT_DATE - c.joined)
      -- The silence. Nothing is generated inside it, in either direction: a
      -- paused client has no future bookings either.
      AND (c.dark_days = 0 OR d.d < CURRENT_DATE - c.dark_days)
)
SELECT r.*,
       CASE WHEN r.at > now() THEN 'scheduled' ELSE 'done' END AS status
FROM raw r;

-- The awkward cases, chosen AFTER generation by position in each client's own
-- history rather than by a date offset. "Dinesh four days ago" silently matches
-- nothing in a week where the fourth day back is not one of Dinesh's training
-- days, which is most weeks — and a no-show rate of 0.0% makes every adherence
-- strip come out all-green.
--
-- Roughly one session in twenty-five is missed and one in thirty called off,
-- which is what a working book looks like.
CREATE TEMP TABLE r20_exception ON COMMIT DROP AS
WITH past AS (
    SELECT key, id, row_number() OVER (PARTITION BY key ORDER BY at DESC) AS nth
    FROM r20_session WHERE status = 'done'
)
SELECT p.id, x.status
FROM past p
JOIN (VALUES
        -- No-shows. They cost the trainer the hour and the pack still moves,
        -- which is the rule the money side turns on.
        ('dinesh', 3, 'no_show'), ('dinesh', 14, 'no_show'),
        ('chandran', 5, 'no_show'), ('harish', 9, 'no_show'),
        ('jyothi', 4, 'no_show'), ('farhan', 7, 'no_show'),
        ('nithya', 11, 'no_show'), ('vikram', 2, 'no_show'),
        ('tarun', 6, 'no_show'), ('kavya', 8, 'no_show'),
        -- Cancellations. The client called; that is the behaviour to encourage,
        -- and it must not score as a miss anywhere.
        ('ananya', 8, 'cancelled'), ('bhavana', 3, 'cancelled'),
        ('meera', 5, 'cancelled'), ('imran', 4, 'cancelled'),
        ('sneha', 2, 'cancelled'), ('rohit', 6, 'cancelled'),
        ('gayathri', 10, 'cancelled'), ('lakshmi', 3, 'cancelled')
     ) AS x(key, nth, status) ON x.key = p.key AND x.nth = p.nth;

UPDATE r20_session ss SET status = e.status FROM r20_exception e WHERE e.id = ss.id;

INSERT INTO scheduled_session (id, trainer_id, client_id, program_id, scheduled_at,
                               duration_minutes, status, notes, day_label, template_day,
                               delivery_mode, series_id, cancelled_by,
                               pack_delta, pack_package_id, pack_applied_at, created_at)
SELECT ss.id, t.id, ss.client_id, pr.id, ss.at, ss.duration, ss.status,
       CASE WHEN ss.status = 'no_show' THEN 'Didn''t turn up, no message.' END,
       -- The template's own name for that ORDINAL day. `day_labels` is keyed by
       -- slot, which is why the lookup uses `template_day` from the slot table
       -- and not the weekday below it.
       COALESCE(tpl.day_labels->>ss.template_day::text, pr.name),
       -- ...whereas the column called `template_day` holds the WEEKDAY. The name
       -- predates V24; what reads it is `seedLogFromPlan`, which hands it to
       -- `fetchProgramExercisesForDay` to match `program_exercise.day_of_week` —
       -- and that column carries the concrete weekday after the translation
       -- above. Writing the ordinal here would open every log on "Nothing
       -- planned".
       ss.weekday,
       -- Per-session mode. Null means "inherit the client's", which is the
       -- overwhelming majority; one override is set further down.
       NULL,
       -- Every weekly slot is a recurring series, which is how it was booked.
       md5(:'trainer_phone' || ':real20:series:' || ss.key || ':' || ss.weekday)::uuid,
       CASE WHEN ss.status = 'cancelled'
            THEN CASE WHEN ss.n % 3 = 0 THEN 'trainer' ELSE 'client' END END,
       -- The pack moves on done or no-show, never on booked. Stamped so the
       -- 24-hour undo has something exact to reverse.
       --
       -- And only for the last four weeks: the sessions before that are history
       -- under packs the client has since used up and replaced, which is how a
       -- real book looks and what stops a nine-week history inflating today's
       -- pack to fifty sessions.
       CASE WHEN ss.status IN ('done', 'no_show') AND ss.at >= (CURRENT_DATE - 28)::timestamptz THEN -1 END,
       CASE WHEN ss.status IN ('done', 'no_show') AND ss.at >= (CURRENT_DATE - 28)::timestamptz THEN pk.id END,
       CASE WHEN ss.status IN ('done', 'no_show') AND ss.at >= (CURRENT_DATE - 28)::timestamptz THEN ss.at + INTERVAL '1 hour' END,
       ss.at - INTERVAL '20 days'
FROM r20_session ss
JOIN r20_client c   ON c.key = ss.key
JOIN r20_program pr ON pr.key = ss.key
LEFT JOIN template tpl ON tpl.id = pr.template_id
LEFT JOIN r20_package pk ON pk.key = ss.key, seed_trainer t
ON CONFLICT (id) DO UPDATE SET
    scheduled_at = EXCLUDED.scheduled_at, duration_minutes = EXCLUDED.duration_minutes,
    status = EXCLUDED.status, notes = EXCLUDED.notes, day_label = EXCLUDED.day_label,
    template_day = EXCLUDED.template_day, program_id = EXCLUDED.program_id,
    delivery_mode = EXCLUDED.delivery_mode, series_id = EXCLUDED.series_id,
    cancelled_by = EXCLUDED.cancelled_by,
    pack_delta = EXCLUDED.pack_delta, pack_package_id = EXCLUDED.pack_package_id,
    pack_applied_at = EXCLUDED.pack_applied_at,
    deleted_at = NULL, updated_at = now();

-- ── One client at a time ────────────────────────────────────────────────────
--
-- The invariant this seed exists for, checked against the rows that were
-- actually written rather than against the arithmetic that produced them. Two
-- sessions clash when each starts before the other has finished; a shared start
-- time is only the most obvious case of that, and a 90-minute session laid over
-- a 75-minute pitch would slip past a start-time check untouched.
--
-- A clash between two of THIS seed's clients is a bug in this file and aborts
-- the run. A clash with a client somebody added by hand is their diary and their
-- call, so it warns instead — but it still says so, because a double-booking you
-- cannot see is worse than one you can.
DO $$
DECLARE mine text; theirs text; n_mine bigint; n_theirs bigint;
BEGIN
    CREATE TEMP TABLE r20_clash ON COMMIT DROP AS
    SELECT ca.name AS a_name, cb.name AS b_name,
           (a.scheduled_at AT TIME ZONE current_setting('TimeZone')) AS at,
           (ca.metadata->>'seed' = 'real20' AND cb.metadata->>'seed' = 'real20') AS both_ours
    FROM scheduled_session a
    JOIN scheduled_session b
      ON b.trainer_id = a.trainer_id AND b.id > a.id AND b.deleted_at IS NULL
     AND b.status <> 'cancelled'
     AND b.scheduled_at < a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 60))
     AND a.scheduled_at < b.scheduled_at + make_interval(mins => COALESCE(b.duration_minutes, 60))
    JOIN client ca ON ca.id = a.client_id
    JOIN client cb ON cb.id = b.client_id
    WHERE a.trainer_id IN (SELECT id FROM seed_trainer)
      AND a.deleted_at IS NULL AND a.status <> 'cancelled'
      AND (ca.metadata->>'seed' = 'real20' OR cb.metadata->>'seed' = 'real20');

    -- The first few and a count, not all of them. One mistake in the timetable
    -- repeats every week for eleven weeks, and an error message that lists three
    -- hundred identical pairs buries the one fact you need — which two people.
    SELECT count(*), string_agg(line, E'\n           ' ORDER BY line)
    INTO n_mine, mine
    FROM (SELECT format('%s and %s at %s', a_name, b_name, to_char(at, 'Dy DD Mon HH24:MI')) AS line
          FROM r20_clash WHERE both_ours ORDER BY at LIMIT 5) f;
    IF n_mine > 0 THEN
        RAISE EXCEPTION E'Two clients booked at the same time (% clashes in all):\n           %',
              (SELECT count(*) FROM r20_clash WHERE both_ours), mine;
    END IF;

    SELECT count(*), string_agg(line, E'\n           ' ORDER BY line)
    INTO n_theirs, theirs
    FROM (SELECT format('%s and %s at %s', a_name, b_name, to_char(at, 'Dy DD Mon HH24:MI')) AS line
          FROM r20_clash WHERE NOT both_ours ORDER BY at LIMIT 5) f;
    IF n_theirs > 0 THEN
        RAISE WARNING E'A seeded session overlaps a client you added by hand (% in all):\n           %',
              (SELECT count(*) FROM r20_clash WHERE NOT both_ours), theirs;
    END IF;
END $$;

-- A floor client's check-in call. The one case the delivery chips on the home
-- screen exist for: the session is remote even though the client is not.
UPDATE scheduled_session SET delivery_mode = 'remote', updated_at = now()
WHERE id = (
    SELECT ss.id FROM r20_session ss
    WHERE ss.key = 'chandran' AND ss.at > now()
    ORDER BY ss.at LIMIT 1
);

-- A session the trainer moved, and two the client has confirmed. Both are
-- annotations on an ordinary booking rather than statuses of their own: a
-- confirmed session is still `scheduled`, and the four statuses stay four.
UPDATE scheduled_session
SET moved_from_at = scheduled_at - INTERVAL '75 minutes', updated_at = now()
WHERE id IN (
    SELECT ss.id FROM r20_session ss
    WHERE ss.key IN ('meera', 'imran') AND ss.at > now()
    ORDER BY ss.at LIMIT 2
);

UPDATE scheduled_session
SET client_confirmed_at = now() - INTERVAL '14 hours', updated_at = now()
WHERE id IN (
    SELECT ss.id FROM r20_session ss
    WHERE ss.key IN ('ananya', 'priya') AND ss.at > now()
    ORDER BY ss.at LIMIT 2
);

-- One session in the recent past is deliberately left open — never closed off,
-- so its pack never moved. That is the money problem the home screen's banner
-- counts, and it is chosen after generation for the same reason the exceptions
-- are: a rule like "yesterday's Rohit session" quietly matches nothing in a week
-- where Rohit does not train yesterday.
UPDATE scheduled_session
SET status = 'scheduled', pack_delta = NULL, pack_package_id = NULL, pack_applied_at = NULL,
    updated_at = now()
WHERE id IN (
    SELECT ss.id
    FROM scheduled_session ss
    JOIN client c ON c.id = ss.client_id
    WHERE c.metadata->>'seed' = 'real20'
      AND ss.scheduled_at < now() - INTERVAL '20 hours'
      AND ss.status = 'done'
      AND ss.deleted_at IS NULL
    ORDER BY ss.scheduled_at DESC
    LIMIT 2
);

-- ── What actually got logged ────────────────────────────────────────────────
--
-- A workout for every session that was kept — two months of them. Read back from
-- `scheduled_session` rather than from the temp table, because the rows flipped
-- open above are still 'done' there, and giving one of them a logged workout
-- would make the home screen read it as a session that has been running for nine
-- hours rather than one nobody closed off.

INSERT INTO workout_session (id, trainer_id, client_id, program_id, scheduled_session_id,
                             logged_by, session_date, notes, ended_at, created_at)
SELECT md5(:'trainer_phone' || ':real20:wo:' || ss.id)::uuid, t.id, ss.client_id, pr.id, ss.id,
       -- Remote clients log their own; on the floor the trainer holds the phone.
       CASE WHEN c.mode = 'remote' AND ss.n % 2 = 0 THEN 'client' ELSE 'trainer' END,
       ss.on_date,
       CASE WHEN ss.n % 13 = 0 THEN 'Shoulder felt tight on the second set. Dropped the load.'
            WHEN ss.n % 17 = 0 THEN 'Came in tired. Kept the loads, cut the last set.' END,
       ss.at + (ss.duration || ' minutes')::interval,
       ss.at + INTERVAL '5 minutes'
FROM r20_session ss
JOIN scheduled_session live ON live.id = ss.id AND live.status = 'done'
JOIN r20_client c   ON c.key = ss.key
JOIN r20_program pr ON pr.key = ss.key, seed_trainer t
ON CONFLICT (id) DO UPDATE SET
    session_date = EXCLUDED.session_date, ended_at = EXCLUDED.ended_at,
    logged_by = EXCLUDED.logged_by, notes = EXCLUDED.notes,
    deleted_at = NULL, updated_at = now();

-- ── What was in each log ────────────────────────────────────────────────────
--
-- The plan says what SHOULD happen; `workout_exercise` says what did. It is
-- seeded from the program's rows for that day, copied rather than joined,
-- because editing the plan next week must not rewrite what was asked for today.
--
-- Which WEEK of the plan is worked out from the program's start date, and falls
-- back to week 1 when the trainer never authored that week — which is exactly
-- what `seedLogFromPlan` does on the phone. A four-week blueprint in week seven
-- repeats week one; anything else would be inventing a week nobody wrote.

CREATE TEMP TABLE r20_logged ON COMMIT DROP AS
SELECT w.id AS workout_id,
       ss.key,
       ss.n,
       ss.on_date,
       ss.at,
       pe.exercise_id,
       pe.sets  AS target_sets,
       pe.reps  AS target_reps,
       pe.rest_seconds,
       pe.order_index
FROM r20_session ss
JOIN workout_session w ON w.id = md5(:'trainer_phone' || ':real20:wo:' || ss.id)::uuid
                      AND w.deleted_at IS NULL
JOIN r20_program pr ON pr.key = ss.key
JOIN program_exercise pe ON pe.program_id = pr.id
                        AND pe.day_of_week = ss.weekday
                        AND pe.deleted_at IS NULL
                        AND COALESCE(pe.week, 1) = LEAST(
                              GREATEST(1, 1 + ((ss.on_date - pr.start_date) / 7)),
                              pr.authored);

INSERT INTO workout_exercise (id, workout_session_id, exercise_id, order_index, source,
                              target_sets, target_reps, rest_seconds, created_at)
SELECT md5(:'trainer_phone' || ':real20:woex:' || l.workout_id || ':' || l.exercise_id)::uuid,
       l.workout_id, l.exercise_id, l.order_index, 'planned',
       l.target_sets, l.target_reps, l.rest_seconds, l.at + INTERVAL '5 minutes'
FROM r20_logged l
ON CONFLICT (id) DO UPDATE SET
    order_index = EXCLUDED.order_index, source = EXCLUDED.source,
    target_sets = EXCLUDED.target_sets, target_reps = EXCLUDED.target_reps,
    rest_seconds = EXCLUDED.rest_seconds, deleted_at = NULL, updated_at = now();

-- The three things that make a log a log rather than a checklist.
CREATE TEMP TABLE r20_recent ON COMMIT DROP AS
SELECT key, workout_id, at,
       row_number() OVER (PARTITION BY key ORDER BY at DESC) AS nth
FROM (SELECT DISTINCT key, workout_id, at FROM r20_logged) d;

-- 1 · A swap. The rack was busy, so the bench press became a dumbbell press.
--     The exercise was not skipped, and that distinction is the single most
--     important thing this table records: adherence reads the swap, never the
--     absence of the original.
--
--     Chosen as "their most recent session that HAD a bench press in it" rather
--     than "their most recent session": a Push/Pull/Legs client's latest workout
--     is as likely to be legs as it is to be push, and a swap that lands on no
--     rows leaves the whole off-plan section of the log undrawn.
UPDATE workout_exercise we
SET exercise_id = sub.to_id,
    swapped_from_exercise_id = sub.from_id,
    updated_at = now()
FROM (
    SELECT DISTINCT ON (l.key)
           we2.id,
           we2.exercise_id AS from_id,
           (SELECT e.id FROM exercise e
            WHERE lower(e.name) = 'dumbbell bench press' AND e.deleted_at IS NULL LIMIT 1) AS to_id
    FROM r20_logged l
    JOIN workout_exercise we2 ON we2.workout_session_id = l.workout_id AND we2.deleted_at IS NULL
    JOIN exercise e2 ON e2.id = we2.exercise_id
    WHERE l.key IN ('ananya', 'harish', 'imran', 'chandran')
      AND lower(e2.name) = 'barbell bench press'
    ORDER BY l.key, l.at DESC
) AS sub
WHERE we.id = sub.id AND sub.to_id IS NOT NULL
  -- A day that already has a dumbbell press on it cannot take a second one:
  -- one exercise per log is a unique index, and the swap would collide.
  AND NOT EXISTS (
      SELECT 1 FROM workout_exercise dup
      WHERE dup.workout_session_id = we.workout_session_id
        AND dup.exercise_id = sub.to_id AND dup.deleted_at IS NULL);

-- 2 · Something extra, added on the floor before its first set. An unplanned
--     exercise is a FIRST-CLASS row — same card, same table, counted in volume,
--     one quiet tag — and adherence must never read that tag as a quality mark.
INSERT INTO workout_exercise (id, workout_session_id, exercise_id, order_index, source,
                              target_sets, target_reps, rest_seconds, created_at)
SELECT md5(:'trainer_phone' || ':real20:woex:extra:' || r.workout_id)::uuid,
       r.workout_id, e.id, 90, 'unplanned', 3, 12, 60, r.at + INTERVAL '35 minutes'
FROM r20_recent r
JOIN exercise e ON lower(e.name) = 'cable rear delt row (with rope)' AND e.deleted_at IS NULL
WHERE r.key IN ('arjun', 'rohit', 'vikram', 'nithya') AND r.nth = 1
ON CONFLICT (id) DO UPDATE SET
    source = EXCLUDED.source, deleted_at = NULL, updated_at = now();

-- 3 · Taken out of today. Swiped away because the cable station had a queue.
--     `removed_at` is soft and separate from `deleted_at`: the row is still the
--     record that the trainer decided not to do this, and the toast's Undo needs
--     something to put back.
UPDATE workout_exercise we
SET removed_at = sub.at + INTERVAL '25 minutes', updated_at = now()
FROM (
    SELECT DISTINCT ON (r.key) we2.id, r.at
    FROM r20_recent r
    JOIN workout_exercise we2 ON we2.workout_session_id = r.workout_id AND we2.deleted_at IS NULL
    WHERE r.key IN ('bhavana', 'jyothi') AND r.nth = 1
    ORDER BY r.key, we2.order_index DESC
) AS sub
WHERE we.id = sub.id;

-- ── The sets ────────────────────────────────────────────────────────────────
--
-- Generated from `workout_exercise` rather than from the plan, which is the
-- honest direction: what was logged is what was in front of the trainer, swaps
-- and extras included. Rows taken out of the day get no sets, because they did
-- not happen.
--
-- The load is the exercise's own starting weight plus a kilo and a quarter per
-- session, so the progress charts have a slope and the record detection has
-- something to find — a top set that beats the previous best by more than the
-- 2.5kg plate step, which is what separates a personal record from a rounding
-- error. Bodyweight movements carry no load at all, which is what makes the
-- reps-only set row appear.
--
-- The equipment names below are V21's, which are the upstream dataset's:
-- 'leverage machine' and 'smith machine', not 'machine'; 'kettlebell', not
-- 'kettlebells'; 'ez barbell', not 'e-z curl bar'. A CASE that misses simply
-- returns NULL, and every machine lift silently becomes a bodyweight one.

INSERT INTO set_log (id, workout_session_id, exercise_id, set_number, load_kg, reps, rpe,
                     notes, created_at)
SELECT md5(:'trainer_phone' || ':real20:set:' || we.id || ':' || g.set_no)::uuid,
       we.workout_session_id, we.exercise_id, g.set_no,
       CASE WHEN base.load IS NULL THEN NULL
            ELSE (base.load + l.n * 1.25 + (g.set_no - 1) * 2.5)::numeric(6,2) END,
       CASE WHEN base.load IS NULL
            THEN CASE g.set_no WHEN 1 THEN 15 WHEN 2 THEN 12 ELSE 10 END
            ELSE CASE g.set_no WHEN 1 THEN 10 WHEN 2 THEN 8  ELSE 6  END END,
       (6.5 + g.set_no * 0.5)::numeric(3,1),
       CASE WHEN g.set_no = 3 AND l.n % 19 = 0 THEN 'Last rep was a grind.' END,
       l.at + (30 + g.set_no * 4 || ' minutes')::interval
FROM workout_exercise we
JOIN (SELECT DISTINCT workout_id, key, n, at FROM r20_logged) l ON l.workout_id = we.workout_session_id
JOIN exercise e ON e.id = we.exercise_id
CROSS JOIN LATERAL (
    SELECT CASE lower(COALESCE(e.equipment, ''))
                WHEN 'barbell'          THEN 40
                WHEN 'olympic barbell'  THEN 40
                WHEN 'trap bar'         THEN 45
                WHEN 'ez barbell'       THEN 20
                WHEN 'dumbbell'         THEN 14
                WHEN 'leverage machine' THEN 35
                WHEN 'smith machine'    THEN 30
                WHEN 'cable'            THEN 25
                WHEN 'kettlebell'       THEN 16
                WHEN 'medicine ball'    THEN 6
                WHEN 'weighted'         THEN 10
                WHEN 'sled machine'     THEN 60
                -- Body weight, bands and the odds and ends. No load, so the set
                -- row asks for reps only — which is also what `log_type = 'reps'`
                -- means on the trainer's own exercises.
                ELSE NULL END::numeric AS load
) AS base
CROSS JOIN (VALUES (1), (2), (3)) AS g(set_no)
WHERE we.deleted_at IS NULL AND we.removed_at IS NULL
ON CONFLICT (id) DO UPDATE SET
    load_kg = EXCLUDED.load_kg, reps = EXCLUDED.reps, rpe = EXCLUDED.rpe,
    notes = EXCLUDED.notes, deleted_at = NULL, updated_at = now();

-- A session running right now. The home screen's in-progress hero: the log is
-- open, the earlier exercises are done and the last has not been touched.
-- `ended_at` is null because the log is not closed — a different fact from
-- whether the session counted against a pack, which the booking already carries.
UPDATE workout_session SET ended_at = NULL, updated_at = now()
WHERE id IN (
    SELECT w.id FROM workout_session w
    JOIN client c ON c.id = w.client_id
    WHERE c.metadata->>'seed' = 'real20' AND w.deleted_at IS NULL
      AND w.session_date = CURRENT_DATE
      AND w.created_at < now()
    ORDER BY w.created_at DESC
    LIMIT 1
);

DELETE FROM set_log
WHERE workout_session_id IN (
    SELECT w.id FROM workout_session w
    JOIN client c ON c.id = w.client_id
    WHERE c.metadata->>'seed' = 'real20' AND w.deleted_at IS NULL AND w.ended_at IS NULL
      AND w.session_date = CURRENT_DATE
)
AND exercise_id IN (
    -- The last exercise of the open log, untouched. Everything before it stands.
    SELECT we.exercise_id FROM workout_exercise we
    JOIN workout_session w ON w.id = we.workout_session_id
    JOIN client c ON c.id = w.client_id
    WHERE c.metadata->>'seed' = 'real20' AND w.ended_at IS NULL AND w.deleted_at IS NULL
      AND w.session_date = CURRENT_DATE
    ORDER BY we.order_index DESC
    LIMIT 1
);

-- ── Bodyweight and tape — as assessments ───────────────────────────────────
--
-- A body is measured in an assessment and nowhere else (V22 dropped
-- `body_metric`), so the history is one trainer-entered assessment every four
-- weeks, trending the way each client's goal says it should. Waist and chest on
-- a handful, because a chart with one line in it never shows what it is for.

INSERT INTO assessment (id, client_id, trainer_id, name, due_at, sent_at, completed_at, read_at,
                        entered_by, measurements_asked, questions_asked, readings, created_at)
SELECT md5(:'trainer_phone' || ':real20:as:' || c.key || ':' || w)::uuid,
       c.id, (SELECT id FROM seed_trainer), 'Monthly measurements',
       t.at, t.at, t.at, t.at, 'trainer', jsonb_array_length(r.readings), 0, r.readings, t.at
FROM r20_client c
CROSS JOIN generate_series(0, GREATEST(c.hist_weeks, 0), 4) AS w
CROSS JOIN LATERAL (SELECT (CURRENT_DATE - c.hist_weeks * 7 + w * 7)::timestamptz + INTERVAL '6 hours' AS at) t
CROSS JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('key', m.kind, 'value', round(m.base + m.drift * w, 1)) ORDER BY m.ord) AS readings
    FROM (VALUES
            (1, 'weight',
             (52 + (abs(hashtext(c.key)) % 35))::numeric,
             CASE c.goal WHEN 'Muscle gain' THEN 0.4 WHEN 'Powerlifting' THEN 0.3 ELSE -0.35 END::numeric),
            (2, 'chest',
             (86 + (abs(hashtext(c.key)) % 18))::numeric,
             CASE c.goal WHEN 'Muscle gain' THEN 0.3 ELSE 0.0 END::numeric),
            (3, 'waist',
             (72 + (abs(hashtext(c.key)) % 22))::numeric,
             CASE c.goal WHEN 'Fat loss' THEN -0.5 ELSE -0.1 END::numeric)
         ) AS m(ord, kind, base, drift)
    -- Everybody gets weighed. The tape comes out for the clients whose goal is
    -- about shape rather than about load.
    WHERE m.kind = 'weight'
       OR (m.kind = 'waist' AND c.goal IN ('Fat loss', 'Post-natal'))
       OR (m.kind = 'chest' AND c.goal IN ('Muscle gain', 'Powerlifting'))
) r
WHERE c.hist_weeks > 0
ON CONFLICT (id) DO UPDATE SET
    readings = EXCLUDED.readings, measurements_asked = EXCLUDED.measurements_asked,
    completed_at = EXCLUDED.completed_at, deleted_at = NULL, updated_at = now();

-- ── Make the packs tell the truth ───────────────────────────────────────────
--
-- Rather than typing a plausible number: remaining is the target from the roster
-- above, and the total is that plus every session that actually consumed one. So
-- the roster chip, the diary and the pack detail all agree by construction.
--
-- Monthly packs have no session count at all, which is what `sessions_total IS
-- NULL` means and why they are left alone.

UPDATE package p
SET sessions_total     = COALESCE(spent.n, 0) + rp.remaining,
    sessions_remaining = rp.remaining,
    updated_at         = now()
FROM r20_package rp
LEFT JOIN (
    SELECT pack_package_id AS pid, count(*) AS n
    FROM scheduled_session
    WHERE pack_delta = -1 AND pack_package_id IS NOT NULL AND deleted_at IS NULL
    GROUP BY pack_package_id
) spent ON spent.pid = rp.id
WHERE p.id = rp.id AND rp.remaining IS NOT NULL AND p.sessions_total IS NOT NULL;

-- ── What the gym is owed ────────────────────────────────────────────────────
--
-- Last month's share handed over on the 1st; this month's still building. Both
-- are the trainer's own figures — InclineYou never talks to the gym's system, and a
-- settlement here is a record of what was agreed, not a transaction.
--
-- Written here, at the end, rather than beside the payments it is derived from:
-- `sessions_counted` counts the sessions the month covered, and those did not
-- exist until a few hundred lines ago.

INSERT INTO gym_settlement (id, trainer_id, period, amount, sessions_counted, gym_name,
                            status, due_at, settled_at, created_at)
SELECT md5(:'trainer_phone' || ':real20:settle:' || s.slug)::uuid, t.id, s.period, s.amount,
       s.sessions, 'Iron House, Adyar', s.status, s.due_at, s.settled_at, s.created_at
FROM seed_trainer t,
     LATERAL (VALUES
        ('prev',
         to_char(date_trunc('month', CURRENT_DATE) - INTERVAL '1 month', 'YYYY-MM'),
         (SELECT COALESCE(sum(gym_share_amount), 0) FROM payment
          WHERE trainer_id = t.id AND deleted_at IS NULL
            AND paid_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
            AND paid_at <  date_trunc('month', CURRENT_DATE)),
         (SELECT count(*)::int FROM scheduled_session s2
          WHERE s2.trainer_id = t.id AND s2.deleted_at IS NULL AND s2.status = 'done'
            AND s2.scheduled_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
            AND s2.scheduled_at <  date_trunc('month', CURRENT_DATE)),
         'settled',
         date_trunc('month', CURRENT_DATE)::timestamptz,
         date_trunc('month', CURRENT_DATE)::timestamptz,
         date_trunc('month', CURRENT_DATE)::timestamptz),
        ('curr',
         to_char(CURRENT_DATE, 'YYYY-MM'),
         (SELECT COALESCE(sum(gym_share_amount), 0) FROM payment
          WHERE trainer_id = t.id AND deleted_at IS NULL
            AND paid_at >= date_trunc('month', CURRENT_DATE)),
         (SELECT count(*)::int FROM scheduled_session s3
          WHERE s3.trainer_id = t.id AND s3.deleted_at IS NULL AND s3.status = 'done'
            AND s3.scheduled_at >= date_trunc('month', CURRENT_DATE)),
         'due',
         (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::timestamptz,
         NULL::timestamptz,
         date_trunc('month', CURRENT_DATE)::timestamptz)
     ) AS s(slug, period, amount, sessions, status, due_at, settled_at, created_at)
ON CONFLICT (id) DO UPDATE SET
    period = EXCLUDED.period, amount = EXCLUDED.amount,
    sessions_counted = EXCLUDED.sessions_counted, status = EXCLUDED.status,
    due_at = EXCLUDED.due_at, settled_at = EXCLUDED.settled_at,
    deleted_at = NULL, updated_at = now();

-- ── Sunday's reports ────────────────────────────────────────────────────────
--
-- Eight of them per client — the same two months the logs cover. This is the one
-- table in the product whose rows are not derived on read: everything else is
-- computed so that correcting a set from June fixes every number that depended
-- on it, and this is stored for the opposite reason — it was sent, and a report
-- whose figures move after both people have read it is not a report.
--
-- Which is why the figures here are COMPUTED from the sessions and sets above,
-- using the same aggregation `WeeklyReportWriter` runs, rather than typed. A
-- demo where the report disagrees with the log it came from is worse than no
-- demo at all.

INSERT INTO weekly_report (id, trainer_id, client_id, week_start, week_end,
                           sessions_kept, sessions_planned, trained_days, volume_kg, sets_done,
                           new_bests, best_line, best_previous, sent_at, created_at)
SELECT md5(:'trainer_phone' || ':real20:wr:' || c.key || ':' || w.ws)::uuid,
       t.id, c.id, w.ws, w.ws + 6,
       s.kept, s.planned, NULLIF(d.days, ''), v.volume, v.sets,
       b.n, b.line, b.previous,
       (w.ws + 7)::timestamptz + INTERVAL '20 hours',
       (w.ws + 7)::timestamptz + INTERVAL '20 hours'
FROM r20_client c
CROSS JOIN LATERAL (
    SELECT (date_trunc('week', CURRENT_DATE)::date - k * 7) AS ws
    FROM generate_series(1, 8) AS k
) w
CROSS JOIN seed_trainer t
CROSS JOIN LATERAL (
    SELECT count(*) FILTER (WHERE status = 'done')::int       AS kept,
           count(*) FILTER (WHERE status <> 'cancelled')::int AS planned
    FROM scheduled_session ss
    WHERE ss.client_id = c.id AND ss.deleted_at IS NULL
      AND (ss.scheduled_at AT TIME ZONE :'tz')::date BETWEEN w.ws AND w.ws + 6
) s
CROSS JOIN LATERAL (
    SELECT COALESCE(sum(sl.load_kg * sl.reps), 0)::numeric(12,2) AS volume,
           count(sl.id)::int AS sets
    FROM set_log sl
    JOIN workout_session ws ON ws.id = sl.workout_session_id
    WHERE ws.client_id = c.id AND sl.deleted_at IS NULL AND ws.deleted_at IS NULL
      AND ws.session_date BETWEEN w.ws AND w.ws + 6
) v
CROSS JOIN LATERAL (
    SELECT string_agg(DISTINCT EXTRACT(ISODOW FROM ws.session_date)::int::text, ',' ORDER BY EXTRACT(ISODOW FROM ws.session_date)::int::text) AS days
    FROM workout_session ws
    JOIN set_log sl ON sl.workout_session_id = ws.id AND sl.deleted_at IS NULL
    WHERE ws.client_id = c.id AND ws.deleted_at IS NULL
      AND ws.session_date BETWEEN w.ws AND w.ws + 6
) d
CROSS JOIN LATERAL (
    -- A record worth announcing: the week's top set beat the all-time best on
    -- that exercise by at least one plate. Beating it by a kilo in a gym whose
    -- smallest plate is 2.5 is a typo, not a personal record.
    SELECT count(*)::int AS n,
           (array_agg(txt  ORDER BY gain DESC))[1] AS line,
           (array_agg(prev ORDER BY gain DESC))[1] AS previous
    FROM (
        SELECT tw.bl - bf.pl AS gain,
               e.name || ' · ' || rtrim(rtrim(tw.bl::text, '0'), '.') || ' kg × ' || tw.best_reps AS txt,
               'Was ' || rtrim(rtrim(bf.pl::text, '0'), '.') || ' kg on '
                      || to_char(bf.pd, 'FMDD FMMonth') AS prev
        FROM (
            SELECT DISTINCT ON (sl.exercise_id)
                   sl.exercise_id, sl.load_kg AS bl, sl.reps AS best_reps
            FROM set_log sl
            JOIN workout_session ws ON ws.id = sl.workout_session_id
            WHERE ws.client_id = c.id AND sl.deleted_at IS NULL AND ws.deleted_at IS NULL
              AND ws.session_date BETWEEN w.ws AND w.ws + 6 AND sl.load_kg IS NOT NULL
            ORDER BY sl.exercise_id, sl.load_kg DESC, sl.reps DESC
        ) tw
        JOIN (
            SELECT DISTINCT ON (sl.exercise_id)
                   sl.exercise_id, sl.load_kg AS pl, ws.session_date AS pd
            FROM set_log sl
            JOIN workout_session ws ON ws.id = sl.workout_session_id
            WHERE ws.client_id = c.id AND sl.deleted_at IS NULL AND ws.deleted_at IS NULL
              AND ws.session_date < w.ws AND sl.load_kg IS NOT NULL
            ORDER BY sl.exercise_id, sl.load_kg DESC, ws.session_date DESC
        ) bf ON bf.exercise_id = tw.exercise_id
        JOIN exercise e ON e.id = tw.exercise_id
        WHERE tw.bl - bf.pl >= 2.5
    ) AS records
) b
-- A client with nothing in a week is simply absent from it. The server had
-- nothing to report on, and a zero-filled row would be a claim we did not make.
WHERE s.planned > 0
-- `WeeklyReportWriter` says DO NOTHING here, and it is right to: a report that
-- was sent must never be rewritten. A seed is the one caller that means the
-- opposite — it has just tombstoned the previous run's reports and is rebuilding
-- them, and DO NOTHING would leave every one of them deleted.
ON CONFLICT (id) DO UPDATE SET
    sessions_kept = EXCLUDED.sessions_kept, sessions_planned = EXCLUDED.sessions_planned,
    trained_days = EXCLUDED.trained_days, volume_kg = EXCLUDED.volume_kg,
    sets_done = EXCLUDED.sets_done, new_bests = EXCLUDED.new_bests,
    best_line = EXCLUDED.best_line, best_previous = EXCLUDED.best_previous,
    sent_at = EXCLUDED.sent_at, deleted_at = NULL, updated_at = now();

-- ── What went out ───────────────────────────────────────────────────────────
--
-- The delivery record, which is NOT `weekly_report.sent_at` — that column is
-- stamped by the same INSERT that writes the report, so it means "written". The
-- honest answer to "did it go" is the nudge log beside it, and it is the one
-- field in the system that can say sent, queued or failed.
--
-- Only the last four weeks get a delivery row. The reports before that are
-- history; keeping a full eight weeks of WhatsApp records for twenty clients
-- makes the Nudges screen a wall of identical lines.

INSERT INTO nudge_log (id, trainer_id, client_id, channel, template_name, status, sent_at, created_at)
SELECT md5(:'trainer_phone' || ':real20:nudge:wr:' || c.key || ':' || wr.week_start)::uuid,
       t.id, c.id, 'whatsapp', 'weekly_report',
       CASE WHEN c.key = 'kavya' AND wr.week_start = date_trunc('week', CURRENT_DATE)::date - 7
                 THEN 'failed'
            WHEN wr.week_start = date_trunc('week', CURRENT_DATE)::date - 7
                 THEN 'queued'
            ELSE 'sent' END,
       wr.sent_at, wr.sent_at
FROM weekly_report wr
JOIN r20_client c ON c.id = wr.client_id, seed_trainer t
WHERE wr.deleted_at IS NULL AND c.phone IS NOT NULL
  AND wr.week_start >= date_trunc('week', CURRENT_DATE)::date - 28
ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status, sent_at = EXCLUDED.sent_at,
    deleted_at = NULL, updated_at = now();

-- The rest of the message history, so the Nudges screen's recent list has
-- something in it and the per-rule counters this month are not zero.
--
-- Spaced so no client gets two inside seven days. `COOLDOWN_DAYS = 7` in
-- `app/src/nudges/rules.ts` is computed on the phone from exactly this table, so
-- a seed that stacks two messages on one client in one week hands the app a
-- state it would never have produced.
INSERT INTO nudge_log (id, trainer_id, client_id, channel, template_name, status, sent_at, created_at)
SELECT md5(:'trainer_phone' || ':real20:nudge:' || n.key || ':' || n.template)::uuid,
       t.id, c.id, n.channel, n.template, n.status,
       (CURRENT_DATE - n.days_ago)::timestamptz + INTERVAL '10 hours',
       (CURRENT_DATE - n.days_ago)::timestamptz + INTERVAL '10 hours'
FROM (VALUES
        ('dinesh',   'payment_overdue', 'whatsapp', 'sent',   2),
        ('chandran', 'payment_overdue', 'whatsapp', 'sent',   3),
        ('harish',   'payment_reminder','whatsapp', 'sent',   5),
        ('kavya',    'quiet_check_in',  'whatsapp', 'failed', 1),
        ('tarun',    'quiet_check_in',  'whatsapp', 'sent',   4),
        ('vikram',   'pack_low',        'whatsapp', 'sent',   2),
        ('meera',    'pack_low',        'whatsapp', 'sent',   3),
        ('sneha',    'payment_due',     'whatsapp', 'queued', 0),
        ('ananya',   'well_done',       'push',     'sent',   6),
        ('arjun',    'well_done',       'push',     'sent',   8),
        ('imran',    'well_done',       'push',     'sent',   9)
     ) AS n(key, template, channel, status, days_ago)
JOIN r20_client c ON c.key = n.key, seed_trainer t
WHERE c.phone IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status, sent_at = EXCLUDED.sent_at,
    deleted_at = NULL, updated_at = now();

COMMIT;

-- ── The week, as booked ─────────────────────────────────────────────────────
--
-- Printed rather than described, because "no two clients at the same time" is
-- the claim this seed makes and a table of it is the cheapest way to check.
-- Read down a column: one name per row, and the blanks are the gaps a real diary
-- has.

\echo ''
\echo 'The timetable — one trainer, one client at a time:'
SELECT to_char(make_interval(mins => min(ss.start_min)::int), 'HH24:MI') AS "time",
       max(CASE WHEN ss.weekday = 1 THEN ss.who END) AS "Mon",
       max(CASE WHEN ss.weekday = 2 THEN ss.who END) AS "Tue",
       max(CASE WHEN ss.weekday = 3 THEN ss.who END) AS "Wed",
       max(CASE WHEN ss.weekday = 4 THEN ss.who END) AS "Thu",
       max(CASE WHEN ss.weekday = 5 THEN ss.who END) AS "Fri",
       max(CASE WHEN ss.weekday = 6 THEN ss.who END) AS "Sat"
FROM (
    SELECT DISTINCT
           EXTRACT(ISODOW FROM (s.scheduled_at AT TIME ZONE :'tz'))::int AS weekday,
           to_char(s.scheduled_at AT TIME ZONE :'tz', 'HH24:MI') AS slot,
           EXTRACT(HOUR FROM (s.scheduled_at AT TIME ZONE :'tz'))::int * 60
             + EXTRACT(MINUTE FROM (s.scheduled_at AT TIME ZONE :'tz'))::int AS start_min,
           split_part(c.name, ' ', 1) || ' · ' || s.duration_minutes || 'm' AS who
    FROM scheduled_session s
    JOIN client c ON c.id = s.client_id
    -- Scoped to THIS trainer, not just to the tag. Seeding two trainers on one
    -- database is supported and the tag is the same on both, so without the join
    -- the other one's week is drawn into this one's — which reads as a timetable
    -- that double-books and is nothing of the kind.
    JOIN trainer t ON t.id = c.trainer_id AND t.phone = :'trainer_phone'
    WHERE c.metadata->>'seed' = 'real20' AND s.deleted_at IS NULL
      AND (s.scheduled_at AT TIME ZONE :'tz')::date
          BETWEEN date_trunc('week', CURRENT_DATE)::date
              AND date_trunc('week', CURRENT_DATE)::date + 6
) ss
GROUP BY ss.slot
ORDER BY min(ss.start_min);

-- ── What landed ─────────────────────────────────────────────────────────────
--
-- Counted rather than claimed. Several of these numbers going to zero is the
-- only warning you get that a library rename or a schema change broke something
-- quietly: a template whose exercises stopped resolving still draws, a program
-- with no rows still opens, and both look like an app bug from the outside.

\echo ''
\echo 'Seeded:'
WITH mine AS (
    SELECT c.id FROM client c JOIN trainer t ON t.id = c.trainer_id
    WHERE t.phone = :'trainer_phone' AND c.metadata->>'seed' = 'real20' AND c.deleted_at IS NULL
),
me AS (SELECT id FROM trainer WHERE phone = :'trainer_phone' AND deleted_at IS NULL)
SELECT 'clients' AS what, (SELECT count(*) FROM mine) AS count
UNION ALL SELECT '  · training this week', count(DISTINCT client_id) FROM scheduled_session
    WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL
      AND scheduled_at >= date_trunc('week', now()) AND scheduled_at < date_trunc('week', now()) + INTERVAL '7 days'
UNION ALL SELECT 'sessions', count(*) FROM scheduled_session
    WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL
UNION ALL SELECT '  · done', count(*) FROM scheduled_session
    WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL AND status = 'done'
UNION ALL SELECT '  · no-show', count(*) FROM scheduled_session
    WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL AND status = 'no_show'
UNION ALL SELECT '  · cancelled', count(*) FROM scheduled_session
    WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL AND status = 'cancelled'
UNION ALL SELECT '  · left open', count(*) FROM scheduled_session
    WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL
      AND status = 'scheduled' AND scheduled_at < now()
UNION ALL SELECT '  · upcoming', count(*) FROM scheduled_session
    WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL AND scheduled_at > now()
UNION ALL SELECT 'workouts logged', count(*) FROM workout_session
    WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL
UNION ALL SELECT '  · still open', count(*) FROM workout_session
    WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL AND ended_at IS NULL
UNION ALL SELECT '  · oldest, days back',
    COALESCE((CURRENT_DATE - min(session_date))::bigint, 0) FROM workout_session
    WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL
UNION ALL SELECT 'exercises in those logs', count(*) FROM workout_exercise we
    WHERE we.deleted_at IS NULL AND we.workout_session_id IN
        (SELECT id FROM workout_session WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL)
UNION ALL SELECT '  · swapped', count(*) FROM workout_exercise we
    WHERE we.deleted_at IS NULL AND we.swapped_from_exercise_id IS NOT NULL
      AND we.workout_session_id IN
        (SELECT id FROM workout_session WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL)
UNION ALL SELECT '  · unplanned', count(*) FROM workout_exercise we
    WHERE we.deleted_at IS NULL AND we.source = 'unplanned'
      AND we.workout_session_id IN
        (SELECT id FROM workout_session WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL)
UNION ALL SELECT '  · taken out of the day', count(*) FROM workout_exercise we
    WHERE we.deleted_at IS NULL AND we.removed_at IS NOT NULL
      AND we.workout_session_id IN
        (SELECT id FROM workout_session WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL)
UNION ALL SELECT 'sets', count(*) FROM set_log l
    WHERE l.deleted_at IS NULL AND l.workout_session_id IN
        (SELECT id FROM workout_session WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL)
UNION ALL SELECT 'assessments taken', count(*) FROM assessment
    WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL AND completed_at IS NOT NULL
UNION ALL SELECT 'templates', count(*) FROM template
    WHERE trainer_id IN (SELECT id FROM me) AND deleted_at IS NULL
-- The blueprint entries that actually resolved to a real exercise. If a library
-- rename breaks a name this drops and says so, instead of a day quietly coming
-- out one lift short.
UNION ALL SELECT '  · exercises in them', COALESCE(sum(jsonb_array_length(structure)), 0)::bigint FROM template
    WHERE trainer_id IN (SELECT id FROM me) AND deleted_at IS NULL
UNION ALL SELECT 'programs', count(*) FROM program
    WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL
-- What the workout log will actually find. A program with a name and no rows
-- opens the log on "Nothing planned", so this number going to zero is loud.
UNION ALL SELECT '  · planned exercises', count(*) FROM program_exercise pe
    WHERE pe.deleted_at IS NULL AND pe.program_id IN
        (SELECT id FROM program WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL)
UNION ALL SELECT 'packs you sell', count(*) FROM pack
    WHERE trainer_id IN (SELECT id FROM me) AND deleted_at IS NULL
UNION ALL SELECT '  · the gym''s', count(*) FROM pack
    WHERE trainer_id IN (SELECT id FROM me) AND deleted_at IS NULL AND owner = 'gym'
UNION ALL SELECT 'packs sold', count(*) FROM package
    WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL
UNION ALL SELECT 'payments taken', count(*) FROM payment
    WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL AND status = 'paid'
UNION ALL SELECT 'bills outstanding', count(*) FROM package p
    WHERE p.client_id IN (SELECT id FROM mine) AND p.deleted_at IS NULL
      AND p.written_off_at IS NULL
      AND p.amount > COALESCE((SELECT sum(amount) FROM payment
                               WHERE package_id = p.id AND status = 'paid' AND deleted_at IS NULL), 0)
UNION ALL SELECT 'weekly reports', count(*) FROM weekly_report
    WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL
UNION ALL SELECT 'messages logged', count(*) FROM nudge_log
    WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL
UNION ALL SELECT 'nudge rules', count(*) FROM nudge_rule
    WHERE trainer_id IN (SELECT id FROM me) AND deleted_at IS NULL
UNION ALL SELECT 'custom exercises', count(*) FROM exercise
    WHERE trainer_id IN (SELECT id FROM me) AND is_custom AND deleted_at IS NULL
UNION ALL SELECT 'favourites', count(*) FROM exercise_favourite
    WHERE trainer_id IN (SELECT id FROM me) AND deleted_at IS NULL
UNION ALL SELECT 'working hours', count(*) FROM working_hours
    WHERE trainer_id IN (SELECT id FROM me) AND deleted_at IS NULL
UNION ALL SELECT 'time blocks', count(*) FROM time_block
    WHERE trainer_id IN (SELECT id FROM me) AND deleted_at IS NULL;
