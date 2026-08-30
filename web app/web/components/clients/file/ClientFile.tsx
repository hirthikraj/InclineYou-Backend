'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';

import { Palette, usePaletteKey } from '@/components/today/Palette';
import { TopBar } from '@/components/shell/TopBar';
import type { ClientFilePayload } from '@/lib/clients/client-api';
import type { ProgressView } from '@/lib/log/log';

import { Header } from './Header';
import { PinnedStrip } from './PinnedStrip';
import { OverviewTab } from './OverviewTab';
import { ProgressTab } from './ProgressTab';
import { SessionsTab } from './SessionsTab';
import { ProgramTab } from './ProgramTab';
import { PaymentsTab } from './PaymentsTab';
import { NotesTab } from './NotesTab';
import { TABS, tabHref, type Tab } from './shared';

/**
 * THE CLIENT FILE.
 *
 * Restructured 27 Aug 2026 from four tabs to six, on the product owner's brief.
 * What the design set draws is frames 3a–3e of `webapp-clients.html` — overview,
 * sessions, package, programs, body — and three of those five are unchanged in
 * substance. What is new is the arrangement.
 *
 * | | Before | Now |
 * | --- | --- | --- |
 * | tabs | Overview · Programs · Sessions · Package | Overview · Progress · Sessions · Program · Payments · Notes |
 * | progress | a route of its own, off the workout console | a tab |
 * | body metrics | a ghost button beside the tab strip, going nowhere | inside Progress |
 * | the money | *Package* — the live pack only | *Payments* — every pack, every payment, lifetime totals |
 * | notes | nowhere. There was no storage for them | a tab, and a pinned strip above the tabs |
 * | the header | name, status, three verbs | + the pack, the dues, WhatsApp and call |
 *
 * ── EVERY TAB IS A ROUTE, AND THAT IS A CHANGE ──────────────────────────────
 *
 * The tab strip used to be `useState` seeded from an `initialTab` prop, so five
 * routes rendered one component and then four of them forgot which one they
 * were the moment anything else set the state. Six `<Link>`s now: the back button
 * works between tabs, a trainer can send somebody a link to the Payments tab, and
 * the active tab cannot disagree with the URL because there is only one of them.
 *
 * The cost is a server round trip per tab. It is the right cost here — the payload
 * is already fetched per request (`force-dynamic`), so the alternative was a
 * client-side state machine over data the server re-reads anyway.
 *
 * ── THE PINNED STRIP IS ABOVE THE TABS, NOT IN THEM ─────────────────────────
 *
 * It is inside `.ph`, which means it is on all six tabs and does not scroll away.
 * That is the feature rather than a layout choice, and `PinnedStrip.tsx` carries
 * the argument — including why it is a neutral note strip and not the health
 * record the DPDP Act 2023 puts out of this product's reach.
 */

interface ClientFileProps {
  payload: ClientFilePayload;
  now: number;
  tab: Tab;
  /** Only the Progress route loads this; every other tab passes null. */
  progress?: ProgressView | null;
}

export function ClientFile({ payload, now, tab, progress = null }: ClientFileProps) {
  const {
    client,
    gymName,
    gymSharePercent,
    sessions,
    packages,
    payments,
    activePackagePayments,
    priceList,
    adjustments,
    programs,
    workouts,
    bodyMetrics,
    notes,
  } = payload;

  const [paletteOpen, setPaletteOpen] = useState(false);
  usePaletteKey(useCallback(() => setPaletteOpen(true), []));

  const counts: Partial<Record<Tab, number>> = {
    sessions: sessions.length,
    program: programs.length,
    notes: notes.length,
  };

  return (
    <>
      <TopBar crumb={`Clients / ${client.name}`} onSearch={() => setPaletteOpen(true)} />

      <main className="main" id="main-content">
        <div className="ph">
          <Header
            client={client}
            packages={packages}
            activePackagePayments={activePackagePayments}
            sessionCount={workouts.length}
          />

          <PinnedStrip clientId={client.id} notes={notes} />

          <div className="ph__tabs" role="tablist" aria-label={client.name}>
            {TABS.map((t) => (
              <Link
                key={t.key}
                className="tab"
                href={tabHref(client.id, t.key)}
                role="tab"
                aria-selected={tab === t.key}
                style={
                  tab === t.key
                    ? { color: 'var(--tx-ink)', borderBottomColor: 'var(--tx-accent)' }
                    : undefined
                }
              >
                {t.label}
                {(counts[t.key] ?? 0) > 0 && <span className="rail__n">{counts[t.key]}</span>}
              </Link>
            ))}
          </div>
        </div>

        <div className="body">
          {tab === 'overview' && <OverviewTab payload={payload} now={now} />}
          {tab === 'progress' && (
            <ProgressTab clientId={client.id} progress={progress} bodyMetrics={bodyMetrics} />
          )}
          {tab === 'sessions' && <SessionsTab sessions={sessions} now={now} />}
          {tab === 'program' && (
            <ProgramTab programs={programs} sessions={sessions} client={client} now={now} />
          )}
          {tab === 'payments' && (
            <PaymentsTab
              clientId={client.id}
              clientName={client.name}
              packages={packages}
              payments={payments}
              priceList={priceList}
              adjustments={adjustments}
              gymName={gymName}
              gymSharePercent={gymSharePercent}
            />
          )}
          {tab === 'notes' && (
            <NotesTab clientId={client.id} clientName={client.name} notes={notes} />
          )}
        </div>
      </main>

      {paletteOpen && (
        <Palette
          open
          onClose={() => setPaletteOpen(false)}
          clients={[{ id: client.id, name: client.name }]}
          attention={[]}
          today={[]}
        />
      )}
    </>
  );
}
