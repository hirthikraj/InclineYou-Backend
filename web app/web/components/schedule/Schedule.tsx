'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import type { ScheduleData } from '@/lib/schedule/api';
import { toSession } from '@/lib/schedule/rows';
import { buildGrid, MAX_WEEK_LANES } from '@/lib/schedule/grid';
import { buildMonth } from '@/lib/schedule/month';
import { buildWeekPivot } from '@/lib/schedule/pivot';
import { loadWindow, messageAboutSession, updateSession } from '@/lib/schedule/actions';
import { useToast } from '@/lib/toast/store';
import { MOVE_HOLD_SECONDS, SNAP_MINUTES } from '@/lib/schedule/result';
import {
  crumbFor, gridDays, gridStart, hrefFor, labelFor, parseAnchor, parseView, stepAnchor, type ScheduleView,
} from '@/lib/schedule/view';
/* `defaultSlot` lived in this file until Today grew its own *New session*. It is
   in `lib/schedule/book.ts` now so both screens open the form on the same slot. */
import { defaultSlot, usualMinuteFor } from '@/lib/schedule/book';
import { dayLong, formatMinute, minuteOfDay, startOfDay } from '@/lib/today/time';
import { TopBar } from '@/components/shell/TopBar';
import { Clock, Plus } from '@/components/shell/Icons';
import { useHeartbeat, useNow } from '@/components/today/Clock';
import { usePaletteRows } from '@/components/shell/PaletteHost';
import type { AttentionItem } from '@/lib/today/deck';
import { MonthGrid } from './MonthGrid';
import { TimeGrid } from './TimeGrid';
import { DayAgenda } from './DayAgenda';
import { WeekPips } from './WeekPips';
import { ClientWeek } from './ClientWeek';
import { useWeekLayout } from './weekLayout';
import { ScheduleStats } from './ScheduleStats';
import { Toolbar } from './Toolbar';
import { SessionPanel } from './SessionPanel';
import { BookPanel } from './BookPanel';
import { WarnTriangle } from './Icons';
import { Button } from '@/web-components/ui/Button';
import { NoticeBar } from '@/web-components/ui/NoticeBar';

/**
 * One figure in the page header's band. `figure` is the `<b>`, `label` the words
 * after it, and `tone` is set only on a figure that is a FINDING rather than a
 * readout — see §26.7 in app.css for why the tone never reaches the label.
 */
interface HeaderFact {
  key: string;
  figure: string;
  label: string;
  tone?: 'warn' | 'crit';
}

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
  clientId: string;
  clientName: string;
  /** Where it was, so Undo does not have to re-read the row. */
  fromAt: number;
  toAt: number;
  minutes: number;
  /** When the hold started, so the bar and the label read from one clock. */
  since: number;
}


/* A module constant, not `[]` at the call site: a new empty array every render is
   a new identity, and `usePaletteRows` would re-register on every one of them. */
const EMPTY_ATTENTION: AttentionItem[] = [];

export function Schedule({ data }: { data: ScheduleData }) {
  const router = useRouter();
  const { clients, hours, rates, trainer, people, now: serverNow } = data;

  /*
   * ── THE WINDOW ON SCREEN IS THIS COMPONENT'S, NOT THE PAGE'S ───────────────
   *
   * The page renders the first window with all five reads. After that a view
   * switch — Day · Week · Month, ‹ ›, swipe, a day in the month — asks for the
   * diary alone (`loadWindow`), because the roster, the hours, the packs and the
   * trainer don't change with the view (api-contract *Schedule*: L4 is fetched
   * again with the new window). The URL still moves, through
   * `history.pushState`, which Next's router keeps in sync with
   * `useSearchParams` — so Back, a reload and a shared link all still work, and
   * `router.refresh()` renders the page for the window the URL now names.
   *
   * Whenever the server sends a fresh page — after any write, and on the
   * five-minute heartbeat — its window is adopted, during render rather than in
   * an effect, so nothing paints the old rows for a frame.
   */
  const [win, setWin] = useState(() => ({ view: data.view, anchor: data.anchor, sessions: data.sessions }));
  const [seenData, setSeenData] = useState(data);
  if (data !== seenData) {
    setSeenData(data);
    setWin({ view: data.view, anchor: data.anchor, sessions: data.sessions });
  }
  const { view, anchor, sessions } = win;

  /* Both memoised, because `usePaletteRows` depends on them by IDENTITY: a fresh
     array every render would re-register the rows every render, and the effect
     that does it would never settle. */
  const paletteClients = useMemo(
    () => clients.map((c) => ({ id: c.id, name: c.name })),
    [clients],
  );
  const todaysSessions = useMemo(() => {
    const day = startOfDay(serverNow);
    return sessions.filter((s) => !s.dead && startOfDay(s.at) === day);
  }, [sessions, serverNow]);

  const now = useNow(serverNow);
  const refresh = useCallback(() => router.refresh(), [router]);
  useHeartbeat(refresh);

  /* ------------------------------------------------------------ view state */

  /* Remembered per device rather than held for the visit — `weekLayout.ts`
     carries why that differs from the mode filters directly below it. */
  const [layout, setLayout] = useWeekLayout();

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

  /* `clientId` is the pivot's own contribution to a booking and nothing else
     sets it: a click on the hours track knows a minute and has to ask WHO, and a
     click on a client's row knows who and has to be told the minute. See
     `onCell` below and `usualMinuteFor`. */
  const [booking, setBooking] = useState<
    { dayAt: number; minute: number; clientId?: string } | null
  >(() => slotAsked(serverNow));

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
    // `replaceState`, not `router.replace`: stripping a parameter is not a reason
    // to render the page and make its five reads again.
    if (asked !== null) window.history.replaceState(null, '', hrefFor(view, anchor));
  }, [asked, view, anchor]);
  const [moving, setMoving] = useState<string | null>(null);
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

  /*
   * The week by client. Built from the SAME `grid` the hours view draws, so the
   * two arrangements cannot disagree about what the week holds and the mode
   * filters reach both — see `buildWeekPivot`.
   *
   * `pivoting` and not just `layout === 'clients'`: the layout is remembered per
   * device, so a trainer who left it on Clients and then opened the day view
   * must not have the pivot computed for a one-day "week". The toggle is drawn
   * on the week only for the same reason.
   */
  /* Whether the trainer has told us when they work, asked ONCE and handed to
     both arrangements. Two surfaces now draw a rest day — the grid hatches the
     column, the pivot writes *Day off* over it — and each deriving the answer
     from the rows it happens to hold is how the week and the day view end up
     disagreeing about the same Sunday. `hours` is the working_hours list
     itself, which is the only copy that cannot be wrong. */
  const hoursSet = hours.length > 0;

  const pivoting = view === 'week' && layout === 'clients';
  const pivot = useMemo(
    () => (pivoting ? buildWeekPivot(grid, clients, hoursSet) : null),
    [pivoting, grid, clients, hoursSet],
  );

  /* ---------------------------------------------------------------- moving */

  /*
   * The held move lands: a PATCH of the start alone (R14), so it cannot reset
   * the session's length, mode or note. A refusal — the client already has a
   * session at that start, or the session was settled meanwhile — puts the
   * block back and says why; it used to snap back in silence.
   *
   * Nobody is told in v1 (R11), so the receipt offers the message instead of
   * claiming it was sent.
   */
  const { show } = useToast();
  const commit = useCallback((move: PendingMove) => {
    startWrite(async () => {
      const res = await updateSession({ id: move.sessionId, scheduledAt: move.toAt });
      setPending(null);
      if (!res.ok) {
        show({ tone: 'danger', title: <>Not moved</>, body: res.message });
        return;
      }
      const first = move.clientName.split(' ')[0] || move.clientName;
      const requestId = crypto.randomUUID();
      show({
        tone: 'ok',
        variant: 'receipt',
        title: <>Moved</>,
        body: <>{move.clientName} &middot; {dayLong(move.toAt)} at {formatMinute(minuteOfDay(move.toAt))}</>,
        action: {
          label: `Message ${first}`,
          onClick: () => void messageAboutSession(move.clientId, move.sessionId, requestId)
            .then((m) => {
              if (m.ok && m.whatsappUrl) window.open(m.whatsappUrl, '_blank', 'noopener');
              else if (!m.ok) show({ tone: 'danger', title: <>Could not draft it</>, body: m.message });
            }),
        },
      });
    });
  }, [show]);

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
        clientId: s.clientId,
        clientName: s.clientName,
        fromAt: s.at,
        toAt,
        minutes: s.minutes,
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

  /*
   * THE SAME CLICK, ON THE ARRANGEMENT THAT HAS A PERSON INSTEAD OF A MINUTE.
   *
   * `onSlot` above is the hours grid's: the pointer's y-coordinate IS the
   * minute and the form asks who. A cell in the pivot is the other way round —
   * it names a client and a whole day — so the two missing halves are supplied
   * from the two places that hold them honestly:
   *
   *   moving   the session's OWN minute. A move through this table is *the same
   *            time, on a different day*, which is the only move a surface with
   *            no minute axis can promise. `ClientWeek` offers it on the moving
   *            client's row alone.
   *   booking  `usualMinuteFor`, which is `suggestClients`' band-1 rule read in
   *            the other direction — the hour this client already trains at on
   *            this weekday.
   *
   * The windows are that day's own, so a client with no history at all lands on
   * the trainer's first working hour rather than on a constant.
   */
  const onCell = useCallback(
    (clientId: string, dayAt: number) => {
      if (moving) {
        const s = sessions.find((x) => x.id === moving);
        if (s) placeAt(dayAt, minuteOfDay(s.at));
        return;
      }
      const windows = grid.days.find((d) => d.at === dayAt)?.windows ?? [];
      setBooking({ dayAt, minute: usualMinuteFor(sessions, clientId, dayAt, windows), clientId });
    },
    [moving, placeAt, sessions, grid.days],
  );

  /*
   * One window load at a time, and the LATEST one wins: `wanted` is the href of
   * the window last asked for, so a slow answer for a week the trainer has
   * already stepped past is dropped rather than drawn over the current one.
   * While it is in flight the old window stays on screen, dimmed, so the grid
   * and the toolbar change together.
   */
  const [loadingWindow, startLoad] = useTransition();
  const wanted = useRef(hrefFor(data.view, data.anchor));
  const load = useCallback(
    (nextView: ScheduleView, nextAnchor: number) => {
      const key = hrefFor(nextView, nextAnchor);
      wanted.current = key;
      startLoad(async () => {
        const res = await loadWindow(nextView, nextAnchor);
        if (wanted.current !== key) return;
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            router.refresh();
            return;
          }
          show({
            tone: 'danger',
            title: <>Could not load {crumbFor(nextView, nextAnchor)}</>,
            body: res.status === null
              ? 'The server did not answer. The window on screen is unchanged.'
              : 'The server refused it. The window on screen is unchanged.',
          });
          return;
        }
        const at = Date.now();
        setWin({
          view: nextView,
          anchor: nextAnchor,
          sessions: res.rows.map((r) => toSession(r, people[r.clientId], at)),
        });
        document.title = `${crumbFor(nextView, nextAnchor)} · Schedule · InclineYou`;
      });
    },
    [people, router, show],
  );

  const goTo = useCallback(
    (nextView: ScheduleView, nextAnchor: number) => {
      // A push, not a replace: stepping through weeks is navigation, and the back
      // button going back a week is what a trainer expects from an arrow.
      window.history.pushState(null, '', hrefFor(nextView, nextAnchor));
      load(nextView, nextAnchor);
    },
    [load],
  );

  /* Back and Forward: the URL moved without a call to `goTo`, so the window it
     names is loaded here. A URL that already names the window on screen, or the
     one in flight, loads nothing. */
  const urlView = parseView(params.get('view') ?? undefined);
  const urlAnchor = parseAnchor(params.get('d') ?? undefined);
  const winKey = hrefFor(view, anchor);
  useEffect(() => {
    const a = urlAnchor ?? startOfDay(Date.now());
    const key = hrefFor(urlView, a);
    if (key === wanted.current || key === winKey) return;
    load(urlView, a);
  }, [urlView, urlAnchor, winKey, load]);

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

  /*
   * THE PALETTE IS THE SAME ONE, AND IT IS NOT DECORATION HERE.
   *
   * `TopBar` draws a search box promising ⌘K on every screen it appears on, and
   * a promise in print that nothing binds is the defect this half already
   * records for the rail's accelerators. This screen was one of the five that
   * kept the promise; fifteen others did not, so the mounting moved to the shell
   * and what stays here is the DATA — the roster and this range's sessions.
   *
   * `attention` is empty and that is correct rather than a gap: the queue is
   * derived from payments and workout logs, which this screen deliberately does
   * not fetch (`lib/schedule/api.ts` says why). An empty list draws no group —
   * checked — so the palette is short here rather than wrong.
   */
  usePaletteRows({
    clients: paletteClients,
    attention: EMPTY_ATTENTION,
    today: todaysSessions,
  });

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

  /**
   * How many sessions the mode chips are currently hiding, IN THIS RANGE.
   *
   * `counts` above is the whole fetched set and is what the chips print, which
   * is right for them — a chip says what un-ticking it would remove. This is a
   * different question: the empty-range bar has to tell a trainer looking at a
   * blank week whether the week is empty or whether they have filtered it
   * blank, and only the second one has a way out.
   *
   * It is answered by building the SAME grid with both modes on and reading its
   * total, rather than by counting `drawn` against a date window written here.
   * `gridStart` and `gridDays` own which days a range covers and `buildGrid`
   * owns which sessions land in them — a second copy of either, written to
   * answer a sentence in a notice bar, is the thing that is wrong the first time
   * a month's leading week or a DST day moves. The filter it is measuring is one
   * line (`grid.ts`: `sessions.filter(s => s.mode === 'remote' ? …)`), so the
   * only honest way to ask how much it removed is to run it both ways.
   *
   * Both guards mean the second build is only ever paid for on a range that is
   * already drawing nothing, which is the one moment the answer is wanted:
   * a full grid returns at the first line and never touches `buildGrid`.
   *
   * `withRows: false` because nothing reads the rows — this needs one integer,
   * and the row geometry is the expensive half.
   */
  const hiddenByFilter = useMemo(() => {
    if (grid.totals.sessions > 0) return 0;
    if (modes.floor && modes.remote) return 0;
    return buildGrid({
      start: gridStart(view, anchor),
      dayCount: gridDays(view),
      hours,
      sessions: drawn,
      now,
      modes: { floor: true, remote: true },
      withRows: false,
    }).totals.sessions;
  }, [grid, modes, view, anchor, hours, drawn, now]);

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

  /**
   * THE SAME FOUR FACTS, WITH THE TWO THAT MEAN SOMETHING VISIBLE.
   *
   * This was one joined string in `--tx-ink-3` at 13px: *43 sessions · 63% of
   * your hours · 2 days with a clash · 24 sellable hours free*. Every figure the
   * same weight and the same grey as every word around it, so the one that is a
   * FINDING — two days where a client is double-booked — reads exactly like the
   * three that are readouts, and 294% reads exactly like 63%.
   *
   * `ScheduleStats` solved this on the phone and gave the answer a vocabulary:
   * the figure is `<b>`, and a figure that is a problem carries `data-tone`,
   * `warn` for a clash and `crit` for over 100%. This is that vocabulary, in the
   * band the desk already draws.
   *
   * ── WHY NOT JUST RENDER `ScheduleStats` HERE ────────────────────────────
   *
   * Because it is 47px and this is 18.9px, and the 28 it would cost comes
   * straight out of the calendar. MEASURED at 1536×695: `.cw__scroll` is 478px
   * of a 752px track, so a 47px strip is ~10% of the grid handed back to say
   * what the band above it was already saying — and `useCwScale` divides the
   * real height by the trainer's own track, so it is a shorter hour on every
   * screen, not just a shorter page. app.css records the same finding twice
   * already, once about a duplicated date and once about `.sch__key`'s wrap.
   *
   * So the strip stays the phone's, where `.sch__ph` has stood down and the
   * 47px is buying the only copy of these numbers on the screen, and the desk
   * gets the treatment rather than the component. Exactly one of the two is
   * ever drawn, which was already the contract.
   *
   * The separators are rendered rather than joined so a tone can end at the
   * figure it belongs to: a `·` inside a `data-tone="warn"` span is a red dot
   * between two facts that are not warnings.
   */
  /**
   * AND WHEN THE WEEK IS ARRANGED BY CLIENT, THE FOUR FACTS ARE DIFFERENT ONES.
   *
   * MEASURED, and it is the same defect as the lane's head standing over the
   * wrong column: the pivot drew *63% of your hours · 2 days with a clash · 24
   * sellable hours free* over a table with **no minute axis at all**. Two of
   * those three are statements about a track this arrangement does not draw,
   * and the fourth — `Show gaps`, in the toolbar — was a control with nothing
   * to toggle. A header that answers the other view's question is a header a
   * trainer has to translate.
   *
   * Meanwhile the one sentence that IS about this arrangement was written for
   * screen readers only: `<caption class="vh">` on the table says *21 of 23
   * clients on the book*, which is the whole reason somebody presses `Clients`,
   * and the eye never got it.
   *
   * So the pivot states its own four, in the same vocabulary §26.7 gave the
   * band — figure bold, unit quiet, a tone only on a figure that is a finding:
   *
   *   on the book   how much of the roster this week actually holds
   *   sessions      the same count the hours view leads with, unchanged
   *   short         booked under their own usual rhythm — `warn`
   *   drifting      active clients with nothing at all — `warn`, and the row
   *                 `deck.ts` would raise a week later
   *
   * `late` is deliberately NOT a fifth: it is drawn on the chip and said again
   * in the row, which is where a trainer can act on it, and a fifth figure
   * would wrap the band onto a second line at 1280.
   */
  const pivotSubtitle: HeaderFact[] | null = pivot ? [
    {
      key: 'roster',
      figure: `${pivot.totals.onBook} of ${pivot.totals.clients}`,
      label: 'clients on the book',
    },
    {
      key: 'sessions',
      figure: String(pivot.totals.sessions),
      label: pivot.totals.sessions === 1 ? 'session' : 'sessions',
    },
    pivot.totals.short
      ? {
        key: 'short',
        figure: String(pivot.totals.short),
        label: 'under their usual',
        tone: 'warn' as const,
      }
      : null,
    pivot.totals.drifting
      ? {
        key: 'drift',
        figure: String(pivot.totals.drifting),
        label: 'with nothing booked',
        tone: 'warn' as const,
      }
      : null,
  ].filter((x) => x !== null) : null;

  const subtitle: HeaderFact[] = [
    {
      key: 'sessions',
      figure: String(grid.totals.sessions),
      label: grid.totals.sessions === 1 ? 'session' : 'sessions',
    },
    grid.totals.utilisation !== null
      ? {
        key: 'util',
        figure: `${grid.totals.utilisation}%`,
        label: over ? 'of your hours — overbooked' : 'of your hours',
        tone: over ? 'crit' as const : undefined,
      }
      /*
       * A NULL UTILISATION IS TWO DIFFERENT SENTENCES, AND IT ONLY EVER SAID
       * THE ONE THAT ACCUSES.
       *
       * `utilisation` is null when the range holds no working minutes, and this
       * read that as *you have never told us when you work* — the same conflation
       * `offRunsIn` was just fixed for, one band up. FOUND BY RENDERING the day
       * view of a Sunday on a trainer who works Monday to Saturday: the header
       * said **0 sessions · no working hours set** over a column the grid was
       * correctly drawing as a day off, and the notice bar offering to set hours
       * that are already set is two lines below it.
       *
       * The week and the month cannot reach this branch while any hours exist —
       * a 7- or 42-day range contains a working day — so the second sentence is
       * the day view's, which is the only view that can be entirely a rest day.
       */
      : {
        key: 'util',
        figure: '',
        label: hoursSet ? 'a day off' : 'no working hours set',
      },
    grid.totals.clashDays
      ? {
        key: 'clash',
        figure: String(grid.totals.clashDays),
        label: `${grid.totals.clashDays === 1 ? 'day' : 'days'} with a clash`,
        tone: 'warn' as const,
      }
      : null,
    view !== 'month' && grid.totals.gapSlots
      ? {
        key: 'gaps',
        figure: String(grid.totals.gapSlots),
        label: `sellable ${grid.totals.gapSlots === 1 ? 'hour' : 'hours'} free`,
      }
      : null,
  ].filter((x) => x !== null);

  return (
    <>
      <TopBar crumb={crumbFor(view, anchor)} />

      <main
        className="main"
        id="main-content"
        aria-busy={loadingWindow || undefined}
        style={loadingWindow ? { opacity: 0.6, transition: 'opacity 120ms' } : undefined}
      >
        <div className="ph sch__ph">
          <div className="ph__row">
            <div className="ph__id">
              <h1 className="ph__t">{labelFor(view, anchor)}</h1>
              <p className="ph__sub sch__sub">
                {/* The separator is a SIBLING of the two facts it divides, never a
                    child of either — inside a toned span it would tint the gap
                    between two facts rather than a fact, and which of the two it
                    took would depend on the order they happened to be in. */}
                {(pivotSubtitle ?? subtitle).map((part, i) => (
                  <Fragment key={part.key}>
                    {i > 0 ? <i aria-hidden="true">·</i> : null}
                    <span data-tone={part.tone}>
                      {/* The space is a real character and not the `<b>`'s margin.
                          A reader announces `43sessions` for the margin version —
                          the gap is 4px of layout and nothing in the string. */}
                      {part.figure ? <><b>{part.figure}</b>{' '}</> : null}
                      {part.label}
                    </span>
                  </Fragment>
                ))}
              </p>
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
              <Button
                href="/settings/hours"
                variant="secondary"
                className="sch__hours"
                aria-label="Working hours"
              >
                <Clock size={15} />
                <span className="sch__lbl">Working hours</span>
              </Button>
              <Button
                variant="primary"
                onClick={() => setBooking(defaultSlot(anchor, view, now))}
              >
                <Plus size={15} />
                New session
              </Button>
            </div>
          </div>
        </div>

        <div className="body body--flush sch__body" onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd}>
          <Toolbar
            view={view}
            layout={layout}
            label={labelFor(view, anchor)}
            counts={counts}
            modes={modes}
            /* Both of these describe the HOURS track, and the pivot has none.
               `showGaps` is not cleared — a trainer who toggled it on the hours
               view finds it still on when they come back — it is simply not
               offered, and not drawn in the key, while the table is up. */
            gaps={showGaps && !pivoting}
            gapSlots={grid.totals.gapSlots}
            pivoting={pivoting}
            hoursHref="/settings/hours"
            onView={(v) => goTo(v, anchor)}
            onLayout={setLayout}
            onStep={(d) => goTo(view, stepAnchor(view, anchor, d))}
            onMode={(m) => setModes((s) => ({ ...s, [m]: !s[m] }))}
            onGaps={() => setShowGaps((g) => !g)}
          />

          {/*
            THE RANGE'S NUMBERS ON A PHONE, WHERE THE HEADER NO LONGER SAYS THEM.
            `.sch__ph` stands down under 900px — see app.css under *the schedule
            header on a phone* — and this 44px strip is what carries the four
            facts that were in its subtitle. Above 900px it is hidden and the
            subtitle is back, so exactly one of the two is ever drawn.

            It sits below the toolbar and not above it because the toolbar is
            controls and this is readout: a trainer stepping to next week is
            reaching for `›`, and putting a row they cannot press between the
            view switcher and the thing it switches is 44px of interruption in
            the one path off this screen.
          */}
          <ScheduleStats grid={grid} view={view} />

          {/*
            THE MOVE BAR. It is a live region and it is the only thing on the
            screen that changes what a click means, so it says so in words rather
            than relying on a cursor — a cursor does not exist on a touch screen
            and is not announced anywhere.
          */}
          {movingSession && (
            <NoticeBar
              tone="accent"
              live
              icon={<WarnTriangle size={14} />}
              action={(
                <Button variant="ghost" size="sm" onClick={() => setMoving(null)}>
                  Cancel
                </Button>
              )}
            >
              Moving <b>{movingSession.clientName}</b> — tap or click where it should go.
            </NoticeBar>
          )}

          {hours.length === 0 && (
            <NoticeBar
              action={(
                <Button href="/settings/hours" variant="secondary" size="sm">
                  Set your hours
                </Button>
              )}
            >
              You have not told us when you work, so nothing is hatched and no gap is
              priced. The grid still draws every session.
            </NoticeBar>
          )}

          {/*
            AND THE THIRD CONDITION, WHICH WAS DRAWING NOTHING AT ALL.

            MEASURED on `?d=2027-06-07`: a range with no sessions in it rendered
            seven empty columns and no sentence anywhere on the screen. Not a
            bug in any gate — the grid is correct, it is just that a correct
            drawing of nothing looks identical to a screen that has failed to
            load, and this one also has `In Person 0` and `Online 0` sitting in
            the toolbar as two pressed lime chips saying nothing.

            It is a bar and NOT an `EmptyState` for the reason `NoticeBar`'s own
            file gives: the grid under it is still seven columns of bookable
            track, and since §26.4 that track finally says so. Replacing it with
            a centred illustration would remove the fastest way to book at the
            exact moment booking is the only thing left to do here.

            THE TWO CASES ARE DIFFERENT SENTENCES, which is the distinction
            `EmptyState`'s three kinds exist to force and which a single "nothing
            here" would lose. `grid.totals.sessions` is the count AFTER the mode
            filters — `buildGrid` takes `modes` — and `counts` is taken from the
            unfiltered list, so the two together say which of the two it is:

              nothing booked   the range is genuinely empty. Offer the way in.
              filtered out     there ARE sessions here and the chips are hiding
                               them. Offering *New session* would be answering a
                               question nobody asked; the way back is the chips,
                               so the bar says what is hidden and how many.

            A trainer who has un-ticked both chips and forgotten is otherwise
            looking at an empty week in a book that is full.
          */}
          {grid.totals.sessions === 0 && (
            hiddenByFilter > 0 ? (
              <NoticeBar>
                No sessions match the filters — {hiddenByFilter}{' '}
                {hiddenByFilter === 1 ? 'session is' : 'sessions are'} hidden in this{' '}
                {view}. Turn a filter back on to see {hiddenByFilter === 1 ? 'it' : 'them'}.
              </NoticeBar>
            ) : (
              <NoticeBar
                action={(
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setBooking(defaultSlot(anchor, view, now))}
                  >
                    Book a session
                  </Button>
                )}
              >
                {/* The way in is different on the two arrangements and the
                    sentence has to name the real one. *That time* is the hours
                    track's promise — the click IS the minute — and a pivot cell
                    is a whole day, where what the click names is the PERSON and
                    the minute comes off their own rhythm. One sentence for both
                    would be wrong on whichever is on the screen. */}
                Nothing booked this {view}.{' '}
                {pivoting
                  ? <>Click a client&rsquo;s day to book them at their usual hour, or press <b>N</b>.</>
                  : <>Click any empty slot on the grid to book at that time, or press <b>N</b>.</>}
              </NoticeBar>
            )
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
              {/*
                THE PIVOT SITS INSIDE `.sch__tg`, WHICH IS NOT AN IMPLEMENTATION
                DETAIL.

                That wrapper is what the 900px rule hides, so putting this
                arrangement inside it makes it stand down on a phone with the
                grid it replaces — and `WeekPips`, which is drawn beside both, is
                already a per-day summary a thumb can read. An 8-column table at
                390px would be seven columns of about 38px, which is under the
                target floor before a chip is drawn in one.

                It REPLACES the grid rather than being a third mounted sibling:
                the two are the same week and `useCwScale` measures its own
                container, so leaving the grid mounted behind `display:none`
                would have it fitting a track it is not being drawn in.
              */}
              <div className="sch__tg">
                {pivot ? (
                  <ClientWeek
                    pivot={pivot}
                    /* The client, not just the id: the table has to know WHOSE
                       row can take the placement, and a session's client is the
                       one thing a move may never change. */
                    moving={movingSession
                      ? { sessionId: movingSession.id, clientId: movingSession.clientId }
                      : null}
                    onOpenSession={openSessionById}
                    onCell={onCell}
                  />
                ) : (
                <TimeGrid
                  grid={grid}
                  rates={rates}
                  gymSharePercent={trainer.gymSharePercent}
                  now={now}
                  showGaps={showGaps}
                  lane={view === 'day'}
                  hoursSet={hoursSet}
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
                )}
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
          clientId={booking.clientId ?? null}
          onClose={() => setBooking(null)}
          onBooked={() => {
            setBooking(null);
            refresh();
          }}
        />
      )}


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
          Saving in <b>{left}s</b> &middot; {move.clientName} is not told automatically
        </i>
      </p>
      <div className="sch__undor">
        <button className="u__b" type="button" onClick={onNow}>
          Save now
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

