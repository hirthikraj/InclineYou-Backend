-- How the trainer works: 'independent' | 'gym' | 'both'.
--
-- A HINT, not a type. The data-model law stands: gym-vs-freelance is decided
-- per CLIENT (client.payment_mode, client.trainer_split_percent), because the
-- same trainer serves both kinds at once and the mix changes month to month.
-- This column only records the onboarding answer so setup can show the right
-- price-list sections and add-client can pre-select who collects — it must
-- never gate a feature. Plain string, same reasoning as experience_band: a new
-- mode is a code change, not a migration.
--
-- Additive only: one nullable column. NULL = never asked (pre-V23 trainers).
ALTER TABLE trainer
    ADD COLUMN IF NOT EXISTS work_mode VARCHAR(20);
