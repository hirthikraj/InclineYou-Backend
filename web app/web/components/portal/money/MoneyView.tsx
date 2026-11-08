import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Tag } from '@/web-components/ui/Tag';

import { upiPayLink } from '@/lib/money/upi';

import { day } from '../plan/format';

export interface MoneyWire {
  visible: boolean;
  currency?: string;
  amountDue?: string;
  payments?: { items: { id: string; paidOn: string; amount: string; method: string | null; reference: string | null; packageName: string; status: string }[]; nextCursor: string | null };
  /** The trainer's UPI ID, present only when something is owed and they have set one (V31). */
  payTo?: string;
}

const METHOD: Record<string, string> = { upi: 'UPI', cash: 'Cash', bank_transfer: 'Bank transfer' };

function rupees(amount: string, currency: string): string {
  const n = Number(amount);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);
}

/**
 * What is owed and what has been paid. Neutral: a plain figure — never red, never a nudge. Since 6 Nov 2026 it carries ONE way to pay,
 * when the trainer has set a UPI ID: *Pay with UPI* opens the client's own UPI app with the trainer, the amount and a note filled in
 * (`upiPayLink`). Nothing moves through InclineYou and nothing here says the money arrived — the trainer marks it, as for cash. Without a
 * UPI ID the card says what it always said: settle it with the trainer directly.
 */
export function MoneyView({ money, trainerFirstName }: { money: MoneyWire; trainerFirstName: string }) {
  const cur = money.currency ?? 'INR';
  const due = Number(money.amountDue ?? 0);
  const items = money.payments?.items ?? [];
  return (
    <div className="pl">
      <Card className="ppg__hero">
        <Card.Body>
          <p className="pl__k">Balance</p>
          {due > 0 ? (
            <>
              <h1 className="pl__h">{rupees(money.amountDue!, cur)} to pay</h1>
              {money.payTo ? (
                <>
                  <p className="pl__s">
                    That’s what’s left on your package. Pay {trainerFirstName} by UPI at <b>{money.payTo}</b> — the
                    button opens your UPI app with the amount filled in. {trainerFirstName} marks it paid once it arrives.
                  </p>
                  <p style={{ marginTop: 12 }}>
                    <Button
                      variant="primary"
                      href={upiPayLink({
                        vpa: money.payTo,
                        payeeName: trainerFirstName,
                        amount: due,
                        currency: cur,
                        note: 'Training package',
                      })}
                    >
                      Pay {rupees(money.amountDue!, cur)} with UPI
                    </Button>
                  </p>
                </>
              ) : (
                <p className="pl__s">That’s what’s left on your package. Settle it with {trainerFirstName} directly — there’s nothing to pay here.</p>
              )}
            </>
          ) : (
            <>
              <h1 className="pl__h">You’re all square.</h1>
              <p className="pl__s">Nothing is owed on your packages.</p>
            </>
          )}
        </Card.Body>
      </Card>

      <Card>
        <Card.Head title="What you’ve paid" level={3} />
        <Card.Body>
          {items.length === 0 ? (
            <EmptyState title="No payments recorded yet" body={`When ${trainerFirstName} records a payment from you, it shows here with the date and how you paid.`} />
          ) : (
            <ul className="pl__list">
              {items.map((p) => (
                <li key={p.id} className="pl__row">
                  <div>
                    <p className="pl__t">{rupees(p.amount, cur)}</p>
                    <p className="pl__s">{day(p.paidOn, { day: 'numeric', month: 'short', year: 'numeric' })} · {p.packageName}</p>
                    <p className="pl__s">{[p.method ? METHOD[p.method] ?? p.method : null, p.reference].filter(Boolean).join(' · ')}</p>
                  </div>
                  <Tag tone="ok">Paid</Tag>
                </li>
              ))}
            </ul>
          )}
          {money.payments?.nextCursor && <div style={{ marginTop: 12 }}><Button variant="secondary" href={`/me/payments?cursor=${encodeURIComponent(money.payments.nextCursor)}`}>Older payments</Button></div>}
        </Card.Body>
      </Card>
      <div><Button variant="secondary" href="/me/package">Back to your package</Button></div>
    </div>
  );
}
