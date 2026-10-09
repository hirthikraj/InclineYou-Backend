'use client';

import Link from 'next/link';

import { TopBar } from '@/components/shell/TopBar';
import type { ClientFilePayload, ClientNoteWire, TabOptions } from '@/lib/clients/client-api';
import type { ProgressView } from '@/lib/log/log';
import type { AssessmentWire, ScheduleWire, TemplateWire } from '@/lib/assessments/vocab';

import { Header, HeaderDetail } from './Header';
import { PinnedStrip } from './PinnedStrip';
import { OverviewTab } from './OverviewTab';
import { CalendarTab } from './CalendarTab';
import { ProgressTab } from './ProgressTab';
import { ChecksTab } from './ChecksTab';
import { SessionsTab } from './SessionsTab';
import { ProgramTab } from './ProgramTab';
import { PaymentsTab } from './PaymentsTab';
import { PersonalTab } from './PersonalTab';
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
 * | tabs | Overview · Programs · Sessions · Package | Overview · Progress · Sessions · Program · Payments · Personal information |
 * | progress | a route of its own, off the workout console | a tab |
 * | body metrics | a ghost button beside the tab strip, going nowhere | inside Progress |
 * | the money | *Package* — the live pack only | *Payments* — every pack, every payment, lifetime totals |
 * | notes | nowhere. There was no storage for them | a tab, and a pinned strip above the tabs |
 * | the header | name, status, three verbs | + the pack, the pending amount, WhatsApp and call |
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

export interface ClientFileProps {
  payload: ClientFilePayload;
  now: number;
  tab: Tab;
  /** The tab's own place — the calendar's month, the sessions window. */
  options?: TabOptions;
  /** Only the Progress route loads this; every other tab passes null. */
  progress?: ProgressView | null;
  /** The Progress read failed — drawn as that, never as an empty client. */
  progressFailed?: boolean;
  /**
   * Only the Check-ins route loads this, for Progress's own reason: a second
   * read on the payload every tab shares is a read seven tabs pay for.
   *
   * `undefined` is every other tab and `null` is *this tab, and the read
   * failed* — `ChecksTab` draws the difference, because an empty list where
   * the request fell over is the screen inventing a fact about somebody's
   * coaching.
   */
  assessments?: AssessmentWire[] | null;
  /** This client's cycles and the trainer's forms — `null` where the read failed. */
  schedules?: ScheduleWire[] | null;
  templates?: TemplateWire[] | null;
}

export function ClientFile({
  payload,
  now,
  tab,
  progress = null,
  progressFailed = false,
  assessments = null,
  schedules = null,
  templates = null,
  options = {},
}: ClientFileProps) {
  /* ── THE STRIP STANDS DOWN ON THE TAB THAT OWNS ITS CONTENTS ─────────────

     `PinnedStrip` is on all seven tabs because a pinned note is a constraint a
     trainer needs in front of them wherever they are in the file — and on
     *Personal information* they are already looking at the list it is drawn
     from. MEASURED at 1536×695 on `cli_008`: the strip read *Has a home set of
     dumbbells up to 12kg for the remote weeks.* on a warm ground at y=186, and
     the note card 250px below it read the same sentence on the same ground with
     a `Pinned` flag on it. On a client with one note that is the whole of the
     tab's content, drawn twice.

     Exactly the argument `TopBar`'s `titleHref` block above makes about the
     duplicated name: the weaker copy gives up the slot. Here the weaker copy is
     the strip — the card carries the flag, the share state, and every control
     that acts on the note, and the strip carries one word (*Unpin*) that the
     card's own tack does better.

     The empty case goes with it and gains by going: the strip's invitation is
     *Nothing pinned. **Pin a note** to keep it above every tab*, and that link
     points at `/clients/{id}/information` — a link to the page you are on.

     It buys 60px of header back on the one tab whose content was 224px below
     the fold. */
  /* Nor on the Calendar: that tab answers *did they turn up*, and *before every session* is a
     note about the session, one tab away. It was ~40px of the 766px window above the month. */
  const pinStrip = tab !== 'information' && tab !== 'calendar';

  const { client, packages } = payload;

  /* The strip draws the header's pinned notes: every tab has them without
     reading the notes list, which only Personal information does. */
  const latestWeight = payload.readings.filter((r) => r.key === 'weight').at(-1) ?? null;

  const pinned: ClientNoteWire[] = client.pinnedNotes.map((n) => ({
    id: n.id, body: n.body, pinned: true, createdAt: n.updatedAt, updatedAt: n.updatedAt, version: String(n.updatedAt),
  }));

  return (
    <>
      {/*
        THE PHONE'S WAY BACK TO THE ROSTER, and it costs 0px.

        Asked for on 5 Sep 2026: the file had no door out below 900px. `.cfback`
        — the *‹ All clients* link `Header` draws — is `display:none` there, and
        app.css measures why: 38px above the fold on the screen whose first fact
        already sat at y=422. That arithmetic stands. What it left behind was a
        screen a trainer leaves by aiming at the tab bar, which goes to the
        roster but is not a BACK control: it is the same tap from anywhere, so it
        answers *where can I go* and never *where did I come from*.

        `titleHref` is the answer that does not spend the 38px, because it does
        not add a control — it changes the one the bar already draws. And the
        thing it replaces was a duplicate: MEASURED at 390px, `.top__title` read
        *Arjun Subramanian* at y=10 and `.ph__t` read *Arjun Subramanian* 22px
        below it at y=58. The bar's copy was the weaker one — 208px, no avatar,
        no status, no pack — so the slot goes to the word the screen does not
        otherwise say.

        `TopBar`'s own doc scopes `titleHref` to "screens with no other door on a
        phone", and *Clients* IS one of `nav.tsx`'s five bar slots. That rule is
        narrowed rather than broken, and the note there now carries the reason:
        the bar is a door, not a way back, and this file is the one screen in the
        section deep enough for the difference to matter.

        The desk is untouched — `.top__title` only exists below 900px — so a
        1440px bar still shows the workspace plate and `.cfback` is still the
        link it always was.
      */}
      <TopBar crumb={`Clients / ${client.name}`} title="Clients" titleHref="/clients" />

      <main className="main" id="main-content">
        <div className="ph">
          <Header client={client} packages={packages} now={now} />

          {/* THE PIN HINT IS THE DESK'S HERE TOO. It is a sentence a trainer
              reads on arrival — *Nothing pinned. Pin a note to keep it in front
              of you every tab* — and pinning 40px of it to a 844px screen at
              every scroll position is the same mistake the figures were. It
              travels with them into the scroller below. */}
          {pinStrip && (
            <div className="cfd cfd--desk">
              <PinnedStrip clientId={client.id} notes={pinned} />
            </div>
          )}

          {/* A NAV OF LINKS, NOT A TABLIST. Each tab is a page load, so `role="tablist"` /
              `role="tab"` promised arrow-key movement between panels that were already in the
              document and a tabpanel that never existed — a screen reader announced "tab,
              1 of 8" and then behaved as eight links. `aria-current="page"` is what a nav
              of links says (`PageTabs` reached the same conclusion first). */}
          <nav className="ph__tabs" aria-label={`${client.name}'s file`}>
            {TABS.map((t) => (
              <Link
                key={t.key}
                className="tab"
                href={tabHref(client.id, t.key)}
                aria-current={tab === t.key ? 'page' : undefined}
                style={
                  tab === t.key
                    ? { color: 'var(--tx-ink)', borderBottomColor: 'var(--tx-accent)' }
                    : undefined
                }
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="body">
          {/* THE PHONE'S COPY, first thing in the scroller. `HeaderDetail`'s own
              block carries the measurement and the argument for the duplication;
              `.cfd--phone` is `display:none` above 900px, so on a desk this is
              not in the layout, not in the tab order and not in the
              accessibility tree. */}
          <div className="cfd cfd--phone">
            <HeaderDetail client={client} packages={packages} now={now} />
            {pinStrip && <PinnedStrip clientId={client.id} notes={pinned} />}
          </div>

          {tab === 'overview' && <OverviewTab payload={payload} now={now} progress={progress} />}
          {tab === 'calendar' && (
            <CalendarTab clientId={client.id} sessions={payload.sessions} month={options.month ?? null} now={now} />
          )}
          {tab === 'progress' && (
            <ProgressTab clientId={client.id} progress={progress} failed={progressFailed} />
          )}
          {tab === 'assessments' && (
            <ChecksTab
              clientId={client.id}
              clientName={client.name}
              rows={assessments}
              schedules={schedules}
              templates={templates}
              now={now}
            />
          )}
          {tab === 'sessions' && (
            <SessionsTab
              clientId={client.id}
              sessions={payload.sessions}
              range={options.range ?? '90d'}
              older={options.older ?? 0}
              now={now}
            />
          )}
          {tab === 'program' && (
            <ProgramTab programs={payload.programs} sessions={payload.sessions} client={client} now={now} />
          )}
          {tab === 'payments' && (
            <PaymentsTab
              client={client}
              packages={payload.history}
              payments={payload.payments}
              priceList={payload.priceList}
              adjustments={payload.adjustments}
              now={now}
            />
          )}
          {tab === 'information' && (
            <PersonalTab
              client={client}
              /* The newest weight reading, off the readings the tab loaded
                 (R30: weight only ever comes from an assessment). */
              weightKg={latestWeight?.value ?? null}
              weightAt={latestWeight?.at ?? null}
              now={now}
              notes={payload.notes}
            />
          )}
        </div>
      </main>

    </>
  );
}
