-- TrainX initial schema
-- Rules: additive-only going forward; never rename/drop/retype columns.
-- All PKs are client-generated UUIDs. updated_at drives the sync cursor.
-- Soft deletes via deleted_at (NULL = alive).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── trainer ──────────────────────────────────────────────────────────────────
CREATE TABLE trainer (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    phone       VARCHAR(15) NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    upi_vpa     VARCHAR(100),
    fcm_token   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);

-- ─── otp_request ──────────────────────────────────────────────────────────────
-- Short-lived; verified flag prevents reuse. Cleaned up by a scheduled job.
CREATE TABLE otp_request (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    phone       VARCHAR(15) NOT NULL,
    otp_hash    VARCHAR(255) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    verified    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_otp_request_phone ON otp_request (phone);

-- ─── client ───────────────────────────────────────────────────────────────────
-- payment_mode: 'trainer_collects' | 'gym_collects'
-- status:       'active' | 'inactive' | 'paused'
-- activity_level: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
-- metadata: open JSONB for extensible intake questions (no schema change per question)
CREATE TABLE client (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id            UUID         NOT NULL REFERENCES trainer(id),
    name                  VARCHAR(100) NOT NULL,
    phone                 VARCHAR(15),
    goal                  TEXT,
    status                VARCHAR(20)  NOT NULL DEFAULT 'active',
    payment_mode          VARCHAR(20)  NOT NULL DEFAULT 'trainer_collects',
    trainer_split_percent NUMERIC(5,2),
    height_cm             NUMERIC(5,1),
    activity_level        VARCHAR(20),
    metadata              JSONB,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at            TIMESTAMPTZ
);
CREATE INDEX idx_client_trainer_id ON client (trainer_id);

-- ─── body_metric ──────────────────────────────────────────────────────────────
-- Append-only in practice; updated_at still tracked for sync.
-- metric_type: 'weight' | 'chest' | 'waist' | 'hip' | 'arm' | 'thigh' | ...
-- unit: 'kg' | 'cm' | 'inch' | 'lbs'
CREATE TABLE body_metric (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id   UUID        NOT NULL REFERENCES client(id),
    metric_type VARCHAR(30) NOT NULL,
    value       NUMERIC(8,2) NOT NULL,
    unit        VARCHAR(10) NOT NULL,
    notes       TEXT,
    recorded_at TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);
CREATE INDEX idx_body_metric_client_id ON body_metric (client_id);
CREATE INDEX idx_body_metric_recorded_at ON body_metric (client_id, recorded_at);

-- ─── exercise ─────────────────────────────────────────────────────────────────
-- is_custom = false → seeded from free-exercise-db (source_id = original DB id)
-- is_custom = true  → created by trainer; trainer_id is set
CREATE TABLE exercise (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name             VARCHAR(150) NOT NULL,
    muscle_group     VARCHAR(50),
    equipment        VARCHAR(50),
    movement_pattern VARCHAR(50),
    description      TEXT,
    image_url        TEXT,
    video_url        TEXT,
    is_custom        BOOLEAN      NOT NULL DEFAULT FALSE,
    trainer_id       UUID         REFERENCES trainer(id),
    source_id        VARCHAR(100),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ
);
CREATE INDEX idx_exercise_trainer_id ON exercise (trainer_id);
CREATE INDEX idx_exercise_muscle_group ON exercise (muscle_group);

-- ─── template ─────────────────────────────────────────────────────────────────
-- Reusable plan blueprint owned by a trainer.
-- Assigning a template to a client creates a program (a per-client copy).
CREATE TABLE template (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id  UUID         NOT NULL REFERENCES trainer(id),
    name        VARCHAR(150) NOT NULL,
    goal        TEXT,
    description TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);
CREATE INDEX idx_template_trainer_id ON template (trainer_id);

-- ─── program ──────────────────────────────────────────────────────────────────
-- Per-client program. template_id is set when derived from a template,
-- but the program's exercises are an independent copy (trainer can tweak).
-- status: 'active' | 'completed' | 'paused'
CREATE TABLE program (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id  UUID         NOT NULL REFERENCES trainer(id),
    client_id   UUID         NOT NULL REFERENCES client(id),
    template_id UUID         REFERENCES template(id),
    name        VARCHAR(150) NOT NULL,
    goal        TEXT,
    start_date  DATE,
    end_date    DATE,
    status      VARCHAR(20)  NOT NULL DEFAULT 'active',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);
CREATE INDEX idx_program_trainer_id ON program (trainer_id);
CREATE INDEX idx_program_client_id  ON program (client_id);

-- ─── program_exercise ─────────────────────────────────────────────────────────
-- Individual exercises within a program.
-- day_of_week: 1 (Mon) – 7 (Sun), NULL = unscheduled.
CREATE TABLE program_exercise (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id   UUID        NOT NULL REFERENCES program(id),
    exercise_id  UUID        NOT NULL REFERENCES exercise(id),
    sets         INTEGER,
    reps         INTEGER,
    rest_seconds INTEGER,
    target_load  NUMERIC(6,2),
    notes        TEXT,
    day_of_week  INTEGER,
    order_index  INTEGER     NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMPTZ
);
CREATE INDEX idx_program_exercise_program_id ON program_exercise (program_id);

-- ─── scheduled_session ────────────────────────────────────────────────────────
-- Calendar entry. status: 'scheduled' | 'done' | 'no_show' | 'cancelled'
-- Marking 'done' decrements the client's active package.sessions_remaining.
CREATE TABLE scheduled_session (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id       UUID        NOT NULL REFERENCES trainer(id),
    client_id        UUID        NOT NULL REFERENCES client(id),
    program_id       UUID        REFERENCES program(id),
    scheduled_at     TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER,
    status           VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ
);
CREATE INDEX idx_scheduled_session_trainer_id   ON scheduled_session (trainer_id);
CREATE INDEX idx_scheduled_session_client_id    ON scheduled_session (client_id);
CREATE INDEX idx_scheduled_session_scheduled_at ON scheduled_session (scheduled_at);

-- ─── workout_session ──────────────────────────────────────────────────────────
-- The actual logged session (may or may not have a scheduled_session parent).
-- logged_by: 'trainer' | 'client'
CREATE TABLE workout_session (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id           UUID        NOT NULL REFERENCES trainer(id),
    client_id            UUID        NOT NULL REFERENCES client(id),
    program_id           UUID        REFERENCES program(id),
    scheduled_session_id UUID        REFERENCES scheduled_session(id),
    logged_by            VARCHAR(10) NOT NULL DEFAULT 'trainer',
    session_date         DATE        NOT NULL,
    notes                TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at           TIMESTAMPTZ
);
CREATE INDEX idx_workout_session_trainer_id   ON workout_session (trainer_id);
CREATE INDEX idx_workout_session_client_id    ON workout_session (client_id);
CREATE INDEX idx_workout_session_session_date ON workout_session (session_date);

-- ─── set_log ──────────────────────────────────────────────────────────────────
-- Individual sets logged within a workout session.
-- rpe: 1–10 scale, one decimal place.
CREATE TABLE set_log (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_session_id UUID        NOT NULL REFERENCES workout_session(id),
    exercise_id        UUID        NOT NULL REFERENCES exercise(id),
    set_number         INTEGER     NOT NULL,
    load_kg            NUMERIC(6,2),
    reps               INTEGER,
    rpe                NUMERIC(3,1),
    notes              TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ
);
CREATE INDEX idx_set_log_workout_session_id ON set_log (workout_session_id);
CREATE INDEX idx_set_log_exercise_id        ON set_log (exercise_id);

-- ─── package ──────────────────────────────────────────────────────────────────
-- A billing package for a client.
-- type:   'session_pack' | 'monthly'
-- status: 'active' | 'expired' | 'cancelled'
CREATE TABLE package (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id         UUID         NOT NULL REFERENCES trainer(id),
    client_id          UUID         NOT NULL REFERENCES client(id),
    type               VARCHAR(20)  NOT NULL DEFAULT 'session_pack',
    sessions_total     INTEGER,
    sessions_remaining INTEGER,
    amount             NUMERIC(10,2) NOT NULL,
    currency           VARCHAR(3)   NOT NULL DEFAULT 'INR',
    start_date         DATE,
    end_date           DATE,
    status             VARCHAR(20)  NOT NULL DEFAULT 'active',
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ
);
CREATE INDEX idx_package_trainer_id ON package (trainer_id);
CREATE INDEX idx_package_client_id  ON package (client_id);

-- ─── payment ──────────────────────────────────────────────────────────────────
-- method:       'upi_intent' | 'gym_front_office' | 'cash'
-- collected_by: 'trainer' | 'gym'
-- status:       'pending' | 'paid' | 'overdue'
CREATE TABLE payment (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id    UUID          NOT NULL REFERENCES trainer(id),
    client_id     UUID          NOT NULL REFERENCES client(id),
    package_id    UUID          REFERENCES package(id),
    amount        NUMERIC(10,2) NOT NULL,
    currency      VARCHAR(3)    NOT NULL DEFAULT 'INR',
    method        VARCHAR(30)   NOT NULL DEFAULT 'upi_intent',
    collected_by  VARCHAR(10)   NOT NULL DEFAULT 'trainer',
    status        VARCHAR(20)   NOT NULL DEFAULT 'pending',
    upi_reference VARCHAR(100),
    paid_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ
);
CREATE INDEX idx_payment_trainer_id ON payment (trainer_id);
CREATE INDEX idx_payment_client_id  ON payment (client_id);

-- ─── nudge_log ────────────────────────────────────────────────────────────────
-- channel: 'whatsapp' | 'push'
-- status:  'sent' | 'delivered' | 'failed'
CREATE TABLE nudge_log (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id    UUID        NOT NULL REFERENCES trainer(id),
    client_id     UUID        NOT NULL REFERENCES client(id),
    channel       VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
    template_name VARCHAR(100),
    status        VARCHAR(20) NOT NULL DEFAULT 'sent',
    sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ
);
CREATE INDEX idx_nudge_log_trainer_id ON nudge_log (trainer_id);
CREATE INDEX idx_nudge_log_client_id  ON nudge_log (client_id);

-- ─── updated_at trigger ───────────────────────────────────────────────────────
-- Keeps updated_at fresh on every UPDATE; drives the sync cursor.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'trainer', 'client', 'body_metric', 'exercise', 'template',
        'program', 'program_exercise', 'scheduled_session',
        'workout_session', 'set_log', 'package', 'payment', 'nudge_log'
    ]) LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated_at
             BEFORE UPDATE ON %s
             FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
            t, t
        );
    END LOOP;
END;
$$;
