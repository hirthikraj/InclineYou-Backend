-- Additive: per-client session scheduling config.
-- sessions_per_week:        how many sessions the trainer plans each week
-- session_duration_minutes: how long each session is (used to show available slots)
-- weekly_schedule:          stored pattern [{day:1, time:"09:00"}, ...] for auto-scheduling
ALTER TABLE client ADD COLUMN IF NOT EXISTS sessions_per_week         INTEGER;
ALTER TABLE client ADD COLUMN IF NOT EXISTS session_duration_minutes  INTEGER;
ALTER TABLE client ADD COLUMN IF NOT EXISTS weekly_schedule           JSONB;
