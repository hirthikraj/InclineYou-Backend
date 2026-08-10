-- Screen 06 · Money · FR-6
--
-- Train X never holds, moves or confirms money. What it keeps is the BOOK —
-- a digital bahi khata for a trainer paid in cash on a gym floor, by UPI into
-- their own VPA, or at the gym's counter. Nothing in this migration is a
-- balance, a payout or a settlement account, because none of those exist.
--
-- Additive only, as always: two new tables, and new nullable / defaulted
-- columns on three existing ones. Nothing is renamed, retyped or dropped, and
-- no column changes meaning. A build that predates this migration keeps
-- working — it simply never writes the new fields, and reads them as absent.

-- ─── pack ─────────────────────────────────────────────────────────────────────
-- The price list: what this trainer SELLS. Distinct from `package`, which is
-- one of these sold to one client — the difference between a menu and a bill.
--
-- Kept separate rather than derived from packages already sold, because a
-- trainer defines their prices during setup, before a single client exists, and
-- because a pack has to be retirable without rewriting the history of everyone
-- who bought it. Retiring is `status = 'inactive'`: the pack stops being
-- offered, and every package sold from it stays exactly as it was.
--
-- type:   'session_pack' | 'monthly' | 'single'
-- status: 'active' | 'inactive'   — never deleted while a package points at it
CREATE TABLE pack (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id    UUID          NOT NULL REFERENCES trainer(id),
    name          VARCHAR(80)   NOT NULL,
    type          VARCHAR(20)   NOT NULL DEFAULT 'session_pack',
    -- NULL for a monthly pack, which is a duration and not a count.
    sessions      INTEGER,
    amount        NUMERIC(10,2) NOT NULL,
    currency      VARCHAR(3)    NOT NULL DEFAULT 'INR',
    -- How long the client has to use it. NULL = no expiry, which is what most
    -- Indian trainers actually run.
    validity_days INTEGER,
    status        VARCHAR(20)   NOT NULL DEFAULT 'active',
    -- The trainer's own ordering on the Packs screen. Not a sort key we invent.
    order_index   INTEGER       NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ
);
CREATE INDEX idx_pack_trainer_id ON pack (trainer_id);

-- ─── gym_settlement ───────────────────────────────────────────────────────────
-- Money going OUT: the gym's cut for a month, and whether it has been handed
-- over. Its own table rather than a `direction` flag on `payment`, because a
-- payment is a client paying a trainer — it has a client_id, a package and a
-- receipt — and a gym settlement has none of those. Overloading one table
-- would have meant making `payment.client_id` nullable, which is exactly the
-- kind of quiet retype the schema law forbids.
--
-- These are the TRAINER'S figures, computed from their own book. Train X does
-- not talk to any gym's system, and the Gym share screen says so.
--
-- status: 'due' | 'settled'
CREATE TABLE gym_settlement (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id       UUID          NOT NULL REFERENCES trainer(id),
    -- 'YYYY-MM'. A month is the unit every gym in India settles on.
    period           VARCHAR(7)    NOT NULL,
    amount           NUMERIC(10,2) NOT NULL,
    -- What the amount was worked out from, so the row can be argued with.
    sessions_counted INTEGER,
    -- Denormalised on purpose: if the trainer changes gyms in October, the
    -- September row must keep saying which gym it was owed to.
    gym_name         VARCHAR(120),
    status           VARCHAR(20)   NOT NULL DEFAULT 'due',
    due_at           TIMESTAMPTZ,
    settled_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ
);
CREATE INDEX idx_gym_settlement_trainer_id ON gym_settlement (trainer_id);
CREATE UNIQUE INDEX idx_gym_settlement_period
    ON gym_settlement (trainer_id, period) WHERE deleted_at IS NULL;

-- ─── package · the debt side of the book ──────────────────────────────────────
ALTER TABLE package
    -- Which price-list entry this was sold from. Nullable forever: every
    -- package that exists today was created before the price list did.
    ADD COLUMN IF NOT EXISTS pack_id             UUID REFERENCES pack(id),

    -- When the money was due. Without it there is no such thing as "11 days
    -- late", and chasing is the highest-value job on the Money screen.
    -- NULL means never agreed, which reads as "due, not late".
    ADD COLUMN IF NOT EXISTS due_date            DATE,

    -- A write-off is not a delete. The debt stays visible in the client's book
    -- and in the year's written-off total; it just stops being chased. Storing
    -- the amount separately from `amount` is what keeps both figures true when
    -- a client paid ₹2,000 of ₹6,000 and the rest was let go.
    ADD COLUMN IF NOT EXISTS written_off_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS written_off_amount  NUMERIC(10,2);

-- ─── payment · the credit side ────────────────────────────────────────────────
ALTER TABLE payment
    -- The gym's cut, applied AT RECORD TIME and stored on the entry. If the
    -- contract changes from 50% to 40% in October, September's split must not
    -- move — so the percentage is copied onto the row, never looked up later.
    ADD COLUMN IF NOT EXISTS gym_share_amount NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS share_percent    NUMERIC(5,2),

    -- Issued on the device, from a device-scoped range, because cash arrives in
    -- basements with no signal. Two phones must never mint the same number.
    ADD COLUMN IF NOT EXISTS receipt_no       VARCHAR(30),

    -- "He paid the rest in cash on Tuesday." Free text, never parsed.
    ADD COLUMN IF NOT EXISTS note             TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_paid_at ON payment (trainer_id, paid_at);

-- ─── trainer · the gym arrangement ────────────────────────────────────────────
ALTER TABLE trainer
    -- NULL gym name means no gym: an independent trainer keeps 100%, and the
    -- "your share" row is hidden rather than shown as a meaningless full bar.
    ADD COLUMN IF NOT EXISTS gym_name          VARCHAR(120),
    -- What the GYM keeps, as a percentage of floor sessions. Indian gyms take
    -- 50–70% of personal-training fees. Remote sessions are always 0%, which
    -- is a rule in code, not a second column.
    ADD COLUMN IF NOT EXISTS gym_share_percent NUMERIC(5,2);

-- ─── updated_at triggers for the two new tables ───────────────────────────────
CREATE TRIGGER trg_pack_updated_at
    BEFORE UPDATE ON pack
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_gym_settlement_updated_at
    BEFORE UPDATE ON gym_settlement
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
