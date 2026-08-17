-- Template days become ordinal, and the weekdays move to the assignment.
--
-- A template's days used to BE weekdays: "1,3,5" in training_days meant
-- Mon/Wed/Fri, and applying the template copied those weekdays verbatim onto
-- the client. That pinned every template to one week layout — a Mon/Wed/Fri
-- template could not serve a Tue/Thu/Sat client without duplicating the whole
-- thing. From this version a template's day numbers are slots ("Day 1".."Day 7")
-- and the weekday each slot lands on is chosen per client, at apply time.

-- The client's chosen layout: which weekday each template day maps to, and at
-- what time — [{"day":1,"weekday":2,"time":"06:30"}, ...]. Written once by
-- POST /v1/templates/{id}/apply and read by the phone on sync. NULL on every
-- program applied before this existed; those were copied under the old
-- weekday-pinned semantics and their program_exercise rows already carry the
-- concrete weekdays, so they need no mapping.
ALTER TABLE program
    ADD COLUMN IF NOT EXISTS schedule JSONB;

-- Every existing template was authored under the old semantics — its day
-- numbers meant weekdays — and reinterpreting them as ordinal slots would
-- claim the trainer laid out days they never did. The decision is to clear
-- the shelf rather than translate it: soft-delete, so the deletions ride the
-- next sync pull and the rows stay recoverable by hand if one turns out to
-- matter. Programs already applied from them are untouched — the copy was
-- always independent of its source.
UPDATE template
SET deleted_at = NOW(), updated_at = NOW()
WHERE deleted_at IS NULL;
