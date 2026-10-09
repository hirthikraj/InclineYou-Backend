-- Equipment lookup and the wider log_type (6 Oct 2026).
-- Additive only: nothing is dropped, renamed or repurposed. One CHECK is replaced by a strictly wider one.
--
-- 1. exercise.log_type grows from {weight_reps, reps} to six values. Each is the default shape of a set_log row
--    (SetLogService already stores effort_kind time / distance and load_kind weight / bodyweight):
--      weight_reps     weight + reps          reps            bodyweight + reps
--      time            bodyweight + seconds   distance        bodyweight + metres
--      weight_time     weight + seconds       weight_distance weight + metres
--    A plank, a stretch, a treadmill walk, a farmer's walk and a sled push were all being squeezed into
--    reps. NULL still reads as weight_reps, so every existing row and every old build is unaffected.
--
-- 2. `equipment` is a lookup: one row per piece of kit, with a permanent key, a display name and a category
--    the library groups by. exercise.equipment (free text, varchar(50)) STAYS — the API and every old build
--    read it — and exercise.equipment_id is added beside it, nullable, so a trainer can later filter by the
--    kit they actually have (home-visit trainers have no gym).
--
-- 3. `equipment_alias` maps each raw string a seed or an import may write onto an equipment row (the upstream
--    dataset's 28 values and the InclineYou library's), and a trigger resolves exercise.equipment_id from it on
--    insert and when the text changes. The seeder therefore needs no change to keep the FK filled, and an
--    unrecognised string simply leaves equipment_id NULL rather than failing a write.
--
-- Not policied by a tenant tier: both tables are the global catalogue, shared by every workspace, with no
-- tenant_id (like plan_price and tenant_role). The request role may read them and may not write them.

ALTER TABLE exercise DROP CONSTRAINT exercise_log_type;
ALTER TABLE exercise ADD CONSTRAINT exercise_log_type CHECK (log_type IS NULL OR log_type IN
    ('weight_reps', 'reps', 'time', 'distance', 'weight_time', 'weight_distance'));

CREATE TABLE equipment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key varchar(40) NOT NULL,               -- permanent slug; never reused or renamed
    name varchar(80) NOT NULL,              -- what a trainer reads
    category varchar(20) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT equipment_pkey PRIMARY KEY (id),
    CONSTRAINT equipment_key UNIQUE (key),
    CONSTRAINT equipment_key_shape CHECK (key ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT equipment_name CHECK (btrim(name) <> ''),
    CONSTRAINT equipment_category CHECK (category IN ('bands', 'bodyweight', 'cable', 'cardio machine', 'free weights', 'machine', 'other', 'small tools', 'traditional'))
);
CREATE TRIGGER trg_equipment_updated_at BEFORE UPDATE ON equipment FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_equipment_category ON equipment (category, sort_order) WHERE is_active;

INSERT INTO equipment (key, name, category, sort_order) VALUES
    ('barbell', 'Barbell', 'free weights', 10),
    ('dumbbell', 'Dumbbell', 'free weights', 20),
    ('kettlebell', 'Kettlebell', 'free weights', 30),
    ('ez_bar', 'EZ bar', 'free weights', 40),
    ('trap_bar', 'Trap bar', 'free weights', 50),
    ('weight_plate', 'Weight plate', 'free weights', 60),
    ('body_weight', 'Bodyweight', 'bodyweight', 70),
    ('cable', 'Cable', 'cable', 80),
    ('smith_machine', 'Smith machine', 'machine', 90),
    ('leg_press_machine', 'Leg press machine', 'machine', 100),
    ('hack_squat_machine', 'Hack squat machine', 'machine', 110),
    ('leg_extension_machine', 'Leg extension machine', 'machine', 120),
    ('leg_curl_machine', 'Leg curl machine', 'machine', 130),
    ('hip_abduction_machine', 'Hip abduction machine', 'machine', 140),
    ('hip_adduction_machine', 'Hip adduction machine', 'machine', 150),
    ('calf_raise_machine', 'Calf raise machine', 'machine', 160),
    ('chest_press_machine', 'Chest press machine', 'machine', 170),
    ('pec_deck_machine', 'Pec deck machine', 'machine', 180),
    ('shoulder_press_machine', 'Shoulder press machine', 'machine', 190),
    ('lateral_raise_machine', 'Lateral raise machine', 'machine', 200),
    ('row_machine', 'Row machine', 'machine', 210),
    ('lat_pulldown_machine', 'Lat pulldown machine', 'machine', 220),
    ('assisted_pull_up_machine', 'Assisted pull-up machine', 'machine', 230),
    ('dip_machine', 'Dip machine', 'machine', 240),
    ('triceps_extension_machine', 'Triceps extension machine', 'machine', 250),
    ('biceps_curl_machine', 'Biceps curl machine', 'machine', 260),
    ('ab_crunch_machine', 'Ab crunch machine', 'machine', 270),
    ('torso_rotation_machine', 'Torso rotation machine', 'machine', 280),
    ('back_extension_machine', 'Back extension machine', 'machine', 290),
    ('glute_kickback_machine', 'Glute kickback machine', 'machine', 300),
    ('hip_thrust_machine', 'Hip thrust machine', 'machine', 310),
    ('treadmill', 'Treadmill', 'cardio machine', 320),
    ('elliptical_machine', 'Elliptical machine', 'cardio machine', 330),
    ('stationary_bike', 'Stationary bike', 'cardio machine', 340),
    ('rowing_machine', 'Rowing machine', 'cardio machine', 350),
    ('stair_climber_machine', 'Stair climber machine', 'cardio machine', 360),
    ('air_bike', 'Air bike', 'cardio machine', 370),
    ('resistance_band', 'Resistance band', 'bands', 380),
    ('mini_band', 'Mini band', 'bands', 390),
    ('suspension_trainer', 'Suspension trainer (TRX)', 'small tools', 400),
    ('stability_ball', 'Stability ball', 'small tools', 410),
    ('medicine_ball', 'Medicine ball', 'small tools', 420),
    ('battle_rope', 'Battle rope', 'small tools', 430),
    ('skipping_rope', 'Skipping rope', 'small tools', 440),
    ('sled', 'Sled', 'small tools', 450),
    ('ab_wheel', 'Ab wheel', 'small tools', 460),
    ('roller', 'Foam roller', 'small tools', 470),
    ('sandbag', 'Sandbag', 'traditional', 480),
    ('gada_mace', 'Gada (mace)', 'traditional', 490),
    ('indian_club', 'Indian club (mudgar)', 'traditional', 500),
    ('tire', 'Tyre', 'traditional', 510),
    ('bosu_ball', 'Bosu ball', 'small tools', 520),
    ('leverage_machine', 'Leverage machine (lever, plate-loaded)', 'machine', 530),
    ('sled_machine', 'Sled machine (plate-loaded)', 'machine', 540),
    ('assisted', 'Partner or strap assisted', 'other', 550),
    ('sledgehammer', 'Sledgehammer', 'small tools', 560),
    ('skierg_machine', 'Ski erg', 'cardio machine', 570),
    ('upper_body_ergometer', 'Upper body ergometer (arm bike)', 'cardio machine', 580),
    ('rope', 'Rope (battle rope or strap)', 'small tools', 590);

CREATE TABLE equipment_alias (
    legacy_value varchar(50) NOT NULL,      -- the exact string written to exercise.equipment
    equipment_id uuid NOT NULL REFERENCES equipment (id),
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT equipment_alias_pkey PRIMARY KEY (legacy_value),
    CONSTRAINT equipment_alias_text CHECK (btrim(legacy_value) <> '')
);
CREATE INDEX idx_equipment_alias_equipment ON equipment_alias (equipment_id);

INSERT INTO equipment_alias (legacy_value, equipment_id)
SELECT m.legacy_value, e.id
FROM (VALUES
    ('ab crunch machine', 'ab_crunch_machine'),
    ('ab wheel', 'ab_wheel'),
    ('air bike', 'air_bike'),
    ('assisted', 'assisted'),
    ('assisted pull-up machine', 'assisted_pull_up_machine'),
    ('back extension machine', 'back_extension_machine'),
    ('band', 'resistance_band'),
    ('barbell', 'barbell'),
    ('battle rope', 'battle_rope'),
    ('biceps curl machine', 'biceps_curl_machine'),
    ('body weight', 'body_weight'),
    ('bosu ball', 'bosu_ball'),
    ('cable', 'cable'),
    ('calf raise machine', 'calf_raise_machine'),
    ('chest press machine', 'chest_press_machine'),
    ('dip machine', 'dip_machine'),
    ('dumbbell', 'dumbbell'),
    ('elliptical machine', 'elliptical_machine'),
    ('ez bar', 'ez_bar'),
    ('ez barbell', 'ez_bar'),
    ('gada (mace)', 'gada_mace'),
    ('glute kickback machine', 'glute_kickback_machine'),
    ('hack squat machine', 'hack_squat_machine'),
    ('hammer', 'sledgehammer'),
    ('hip abduction machine', 'hip_abduction_machine'),
    ('hip adduction machine', 'hip_adduction_machine'),
    ('hip thrust machine', 'hip_thrust_machine'),
    ('indian club', 'indian_club'),
    ('kettlebell', 'kettlebell'),
    ('lat pulldown machine', 'lat_pulldown_machine'),
    ('lateral raise machine', 'lateral_raise_machine'),
    ('leg curl machine', 'leg_curl_machine'),
    ('leg extension machine', 'leg_extension_machine'),
    ('leg press machine', 'leg_press_machine'),
    ('leverage machine', 'leverage_machine'),
    ('medicine ball', 'medicine_ball'),
    ('mini band', 'mini_band'),
    ('olympic barbell', 'barbell'),
    ('pec deck machine', 'pec_deck_machine'),
    ('resistance band', 'resistance_band'),
    ('roller', 'roller'),
    ('rope', 'rope'),
    ('row machine', 'row_machine'),
    ('rowing machine', 'rowing_machine'),
    ('sandbag', 'sandbag'),
    ('shoulder press machine', 'shoulder_press_machine'),
    ('skierg machine', 'skierg_machine'),
    ('skipping rope', 'skipping_rope'),
    ('sled', 'sled'),
    ('sled machine', 'sled_machine'),
    ('smith machine', 'smith_machine'),
    ('stability ball', 'stability_ball'),
    ('stair climber machine', 'stair_climber_machine'),
    ('stationary bike', 'stationary_bike'),
    ('stepmill machine', 'stair_climber_machine'),
    ('suspension trainer', 'suspension_trainer'),
    ('tire', 'tire'),
    ('torso rotation machine', 'torso_rotation_machine'),
    ('trap bar', 'trap_bar'),
    ('treadmill', 'treadmill'),
    ('triceps extension machine', 'triceps_extension_machine'),
    ('upper body ergometer', 'upper_body_ergometer'),
    ('weight plate', 'weight_plate'),
    ('weighted', 'weight_plate'),
    ('wheel roller', 'ab_wheel')
) AS m (legacy_value, key)
JOIN equipment e ON e.key = m.key;

ALTER TABLE exercise ADD COLUMN equipment_id uuid REFERENCES equipment (id);
CREATE INDEX idx_exercise_equipment_id ON exercise (equipment_id) WHERE equipment_id IS NOT NULL;

-- Keep equipment_id in step with the text. Fills it when empty; re-resolves it when the text alone changes.
-- A string with no alias leaves it NULL. Never blocks a write.
CREATE FUNCTION resolve_exercise_equipment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.equipment IS NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NEW.equipment_id IS NULL THEN
            SELECT equipment_id INTO NEW.equipment_id FROM equipment_alias WHERE legacy_value = NEW.equipment;
        END IF;
    ELSIF NEW.equipment IS DISTINCT FROM OLD.equipment AND NEW.equipment_id IS NOT DISTINCT FROM OLD.equipment_id THEN
        SELECT equipment_id INTO NEW.equipment_id FROM equipment_alias WHERE legacy_value = NEW.equipment;
    ELSIF NEW.equipment_id IS NULL THEN
        SELECT equipment_id INTO NEW.equipment_id FROM equipment_alias WHERE legacy_value = NEW.equipment;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_exercise_resolve_equipment BEFORE INSERT OR UPDATE OF equipment, equipment_id ON exercise
    FOR EACH ROW EXECUTE FUNCTION resolve_exercise_equipment();

-- Backfill the existing library. updated_at is left alone on purpose: it is the exercise's version (ETag), and
-- a one-off bulk touch would make every client's cached copy look stale for no change a person can see.
ALTER TABLE exercise DISABLE TRIGGER trg_exercise_updated_at;
UPDATE exercise e SET equipment_id = a.equipment_id
FROM equipment_alias a
WHERE e.equipment = a.legacy_value AND e.equipment_id IS NULL;
ALTER TABLE exercise ENABLE TRIGGER trg_exercise_updated_at;

DO $$
BEGIN
    EXECUTE 'GRANT SELECT ON equipment, equipment_alias TO inclineyou_app';
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON equipment, equipment_alias FROM inclineyou_app';
    -- exercise's table-wide grants from V1 already cover the new equipment_id column
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;
