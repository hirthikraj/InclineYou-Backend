-- Money integrity and the ledger's index (3 Oct 2026) — the five gaps the Business build turned up.
-- Additive only: nothing is dropped, renamed or repurposed; one function is replaced in place.

-- 1. A package cannot be over-paid, in the database as well as in the service.
--    check_package_ledger guarded write-offs and refunds but returned early for a PAID row, so
--    the service's PAYMENT_OVER_DUE check was the only wall — and two simultaneous payments could
--    each pass it. The package row is already locked FOR UPDATE below, which is what serialises
--    them. A PENDING row is deliberately not capped: it is money expected, not money taken, and
--    the service bounds it by amountDue less the other pending rows.
CREATE OR REPLACE FUNCTION check_package_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total numeric; paid numeric; forgiven numeric; returned numeric;
BEGIN
  IF NEW.status NOT IN ('paid', 'write_off', 'refund') OR NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  SELECT amount INTO total FROM package WHERE id = NEW.package_id FOR UPDATE;   -- one ledger change at a time per package
  SELECT coalesce(sum(amount) FILTER (WHERE status = 'paid'), 0),
         coalesce(sum(amount) FILTER (WHERE status = 'write_off'), 0),
         coalesce(sum(amount) FILTER (WHERE status = 'refund'), 0)
    INTO paid, forgiven, returned
    FROM payment WHERE package_id = NEW.package_id AND deleted_at IS NULL AND id <> NEW.id;
  IF NEW.status = 'paid' AND paid + forgiven + NEW.amount > total THEN
    RAISE EXCEPTION 'payment of % exceeds what is still due on package % (%)', NEW.amount, NEW.package_id, total - paid - forgiven
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'write_off' AND paid + forgiven + NEW.amount > total THEN
    RAISE EXCEPTION 'write-off of % exceeds what is still due on package % (%)', NEW.amount, NEW.package_id, total - paid - forgiven
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'refund' AND (paid < total OR forgiven > 0) THEN
    RAISE EXCEPTION 'package % is not fully paid: only a fully paid package can be refunded', NEW.package_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'refund' AND returned + NEW.amount > paid THEN
    RAISE EXCEPTION 'refund of % exceeds what was paid on package % (%)', NEW.amount, NEW.package_id, paid - returned
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- 2. R85: the instant a payment row counts on, as a column, and the one index the mixed-status
--    ledger and its CSV walk in order. Exactly the CASE the read used (the payment_state_shape
--    check makes exactly one of the three stamps non-null per status), so no row moves.
ALTER TABLE payment ADD COLUMN book_at timestamptz
    GENERATED ALWAYS AS (coalesce(paid_at, written_off_at, refunded_at, created_at)) STORED;

CREATE INDEX idx_payment_ledger ON payment (trainer_id, book_at DESC, id DESC) WHERE deleted_at IS NULL;

-- 3. A trainer's live packs have one name each (PACK_NAME_TAKEN). The service checks first to
--    answer with a sentence; this index is what stops the race. A deleted pack frees its name.
CREATE UNIQUE INDEX uq_pack_live_name ON pack (trainer_id, lower(name)) WHERE deleted_at IS NULL;

-- 4. The gym's part of a package price, defined once. The summary, the gym page and the
--    per-pack shares each carried their own copy of this CASE. No share means the trainer keeps
--    all of it, so the gym's cut is 0.
CREATE FUNCTION gym_cut(amount numeric, share_percent numeric, share_amount numeric) RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN share_percent IS NOT NULL THEN amount * (100 - share_percent) / 100
              WHEN share_amount  IS NOT NULL THEN greatest(amount - share_amount, 0)
              ELSE 0 END
$$;

-- 5. Pay terms with one gym never overlap in time. uq_gym_arrangement_open already allowed one
--    RUNNING row; closed rows could still overlap, which only the service prevented. A range is
--    half-open: [starts_month, the month after ends_month). btree_gist is a trusted extension.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE gym_arrangement ADD CONSTRAINT gym_arrangement_no_overlap EXCLUDE USING gist (
    trainer_id WITH =,
    daterange(starts_month, (coalesce(ends_month, 'infinity'::date) + interval '1 month')::date, '[)') WITH &&
) WHERE (deleted_at IS NULL);
