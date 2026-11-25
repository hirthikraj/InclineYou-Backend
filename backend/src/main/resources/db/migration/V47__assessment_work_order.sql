-- V47 — the Assessments list in WORK order (23 Nov 2026, the owner's call).
--
-- GET /v1/assessments pages one fixed order, due_on DESC, and the web split each page of twenty into To take · To review
-- · Reviewed in the browser — so an assessment waiting to be reviewed could sit on page three under a page one that drew
-- no To review section at all. `order=work` asks the server for the sections instead, across every page:
--
--   section 0  To take    not completed (booked or missed)   due_on ASC  — the oldest owed first, then the soonest
--   section 1  To review  completed, not marked reviewed      due_on DESC — the newest back first
--   section 2  Reviewed   completed and reviewed              due_on DESC
--
-- The two directions are folded into ONE ascending integer key, so a single btree walks the whole order and the keyset
-- predicate stays a plain row comparison: section 0's key is the day number, the other two's is its negation. Both
-- expressions read only stored columns (no "today"), so they are IMMUTABLE and indexable; AssessmentListJdbcRepository
-- writes them character for character, which is what lets the planner match this index.
--
-- Without it the work order still answers, by reading every one of a trainer's assessments and sorting (measured ~5 ms at
-- 5,000 rows); with it a page reads its twenty-one rows, as the date order already does (~0.07 ms). Marking a row
-- reviewed moves its entry from section 1 to section 2 — one index write per press.

CREATE INDEX idx_assessment_trainer_work ON assessment (
    trainer_id,
    (CASE WHEN completed_at IS NULL THEN 0 WHEN read_at IS NULL THEN 1 ELSE 2 END),
    (CASE WHEN completed_at IS NULL THEN due_on - DATE '2000-01-01' ELSE DATE '2000-01-01' - due_on END),
    id
) WHERE deleted_at IS NULL;
