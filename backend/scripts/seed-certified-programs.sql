-- Four InclineYou library programs. See seed-certified-programs.sh.
--
-- A workout is written once, for week 1: a week with nothing of its own repeats week 1
-- in the builder, which is what lets an eight-week block exist without a blank grid.
-- Each exercise is [name, sets, reps, rest seconds, load]; load is 'weight' (the coach
-- fills the number in per client) or 'bodyweight'. A name that is not in the library
-- aborts the run.

\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.seed_program(
    p_name text, p_goal text, p_weeks int, p_days int,
    p_summary text, p_level text, p_equipment text, p_plan jsonb
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_program uuid;
    v_workout uuid;
    v_exercise uuid;
    w jsonb;
    e jsonb;
    w_pos int;
    e_pos int;
    s int;
BEGIN
    IF EXISTS (SELECT 1 FROM program WHERE origin = 'inclineyou' AND name = p_name AND deleted_at IS NULL) THEN
        RAISE NOTICE 'skip % (already there)', p_name;
        RETURN;
    END IF;
    INSERT INTO program (origin, name, goal, description, weeks, days)
    VALUES ('inclineyou', p_name, p_goal, p_summary, p_weeks, p_days) RETURNING id INTO v_program;
    INSERT INTO certified_program (program_id, summary, level, equipment, is_sample)
    VALUES (v_program, p_summary, p_level, p_equipment, true);

    w_pos := 0;
    FOR w IN SELECT * FROM jsonb_array_elements(p_plan) LOOP
        INSERT INTO workout (origin, program_id, week, day, position, name)
        VALUES ('inclineyou', v_program, 1, (w->>'day')::int, 0, w->>'name') RETURNING id INTO v_workout;
        e_pos := 0;
        FOR e IN SELECT * FROM jsonb_array_elements(w->'ex') LOOP
            INSERT INTO workout_exercise (workout_id, exercise_id, position)
            VALUES (v_workout,
                    (SELECT id FROM exercise WHERE origin = 'inclineyou' AND name = e->>0 ORDER BY id LIMIT 1),
                    e_pos) RETURNING id INTO v_exercise;
            IF v_exercise IS NULL OR NOT EXISTS (SELECT 1 FROM workout_exercise WHERE id = v_exercise) THEN
                RAISE EXCEPTION 'exercise not in the library: %', e->>0;
            END IF;
            FOR s IN 1..(e->>1)::int LOOP
                INSERT INTO workout_set (workout_exercise_id, position, load_kind, effort_kind, effort_value, rest_seconds)
                VALUES (v_exercise, s, e->>4, 'reps', (e->>2)::int, (e->>3)::int);
            END LOOP;
            e_pos := e_pos + 1;
        END LOOP;
        w_pos := w_pos + 1;
    END LOOP;
END $$;

SELECT pg_temp.seed_program('Beginner full body', 'general', 4, 3,
    'Three full-body days a week on basic machines and barbells. Learn the patterns before adding load.',
    'beginner', 'full_gym', '[
  {"day":1,"name":"Full Body A","ex":[["Barbell full squat",3,8,120,"weight"],["Barbell bench press",3,8,120,"weight"],["Cable seated row",3,10,90,"weight"],["Crunch floor",3,15,60,"bodyweight"]]},
  {"day":2,"name":"Full Body B","ex":[["Barbell deadlift",3,5,150,"weight"],["Dumbbell bent over row",3,10,90,"weight"],["Push-up",3,10,60,"bodyweight"],["Walking lunge",3,12,60,"bodyweight"]]},
  {"day":3,"name":"Full Body C","ex":[["Dumbbell goblet squat",3,10,90,"weight"],["Dumbbell bench press",3,10,90,"weight"],["Pull-up",3,5,120,"bodyweight"],["Mountain climber",3,20,45,"bodyweight"]]}
]'::jsonb);

SELECT pg_temp.seed_program('Dumbbell strength', 'strength', 6, 3,
    'Three days of heavy dumbbell work for someone with a pair of adjustable dumbbells and a bench.',
    'intermediate', 'dumbbells', '[
  {"day":1,"name":"Squat & press","ex":[["Dumbbell goblet squat",4,6,120,"weight"],["Dumbbell bench press",4,6,120,"weight"],["Dumbbell bent over row",3,8,90,"weight"]]},
  {"day":2,"name":"Hinge & pull","ex":[["Dumbbell romanian deadlift",4,6,120,"weight"],["Dumbbell bent over row",4,8,90,"weight"],["Triceps dip",3,10,60,"bodyweight"]]},
  {"day":3,"name":"Legs & core","ex":[["Dumbbell lunge",4,8,90,"weight"],["Dumbbell goblet squat",3,10,90,"weight"],["Crunch floor",3,20,45,"bodyweight"]]}
]'::jsonb);

SELECT pg_temp.seed_program('Bodyweight fat loss', 'weight_loss', 8, 4,
    'Four short bodyweight days, no equipment: circuits that raise the heart rate and build a habit.',
    'beginner', 'bodyweight', '[
  {"day":1,"name":"Circuit A","ex":[["Burpee",4,10,45,"bodyweight"],["Push-up",4,10,45,"bodyweight"],["Walking lunge",4,12,45,"bodyweight"],["Mountain climber",4,30,30,"bodyweight"]]},
  {"day":2,"name":"Core & glutes","ex":[["Glute bridge march",4,12,45,"bodyweight"],["Crunch floor",4,20,30,"bodyweight"],["Mountain climber",3,30,30,"bodyweight"]]},
  {"day":3,"name":"Circuit B","ex":[["Triceps dip",4,10,45,"bodyweight"],["Burpee",4,8,45,"bodyweight"],["Walking lunge",4,12,45,"bodyweight"],["Push-up",3,12,45,"bodyweight"]]},
  {"day":4,"name":"Finisher","ex":[["Burpee",5,10,30,"bodyweight"],["Mountain climber",5,30,30,"bodyweight"],["Crunch floor",4,25,30,"bodyweight"]]}
]'::jsonb);

SELECT pg_temp.seed_program('Upper / lower split', 'muscle_gain', 8, 4,
    'Two upper and two lower days a week for someone with a few months of training behind them.',
    'intermediate', 'full_gym', '[
  {"day":1,"name":"Upper A","ex":[["Barbell bench press",4,8,120,"weight"],["Cable seated row",4,10,90,"weight"],["Dumbbell bench press",3,10,90,"weight"],["Triceps dip",3,10,60,"bodyweight"]]},
  {"day":2,"name":"Lower A","ex":[["Barbell full squat",4,8,150,"weight"],["Dumbbell romanian deadlift",3,10,90,"weight"],["Walking lunge",3,12,60,"bodyweight"]]},
  {"day":3,"name":"Upper B","ex":[["Pull-up",4,6,120,"bodyweight"],["Dumbbell bent over row",4,10,90,"weight"],["Push-up",3,15,60,"bodyweight"]]},
  {"day":4,"name":"Lower B","ex":[["Barbell deadlift",4,5,180,"weight"],["Dumbbell goblet squat",3,12,90,"weight"],["Crunch floor",3,20,45,"bodyweight"]]}
]'::jsonb);

SELECT count(*) AS library_programs FROM program WHERE origin = 'inclineyou' AND deleted_at IS NULL;
COMMIT;
