-- ============================================================================
-- The full demo — 44 clients, and every feature the app has, in a state worth
-- looking at.
--
--   psql ... -v trainer_phone=9841657298 -f seed-full-demo.sql
--
-- `seed-sample-month.sql` is the small one: six clients, one month, enough for
-- every screen to render while you work on it. This is the other kind. It is
-- for the walkthrough — a demo, a design review, a bug that only shows up on a
-- roster that is too long to hold in your head — so it aims at COVERAGE rather
-- than at the smallest honest dataset:
--
--   · 44 clients, which is past `INDEX_RAIL_MIN = 40`. The A–Z rail on the
--     roster does not exist below forty, and a seed that stops at twenty leaves
--     that whole control undrawn. The roster is also the screen most likely to
--     hide a layout bug behind a short list.
--   · Every client state the roster can draw: overdue, quiet, pack ending, pack
--     finished, a stale invite, a fresh invite, paused, inactive, archived, a
--     declined membership, a removed one, a number that turns out to belong to
--     a trainer account, a client with no phone at all, and one who was added
--     yesterday and has nothing set up yet.
--   · Every table the sync pulls. Including the ones the small seed never
--     touches: `workout_exercise` (swaps, unplanned work, something taken out of
--     today), `weekly_report`, `nudge_rule`, `nudge_log`, `exercise_favourite`,
--     custom exercises, `batch`, gym-owned price-list entries, discounts and a
--     written-off debt.
--
-- Two rules it keeps, both borrowed from the small seed because they are what
-- make a seed safe to run against a database you are already using:
--
--   · **It only owns what it made.** Every client it creates is tagged
--     `metadata->>'seed' = 'demo'`, and a re-run tombstones exactly those and
--     everything hanging off them. Clients you added by hand are never touched.
--
--     It also retires clients tagged `'true'` and `'real20'` — the other two
--     seeds' tags. The three seeds are alternatives, not layers: they both write the trainer's working
--     hours, price list and templates, and running one on top of the other
--     leaves a diary with two of every shift on it. Running any one of them
--     gives you that seed's world and only that one.
--
--     Every id is `md5` of a key that starts with the trainer's phone, so
--     seeding two trainers on one database is safe and a re-run upserts instead
--     of doubling.
--   · **It is internally consistent.** Nothing here is a typed-in number that
--     could disagree with the rows beside it. Pack balances are computed from
--     the sessions that actually consumed them; the gym's cut is stamped at
--     record time from each client's own split; the weekly reports are computed
--     with the same aggregation `WeeklyReportWriter` uses, so the figures on the
--     report screen are the figures the data supports.
--
-- Dates are relative to CURRENT_DATE, so the window is always "the last ten
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
WHERE c.trainer_id = t.id AND c.metadata->>'seed' IN ('demo', 'true', 'real20');

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
UPDATE body_metric       SET deleted_at = now(), updated_at = now()
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
      AND metadata->>'seed' IN ('demo', 'true', 'real20');
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
-- The six answers onboarding collects, plus the gym arrangement and the UPI
-- handle the payment deep link is built from. Without `setup_completed_at` the
-- app decides setup is still owed and puts the flow in front of you on every
-- launch, which is the first thing that goes wrong when you seed a database and
-- open the app expecting the roster.
--
-- `metadata.prefs.plateStepKg` is here for one specific reason: it is what
-- separates a personal record from a rounding error, and BOTH the phone's gold
-- circle and the server's weekly-report count read it. A demo where those two
-- disagree is worse than one with no records at all.

UPDATE trainer SET
    upi_vpa            = COALESCE(upi_vpa, :'trainer_phone' || '@okhdfcbank'),
    gym_name           = 'Iron House, Adyar',
    gym_share_percent  = 50,
    experience_band    = '6_10',
    specialities       = '["strength","weight_loss","natal","custom:Powerlifting"]'::jsonb,
    certifications     = '["acsm_cpt","custom:K11 Level 3"]'::jsonb,
    languages          = '["ta","en","hi"]'::jsonb,
    setup_completed_at = COALESCE(setup_completed_at, now() - INTERVAL '200 days'),
    metadata           = COALESCE(metadata, '{}'::jsonb)
                         || jsonb_build_object('prefs', COALESCE(metadata->'prefs', '{}'::jsonb)
                                                        || '{"plateStepKg": 2.5}'::jsonb),
    updated_at         = now()
WHERE id IN (SELECT id FROM seed_trainer);

-- One identity per phone (V18). Sign-in reads this and nothing else to decide
-- which half of the product a number belongs to, so a trainer whose row predates
-- the migration — or whose row was never minted — lands on the client side of
-- their own app.
INSERT INTO app_user (id, phone, role, privacy_accepted_at, created_at)
SELECT md5(:'trainer_phone' || ':demo:user:trainer')::uuid, :'trainer_phone', 'trainer',
       now() - INTERVAL '200 days', now() - INTERVAL '200 days'
ON CONFLICT (phone) DO NOTHING;

-- ── The shape of the week ───────────────────────────────────────────────────
--
-- A split shift, which is the whole reason the diary is an agenda and not an
-- hour grid: 06:00–11:00 and 17:00–21:00, Wednesday off, and a Sunday that is a
-- short morning plus a two-hour evening window for remote check-ins.
-- weekday is 0 = Monday, matching the day strip.
--
-- No template below trains on a Wednesday. That is deliberate and it is load
-- bearing: a seed whose clients train on the trainer's day off draws a diary
-- that contradicts itself, and the reader cannot tell whether the bug is in the
-- data or in the screen.

INSERT INTO working_hours (id, trainer_id, weekday, start_minute, end_minute)
SELECT md5(:'trainer_phone' || ':demo:hours:' || w.weekday || ':' || w.start_minute)::uuid,
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

-- Three holes, of the three lengths the diary has to draw: an afternoon that
-- has already been and gone, a couple of hours next week, and a fortnight-style
-- all-day block. One table covers all three; the only difference is the length.
INSERT INTO time_block (id, trainer_id, starts_at, ends_at, all_day, reason, metadata)
SELECT md5(:'trainer_phone' || ':demo:block:' || b.slug)::uuid, t.id,
       ((CURRENT_DATE + b.from_day)::timestamp + b.from_time) AT TIME ZONE :'tz',
       ((CURRENT_DATE + b.to_day)::timestamp   + b.to_time)   AT TIME ZONE :'tz',
       b.all_day, b.reason, '{"seed":"demo"}'::jsonb
FROM seed_trainer t,
     (VALUES ('past',    -6, TIME '17:00', -6, TIME '21:00', FALSE, 'Gym floor closed — flooring work'),
             ('soon',     2, TIME '10:00',  2, TIME '13:00', FALSE, 'Dentist'),
             ('wedding',  9, TIME '00:00', 11, TIME '00:00', TRUE,  'Family wedding')
     ) AS b(slug, from_day, from_time, to_day, to_time, all_day, reason)
ON CONFLICT (id) DO UPDATE SET
    starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
    all_day = EXCLUDED.all_day, reason = EXCLUDED.reason,
    deleted_at = NULL, updated_at = now();

-- ── The trainer's own exercises ─────────────────────────────────────────────
--
-- All 1,324 of the library's rows are shared and belong to nobody. These four belong
-- to this trainer, and two of them are `log_type = 'reps'` — the column that
-- decides whether the log asks for a weight at all. A library with no custom
-- rows in it never draws the custom badge, the edit affordance, or the
-- reps-only set row, which are three of the four things that make the exercise
-- screens different from a printed list.
--
-- `equipment` is free text — `/v1/exercises/meta` builds the filter list with a
-- plain `SELECT DISTINCT`, so there is no vocabulary to violate and nothing
-- rejects a new word. That is exactly why these four have to use the library's
-- own words: 'bands' next to the library's 'band' is two filter chips for one
-- rack of resistance bands, and 'other' is a chip that sorts nothing. It also
-- matters further down, where the starting-load table keys off this column —
-- 'other' on a `weight_reps` exercise gave the sled push reps and no weight,
-- the row contradicting its own log_type. The two `reps` exercises still carry
-- no load, but now because 'rope' and 'band' genuinely have none rather than
-- because their equipment word matched nothing.

INSERT INTO exercise (id, name, muscle_group, equipment, movement_pattern, description,
                      is_custom, trainer_id, log_type, created_at)
SELECT md5(:'trainer_phone' || ':demo:ex:' || x.slug)::uuid, x.name, x.muscle, x.equip, x.pattern,
       x.descr, TRUE, t.id, x.log_type, (CURRENT_DATE - 150)::timestamptz
FROM seed_trainer t,
     (VALUES ('sled',   'Sled Push · Turf',        'quadriceps', 'sled machine', 'push',  'Two lengths of the turf. Load on the sled, not on the back.', 'weight_reps'),
             ('rope',   'Battle Rope Waves',       'shoulders',  'rope',         'carry', 'Thirty seconds on, thirty off. Counted as reps, not seconds.', 'reps'),
             ('bandpu', 'Assisted Pull-up (Band)', 'lats',       'band',         'pull',  'Green band under the knee until five clean reps, then drop a band.', 'reps'),
             ('farmer', 'Farmer Carry · 20m',      'forearms',   'dumbbell',     'carry', 'Twenty metres each way. The weight is per hand.', 'weight_reps')
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
-- Matched case-insensitively, and on the names the library carries AFTER V21 —
-- "Barbell full squat", not "Barbell Squat"; "Pull-up", not "Pullups". The four
-- library names here were the old dataset's and had resolved to nothing since
-- the swap, so this whole INSERT wrote two rows instead of six and the screen
-- looked like a feature nobody had built. The blueprint join below already
-- lower-cases both sides; this one now does too, so a future change to
-- `ExerciseSeeder.displayName` cannot break it again.
INSERT INTO exercise_favourite (id, trainer_id, exercise_id, created_at)
SELECT md5(:'trainer_phone' || ':demo:fav:' || e.id)::uuid, t.id, e.id, (CURRENT_DATE - 100)::timestamptz
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
-- they can do neither. A demo with only the trainer's list never shows the
-- distinction, which is the whole point of the column.

INSERT INTO pack (id, trainer_id, name, type, sessions, amount, currency, validity_days,
                  status, owner, order_index)
SELECT md5(:'trainer_phone' || ':demo:catalogue:' || v.slug)::uuid, t.id, v.name, v.type,
       v.sessions, v.amount, 'INR', v.validity, v.status, v.owner, v.ord
FROM seed_trainer t,
     (VALUES ('p16', '16 sessions',      'session_pack', 16,   12000::numeric, 60,   'active',   'trainer', 0),
             ('p12', '12 sessions',      'session_pack', 12,   9600::numeric,  45,   'active',   'trainer', 1),
             ('p8',  '8 sessions',       'session_pack', 8,    7000::numeric,  30,   'active',   'trainer', 2),
             ('pm',  'Monthly',          'monthly',      NULL, 9000::numeric,  30,   'active',   'trainer', 3),
             ('p1',  'Single session',   'single',       1,    900::numeric,   NULL, 'active',   'trainer', 4),
             -- Last year's price, kept off the list rather than deleted: packages
             -- sold at it still point here, and a deleted row makes their history
             -- unreadable.
             ('p10', '10 sessions (old)','session_pack', 10,   7500::numeric,  45,   'inactive', 'trainer', 5),
             ('g12', 'Gym PT · 12',      'session_pack', 12,   14000::numeric, 60,   'active',   'gym',     6),
             ('g8',  'Gym PT · 8',       'session_pack', 8,    10000::numeric, 45,   'active',   'gym',     7)
     ) AS v(slug, name, type, sessions, amount, validity, status, owner, ord)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, type = EXCLUDED.type, sessions = EXCLUDED.sessions,
    amount = EXCLUDED.amount, validity_days = EXCLUDED.validity_days,
    status = EXCLUDED.status, owner = EXCLUDED.owner, order_index = EXCLUDED.order_index,
    deleted_at = NULL, updated_at = now();

-- ── The five rules ──────────────────────────────────────────────────────────
--
-- If / then. The app seeds these on first open; a database seeded from here has
-- to carry them too, or the Nudges screen opens empty and the drafts it builds
-- from them never appear. One is `auto`, one is switched off, and one carries a
-- message the trainer has edited — the three states the rule editor draws.

INSERT INTO nudge_rule (id, trainer_id, kind, threshold, action, message, enabled, order_index, created_at)
SELECT md5(:'trainer_phone' || ':demo:rule:' || r.kind)::uuid, t.id, r.kind, r.threshold,
       r.action, r.message, r.enabled, r.ord, (CURRENT_DATE - 200)::timestamptz
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
-- Templates: the things a trainer assigns, drawn as a weeks × days shape.
-- Distinct from `program`, which is a template already COPIED onto one client —
-- the same menu-and-bill distinction `pack` has with `package`, and for the same
-- reason: editing the menu must never rewrite a bill.
--
-- `structure` is the blueprint, in the snake-cased shape the template API writes
-- and `parseBlueprint` on the phone reads. Exercise ids are resolved from the
-- library BY NAME, so the names below are the exact ones the seeded library
-- carries — upstream's own, lower-cased but for the first letter, warts and all
-- ("Barbell full squat", "Power point plank"). A plausible near-miss
-- silently drops that exercise and the day comes out short — which reads as a
-- bug in the app rather than a typo in a seed. The summary at the end counts the
-- entries that resolved, so a library rename is loud instead of quiet.
--
-- `authored` is how many weeks the blueprint spells out. One means "a single
-- week's shape, repeated", which is what every template written before V20
-- meant. `strength4` spells out four, with sets and reps moving week to week —
-- the only way to see the week switcher, `program_exercise.week`, and the log's
-- "which week is this" fallback do anything at all.

CREATE TEMP TABLE demo_template (
    key      text PRIMARY KEY,
    id       uuid,
    name     text,
    goal     text,
    descr    text,
    weeks    int,      -- how long the program runs
    authored int,      -- how many weeks the blueprint spells out
    slots    text,     -- the ordinal day slots: "1,2,3" (V24)
    plan     jsonb,    -- weekday → exercise names, in order
    labels   jsonb
) ON COMMIT DROP;

INSERT INTO demo_template VALUES
 ('ppl', md5(:'trainer_phone' || ':demo:template:ppl')::uuid, 'Push / Pull / Legs', 'Build strength',
  'Three days, one pattern each. The default for anybody past their first three months.', 8, 1, '1,2,3',
  '{"1":["Barbell bench press","Dumbbell incline bench press","Cable pushdown"],
    "2":["Barbell deadlift","Barbell bent over row","Barbell curl"],
    "3":["Barbell full squat","Barbell romanian deadlift","Barbell standing calf raise"]}',
  '{"1":"Push A","2":"Pull A","3":"Legs A"}'),
 ('full', md5(:'trainer_phone' || ':demo:template:full')::uuid, 'Full Body', 'General fitness',
  'Everything every session. For two or three days a week, which is most people.', 12, 1, '1,2,3',
  '{"1":["Barbell full squat","Barbell bench press","Barbell bent over row"],
    "2":["Barbell deadlift","Dumbbell seated shoulder press","Pull-up"],
    "3":["Smith leg press","Dumbbell bench press","Cable rope elevated seated row"]}',
  '{"1":"Full Body A","2":"Full Body B","3":"Full Body C"}'),
 ('upper', md5(:'trainer_phone' || ':demo:template:upper')::uuid, 'Upper / Lower', 'Muscle gain',
  'Two days split down the middle. The evening crowd''s programme.', 6, 1, '1,2',
  '{"1":["Barbell bench press","Barbell bent over row","Dumbbell seated shoulder press"],
    "2":["Barbell full squat","Barbell romanian deadlift","Smith leg press"]}',
  '{"1":"Upper","2":"Lower"}'),
 ('remote', md5(:'trainer_phone' || ':demo:template:remote')::uuid, 'Remote Core', 'Post-natal',
  'Over a call, on a mat, with nothing that needs a rack.', 6, 1, '1,2',
  '{"1":["Power point plank","Barbell glute bridge","Mountain climber"],
    "2":["Power point plank","Dead bug","Russian twist"]}',
  '{"1":"Core A","2":"Core B"}'),
 ('strength4', md5(:'trainer_phone' || ':demo:template:strength4')::uuid, 'Strength · 4 Day', 'Powerlifting',
  'Four weeks written out, sets up and reps down as it goes. Week four is the heavy one.', 4, 4, '1,2,3,4',
  '{"1":["Barbell full squat","Barbell bench press","Barbell bent over row"],
    "2":["Barbell deadlift","Dumbbell seated shoulder press","Pull-up"],
    "3":["Barbell full squat","Dumbbell incline bench press","Cable low seated row"],
    "4":["Barbell romanian deadlift","Dumbbell bench press","Farmers walk"]}',
  '{"1":"Squat day","2":"Pull day","3":"Bench day","4":"Carry day"}'),
 ('beginner', md5(:'trainer_phone' || ':demo:template:beginner')::uuid, 'Beginner Full Body', 'General fitness',
  'Machines and dumbbells for the first month. Nothing that needs a spotter.', 6, 1, '1,2',
  '{"1":["Smith leg press","Dumbbell bench press","Cable rope elevated seated row"],
    "2":["Barbell glute bridge","Dumbbell seated shoulder press","Battling ropes"]}',
  '{"1":"Machines A","2":"Machines B"}');

INSERT INTO template (id, trainer_id, name, goal, description, structure, day_labels, weeks,
                      training_days, created_at)
SELECT st.id, t.id, st.name, st.goal, st.descr,
       -- Flattened into the array the app reads: one entry per exercise per
       -- authored week, carrying the day and the order it sits in. Exercises the
       -- library doesn't have are dropped rather than written as a dangling id.
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
       st.labels, st.weeks, st.slots, (CURRENT_DATE - 140)::timestamptz
FROM demo_template st, seed_trainer t
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, goal = EXCLUDED.goal, description = EXCLUDED.description,
    structure = EXCLUDED.structure, day_labels = EXCLUDED.day_labels,
    weeks = EXCLUDED.weeks, training_days = EXCLUDED.training_days,
    deleted_at = NULL, updated_at = now();

-- ── The roster ──────────────────────────────────────────────────────────────
--
-- Forty-four people, chosen for the states they put the screens in rather than
-- for being a plausible client list — though it is one. Read the columns as a
-- specification of what has to be drawable:
--
--   tpl        which template they are on. NULL means nothing is set up yet,
--              which is a real state and the roster says "waiting for you".
--   band       am | pm — the half of the split shift their slot sits in.
--   days       the ISO weekdays they train, ascending. Its LENGTH must equal the
--              number of ordinal slots their template has, because that is the
--              rule `POST /v1/templates/{id}/apply` enforces; the assertion
--              below refuses the seed otherwise.
--   books      whether they are ON THE DIARY. See the note under it — this is
--              the column that lets forty-four clients belong to one trainer.
--   hist_weeks how far back their history runs, clamped to when they joined.
--   dark_days  a recent silence. Nothing is generated inside it, which is what
--              makes a client genuinely quiet rather than quiet-looking.
--   pay_state  paid | overdue | partial | fresh | writeoff | none
--   remaining  sessions left on the live pack. NULL for monthly and for nobody.
--
-- ── Why only nineteen of them are booked ────────────────────────────────────
--
-- One trainer coaches one client at a time. That is the rule this seed now
-- keeps, and it collides with the reason this seed exists.
--
-- Forty-four actively-training clients is 138 sessions and 137 coaching hours a
-- week. A split shift of 06:00–11:00 and 17:00–22:00, Monday to Saturday, is
-- sixty hours and — at the 75-minute pitch the timetable below uses — 48
-- sessions. The old version of this file resolved that by double-booking: five
-- people at 6am, and a Tuesday carrying fifty-one hours of one-to-one coaching.
-- It was never a timetable that could exist.
--
-- So the roster keeps all forty-four rows and books nineteen of them. The other
-- twenty-five are on the books in states that legitimately have no sessions this
-- quarter — paused, inactive, invited, archived, declined, removed, a number
-- that belongs to a trainer account, one who has not been set up yet, and a
-- group who have simply not trained since before the window opens. That is what
-- a five-year-old client list actually looks like, and it is the honest way to
-- have both an A–Z rail that exists (`INDEX_RAIL_MIN = 40`) and a diary one
-- person could work.
--
-- A `books = FALSE` client still carries a plan, a pack, a payment history,
-- body measurements and a weekly slot on file — everything except a row on the
-- diary. Their slot is the one they used to hold, which is why they still read
-- as "Tue & Fri, 7:15am" on their own screen.
--
-- ── And why there are no batches ────────────────────────────────────────────
--
-- A batch is several clients in one slot. That is its whole definition, and it
-- is the one shape this dataset cannot draw. The `batch` table, the two groups
-- and the `batch_id` on every attendee are gone from this seed; the diary's
-- batch row is a real thing and needs a seed that permits it, which this is no
-- longer.

CREATE TEMP TABLE demo_client (
    key        text PRIMARY KEY,
    id         uuid,
    name       text,
    phone      text,
    goal       text,
    tpl        text,
    band       text,     -- am | pm
    days       text,     -- ISO weekdays, ascending: "1,3,5"
    books      boolean,  -- on the diary, or on the books only
    duration   int,
    mode       text,     -- floor | remote
    pay_mode   text,     -- trainer_collects | gym_collects
    split      numeric,  -- what the TRAINER keeps, where the gym collects
    height     numeric,
    activity   text,
    status     text,     -- active | paused | inactive | invited | archived
    membership text,     -- accepted | invited | declined | removed | unavailable
    joined     int,      -- days ago
    hist_weeks int,
    dark_days  int,
    pack_slug  text,
    pay_state  text,
    remaining  int
) ON COMMIT DROP;

INSERT INTO demo_client (key, name, phone, goal, tpl, band, days, books, duration, mode, pay_mode,
                         split, height, activity, status, membership, joined, hist_weeks, dark_days,
                         pack_slug, pay_state, remaining) VALUES
-- ── on the diary · the nineteen this trainer actually coaches ───────────────
-- The morning shift. 06:00 · 07:15 · 08:30 · 09:45, four to a morning.
 ('ananya',  'Ananya Iyer',          '9840110001', 'Build strength',  'ppl',       'am', '1,3,5',   TRUE,  60, 'floor',  'trainer_collects', NULL, 164, 'moderate',    'active',   'accepted',    250, 10,  0, 'p16', 'paid',     11),
 ('arjun',   'Arjun Nair',           '9840110002', 'Powerlifting',    'strength4', 'am', '1,3,4,6', TRUE,  60, 'floor',  'trainer_collects', NULL, 178, 'active',      'active',   'accepted',    220, 10,  0, 'p16', 'paid',      9),
 ('bhavana', 'Bhavana Reddy',        '9840110003', 'General fitness', 'upper',     'am', '2,5',     TRUE,  60, 'floor',  'gym_collects',       60, 158, 'sedentary',   'active',   'accepted',    190, 10,  0, 'p12', 'paid',      7),
 ('harish',  'Harish Kumar',         '9840110008', 'Muscle gain',     'ppl',       'am', '2,4,6',   TRUE,  60, 'floor',  'trainer_collects', NULL, 175, 'moderate',    'active',   'accepted',    130, 10,  0, 'p16', 'partial',   8),
 ('ishaan',  'Ishaan Verma',         '9840110009', 'Fat loss',        'full',      'am', '1,3,5',   TRUE,  60, 'floor',  'trainer_collects', NULL, 169, 'light',       'active',   'accepted',    125, 10,  0, 'p8',  'paid',      0),
 ('jyothi',  'Jyothi Balan',         '9840110010', 'General fitness', 'beginner',  'am', '2,4',     TRUE,  45, 'floor',  'gym_collects',       50, 155, 'sedentary',   'active',   'accepted',    118, 10,  0, 'g12', 'paid',     10),
 ('usha',    'Usha Menon',           '9840110021', 'General fitness', 'full',      'am', '2,4,6',   TRUE,  60, 'floor',  'gym_collects',       55, 156, 'sedentary',   'active',   'accepted',     48, 10,  0, 'g8',  'paid',      3),
 ('varun',   'Varun Joshi',          '9840110042', 'Build strength',  'upper',     'am', '1,5',     TRUE,  60, 'floor',  'trainer_collects', NULL, 180, 'active',      'active',   'accepted',     13,  4,  0, 'p12', 'paid',      9),
 ('yamini',  'Yamini Rajan',         '9840110024', 'General fitness', 'beginner',  'am', '3,6',     TRUE,  45, 'floor',  'trainer_collects', NULL, 158, 'sedentary',   'active',   'accepted',     34,  4,  0, 'p8',  'fresh',     7),
-- The evening shift. 17:00 · 18:15 · 19:30 · 20:45.
 ('chandran','Chandran Pillai',      '9840110004', 'Fat loss',        'upper',     'pm', '2,5',     TRUE,  60, 'floor',  'trainer_collects', NULL, 172, 'light',       'active',   'accepted',    175, 10,  0, 'p12', 'overdue',   6),
 ('farhan',  'Farhan Qureshi',       '9840110006', 'Muscle gain',     'upper',     'pm', '1,4',     TRUE,  60, 'floor',  'trainer_collects', NULL, 180, 'active',      'active',   'accepted',    150, 10,  0, 'p12', 'overdue',   5),
 ('gayathri','Gayathri Subramanian', '9840110007', 'Post-natal',      'remote',    'pm', '3,6',     TRUE,  45, 'remote', 'trainer_collects', NULL, 160, 'light',       'active',   'accepted',    140, 10,  0, 'pm',  'paid',   NULL),
 ('lakshmi', 'Lakshmi Narayanan',    '9840110012', 'General fitness', 'remote',    'pm', '1,5',     TRUE,  45, 'remote', 'trainer_collects', NULL, 161, 'light',       'active',   'accepted',    105, 10,  0, 'pm',  'paid',   NULL),
 ('mohan',   'Mohan Das',            '9840110013', 'Build strength',  'ppl',       'pm', '1,3,6',   TRUE,  60, 'floor',  'trainer_collects', NULL, 174, 'active',      'active',   'accepted',     98, 10,  0, 'p16', 'paid',     12),
 ('nithya',  'Nithya Krishnan',      '9840110014', 'Fat loss',        'full',      'pm', '2,4,6',   TRUE,  60, 'floor',  'gym_collects',       60, 157, 'sedentary',   'active',   'accepted',     92, 10,  0, 'p16', 'writeoff',  4),
 ('omar',    'Omar Sheikh',          '9840110015', 'Muscle gain',     'upper',     'pm', '3,5',     TRUE,  60, 'floor',  'trainer_collects', NULL, 181, 'moderate',    'active',   'accepted',     85, 10,  0, 'p8',  'fresh',     6),
 ('quadir',  'Quadir Ahmed',         '9840110017', 'Build strength',  'beginner',  'pm', '2,4',     TRUE,  45, 'floor',  'trainer_collects', NULL, 170, 'light',       'active',   'accepted',     72, 10,  0, 'p8',  'paid',      5),
 ('rekha',   'Rekha Pillai',         '9840110018', 'General fitness', 'ppl',       'pm', '1,3,5',   TRUE,  60, 'floor',  'trainer_collects', NULL, 159, 'moderate',    'active',   'accepted',     66, 10,  0, 'p16', 'paid',     13),
 ('sneha',   'Sneha Rao',            '9840110019', 'Post-natal',      'remote',    'pm', '2,6',     TRUE,  45, 'remote', 'trainer_collects', NULL, 162, 'light',       'active',   'accepted',     60, 10,  0, 'pm',  'fresh',  NULL),
-- ── on the books · a slot on file, nothing on the diary ─────────────────────
-- Their `days` and `band` are the slot they used to hold, so their own screens
-- still read "Tue & Fri, 7:15am". `books = FALSE` keeps them off the timetable,
-- which is what makes the nineteen above fit a shift one person could work.
 ('divya',   'Divya Menon',          '9840110005', 'Fat loss',        'ppl',       'pm', '1,3,5',   FALSE, 60, 'floor',  'gym_collects',       55, 167, 'moderate',    'paused',   'accepted',    160, 10, 30, 'p8',  'paid',      2),
 ('karthik', 'Karthik Raman',        '9840110011', 'Fat loss',        'upper',     'am', '2,5',     FALSE, 60, 'floor',  'trainer_collects', NULL, 176, 'light',       'inactive', 'accepted',    112, 10, 40, 'p12', 'paid',      8),
 ('priya',   'Priya Ramesh',         '9840110016', 'Fat loss',        'remote',    'pm', '2,6',     FALSE, 45, 'remote', 'trainer_collects', NULL, 163, 'moderate',    'paused',   'accepted',     78, 10, 35, 'p12', 'paid',      7),
 ('tarun',   'Tarun Gopal',          '9840110020', 'Muscle gain',     'upper',     'pm', '1,4',     FALSE, 60, 'floor',  'trainer_collects', NULL, 177, 'light',       'paused',   'accepted',     54, 10, 21, 'p12', 'paid',      6),
 ('vikram',  'Vikram Chandra',       '9840110022', 'Powerlifting',    'strength4', 'am', '1,2,4,6', FALSE, 75, 'floor',  'trainer_collects', NULL, 179, 'very_active', 'inactive', 'accepted',     44, 10, 32, 'p16', 'paid',     10),
 ('wasim',   'Wasim Akhtar',         '9840110023', 'Fat loss',        'beginner',  'am', '3,6',     FALSE, 60, 'floor',  'trainer_collects', NULL, 173, 'light',       'inactive', 'accepted',     38,  4, 25, 'p8',  'paid',      6),
 ('zara',    'Zara Khan',            '9840110025', 'Fat loss',        'remote',    'pm', '3,6',     FALSE, 45, 'remote', 'trainer_collects', NULL, 164, 'light',       'paused',   'accepted',     31,  4, 22, 'pm',  'paid',   NULL),
 ('aditi',   'Aditi Sharma',         '9840110026', 'Muscle gain',     'beginner',  'am', '1,4',     FALSE, 60, 'floor',  'trainer_collects', NULL, 165, 'moderate',    'inactive', 'accepted',     29,  4, 24, 'p8',  'paid',      5),
 ('balaji',  'Balaji Sundar',        '9840110027', 'Fat loss',        'full',      'pm', '1,3,5',   FALSE, 60, 'floor',  'gym_collects',       50, 171, 'light',       'paused',   'accepted',     27,  4, 23, 'g12', 'paid',      9),
 -- Added yesterday and nothing set up yet. No template, so no plan, no bookings
 -- and no pack — the roster's "waiting for you", which is a different thing from
 -- a client who has gone quiet.
 ('charu',   'Charu Anand',          '9840110028', 'General fitness', NULL,        NULL, NULL,      FALSE, 60, 'floor',  'trainer_collects', NULL, 160, 'sedentary',   'active',   'accepted',      1,  0,  0, NULL,  'none',   NULL),
 ('deepak',  'Deepak Iyer',          '9840110029', 'Muscle gain',     'upper',     'pm', '2,5',     FALSE, 60, 'floor',  'trainer_collects', NULL, 176, 'active',      'inactive', 'accepted',     24,  4, 20, 'p12', 'paid',      8),
 ('elakiya', 'Elakiya Murugan',      '9840110030', 'Fat loss',        'beginner',  'am', '2,4',     FALSE, 60, 'floor',  'trainer_collects', NULL, 157, 'light',       'paused',   'accepted',     23,  4, 19, 'p8',  'paid',      4),
 ('ganesh',  'Ganesh Rao',           '9840110031', 'Build strength',  'full',      'am', '1,3,6',   FALSE, 60, 'floor',  'trainer_collects', NULL, 174, 'moderate',    'inactive', 'accepted',     22,  4, 18, 'p12', 'overdue',   5),
 -- Invited six days back and never opened it. Past `INVITE_STALE_DAYS`, so the
 -- roster stops saying "invited" and starts saying "resend".
 ('hema',    'Hema Suresh',          '9840110032', 'General fitness', 'beginner',  'am', '2,5',     FALSE, 60, 'floor',  'trainer_collects', NULL, 159, 'sedentary',   'invited',  'invited',       6,  0,  0, 'p8',  'fresh',     8),
 ('irfan',   'Irfan Ali',            '9840110033', 'Muscle gain',     'upper',     'pm', '1,4',     FALSE, 60, 'floor',  'trainer_collects', NULL, 178, 'moderate',    'invited',  'invited',       0,  0,  0, 'p8',  'fresh',     8),
 -- No number on file. Everything works except anything that has to leave the
 -- phone: her weekly report is written and has nowhere to go.
 ('kavya',   'Kavya Ravi',           NULL,         'Fat loss',        'beginner',  'am', '3,6',     FALSE, 60, 'floor',  'trainer_collects', NULL, 161, 'light',       'paused',   'accepted',     21,  4, 17, 'p8',  'paid',      5),
 ('manoj',   'Manoj Pillai',         '9840110035', 'General fitness', 'full',      'pm', '2,4,6',   FALSE, 60, 'floor',  'trainer_collects', NULL, 170, 'light',       'inactive', 'declined',     20,  4,  9, 'p12', 'paid',      7),
 ('nandhini','Nandhini Selvam',      '9840110036', 'Fat loss',        'beginner',  'am', '1,5',     FALSE, 60, 'floor',  'trainer_collects', NULL, 156, 'sedentary',   'inactive', 'removed',      30,  4, 14, 'p8',  'paid',      6),
 -- The number turns out to own a trainer account, so no invite can ever reach
 -- it. `ClientPhoneGuard` refuses this at the door now; the row exists because
 -- rows in this state predate the guard, and because it is the one attention
 -- item on the roster that is a typo rather than a fact about the client.
 ('pavan',   'Pavan Kulkarni',       '9840110037', 'Muscle gain',     'upper',     'pm', '3,6',     FALSE, 60, 'floor',  'trainer_collects', NULL, 177, 'moderate',    'active',   'unavailable',  18,  4,  0, 'p12', 'paid',      4),
 ('radha',   'Radha Krishnan',       '9840110038', 'General fitness', 'beginner',  'am', '2,4',     FALSE, 60, 'floor',  'gym_collects',       50, 154, 'sedentary',   'inactive', 'accepted',     17,  4, 15, 'g8',  'paid',      5),
 ('sathish', 'Sathish Kumar',        '9840110039', 'Fat loss',        'full',      'pm', '2,4,6',   FALSE, 60, 'floor',  'trainer_collects', NULL, 172, 'light',       'paused',   'accepted',     40,  4, 12, 'p12', 'paid',      8),
 ('thanya',  'Thanya Prakash',       '9840110040', 'Muscle gain',     'beginner',  'am', '1,4',     FALSE, 60, 'floor',  'trainer_collects', NULL, 163, 'moderate',    'inactive', 'accepted',     15,  4, 13, 'p8',  'paid',      6),
 ('uma',     'Uma Bhat',             '9840110041', 'General fitness', 'remote',    'pm', '1,5',     FALSE, 45, 'remote', 'trainer_collects', NULL, 158, 'light',       'paused',   'accepted',     14,  4, 11, 'pm',  'paid',   NULL),
 ('yusuf',   'Yusuf Rahman',         '9840110043', 'Fat loss',        'beginner',  'pm', '3,6',     FALSE, 60, 'floor',  'trainer_collects', NULL, 175, 'light',       'inactive', 'accepted',     12,  4, 10, 'p8',  'paid',      2),
 ('zoya',    'Zoya Mirza',           '9840110044', 'General fitness', 'full',      'am', '1,3,5',   FALSE, 60, 'floor',  'trainer_collects', NULL, 162, 'sedentary',   'archived', 'accepted',     45,  4, 16, 'p12', 'paid',      7);

-- The count-match rule, checked here rather than discovered later. `apply`
-- refuses a schedule that does not cover each of the template's ordinal days
-- exactly once, so a client whose `days` list is the wrong length would be a
-- program the product could not have produced.
DO $$
DECLARE bad text;
BEGIN
    SELECT string_agg(format('%s: %s days for a %s-day template', c.key,
                             cardinality(string_to_array(c.days, ',')),
                             cardinality(string_to_array(t.slots, ','))), '; ' ORDER BY c.key)
    INTO bad
    FROM demo_client c JOIN demo_template t ON t.key = c.tpl
    WHERE cardinality(string_to_array(c.days, ',')) <> cardinality(string_to_array(t.slots, ','));
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'Schedule does not cover the template''s days: %', bad;
    END IF;
END $$;

UPDATE demo_client SET id = md5(:'trainer_phone' || ':demo:client:' || key)::uuid;

-- ── The timetable ───────────────────────────────────────────────────────────
--
-- One trainer coaches one person at a time, so a slot is a scarce thing and the
-- data has to behave like it. This is the part the old version of this file got
-- wrong: it typed an hour per client, five of them said 06:00, and the diary
-- drew five people in one room.
--
-- Each (weekday, band) is a queue instead. The clients on the diary that morning
-- are stacked into four positions in a stable order, and the position decides
-- the time — 06:00, 07:15, 08:30, 09:45, then 17:00, 18:15, 19:30, 20:45.
-- Because position comes from `row_number()` over that exact partition, two
-- clients on the same day CANNOT be given the same time. It is not a property
-- somebody has to remember when they add a forty-fifth client.
--
-- The 75-minute pitch is what holds the frame with mixed durations: a 45-minute
-- call and a 60-minute floor session both fit one position, with the remainder
-- as turnaround. Anything longer than 75 would not, and the overflow check below
-- is watching for exactly that.
--
-- `books = FALSE` clients are queued SEPARATELY, over the same four positions.
-- They generate no sessions, so they can hold a slot a booked client also holds
-- without the two ever meeting on a real date — which is the whole reason
-- forty-four clients can share one trainer's week. What they get out of it is a
-- weekly slot on file that reads like the one they used to have.
--
-- The ordinal slot each weekday carries — `template_day` — is the day's position
-- in the client's own ascending list, which is what `parseWeeklySchedule`
-- derives on the phone. Day 1 is the earliest weekday.

CREATE TEMP TABLE demo_slot ON COMMIT DROP AS
WITH raw AS (
    SELECT c.key, c.id AS client_id, c.duration, c.band, c.books,
           d.day::int AS weekday,
           d.ord::int AS template_day
    FROM demo_client c
    CROSS JOIN LATERAL unnest(string_to_array(c.days, ',')) WITH ORDINALITY AS d(day, ord)
    WHERE c.days IS NOT NULL
),
queued AS (
    -- Ordered by key: arbitrary, but stable across runs, which is what keeps a
    -- re-run from reshuffling everybody's 6am.
    SELECT r.*,
           CASE WHEN r.books
                -- On the diary: the position IS the slot, and there are four.
                -- A fifth booked client on one morning has nowhere to go, which
                -- is what the overflow check below refuses.
                THEN row_number() OVER (PARTITION BY r.weekday, r.band, r.books ORDER BY r.key)
                -- On the books only: wrapped back into the same four. Two paused
                -- clients may both read "Tue 07:15" on their own screen and it
                -- costs nothing — neither of them is on the diary, so they never
                -- meet there or anywhere else. Without the wrap a ninth such
                -- client would be given a slot at half past noon, which is a
                -- lie on a profile even when nothing is booked into it.
                ELSE ((row_number() OVER (PARTITION BY r.weekday, r.band, r.books ORDER BY r.key) - 1) % 4) + 1
           END AS position
    FROM raw r
)
SELECT q.key, q.client_id, q.duration, q.weekday, q.template_day, q.band, q.books, q.position,
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
    INTO bad FROM demo_slot WHERE end_minute > closes;
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'The timetable overflows the working day: %', bad;
    END IF;
END $$;

INSERT INTO client (id, trainer_id, name, phone, goal, status, payment_mode, trainer_split_percent,
                    height_cm, activity_level, delivery_mode, sessions_per_week,
                    session_duration_minutes, weekly_schedule, membership_status,
                    invited_at, accepted_at, declined_at, removed_at, paused_at,
                    metadata, created_at)
SELECT c.id, t.id, c.name, c.phone, c.goal, c.status, c.pay_mode, c.split,
       c.height, c.activity, c.mode,
       NULLIF(cardinality(COALESCE(string_to_array(c.days, ','), '{}')), 0), c.duration,
       -- `[{templateDay, weekday, time}]`, the canonical shape in
       -- `app/src/clients/schedule.ts`. `templateDay` is the ORDINAL slot the
       -- day carries, `weekday` is the calendar day it falls on — the two
       -- meanings V24 separated.
       COALESCE((SELECT jsonb_agg(jsonb_build_object(
                          'templateDay', s.template_day,
                          'weekday',     s.weekday,
                          'time',        s.at_time) ORDER BY s.weekday)
                 FROM demo_slot s WHERE s.key = c.key), '[]'::jsonb),
       c.membership,
       (CURRENT_DATE - c.joined)::timestamptz,
       CASE WHEN c.membership IN ('accepted', 'removed') THEN (CURRENT_DATE - c.joined + 1)::timestamptz END,
       CASE WHEN c.membership = 'declined' THEN (CURRENT_DATE - 12)::timestamptz END,
       CASE WHEN c.membership = 'removed'  THEN (CURRENT_DATE - 10)::timestamptz END,
       CASE WHEN c.status = 'paused' THEN (CURRENT_DATE - GREATEST(c.dark_days, 1))::timestamptz END,
       -- `pausedAt` / `invitedAt` / `archivedAt` are written into metadata as
       -- well as into their own columns, because that is where `setClientStatus`
       -- puts them and it is what the roster's second line reads. The column is
       -- the server's record; the metadata key is the phone's.
       '{"seed":"demo"}'::jsonb
         || CASE WHEN c.status = 'paused'
                 THEN jsonb_build_object('pausedAt', (CURRENT_DATE - GREATEST(c.dark_days, 1))::text)
                 ELSE '{}'::jsonb END
         || CASE WHEN c.status = 'invited'
                 THEN jsonb_build_object('invitedAt', (CURRENT_DATE - c.joined)::text)
                 ELSE '{}'::jsonb END
         || CASE WHEN c.status = 'archived'
                 THEN jsonb_build_object('archivedAt', (CURRENT_DATE - 7)::text)
                 ELSE '{}'::jsonb END,
       (CURRENT_DATE - c.joined)::timestamptz
FROM demo_client c, seed_trainer t
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, phone = EXCLUDED.phone, goal = EXCLUDED.goal,
    status = EXCLUDED.status, payment_mode = EXCLUDED.payment_mode,
    trainer_split_percent = EXCLUDED.trainer_split_percent,
    height_cm = EXCLUDED.height_cm, activity_level = EXCLUDED.activity_level,
    delivery_mode = EXCLUDED.delivery_mode, sessions_per_week = EXCLUDED.sessions_per_week,
    session_duration_minutes = EXCLUDED.session_duration_minutes,
    weekly_schedule = EXCLUDED.weekly_schedule, membership_status = EXCLUDED.membership_status,
    invited_at = EXCLUDED.invited_at, accepted_at = EXCLUDED.accepted_at,
    declined_at = EXCLUDED.declined_at, removed_at = EXCLUDED.removed_at,
    paused_at = EXCLUDED.paused_at, metadata = EXCLUDED.metadata,
    created_at = EXCLUDED.created_at, deleted_at = NULL, updated_at = now();

-- One identity per phone. Clients who have accepted have agreed to the privacy
-- policy; the invited ones have not, which is exactly what the null says.
--
-- Pavan's row is `role = 'trainer'`, and that is the whole point of him: his
-- number owns a trainer account somewhere, which is why his membership reads
-- `unavailable` and why the roster offers "Fix number" rather than "Resend".
-- No `trainer` row is created for him — that would be a second workspace, and
-- the guard only needs the identity.
INSERT INTO app_user (id, phone, role, privacy_accepted_at, created_at)
SELECT md5(:'trainer_phone' || ':demo:user:' || c.key)::uuid, c.phone,
       CASE WHEN c.membership = 'unavailable' THEN 'trainer' ELSE 'client' END,
       CASE WHEN c.membership = 'accepted' THEN (CURRENT_DATE - c.joined + 1)::timestamptz END,
       (CURRENT_DATE - c.joined)::timestamptz
FROM demo_client c
WHERE c.phone IS NOT NULL
ON CONFLICT (phone) DO NOTHING;

-- ── Programs ────────────────────────────────────────────────────────────────
--
-- A program is a template already copied onto one client. It carries the
-- `template_id` it came from as PROVENANCE, never as authority: nothing reads a
-- program's exercises through its template, which is what makes "editing a
-- template never changes a plan somebody is halfway through" true rather than
-- aspirational. It is also what lets the Programs screen say "5 clients on this".
--
-- Real dates, because "Week 5 of 8" is what turns a session into a position in a
-- plan. The start is the Monday their history begins on, so the week number the
-- log computes from `start_date` matches the week their sessions actually sit in.

CREATE TEMP TABLE demo_program ON COMMIT DROP AS
SELECT c.key,
       md5(:'trainer_phone' || ':demo:program:' || c.key)::uuid AS id,
       c.id AS client_id,
       t.id AS template_id,
       t.name,
       c.goal,
       -- Clamped to when they joined: a program cannot start before its client.
       (date_trunc('week', GREATEST(CURRENT_DATE - c.hist_weeks * 7,
                                    CURRENT_DATE - c.joined))::date) AS start_date,
       t.weeks,
       t.authored,
       CASE WHEN c.status = 'paused'   THEN 'paused'
            WHEN c.status = 'archived' THEN 'completed'
            ELSE 'active' END AS status
FROM demo_client c
JOIN demo_template t ON t.key = c.tpl;

INSERT INTO program (id, trainer_id, client_id, template_id, name, goal, start_date, end_date,
                     schedule, status, created_at)
SELECT p.id, t.id, p.client_id, p.template_id, p.name, p.goal, p.start_date,
       p.start_date + p.weeks * 7,
       -- V24 · which weekday and time each ordinal day landed on. Written once
       -- by apply and read by the phone on sync; it is the only record of the
       -- choice, because `program_exercise` below carries the answer but not
       -- the question.
       (SELECT jsonb_agg(jsonb_build_object('day', s.template_day,
                                            'weekday', s.weekday,
                                            'time', s.at_time) ORDER BY s.template_day)
        FROM demo_slot s WHERE s.key = p.key),
       p.status, p.start_date::timestamptz
FROM demo_program p, seed_trainer t
ON CONFLICT (id) DO UPDATE SET
    template_id = EXCLUDED.template_id, name = EXCLUDED.name, goal = EXCLUDED.goal,
    start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
    schedule = EXCLUDED.schedule,
    status = EXCLUDED.status, deleted_at = NULL, updated_at = now();

-- One finished program, so the client file's Programs tab has a history rather
-- than a single row that has always been there.
INSERT INTO program (id, trainer_id, client_id, template_id, name, goal, start_date, end_date,
                     status, created_at)
SELECT md5(:'trainer_phone' || ':demo:program:prev:' || p.key)::uuid, t.id, p.client_id,
       p.template_id, p.name || ' · block 1', p.goal,
       p.start_date - 56, p.start_date - 1, 'completed', (p.start_date - 56)::timestamptz
FROM demo_program p, seed_trainer t
WHERE p.key IN ('ananya', 'rekha', 'mohan')
ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status, deleted_at = NULL, updated_at = now();

-- ── The copy ────────────────────────────────────────────────────────────────
--
-- Assigning a program COPIES the template's blueprint into `program_exercise`
-- rows. On a device the server does this inside `POST /v1/templates/{id}/apply`;
-- the seed has to do it too, or every client ends up with a program that has a
-- name, a start date and no exercises — and the workout log opens on "Nothing
-- planned" for somebody who plainly has a plan.
--
-- `week` comes across with everything else. A four-week blueprint copies four
-- weeks of rows rather than flattening them into one week with every exercise
-- repeated four times.

INSERT INTO program_exercise (id, program_id, exercise_id, sets, reps, rest_seconds,
                              target_load, notes, day_of_week, week, order_index, created_at)
SELECT md5(:'trainer_phone' || ':demo:progex:' || p.key || ':'
           || COALESCE(entry->>'week', '1') || ':'
           || (entry->>'day_of_week') || ':' || (entry->>'order_index'))::uuid,
       p.id,
       (entry->>'exercise_id')::uuid,
       (entry->>'sets')::int,
       (entry->>'reps')::int,
       (entry->>'rest_seconds')::int,
       NULL, NULL,
       -- The translation V24 introduced: the blueprint's `day_of_week` is an
       -- ORDINAL SLOT, and the row landing in the client's plan carries the
       -- concrete WEEKDAY that slot was scheduled on. The phone's log keys on
       -- this — `fetchProgramExercisesForDay` matches it against the session's
       -- weekday — so getting it wrong means a plan that exists and a log that
       -- cannot find it.
       sl.weekday,
       COALESCE((entry->>'week')::int, 1),
       (entry->>'order_index')::int,
       p.start_date::timestamptz
FROM demo_program p
JOIN template tpl ON tpl.id = p.template_id
CROSS JOIN LATERAL jsonb_array_elements(tpl.structure) AS entry
JOIN demo_slot sl ON sl.key = p.key AND sl.template_day = (entry->>'day_of_week')::int
ON CONFLICT (id) DO UPDATE SET
    exercise_id = EXCLUDED.exercise_id, sets = EXCLUDED.sets, reps = EXCLUDED.reps,
    rest_seconds = EXCLUDED.rest_seconds, day_of_week = EXCLUDED.day_of_week,
    week = EXCLUDED.week, order_index = EXCLUDED.order_index,
    deleted_at = NULL, updated_at = now();

-- ── No batches ──────────────────────────────────────────────────────────────
--
-- There used to be two here, and the diary's batch row is a real shape worth
-- seeding. It is also, by definition, several clients in one slot — so it is the
-- one thing this dataset cannot contain now that it books one person at a time.
-- The `batch` table is still retired at the top of this file, so a previous
-- run's groups do not survive into this one.

-- ── Packs sold ──────────────────────────────────────────────────────────────
--
-- The bill, as opposed to the price list. `sessions_total` and
-- `sessions_remaining` are placeholders here — both are rewritten at the end
-- from the sessions that actually consumed them, plus the target remainder on
-- the roster above. Typing a plausible number instead is how the roster chip,
-- the diary and the pack detail end up disagreeing.
--
-- `discount_amount` records why a sale was under the list price. `amount` stays
-- what the client actually owes, because it is already net — the discount is
-- the explanation, not the arithmetic.

CREATE TEMP TABLE demo_package ON COMMIT DROP AS
SELECT c.key,
       md5(:'trainer_phone' || ':demo:package:' || c.key)::uuid AS id,
       c.id AS client_id,
       k.id AS pack_id,
       k.type,
       k.sessions,
       CASE c.key WHEN 'harish' THEN 1000::numeric
                  WHEN 'divya'  THEN 500::numeric END AS discount,
       k.amount - COALESCE(CASE c.key WHEN 'harish' THEN 1000::numeric
                                      WHEN 'divya'  THEN 500::numeric END, 0) AS amount,
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
FROM demo_client c
JOIN pack k ON k.id = md5(:'trainer_phone' || ':demo:catalogue:' || c.pack_slug)::uuid
WHERE c.pack_slug IS NOT NULL;

INSERT INTO package (id, trainer_id, client_id, type, sessions_total, sessions_remaining,
                     amount, currency, start_date, end_date, status, pack_id, due_date,
                     discount_amount, written_off_at, written_off_amount, created_at)
SELECT p.id, t.id, p.client_id, p.type, p.sessions, p.sessions, p.amount, 'INR',
       p.billed_on, p.billed_on + 60, 'active', p.pack_id,
       -- When the money was agreed. The overdue ones are well past it; the fresh
       -- ones were agreed three days ago and are not late yet, which is the
       -- distinction the chase list turns on.
       CASE p.pay_state WHEN 'overdue' THEN CURRENT_DATE - 13
                        WHEN 'partial' THEN CURRENT_DATE - 4
                        WHEN 'fresh'   THEN CURRENT_DATE + 4
                        ELSE p.billed_on END,
       p.discount,
       CASE WHEN p.pay_state = 'writeoff' THEN (CURRENT_DATE - 5)::timestamptz END,
       -- What was let go, not what was owed: a write-off after a part payment
       -- forgives the balance and nothing more.
       CASE WHEN p.pay_state = 'writeoff' THEN round(p.amount * 0.6, 2) END,
       p.billed_on::timestamptz
FROM demo_package p, seed_trainer t
ON CONFLICT (id) DO UPDATE SET
    type = EXCLUDED.type, amount = EXCLUDED.amount, status = EXCLUDED.status,
    start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
    pack_id = EXCLUDED.pack_id, due_date = EXCLUDED.due_date,
    discount_amount = EXCLUDED.discount_amount,
    written_off_at = EXCLUDED.written_off_at, written_off_amount = EXCLUDED.written_off_amount,
    deleted_at = NULL, updated_at = now();

-- Last month's packs, closed and paid in full. Without them the month strip has
-- exactly one entry and "hisaab clear" — a whole month with nothing left out —
-- has nowhere to show itself. Only for the clients who were already here.
INSERT INTO package (id, trainer_id, client_id, type, sessions_total, sessions_remaining,
                     amount, currency, start_date, end_date, status, pack_id, due_date, created_at)
SELECT md5(:'trainer_phone' || ':demo:package:prev:' || p.key)::uuid, t.id, p.client_id, p.type,
       COALESCE(p.sessions, 0), 0, p.amount, 'INR',
       (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date,
       (date_trunc('month', CURRENT_DATE) - INTERVAL '1 day')::date,
       'expired', p.pack_id,
       (date_trunc('month', CURRENT_DATE) - INTERVAL '1 day')::date,
       (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::timestamptz
FROM demo_package p
JOIN demo_client c ON c.key = p.key, seed_trainer t
WHERE c.joined > 45
ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount, status = EXCLUDED.status, pack_id = EXCLUDED.pack_id,
    deleted_at = NULL, updated_at = now();

-- A single session, sold off the price list to somebody who turned up on a day
-- they don't train, used that morning and closed. Two packages on one client is
-- a state the package tab has to draw and the pack picker has to disambiguate.
--
-- Closed rather than left open, and that is not tidiness. The roster reads the
-- LEANEST live pack a client has: an unused single would sit at one session
-- remaining and put "Pack ends in 1 session" on somebody who has eight left on
-- their real pack. It was bought for one morning; it should read like it.
INSERT INTO package (id, trainer_id, client_id, type, sessions_total, sessions_remaining,
                     amount, currency, start_date, end_date, status, pack_id, due_date, created_at)
SELECT md5(:'trainer_phone' || ':demo:package:single:' || c.key)::uuid, t.id, c.id, 'single',
       1, 0, 900, 'INR', CURRENT_DATE - 6, CURRENT_DATE - 6, 'expired',
       md5(:'trainer_phone' || ':demo:catalogue:p1')::uuid, CURRENT_DATE - 6,
       (CURRENT_DATE - 6)::timestamptz
FROM demo_client c, seed_trainer t
WHERE c.key IN ('quadir', 'deepak')
ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount, sessions_remaining = EXCLUDED.sessions_remaining,
    status = EXCLUDED.status, end_date = EXCLUDED.end_date,
    deleted_at = NULL, updated_at = now();

-- Paid in cash on the day, which is how a single session is always paid.
INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, method,
                     collected_by, status, paid_at, gym_share_amount, share_percent,
                     receipt_no, created_at)
SELECT md5(:'trainer_phone' || ':demo:pay:single:' || c.key)::uuid, t.id, c.id,
       md5(:'trainer_phone' || ':demo:package:single:' || c.key)::uuid,
       900, 'INR', 'cash', 'trainer', 'paid',
       (CURRENT_DATE - 6)::timestamptz + INTERVAL '8 hours',
       450, 50,
       'TX-' || to_char(CURRENT_DATE, 'YYMM') || '-9' || substr(md5(c.key), 1, 2),
       (CURRENT_DATE - 6)::timestamptz + INTERVAL '8 hours'
FROM demo_client c, seed_trainer t
WHERE c.key IN ('quadir', 'deepak')
ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount, status = EXCLUDED.status, paid_at = EXCLUDED.paid_at,
    deleted_at = NULL, updated_at = now();

-- ── Money in ────────────────────────────────────────────────────────────────
--
-- The gym's cut is stamped onto each entry AT RECORD TIME, exactly as the app
-- does it — the percentage is copied onto the row and never looked up later, so
-- a contract that changes in October leaves September alone. `split` is what the
-- TRAINER keeps, so a client on 60 means the gym takes 40, not 50. Remote is
-- always zero, which is a rule in code rather than a second column.

-- What has actually been collected. The part payment is one row for less than
-- the package, not a 'partial' status — the balance is derived, and a status
-- that claimed to know it would be a second copy of the same fact.
INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, method,
                     collected_by, status, upi_reference, paid_at,
                     gym_share_amount, share_percent, receipt_no, note, created_at)
SELECT md5(:'trainer_phone' || ':demo:pay:' || p.key)::uuid, t.id, p.client_id, p.id,
       CASE p.pay_state WHEN 'partial'  THEN round(p.amount * 0.5, 2)
                        WHEN 'writeoff' THEN round(p.amount * 0.4, 2)
                        ELSE p.amount END,
       'INR',
       CASE WHEN p.pay_mode = 'gym_collects' THEN 'gym_front_office'
            WHEN p.key IN ('karthik', 'divya', 'wasim', 'thanya') THEN 'cash'
            ELSE 'upi_intent' END,
       CASE WHEN p.pay_mode = 'gym_collects' THEN 'gym' ELSE 'trainer' END,
       'paid',
       CASE WHEN p.pay_mode = 'gym_collects' OR p.key IN ('karthik', 'divya', 'wasim', 'thanya')
            THEN NULL ELSE 'UPI' || upper(substr(md5(p.key), 1, 8)) END,
       (p.billed_on + 1)::timestamptz + INTERVAL '11 hours',
       CASE WHEN p.mode = 'remote' THEN 0
            ELSE round(CASE p.pay_state WHEN 'partial'  THEN p.amount * 0.5
                                        WHEN 'writeoff' THEN p.amount * 0.4
                                        ELSE p.amount END
                       * COALESCE(100 - p.split, 50) / 100, 2) END,
       CASE WHEN p.mode = 'remote' THEN 0 ELSE COALESCE(100 - p.split, 50) END,
       'TX-' || to_char(CURRENT_DATE, 'YYMM') || '-' || lpad((row_number() OVER (ORDER BY p.key))::text, 3, '0'),
       CASE p.pay_state WHEN 'partial'  THEN 'Half now, rest after salary day.'
                        WHEN 'writeoff' THEN 'Paid what he could. Left the rest.' END,
       (p.billed_on + 1)::timestamptz + INTERVAL '11 hours'
FROM demo_package p, seed_trainer t
WHERE p.pay_state IN ('paid', 'partial', 'writeoff')
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
SELECT md5(:'trainer_phone' || ':demo:pay:due:' || p.key)::uuid, t.id, p.client_id, p.id,
       p.amount, 'INR',
       CASE WHEN p.pay_mode = 'gym_collects' THEN 'gym_front_office' ELSE 'upi_intent' END,
       CASE WHEN p.pay_mode = 'gym_collects' THEN 'gym' ELSE 'trainer' END,
       CASE WHEN p.pay_state = 'overdue' THEN 'overdue' ELSE 'pending' END,
       -- Never before the pack was sold. The roster ages a bill from this date,
       -- and a client invited this morning with a bill three days old reads as a
       -- data error — which, for a client whose whole point is that they were
       -- invited this morning, it is.
       GREATEST(p.billed_on,
                CASE p.pay_state WHEN 'overdue' THEN CURRENT_DATE - 13
                                 ELSE CURRENT_DATE - 3 END)::timestamptz
FROM demo_package p, seed_trainer t
WHERE p.pay_state IN ('overdue', 'fresh')
ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount, status = EXCLUDED.status,
    created_at = EXCLUDED.created_at, deleted_at = NULL, updated_at = now();

-- Last month, settled by everybody — the month the strip can point at and say
-- nothing was left out.
INSERT INTO payment (id, trainer_id, client_id, package_id, amount, currency, method,
                     collected_by, status, upi_reference, paid_at,
                     gym_share_amount, share_percent, receipt_no, created_at)
SELECT md5(:'trainer_phone' || ':demo:pay:prev:' || p.key)::uuid, t.id, p.client_id,
       md5(:'trainer_phone' || ':demo:package:prev:' || p.key)::uuid, p.amount, 'INR',
       CASE WHEN p.pay_mode = 'gym_collects' THEN 'gym_front_office'
            WHEN p.key IN ('karthik', 'divya') THEN 'cash' ELSE 'upi_intent' END,
       CASE WHEN p.pay_mode = 'gym_collects' THEN 'gym' ELSE 'trainer' END,
       'paid',
       CASE WHEN p.pay_mode = 'gym_collects' OR p.key IN ('karthik', 'divya')
            THEN NULL ELSE 'UPI' || upper(substr(md5('prev' || p.key), 1, 8)) END,
       (date_trunc('month', CURRENT_DATE) - INTERVAL '4 days')::timestamptz,
       CASE WHEN p.mode = 'remote' THEN 0
            ELSE round(p.amount * COALESCE(100 - p.split, 50) / 100, 2) END,
       CASE WHEN p.mode = 'remote' THEN 0 ELSE COALESCE(100 - p.split, 50) END,
       'TX-' || to_char(date_trunc('month', CURRENT_DATE) - INTERVAL '1 month', 'YYMM')
             || '-' || lpad((row_number() OVER (ORDER BY p.key))::text, 3, '0'),
       (date_trunc('month', CURRENT_DATE) - INTERVAL '4 days')::timestamptz
FROM demo_package p
JOIN demo_client c ON c.key = p.key, seed_trainer t
WHERE c.joined > 45
ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount, method = EXCLUDED.method, status = EXCLUDED.status,
    paid_at = EXCLUDED.paid_at, gym_share_amount = EXCLUDED.gym_share_amount,
    share_percent = EXCLUDED.share_percent, receipt_no = EXCLUDED.receipt_no,
    deleted_at = NULL, updated_at = now();

-- What the gym is owed is written further down, after the sessions exist: a
-- settlement counts the sessions it covers, and computing it here would file
-- every month under nought sessions. That is exactly what the first version of
-- this file did, and the number looked plausible enough to miss.

-- ── The diary ───────────────────────────────────────────────────────────────
--
-- Generated from each client's own weekly pattern, from where their history
-- starts to two weeks out. Two weeks forward rather than one because the diary
-- has a week switcher and a week with nothing in it looks broken.
--
-- `dark_days` cuts a hole at the recent end. That is what makes a quiet client
-- genuinely quiet — no sessions, so no workouts, so nothing logged in sixteen
-- days — rather than one who merely looks it.

CREATE TEMP TABLE demo_session ON COMMIT DROP AS
WITH days AS (
    SELECT generate_series(CURRENT_DATE - 77, CURRENT_DATE + 14, INTERVAL '1 day')::date AS d
),
raw AS (
    SELECT sl.key, sl.client_id, sl.duration, sl.weekday, sl.template_day,
           ((d.d + sl.at_time::time) AT TIME ZONE :'tz') AS at,
           d.d AS on_date,
           -- Deterministic per client, date and time, so a re-run inside the same
           -- day lands on the same rows rather than doubling them.
           md5(:'trainer_phone' || ':demo:sess:' || sl.key || ':' || d.d || ':' || sl.at_time)::uuid AS id,
           row_number() OVER (PARTITION BY sl.key ORDER BY d.d, sl.at_time) AS n
    FROM days d
    JOIN demo_slot sl ON EXTRACT(ISODOW FROM d.d)::int = sl.weekday
    JOIN demo_client c ON c.key = sl.key
    -- The line that lets forty-four clients belong to one trainer. A client on
    -- the books but not on the diary keeps their slot on file and generates no
    -- sessions, so their slot can be one a booked client also holds — the two
    -- never meet on a real date. See the roster's note.
    WHERE sl.books
      AND d.d >= GREATEST(CURRENT_DATE - c.hist_weeks * 7, CURRENT_DATE - c.joined)
      -- The silence. Nothing is generated inside it, in either direction: a
      -- paused client has no future bookings either.
      AND (c.dark_days = 0 OR d.d < CURRENT_DATE - c.dark_days)
)
SELECT r.*,
       CASE WHEN r.at > now() THEN 'scheduled' ELSE 'done' END AS status
FROM raw r;

-- The awkward cases, chosen AFTER generation by position in each client's own
-- history rather than by a date offset. "Divya four days ago" silently matches
-- nothing in a week where the fourth day back is not one of Divya's training
-- days, which is most weeks — and a no-show rate of 0.0% makes every adherence
-- strip come out all-green.
CREATE TEMP TABLE demo_exception ON COMMIT DROP AS
WITH past AS (
    SELECT key, id, row_number() OVER (PARTITION BY key ORDER BY at DESC) AS nth
    FROM demo_session WHERE status = 'done'
)
SELECT p.id, x.status
FROM past p
JOIN (VALUES
        -- No-shows. They cost the trainer the hour and the pack still moves,
        -- which is the rule the money side turns on.
        ('ishaan', 2, 'no_show'), ('ishaan', 7, 'no_show'),
        ('farhan', 3, 'no_show'), ('chandran', 5, 'no_show'),
        ('omar', 2, 'no_show'), ('quadir', 4, 'no_show'),
        ('harish', 9, 'no_show'), ('mohan', 12, 'no_show'),
        -- Cancellations. The client called; that is the behaviour to encourage,
        -- and it must not score as a miss anywhere.
        ('bhavana', 3, 'cancelled'), ('sneha', 4, 'cancelled'),
        ('usha', 2, 'cancelled'), ('rekha', 6, 'cancelled'),
        ('arjun', 8, 'cancelled'), ('varun', 3, 'cancelled')
     ) AS x(key, nth, status) ON x.key = p.key AND x.nth = p.nth;

UPDATE demo_session ss SET status = e.status FROM demo_exception e WHERE e.id = ss.id;

INSERT INTO scheduled_session (id, trainer_id, client_id, program_id, scheduled_at,
                               duration_minutes, status, notes, day_label, template_day,
                               delivery_mode, series_id, cancelled_by,
                               pack_delta, pack_package_id, pack_applied_at, created_at)
SELECT ss.id, t.id, ss.client_id, pr.id, ss.at, ss.duration, ss.status,
       CASE WHEN ss.status = 'no_show' THEN 'Didn''t turn up, no message.' END,
       -- The template's own name for THAT day, not the program's. A session
       -- labelled "Push A" while the plan for that day says "Pull A" is the kind
       -- of thing the workout log puts side by side and makes obvious.
       -- The template's own name for that ORDINAL day. `day_labels` is keyed by
       -- slot, which is why this reads `template_day` from the slot table.
       COALESCE(tpl.day_labels->>ss.template_day::text, pr.name),
       -- ...whereas the COLUMN called `template_day` holds the WEEKDAY. The name
       -- predates V24; what reads it is `seedLogFromPlan`, which hands it to
       -- `fetchProgramExercisesForDay` to match `program_exercise.day_of_week` —
       -- and that carries the concrete weekday after the translation above.
       ss.weekday,
       -- Per-session mode. Null means "inherit the client's", which is the
       -- overwhelming majority; one override is set further down.
       NULL,
       -- Every weekly slot is a recurring series, which is how it was booked.
       md5(:'trainer_phone' || ':demo:series:' || ss.key || ':' || ss.weekday)::uuid,
       CASE WHEN ss.status = 'cancelled'
            THEN CASE WHEN ss.n % 3 = 0 THEN 'trainer' ELSE 'client' END END,
       -- The pack moves on done or no-show, never on booked. Stamped so the
       -- 24-hour undo has something exact to reverse.
       --
       -- And only for the last four weeks: the sessions before that are history
       -- under packs the client has since used up and replaced, which is how a
       -- real book looks and what stops a ten-week history inflating today's
       -- pack to sixty sessions.
       CASE WHEN ss.status IN ('done', 'no_show') AND ss.at >= (CURRENT_DATE - 28)::timestamptz THEN -1 END,
       CASE WHEN ss.status IN ('done', 'no_show') AND ss.at >= (CURRENT_DATE - 28)::timestamptz THEN pk.id END,
       CASE WHEN ss.status IN ('done', 'no_show') AND ss.at >= (CURRENT_DATE - 28)::timestamptz THEN ss.at + INTERVAL '1 hour' END,
       ss.at - INTERVAL '20 days'
FROM demo_session ss
JOIN demo_client c   ON c.key = ss.key
JOIN demo_program pr ON pr.key = ss.key
LEFT JOIN template tpl ON tpl.id = pr.template_id
LEFT JOIN demo_package pk ON pk.key = ss.key, seed_trainer t
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
-- The invariant this file used to break, checked against the rows that were
-- actually written rather than against the arithmetic that produced them. Two
-- sessions clash when each starts before the other has finished; a shared start
-- time is only the most obvious case, and a 90-minute session laid over a
-- 75-minute pitch would slip past a start-time check untouched.
--
-- A clash between two of this seed's own clients is a bug in this file and
-- aborts the run. A clash with a client somebody added by hand is their diary
-- and their call, so it warns — but it still says so.
DO $$
DECLARE mine text; theirs text; n_mine bigint; n_theirs bigint;
BEGIN
    CREATE TEMP TABLE demo_clash ON COMMIT DROP AS
    SELECT ca.name AS a_name, cb.name AS b_name,
           (a.scheduled_at AT TIME ZONE current_setting('TimeZone')) AS at,
           (ca.metadata->>'seed' = 'demo' AND cb.metadata->>'seed' = 'demo') AS both_ours
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
      AND (ca.metadata->>'seed' = 'demo' OR cb.metadata->>'seed' = 'demo');

    -- The first few and a count. One mistake in the timetable repeats every week
    -- for twelve weeks, and an error listing three hundred identical pairs
    -- buries the one fact you need: which two people.
    SELECT count(*), string_agg(line, E'\n           ' ORDER BY line) INTO n_mine, mine
    FROM (SELECT format('%s and %s at %s', a_name, b_name, to_char(at, 'Dy DD Mon HH24:MI')) AS line
          FROM demo_clash WHERE both_ours ORDER BY at LIMIT 5) f;
    IF n_mine > 0 THEN
        RAISE EXCEPTION E'Two clients booked at the same time (% clashes in all):\n           %',
              (SELECT count(*) FROM demo_clash WHERE both_ours), mine;
    END IF;

    SELECT count(*), string_agg(line, E'\n           ' ORDER BY line) INTO n_theirs, theirs
    FROM (SELECT format('%s and %s at %s', a_name, b_name, to_char(at, 'Dy DD Mon HH24:MI')) AS line
          FROM demo_clash WHERE NOT both_ours ORDER BY at LIMIT 5) f;
    IF n_theirs > 0 THEN
        RAISE WARNING E'A seeded session overlaps a client you added by hand (% in all):\n           %',
              (SELECT count(*) FROM demo_clash WHERE NOT both_ours), theirs;
    END IF;
END $$;

-- A client with a plan and no sessions at all is always a mistake in the roster
-- above, and it is a quiet one: their file opens, their pack has a balance and
-- the diary simply never mentions them. It happens when `dark_days` outruns
-- `joined` — the silence starts before they arrived, so the window closes on
-- itself and generates nothing. Three rows had it, and nothing said so.
DO $$
DECLARE missing text;
BEGIN
    SELECT string_agg(c.key, ', ' ORDER BY c.key) INTO missing
    FROM demo_client c
    WHERE c.tpl IS NOT NULL AND c.books
      AND NOT EXISTS (SELECT 1 FROM demo_session s WHERE s.key = c.key);
    IF missing IS NOT NULL THEN
        RAISE WARNING 'Clients with a plan but no sessions (dark_days outran joined?): %', missing;
    END IF;
END $$;

-- A floor client's check-in call. The one case the delivery chips on the home
-- screen exist for: the session is remote even though the client is not.
UPDATE scheduled_session SET delivery_mode = 'remote', updated_at = now()
WHERE id = (
    SELECT ss.id FROM demo_session ss
    JOIN demo_client c ON c.key = ss.key
    WHERE c.key = 'chandran' AND ss.at > now()
    ORDER BY ss.at LIMIT 1
);

-- A session the trainer moved, and one the client has confirmed. Both are
-- annotations on an ordinary booking rather than statuses of their own: a
-- confirmed session is still `scheduled`, and the four statuses stay four.
UPDATE scheduled_session
SET moved_from_at = scheduled_at - INTERVAL '2 hours', updated_at = now()
WHERE id IN (
    SELECT ss.id FROM demo_session ss
    WHERE ss.key IN ('bhavana', 'varun') AND ss.at > now()
    ORDER BY ss.at LIMIT 2
);

UPDATE scheduled_session
SET client_confirmed_at = now() - INTERVAL '19 hours', updated_at = now()
WHERE id IN (
    SELECT ss.id FROM demo_session ss
    WHERE ss.key IN ('ananya', 'rekha', 'gayathri') AND ss.at > now()
    ORDER BY ss.at LIMIT 3
);

-- One session in the recent past is deliberately left open — never closed off,
-- so its pack never moved. That is the money problem the home screen's banner
-- counts, and it is chosen after generation for the same reason the exceptions
-- are: a rule like "yesterday's Karthik session" quietly matches nothing in a
-- week where Karthik does not train yesterday.
UPDATE scheduled_session
SET status = 'scheduled', pack_delta = NULL, pack_package_id = NULL, pack_applied_at = NULL,
    updated_at = now()
WHERE id IN (
    SELECT ss.id
    FROM scheduled_session ss
    JOIN client c ON c.id = ss.client_id
    WHERE c.metadata->>'seed' = 'demo'
      AND ss.scheduled_at < now() - INTERVAL '20 hours'
      AND ss.status = 'done'
      AND ss.deleted_at IS NULL
    ORDER BY ss.scheduled_at DESC
    LIMIT 2
);

-- ── What actually got logged ────────────────────────────────────────────────
--
-- A workout for every session that was kept. Read back from `scheduled_session`
-- rather than from the temp table, because the rows flipped open above are still
-- 'done' there — and giving one of them a logged workout would make the home
-- screen read it as a session that has been running for nine hours rather than
-- one nobody closed off.

INSERT INTO workout_session (id, trainer_id, client_id, program_id, scheduled_session_id,
                             logged_by, session_date, notes, ended_at, created_at)
SELECT md5(:'trainer_phone' || ':demo:wo:' || ss.id)::uuid, t.id, ss.client_id, pr.id, ss.id,
       -- Remote clients log their own; on the floor the trainer holds the phone.
       CASE WHEN c.mode = 'remote' AND ss.n % 2 = 0 THEN 'client' ELSE 'trainer' END,
       ss.on_date,
       CASE WHEN ss.n % 11 = 0 THEN 'Shoulder felt tight on the second set. Dropped the load.' END,
       ss.at + (ss.duration || ' minutes')::interval,
       ss.at + INTERVAL '5 minutes'
FROM demo_session ss
JOIN scheduled_session real ON real.id = ss.id AND real.status = 'done'
JOIN demo_client c   ON c.key = ss.key
JOIN demo_program pr ON pr.key = ss.key, seed_trainer t
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

CREATE TEMP TABLE demo_logged ON COMMIT DROP AS
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
FROM demo_session ss
JOIN workout_session w ON w.id = md5(:'trainer_phone' || ':demo:wo:' || ss.id)::uuid
                      AND w.deleted_at IS NULL
JOIN demo_program pr ON pr.key = ss.key
JOIN program_exercise pe ON pe.program_id = pr.id
                        AND pe.day_of_week = ss.weekday
                        AND pe.deleted_at IS NULL
                        AND COALESCE(pe.week, 1) = LEAST(
                              GREATEST(1, 1 + ((ss.on_date - pr.start_date) / 7)),
                              pr.authored);

INSERT INTO workout_exercise (id, workout_session_id, exercise_id, order_index, source,
                              target_sets, target_reps, rest_seconds, created_at)
SELECT md5(:'trainer_phone' || ':demo:woex:' || l.workout_id || ':' || l.exercise_id)::uuid,
       l.workout_id, l.exercise_id, l.order_index, 'planned',
       l.target_sets, l.target_reps, l.rest_seconds, l.at + INTERVAL '5 minutes'
FROM demo_logged l
ON CONFLICT (id) DO UPDATE SET
    order_index = EXCLUDED.order_index, source = EXCLUDED.source,
    target_sets = EXCLUDED.target_sets, target_reps = EXCLUDED.target_reps,
    rest_seconds = EXCLUDED.rest_seconds, deleted_at = NULL, updated_at = now();

-- The three things that make a log a log rather than a checklist. Each is
-- applied to one client's most recent workout, chosen by position so it always
-- lands on a real one.
CREATE TEMP TABLE demo_recent ON COMMIT DROP AS
SELECT key, workout_id, at,
       row_number() OVER (PARTITION BY key ORDER BY at DESC) AS nth
FROM (SELECT DISTINCT key, workout_id, at FROM demo_logged) d;

-- 1 · A swap. The rack was busy, so the bench press became a dumbbell press.
--     The exercise was not skipped, and that distinction is the single most
--     important thing this table records: adherence reads the swap, never the
--     absence of the original.
--
--     Chosen as "their most recent session that HAD a bench press in it" rather
--     than "their most recent session". The first version did the latter and
--     silently swapped nothing: a Push / Pull / Legs client's latest workout is
--     as likely to be legs as it is to be push, and a swap that lands on no rows
--     leaves the whole off-plan section of the log undrawn.
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
    FROM demo_logged l
    JOIN workout_exercise we2 ON we2.workout_session_id = l.workout_id AND we2.deleted_at IS NULL
    JOIN exercise e2 ON e2.id = we2.exercise_id
    WHERE l.key IN ('ananya', 'harish', 'chandran')
      -- V21's name for it. The old dataset's "Barbell Bench Press - Medium Grip"
      -- matched nothing after the swap, which meant the `to_id` subquery was
      -- also dead and no row was ever swapped — the one thing this block exists
      -- to demonstrate.
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
SELECT md5(:'trainer_phone' || ':demo:woex:extra:' || r.workout_id)::uuid,
       r.workout_id, e.id, 90, 'unplanned', 3, 12, 60, r.at + INTERVAL '35 minutes'
FROM demo_recent r
-- The V21 library has no "Face Pull"; this is its nearest equivalent and it is
-- a real row. A name that matches nothing turns this INSERT into a no-op, and
-- an unplanned-exercise demo with no unplanned exercise in it says nothing.
JOIN exercise e ON lower(e.name) = 'cable rear delt row (with rope)' AND e.deleted_at IS NULL
WHERE r.key IN ('arjun', 'mohan', 'nithya') AND r.nth = 1
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
    FROM demo_recent r
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

INSERT INTO set_log (id, workout_session_id, exercise_id, set_number, load_kg, reps, rpe,
                     notes, created_at)
SELECT md5(:'trainer_phone' || ':demo:set:' || we.id || ':' || g.set_no)::uuid,
       we.workout_session_id, we.exercise_id, g.set_no,
       CASE WHEN base.load IS NULL THEN NULL
            ELSE (base.load + l.n * 1.25 + (g.set_no - 1) * 2.5)::numeric(6,2) END,
       CASE WHEN base.load IS NULL
            THEN CASE g.set_no WHEN 1 THEN 15 WHEN 2 THEN 12 ELSE 10 END
            ELSE CASE g.set_no WHEN 1 THEN 10 WHEN 2 THEN 8  ELSE 6  END END,
       (6.5 + g.set_no * 0.5)::numeric(3,1),
       CASE WHEN g.set_no = 3 AND l.n % 17 = 0 THEN 'Last rep was a grind.' END,
       l.at + (30 + g.set_no * 4 || ' minutes')::interval
FROM workout_exercise we
JOIN (SELECT DISTINCT workout_id, key, n, at FROM demo_logged) l ON l.workout_id = we.workout_session_id
JOIN exercise e ON e.id = we.exercise_id
CROSS JOIN LATERAL (
    -- These are V21's equipment strings, which are the upstream dataset's own.
    -- Three of them used to be the old library's — 'e-z curl bar', 'machine' and
    -- 'kettlebells' — and a CASE arm that matches nothing falls through to NULL,
    -- so every machine lift in the seed logged as a bodyweight one. Smith leg
    -- press is on two of the templates above, which made it visible: reps and no
    -- weight, on a leg press.
    SELECT CASE lower(COALESCE(e.equipment, ''))
                WHEN 'barbell'          THEN 40
                WHEN 'ez barbell'       THEN 20
                WHEN 'dumbbell'         THEN 14
                WHEN 'leverage machine' THEN 35
                WHEN 'smith machine'    THEN 30
                -- The trainer's own sled. It is `weight_reps`, so it needs an
                -- arm here or it logs as a bodyweight movement — which is the
                -- bug 'other' used to cause from the other direction.
                WHEN 'sled machine'     THEN 60
                WHEN 'cable'            THEN 25
                WHEN 'kettlebell'       THEN 16
                WHEN 'medicine ball'    THEN 6
                -- Bodyweight and the odds and ends. No load, so the set row asks
                -- for reps only — which is also what `log_type = 'reps'` means on
                -- the trainer's own exercises.
                ELSE NULL END::numeric AS load
) AS base
CROSS JOIN (VALUES (1), (2), (3)) AS g(set_no)
WHERE we.deleted_at IS NULL AND we.removed_at IS NULL
ON CONFLICT (id) DO UPDATE SET
    load_kg = EXCLUDED.load_kg, reps = EXCLUDED.reps, rpe = EXCLUDED.rpe,
    notes = EXCLUDED.notes, deleted_at = NULL, updated_at = now();

-- A session running right now. The home screen's in-progress hero: the log is
-- open, two exercises are done and the third has not been touched. `ended_at` is
-- null because the log is not closed — a different fact from whether the session
-- counted against a pack, which the booking already carries.
UPDATE workout_session SET ended_at = NULL, updated_at = now()
WHERE id IN (
    SELECT w.id FROM workout_session w
    JOIN client c ON c.id = w.client_id
    WHERE c.metadata->>'seed' = 'demo' AND w.deleted_at IS NULL
      AND w.session_date = CURRENT_DATE
      AND w.created_at < now()
    ORDER BY w.created_at DESC
    LIMIT 1
);

DELETE FROM set_log
WHERE workout_session_id IN (
    SELECT w.id FROM workout_session w
    JOIN client c ON c.id = w.client_id
    WHERE c.metadata->>'seed' = 'demo' AND w.deleted_at IS NULL AND w.ended_at IS NULL
      AND w.session_date = CURRENT_DATE
)
AND exercise_id IN (
    -- The last exercise of the open log, untouched. Everything before it stands.
    SELECT we.exercise_id FROM workout_exercise we
    JOIN workout_session w ON w.id = we.workout_session_id
    JOIN client c ON c.id = w.client_id
    WHERE c.metadata->>'seed' = 'demo' AND w.ended_at IS NULL AND w.deleted_at IS NULL
      AND w.session_date = CURRENT_DATE
    ORDER BY we.order_index DESC
    LIMIT 1
);

-- ── Bodyweight and tape ─────────────────────────────────────────────────────
--
-- Weekly, and trending the way each client's goal says it should. Waist and
-- chest on a handful, because the metric picker with one option in it never
-- shows what it is for.

INSERT INTO body_metric (id, client_id, metric_type, value, unit, notes, recorded_at, created_at)
SELECT md5(:'trainer_phone' || ':demo:bm:' || c.key || ':' || m.kind || ':' || w)::uuid,
       c.id, m.kind,
       (m.base + m.drift * w)::numeric(8,2), m.unit,
       CASE WHEN w = 0 THEN 'First measurement.' END,
       (CURRENT_DATE - LEAST(c.hist_weeks, 8) * 7 + w * 7)::timestamptz,
       (CURRENT_DATE - LEAST(c.hist_weeks, 8) * 7 + w * 7)::timestamptz
FROM demo_client c
CROSS JOIN LATERAL (VALUES
        ('weight', 'kg',
         (52 + (abs(hashtext(c.key)) % 35))::numeric,
         CASE c.goal WHEN 'Muscle gain' THEN 0.4 WHEN 'Powerlifting' THEN 0.3 ELSE -0.35 END::numeric),
        ('waist', 'cm',
         (72 + (abs(hashtext(c.key)) % 22))::numeric,
         CASE c.goal WHEN 'Fat loss' THEN -0.5 ELSE -0.1 END::numeric),
        ('chest', 'cm',
         (86 + (abs(hashtext(c.key)) % 18))::numeric,
         CASE c.goal WHEN 'Muscle gain' THEN 0.3 ELSE 0.0 END::numeric)
     ) AS m(kind, unit, base, drift)
CROSS JOIN generate_series(0, LEAST(c.hist_weeks, 8)) AS w
-- Everybody gets weighed. The tape comes out for the clients whose goal is about
-- shape rather than about load.
WHERE m.kind = 'weight'
   OR (m.kind = 'waist' AND c.goal IN ('Fat loss', 'Post-natal'))
   OR (m.kind = 'chest' AND c.goal IN ('Muscle gain', 'Powerlifting'))
ON CONFLICT (id) DO UPDATE SET
    value = EXCLUDED.value, unit = EXCLUDED.unit,
    deleted_at = NULL, updated_at = now();

-- ── Make the packs tell the truth ───────────────────────────────────────────
--
-- Rather than typing a plausible number: remaining is the target from the roster
-- above, and the total is that plus every session that actually consumed one. So
-- the roster chip, the diary and the pack detail all agree by construction.
--
-- Monthly packs have no session count at all, which is what `sessions_total IS
-- NULL` means and why they are left alone.

UPDATE package p
SET sessions_total     = COALESCE(spent.n, 0) + dp.remaining,
    sessions_remaining = dp.remaining,
    updated_at         = now()
FROM demo_package dp
LEFT JOIN (
    SELECT pack_package_id AS pid, count(*) AS n
    FROM scheduled_session
    WHERE pack_delta = -1 AND pack_package_id IS NOT NULL AND deleted_at IS NULL
    GROUP BY pack_package_id
) spent ON spent.pid = dp.id
WHERE p.id = dp.id AND dp.remaining IS NOT NULL AND p.sessions_total IS NOT NULL;

-- ── What the gym is owed ────────────────────────────────────────────────────
--
-- Last month's share handed over on the 1st; this month's still building. Both
-- are the trainer's own figures — XRep never talks to the gym's system, and a
-- settlement here is a record of what was agreed, not a transaction.
--
-- Written here, at the end, rather than beside the payments it is derived from:
-- `sessions_counted` counts the sessions the month covered, and those did not
-- exist until a few hundred lines ago.

INSERT INTO gym_settlement (id, trainer_id, period, amount, sessions_counted, gym_name,
                            status, due_at, settled_at, created_at)
SELECT md5(:'trainer_phone' || ':demo:settle:' || s.slug)::uuid, t.id, s.period, s.amount,
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
-- The one table in the product whose rows are not derived on read. Everything
-- else is computed so that correcting a set from November fixes every number
-- that depended on it; this is stored for the opposite reason — it was sent, and
-- a report whose figures move after both people have read it is not a report.
--
-- Which is why the figures here are COMPUTED from the sessions and sets above,
-- using the same aggregation `WeeklyReportWriter` runs, rather than typed. A
-- demo where the report disagrees with the log it came from is worse than no
-- demo at all.

INSERT INTO weekly_report (id, trainer_id, client_id, week_start, week_end,
                           sessions_kept, sessions_planned, trained_days, volume_kg, sets_done,
                           new_bests, best_line, best_previous, sent_at, created_at)
SELECT md5(:'trainer_phone' || ':demo:wr:' || c.key || ':' || w.ws)::uuid,
       t.id, c.id, w.ws, w.ws + 6,
       s.kept, s.planned, NULLIF(d.days, ''), v.volume, v.sets,
       b.n, b.line, b.previous,
       (w.ws + 7)::timestamptz + INTERVAL '20 hours',
       (w.ws + 7)::timestamptz + INTERVAL '20 hours'
FROM demo_client c
CROSS JOIN LATERAL (
    SELECT (date_trunc('week', CURRENT_DATE)::date - k * 7) AS ws
    FROM generate_series(1, 4) AS k
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
-- them, and DO NOTHING leaves every one of them deleted. The first version of
-- this file copied the writer's clause and the second run came back with no
-- reports at all and no error.
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
-- Kavya has no phone, so she gets no delivery row at all, and the report screen
-- says "No number" rather than "Queued" — which is the difference between a
-- state that will resolve itself and one that needs somebody to do something.

INSERT INTO nudge_log (id, trainer_id, client_id, channel, template_name, status, sent_at, created_at)
SELECT md5(:'trainer_phone' || ':demo:nudge:wr:' || c.key || ':' || wr.week_start)::uuid,
       t.id, c.id, 'whatsapp', 'weekly_report',
       CASE WHEN c.key = 'priya' AND wr.week_start = date_trunc('week', CURRENT_DATE)::date - 7
                 THEN 'failed'
            WHEN wr.week_start = date_trunc('week', CURRENT_DATE)::date - 7
                 THEN 'queued'
            ELSE 'sent' END,
       wr.sent_at, wr.sent_at
FROM weekly_report wr
JOIN demo_client c ON c.id = wr.client_id, seed_trainer t
WHERE wr.deleted_at IS NULL AND c.phone IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status, sent_at = EXCLUDED.sent_at,
    deleted_at = NULL, updated_at = now();

-- The rest of the message history, one per kind, so the Nudges screen's recent
-- list has something in it and the per-rule counters this month are not zero.
INSERT INTO nudge_log (id, trainer_id, client_id, channel, template_name, status, sent_at, created_at)
SELECT md5(:'trainer_phone' || ':demo:nudge:' || n.key || ':' || n.template)::uuid,
       t.id, c.id, n.channel, n.template, n.status,
       (CURRENT_DATE - n.days_ago)::timestamptz + INTERVAL '10 hours',
       (CURRENT_DATE - n.days_ago)::timestamptz + INTERVAL '10 hours'
FROM (VALUES
        ('chandran', 'payment_overdue', 'whatsapp', 'sent',   3),
        ('farhan',   'payment_overdue', 'whatsapp', 'sent',   2),
        ('ganesh',   'payment_due',     'whatsapp', 'sent',   5),
        ('harish',   'payment_reminder','whatsapp', 'sent',   6),
        ('karthik',  'quiet_check_in',  'whatsapp', 'sent',   2),
        ('elakiya',  'quiet_check_in',  'whatsapp', 'failed', 1),
        ('divya',    'pack_low',        'whatsapp', 'sent',   4),
        ('yusuf',    'pack_low',        'whatsapp', 'sent',   3),
        ('ishaan',   'pack_low',        'whatsapp', 'sent',   8),
        ('ananya',   'well_done',       'push',     'sent',   6),
        ('rekha',    'well_done',       'push',     'sent',   9),
        ('vikram',   'well_done',       'push',     'sent',  11),
        ('hema',     'invite',          'whatsapp', 'sent',   6),
        ('irfan',    'invite',          'whatsapp', 'queued', 0)
     ) AS n(key, template, channel, status, days_ago)
JOIN demo_client c ON c.key = n.key, seed_trainer t
WHERE c.phone IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status, sent_at = EXCLUDED.sent_at,
    deleted_at = NULL, updated_at = now();

COMMIT;

-- ── What landed ─────────────────────────────────────────────────────────────
--
-- Counted rather than claimed. Several of these numbers going to zero is the
-- only warning you get that a library rename or a schema change broke something
-- quietly: a template whose exercises stopped resolving still draws, a program
-- with no rows still opens, and both look like an app bug from the outside.

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
    WHERE c.metadata->>'seed' = 'demo' AND s.deleted_at IS NULL
      AND (s.scheduled_at AT TIME ZONE :'tz')::date
          BETWEEN date_trunc('week', CURRENT_DATE)::date
              AND date_trunc('week', CURRENT_DATE)::date + 6
) ss
GROUP BY ss.slot
ORDER BY min(ss.start_min);

\echo ''
\echo 'Seeded:'
WITH mine AS (
    SELECT c.id FROM client c JOIN trainer t ON t.id = c.trainer_id
    WHERE t.phone = :'trainer_phone' AND c.metadata->>'seed' = 'demo' AND c.deleted_at IS NULL
),
me AS (SELECT id FROM trainer WHERE phone = :'trainer_phone' AND deleted_at IS NULL)
SELECT 'clients' AS what, (SELECT count(*) FROM mine) AS count
UNION ALL SELECT '  · needing attention', count(*) FROM client c WHERE c.id IN (SELECT id FROM mine)
      AND (c.status IN ('paused', 'inactive', 'invited') OR c.membership_status = 'unavailable')
UNION ALL SELECT '  · on the diary', count(DISTINCT client_id) FROM scheduled_session
    WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL
      AND scheduled_at > now() - INTERVAL '14 days'
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
UNION ALL SELECT 'body measurements', count(*) FROM body_metric
    WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL
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
UNION ALL SELECT '  · written off', count(*) FROM package
    WHERE client_id IN (SELECT id FROM mine) AND deleted_at IS NULL AND written_off_at IS NOT NULL
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
