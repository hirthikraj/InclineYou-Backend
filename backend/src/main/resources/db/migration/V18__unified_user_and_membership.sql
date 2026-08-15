-- One identity per phone, and consent as a first-class state.
--
-- Two things arrive here, and they answer two different questions that the
-- schema has so far been answering by accident.
--
--   1. WHO IS THIS NUMBER — `app_user`. Until now the answer was inferred from
--      where a row happened to exist: a phone in `trainer` meant a trainer, a
--      phone in `client` meant somebody's client, and a phone in both meant the
--      app had to ask. Role is now stated rather than deduced, in one row, with
--      one lookup.
--
--   2. HAS THIS PERSON AGREED — `client.membership_status`. A trainer adding a
--      number to their roster is a claim, not a relationship. The client has to
--      accept it, and until they do there is a person in this database who has
--      never heard of us. `status` could not carry this: it is the TRAINER's
--      view of the arrangement (are we training, is it on hold, is it over) and
--      overloading it with the CLIENT's consent would make one column answer to
--      two people, who disagree.
--
-- Additive only, per the schema law: one new table, six new nullable/defaulted
-- columns, no renames, no retypes, no drops.

-- ─── app_user ────────────────────────────────────────────────────────────────
-- Deliberately thin. It holds identity and nothing else — no name, no profile,
-- no settings — because everything else differs by role and belongs in the
-- role's own table. Sign-in reads this plus a join; the dashboard reads the fat
-- rows afterwards, which is the whole point of splitting them.
CREATE TABLE IF NOT EXISTS app_user (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The login. Unique across the whole product, which is what makes role
    -- single-valued: one number, one person, one answer.
    phone               VARCHAR(15) NOT NULL UNIQUE,

    -- 'trainer' | 'client' | 'gym_admin'
    --
    -- A plain string, like every other status in this schema, so adding a role
    -- is a code change and not a migration. `gym_admin` is reserved now and
    -- built later: reserving the value costs nothing, whereas discovering later
    -- that the column cannot hold it costs a migration on a live table.
    --
    -- Exclusive by decision. A trainer's number cannot also sit on a roster —
    -- the roster-add path rejects it — so this column is the entire answer to
    -- "which half of the product is this person", and sign-in never asks twice.
    role                VARCHAR(20) NOT NULL,

    -- When they accepted the privacy policy. NULL for a trainer who predates
    -- this column and for a client who has been invited but has not answered.
    -- A timestamp rather than a boolean because "when" is the only form of this
    -- fact worth keeping: consent given is evidence, and evidence has a date.
    privacy_accepted_at TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

DROP TRIGGER IF EXISTS trg_app_user_updated_at ON app_user;
CREATE TRIGGER trg_app_user_updated_at
    BEFORE UPDATE ON app_user
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── membership consent on client ────────────────────────────────────────────
-- `client` is ALREADY the trainer↔client link: one client row has exactly one
-- trainer_id, and eight tables carry an FK to client.id. A separate link table
-- would be one-to-one with rows that already exist, so consent is annotated
-- onto the relationship rather than duplicated beside it.
ALTER TABLE client
    -- 'invited' | 'accepted' | 'declined' | 'paused' | 'removed'
    --
    -- DEFAULT 'accepted' is doing real work: every client row that exists when
    -- this migration runs is a live coaching arrangement whose trainer has been
    -- logging sessions and taking money against it. Defaulting them to
    -- 'invited' would put a consent wall in front of people who have been
    -- training for months, which is the one outcome this column must not cause.
    -- New rows are written 'invited' explicitly by the roster-add path.
    ADD COLUMN IF NOT EXISTS membership_status VARCHAR(20) NOT NULL DEFAULT 'accepted',

    -- The four moments. Separate columns rather than one `status_changed_at`,
    -- because a membership can be invited, accepted, and later removed, and the
    -- invitation date is still the answer to "how long has this been going on".
    ADD COLUMN IF NOT EXISTS invited_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS accepted_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS declined_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS removed_at   TIMESTAMPTZ,

    -- When the client acknowledged being removed, on their own phone.
    --
    -- Without this the removal notice is permanent: the row is kept on purpose
    -- (the trainer's payments, packages and session history all point at it),
    -- so `membership_status = 'removed'` stays true forever and sign-in would
    -- redraw "Ravi removed you" every single time. Stamping the acknowledgement
    -- is what lets the notice be shown exactly once.
    ADD COLUMN IF NOT EXISTS removed_ack_at TIMESTAMPTZ;

-- Sign-in filters on this in the same breath as the phone lookup.
CREATE INDEX IF NOT EXISTS idx_client_membership_status
    ON client (phone, membership_status)
    WHERE phone IS NOT NULL AND deleted_at IS NULL;

-- ─── backfill ────────────────────────────────────────────────────────────────
-- Trainers first, and that ordering is the tiebreak.
--
-- A number that is currently BOTH a trainer and somebody's client is legal in
-- the old model and illegal in the new one, so one of the two has to win. The
-- trainer does: they have a workspace, a roster, a price list and a money book
-- behind that number, and demoting them to a client would strand all of it,
-- whereas the client side of the same person is one row their trainer still
-- owns. Those client rows are deliberately NOT deleted — the trainer's books
-- must not change because we tightened an identity rule — but that person now
-- signs in as a trainer only.
--
-- To find them after deploying:
--   SELECT c.phone FROM client c JOIN trainer t ON t.phone = c.phone
--   WHERE c.deleted_at IS NULL AND t.deleted_at IS NULL;
INSERT INTO app_user (phone, role, created_at)
SELECT t.phone, 'trainer', t.created_at
FROM trainer t
WHERE t.deleted_at IS NULL
  AND t.phone IS NOT NULL
ON CONFLICT (phone) DO NOTHING;

-- Then everyone who is only ever a client. DISTINCT because one person on two
-- trainers' rosters is two client rows and one human being; the earliest
-- created_at is kept so the identity dates from their first membership.
INSERT INTO app_user (phone, role, created_at)
SELECT c.phone, 'client', MIN(c.created_at)
FROM client c
WHERE c.deleted_at IS NULL
  AND c.phone IS NOT NULL
GROUP BY c.phone
ON CONFLICT (phone) DO NOTHING;

-- Existing memberships are consented by definition (see the DEFAULT above), so
-- give them an accepted_at rather than leaving the timestamp NULL and the
-- status saying otherwise. Their creation date is the honest answer we have.
UPDATE client
SET accepted_at = created_at
WHERE membership_status = 'accepted'
  AND accepted_at IS NULL
  AND deleted_at IS NULL;
