'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { loadGym } from '@/lib/business/actions';
import { gymQuery, type GymMoney } from '@/lib/business/types';
import { currentMonth, periodProse, periodTag } from '@/lib/money/period';
import { rupees } from '@/lib/today/time';
import { TopBar } from '@/components/shell/TopBar';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Stat } from '@/web-components/ui/Stat';
import { Tag } from '@/web-components/ui/Tag';
import { BizHeader } from './BizHeader';
import { GymSettlement } from './GymSettlement';
import { usePeriodScope } from './PeriodScope';

/**
 * GYM SHARE — what the gym takes from the money it collects, and what it owes you.
 *
 * ── TWO QUESTIONS, ONE PAGE ──────────────────────────────────────────────────
 *
 * *How did the split come out?* is the top half: the gym's cut of what was sold in
 * the period, pack by pack, because the split is per PACK (R3) — a gym pack's
 * trainer share varies with its price, so no single percentage describes it, and
 * the headline percentage is the weighted average that was actually applied rather
 * than a setting. *What does the gym owe me?* is the bottom half: the pay terms
 * (a minimum or a basic fee), the months that have closed against them, and what
 * the gym has actually paid.
 *
 * ── THE PAYMENTS ARE NOT LISTED HERE ─────────────────────────────────────────
 *
 * Each payment's split is on the ledger row already (`split`), so the per-payment
 * rows are a link to Transactions filtered to gym clients and not a second copy of
 * the table. This page stays a fixed size however long the book gets.
 *
 * The period picker drives the top half only; the settlement months are all
 * closed months of the arrangement, which is the answer to *what is owed*, and an
 * answer that moved with a picker would stop being one.
 */
export function GymPage({ start }: { start: { now: number; gym: GymMoney } }) {
  const { period, now } = usePeriodScope();

  /* The server rendered the CURRENT month; any other period is fetched here, and
     the figures stay put (dimmed) until the new ones arrive rather than blanking. */
  const wanted = gymQuery(period, now);
  const [loaded, setLoaded] = useState<{ key: string; gym: GymMoney }>(
    () => ({ key: gymQuery(currentMonth(start.now), start.now), gym: start.gym }),
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (wanted === loaded.key) return;
    let cancelled = false;
    loadGym({ period, now }).then((res) => {
      if (cancelled) return;
      if (res.ok) { setFailed(false); setLoaded({ key: wanted, gym: res.data }); }
      else setFailed(true);
    });
    return () => { cancelled = true; };
  }, [wanted, loaded.key, period, now]);

  const gym = loaded.gym;
  const stale = wanted !== loaded.key && !failed;
  const { stats } = gym;
  const name = gym.gymName ?? 'the gym';

  const nothing = gym.gymName === null && gym.shares.length === 0 && gym.settlement === null;

  /** Re-read the current period after a write — the settlement is what moved. */
  const reload = async () => {
    const res = await loadGym({ period, now });
    if (res.ok) { setFailed(false); setLoaded({ key: wanted, gym: res.data }); }
  };

  return (
    <>
      <TopBar crumb="Business / Gym share" title="Business" />
      <main className="main" id="main-content">
        <BizHeader
          title="Gym share"
          subtitle={
            nothing
              ? 'The split on the gym’s money, and what the gym owes you'
              : <>{rupees(stats.yours)} yours · {rupees(stats.gymCut)} to {name} in {periodProse(period)}</>
          }
          showPeriod
        />

        <div className="body" style={stale ? { opacity: 0.6 } : undefined} aria-busy={stale}>
          {failed && (
            <p className="msg msg--err" role="alert" style={{ marginBottom: 12 }}>
              <span>Could not load that period. The figures below are the last ones that did.</span>
            </p>
          )}

          {nothing ? (
            <EmptyState
              icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 10h18" /><path d="M5 10v9" /><path d="M19 10v9" /><path d="M2 19h20" /><path d="M12 4 3 10h18z" />
              </svg>}
              title="No gym on your profile"
              body={<>If you coach at a gym, add it on the packages page and its price list, your share of every
                sale and what the gym owes you appear here.</>}
              action={<Button variant="primary" href="/business/packages" style={{ marginTop: 16 }}>
                Add your gym
              </Button>}
              style={{ marginTop: 64 }}
            />
          ) : (
            <>
              <GymSettlement
                gymName={gym.gymName}
                settlement={gym.settlement}
                now={start.now}
                onChanged={reload}
              >
                {/* ── how this period came out ─────────────────────────────────
                    Under the balance, not above it: on the fourth of a month these
                    four read ₹0, and a page that opens on zeros has told the
                    trainer nothing. They count what was BILLED in the month a pack
                    was sold; the month-by-month table below counts money when it
                    landed, and says so under its own numbers. */}
                <h2 className="gsx-h">
                  {periodProse(period)} <span>by when a pack was sold</span>
                </h2>
                <div className="stats stats--4 mnystats" style={{ marginTop: 0 }}>
                  <Stat
                    label={<>Billed · gym floor · {periodTag(period)}</>}
                    value={rupees(stats.floorBilled)}
                    detail={`${stats.floorSessions} session${stats.floorSessions === 1 ? '' : 's'} on the floor`}
                  />
                  <Stat
                    label={`${name}’s cut`}
                    value={rupees(stats.gymCut)}
                    detail={stats.floorBilled > 0 ? `${stats.gymCutPercent}% of gym sales, on average` : 'Nothing sold'}
                    tone="warn"
                  />
                  <Stat
                    label="Yours"
                    value={rupees(stats.yours)}
                    detail={stats.remoteBilled > 0
                      ? `Includes ${rupees(stats.remoteBilled)} from your own clients`
                      : 'After the gym’s cut'}
                    tone="acc"
                  />
                  <Stat
                    label="Per session"
                    value={stats.floorSessions > 0
                      ? rupees(Math.round((stats.floorBilled - stats.gymCut) / stats.floorSessions))
                      : '—'}
                    detail="On the floor, after the cut"
                  />
                </div>

                <Card className="mt4">
                  <Card.Head title="Pack by pack">
                    <Tag>{gym.shares.length} pack{gym.shares.length === 1 ? '' : 's'}</Tag>
                  </Card.Head>
                  {gym.shares.length === 0 ? (
                    <Card.Body>
                      <p className="gsx-note">
                        You have no gym packs yet. Add what {name}&rsquo;s counter charges, with your part of
                        each, on the <Link href="/business/packages">packages page</Link>.
                      </p>
                    </Card.Body>
                  ) : (
                    <Card.Body flush>
                      <div className="tblwrap">
                        <table className="tbl gsx-tbl gsx-tbl--packs">
                          <thead>
                            <tr>
                              <th>Pack</th>
                              <th className="num">Your part</th>
                              <th className="num">Sold</th>
                              <th className="num gsx-opt">Billed</th>
                              <th className="num">You took</th>
                              <th className="num">Gym took</th>
                            </tr>
                          </thead>
                          <tbody>
                            {gym.shares.map((s) => (
                              <tr key={s.packId ?? 'custom'} data-idle={s.sold === 0 || undefined}>
                                <td data-l=""><b>{s.packName}</b></td>
                                <td className="num" data-l="Your part">
                                  {s.trainerSharePercent !== null
                                    ? `${s.trainerSharePercent}%`
                                    : s.trainerShareAmount !== null ? `${rupees(s.trainerShareAmount)} flat` : '—'}
                                </td>
                                <td className="num" data-l="Sold">{s.sold}</td>
                                <td className="num gsx-opt" data-l="Billed">{rupees(s.billed)}</td>
                                <td className="num" data-l="You took">{rupees(s.trainerTake)}</td>
                                <td className="num" data-l="Gym took">{rupees(s.gymCut)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card.Body>
                  )}
                  <Card.Body style={{ borderTop: '1px solid var(--tx-line)' }}>
                    <p className="gsx-note">
                      The gym&rsquo;s part is worked out for you: what the pack costs, less what you get. Each
                      payment&rsquo;s split is on its row in{' '}
                      <Link href="/business/transactions?filter=gymshare">Transactions</Link>.
                    </p>
                  </Card.Body>
                </Card>
              </GymSettlement>
            </>
          )}
        </div>
      </main>
    </>
  );
}
