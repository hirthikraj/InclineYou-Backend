-- V7 · A BIRTH DATE ON THE CLIENT, AND A NOTE THE CLIENT MAY READ
--
--   `client.date_of_birth`
--
-- The redesigned client file draws a *Physical information* card — height,
-- latest weight, birth date with the age beside it — and had nowhere to keep
-- the third. A DATE and not an age, because an age stored in September is wrong
-- by March and nothing would ever correct it; the card derives the age on read.
--
-- It is personal data and NOT health data, and that line is held by what is
-- deliberately absent: the metabolism rows a birth date was first wanted for
-- (BMR, a calorie target) were cut, and `client.sex` must not arrive beside it,
-- because the pair is an input to a clinical estimate while the date alone is
-- only a date. Nullable, since most trainers will never ask.
--
-- Not in the phone's push. `pushClients`' upsert names its columns and this is
-- not one of them, so a phone that has never heard of V7 cannot null it on the
-- way past — the same protection V30 gave `paused_at`. It does ride the pull,
-- the way V5's three columns do (the pull selects `c.*`), and WatermelonDB
-- drops a raw column its schema does not declare.
--
--   `client_note.shared_with_client`
--
-- V29 made a note private to its AUTHOR (`trainer_id`), so a teammate reading a
-- client's file across a team gets an empty list. That rule is unchanged: this
-- column opens a note to a DIFFERENT audience — the client it is about, through
-- the portal — and never to a teammate.
--
-- `DEFAULT false NOT NULL` IN THE DDL, and that default is the whole safety
-- argument: every note already in the table was written by somebody who
-- believed nobody else would read it, and a nullable column read as "shared
-- unless it says otherwise" would publish all of them on the day the portal
-- read lands. Sharing is a per-note act the trainer takes after writing it.
--
-- Additive. Backend + web only; `client_note` is not in sync.

ALTER TABLE public.client
    ADD COLUMN date_of_birth date;

COMMENT ON COLUMN public.client.date_of_birth IS
    'Personal data, not health data. The age is derived on read, never stored. Not in the phone''s push upsert. See V7.';

ALTER TABLE public.client_note
    ADD COLUMN shared_with_client boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN public.client_note.shared_with_client IS
    'TRUE = the client this note is about may read it in the portal. Never widens to a teammate (V29). Defaults FALSE because every earlier note was written as private. See V7.';
