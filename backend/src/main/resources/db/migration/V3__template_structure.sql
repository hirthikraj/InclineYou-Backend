-- Additive: add structure JSONB to template for the exercise blueprint.
-- Nullable so existing rows are unaffected.
ALTER TABLE template ADD COLUMN IF NOT EXISTS structure JSONB;
