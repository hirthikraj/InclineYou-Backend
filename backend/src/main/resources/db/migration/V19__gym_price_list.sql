-- Two price lists, and what came off one at the till.
--
-- A trainer employed at a gym sells two different things. Their own packs, which
-- they price and can discount, and the packages the gym's counter sells, which
-- they can do neither to. Both are price-list entries — a name, a session count,
-- an amount, a validity — so this is one column on `pack` rather than a second
-- table that every read of a price list would then have to union.
--
--   owner  'trainer' | 'gym'
--
-- Defaulted rather than nullable so old clients, which never send the field,
-- keep writing the only thing they ever meant. The app treats a missing owner as
-- the trainer's own for exactly the same reason.
--
-- `discount_amount` lands on the SOLD package, not on the pack: a discount is
-- given to one client on one sale, and putting it on the price list would
-- re-quote everybody else. `package.amount` stays what that client owes — it is
-- already net — and this column only records why it is lower than the list
-- price. Nullable, because most sales have nothing to say here.
--
-- Additive only, per the schema law: two new columns, nothing renamed, retyped,
-- dropped or repurposed. Statuses stay plain strings validated in application
-- code, so a third owner one day is a code change and not a migration.

ALTER TABLE pack
    ADD COLUMN owner VARCHAR(20) NOT NULL DEFAULT 'trainer';

ALTER TABLE package
    ADD COLUMN discount_amount NUMERIC(10,2);

-- Adding a client offers one list or the other depending on who collects, so
-- the read is always trainer + owner. The existing trainer index would do for a
-- handful of rows; this keeps it exact as price lists grow.
CREATE INDEX idx_pack_trainer_owner ON pack (trainer_id, owner);
