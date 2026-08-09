-- Add template_day to scheduled_session so workout logging can resolve
-- which program day's exercises to pre-populate for the log.
ALTER TABLE scheduled_session ADD COLUMN IF NOT EXISTS template_day INTEGER;
