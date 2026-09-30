-- The exercise library's typeahead (Programs L6) and custom-exercise names (A9).
--
-- GET /v1/exercises?q= ranks an exact-prefix match first and then trigram similarity, per
-- keystroke, over ~1,300 global rows plus the trainer's own: similarity() and ILIKE '%q%'
-- both want this index. pg_trgm is a trusted extension, so the migration role may create it.
--
-- A trainer's live custom exercises have one name each (EXERCISE_NAME_TAKEN): a typo'd
-- duplicate in a picker is two rows that look alike and mean different histories. The
-- service checks first to answer with a sentence; this index is what stops the race. A
-- deleted custom frees its name, which is why it is partial on deleted_at.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_exercise_name_trgm ON exercise USING gin (name gin_trgm_ops);

CREATE UNIQUE INDEX uq_exercise_custom_name ON exercise (trainer_id, lower(name))
    WHERE origin = 'trainer' AND deleted_at IS NULL;
