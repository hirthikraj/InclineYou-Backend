-- Content for a trainer's programs. See seed-program-data.sh.
--
-- An exercise is [name, sets, effort, rest seconds, load kind, load value, effort kind, alternative],
-- in a day's list order. Load kinds 'weight' and 'percent_1rm' progress week by week in a plan;
-- 'bodyweight' has no load and 'max_reps' no effort value, as workout_set requires. A name that is
-- not in the library aborts the run.

\set ON_ERROR_STOP on
BEGIN;

-- One movement, by name. Loud when it is missing: a typo must not seed a hole.
CREATE FUNCTION pg_temp.ex(p_name text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
    SELECT id INTO v FROM exercise WHERE origin = 'inclineyou' AND name = p_name ORDER BY id LIMIT 1;
    IF v IS NULL THEN RAISE EXCEPTION 'exercise not in the library: %', p_name; END IF;
    RETURN v;
END $$;

-- Sets for one exercise row.
CREATE FUNCTION pg_temp.sets(p_row uuid, p_n int, p_effort numeric, p_rest int, p_lk text, p_lv numeric, p_ek text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO workout_set (workout_exercise_id, position, load_kind, load_value, effort_kind, effort_value, rest_seconds)
    SELECT p_row, s, p_lk, CASE WHEN p_lk = 'bodyweight' THEN NULL ELSE p_lv END, p_ek,
           CASE WHEN p_ek LIKE 'max\_%' THEN NULL ELSE p_effort END, p_rest
    FROM generate_series(1, p_n) s;
END $$;

-- Fill one workout. p_week > 1 applies the progression; p_dividers = {"position": "label"}.
CREATE FUNCTION pg_temp.fill(p_workout uuid, p_list jsonb, p_week int, p_step numeric, p_dividers jsonb)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    e jsonb; v_pos int := 0; v_row uuid; v_alt uuid;
    v_sets int; v_lv numeric; v_lk text; v_ek text;
BEGIN
    FOR e IN SELECT * FROM jsonb_array_elements(p_list) LOOP
        v_lk := e->>4; v_ek := coalesce(e->>6, 'reps');
        v_sets := (e->>1)::int + CASE WHEN p_week > 1 THEN least(2, (p_week - 1) / 3) ELSE 0 END;
        v_lv := CASE v_lk
                  WHEN 'weight'      THEN (e->>5)::numeric + ((p_week - 1) / 2) * p_step
                  WHEN 'percent_1rm' THEN least(90, (e->>5)::numeric + (p_week - 1) * 2.5)
                  ELSE (e->>5)::numeric END;
        INSERT INTO workout_exercise (workout_id, exercise_id, position, section)
        VALUES (p_workout, pg_temp.ex(e->>0), v_pos, p_dividers->>(v_pos::text)) RETURNING id INTO v_row;
        PERFORM pg_temp.sets(v_row, v_sets, (e->>2)::numeric, (e->>3)::int, v_lk, v_lv, v_ek);
        IF e->>7 IS NOT NULL THEN
            INSERT INTO workout_exercise (workout_id, exercise_id, position, alternative_of)
            VALUES (p_workout, pg_temp.ex(e->>7), 1, v_row) RETURNING id INTO v_alt;
            PERFORM pg_temp.sets(v_alt, v_sets, (e->>2)::numeric, (e->>3)::int, v_lk, v_lv, v_ek);
        END IF;
        v_pos := v_pos + 1;
    END LOOP;
END $$;

-- The six programs' content: name -> {goal, step, days: [A, B, C]}.
CREATE TEMP TABLE spec (name text PRIMARY KEY, goal text, step numeric, weeks int, summary text, days jsonb);
INSERT INTO spec VALUES
('Strength base', 'strength', 2.5, 8, 'Heavy compound lifts three days a week, loaded by percent of 1RM.', '[
  ["Full Body A", [["Barbell full squat",5,5,180,"percent_1rm",70,"reps","Dumbbell goblet squat"],["Barbell bench press",5,5,180,"percent_1rm",70,"reps",null],["Barbell bent over row",4,6,120,"weight",40,"reps",null],["Front plank with twist",3,30,60,"bodyweight",null,"time",null]]],
  ["Full Body B", [["Barbell deadlift",4,5,180,"percent_1rm",70,"reps",null],["Dumbbell seated shoulder press",4,8,90,"weight",12,"reps",null],["Pull-up",4,null,120,"bodyweight",null,"max_reps",null],["Hanging leg raise",3,10,60,"bodyweight",null,"reps",null]]],
  ["Full Body C", [["Barbell full squat",3,8,150,"percent_1rm",60,"reps",null],["Barbell incline bench press",4,6,120,"weight",40,"reps",null],["Cable seated row",4,8,90,"weight",35,"reps",null],["Dumbbell romanian deadlift",3,8,90,"weight",16,"reps",null]]]
]'::jsonb),
('Hypertrophy block', 'muscle_gain', 2.5, 12, 'Push, pull and legs at 8–12 reps, built on volume.', '[
  ["Push", [["Barbell bench press",4,10,90,"weight",50,"rep_interval","Dumbbell bench press"],["Dumbbell incline bench press",3,10,90,"weight",18,"rep_interval",null],["Dumbbell seated shoulder press",3,10,90,"weight",14,"rep_interval",null],["Dumbbell lateral raise",3,15,60,"weight",6,"reps",null],["Cable triceps pushdown (v-bar)",3,12,60,"weight",25,"rep_interval",null]]],
  ["Pull", [["Cable lat pulldown full range of motion",4,10,90,"weight",45,"rep_interval","Pull-up"],["Barbell bent over row",4,10,90,"weight",45,"rep_interval",null],["Cable seated row",3,12,75,"weight",40,"rep_interval",null],["Dumbbell biceps curl",3,12,60,"weight",10,"rep_interval",null],["Hyperextension",3,15,60,"bodyweight",null,"reps",null]]],
  ["Legs", [["Barbell full squat",4,10,120,"weight",60,"rep_interval","Dumbbell goblet squat"],["Dumbbell romanian deadlift",3,10,90,"weight",20,"rep_interval",null],["Dumbbell lunge",3,12,75,"weight",12,"reps",null],["Dumbbell standing calf raise",4,15,45,"weight",16,"reps",null],["Reverse crunch",3,15,45,"bodyweight",null,"reps",null]]]
]'::jsonb),
('Fat loss phase 1', 'weight_loss', 1, 8, 'Short-rest circuits: full body, raised heart rate, no long waits.', '[
  ["Circuit A", [["Burpee",4,10,45,"bodyweight",null,"reps",null],["Dumbbell goblet squat",4,15,45,"weight",8,"reps",null],["Push-up",4,12,45,"bodyweight",null,"reps",null],["Mountain climber",4,40,30,"bodyweight",null,"time",null],["Jump rope",3,60,30,"bodyweight",null,"time",null]]],
  ["Circuit B", [["Walking lunge",4,12,45,"bodyweight",null,"reps",null],["Dumbbell bent over row",4,12,45,"weight",8,"reps",null],["Glute bridge march",4,16,30,"bodyweight",null,"reps",null],["Russian twist",3,20,30,"bodyweight",null,"reps",null],["Stationary bike walk",1,600,0,"bodyweight",null,"time",null]]],
  ["Circuit C", [["Dumbbell seated shoulder press",3,12,45,"weight",6,"reps",null],["Triceps dip",3,12,45,"bodyweight",null,"reps",null],["Walking high knees lunge",3,16,45,"bodyweight",null,"reps",null],["Crunch floor",3,20,30,"bodyweight",null,"reps",null],["Walking on incline treadmill",1,900,0,"bodyweight",null,"time",null]]]
]'::jsonb),
('Gym starter', 'general', 2.5, 6, 'Three easy full-body days on basic machines and dumbbells.', '[
  ["Full Body A", [["Dumbbell goblet squat",3,10,90,"weight",8,"reps",null],["Machine inner chest press",3,10,90,"weight",25,"reps",null],["Cable seated row",3,10,90,"weight",25,"reps",null],["Dead bug",3,10,45,"bodyweight",null,"reps",null]]],
  ["Full Body B", [["Barbell glute bridge",3,12,90,"weight",30,"reps",null],["Cable lat pulldown full range of motion",3,10,90,"weight",30,"reps",null],["Dumbbell seated shoulder press",3,10,90,"weight",6,"reps",null],["Front plank with twist",3,20,45,"bodyweight",null,"time",null]]],
  ["Full Body C", [["Walking lunge",3,10,60,"bodyweight",null,"reps",null],["Push-up",3,8,60,"bodyweight",null,"reps",null],["Dumbbell bent over row",3,10,60,"weight",8,"reps",null],["Crunch floor",3,15,45,"bodyweight",null,"reps",null]]]
]'::jsonb),
('Home strength', 'strength', 2, 8, 'Dumbbells and bodyweight only: strength work for a living room.', '[
  ["Full Body A", [["Dumbbell goblet squat",4,8,120,"weight",16,"reps",null],["Push-up",4,10,90,"bodyweight",null,"reps",null],["Dumbbell bent over row",4,8,90,"weight",16,"reps",null],["Front plank with twist",3,40,45,"bodyweight",null,"time",null]]],
  ["Full Body B", [["Dumbbell romanian deadlift",4,8,120,"weight",16,"reps",null],["Dumbbell seated shoulder press",4,8,90,"weight",10,"reps",null],["Triceps dip",3,10,60,"bodyweight",null,"reps",null],["Glute bridge march",3,12,45,"bodyweight",null,"reps",null]]],
  ["Full Body C", [["Dumbbell lunge",4,8,90,"weight",12,"reps",null],["Pull-up",3,null,120,"bodyweight",null,"max_reps",null],["Dumbbell biceps curl",3,10,60,"weight",8,"reps",null],["Hanging leg raise",3,8,60,"bodyweight",null,"reps",null]]]
]'::jsonb),
('Mobility & core', 'rehab', 1, 6, 'Low-load core and mobility work for a client coming back from a niggle.', '[
  ["Core A", [["Dead bug",3,10,30,"bodyweight",null,"reps",null],["Glute bridge march",3,12,30,"bodyweight",null,"reps",null],["Chest stretch with exercise ball",2,30,15,"bodyweight",null,"time",null],["Side plank hip adduction",3,10,30,"bodyweight",null,"reps",null]]],
  ["Core B", [["Front plank with twist",3,30,30,"bodyweight",null,"time",null],["Hyperextension",3,12,30,"bodyweight",null,"reps",null],["Russian twist",3,16,30,"bodyweight",null,"reps",null],["Reverse crunch",3,12,30,"bodyweight",null,"reps",null]]],
  ["Core C", [["Walking lunge",2,10,30,"bodyweight",null,"reps",null],["Crunch floor",3,15,30,"bodyweight",null,"reps",null],["Side plank hip adduction",3,12,30,"bodyweight",null,"reps",null],["Chest stretch with exercise ball",2,30,15,"bodyweight",null,"time",null]]]
]'::jsonb);

-- psql variables are not expanded inside a DO body, so the phone travels as a session setting.
SELECT set_config('seed.phone', :'trainer_phone', false);

DO $$
DECLARE
    v_tid uuid; v_tenant uuid; p record; w record; s record; v_prog uuid; v_w uuid; d jsonb; i int;
    n_plans int := 0; n_filled int := 0; n_templates int := 0; n_workouts int := 0;
BEGIN
    SELECT t.id INTO v_tid FROM trainer t JOIN app_user au ON au.id = t.app_user_id
    WHERE au.phone = current_setting('seed.phone') AND t.deleted_at IS NULL;
    IF v_tid IS NULL THEN RAISE EXCEPTION 'no trainer with phone %', current_setting('seed.phone'); END IF;
    SELECT tenant_id INTO v_tenant FROM program WHERE trainer_id = v_tid AND tenant_id IS NOT NULL LIMIT 1;
    IF v_tenant IS NULL THEN RAISE EXCEPTION 'this trainer has no program to read the workspace from — run a trainer seed first'; END IF;

    -- 1 · the client plans
    FOR p IN SELECT pr.id, pr.name, pr.goal FROM program pr JOIN spec ON spec.name = pr.name
             WHERE pr.trainer_id = v_tid AND pr.client_id IS NOT NULL AND pr.deleted_at IS NULL LOOP
        n_plans := n_plans + 1;
        SELECT * INTO s FROM spec WHERE name = p.name;
        UPDATE program SET goal = coalesce(goal, s.goal) WHERE id = p.id;
        FOR w IN SELECT id, week, day FROM workout WHERE program_id = p.id AND deleted_at IS NULL
                 AND NOT EXISTS (SELECT 1 FROM workout_exercise x WHERE x.workout_id = workout.id) LOOP
            d := s.days -> (w.day - 1);
            CONTINUE WHEN d IS NULL;
            UPDATE workout SET name = d->>0 WHERE id = w.id;
            PERFORM pg_temp.fill(w.id, d->1, w.week, s.step, NULL);
            n_filled := n_filled + 1;
        END LOOP;
    END LOOP;

    -- 2 · the trainer's own templates: week 1, the days as written
    FOR s IN SELECT * FROM spec LOOP
        CONTINUE WHEN EXISTS (SELECT 1 FROM program WHERE trainer_id = v_tid AND client_id IS NULL
                              AND deleted_at IS NULL AND name = s.name);
        INSERT INTO program (origin, tenant_id, trainer_id, name, goal, description, weeks, days)
        VALUES ('trainer', v_tenant, v_tid, s.name, s.goal, s.summary, s.weeks, 3) RETURNING id INTO v_prog;
        FOR i IN 0..2 LOOP
            INSERT INTO workout (origin, tenant_id, trainer_id, program_id, week, day, position, name)
            VALUES ('trainer', v_tenant, v_tid, v_prog, 1, i + 1, 0, s.days->i->>0) RETURNING id INTO v_w;
            PERFORM pg_temp.fill(v_w, s.days->i->1, 1, 0, NULL);
        END LOOP;
        n_templates := n_templates + 1;
    END LOOP;

    -- 3 · standalone workouts, with dividers ({"position": "label"} becomes the section of that row)
    FOR s IN SELECT * FROM (VALUES
      ('Hotel-room circuit', 'No equipment, forty minutes.', '{"0":"Warm-up","3":"Finisher"}'::jsonb,
       '[["Jump rope",2,60,20,"bodyweight",null,"time",null],["Burpee",3,10,30,"bodyweight",null,"reps",null],["Push-up",3,12,30,"bodyweight",null,"reps",null],["Mountain climber",3,40,20,"bodyweight",null,"time",null],["Walking lunge",3,12,30,"bodyweight",null,"reps",null]]'::jsonb),
      ('Quick upper body', 'Thirty minutes, dumbbells and a cable.', '{"0":"Main"}'::jsonb,
       '[["Dumbbell bench press",3,10,75,"weight",16,"reps",null],["Dumbbell bent over row",3,10,75,"weight",16,"reps",null],["Dumbbell seated shoulder press",3,10,75,"weight",10,"reps",null],["Dumbbell biceps curl",2,12,45,"weight",8,"reps",null],["Cable triceps pushdown (v-bar)",2,12,45,"weight",20,"reps",null]]'::jsonb),
      ('Leg day finisher', 'Tacked onto the end of a lower-body day.', '{"2":"Burnout"}'::jsonb,
       '[["Walking lunge",3,12,45,"bodyweight",null,"reps",null],["Barbell glute bridge",3,12,60,"weight",40,"reps",null],["Dumbbell standing calf raise",4,15,30,"weight",16,"reps",null]]'::jsonb),
      ('Mobility flow', 'Ten minutes before or after a session.', '{"0":"Flow"}'::jsonb,
       '[["Dead bug",2,10,20,"bodyweight",null,"reps",null],["Chest stretch with exercise ball",2,30,10,"bodyweight",null,"time",null],["Glute bridge march",2,12,20,"bodyweight",null,"reps",null],["Side plank hip adduction",2,10,20,"bodyweight",null,"reps",null]]'::jsonb)
    ) AS t(name, notes, dividers, list) LOOP
        CONTINUE WHEN EXISTS (SELECT 1 FROM workout WHERE trainer_id = v_tid AND program_id IS NULL
                              AND deleted_at IS NULL AND name = s.name);
        INSERT INTO workout (origin, tenant_id, trainer_id, name, notes)
        VALUES ('trainer', v_tenant, v_tid, s.name, s.notes) RETURNING id INTO v_w;
        PERFORM pg_temp.fill(v_w, s.list, 1, 0, s.dividers);
        n_workouts := n_workouts + 1;
    END LOOP;

    RAISE NOTICE 'plans matched %, workouts filled %, templates added %, standalone workouts added %',
        n_plans, n_filled, n_templates, n_workouts;
END $$;

SELECT 'client plans' AS kind, count(DISTINCT p.id) AS programs, count(DISTINCT w.id) AS workouts, count(we.id) FILTER (WHERE we.alternative_of IS NULL) AS exercises
FROM program p LEFT JOIN workout w ON w.program_id = p.id AND w.deleted_at IS NULL LEFT JOIN workout_exercise we ON we.workout_id = w.id
WHERE p.client_id IS NOT NULL AND p.deleted_at IS NULL
UNION ALL
SELECT 'templates', count(DISTINCT p.id), count(DISTINCT w.id), count(we.id) FILTER (WHERE we.alternative_of IS NULL)
FROM program p LEFT JOIN workout w ON w.program_id = p.id AND w.deleted_at IS NULL LEFT JOIN workout_exercise we ON we.workout_id = w.id
WHERE p.client_id IS NULL AND p.origin = 'trainer' AND p.deleted_at IS NULL
UNION ALL
SELECT 'standalone workouts', 0, count(DISTINCT w.id), count(we.id) FILTER (WHERE we.alternative_of IS NULL)
FROM workout w LEFT JOIN workout_exercise we ON we.workout_id = w.id WHERE w.program_id IS NULL AND w.origin = 'trainer' AND w.deleted_at IS NULL;
COMMIT;
