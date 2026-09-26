'use client';

import { useMemo, useSyncExternalStore } from 'react';
import Link from 'next/link';

import type { Deck, DeckActivity, DeckMoney, DeckSession, DeckWeek } from '@/lib/today/deck';
import { MODE_LABELS, type DeliveryMode } from '@/lib/today/mode';
import { sessions as sessionCount } from '@/lib/today/copy';
import { rupees, rupeesShort } from '@/lib/today/time';
import { Chevron } from '@/components/shell/Icons';
import { Card } from '@/web-components/ui/Card';
import { Tag } from '@/web-components/ui/Tag';
import { Avatar } from '@/web-components/ui/Avatar';
import { Slab } from '@/web-components/ui/Slab';
import { Figures, Figure } from '@/web-components/ui/Figures';
import { Segment, SegmentButton } from '@/web-components/ui/Segment';
import { Agenda, AgendaRow } from '@/web-components/ui/Agenda';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TODAY, AS THE APP DRAWS IT — the phone's own module stack, not the desk's
 * reflowed.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The first phone pass on this screen made the DESK's six modules survive 390px:
 * the rows stacked, the queue reflowed, the ribbon scrolled. That is the right
 * answer to "this layout is unusable at 390" and the wrong answer to the question
 * asked here — the phone app's home screen already exists, a trainer already knows
 * it, and the web's mobile view is supposed to BE that screen rather than a
 * narrowed dashboard that happens to hold the same facts.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * SUPERSEDED IN LARGE PART BY THE RESTRUCTURE OF 27 AUG 2026
 *
 * The pass above was right that the phone should draw the app's modules. The
 * restructure went further and asked what the DESK should draw, and the answer
 * turned out to be most of the same modules — so three of these are no longer
 * phone-only, and two are no longer drawn at all:
 *
 * | Module              | ≤900px          | >900px          |
 * | ------------------- | --------------- | --------------- |
 * | Hero                | 1 card          | up to 3 cards   |
 * | Today at a glance   | `Glance`        | `Glance`        |
 * | Needs you today     | `AttentionQueue`, reflowed under 620 | same |
 * | The rest of today   | `TodayList`     | `TodayList`     |
 * | The month's money   | — (`PhoneMoney` unmounted) | — (`MonthCard` unmounted) |
 * | This week           | — (`PhoneWeek` unmounted)  | — (`WeekCard` unmounted)  |
 * | Recent activity     | `PhoneActivity` | —               |
 *
 * **The two `.kv` cards and the ribbon are unmounted, not deleted.** The brief's
 * Block 3 is "three numbers, no more", and a five-row month card beside a five-row
 * week card is ten more. They are still in the tree — `WeekCard.tsx` and
 * `DayRibbon.tsx`, each with a docstring saying which route owes it — because
 * `/money` and `/reports` are `NotBuilt` placeholders and deleting a built module
 * whose route has not arrived is losing work with nowhere to put it. See
 * `AGENTS.md`.
 *
 * ── WHY IT WAS TWO STACKS AND NOT ONE THAT ADAPTS ────────────────────────────
 *
 * Because the modules are not the same modules. A ribbon is a horizontal scroller
 * measuring a day in pixels-per-minute; a session list is rows a thumb scrolls
 * vertically. `.kv` rows are five facts a reader compares; the app's money card is
 * one figure with a bar under it. No media query turns one into the other — they
 * are different components with different data shapes, and pretending otherwise is
 * how a "responsive" module ends up being neither.
 *
 * Both are always rendered and CSS picks one, which is `Rail.tsx`'s call and this
 * shell's rule already: a component that branches on a measured width renders the
 * wrong half for one frame after every resize and cannot be server-rendered at
 * all. The cost is honest and worth naming — the phone's stack is in a desk's DOM
 * and the desk's cards are in a phone's, `display:none` on each — and it is paid in
 * markup rather than in a hydration flash on the screen a trainer opens most.
 *
 * ── THE ORDER IS STILL THE DECK'S ORDER ──────────────────────────────────────
 *
 * `deck.ts`: what's next, where the day stands, who needs chasing, the schedule,
 * the money, what happened. The app's home puts its three stats between the first
 * two and the queue before the day, which is the same sentence with "where the day
 * stands" said as figures rather than as a shape. Money stays fourth. Nothing here
 * reorders the deck, and nothing here is a report: no chart until the day is over,
 * which is why `PhoneWeek` waits for it.
 */

/* ─────────────────────────────────────────────────────────── section head ── */

/**
 * The app's `SectionHead` — a label, and at most one action.
 *
 * An `<h2>`, because the heading outline is the thing the desk pass had to add to
 * this screen and a second stack of unheaded modules would take it straight back
 * off. The action is a link rather than a button in every use here: all three go
 * somewhere.
 */
function SectionHead({
  label,
  action,
}: {
  label: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="sh">
      <h2 className="sh__l">{label}</h2>
      {action && (
        <Link className="sh__a" href={action.href}>
          {action.label}
          <Chevron size={13} />
        </Link>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────── today's figures ── */

/**
 * TODAY AT A GLANCE — three numbers, no more, at every width.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * AND THIS IS STILL NOT THE STAT RAIL THE DECK REFUSED
 *
 * `Today.tsx` opens by saying there is no stat rail on this screen, and that
 * sentence is about the dashboard this one replaced: four MONTH-TO-DATE money
 * cards across the top, above a greeting, which is a report where a to-do list
 * belongs. The difference is not the shape, it is the position and the count —
 * these three sit at the BOTTOM, after the work, and there are three of them
 * rather than four plus a chart. They are what a trainer checks after they have
 * dealt with the list, not the thing that greets them.
 *
 * ── WHAT CHANGED ON 27 AUG 2026, AND WHY THE THIRD FIGURE IS A NEW ONE ───────
 *
 * These were `PhoneStats`, phone-only, and read *Sessions · Collected · Pending*.
 * Two changes:
 *
 *   · **Collected is the MONTH now, not the day.** `collectedToday` is a figure
 *     that is ₹0 every morning and says nothing about whether the month is going
 *     well — which is the question a trainer asks once a day. `deck.money.collected`
 *     is the month's, and the money book is one tap behind it for the breakdown.
 *   · **Pending became *Clients at risk*.** ₹ outstanding is a money-book figure
 *     and it was the second money figure of three here. `clientsAtRisk` counts
 *     PEOPLE — how many are on their way out — which is the one number on this
 *     screen that is not about today at all, and the one a trainer can still act
 *     on. `RISK_BANDS` in `deck.ts` says which conditions count and why the
 *     trainer's own housekeeping is not among them.
 *
 * `rupeesShort` and not `rupees`, which is the app's call and a measurement: three
 * tiles across a 390px screen are ~118px each, and "₹1,24,500" at the figure size
 * this tile wants does not fit one. The full amount is one tap away in the money
 * book, and the tile's job is the order of magnitude.
 *
 * Every tile is a `<Link>`, because the screen's rule is that every card has a
 * one-tap action and a figure with no destination is the notification this whole
 * restructure is about not shipping.
 */
export function Glance({ deck }: { deck: Deck }) {
  return (
    <Slab title="Today at a glance">
      {/*
        THREE NUMBERS, NOT THREE CARDS.

        `.srail` drew these as three equal tiles in a row, which is both the most
        generated dashboard layout there is and more container than three figures
        ask for. The block's own argument, in `Today.tsx`, is "three numbers, no
        more" — so they are three numbers on one ruled line now, and the position
        at the FOOT of the page, which is the load-bearing part, is unchanged.

        The at-risk figure was an em dash when it was zero. Zero is the good news
        on that row and a dash reads as a figure that failed to load, so it is a
        number like the other two.
      */}
      <Figures>
        <Figure
          label="Sessions today"
          value={deck.todayDone}
          of={deck.today.length}
          href="/schedule?view=day"
        />
        <Figure
          label="Collected this month"
          value={rupeesShort(deck.money.collected)}
          href="/business"
        />
        <Figure label="Clients at risk" value={deck.clientsAtRisk} href="/clients" />
      </Figures>
    </Slab>
  );
}

/* ────────────────────────────────────────────────────────────── the day ──── */

type Filters = { floor: boolean; remote: boolean; done: boolean };
const DEFAULT_FILTERS: Filters = { floor: true, remote: true, done: false };

/**
 * ── THE STORED CHOICE, AS AN EXTERNAL STORE ──────────────────────────────────
 *
 * The app persists this in `expo-secure-store` under `inclineyou_today_filters`, and the
 * reason is in its comment: a filter that resets on every launch has not been
 * chosen, it has been guessed at. `localStorage` is the same promise on a browser
 * — per-device, which is right for a view preference and wrong for anything the
 * server should know. The key is namespaced to this half, so a trainer running
 * both has two independent copies, which is correct: this one is about a browser.
 *
 * WHY IT IS NOT `useState` PLUS AN EFFECT. That was the first version, and it is
 * the shape React's own lint rule rejects — `setState` in an effect body is a
 * second render pass on every mount. It also cannot be written the obvious way:
 * this component is server-rendered, `localStorage` does not exist there, so
 * reading it in a `useState` initialiser makes the first client render disagree
 * with the server's HTML and React throws the tree away.
 *
 * `useSyncExternalStore` is the API for exactly this: `getServerSnapshot` returns
 * the defaults, so the server and the hydrating client agree, and `getSnapshot`
 * reads the real value immediately after. The snapshot is CACHED because the
 * contract requires a stable reference — returning a fresh object each call is an
 * infinite render loop, not a bug you find later.
 *
 * The `storage` event is subscribed to rather than ignored, and it earns its four
 * lines: a trainer with the day open in two tabs turning *Done* on in one gets it
 * in both, instead of two tabs quietly disagreeing about what the day contains.
 */
const FILTER_KEY = 'inclineyou_web_today_filters';

let cached: Filters | null = null;
const watchers = new Set<() => void>();

function readFilters(): Filters {
  if (cached) return cached;
  try {
    const raw = window.localStorage.getItem(FILTER_KEY);
    cached = raw ? { ...DEFAULT_FILTERS, ...(JSON.parse(raw) as Partial<Filters>) } : DEFAULT_FILTERS;
  } catch {
    // A corrupt preference, or a browser refusing storage. The defaults are a
    // fine answer — the app says the same thing about the same value.
    cached = DEFAULT_FILTERS;
  }
  return cached;
}

function writeFilters(next: Filters) {
  cached = next;
  try {
    window.localStorage.setItem(FILTER_KEY, JSON.stringify(next));
  } catch {
    // Private browsing, or a full quota. The toggle still works for this visit.
  }
  for (const w of watchers) w();
}

function subscribeFilters(onChange: () => void): () => void {
  watchers.add(onChange);
  // Another tab wrote the key. Drop the cache so the next snapshot re-reads it.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== FILTER_KEY) return;
    cached = null;
    onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    watchers.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** The server has no browser storage, so it renders the defaults — and so does the
 *  hydrating client, which is the whole point of a separate snapshot. */
const serverFilters = (): Filters => DEFAULT_FILTERS;

/**
 * THE REST OF TODAY, COLLAPSED INTO COMPACT ROWS — at every width now.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THIS TOOK THE RIBBON'S PLACE, AND THE RIBBON'S ARGUMENT IS WORTH ANSWERING
 *
 * The ribbon measures: it puts every session on a common axis so a trainer can SEE
 * the two-hour hole at 14:00. That is a real thing to be able to see, it is a desk
 * question asked while PLANNING, and `/schedule` is where planning happens — it
 * draws the same day at one minute to one pixel with a booking form attached.
 *
 * What this screen is for is the day a trainer is about to work, and there the list
 * wins: *who is next, and what am I doing with them*, one row at a time, in the
 * order they happen, with the time as the leading column so the column of times
 * reads as a column. It is also the module that survives a phone unchanged, which
 * is how one component came to serve both widths where there used to be two.
 *
 * ── "THE REST", AND THE THREE ROWS THE HERO IS ALREADY DRAWING ───────────────
 *
 * The hero above draws two sessions in full, so repeating them as the first rows
 * of this list is the same client twice inside 400px — which reads as a bug rather
 * than as a summary. It was one, found by rendering at 1920.
 *
 * The awkward part is that **half the hero's card COUNT is a CSS decision**
 * (`.today__hero` draws one at 390px and two above 1080), so this component cannot
 * know whether the second card is actually visible. Dropping its row
 * unconditionally would hide a session from a phone entirely, which is the worse
 * failure by a distance.
 *
 * So the first row is dropped outright — the hero draws that card at every width —
 * and the second is MARKED `.srow--h2` and hidden by the same breakpoint that
 * reveals its card. One session, one place, at every width, and the pairing is
 * enforced by the two rules sitting next to each other in `app.css` under the
 * hero.
 *
 * `.srow--h3` went with the hero's third card. **The third session onwards is now
 * a row here and nothing else**, which is the point of the change: a list row is
 * what *what is my morning* actually wants, and the card it replaces was hidden
 * below 1441px anyway.
 *
 * The one seam left is the chip counts, and it is deliberate: they count the day
 * rather than the rows currently drawn, so at 1920 "Floor 3" can sit above two
 * floor rows with the third in a hero card. A count that changed with the window
 * would be worse — the whole reason each chip carries one is that *Remote 0* is
 * worth knowing before you tap it, and that is a fact about the day.
 *
 * ── THE CHIPS ARE A FILTER, NOT A SEGMENTED CONTROL ──────────────────────────
 *
 * Three independent toggles, so *Floor* and *Remote* can both be on (the default)
 * or one can be off, and *Done* is off by default because a delivered session is
 * not work left to do. `aria-pressed` and not `aria-selected`: these are toggle
 * buttons, and a tablist would promise arrow-key movement between panels that do
 * not exist. Each chip carries its own count, which is what makes turning one off
 * a decision rather than a guess — *Remote 0* is worth knowing before you tap it.
 *
 * Filtering to nothing is allowed and says so. The app's rule, and the alternative
 * is refusing the last tap, which reads as a broken chip.
 */
export function TodayList({ deck, heroIds }: { deck: Deck; heroIds: string[] }) {
  const filters = useSyncExternalStore(subscribeFilters, readFilters, serverFilters);
  const toggle = (key: keyof Filters) => writeFilters({ ...filters, [key]: !filters[key] });

  const rest = useMemo(
    () => deck.today.filter((s) => s.id !== heroIds[0]),
    [deck.today, heroIds],
  );

  const counts = useMemo(() => {
    const live = rest.filter((s) => !s.done);
    return {
      floor: live.filter((s) => s.mode === 'floor').length,
      remote: live.filter((s) => s.mode === 'remote').length,
      done: rest.length - live.length,
    };
  }, [rest]);

  const visible = rest.filter((s) =>
    s.done ? filters.done : filters[s.mode as keyof Filters],
  );

  /*
   * Nothing left once the hero's card is out is the commonest shape of a light
   * day — one session, drawn in full above — and it needs no module at all. The
   * hero has already said everything there is to say.
   */
  if (rest.length === 0) return null;

  return (
    <Slab
      title="The rest of today"
      action={{ label: 'Full schedule', href: '/schedule?view=day' }}
      controls={
        /*
          THE FILTERS, DE-LIMED.

          These were three `ui/Chip`s, and a pressed Chip is a filled lime pill.
          Two of the three are pressed by default, so the screen opened with a
          row of lime plates directly above the day — in the same colour as the
          primary verb four inches up the page. Lime is the action colour here;
          a filter takes no action. Selected is an ink plate now, and "Done",
          the least urgent count on the screen, is no longer the loudest thing
          on it.
        */
        <Segment label="Filter the day">
          {(['floor', 'remote'] as DeliveryMode[]).map((mode) => (
            <SegmentButton
              key={mode}
              pressed={filters[mode]}
              onClick={() => toggle(mode)}
              count={counts[mode]}
            >
              {MODE_LABELS[mode]}
            </SegmentButton>
          ))}
          <SegmentButton
            pressed={filters.done}
            onClick={() => toggle('done')}
            count={counts.done}
          >
            Done
          </SegmentButton>
        </Segment>
      }
    >
      {visible.length === 0 ? (
        <p className="small" style={{ paddingTop: 4 }}>
          <b className="ink">Nothing in this filter.</b> Turn a chip back on to see the rest of
          the day.
        </p>
      ) : (
        <Agenda>
          {visible.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              next={s.id === deck.next?.id}
              /* 1 -> the row the second hero card is already drawing. Anything
                 else is not a hero card and carries no class. */
              heroCard={heroIds.indexOf(s.id)}
            />
          ))}
        </Agenda>
      )}
    </Slab>
  );
}

/**
 * One session.
 *
 * The spine down the left edge is the app's `Row` `spine` prop — *now*, *done* or
 * nothing — and it carries the state the row's own ink cannot: a delivered session
 * dims, and a dim row next to a dim row needs an edge to say which one is the next
 * thing that happens. `live` beats `next`: a session being logged right now is the
 * one the hero is about, and the two must not disagree.
 *
 * The whole row is the link, to `/sessions/{id}` — the same target the ribbon's
 * blocks and the rail's pins use. It pointed at `/clients/{id}` until 28 Aug
 * 2026, for the reason written here at the time: *`/sessions/{id}` is still a
 * placeholder and a client's file is where the answer actually is.* It is not a
 * placeholder any more. It carries the plan, the log, the client's pinned notes
 * and — on a session nobody closed — the sentence saying so, which is a strictly
 * better answer to "what is this row" than a file scoped to the whole client.
 */
function SessionRow({
  session,
  next,
  heroCard = -1,
}: {
  session: DeckSession;
  next: boolean;
  /**
   * Which hero card is drawing this same session, 1-based-ish: 1 is the second
   * card, and anything else means no card is. Index 0 never reaches here — that
   * row is filtered out in `TodayList` — and the hero stops at two, so 1 is the
   * only value that marks anything.
   */
  heroCard?: number;
}) {
  const state = session.live ? 'now' : session.done ? 'done' : next ? 'next' : 'idle';
  return (
    <AgendaRow
      href={`/sessions/${session.id}`}
      time={session.time}
      meridiem={session.meridiem}
      avatar={<Avatar name={session.clientName} id={session.clientId} size="sm" />}
      name={session.clientName}
      detail={session.detail}
      state={state}
      /* The mode tag, on a row that has not happened yet. `AgendaRow` swaps the
         tick in for a delivered one: there is one slot at the end of the row and
         "delivered" outranks "in person" in it. */
      trailing={<Tag tone={session.mode}>{MODE_LABELS[session.mode]}</Tag>}
      /* The second hero card draws this same session above 1080px, so the row
         hides itself there rather than showing the client twice inside 400px.
         The class is still `.srow--h2` because the rule that reads it is the
         app's own and is keyed on nothing else. */
      className={heroCard === 1 ? 'agn__r--dup' : undefined}
    />
  );
}

/* ──────────────────────────────────────────────────────────────── money ──── */

/**
 * THE MONTH, AS ONE FIGURE AND A BAR.
 *
 * `MonthCard` beside it on a desk states five figures as `.kv` rows, which is
 * right where a trainer is checking arithmetic. The app's card answers the glance
 * instead: what was billed, how much of it has arrived, and — only when a gym
 * takes a cut — what of it is actually yours.
 *
 * The bar is two segments of the SAME total, not a progress meter: collected and
 * pending are both shares of what was billed, and the gap at the end is billing
 * that is neither — which on a real month is a payment recorded with no status yet.
 * Drawing it as a two-segment bar rather than one lets that gap be visible instead
 * of being rounded into "collected".
 *
 * Nothing billed, no card. A month with no billing has no shape to draw, and an
 * empty bar over ₹0 is five modules' worth of the app's own rule: five empty cards
 * are worse than one clear action.
 *
 * ── UNMOUNTED SINCE 27 AUG 2026, AND EXPORTED SO IT SAYS SO ─────────────────
 *
 * `/today`'s Block 3 is "three numbers, no more", and this is a fourth figure and
 * a bar. It is exported rather than deleted, and the export is the record: `/money`
 * is a `NotBuilt` placeholder, this is the phone twin of `MonthCard`, and both
 * belong on that route the day it lands. An unreferenced local would be a lint
 * error and a deletion would be losing a built module with nowhere to put it.
 */
export function PhoneMoney({ money }: { money: DeckMoney }) {
  if (money.billed <= 0) return null;

  const total = Math.max(1, money.billed);
  const collected = Math.round((100 * money.collected) / total);
  const pending = Math.round((100 * money.pending) / total);

  return (
    <>
      <SectionHead label={money.monthLabel} action={{ label: 'Payments', href: '/business' }} />
      <Card>
        <div className="mny">
          <span className="mny__m">
            <span className="stat__k">Billed this month</span>
            <b className="mny__v">{rupees(money.billed)}</b>
          </span>
          {/* Only when a gym cut makes the two differ. Repeating the same figure
              under a second name reads as a bug, which is the app's reason. */}
          {money.yours < money.billed && (
            <span className="mny__s">
              <span className="stat__k">Your share</span>
              <b className="mny__sv">{rupees(money.yours)}</b>
            </span>
          )}
          {money.trendPercent !== null && (
            <Tag tone={money.trendPercent >= 0 ? 'ok' : 'warn'}>
              {money.trendPercent >= 0 ? '▲' : '▼'} {Math.abs(money.trendPercent)}%
            </Tag>
          )}
        </div>

        <div className="meter meter--lg mt3" aria-hidden="true">
          <i className="ok" style={{ width: `${collected}%` }} />
          <i className="warn" style={{ width: `${pending}%` }} />
        </div>

        <div className="lgnd mt2">
          <span className="lgnd__i">
            <i className="lgnd__d lgnd__d--ok" />
            Collected {rupees(money.collected)}
          </span>
          <span className="lgnd__i">
            <i className="lgnd__d lgnd__d--warn" />
            Pending {rupees(money.pending)}
          </span>
        </div>
      </Card>
    </>
  );
}

/* ───────────────────────────────────────────────────────────────── week ──── */

/**
 * SEVEN BARS, AND ONLY ONCE THE DAY IS OVER.
 *
 * `deck.ts`: "no chart until the day is over". A week's shape is a review, and a
 * trainer with three sessions left today is not reviewing — the same argument that
 * keeps the money card fourth instead of first. So this module waits for the last
 * session to settle, and for there to be something delivered to draw.
 *
 * The percentage beside the count is `week.percent` — delivered over what SETTLED,
 * which is `WeekCard`'s correction to the app's own fraction and applies here for
 * the same reason: on a Tuesday, dividing by everything still to come reports a
 * good week as a 33% one. The bars are counts per day and carry no denominator, so
 * they are the same seven bars the app draws.
 *
 * Unmounted since 27 Aug 2026, and exported for the reason `PhoneMoney` above is:
 * this is the phone twin of `WeekCard`, `/reports` is a `NotBuilt` placeholder, and
 * both belong there. The rule it encodes — no chart until the day is over — is the
 * part worth keeping whatever route draws it.
 */
export function PhoneWeek({ week, dayOver }: { week: DeckWeek; dayOver: boolean }) {
  if (!dayOver || week.delivered === 0) return null;
  const peak = Math.max(1, ...week.days.map((d) => d.value));

  return (
    <>
      <SectionHead label="This week" action={{ label: 'Reports', href: '/business/reports' }} />
      <Card>
        <div className="wk__hd">
          <b className="h4">{sessionCount(week.delivered)} delivered</b>
          <span className="wk__p">{week.percent}%</span>
        </div>
        {/*
          A row of bars, and the accessible name is the sentence a reader gets
          instead of seven unlabelled columns. The bars themselves are hidden
          from the tree: the figures are in the line above and in the label, and
          seven "3"s read out in sequence is not the week.
        */}
        <div className="wbars mt3" role="img" aria-label={ariaWeek(week)}>
          {week.days.map((d, i) => (
            <span className={`wbar${d.on ? ' wbar--on' : ''}`} key={i} aria-hidden="true">
              <i
                className={`wbar__f${d.value > 0 ? ' wbar__f--n' : ''}`}
                style={{ height: `${Math.round((100 * d.value) / peak)}%` }}
              >
                {d.value > 0 && <em>{d.value}</em>}
              </i>
              <b>{d.label}</b>
            </span>
          ))}
        </div>
      </Card>
    </>
  );
}

/** "Mon 2, Tue 1, Wed none, …" — the bars, said. */
function ariaWeek(week: DeckWeek): string {
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return `Delivered this week: ${week.days
    .map((d, i) => `${names[i]} ${d.value === 0 ? 'none' : d.value}`)
    .join(', ')}`;
}

/* ────────────────────────────────────────────────────────── what happened ── */

/**
 * RECENT ACTIVITY — five rows, and a sentence saying what it covers.
 *
 * The last module in the stack, which is `deck.ts`'s position for it: what
 * happened is the thing you read when nothing needs doing. Five, because the sixth
 * row on a 390px screen is below anything a trainer scrolls to on purpose, and the
 * whole feed is not a destination this screen owns — a client's own file is.
 *
 * The footnote names the window AND the two kinds, because `buildActivity` here
 * covers workouts and payments and the app's covers body metrics too. A feed that
 * quietly omits a kind is a feed that says nothing happened when something did.
 */
function PhoneActivity({ activity }: { activity: DeckActivity[] }) {
  if (activity.length === 0) return null;
  const shown = activity.slice(0, 5);

  return (
    /* The last section on the screen that was still drawing a `SectionHead`,
       and therefore the last 10.5px tracked-out mono label on it. It is
       phone-only, which is exactly why it was easy to miss: a desktop sweep
       never renders it. */
    <Slab title="Recent activity">
      <div className="feed">
        {shown.map((a) => (
          <Link className="feed__i" key={a.key} href={`/clients/${a.clientId}`}>
            <Avatar name={a.clientName} id={a.clientId} size="sm" />
            <span className="feed__b">
              <b>
                {a.clientName} <span className="feed__v">{a.body}</span>
              </b>
              <i>{a.meta}</i>
            </span>
            {a.tag && <Tag tone={a.tag.tone}>{a.tag.label}</Tag>}
          </Link>
        ))}
      </div>
      <p className="small mt2">Workouts and payments from the last 7 days.</p>
    </Slab>
  );
}

/* ─────────────────────────────────────────────────────────────── the stack ── */

/**
 * WHAT IS LEFT THAT IS STILL PHONE-ONLY: one module.
 *
 * The restructure promoted `Glance` and `TodayList` to every width and unmounted
 * the month and the week, so this wrapper — which used to hold four modules — holds
 * *Recent activity* alone.
 *
 * It stays phone-only rather than being promoted with the other two, and the reason
 * is the brief's own structure: Today answers *what must I do today, in order of
 * what it costs me to ignore*, and what happened yesterday is not on that list. A
 * desk has `/reports` for it, one click away in the rail. A phone has no rail, the
 * column is already scrolling, and five rows at the foot of it cost nothing and
 * answer the one question a trainer asks on the way in — *did anything happen while
 * I was not looking*.
 *
 * `PhoneMoney` and `PhoneWeek` are still declared above and are no longer called.
 * That is recorded rather than tidied away: see this file's header and `AGENTS.md`.
 * They are the phone's twins of `MonthCard` and `WeekCard`, and all four arrive
 * together on the route that owes them.
 */
export function PhoneStack({ deck }: { deck: Deck }) {
  return (
    <div className="today__phone">
      <PhoneActivity activity={deck.activity} />
    </div>
  );
}
