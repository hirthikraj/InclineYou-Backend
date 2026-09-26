import type { ReactNode } from 'react';

/**
 * Invoice — one bill, as a document. `.inv`.
 *
 * ── WHY THIS IS A COMPONENT AND NOT A CARD WITH A TABLE IN IT ───────────────
 *
 * Every other money surface in this product answers *how are things going*: a
 * stat tile, a subscription bar, a ledger sorted by date. They are all built
 * for a reader who already knows the context — the trainer, on their own book,
 * scanning.
 *
 * An invoice has a different reader. It is asked for because somebody ELSE is
 * going to see it: an employer reimbursing a wellness allowance, an insurer, a
 * CA in March. That reader does not know who either party is, has no idea what
 * a "12-session pack" is, and needs one number they can quote in an email. So
 * the document names both parties in full, states what was bought in a
 * sentence, and gives the total the only large figure on the surface.
 *
 * ── WHO GETS ONE, AND WHY THAT IS NOT THIS FILE'S DECISION ──────────────────
 *
 * In this product an invoice belongs to a client the TRAINER collects from. A
 * client the gym's counter signed up pays the gym; the gym raises that receipt
 * and takes its cut, and the trainer's share arrives as a settlement rather
 * than as a sale. A trainer who billed that client would be invoicing for money
 * they never took, for a service already billed.
 *
 * That rule is enforced on the write — `POST /v1/payments/{id}/invoice` refuses
 * a gym-collected row — and stated on the screen that hides the verb. It is
 * deliberately NOT expressed here as a prop this component would have to
 * validate: a document component that knows about gym contracts is a document
 * component that has to be changed when the contract does.
 *
 * ── `number: null` IS A REAL STATE AND IT IS DRAWN ──────────────────────────
 *
 * Most payments never get a bill, and the commonest thing the trainer is
 * looking at is a payment that COULD have one. Rather than make the caller
 * render a different surface for that, the masthead says *Not raised yet* in
 * the number's place and the rest of the document draws exactly as it will once
 * the number exists. The trainer sees what they are about to send before they
 * commit to a number that then has to exist forever in a sequence.
 *
 * ── THE TOTALS ARE A LIST, NOT THREE PROPS ──────────────────────────────────
 *
 * `subtotal`/`discount`/`total` would be this component deciding the
 * arithmetic, and the arithmetic here is domain law: what a discount is, when
 * the gym's cut is and is not a line, whether GST applies at all. All of that
 * lives in `lib/money`. So the caller hands over rows and marks which one is
 * the total; the component owns only how a total looks.
 */

export type InvoiceParty = {
  /** The name a stranger would have to match against a bank statement. */
  name: ReactNode;
  /**
   * Everything under the name — a phone number, a UPI handle, a line of
   * address. One per array entry, each on its own line.
   */
  lines?: ReactNode[];
};

export type InvoiceLine = {
  key?: string;
  /** What was bought, in the words the client would recognise. */
  description: ReactNode;
  /** The second line: dates covered, the per-session price, a discount note. */
  detail?: ReactNode;
  /** "12 × ₹750". Optional — a monthly fee has no count to show. */
  qty?: ReactNode;
  amount: ReactNode;
};

export type InvoiceTotal = {
  key?: string;
  k: ReactNode;
  v: ReactNode;
  /** The last row: ruled off above, and the only large figure on the page. */
  total?: boolean;
};

export function Invoice({
  number,
  status,
  dates,
  from,
  to,
  lines,
  totals,
  foot,
  className,
}: {
  /** `INV-2627-0014`, or null for a bill that has not been raised yet. */
  number: string | null;
  /** Usually a `Tag` — *Paid*, *Due 13 Sep*. */
  status?: ReactNode;
  /** One or two short strings under the status: when it was raised, when paid. */
  dates?: ReactNode[];
  from: InvoiceParty;
  to: InvoiceParty;
  lines: InvoiceLine[];
  totals: InvoiceTotal[];
  /**
   * The tax line and the payment terms. Almost always includes the sentence
   * saying no GST is charged and why — see the `.inv` block in webapp.css for
   * why an absence has to be stated rather than omitted.
   */
  foot?: ReactNode;
  className?: string;
}) {
  return (
    <article className={['inv', className].filter(Boolean).join(' ')}>
      <header className="inv__hd">
        <div>
          <span className="inv__mk">Invoice</span>
          {/*
            The number is `<b>` rather than a heading. A heading here would put
            a string nobody reads aloud into the document outline above the
            client's own name — and this surface is opened from inside a client
            file whose `h1` is that name.
          */}
          <b className="inv__no">{number ?? 'Not raised yet'}</b>
        </div>
        <div className="inv__meta">
          {status}
          {dates?.map((d, i) => (
            <span key={i} className="inv__date">
              {d}
            </span>
          ))}
        </div>
      </header>

      <div className="inv__who">
        <div>
          <span className="inv__mk">From</span>
          <b className="inv__pn">{from.name}</b>
          {from.lines?.map((l, i) => (
            <p key={i} className="inv__pl">
              {l}
            </p>
          ))}
        </div>
        <div>
          <span className="inv__mk">Billed to</span>
          <b className="inv__pn">{to.name}</b>
          {to.lines?.map((l, i) => (
            <p key={i} className="inv__pl">
              {l}
            </p>
          ))}
        </div>
      </div>

      {lines.map((l, i) => (
        <div className="inv__ln" key={l.key ?? i}>
          <span className="inv__d">
            {l.description}
            {l.detail && <span className="inv__dt">{l.detail}</span>}
          </span>
          {l.qty && <span className="inv__q">{l.qty}</span>}
          <span className="inv__amt">{l.amount}</span>
        </div>
      ))}

      <div className="inv__sum">
        {totals.map((t, i) => (
          <div
            className={['inv__sr', t.total ? 'inv__sr--tot' : null].filter(Boolean).join(' ')}
            key={t.key ?? i}
          >
            <span>{t.k}</span>
            <b>{t.v}</b>
          </div>
        ))}
      </div>

      {foot && <footer className="inv__ft">{foot}</footer>}
    </article>
  );
}
