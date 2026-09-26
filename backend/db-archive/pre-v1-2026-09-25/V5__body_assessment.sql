-- V5 · HOW OFTEN A CLIENT IS MEASURED, AND WHEN THE NEXT ONE IS OWED
--
-- The cadence lives on `client`, NOT derived from the metric rows, because
-- `/today` already fetches `GET /v1/clients` trainer-wide: a due-check computed
-- from last-reading-per-client costs one request per client on the screen a
-- trainer opens every morning, which is the mistake `GET /v1/packages` was added
-- to fix. `next_assessment_on` is stored rather than `last + interval` so a
-- trainer can push one week without lying about when the last reading was taken.
--
-- `trainer.*` are the defaults a new client is offered, so nobody answers the
-- same question twenty times.
--
--   WHAT THIS MIGRATION NO LONGER CREATES
--
-- As first written (13 Sep 2026) V5 also created an `assessment` table — a
-- trainer-taken "sitting" with a tape — and `body_metric.assessment_id` to group
-- a sitting's readings. Both were REMOVED from this file on 23 Sep 2026, before
-- V5 was ever committed or deployed, at the product owner's request: the
-- redesign's assessment is a questionnaire the client answers (V14), and the name
-- belongs to it. Rewriting an unshipped migration (and resetting the one local
-- database it had run on) was chosen over shipping a forward DROP.
--
-- Additive per the standing law. Backend + web only: nothing here enters sync.

ALTER TABLE public.client
    ADD COLUMN assessment_interval_days smallint,
    ADD COLUMN next_assessment_on       date,
    ADD COLUMN assessment_metrics       jsonb;

ALTER TABLE public.trainer
    ADD COLUMN assessment_interval_days smallint,
    ADD COLUMN assessment_metrics       jsonb;

-- The due band's only query: every client of this trainer with a date on them.
CREATE INDEX idx_client_next_assessment ON public.client USING btree (trainer_id, next_assessment_on)
    WHERE (next_assessment_on IS NOT NULL AND deleted_at IS NULL);

COMMENT ON COLUMN public.client.assessment_interval_days IS
    'How often this client is measured, in days. NULL = not on a cycle. See V5.';
COMMENT ON COLUMN public.client.next_assessment_on IS
    'When the next measurement is owed. Stored, not derived, so it can be pushed without rewriting history. See V5.';
COMMENT ON COLUMN public.client.assessment_metrics IS
    'Which of the six metric ids are on this client''s sheet. NULL = the trainer default. See V5.';
