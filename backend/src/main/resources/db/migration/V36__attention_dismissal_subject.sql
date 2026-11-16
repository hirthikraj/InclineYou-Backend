-- "Not again" is about one situation, not about a client forever (16 Nov 2026).
--
-- A dismissal is keyed (trainer, client, kind), and the queue brought a row back only when its band got WORSE. So
-- "Not again" on Meera's pack running low in March also hid her next pack running low in August, and "Not again" on a
-- late payment hid every later one at that band. subject_at is the start of the situation the trainer silenced, as
-- the queue dated it (the row's `at`: the pack's sale, the oldest due date, the last session before going quiet …);
-- a row whose situation started later is a new one and is shown again. NULL on rows written before this, which keep
-- the old reading. Additive.

ALTER TABLE attention_dismissal ADD COLUMN subject_at timestamptz;

COMMENT ON COLUMN attention_dismissal.subject_at IS
    'When the silenced situation started, as the queue dated it; a later one is a new situation and is shown again. NULL on rows written before 16 Nov 2026.';
