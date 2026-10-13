import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Tag } from '@/web-components/ui/Tag';

import { day } from '../plan/format';

export interface MoneyWire {
  visible: boolean;
  currency?: string;
  amountDue?: string;
  payments?: { items: { id: string; paidOn: string; amount: string; method: string | null; reference: string | null; packageName: string; status: string }[]; nextCursor: string | null };
}

const METHOD: Record<string, string> = { upi: 'UPI', cash: 'Cash', bank_transfer: 'Bank transfer' };

function rupees(amount: string, currency: string): string {
  const n = Number(amount);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);
}

/**
 * What is owed and what has been paid. Read-only and neutral: a plain figure — never red, never a nudge, never a button to pay — because the
 * money stays between the two of them. A balance of nothing says so warmly; a balance says what it is and who to ask.
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
              <p className="pl__s">That’s what’s left on your package. Settle it with {trainerFirstName} directly — there’s nothing to pay here.</p>
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
