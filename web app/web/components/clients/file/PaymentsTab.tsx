'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';

import { Plus } from '@/components/shell/Icons';
import { rupees } from '@/lib/today/time';
import type {
  ClientPackageWire,
  ClientPaymentWire,
  PackageAdjustmentWire,
  PriceListPackWire,
} from '@/lib/clients/client-api';
import { renewPack } from '@/lib/clients/package-actions';

import { PackLife } from './PackLife';
import { PackPanel } from './PackPanel';
import { Blank, ListIcon, Meter, isoDateStr, longDateStr, num } from './shared';

/**
 * PAYMENTS — PACKS BOUGHT, MONEY IN, MONEY STILL OUT.
 *
 * This tab was called *Package* and it drew one pack: the live one, with the gym
 * split frozen onto it (the design's frame 3c). That answers *what is running*
 * and it does not answer the question a trainer actually opens the money side of
 * a client file to ask, which is **what has this person paid me, ever, and what
 * is outstanding**.
 *
 * So the pack card keeps its whole argument and gains two things: every past pack
 * beside it, and a ledger of the individual payments under both.
 *
 * ── THE THREE TOTALS AT THE TOP ARE LIFETIME, NOT THIS PACK ─────────────────
 *
 * Billed, collected and outstanding across every pack this client has ever
 * bought. A trainer chasing an old invoice is asking about a pack that is no
 * longer live, and a screen that only totals the current one tells them they are
 * owed nothing.
 *
 * ── THE TOTALS COME FROM THE SERVER NOW, AND THAT FIXED A REAL DEFECT ───────
 *
 * They used to be summed here from payments whose `status === 'confirmed'`.
 * The backend writes **`'paid'`**. So every confirmed payment was invisible to
 * this tab, and a client who had paid in full read as owing every rupee of it —
 * on the one screen a trainer opens to check exactly that. `lib/money/compute.ts`
 * had always accepted both spellings, which is why the money book was right and
 * the client file was wrong about the same money.
 *
 * `amountPaid` and `amountDue` are now computed in SQL beside the rows they come
 * from (`PackageService.PACKAGE_COLUMNS`), so there is one figure and it cannot
 * disagree with itself about a vocabulary. `isCollected` below survives only for
 * the ledger's per-row tag, and it accepts both spellings for the same reason.
 *
 * ── WHY `gymShareAmount` IS READ AND NOT COMPUTED ───────────────────────────
 *
 * V11 stores the cut on the payment row at record time rather than looking the
 * percentage up later, so a contract that changes in October cannot move
 * September's split. Recomputing it here from `gymSharePercent` would undo that
 * on the one screen where the trainer is checking the arithmetic.
 *
 * ── AND THE SHARE IS ZERO MORE OFTEN THAN PEOPLE EXPECT ─────────────────────
 *
 * Three cases, two of them surprising, and the aside states them: the trainer
 * collected, the session was remote, or there is no gym on the profile. A live
 * split calculator beside a "trainer collects" option is arithmetic on a number
 * the rule has already made zero.
 */

/** Both spellings mean *the money arrived*. See the note above. */
function isCollected(p: ClientPaymentWire): boolean {
  return p.status === 'paid' || p.status === 'confirmed';
}

/**
 * What a closed pack's tag should say.
 *
 * V30's sweep closes a pack as `completed` when the sessions ran out and
 * `expired` when the calendar did with sessions still on it, and the difference
 * is the trainer's next conversation: one is a renewal, the other is a client
 * who lost something they paid for.
 */
function closedTag(pkg: ClientPackageWire): { label: string; cls: string } {
  if (pkg.status === 'expired') {
    const left = pkg.sessionsRemaining ?? 0;
    return {
      label: left > 0 ? `Ran out of time · ${left} unused` : 'Ran out of time',
      cls: 'tag--warn',
    };
  }
  if (pkg.status === 'completed') return { label: 'Finished', cls: 'tag' };
  return { label: 'Closed', cls: 'tag' };
}

function PackCard({
  clientId,
  pkg,
  payments,
  adjustments,
  isActive,
  gymName,
  gymSharePercent,
  onRenewWithChanges,
}: {
  clientId: string;
  pkg: ClientPackageWire;
  payments: ClientPaymentWire[];
  adjustments: PackageAdjustmentWire[];
  isActive: boolean;
  gymName: string | null;
  gymSharePercent: number | null;
  onRenewWithChanges: (pkg: ClientPackageWire) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const billed = num(pkg.amount);
  /*
   * Server-computed. The old local sum is gone — see the note at the top of this
   * file for the defect it caused. `?? ` rather than a bare read because a
   * backend that predates V30 answers without the field, and a client file that
   * blanks out against an old server is worse than one that falls back.
   */
  const paid = pkg.amountPaid != null ? num(pkg.amountPaid) : payments.filter(isCollected).reduce((s, p) => s + num(p.amount), 0);
  const owed = pkg.amountDue != null ? num(pkg.amountDue) : Math.max(0, billed - paid);

  const gymShare = payments.filter(isCollected).reduce((s, p) => s + num(p.gymShareAmount), 0);
  const keeps = billed - gymShare;
  const perSession =
    pkg.sessionsTotal && pkg.sessionsTotal > 0 ? Math.round(billed / pkg.sessionsTotal) : null;
  const keptPerSession =
    pkg.sessionsTotal && pkg.sessionsTotal > 0 ? Math.round(keeps / pkg.sessionsTotal) : null;

  const used = (pkg.sessionsTotal ?? 0) - (pkg.sessionsRemaining ?? 0);
  const pct = pkg.sessionsTotal
    ? Math.round(((pkg.sessionsRemaining ?? 0) / pkg.sessionsTotal) * 100)
    : 0;

  const paused = pkg.pausedAt != null;
  const discount = pkg.discountAmount != null ? num(pkg.discountAmount) : 0;
  const closed = closedTag(pkg);

  return (
    <div className="card">
      <div className="card__hd">
        <p className="card__t">
          {pkg.sessionsTotal ? `${pkg.sessionsTotal} sessions` : pkg.type}
          {billed > 0 && ` · ${rupees(billed)}`}
        </p>
        {isActive ? (
          paused ? (
            <span className="tag tag--warn">Paused</span>
          ) : (
            <span className="tag tag--acc">Current</span>
          )
        ) : owed > 0 ? (
          <span className="tag tag--danger">{rupees(owed)} owed</span>
        ) : (
          <span className={`tag ${closed.cls}`}>{closed.label}</span>
        )}
      </div>
      <div className="card__b">
        {pkg.startDate && (
          <p className="small">
            Bought {isoDateStr(pkg.startDate)}
            {perSession && ` · ${rupees(perSession)} a session`}
            {discount > 0 && ` · ${rupees(discount)} off the list price`}
          </p>
        )}

        {isActive && pkg.sessionsRemaining !== null && pkg.sessionsTotal !== null && (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: 14 }}>
              <p
                style={{
                  fontFamily: 'var(--tx-brand)',
                  fontWeight: 800,
                  fontSize: 44,
                  letterSpacing: '-.04em',
                  lineHeight: 1,
                }}
              >
                {pkg.sessionsRemaining}
                <span className="ink3" style={{ fontSize: 24 }}>
                  /{pkg.sessionsTotal}
                </span>
              </p>
              <p className="small" style={{ paddingBottom: 8 }}>
                left{pkg.endDate ? ` · ${paused ? 'was ending' : 'ends'} ${isoDateStr(pkg.endDate)}` : ''}
              </p>
            </div>
            <Meter pct={pct} danger={(pkg.sessionsRemaining ?? 0) <= 2} />
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
              <span className="small">{pkg.sessionsRemaining} left</span>
              <span className="small">{used} used</span>
            </div>
          </>
        )}

        <div style={{ marginTop: isActive ? 18 : 12, borderTop: '1px solid var(--tx-line)', paddingTop: 6 }}>
          <div className="kv">
            <span className="kv__k">Owed on this pack</span>
            <span className="kv__v" style={owed > 0 ? { color: 'var(--tx-danger)' } : undefined}>
              {owed > 0 ? rupees(owed) : 'Nothing · paid in full'}
            </span>
          </div>
          {/* Only worth a row when it is PART of the price. Nothing collected and
              everything collected both say what they are on the line above. */}
          {paid > 0 && owed > 0 && (
            <div className="kv">
              <span className="kv__k">Paid so far</span>
              <span className="kv__v">
                {rupees(paid)}
                <span className="ink3" style={{ fontWeight: 400 }}>
                  {' '}
                  · of {rupees(billed)}
                </span>
              </span>
            </div>
          )}
          {perSession && (
            <div className="kv">
              <span className="kv__k">Price a session</span>
              <span className="kv__v">{rupees(perSession)}</span>
            </div>
          )}
          {gymName && gymShare > 0 && (
            <div className="kv">
              <span className="kv__k">The gym&rsquo;s share</span>
              <span className="kv__v">
                {rupees(gymShare)}
                {gymSharePercent && (
                  <span className="ink3" style={{ fontWeight: 400 }}>
                    {' '}
                    · {gymSharePercent}%
                  </span>
                )}
              </span>
            </div>
          )}
          {(gymName ? keeps > 0 : billed > 0) && (
            <div className="kv">
              <span className="kv__k">What you keep</span>
              <span className="kv__v acc">
                {rupees(gymName ? keeps : billed)}
                {gymName && keptPerSession && (
                  <span className="ink3" style={{ fontWeight: 400 }}>
                    {' '}
                    · {rupees(keptPerSession)} a session
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        {isActive && (
          <>
            {/* Pause · restart · give more time. See `PackLife`. */}
            <PackLife clientId={clientId} pkg={pkg} adjustments={adjustments} />

            <div style={{ marginTop: 16, display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              {/*
                RENEW IS ONE TAP, AND THAT IS THE WHOLE POINT.

                It used to be a `<Link>` to `/business?record=<clientId>` — a
                money-book panel that RECORDS A PAYMENT and cannot sell a pack,
                so the button labelled "Renew · 12 for ₹9,000" led to a form that
                could not do it. Now it posts to `/v1/packages/{id}/renew` with an
                empty body: same terms, and the new pack starts where this one
                stops.

                A trainer renews a client while standing next to them with the
                next session about to start. Anything more than one tap gets done
                later, and later means not at all.

                *Change the terms* is beside it for the uncommon renewal where
                something actually changed — a price rise, a different block —
                and it is deliberately the secondary button.
              */}
              <button
                className="btn btn--primary"
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    const result = await renewPack(clientId, pkg.id);
                    if (!result.ok) setError(result.message ?? 'The renewal did not go through.');
                  })
                }
              >
                {pending
                  ? 'Renewing…'
                  : `Renew${pkg.sessionsTotal && billed ? ` · ${pkg.sessionsTotal} for ${rupees(billed)}` : ''}`}
              </button>
              <button
                className="btn btn--secondary"
                type="button"
                disabled={pending}
                onClick={() => onRenewWithChanges(pkg)}
              >
                Change the terms
              </button>
              <Link className="btn btn--ghost" href={`/business?record=${clientId}`}>
                <ListIcon />
                Take a payment
              </Link>
            </div>
            {error && (
              <p className="msg msg--warn" style={{ marginTop: 10 }} role="alert">
                <span>{error}</span>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * `upi` → `UPI`, `bank_transfer` → `Bank transfer`.
 *
 * FOUND BY RENDERING: the cell was `text-transform:capitalize`, which title-cases
 * every word in it — so the ledger read *Upi · You Collected*, with an acronym
 * lower-cased and a plain phrase shouting. The method is a proper noun and the
 * rest of the sentence is not, so they are cased separately and the CSS does
 * nothing.
 */
const ACRONYMS = new Set(['upi', 'neft', 'imps', 'rtgs', 'emi']);

function methodLabel(p: ClientPaymentWire): string {
  const raw = p.method ? p.method.replace(/_/g, ' ').trim().toLowerCase() : '';
  const method = !raw
    ? 'method not recorded'
    : ACRONYMS.has(raw)
      ? raw.toUpperCase()
      : raw.charAt(0).toUpperCase() + raw.slice(1);
  const by =
    p.collectedBy === 'gym' ? 'gym collected' : p.collectedBy === 'trainer' ? 'you collected' : null;
  return by ? `${method} · ${by}` : method;
}

export function PaymentsTab({
  clientId,
  clientName,
  packages,
  payments,
  priceList,
  adjustments,
  gymName,
  gymSharePercent,
}: {
  /** Whose file this is. Needed by the empty states and by every write. */
  clientId: string;
  clientName: string;
  packages: ClientPackageWire[];
  payments: ClientPaymentWire[];
  /** The trainer's own price list, so *Sell a pack* offers real prices. */
  priceList: PriceListPackWire[];
  /** The live pack's pause / resume / extend history. */
  adjustments: PackageAdjustmentWire[];
  gymName: string | null;
  gymSharePercent: number | null;
}) {
  /** null = shut, 'sell' = a fresh pack, or the pack being renewed with changes. */
  const [panel, setPanel] = useState<null | 'sell' | ClientPackageWire>(null);

  const active = packages.find((p) => p.status === 'active') ?? null;
  const past = packages.filter((p) => p.status !== 'active');

  const billed = packages.reduce((s, p) => s + num(p.amount), 0);
  /*
   * Server-computed per pack and summed here, rather than summed from the
   * payment rows. Same figures the pack cards show, so the header cannot
   * disagree with the card underneath it.
   */
  const collected = packages.reduce(
    (s, p) =>
      s +
      (p.amountPaid != null
        ? num(p.amountPaid)
        : payments.filter((x) => x.packageId === p.id).filter(isCollected).reduce((t, x) => t + num(x.amount), 0)),
    0,
  );
  const outstanding = packages.reduce(
    (s, p) => s + (p.amountDue != null ? num(p.amountDue) : 0),
    0,
  );
  const pending = payments.filter((p) => p.status === 'pending');
  const collectedCount = payments.filter(isCollected).length;

  const ledger = [...payments].sort(
    (a, b) => (b.paidAt ?? b.createdAt) - (a.paidAt ?? a.createdAt),
  );

  const sellButton = (label: string) => (
    <button className="btn btn--primary" type="button" onClick={() => setPanel('sell')}>
      <Plus size={15} />
      {label}
    </button>
  );

  const panelNode = panel && (
    <PackPanel
      clientId={clientId}
      clientName={clientName}
      priceList={priceList}
      renewing={panel === 'sell' ? null : panel}
      onClose={() => setPanel(null)}
    />
  );

  if (packages.length === 0) {
    return (
      <>
        <div className="card">
          <div className="card__b">
            <p className="small" style={{ color: 'var(--tx-ink-3)' }}>
              Nothing sold yet. A pack is what makes the sessions countable — until
              there is one, every session is off the books.
            </p>
            <div style={{ marginTop: 12 }}>{sellButton('Sell a pack')}</div>
          </div>
        </div>
        {panelNode}
      </>
    );
  }

  return (
    <>
      {/* Lifetime, across every pack. See the note at the top of this file. */}
      <div className="stats stats--3 cfstats" style={{ marginBottom: 12 }}>
        <div className="stat">
          <p className="stat__k">Billed, all time</p>
          <p className="stat__v">{rupees(billed)}</p>
          <p className="stat__d">
            {packages.length} pack{packages.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="stat stat--acc">
          <p className="stat__k">Collected</p>
          <p className="stat__v">{rupees(collected)}</p>
          <p className="stat__d">
            {collectedCount} payment{collectedCount === 1 ? '' : 's'}
          </p>
        </div>
        <div className={`stat${outstanding > 0 ? ' stat--danger' : ''}`}>
          <p className="stat__k">Outstanding</p>
          <p className="stat__v">{outstanding > 0 ? rupees(outstanding) : 'Nothing'}</p>
          <p className="stat__d">
            {pending.length > 0
              ? `${pending.length} awaiting confirmation`
              : outstanding > 0
                ? 'never recorded as paid'
                : 'square with you'}
          </p>
        </div>
      </div>

      <div
        className="cfgrid"
        style={{
          display: 'grid',
          gap: 12,
          alignItems: 'start',
          gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)',
        }}
      >
        <div>
          {active ? (
            <PackCard
              clientId={clientId}
              pkg={active}
              payments={payments.filter((p) => p.packageId === active.id)}
              adjustments={adjustments}
              isActive
              gymName={gymName}
              gymSharePercent={gymSharePercent}
              onRenewWithChanges={(pkg) => setPanel(pkg)}
            />
          ) : (
            <div className="card">
              <div className="card__b">
                <p className="small" style={{ color: 'var(--tx-ink-3)' }}>
                  No pack running. Sessions logged from here are not counted against
                  anything.
                </p>
                <div style={{ marginTop: 12, display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                  {sellButton('Sell a pack')}
                  {/* The commonest thing to sell somebody with no live pack is the
                      one they just finished, so it is offered directly rather than
                      left to be re-typed into the form. */}
                  {past.length > 0 && (
                    <button
                      className="btn btn--secondary"
                      type="button"
                      onClick={() => setPanel(past[0])}
                    >
                      Repeat their last pack
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {past.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p className="small" style={{ color: 'var(--tx-ink-3)', marginBottom: 8 }}>
                Past packs
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {past.map((pkg) => (
                  <PackCard
                    key={pkg.id}
                    clientId={clientId}
                    pkg={pkg}
                    payments={payments.filter((p) => p.packageId === pkg.id)}
                    adjustments={[]}
                    isActive={false}
                    gymName={gymName}
                    gymSharePercent={gymSharePercent}
                    onRenewWithChanges={(p) => setPanel(p)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="card">
            <div className="card__hd">
              <p className="card__t">Every payment</p>
            </div>
            <div className="card__b card__b--flush">
              {ledger.length === 0 ? (
                <Blank>Nothing collected yet</Blank>
              ) : (
                <table className="tbl cftbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {ledger.map((p) => (
                      <tr key={p.id} className={p.status === 'pending' ? 'crit' : undefined}>
                        <td className="mono" style={{ width: 104, color: 'var(--tx-ink-3)' }}>
                          {longDateStr(p.paidAt ?? p.createdAt)}
                        </td>
                        <td className="strong tnum">{rupees(num(p.amount))}</td>
                        <td style={{ color: 'var(--tx-ink-3)' }}>{methodLabel(p)}</td>
                        <td style={{ width: 92 }}>
                          {isCollected(p) ? (
                            <span className="tag tag--ok">Paid</span>
                          ) : (
                            <span className="tag tag--warn">Pending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {gymName && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="card__hd">
                <p className="card__t">When the share is zero</p>
              </div>
              <div className="card__b">
                <p className="small">Three cases, and two of them surprise people:</p>
                <ul className="small" style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
                  <li>
                    the <b>trainer</b> collects — whatever the mode, and even on the
                    gym&rsquo;s own floor;
                  </li>
                  <li>
                    the session is <b>remote</b> — whoever collects;
                  </li>
                  <li>
                    there is <b>no gym</b> on the profile at all.
                  </li>
                </ul>
                <p className="small" style={{ marginTop: 10 }}>
                  The cut is frozen onto each payment when the money is confirmed, so a
                  contract that changes in October cannot move September&rsquo;s split.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {panelNode}
    </>
  );
}
