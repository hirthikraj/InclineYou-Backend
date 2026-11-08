-- V28 (4 Nov 2026) — a reading's lower bound is the measurement's, not one rule for all.
--
-- V1's assessment_readings_valid() refused every reading at or below 0. That is right for a size or a mass, and wrong
-- for the catalogue's counts and scores, where 0 is somebody's honest result (no push-up yet, a plank not held, an
-- overhead squat that scores nothing), and for sit-and-reach, which is measured from the toes and so is negative for
-- anybody who stops short of them. Those results could not be recorded at all.
--
-- The rules, the same three as AssessmentCatalogue.boundOf():
--   · pushups, plank, ohs   0 or more
--   · sit_reach             above -100000
--   · every other key       above 0 (unchanged)
-- and every reading stays below 100000 (unchanged).
--
-- Only ever RELAXES the check: every row that satisfied V1's version satisfies this one, so no stored row starts failing
-- the constraint on its next UPDATE (a correction, a soft delete). CREATE OR REPLACE keeps the signature, so the CHECK
-- constraint assessment_readings_valid picks the new body up as it is. A new countable or signed measurement in the
-- catalogue needs its key added here AND in AssessmentCatalogue.

CREATE OR REPLACE FUNCTION assessment_readings_valid(form jsonb, readings jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT jsonb_typeof(readings) = 'object' AND NOT EXISTS (
        SELECT 1 FROM jsonb_each(readings) r
        WHERE jsonb_typeof(r.value) <> 'number'
           OR (r.value)::text::numeric >= 100000
           OR CASE WHEN r.key IN ('pushups', 'plank', 'ohs') THEN (r.value)::text::numeric < 0
                   WHEN r.key = 'sit_reach'                  THEN (r.value)::text::numeric <= -100000
                   ELSE (r.value)::text::numeric <= 0 END
           OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(form -> 'measurements', '[]')) m
                          WHERE m ->> 'key' = r.key))
$$;
