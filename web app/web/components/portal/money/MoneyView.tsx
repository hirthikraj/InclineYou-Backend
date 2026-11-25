import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { ListRow, ListRows } from '@/web-components/ui/ListRow';
import { EmptyState } from '@/web-components/ui/EmptyState';

import { upiPayLink } from '@/lib/money/upi';
import type { PaymentClaimWire } from '@/lib/claims/types';

import { ReportList, ReportPaymentButton, type OwedPack } from './ReportPayment';

import { day } from '../plan/format';

export interface MoneyWire {
  visible: boolean;
  currency?: string;
  amountDue?: string;
  payments?: { items: { id: string; paidOn: string; amount: string; method: string | null; reference: string | null; packageName: string; status: string }[]; nextCursor: string | null };
  /** The trainer's UPI ID, present only when something is owed and they have set one (V31). Never for a gym client (V50). */
  payTo?: string;
  /** V50 · each pack with money left on it — what an "I've paid" can name. */
  owed?: OwedPack[];
  /** V50 · the client's reports: waiting, and those decided in the last 30 days. */
  claims?: PaymentClaimWire[];
  /** V50 · may they pay part of a pack, and who they pay (the gym's desk, for a gym client). */
  terms?: { partPayments: boolean; collector: 'trainer' | 'gym'; gymName?: string };
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
 *
 * V50 (23 Nov 2026): the client then says so — *I've paid* — and the trainer confirms it; their reports are listed with their state,
 * and every collected payment has a receipt. A gym client pays the gym's desk and is never shown the trainer's UPI ID.
 */
export function MoneyView({ money, trainerFirstName, now, openReport = false }: { money: MoneyWire; trainerFirstName: string; now: number; openReport?: boolean }) {
  const cur = money.currency ?? 'INR';
  const due = Number(money.amountDue ?? 0);
  const items = money.payments?.items ?? [];
  const gymName = money.terms?.collector === 'gym' ? (money.terms.gymName ?? 'the gym') : null;
  const claims = money.claims ?? [];
  const waitingByPack: Record<string, number> = {};
  for (const c of claims) if (c.status === 'open' && c.packageId) waitingByPack[c.packageId] = (waitingByPack[c.packageId] ?? 0) + Number(c.amount);
  const report = (
    <ReportPaymentButton owed={money.owed ?? []} partPayments={money.terms?.partPayments ?? true} gymName={gymName}
      trainerFirstName={trainerFirstName} currency={cur} openOnArrival={openReport} waitingByPack={waitingByPack} />
  );
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
                    button opens your UPI app with the amount filled in. Then tap <b>I’ve paid</b> so {trainerFirstName} can confirm it.
                  </p>
                  <div className="pl__tags" style={{ marginTop: 12 }}>
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
                    {report}
                  </div>
                </>
              ) : (
                <>
                  <p className="pl__s">
                    {gymName
                      ? <>That’s what’s left on your package. Pay at {gymName}’s desk, then tap <b>I’ve paid</b> so {trainerFirstName} can confirm it.</>
                      : <>That’s what’s left on your package. Settle it with {trainerFirstName} directly, then tap <b>I’ve paid</b>.</>}
                  </p>
                  <div style={{ marginTop: 12 }}>{report}</div>
                </>
              )}
            </>
          ) : (
            <>
              <h1 className="pl__h">You’re all square.</h1>
              <p className="pl__s">Nothing is owed on your packages. Paid ahead for your next one? Tell {trainerFirstName}.</p>
              <div style={{ marginTop: 12 }}>{report}</div>
            </>
          )}
        </Card.Body>
      </Card>

      {claims.some((c) => c.status !== 'withdrawn') && (
        <Card>
          <Card.Head title="What you’ve told your trainer" level={3} />
          <Card.Body>
            <ReportList claims={claims} currency={cur} trainerFirstName={trainerFirstName} now={now} />
          </Card.Body>
        </Card>
      )}

      <Card>
        <Card.Head title="What you’ve paid" level={3} />
        {/* EACH PAYMENT IS A ROW THAT OPENS ITS RECEIPT (25 Nov 2026). They were three blocks with no rule between them, a
            green *Paid* on every one (this list only holds payments that went through, so the tag said nothing), and the
            receipt behind a small ghost button at the far edge. Now the whole row is the door, with a chevron. */}
        {items.length === 0 ? (
          <Card.Body>
            <EmptyState title="No payments recorded yet" body={`When ${trainerFirstName} records a payment from you, it shows here with the date and how you paid.`} />
          </Card.Body>
        ) : (
          <Card.Body flush>
            <ListRows label="Payments you have made">
              {items.map((p) => (
                <ListRow
                  key={p.id}
                  href={`/me/payments/receipt/${p.id}`}
                  title={rupees(p.amount, cur)}
                  sub={[
                    day(p.paidOn, { day: 'numeric', month: 'short', year: 'numeric' }),
                    p.packageName,
                    p.method ? METHOD[p.method] ?? p.method : null,
                  ].filter(Boolean).join(' · ')}
                  right={<span className="small ink3">Receipt</span>}
                  rightInline
                  chevron
                />
              ))}
            </ListRows>
          </Card.Body>
        )}
        {money.payments?.nextCursor && (
          <Card.Body divided>
            <Button variant="secondary" href={`/me/payments?cursor=${encodeURIComponent(money.payments.nextCursor)}`}>Older payments</Button>
          </Card.Body>
        )}
      </Card>
    </div>
  );
}
