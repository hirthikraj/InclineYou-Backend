-- V8 · A COLLECTED PAYMENT CAN BE BILLED, AND THE NUMBER IS THE TRAINER'S
--
-- The client file's Payments tab gains *Raise an invoice* on a collected row:
-- the web builds a WhatsApp bill with the trainer's UPI id and needs a number
-- to print on it. `INV-<FY>-<NNNN>` — `INV-2627-0007` is the seventh bill of
-- the financial year April 2026 – March 2027.
--
--   MINTED ON REQUEST, NEVER ON WRITE
--
-- Most collected payments are never billed — a cash handover in a gym needs no
-- paper — and a number minted on every insert would make the series a count of
-- payments with holes wherever nobody asked. So `invoice_no` stays NULL until
-- `POST /v1/payments/{id}/invoice`, and that route is idempotent: a second
-- press returns the number the first one minted.
--
--   ONE SERIES PER TRAINER PER FINANCIAL YEAR, AND NOT PER WORKSPACE
--
-- A bill series belongs to whoever ISSUES the bills, and that is the trainer,
-- however many workspaces they coach in (V37). Two `INV-2627-0001`s from one
-- coach — one per workspace — is the collision a series exists to prevent.
-- Hence `invoice_counter` carries no `tenant_id` and is NOT policied, for the
-- reason `trainer` is not: it is keyed on an identity that spans tenants. It
-- holds no money and no client, only the last number used, and it is read and
-- written by one statement scoped to the caller's own `trainer_id`.
--
-- The counter row is taken with `INSERT … ON CONFLICT DO UPDATE … RETURNING`,
-- which locks it for the transaction, so two presses in the same second get
-- consecutive numbers rather than the same one. The unique index on `payment`
-- is the backstop, and because an index sees every row regardless of RLS, it
-- holds across workspaces even though no single request can see them all.
--
--   WHAT THIS BILL IS NOT
--
-- It is the trainer's bill to their client. It computes no tax, and the copy on
-- both halves must not call it a tax invoice — `PRICING.md`'s GST-compliant
-- invoices are InclineYou's own billing of the trainer, a different document.
-- A gym-collected row is refused (the gym raises its own receipt), and so is a
-- row that is pending or written off, because the bill prints *Paid on*.
--
-- Additive. `invoice_no` / `invoiced_at` are not in `pushPayments`' upsert, so
-- a phone cannot null them; they ride the pull like any `payment` column. The
-- phone's own device-minted `receipt_no` (V11) is untouched and unrelated.

ALTER TABLE public.payment
    ADD COLUMN invoice_no  varchar(20),
    ADD COLUMN invoiced_at timestamp with time zone;

CREATE UNIQUE INDEX idx_payment_invoice_no ON public.payment USING btree (trainer_id, invoice_no)
    WHERE (invoice_no IS NOT NULL);

COMMENT ON COLUMN public.payment.invoice_no IS
    'INV-<FY>-<NNNN>, minted on request by POST /v1/payments/{id}/invoice, never on write. Per trainer per financial year (April-March), across workspaces. Not a tax invoice. See V8.';

CREATE TABLE public.invoice_counter (
    trainer_id uuid     NOT NULL,
    fy         smallint NOT NULL,
    last_seq   integer  NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoice_counter_pkey PRIMARY KEY (trainer_id, fy),
    CONSTRAINT invoice_counter_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES public.trainer(id),
    CONSTRAINT invoice_counter_seq_positive CHECK (last_seq > 0)
);

COMMENT ON TABLE public.invoice_counter IS
    'The last invoice number used, per trainer per financial year. `fy` is the starting year''s last two digits followed by the next''s (2627 = Apr 2026 - Mar 2027). No tenant_id and not policied: a bill series belongs to the issuer, who spans workspaces. See V8.';
