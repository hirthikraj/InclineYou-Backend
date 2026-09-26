-- V6 · GENDER IS ASKED BECAUSE CLIENTS FILTER ON IT
--
-- The redesigned setup flow asks it on step 1, beside the name and the V33
-- headline, and marks the step answered only when it has an answer. Without a
-- column the PATCH dropped it silently and no trainer could finish setup.
--
-- It is here for the same reason `languages` is: a large share of this market
-- is women who will only train with a woman, and a directory that cannot answer
-- that sends them to WhatsApp to ask one trainer at a time. It is profile data
-- a client reads, like V33's three columns, and nothing in the product branches
-- on it.
--
-- `undisclosed` is an ANSWER, not an absence — "prefer not to say" is somebody
-- having been asked and choosing — so NULL keeps meaning "never asked". The
-- vocabulary (`woman` · `man` · `nonbinary` · `undisclosed`) is held in
-- `TrainerService` rather than in a CHECK, so a fifth id is a line of Java and
-- not a migration, the way the V33 caps are.
--
-- Additive. Backend + web only: nothing enters sync, so no phone notices.

ALTER TABLE public.trainer
    ADD COLUMN gender varchar(24);

COMMENT ON COLUMN public.trainer.gender IS
    'woman | man | nonbinary | undisclosed. NULL = never asked; undisclosed is a real answer. Validated in TrainerService. See V6.';
