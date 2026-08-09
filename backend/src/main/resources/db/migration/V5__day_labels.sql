-- Additive: named day-level labels on templates (e.g. {"1":"Push Day","3":"Pull Day"})
ALTER TABLE template ADD COLUMN IF NOT EXISTS day_labels JSONB;

-- Additive: denormalized day label on each scheduled session for fast list display
ALTER TABLE scheduled_session ADD COLUMN IF NOT EXISTS day_label VARCHAR(100);
