-- Team coaching Phase 3: what an admin changed on somebody else's client.
--
-- Phase 3 lets an owner or admin edit a teammate's PROGRAMS and the team's
-- CUSTOM EXERCISES in place — the "Priya is off sick and her client is standing
-- in front of me" case, where handing the client over permanently would be the
-- wrong answer for a swapped exercise.
--
-- That capability is only acceptable if it leaves a trace. A coach who finds
-- their client's Tuesday plan different from how they left it, with no way to see
-- who changed it or when, has been given a reason to distrust the whole team
-- feature — and the coach's trust is the thing this product runs on. So every
-- edit to somebody else's data writes a row here, and the owning coach can read
-- it.
--
-- Note what this is NOT. It is not an audit log of the product; a trainer editing
-- their own client writes nothing, because there is nobody to account to. It
-- records exactly the crossings: actor ≠ subject.
--
-- Additive only: one new table, no ALTER, no backfill.

CREATE TABLE IF NOT EXISTS team_activity (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

    team_id            UUID         NOT NULL REFERENCES team(id),

    -- Who made the change.
    actor_trainer_id   UUID         NOT NULL REFERENCES trainer(id),

    -- Whose data it was. Always different from the actor: this table exists to
    -- record crossings, and a row where these two match would be noise that
    -- buries the rows that matter.
    subject_trainer_id UUID         NOT NULL REFERENCES trainer(id),

    -- The client it was about, when it was about one. NULL for a shared custom
    -- exercise, which belongs to the team rather than to anybody's roster.
    client_id          UUID         REFERENCES client(id),

    -- 'program' | 'program_exercise' | 'exercise'
    entity_type        VARCHAR(30)  NOT NULL,
    entity_id          UUID         NOT NULL,

    -- 'added' | 'updated' | 'removed'
    action             VARCHAR(20)  NOT NULL,

    -- The sentence, written at the time, in the words the coach will read it in:
    -- "Changed Barbell Squat to 4 × 6 on day 2".
    --
    -- Stored rather than derived, for the same reason `weekly_report` stores its
    -- sentences: it describes what happened THEN. Rebuilding it later from
    -- current state would produce a different sentence every time the program
    -- changed again, which is the one thing an account of a change must not do.
    summary            VARCHAR(300) NOT NULL,

    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Belt and braces on the rule above, in the database rather than only in the
    -- service that writes it.
    CONSTRAINT team_activity_is_a_crossing
        CHECK (actor_trainer_id <> subject_trainer_id)
);

-- No `updated_at`, no `deleted_at`. An append-only account of things that
-- happened: a change made in error is undone by making another change, which
-- writes another row. Deleting the evidence is not an available operation, and
-- the whole value of the table is that the coach can rely on that.

-- "What did somebody change on MY clients" — the coach's own view, and the only
-- query on a hot path.
CREATE INDEX IF NOT EXISTS idx_team_activity_subject
    ON team_activity (subject_trainer_id, created_at DESC);

-- "What has been happening in the team" — the admin's view.
CREATE INDEX IF NOT EXISTS idx_team_activity_team
    ON team_activity (team_id, created_at DESC);

-- Drawn on one client's file, next to their handover history.
CREATE INDEX IF NOT EXISTS idx_team_activity_client
    ON team_activity (client_id, created_at DESC)
    WHERE client_id IS NOT NULL;
