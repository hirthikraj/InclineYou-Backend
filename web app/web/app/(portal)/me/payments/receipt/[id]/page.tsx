import { notFound } from 'next/navigation';

import { TopBar } from '@/components/shell/TopBar';
import { requirePortalSession } from '@/lib/portal/session';
import { portalGet, settle } from '@/lib/portal/plan-api';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Crumbs } from '@/web-components/ui/Crumbs';
import { FactList } from '@/web-components/ui/FactList';
import { PageHeader } from '@/web-components/ui/PageHeader';
import { PrintReceipt } from '@/components/portal/PrintReceipt';

export const metadata = { title: 'Receipt · InclineYou' };
export const dynamic = 'force-dynamic';

interface ReceiptWire {
  id: string;
  number: string;
  paidAt: number;
  amount: string;
  currency: string;
  method?: string;
  reference?: string;
  collectedBy?: 'trainer' | 'gym';
  packageName?: string;
  clientName?: string;
  trainerName?: string;
  gymName?: string;
  business: {
    name?: string; tagline?: string; phone?: string; email?: string;
    addressLine1?: string; addressLine2?: string; city?: string; state?: string; pincode?: string;
  };
}

const METHOD: Record<string, string> = { upi: 'UPI', cash: 'Cash', bank_transfer: 'Bank transfer' };

/**
 * `/me/payments/receipt/:id` — a receipt for one of the client's own collected payments (V50, pm-l3). The client's proof, as
 * the gym statement is the trainer's: what, when, how, the UPI reference, what it paid for and who it was paid to. A receipt,
 * not a tax invoice — GST invoices are still off (R27), and the page says neither more nor less than that. Printable.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePortalSession();
  if (!session.ok) return null;
  const { id } = await params;
  const r = settle(await portalGet<ReceiptWire>(`/v1/portal/payments/${encodeURIComponent(id)}/receipt`));
  if (!r) notFound();

  const amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: r.currency, maximumFractionDigits: 2 }).format(Number(r.amount));
  const when = new Date(r.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const b = r.business;
  const place = [b.addressLine1, b.addressLine2, [b.city, [b.state, b.pincode].filter(Boolean).join(' ')].filter(Boolean).join(', ')]
    .filter((x) => x && x.trim());
  const paidTo = r.collectedBy === 'gym' ? `${r.gymName ?? 'The gym'}, for ${r.trainerName ?? 'your trainer'}` : (b.name ?? r.trainerName ?? '');

  return (
    <>
      <TopBar crumb="Payments / Receipt" title="Me" titleHref="/me/payments" />
      <main className="main" id="main-content">
        {/* THE WAY BACK, ABOVE THE TITLE (25 Nov 2026): Me › Payments › this receipt. The top bar's crumb is drawn only
            on a phone, so on a desk the only way back was the button under the card. */}
        <PageHeader
          className="ph--portal ph--receipt"
          title="Receipt"
          crumbs={
            <Crumbs
              items={[
                { label: 'Me', href: '/me/account' },
                { label: 'Payments', href: '/me/payments' },
                { label: `Receipt ${r.number}` },
              ]}
            />
          }
        />
        <div className="body">
          <div className="portal">
            <Card className="prc">
              <Card.Body>
                <p className="small ink3">Receipt {r.number}</p>
                <p className="prc__amt">{amount}</p>
                <p className="small">Paid on {when}</p>
                <FactList className="mt3">
                  <FactList.Row k="Paid by">{r.clientName ?? ''}</FactList.Row>
                  <FactList.Row k="Paid to">{paidTo}</FactList.Row>
                  {r.packageName && <FactList.Row k="For">{r.packageName}</FactList.Row>}
                  {r.collectedBy !== 'gym' && r.method && <FactList.Row k="How">{METHOD[r.method] ?? r.method}</FactList.Row>}
                  {r.reference && <FactList.Row k="Reference"><span className="mono">{r.reference}</span></FactList.Row>}
                </FactList>
                {/* THE BUSINESS BLOCK SAYS WHAT THE ROWS DO NOT (25 Nov 2026): with only a name on file it repeated *Paid to*
                    under itself. Drawn when there is an address, a phone, an email or a tagline to add. */}
                {r.collectedBy !== 'gym' && (place.length > 0 || b.phone || b.email || b.tagline) && (
                  <div className="prc__biz small mt3">
                    {b.name && <p><b>{b.name}</b>{b.tagline ? ` · ${b.tagline}` : ''}</p>}
                    {place.length > 0 && <p>{place.join(', ')}</p>}
                    {(b.phone || b.email) && <p>{[b.phone, b.email].filter(Boolean).join(' · ')}</p>}
                  </div>
                )}
                <p className="small ink3 mt3">A receipt for your records — not a tax invoice.</p>
              </Card.Body>
            </Card>
            <div className="prc__print prc__acts mt3">
              <PrintReceipt />
              <Button variant="secondary" href="/me/payments">Back to payments</Button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
