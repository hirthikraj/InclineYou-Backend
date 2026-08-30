-- Nudges, moved out of a screen and onto the rows.
--
-- The decision this migration serves: **a nudge belongs next to the thing that
-- triggered it.** There is no Nudges destination — the buttons live on the Today
-- cards, the client rows, the dues list, the packages that are ending and the
-- sessions nobody turned up to. What is left when the sending moves onto the rows
-- is two things, and neither of them had anywhere to live:
--
--   1. the trainer's own WORDING, edited once and read by every button;
--   2. the RECORD of what was sent, readable, so the product stops re-nagging
--      about a client the trainer messaged yesterday.
--
-- Additive only, per the schema law: one new table, one nullable column, one
-- index. Nothing renamed, retyped, dropped or repurposed. A build that predates
-- this keeps working — it never writes the new column and reads it as absent.
--
-- ─── WHY THIS IS NOT `nudge_rule.message` ────────────────────────────────────
--
-- V12's `nudge_rule` already carries a `message` column with `{name}`,
-- `{lastdate}`, `{days}` and `{amount}` substituted at send time, and reusing it
-- was the first thing considered. It is the wrong table, for one reason that is
-- not a matter of taste:
--
--   `nudge_rule` is one row per trainer per KIND — 'quiet' | 'pack_low' |
--   'overdue' | 'well_done' | 'birthday' — and the phone's `NudgeRulesScreen`
--   iterates it and renders those five. It answers *WHEN should a nudge be
--   raised, and should it go automatically*: a threshold, an action, an enabled
--   flag. Its `message` is the draft for that ONE automation rule.
--
--   This table answers *WHAT DOES THE MESSAGE SAY*, keyed by the template name
--   the nudge endpoint already speaks — `payment_reminder`, `renewal`,
--   `missed_session`, `check_in`, `well_done`, `session_reminder`, and the two
--   this pass adds. Eight names, three of which have no rule and never will
--   (nothing schedules a post-session summary).
--
-- Writing template names into `nudge_rule.kind` would have put rows the phone's
-- rule editor cannot label into a table it iterates — a regression to the other
-- half caused by a write on this one, and `app/` is not edited from the web half
-- without being asked.
--
-- The honest cost, stated rather than hidden: a trainer who edits a rule's draft
-- on the phone and the same template's body on the web now has two strings. They
-- do not fight — the phone's automation reads its rule, the REST endpoint reads
-- this table — but they are two. Closing it means the phone adopting
-- `nudge_template` and `nudge_rule.message` becoming a per-rule override of it,
-- which is a change to `app/` and belongs in a commit that moves both halves.
--
-- NOT IN SYNC, per V26's, V28's, V29's and V30's precedent: nothing here enters
-- the WatermelonDB envelope, so no phone build notices. The phone keeps its own
-- built-in wording until it adopts the routes.

-- ─── nudge_template ──────────────────────────────────────────────────────────
-- One row per trainer per template name, holding an OVERRIDE of the built-in
-- wording. A trainer who has never opened the library has no rows at all and
-- gets the defaults — which is why this is an override table and not a seeded
-- one: seeding eight rows per trainer would freeze today's copy into every
-- account, so improving a default sentence would reach nobody who ever signed up.
--
-- `name` is the template name the nudge endpoint speaks, and it is a plain
-- string for the same reason `nudge_rule.kind` is: a ninth template should cost a
-- deploy, not a migration. `NudgeTemplateCatalog` is the whitelist, in code.
CREATE TABLE nudge_template (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id UUID         NOT NULL REFERENCES trainer(id),
    name       VARCHAR(50)  NOT NULL,
    -- The trainer's wording, with {name}, {count}, {nth}, {amount}, {package},
    -- {days} and {trainer} substituted at send time. Never NULL: an empty
    -- override is a DELETE, which is what "reset to the default" means — a row
    -- holding an empty string would send an empty WhatsApp.
    body       TEXT         NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_nudge_template_trainer_id ON nudge_template (trainer_id);
-- One override per name per trainer. The PUT is an upsert on exactly this.
CREATE UNIQUE INDEX idx_nudge_template_name
    ON nudge_template (trainer_id, name) WHERE deleted_at IS NULL;

-- ─── nudge_log · the message that was actually drafted ───────────────────────
-- V1 recorded THAT a nudge happened — trainer, client, channel, template name,
-- a status and a timestamp — and never what it said. That was enough while the
-- wording was a constant in `NudgeService`: the template name and the code
-- together reconstructed the sentence.
--
-- It stops being enough the moment the trainer owns the wording. Two readers
-- need the text and neither can rebuild it: the client's file draws a follow-up
-- history ("Payment reminder · 3 days ago" with the message under it), and a
-- trainer who edits a template must not have last month's messages silently
-- re-rendered in this month's words.
--
-- Nullable, because every row written before today has no answer and inventing
-- one would be worse than an absence the reader can see.
ALTER TABLE nudge_log
    ADD COLUMN IF NOT EXISTS message TEXT;

-- The two reads this pass adds are both "the recent nudges for this trainer",
-- one of them narrowed to a client and both newest-first. The V1 indexes are on
-- `trainer_id` and `client_id` separately, which makes the client read a scan of
-- everything that client has ever been sent by anybody.
--
-- `deleted_at IS NULL` is in the predicate because every read here has it: a
-- deleted nudge is one the phone withdrew, and it must not hold a cooldown open.
CREATE INDEX idx_nudge_log_trainer_sent
    ON nudge_log (trainer_id, sent_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_nudge_log_client_sent
    ON nudge_log (client_id, sent_at DESC) WHERE deleted_at IS NULL;
