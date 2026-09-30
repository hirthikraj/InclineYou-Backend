'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { TodayData } from '@/lib/today/api';
import { dayMoney, findClash, findGaps, windowsFor } from '@/lib/today/day';
import { sessions } from '@/lib/today/copy';
import { dayLong, dayStamp, minuteOfDay, startOfDay } from '@/lib/today/time';
import { defaultSlot } from '@/lib/schedule/book';
import { SNAP_MINUTES } from '@/lib/schedule/result';
import { BookPanel } from '@/components/schedule/BookPanel';
import { TopBar } from '@/components/shell/TopBar';
import { Calendar, Plus } from '@/components/shell/Icons';
import { AttentionQueue } from './AttentionQueue';
import { useHeartbeat, useNow } from './Clock';
import { FirstRun } from './FirstRun';
import { Hero } from './Hero';
import { OwedAssessmentsProvider } from './OwedAssessments';
import { usePaletteRows } from '@/components/shell/PaletteHost';
import { Glance, PhoneStack, TodayList } from './PhoneStack';
import { LastContactProvider } from '@/components/nudge/LastContact';
import { Button } from '@/web-components/ui/Button';

/**
 * THREE BLOCKS, IN THE ORDER OF WHAT IT COSTS TO IGNORE THEM.
 *
 *   1 · **Next up** — the session in front of the trainer, large and unmissable,
 *       with one primary verb, on a washed card; beside it the session after that,
 *       plain. Two cards at a desk, one on a phone. Below them, the rest of the
 *       day as compact rows — which is where the third session onwards lives.
 *   2 · **Needs you today** — the ranked action queue, capped, every row with a
 *       one-tap verb and a way to say *not now*.
 *   3 · **Today at a glance** — three numbers, no more.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS REPLACES, AND THE ARGUMENT IT KEEPS
 *
 * It was three ROWS: what is happening, the shape of the day as a minute-true
 * ribbon, then a `1.5fr 1fr 1fr` row of the queue, the week and the month. That
 * layout answered *how is my practice doing* as well as *what must I do today*, and
 * the two questions want different screens.
 *
 * The part of its argument that survives unchanged is the part about what is NOT
 * here. The dashboard both of these replaced opened with four month-to-date money
 * cards and a greeting; `deck.ts`'s docstring settles it in one sentence — "a
 * trainer's home is a to-do list, not a report … no chart until the day is over,
 * and no greeting at all." So there is still no stat rail at the top, no chart, and
 * no *Good morning*. Block 3 is three figures at the FOOT, which is the opposite
 * position and the opposite claim: what you check after the work, not what greets
 * you before it.
 *
 * ── WHAT WENT, AND WHERE IT WENT ─────────────────────────────────────────────
 *
 * `DayRibbon`, `WeekCard` and `MonthCard` are no longer mounted. The ribbon's
 * question — *where is the two-hour hole* — is a planning question and `/schedule`
 * draws the same day at one minute to one pixel with a booking form attached. The
 * week and the month are a report; `/reports` and `/money` owe them. All three are
 * still in the tree with docstrings saying so, because deleting a built module
 * whose route is a `NotBuilt` placeholder is losing work with nowhere to put it.
 *
 * ── WHY THIS IS A CLIENT COMPONENT WHEN THE DECK IS BUILT ON THE SERVER ──────
 *
 * It owns four things a server cannot: the ticking clock, the palette's open
 * state, the ten-second holds in the queue, and the queue's disclosures.
 * Everything it DRAWS was derived on the server and arrives as one prop — so the
 * browser re-runs the day's geometry (cheap, and pure) but never the nine
 * requests.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * AND ONE STACK NOW, WHERE THERE WERE TWO
 *
 * The phone pass mounted the app's own modules under 900px and hid the desk's, and
 * its table is still in `PhoneStack.tsx`. The restructure collapsed most of that
 * distinction rather than deepening it: `Glance` and `TodayList` are the app's
 * modules and they are now what the DESK draws too, so there is one component per
 * module and no `display:none` twin. The hero's card count is the only thing left
 * that CSS decides, and *Recent activity* the only module still phone-only.
 *
 * The reading order is the same at every width, which is the thing a stacked
 * dashboard usually loses: what is happening → the rest of the day → who needs a
 * decision → the three figures.
 */
export function Today({ data }: { data: TodayData }) {
  const router = useRouter();
  const { deck, trainer, hours, rates, book, renewTerms, openLogs, assessments, now: serverNow } = data;

  const now = useNow(serverNow);
  const refresh = useCallback(() => router.refresh(), [router]);
  useHeartbeat(refresh);

  /*
   * ── BOOKING HAPPENS HERE NOW, NOT ON THE SCHEDULE ──────────────────────────
   *
   * *New session* was a `<Link>` to `/schedule?new=1`. It worked — `Schedule.tsx`
   * reads that parameter and opens `BookPanel` on the same default slot — but the
   * route it took to get there was the whole cost: a page transition, a week grid
   * fetched and drawn, and then a panel over the top of it, to book an hour on
   * the day the trainer was already looking at. Every one of those is a thing
   * they then have to come back from, and coming back is a second navigation
   * that loses the queue's scroll position.
   *
   * The panel is the same component and books through the same server action, so
   * this is not a second booking form — it is the one form, opened where the verb
   * was pressed. What is deliberately NOT copied over is the grid: this screen
   * has no slots to click, so the day is always today and the time is a field in
   * the form. `defaultSlot` supplies the same next-whole-hour the schedule's own
   * + does, from `lib/schedule/book.ts` so the two cannot drift.
   *
   * `/schedule?new=1` still works and still has three callers — the bar's add
   * sheet, the roster's empty state, and anybody's bookmark. Nothing about this
   * screen's shortcut takes that route away; it only stops being the way to book
   * from the screen that already knows which day is meant.
   */
  const [booking, setBooking] = useState<{ dayAt: number; minute: number } | null>(null);

  /** The next whole hour today — the schedule's own rule, on today's midnight. */
  const openBooking = useCallback(
    () => setBooking(defaultSlot(startOfDay(now), 'day', now)),
    [now],
  );

  /* The hero's sellable-gap chip means a particular hour rather than the next
     one, so it names the minute. Snapped for the same reason `?book=` was. */
  const openBookingAt = useCallback(
    (minute: number) => setBooking({
      dayAt: startOfDay(now),
      minute: Math.round(minute / SNAP_MINUTES) * SNAP_MINUTES,
    }),
    [now],
  );

  /* The palette is the shell's now — mounted once for every screen instead of
     by whichever screen remembered to. Today still hands up the rows only Today
     has, which is what makes ⌘K here offer *Renew Rohan's pack* and not just a
     list of names. See `PaletteHost`. */
  usePaletteRows({ clients: deck.roster, attention: deck.attention, today: deck.today });

  // The day's shape. Derived from the SERVER's instant for the parts that must
  // not move — the day's extent and its gaps are facts about the day, not about
  // this second — and from the ticking `now` only where a minute matters.
  //
  // `buildRibbon` is no longer called here: the ribbon is unmounted (see below),
  // and `findGaps` is still needed because the hero's band prices the next
  // sellable hour and the day-closed card names the ones that went unsold.
  const windows = windowsFor(hours, serverNow);
  const gaps = findGaps(windows, deck.today, minuteOfDay(now));
  const money = dayMoney(deck.today, rates);
  const clash = findClash(deck.tomorrowSessions);

  /*
   * The sessions the hero is drawing as cards, in card order. Two at most — see
   * the chooser in `Hero.tsx` for why the third became a list row.
   *
   * The first is dropped from the list below outright; the second is marked and
   * hidden above 1080px, the width at which its card appears, because that half of
   * the card COUNT is CSS's decision and not this file's. `TodayList` carries the
   * argument, and it is there because rendering at 1920 showed the same client
   * twice inside 400px.
   *
   * The two slices must stay in step with the chooser's: a hero drawing a card
   * this list does not know about is the duplicate row coming straight back.
   */
  const heroIds = (
    deck.running
      ? [deck.running.scheduledId, ...deck.upNext.slice(0, 1).map((s) => s.id)]
      : deck.upNext.slice(0, 2).map((s) => s.id)
  ).filter(Boolean) as string[];

  const subtitle = deck.firstRun
    ? 'No clients yet · nothing to show until there is one'
    : deck.running
      ? `In session with ${deck.running.clientName} · ${sessions(deck.today.length)}, ${deck.todayDone} done`
      : deck.today.length === 0
        ? `${dayStamp(serverNow)} · nothing booked`
        : deck.todayDone === deck.today.length
          ? `Day done · ${deck.todayDone} of ${deck.today.length} delivered`
          : `${dayStamp(serverNow)} · ${sessions(deck.today.length)}, ${deck.todayDone} done`;

  return (
    <LastContactProvider map={data.lastContact} now={data.now}>
      <OwedAssessmentsProvider value={assessments}>
      <TopBar crumb="Today" />

      <main className="main" id="main-content">
        {/*
          `.ph--today` IS A SCOPE, NOT A STYLE.

          Under 900px this header draws NOTHING and its padding goes to zero: the
          date stands down, both verbs go with it because the bar now says both —
          *The week* is the Schedule tab and *New session* is the + — and the
          subtitle goes too, because the hero card directly under it opens with the
          same client, the same status and the same tally in type a reader can
          actually use. `/schedule` uses the same `.ph` and must NOT inherit any of
          it, since its own secondary is a link into Settings that nothing else on
          the screen reaches. app.css carries the argument under *the page header
          on a phone*.

          The h1, the subtitle and the two links are still RENDERED at every width.
          CSS decides which are drawn — the shell's rule on this half, and here it
          also keeps the document's heading outline intact on a phone: the date is
          clipped rather than dropped and remains in the accessibility tree exactly
          as the schedule's title does.
        */}
        <div className="ph ph--today">
          <div className="ph__row">
            <div className="ph__id">
              {/*
                AN `<h1>`, WHICH THIS SCREEN DID NOT HAVE.
                It was a `<p>`, and with every card title a `<span>` the page's
                heading outline was empty — six modules and nothing to jump
                between. `.ph__t` sets its own font, so the tag is free.

                Under 900px it is visually hidden rather than dropped, so the date
                is still the first thing a reader lands on. Above it, the
                `white-space:normal` delta is what stops "Saturday, 23 August 2026"
                — 260px at 22px — running off the side of a 390px screen in the
                window between 561 and 900 where it is still drawn.
              */}
              <h1 className="ph__t">{dayLong(serverNow)}</h1>
              <p className="ph__sub">{subtitle}</p>
            </div>
            {/* Dropped entirely on the first run rather than disabled: there is
                no week to open and nobody to book. Hidden under 900px too — see
                the note on `.ph--today` above. */}
            {!deck.firstRun && (
              <div className="ph__acts ph__acts--pair">
                <Button href="/schedule" variant="secondary">
                  <Calendar size={15} />
                  The week
                </Button>
                {/* A button, not a link — see the note in the body. The panel
                    opens over this screen instead of over a week grid two
                    navigations away. */}
                <Button variant="primary" onClick={openBooking}>
                  <Plus size={15} />
                  New session
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="body">
          {deck.firstRun ? (
            <FirstRun />
          ) : (
            <>
              {/* BLOCK 1 — what is happening, and what is next. Two cards, the
                  first washed and the second plain; `.today__hero` drops the
                  second below 1080px. */}
              <Hero
                deck={deck}
                now={now}
                money={money}
                gaps={gaps}
                windows={windows}
                gymSharePercent={trainer.gymSharePercent}
                gymName={trainer.gymName}
                clash={clash}
                hasAnyHours={hours.length > 0}
                onBook={openBookingAt}
              />

              {/* …and below it, the rest of the day as compact rows. One
                  component at every width, where the ribbon and the phone's own
                  list used to be two. */}
              <TodayList deck={deck} heroIds={heroIds} />

              {/*
                BLOCK 2 — the ranked queue, full width.

                It used to be the first of three columns at `1.5fr 1fr 1fr`, with
                the week and the month beside it. Both are unmounted now, so the
                ratio has nothing to divide and the queue takes the row.

                That is a straight improvement rather than a consequence: the
                comment this replaces argued that the reason column "must never be
                truncated — '₹6,000 overdue · 11 days' IS the row", and then gave
                the queue 1.5 of 3.5 tracks, which is 480px at 1440 against a table
                measured at ~552px. `AGENTS.md` recorded that overflow as open, with
                the fix being a container query. The full width closes it by
                arithmetic instead: the card is ~1,140px at 1440 with the rail up,
                and the four columns have room to spare at every width above the
                620px reflow.
              */}
              <AttentionQueue
                  items={deck.attention}
                  silenced={deck.silenced}
                  renewTerms={renewTerms}
                  openLogs={openLogs}
                  todayCount={deck.today.length}
                  now={now}
                />

              {/* BLOCK 3 — three numbers, no more. At the FOOT, after the work:
                  they are what a trainer checks once the list is clear, not the
                  thing that greets them. */}
              <Glance deck={deck} />

              {/* What happened — the one module that is still phone-only, and the
                  reason is in `PhoneStack`: a desk has `/reports` in the rail. */}
              <PhoneStack deck={deck} />

            </>
          )}
        </div>
      </main>

      {/*
        THE SAME PANEL THE SCHEDULE DRAWS, AND IN THE SAME PLACE IN THE TREE —
        a sibling of `<main>`, because `.panel` is `position:absolute` against the
        shell and would be clipped by the body's own scroller otherwise.

        `windows` is today's merged working hours, which is the right list at
        every width: this screen can only ever book today, so there is no other
        day's hours to be wrong about. Under 900px `.sch__panel` turns it into a
        bottom sheet — that rule is keyed on the class and not on the route, so it
        applies here unchanged.
      */}
      {booking && (
        <BookPanel
          dayAt={booking.dayAt}
          minute={booking.minute}
          clients={book.clients}
          sessions={book.sessions}
          windows={windows}
          rates={rates}
          onClose={() => setBooking(null)}
          onBooked={() => {
            setBooking(null);
            refresh();
          }}
        />
      )}
      </OwedAssessmentsProvider>
    </LastContactProvider>
  );
}
