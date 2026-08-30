'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import type { ScheduleData } from '@/lib/schedule/api';
import { buildGrid, MAX_WEEK_LANES } from '@/lib/schedule/grid';
import { buildMonth } from '@/lib/schedule/month';
import { updateSession } from '@/lib/schedule/actions';
import { MOVE_HOLD_SECONDS, SNAP_MINUTES } from '@/lib/schedule/result';
import {
  crumbFor, gridDays, gridStart, hrefFor, labelFor, stepAnchor, type ScheduleView,
} from '@/lib/schedule/view';
import { DAY_MS, dayLong, formatMinute, minuteOfDay, startOfDay } from '@/lib/today/time';
import { TopBar } from '@/components/shell/TopBar';
import { Clock, Plus } from '@/components/shell/Icons';
import { useHeartbeat, useNow } from '@/components/today/Clock';
import { Palette, usePaletteKey } from '@/components/today/Palette';
import { MonthGrid } from './MonthGrid';
import { TimeGrid } from './TimeGrid';
import { DayAgenda } from './DayAgenda';
import { WeekPips } from './WeekPips';
import { Toolbar } from './Toolbar';
import { SessionPanel } from './SessionPanel';
import { BookPanel } from './BookPanel';
import { WarnTriangle } from './Icons';

/**
 * THE SCHEDULE — THREE VIEWS OF ONE ROUTE, AND ONE PLACE THE STATE LIVES.
 *
 * `lib/schedule/view.ts` draws the line: the URL carries the view and the anchor
 * because they decide what is FETCHED; everything else is here because it decides
 * only what is DRAWN, and a chip toggle must not cost six backend requests.
 *
 * ── WHY THE GEOMETRY IS RECOMPUTED IN THE BROWSER ────────────────────────────
 *
 * The same call `Today.tsx` makes and for the same reason: `buildGrid` over a
 * week of sessions is pure and costs nothing, and shipping its output would mean
 * shipping it again every time the clock moved the now-line. The SERVER owns the
 * facts; the browser owns the minute.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * MOVING A SESSION IS SELECT-THEN-PLACE, NOT DRAG
 *
 * Frames 5a and 5b draw a drag, and the component library that specifies them
 * already wrote down the problem with it: moving a session by keyboard has to use
 * cut and paste *"because drag alone would fail SC 2.5.7"*. That is a real
 * requirement and it is usually met by building a drag and then bolting a second,
 * worse mechanism beside it for keyboards.
 *
 * This builds only the second one, for everybody — pick the session, then pick
 * the slot. Three things it gets that a drag does not:
 *
 *   · **It works on a touch screen.** A drag on a 390px week that also scrolls in
 *     two axes is a gesture fighting two scrollers; every calendar that ships one
 *     also ships a long-press to disambiguate, and a long-press is a hidden
 *     control.
 *   · **One code path, so one set of bugs.** No parallel keyboard mechanism to
 *     drift out of step with the pointer one.
 *   · **The target is a click, so it can be read before it is committed.** A drag
 *     commits at the moment the finger lifts, which is exactly when the read-out
 *     is under the finger.
 *
 * The ten-second hold is kept in full, because it is not about drags — it is
 * about the WhatsApp. The design's own session history reads *"Moved from Monday
 * 17:00 · Nikhil asked. He was told automatically"*, so a mis-placed move
 * messages a client, and undo after the message has gone is an apology.
 * `MOVE_HOLD_SECONDS` in `lib/schedule/result.ts` carries the argument, including
 * the honest cost: nothing is on the server during those ten seconds.
 */

interface PendingMove {
  sessionId: string;
  clientName: string;
  /** Where it was, so Undo does not have to re-read the row. */
  fromAt: number;
  toAt: number;
  minutes: number;
  status: string;
  mode: 'floor' | 'remote';
  notes: string | null;
  /** When the hold started, so the bar and the label read from one clock. */
  since: number;
}

export function Schedule({ data }: { data: ScheduleData }) {
  const router = useRouter();
  const { view, anchor, sessions, clients, hours, rates, trainer, now: serverNow } = data;

  const now = useNow(serverNow);
  const refresh = useCallback(() => router.refresh(), [router]);
  useHeartbeat(refresh);

  /* ------------------------------------------------------------ view state */

  const [modes, setModes] = useState({ floor: true, remote: true });
  const [showGaps, setShowGaps] = useState(false);
  const [openBands, setOpenBands] = useState<Set<number>>(() => new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  /*
   * `?new=1` OPENS THE BOOKING FORM, and this is the parameter that makes the +
   * an action rather than a navigation.
   *
   * Two links already pointed here and neither did anything: `/today`'s *New
   * session* button and — since the bar grew a centre + — the add sheet's one live
   * row. `page.tsx` reads `view` and `d` and nothing else, so the form's own state
   * lives here and the parameter had no reader. It has one now, and it calls the
   * same `defaultSlot` the toolbar's button and the `N` accelerator call, so all
   * three open on the same slot.
   *
   * It is an INITIALISER and not an effect: a `setBooking` in a mount effect is a
   * second render pass and the lint rule that forbids it is right. `serverNow` is
   * a prop rather than the ticking `now`, which also makes the initialiser pure —
   * the server and the hydrating client compute the same slot, so nothing flickers.
   *
   * The parameter is deliberately NOT stripped after opening. A URL that says *new
   * session* and a reload that does not open one is the more surprising of the two,
   * and closing the form does not close the reason the trainer arrived.
   *
   * `?book=<minute>` is the ribbon's gap chips on `/today` — same rule, and the
   * minute they name is the point of the link, so it overrides the default slot.
   */
  const params = useSearchParams();

  /** `new` → the default slot; `book=<minute>` → that minute on the anchor's day. */
  const asked = params.get('new') === '1' ? 'new' : params.get('book');
  const slotAsked = (instant: number) => {
    if (asked === null) return null;
    const slot = defaultSlot(anchor, view, instant);
    if (asked === 'new') return slot;
    const minute = Number(asked);
    if (!Number.isFinite(minute) || minute < 0 || minute >= 24 * 60) return null;
    return { dayAt: slot.dayAt, minute: Math.round(minute / SNAP_MINUTES) * SNAP_MINUTES };
  };

  const [booking, setBooking] = useState<{ dayAt: number; minute: number } | null>(() =>
    slotAsked(serverNow),
  );

  /*
   * AND IT HAS TO SURVIVE ARRIVING HERE FROM HERE.
   *
   * The initialiser above runs once per mount, which is enough for a trainer coming
   * from `/today`. It is NOT enough for the bar's + on this very screen: the sheet's
   * *Book a session* row links to `/schedule?new=1`, the segment is unchanged, so
   * Next does a soft navigation and this component stays mounted — the parameter
   * changes and nothing opens.
   *
   * So the parameter change is handled during render, which is React's documented
   * pattern for adjusting state when an input changes and is the reason there is no
   * effect here: an effect would paint the un-opened form for one frame first. The
   * comparison is against the previous parameter held in state, so it fires once per
   * change rather than on every render.
   *
   * `now` and not `serverNow` this time, deliberately: the first render must agree
   * with the server's HTML, and a trainer who has had this page open for two hours
   * should get a form on the next hour rather than on the hour the page loaded.
   */
  const [askedSeen, setAskedSeen] = useState(asked);
  if (asked !== askedSeen) {
    setAskedSeen(asked);
    if (asked !== null) setBooking(slotAsked(now));
  }

  /*
   * The parameter is then STRIPPED, and that reverses an earlier decision in this
   * file worth recording. Keeping it looked more honest — a URL that says *new
   * session* and a reload that does not open one is surprising. But keeping it makes
   * the + a one-shot: press it twice and the second navigation is to the identical
   * URL, which the router correctly treats as nothing at all. The form is a
   * transient action rather than a view, and the view is what `view` and `d` are
   * for. `hrefFor` rebuilds the canonical URL, so this loses nothing else.
   */
  useEffect(() => {
    if (asked !== null) router.replace(hrefFor(view, anchor), { scroll: false });
  }, [asked, view, anchor, router]);
  const [moving, setMoving] = useState<string | null>(null);
  /*
   * THE PALETTE IS THE SAME ONE, AND IT IS NOT DECORATION HERE.
   *
   * `TopBar` draws a search box promising ⌘K on every screen it appears on, and a
   * promise in print that nothing binds is the defect this half already records
   * for the rail's accelerators. So the palette is mounted, with the roster and
   * this range's sessions.
   *
   * `attention` is empty and that is correct rather than a gap: the queue is
   * derived from payments and workout logs, which this screen deliberately does
   * not fetch (`lib/schedule/api.ts` says why). An empty list draws no group —
   * checked — so the palette is short here rather than wrong.
   */
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [, startWrite] = useTransition();

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeX = useRef<number | null>(null);
  const swipeY = useRef<number | null>(null);

  /* ------------------------------------------------------------- the grid */

  /*
   * The optimistic move.
   *
   * During the hold the block must be drawn where it is GOING, not where it is —
   * a ten-second undo on a block that has not moved is a countdown attached to
   * nothing. So the session list the geometry is built from is the server's list
   * with one row rewritten, and the write happens when the hold expires.
   */
  const drawn = useMemo(() => {
    if (!pending) return sessions;
    return sessions.map((s) =>
      s.id === pending.sessionId ? { ...s, at: pending.toAt } : s,
    );
  }, [sessions, pending]);

  const grid = useMemo(
    () =>
      buildGrid({
        start: gridStart(view, anchor),
        dayCount: gridDays(view),
        hours,
        sessions: drawn,
        now,
        modes,
        openBands,
        withRows: view !== 'month',
        /*
         * Capped on the week, uncapped on the day, and the month never draws a
         * block at all. `MAX_WEEK_LANES` carries the arithmetic; the short of it
         * is that a week column is a third the width of a day column, so the
         * width at which lanes stop being legible arrives three times sooner.
         */
        maxLanes: view === 'week' ? MAX_WEEK_LANES : undefined,
      }),
    [view, anchor, hours, drawn, now, modes, openBands],
  );

  const month = useMemo(
    () => (view === 'month' ? buildMonth(grid.days, anchor) : null),
    [view, grid.days, anchor],
  );

  /* ---------------------------------------------------------------- moving */

  const commit = useCallback((move: PendingMove) => {
    startWrite(async () => {
      await updateSession({
        id: move.sessionId,
        scheduledAt: move.toAt,
        durationMinutes: move.minutes,
        status: move.status,
        deliveryMode: move.mode,
        notes: move.notes,
      });
      setPending(null);
    });
  }, []);

  const placeAt = useCallback(
    (dayAt: number, minute: number) => {
      const s = sessions.find((x) => x.id === moving);
      setMoving(null);
      if (!s) return;

      const toAt = dayAt + minute * 60_000;
      if (toAt === s.at) return;

      // A second move while one is held commits the first rather than losing it.
      // The alternative silently discards a write the trainer already made and
      // watched the countdown on.
      if (pending && timer.current) {
        clearTimeout(timer.current);
        commit(pending);
      }

      const move: PendingMove = {
        sessionId: s.id,
        clientName: s.clientName,
        fromAt: s.at,
        toAt,
        minutes: s.minutes,
        status: s.status,
        mode: s.mode,
        notes: s.notes,
        since: Date.now(),
      };
      setPending(move);
      timer.current = setTimeout(() => commit(move), MOVE_HOLD_SECONDS * 1000);
    },
    [sessions, moving, pending, commit],
  );

  const undo = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPending(null);
  }, []);

  // A move that is still held when the tab closes never happened, which is the
  // honest reading of an undo that has not expired — and is why this only clears
  // the timer rather than trying to flush it.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  /* -------------------------------------------------------------- clicking */

  const onSlot = useCallback(
    (dayAt: number, minute: number) => {
      if (moving) placeAt(dayAt, minute);
      else setBooking({ dayAt, minute });
    },
    [moving, placeAt],
  );

  const goTo = useCallback(
    (nextView: ScheduleView, nextAnchor: number) => {
      // `push`, not `replace`: stepping through weeks is navigation, and the back
      // button going back a week is what a trainer expects from an arrow.
      router.push(hrefFor(nextView, nextAnchor));
    },
    [router],
  );

  /* ── touch swipe: left = next, right = prev ─────────────────────────────
     Attached to .sch__body so the whole calendar area is the swipe surface.
     Only fires when the horizontal delta beats 50px AND dominates the vertical
     delta, so normal scroll is not hijacked. Available at every width — CSS
     hides the time grid on mobile where it belongs, and the gesture is harmless
     on desktop where no touch events arrive. */
  const onSwipeStart = useCallback((e: React.TouchEvent) => {
    swipeX.current = e.touches[0].clientX;
    swipeY.current = e.touches[0].clientY;
  }, []);

  const onSwipeEnd = useCallback(
    (e: React.TouchEvent) => {
      if (swipeX.current === null || swipeY.current === null) return;
      const dx = e.changedTouches[0].clientX - swipeX.current;
      const dy = e.changedTouches[0].clientY - swipeY.current;
      swipeX.current = null;
      swipeY.current = null;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
      goTo(view, stepAnchor(view, anchor, dx < 0 ? 1 : -1));
    },
    [view, anchor, goTo],
  );

  usePaletteKey(useCallback(() => setPaletteOpen(true), []));

  /* ------------------------------------------------------- the accelerators */

  /**
   * `[` and `]` step, not the arrow keys — the arrows belong to the grid, where
   * they move between sessions, and a screen with two meanings for one key has
   * neither. `t` today, `d`/`w`/`m` the views, `n` a new session.
   *
   * Suppressed inside a field and under any modifier, so `⌘W` still closes the
   * tab and typing "monday" in the roster search does not step the month.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;

      if (e.key === 'Escape' && moving) return setMoving(null);
      if (e.key === '[') return goTo(view, stepAnchor(view, anchor, -1));
      if (e.key === ']') return goTo(view, stepAnchor(view, anchor, 1));

      const k = e.key.toLowerCase();
      if (k === 't') return goTo(view, startOfDay(Date.now()));
      if (k === 'd') return goTo('day', anchor);
      if (k === 'w') return goTo('week', anchor);
      if (k === 'm') return goTo('month', anchor);
      if (k === 'n') {
        e.preventDefault();
        return setBooking(defaultSlot(anchor, view, now));
      }
      return undefined;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, anchor, now, moving, goTo]);

  /* ---------------------------------------------------------------- header */

  const live = sessions.filter((s) => !s.dead);
  const counts = {
    floor: live.filter((s) => s.mode === 'floor').length,
    remote: live.filter((s) => s.mode === 'remote').length,
  };

  const today = startOfDay(now);
  const onToday = today >= data.from && today < data.to;

  /**
   * WHAT A CLICK ON A BLOCK DOES, AND IT DEPENDS ON WHICH SIDE OF NOW IT IS.
   *
   * A session that has not happened yet is a set of decisions — how long, floor
   * or remote, a note for it, move it, cancel it, mark it no-show — and every one
   * of them is a conversation with the GRID behind the panel. Taking the trainer
   * to another page to change a duration and back to see what it did to Thursday
   * is the wrong trade, so an upcoming session still opens the panel.
   *
   * A session that has already happened has nothing left to decide. It has a
   * record — the plan, the sets, the notes, whether the pack moved — and none of
   * that fits beside a week grid. So a past block navigates, and the panel is not
   * in the path at all.
   *
   * "Past" is settled OR run-and-unmarked: `late` is
   * `!done && !dead && scheduledAt + minutes <= now`, so the only thing that
   * reaches the panel is a session still to come or one running right now — which
   * a trainer may well want to move or mark from the grid.
   */
  const isPast = useCallback(
    (s: { done: boolean; noShow: boolean; dead: boolean; late: boolean }) =>
      s.done || s.noShow || s.dead || s.late,
    [],
  );

  const openSessionById = useCallback(
    (id: string) => {
      const s = drawn.find((row) => row.id === id);
      if (s && isPast(s)) {
        router.push(`/sessions/${id}`);
        return;
      }
      setOpenId(id);
    },
    [drawn, isPast, router],
  );

  const openSession = openId ? drawn.find((s) => s.id === openId) ?? null : null;
  const movingSession = moving ? sessions.find((s) => s.id === moving) ?? null : null;

  /*
   * ── A FIGURE OVER 100 NEEDS THE WORD, NOT JUST THE NUMBER ──────────────────
   *
   * FOUND BY RENDERING REAL ROWS. "294% of your hours" is arithmetically exactly
   * right and reads as a fault in the page. A percentage is understood against a
   * ceiling of 100 unless something says otherwise, so the first thing a trainer
   * does with 294% is doubt it — and the figure is at its most useful precisely
   * when it is highest, which is the worst possible time to be doubted.
   *
   * The number stays, uncapped, because clamping it is the lie `month.ts` had to
   * be talked out of. One word turns it from a suspected bug into a finding.
   */
  const over = grid.totals.utilisation !== null && grid.totals.utilisation > 100;

  const subtitle = [
    `${grid.totals.sessions} ${grid.totals.sessions === 1 ? 'session' : 'sessions'}`,
    grid.totals.utilisation !== null
      ? `${grid.totals.utilisation}% of your hours${over ? ' — overbooked' : ''}`
      : 'no working hours set',
    grid.totals.clashDays
      ? `${grid.totals.clashDays} ${grid.totals.clashDays === 1 ? 'day' : 'days'} with a clash`
      : null,
    view !== 'month' && grid.totals.gapSlots
      ? `${grid.totals.gapSlots} sellable ${grid.totals.gapSlots === 1 ? 'hour' : 'hours'} free`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <TopBar crumb={crumbFor(view, anchor)} onSearch={() => setPaletteOpen(true)} />

      <main className="main" id="main-content">
        <div className="ph sch__ph">
          <div className="ph__row">
            <div className="ph__id">
              <h1 className="ph__t">{labelFor(view, anchor)}</h1>
              <p className="ph__sub">{subtitle}</p>
            </div>
            {/*
              THE TWO VERBS SHARE A ROW, WHICH `.ph__acts--pair` DOES NOT DO.
              That class stacks them full-width under 560px, which is right on
              `/today` where both are the day's own actions. Here the secondary
              is a link into Settings, and giving it a full-width row above the
              calendar spent ~60px of a 390px screen on the least urgent control
              on the page — found by screenshotting, where the grid started
              260px down. It keeps its icon and drops its label instead.
            */}
            <div className="ph__acts ph__acts--pair sch__acts">
              <Link
                className="btn btn--secondary sch__hours"
                href="/settings/hours"
                aria-label="Working hours"
              >
                <Clock size={15} />
                <span className="sch__lbl">Working hours</span>
              </Link>
              <button
                className="btn btn--primary"
                type="button"
                onClick={() => setBooking(defaultSlot(anchor, view, now))}
              >
                <Plus size={15} />
                New session
              </button>
            </div>
          </div>
        </div>

        <div className="body body--flush sch__body" onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd}>
          <Toolbar
            view={view}
            label={labelFor(view, anchor)}
            onToday={onToday}
            counts={counts}
            modes={modes}
            gaps={showGaps}
            gapSlots={grid.totals.gapSlots}
            hoursHref="/settings/hours"
            onView={(v) => goTo(v, anchor)}
            onStep={(d) => goTo(view, stepAnchor(view, anchor, d))}
            onJumpToday={() => goTo(view, startOfDay(Date.now()))}
            onMode={(m) => setModes((s) => ({ ...s, [m]: !s[m] }))}
            onGaps={() => setShowGaps((g) => !g)}
          />

          {/*
            THE MOVE BAR. It is a live region and it is the only thing on the
            screen that changes what a click means, so it says so in words rather
            than relying on a cursor — a cursor does not exist on a touch screen
            and is not announced anywhere.
          */}
          {movingSession && (
            <div className="sch__moving" role="status">
              <WarnTriangle size={14} />
              <span>
                Moving <b>{movingSession.clientName}</b> — tap or click where it should go.
              </span>
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => setMoving(null)}>
                Cancel
              </button>
            </div>
          )}

          {hours.length === 0 && (
            <div className="sch__nohours">
              <span>
                You have not told us when you work, so nothing is hatched and no gap is
                priced. The grid still draws every session.
              </span>
              <Link className="btn btn--secondary btn--sm" href="/settings/hours">
                Set your hours
              </Link>
            </div>
          )}

          {view === 'month' && month ? (
            <MonthGrid
              month={month}
              onOpenDay={(at) => goTo('day', at)}
              onOpenWeek={(at) => goTo('week', at)}
            />
          ) : (
            <>
              {/*
                MOBILE OVERRIDES FOR WEEK AND DAY.
                Both mobile components (WeekPips, DayAgenda) are mounted
                alongside the time grid — CSS picks which shows at each width:
                  · .wkp  hidden above 900px (week pips)
                  · .dag  hidden above 900px (day agenda)
                  · .sch__tg hidden at ≤900px (time grid wrapper)
                No mount/unmount flash on resize. TimeGrid always lives in
                .sch__tg so it behaves identically on desktop for both views.
              */}
              {view === 'week' && (
                <WeekPips grid={grid} onOpenDay={(at) => goTo('day', at)} />
              )}
              {view === 'day' && (
                <DayAgenda
                  grid={grid}
                  anchor={anchor}
                  now={now}
                  placing={Boolean(moving)}
                  justMovedId={pending?.sessionId ?? null}
                  onOpenSession={openSessionById}
                  onBook={onSlot}
                  onGoToDay={(at) => goTo('day', at)}
                />
              )}
              <div className="sch__tg">
                <TimeGrid
                  grid={grid}
                  rates={rates}
                  gymSharePercent={trainer.gymSharePercent}
                  now={now}
                  showGaps={showGaps}
                  lane={view === 'day'}
                  justMovedId={pending?.sessionId ?? null}
                  placing={Boolean(moving)}
                  onToggleBand={(from) =>
                    setOpenBands((s) => {
                      const next = new Set(s);
                      if (next.has(from)) next.delete(from);
                      else next.add(from);
                      return next;
                    })
                  }
                  onOpenSession={openSessionById}
                  onOpenDay={(at) => goTo('day', at)}
                  onBook={onSlot}
                />
              </div>
            </>
          )}
        </div>

        {pending && (
          <UndoBar
            // Keyed on the move, so a second move while one is held remounts the
            // bar with a fresh ten seconds rather than reusing a countdown that
            // is already half spent.
            key={pending.since}
            move={pending}
            onUndo={undo}
            onNow={() => {
              if (timer.current) clearTimeout(timer.current);
              commit(pending);
            }}
          />
        )}
      </main>

      {openSession && (
        <SessionPanel
          /* Staged edits live in the panel, so a click on a second block while
             the first is open must REMOUNT rather than re-render — otherwise the
             first session's unsaved note is sitting in the second one's box. */
          key={openSession.id}
          session={openSession}
          client={clients.find((c) => c.id === openSession.clientId)}
          rate={rates.perSession.get(openSession.clientId) ?? null}
          now={now}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
          onMove={() => {
            setOpenId(null);
            setMoving(openSession.id);
          }}
        />
      )}

      {booking && (
        <BookPanel
          dayAt={booking.dayAt}
          minute={booking.minute}
          clients={clients}
          sessions={sessions}
          windows={
            grid.days.find((d) => d.at === booking.dayAt)?.windows ?? []
          }
          rates={rates}
          onClose={() => setBooking(null)}
          onBooked={() => {
            setBooking(null);
            refresh();
          }}
        />
      )}

      <Palette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        attention={[]}
        today={live.filter((s) => startOfDay(s.at) === today)}
      />

    </>
  );
}

/* ------------------------------------------------------------------- undo ── */

/**
 * The countdown, and it is a bar as well as a number.
 *
 * webapp.css says why in one clause: *"a bar and not a number alone, because '8s'
 * without a moving edge is a fact you have to keep re-reading."* The `role`
 * is `status` rather than `alert` — nothing went wrong, and an assertive live
 * region would interrupt a screen reader mid-sentence every second.
 */
function UndoBar({
  move, onUndo, onNow,
}: {
  move: PendingMove;
  onUndo: () => void;
  onNow: () => void;
}) {
  /*
   * Seeded at the full ten, and never re-seeded — the component is keyed on the
   * move, so a new move is a new instance. An effect whose body sets state is a
   * cascading render, and this one used to have exactly that.
   */
  const [left, setLeft] = useState(MOVE_HOLD_SECONDS);

  useEffect(() => {
    const id = setInterval(() => {
      const gone = Math.floor((Date.now() - move.since) / 1000);
      setLeft(Math.max(0, MOVE_HOLD_SECONDS - gone));
    }, 250);
    return () => clearInterval(id);
  }, [move.since]);

  return (
    <div className="sch__undo" role="status">
      <p>
        <b>
          Moved to {dayLong(move.toAt)}, {formatMinute(minuteOfDay(move.toAt))}
        </b>
        <br />
        <i>
          {move.clientName} will be told in <b>{left}s</b>
        </i>
      </p>
      <div className="sch__undor">
        <button className="u__b" type="button" onClick={onNow}>
          Send now
        </button>
        <button className="u__b" type="button" onClick={onUndo}>
          Undo
        </button>
      </div>
      <div
        className="cw__bar"
        role="progressbar"
        aria-valuenow={left}
        aria-valuemin={0}
        aria-valuemax={MOVE_HOLD_SECONDS}
        aria-label="Seconds left to undo"
      >
        <i style={{ width: `${(100 * left) / MOVE_HOLD_SECONDS}%` }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ bits ── */

/**
 * Where *New session* lands when it was not opened from a click on the grid.
 *
 * The next whole hour, on the anchor's own day — not 09:00, and not now. A form
 * that opens at 14:37 asks the trainer to fix a time they did not choose, and one
 * that opens at a fixed hour asks them to fix it every single time.
 */
function defaultSlot(anchor: number, view: ScheduleView, now: number) {
  const day = view === 'week' ? pickDay(anchor, now) : startOfDay(anchor);
  const isToday = day === startOfDay(now);
  const minute = isToday
    ? Math.min(23 * 60, Math.ceil(minuteOfDay(now) / 60) * 60)
    : 9 * 60;
  return { dayAt: day, minute: Math.round(minute / SNAP_MINUTES) * SNAP_MINUTES };
}

/** Today if the week contains it, otherwise the Monday the trainer is looking at. */
function pickDay(anchor: number, now: number) {
  const start = gridStart('week', anchor);
  const today = startOfDay(now);
  return today >= start && today < start + 7 * DAY_MS ? today : start;
}
