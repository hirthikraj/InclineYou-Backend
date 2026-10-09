'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { DeckSession } from '@/lib/today/deck';
import { initials } from '@/lib/today/time';
import { formatPhone } from '@/lib/auth/policy';
import { useDismiss } from '@/lib/ui/dismiss';
import { signOut } from '@/lib/auth/actions';
import {
  ACCOUNT, BAR, HIDDEN_FROM_BAR, PRIMARY,
  type Destination, type RailBadge, type RailCounts, type RailKey,
  activePageKey, moreBadge,
} from './nav';
import { Check, Dots6, Out, Plus } from './Icons';
import { AddSheet } from './AddSheet';
import { useNavFlags, visiblePages } from './NavFlags';
import { Avatar } from '@/web-components/ui/Avatar';
import { ThemeSwitch } from '@/web-components/ui/ThemeSwitch';

/**
 * THE RAIL, AT 390px — three destinations, a raised +, and a door to the other two.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS AT ALL, GIVEN THE RAIL'S WHOLE ARGUMENT
 *
 * `Rail.tsx` opens with it: "the app's navigation drawer is a whole screen you
 * have to open; here it is furniture you never open", and the heuristic audit
 * calls that "the single largest recognition win in the port". Ten destinations
 * permanently visible.
 *
 * The rail does not fit a phone at any length. `.app` is a grid of `248px + 1fr`,
 * so on a 390px screen the rail took 248 of them and left 142px for the whole day
 * — not a degraded screen, an unusable one. Something had to give, and there were
 * only three candidates: put the rail behind a hamburger, shrink it to 64px of
 * icons, or keep some of it visible and put the rest one tap away.
 *
 * The first is the phone's drawer, re-created, which is the thing the audit
 * credits this half with deleting. The second spends 16% of the width on a column
 * whose labels are gone and whose tooltips do not exist under a finger. The third
 * keeps the recognition win where it is worth most and pays for it only in the
 * six destinations a trainer opens least — and `nav.tsx` explains why the four
 * that stay are not a fresh choice: they are the phone's four. Its own correction
 * there is worth reading before touching this file — same four destinations, a
 * different order and two different words, both on purpose.
 *
 * ── AND THE SHEET IS NOT A SECOND NAVIGATION SYSTEM ──────────────────────────
 *
 * Everything in it comes from the same list the rail draws, plus today's pins and
 * the account — so the sheet cannot offer a destination the rail does not, and
 * cannot miss one it does. The one thing it adds is the account, because the
 * rail's foot is inside the half that is hidden, and **sign-out was already the
 * one thing the shell could not do**; leaving it behind a `display:none` would put
 * a trainer on a shared gym phone back where `AccountMenu.tsx` found them.
 *
 * *Team* is in that account group and not among the destinations, which is where
 * `AccountMenu.tsx` puts it in the rail — same shelf, both widths.
 *
 * ── AND THE CENTRE + IS NOT A FIFTH DESTINATION ──────────────────────────────
 *
 * `NavBar.tsx` on the phone states the rule this copies: "the centre + is not a
 * fifth tab and never takes the selected state — it opens a sheet and the tab you
 * were on is still the tab you are on". So it is the one control in the bar that
 * is not a `<Link>`, it carries no `aria-current`, and it is the only one that
 * ignores the label pattern below: a labelled 46px FAB would push the two tabs to
 * its right under their minimum width, which is the app's reason and holds here
 * for the same arithmetic.
 *
 * It sits between slots 2 and 3, which is where the phone puts it, so a trainer's
 * thumb finds it in the same place on both halves.
 *
 * **Five slots, and the + is RAISED.** A centre action only looks centred if what
 * flanks it is symmetrical, so the bar is `Today · Schedule · (+) · Clients ·
 * More`: two tabs, the action, a tab and the door. `nav.tsx`'s `BAR_ORDER` is
 * where that order is decided and why it is not the rail's.
 *
 * *Programs* and *Business* are what came off, and `nav.tsx`'s `BAR` carries the
 * argument plus the one thing it cost — the pending badge is the only `alert` in the
 * shell, so it is summed into the dot on *More* rather than lost.
 * `HIDDEN_FROM_BAR` is read by the sheet below, so a destination the bar drops is
 * a destination the sheet gains, by construction rather than by two people
 * remembering.
 *
 * **Raised, not inline.** It sits ~13px above the bar's top edge with a ring in
 * the bar's own background colour, so it reads as sitting ON the bar rather than
 * in it — which is what "not a fifth tab" looks like when the row is otherwise
 * four identical columns. It costs 13px of the day scrolling underneath it, which
 * is why `.body` carries extra bottom padding under 900px; and it is the reason
 * `.tabs` cannot take `overflow:hidden`, ever.
 *
 * ── WHAT THE BAR DELIBERATELY DOES NOT DO ────────────────────────────────────
 *
 * It does not hide on scroll. A bar that slides away buys back 56px and costs the
 * trainer the ability to point at where they are going; on a screen whose whole
 * job is triage, the queue is what scrolls and the destinations are what stay.
 * And it is `<nav>` rather than `role="tablist"` — these are page loads, not tab
 * panels, and a tablist promises arrow-key movement between panels that do not
 * exist.
 */

/* ───────────────────────────────────────────────────────────── the bar ── */

/**
 * Where the + goes: after slot 2.
 *
 * `Math.ceil(tabs.length / 2)` in `NavBar.tsx`, and here it is 2 of 3 rather than
 * 2 of 4 — because *More* is the fourth column of this row even though it is not a
 * destination. Two tabs, the action, then a tab and the door: symmetrical to the
 * eye, which is the whole reason the + is in the middle.
 *
 * It is a constant rather than `Math.ceil(BAR.length / 2)` because it is a fact
 * about the ROW (four columns around a centre), not about the list — deriving it
 * would silently re-centre the + the day `HIDDEN_FROM_BAR` changes by one.
 */
const SPLIT = 2;

function Dot({ badge }: { badge?: RailBadge }) {
  if (!badge) return null;
  // Empty text is the "there is something here" mark — see `moreBadge`. A figure
  // renders as a figure; a badge with nothing in it renders as a dot.
  const bare = badge.text === '';
  return (
    <span
      className={`tabs__n${badge.tone ? ` tabs__n--${badge.tone}` : ''}${bare ? ' tabs__n--dot' : ''}`}
      aria-label={badge.label}
      role="status"
    >
      {badge.text}
    </span>
  );
}

function Tab({
  dest,
  current,
  badge,
}: {
  dest: Destination;
  current: RailKey;
  badge?: RailBadge;
}) {
  return (
    <Link
      className="tabs__i"
      href={dest.href}
      {...(dest.key === current ? { 'aria-current': 'page' as const } : {})}
    >
      <span className="tabs__ic">
        {dest.icon}
        <Dot badge={badge} />
      </span>
      {/*
        THE LABEL IS ALWAYS DRAWN, never only under the selected tab.
        An icon-only bar is recall — the trainer has to remember which glyph is
        the money book — and recognition over recall is the one heuristic this
        whole shell is built on. Five labels at 10px fit 320px with room; the
        alternative saves nothing anybody needed.
      */}
      <span className="tabs__t">{dest.label}</span>
    </Link>
  );
}

export function TabBar({
  current,
  trainerName,
  trainerPhone = null,
  tabs,
  counts = {},
  pins = [],
  firstRun = false,
}: {
  current: RailKey;
  trainerName: string;
  trainerPhone?: string | null;
  /**
   * A FLAT BAR OF N TABS, for the client portal — no centre +, no *More*.
   *
   * Absent, the bar is the trainer's: three tabs around a raised action with a
   * door to the two destinations it dropped, and every argument in this file's
   * header applies to it unchanged.
   *
   * Present, it is `CLIENT_PRIMARY`'s four, drawn flat. Three things follow, and
   * each is why this is a parameter rather than a second component:
   *
   *   · **No +.** A trainer CREATES — clients, sessions, exercises, payments —
   *     and a client creates exactly one thing, a workout, started from the one
   *     button Home is arranged around. `nav.tsx`'s `CLIENT_PRIMARY` carries
   *     the argument, and `NavBar.tsx` on the phone reached it first: it draws
   *     no + for the client role at all.
   *   · **No *More*.** There is nothing behind it. `HIDDEN_FROM_BAR` exists
   *     because five labelled slots plus a raised action is six targets on a
   *     390px screen; four labelled slots and no action is four, which fits
   *     320px with room. That is the "four tabs, no more" rule paying for
   *     itself a second time.
   *   · **No `SPLIT`.** That constant is a fact about a row with a centre
   *     action in it, and this row has none — deriving a midpoint here would
   *     put a gap in the middle of four tabs for no reason.
   *
   * `Tab` itself is untouched and shared, which is the point: one `.tabs__i`,
   * one `aria-current`, one always-drawn label, one badge.
   */
  tabs?: Destination[];
  counts?: RailCounts;
  pins?: DeckSession[];
  firstRun?: boolean;
}) {
  // The same rule the rail applies, for the same reason: a bar claiming *Clients
  // 22* beside *Add your first client* is the defect one level out. The exercise
  // library's count used to survive `firstRun` here because it was true on day
  // one; the library is a tab inside Programs now and counts itself.
  const shown: RailCounts = firstRun ? {} : counts;
  const behind = moreBadge(shown);

  const sheetId = useId();
  const addId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const addTrigger = useRef<HTMLButtonElement>(null);
  const [open, setOpenState] = useState(false);
  /*
   * TWO SHEETS, ONE AT A TIME, and this is a single piece of state rather than two
   * booleans on purpose: two would allow *More* and the + to be open together —
   * sheet on sheet, both anchored to the same bottom edge, the second one
   * mounting over the first's grip. `null` is the closed state of both.
   */
  const [added, setAdded] = useState(false);

  /**
   * Closing returns focus to the trigger, which is `AccountMenu.tsx`'s reasoning
   * unchanged: the button is the last thing in the bar's tab order, and a
   * keyboard user who presses Escape in an overlay that then unmounts is
   * returned to the top of the document.
   *
   * A sheet that survives a navigation is a sheet covering the screen it just
   * took you to, so every row inside it closes on click — the click rather than
   * an effect on the pathname, because the sheet unmounts before the new page
   * renders either way and the click is the moment the trainer decided.
   */
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    if (next) setAdded(false);
    if (!next) trigger.current?.focus();
  }, []);

  const setAdd = useCallback((next: boolean) => {
    setAdded(next);
    if (next) setOpenState(false);
    if (!next) addTrigger.current?.focus();
  }, []);

  /**
   * EACH SHEET'S OWN WAY OUT, BORROWED BY THE BUTTON THAT OPENED IT.
   *
   * Both buttons are toggles, and a toggle that closes by flipping a boolean
   * unmounts the box — which is the one dismissal that skips the exit
   * transition, and it is the one a thumb reaches for most. The sheets run
   * `useDismiss`, so each hands its `dismiss` up here on mount and the button
   * calls that instead of `setOpen(false)`.
   *
   * A ref and not state: this changes on mount and unmount, and re-rendering
   * the bar because a sheet appeared is a render of five tabs for nothing.
   * `?? setOpen(false)` is the honest fallback rather than a guard — if a sheet
   * ever renders without registering, the button still closes it, just without
   * the 180ms.
   *
   * The callbacks are `useCallback`ed because each is in the child's effect
   * dependency list, and a fresh identity every render would re-register on
   * every keystroke anywhere in the shell.
   */
  const moreOut = useRef<(() => void) | null>(null);
  const addOut = useRef<(() => void) | null>(null);
  const moreReady = useCallback((fn: () => void) => { moreOut.current = fn; }, []);
  const addReady = useCallback((fn: () => void) => { addOut.current = fn; }, []);
  const closeMore = useCallback(() => {
    if (moreOut.current) moreOut.current();
    else setOpen(false);
  }, [setOpen]);
  const closeAdd = useCallback(() => {
    if (addOut.current) addOut.current();
    else setAdd(false);
  }, [setAdd]);

  // Whether the current screen is one of the ones behind *More* — Programs,
  // Business, Settings and Team. Without it the bar has no selected slot at all on
  // those pages, which reads as "you are nowhere". `BAR` and not `PRIMARY`: the
  // test is "does the bar draw a tab for where I am", and it does not draw one for
  // the two primaries it dropped.
  const inMore = !BAR.some((d) => d.key === current);

  /* The client's bar. Returned before any of the trainer's state is used —
     the hooks above still run, which is what the rules of hooks require, and
     nothing they hold is read on this path. */
  if (tabs) {
    return (
      <nav className="tabs" aria-label="Sections">
        {tabs.map((d) => (
          <Tab key={d.key} dest={d} current={current} badge={shown[d.key as keyof RailCounts]} />
        ))}
      </nav>
    );
  }

  return (
    <>
      <nav className="tabs" aria-label="Sections">
        {BAR.slice(0, SPLIT).map((d) => (
          <Tab key={d.key} dest={d} current={current} badge={shown[d.key as keyof RailCounts]} />
        ))}

        {/*
          THE CENTRE ACTION. A `<button>` in a `<nav>` labelled *Sections*, which
          is a small lie about its parent and the lesser of the two available: the
          alternative is a second landmark for one control, and a bar that looks
          like one row to the eye should be one row to a reader.

          No label, no `aria-current`, and `aria-label="Add"` is the app's own
          accessible name for it. `.tabs__t` is absent rather than empty — an empty
          span still takes the row's line-height and lifted the FAB 12px above its
          neighbours' glyphs.
        */}
        <button
          className="tabs__i tabs__i--add"
          type="button"
          ref={addTrigger}
          aria-label="Add"
          aria-haspopup="dialog"
          aria-expanded={added}
          aria-controls={added ? addId : undefined}
          onClick={() => (added ? closeAdd() : setAdd(true))}
        >
          <span className="fab">
            <Plus size={22} />
          </span>
        </button>

        {BAR.slice(SPLIT).map((d) => (
          <Tab key={d.key} dest={d} current={current} badge={shown[d.key as keyof RailCounts]} />
        ))}

        <button
          className="tabs__i"
          type="button"
          ref={trigger}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? sheetId : undefined}
          {...(inMore ? { 'aria-current': 'page' as const } : {})}
          onClick={() => (open ? closeMore() : setOpen(true))}
        >
          <span className="tabs__ic">
            <Dots6 />
            <Dot badge={behind} />
          </span>
          <span className="tabs__t">More</span>
        </button>
      </nav>

      {added && <AddSheet id={addId} onClose={() => setAdd(false)} onReady={addReady} />}

      {open && (
        <MoreSheet
          id={sheetId}
          current={current}
          counts={shown}
          pins={firstRun ? [] : pins}
          trainerName={trainerName}
          trainerPhone={trainerPhone}
          onClose={() => setOpen(false)}
          onReady={moreReady}
        />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────── the sheet ── */

/**
 * A bottom sheet, and every one of those three words is a decision.
 *
 * **Bottom**, because it is opened from the bottom bar and a surface that appears
 * at the opposite end of the screen from the finger that summoned it breaks the
 * one spatial relationship a phone has to offer.
 *
 * **Sheet** rather than a full screen, because the day behind it is the reason
 * the trainer is here — the same argument `Palette.tsx` makes about opening over
 * the real deck rather than a blanked one. It caps at 78% of the viewport so
 * there is always some of the day showing above it.
 *
 * **Scrolls its own body**, because on a 320px-tall landscape phone six
 * destinations, five pins and an account do not fit anything.
 */
function MoreSheet({
  id,
  current,
  counts,
  pins,
  trainerName,
  trainerPhone,
  onClose,
  onReady,
}: {
  id: string;
  current: RailKey;
  counts: RailCounts;
  pins: DeckSession[];
  trainerName: string;
  trainerPhone: string | null;
  onClose: () => void;
  /**
   * Hands the bar a way to dismiss this sheet WITH its exit motion.
   *
   * The *More* button is a toggle, so pressing it while the sheet is open used
   * to call `setOpen(false)` and unmount the box — which is the one path that
   * skipped the animation, and it is the path a thumb takes most. The state
   * stays in `TabBar` (it owns which of the two sheets is open) and the wait
   * lives here (it owns the element), so the button borrows the second.
   */
  onReady?: (dismiss: () => void) => void;
}) {
  /**
   * THE EXIT, AND THE REASON IT IS NOT JUST A CLASS.
   *
   * `.sheet` now rises on a transition and leaves on one, and a transition can
   * only leave while its box is still mounted — so closing is two steps: put
   * the closed state back, then unmount. `useDismiss` is the wait, and it asks
   * the element what is actually running rather than counting: under
   * `prefers-reduced-motion` the stylesheet sets `transition:none`, nothing is
   * running, and the sheet closes on the spot with no timer to get wrong.
   *
   * `dismiss` replaces `onClose` for every way OUT of the sheet — Escape, the
   * scrim, and the bar's own *More* button through `onReady`. It deliberately
   * does NOT replace it on the rows: those are navigations, and holding a
   * scrim over the screen the trainer just asked for is the sheet outstaying
   * the decision that closed it.
   *
   * One ref, not two. The hook needs the element to ask it about transitions
   * and the focus call below needs the same element to find its first control.
   */
  const { closing, dismiss, ref: panel } = useDismiss<HTMLDivElement>(onClose);

  useEffect(() => { onReady?.(dismiss); }, [onReady, dismiss]);

  /* Read here rather than passed down from `AppShell`: `current` is a RailKey and
     names the SECTION, which is all the bar's five tabs ever needed. The sheet's
     section groups mark a PAGE, and no key exists for one. */
  const pathname = usePathname();

  // Escape, and focus into the sheet on the render that created it. Both are the
  // obligations of `aria-modal`, and a modal that keeps focus outside itself is
  // an overlay a keyboard user can tab behind.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss();
      }
    };
    document.addEventListener('keydown', onKey);
    /* `preventScroll`, AND IT IS THE WHOLE BUG REPORT.

       MEASURED BUG, REPORTED as *the background screen is moving when clicking
       More*. The sheet now MOUNTS at `translateY(100%)` — `@starting-style`'s
       pose, 658px below the fold — and this line then asked the browser to put
       the first row where a user could see it. The browser obliged the only way
       it can: it scrolled the nearest scrollport, which is `.app`.

       `.app` is `overflow:hidden`, and **`hidden` still creates a scrollport**.
       There is no scrollbar and a finger cannot drag it, so nothing in the app
       had ever scrolled it and nothing looked scrollable — but `focus()` can,
       and did. MEASURED at 390x700 on `/today`: `.app.scrollTop` went 0 to
       **421.6px**, putting the top bar at `y:-421.6` and the tab bar in the
       middle of the screen. The whole shell slid up behind the sheet and stayed
       there.

       Isolated rather than assumed — the same focus call with and without this
       flag, three times each: without it 421.6px, with it 0.

       It is the RIGHT answer here and not a workaround. The element is not
       off-screen because it is somewhere else; it is off-screen because it is
       240ms into arriving, and it will be in the middle of the viewport when it
       stops. Scrolling the page to chase a box that is already on its way is
       the browser solving a problem that is in the act of solving itself.

       `.app` was hardened as well — webapp.css now says `overflow:clip`, which
       clips exactly as `hidden` did and creates no scrollport at all, so no
       future `focus()` or `scrollIntoView` anywhere in the product can move the
       shell. This flag is the fix; that is the class. */
    panel.current?.querySelector<HTMLElement>('a,button')?.focus({ preventScroll: true });
    return () => document.removeEventListener('keydown', onKey);
  }, [dismiss, panel]);

  const name = trainerName || 'Your account';
  // `formatPhone` always returns a string — handed '' it answers a bare `+91 `,
  // which is the blank line this header is supposed to drop. Decided here,
  // before the formatter sees it. Same call as `AccountMenu.tsx`.
  const phone = trainerPhone ? formatPhone(trainerPhone) : null;

  const dropped = PRIMARY.filter((d) => HIDDEN_FROM_BAR.includes(d.key));

  /**
   * Every section, not just the dropped ones — and the hrefs the bar already
   * reaches, so a page is never drawn twice.
   *
   * ── THE DEFECT THIS CLOSES ─────────────────────────────────────────────
   *
   * This read `dropped.filter((d) => d.pages …)`, which is the right list for
   * *why the sheet exists* and the wrong one for *what a phone can reach*. A
   * section's pages are drawn in the rail's pane, the pane is `display:none`
   * under 900px, and the sheet was the only replacement — but it only drew the
   * pages of the two destinations the BAR dropped. A section the bar KEEPS
   * still loses its pane at 390px, and its pages went nowhere.
   *
   * *Clients* is that section. `PRIMARY` gives it two pages, and the second is
   * **Assessments** — added in the pass whose own note in `nav.tsx` says "the
   * cost of adding *Assessments* was one row". It cost one row on a desk and it
   * cost the whole page on a phone: `/clients/assessments` had no door in the
   * bar, none in the sheet and none in a pane that is not drawn, so the only
   * way to it was typing the URL. REPORTED as missing from *More*.
   *
   * ── AND `/clients` IS NOT DRAWN TWICE ──────────────────────────────────
   *
   * The block below already refuses to put a destination's own row above its
   * pages, because the row and the first page lead to the same screen. The
   * same duplication arrives from the other direction here: *All clients* is a
   * page of this section AND the bar's third tab, 60px below the sheet, so
   * drawing it would put two controls for one screen on the phone at once.
   *
   * Tested against the BAR's hrefs rather than against `HIDDEN_FROM_BAR`,
   * because the question is "can a thumb already reach this screen", and the
   * bar is the list of screens a thumb can already reach. It is derived for the
   * usual reason: *Assessments* is not named here, so a third page under
   * Clients appears in this sheet on the commit that adds it.
   */
  const flags = useNavFlags();
  const reachable = new Set(BAR.map((b) => b.href));
  /* BUSINESS FIRST. The sheet used to follow the rail's column — Clients,
     Fitness, Business — which put the money book, the retention hook, under two
     other headings on the one surface where it is already a tap further away
     than at a desk. A stable sort on one key, so the other sections keep the
     rail's relative order and nothing else here is stated twice. */
  const sections = PRIMARY.filter((d) => (d.pages?.length ?? 0) > 1).sort(
    (a, b) => Number(b.key === 'biz') - Number(a.key === 'biz'),
  );

  /**
   * A SECTION, DRAWN AS A HEADING AND ITS PAGES — and the row for it goes away.
   *
   * The rail's pane is `display:none` under 900px, so this sheet is the ONLY
   * surface a section's pages can be reached from at phone width. Before this
   * block, *Fitness* was one row leading to `/programs` and the other three pages
   * — Workouts, Templates, the exercise library — had no door on a phone at all:
   * the horizontal strip that used to carry them was removed in the same pass
   * that built the pane, and the pane is not drawn here.
   *
   * The destination's own row is REPLACED rather than kept above the pages. Its
   * href is the first page's href — `nav.tsx` says why they are the same
   * navigation — so keeping both would put two rows one line apart leading to the
   * identical screen under two different names, which is the duplication
   * `CLIENT_ACCOUNT`'s docstring rejected for exactly this surface.
   *
   * What is lost with the row is the `purpose` line, and it is the right thing to
   * lose: *what the clients do* describes the section, and a heading over four
   * rows is already doing that job with the label the rail uses.
   */
  const section = (d: Destination) => {
    const pages = visiblePages(d.pages ?? [], flags).filter((p) => !reachable.has(p.href));
    /* A section whose every page is a bar tab has nothing to add here, and a
       heading over nothing is a heading over nothing. Cannot happen today —
       Clients keeps *Assessments* — and it is the shape of this list changing
       under the sheet rather than an impossible state. */
    if (pages.length === 0) return null;
    const active = activePageKey(pages, pathname);
    return (
      <div key={d.key} className="sheet__g sheet__g--first">
        <p className="sheet__gk">{d.label}</p>
        {pages.map((page) => (
          <Link
            key={page.key}
            className="sheet__i"
            href={page.href}
            onClick={onClose}
            {...(page.key === active ? { 'aria-current': 'page' as const } : {})}
          >
            {page.icon}
            <span className="sheet__l">{page.label}</span>
          </Link>
        ))}
      </div>
    );
  };

  const row = (d: Destination) => (
    <Link
      key={d.key}
      className="sheet__i sheet__i--two"
      href={d.href}
      onClick={onClose}
      {...(d.key === current ? { 'aria-current': 'page' as const } : {})}
    >
      {d.icon}
      {/* Two lines here where the rail has one and a tooltip. The rail hangs the
          purpose on `title=`, and a tooltip does not exist under a thumb — so on
          the surface where the destination is one tap FURTHER away, the reason to
          make the tap is drawn rather than hovered. */}
      <span className="sheet__l sheet__l--two">
        <b>{d.label}</b>
        <i>{d.purpose}</i>
      </span>
      {counts[d.key as keyof RailCounts] && (
        <span
          className={`rail__n${
            counts[d.key as keyof RailCounts]!.tone
              ? ` rail__n--${counts[d.key as keyof RailCounts]!.tone}`
              : ''
          }`}
          aria-label={counts[d.key as keyof RailCounts]!.label}
        >
          {counts[d.key as keyof RailCounts]!.text}
        </span>
      )}
    </Link>
  );

  return (
    <>
      {/* A button rather than a div with an onClick, for `Palette.tsx`'s reason:
          tapping away is a real way out and it should be one for a keyboard too. */}
      <button
        className={`scrim scrim--top${closing ? ' scrim--out' : ''}`}
        type="button"
        aria-label="Close"
        onClick={dismiss}
      />
      <div
        className={`sheet${closing ? ' sheet--out' : ''}`}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label="More sections"
        ref={panel}
      >
        {/* The grab handle is decoration and says so. There is no drag-to-dismiss
            — a gesture with no visible affordance and no keyboard equivalent is
            not a way out, so the scrim, Escape and the bar's own button are the
            three that are. */}
        <div className="sheet__grip" aria-hidden="true" />

        <div className="sheet__b">
          {/*
            WHAT THE BAR DROPPED, FIRST IN THE SHEET, AND WITH NO HEADING.

            Built from `HIDDEN_FROM_BAR` rather than written out, so the sheet
            cannot fall out of step with the bar: a destination the bar stops
            drawing appears here on the same commit, and one that is promoted back
            disappears from here without anybody editing this block.

            There were three headed groups here — *Daily*, *Build*, *Grow* — and
            they went the same way the rail's did, for the same reason: two rows do
            not need a taxonomy above them. What is left is the two primary
            destinations the row had no room for, and the pins and the account
            keep their headings because they are a different KIND of thing, not a
            different frequency of the same thing.
          */}
          {/* Sections first, each as its own headed group, then whatever the bar
              dropped that is a single screen. Written as two passes over two
              lists rather than one pass that branches, so the sheet's ORDER is
              stated here instead of falling out of `PRIMARY`'s.

              WITHIN the first pass the order is `PRIMARY`'s — the rail's column
              top to bottom, so the two widths agree — except that Business is
              lifted to the front (see `sections` above). */}
          {sections.map(section)}
          {dropped.filter((d) => !d.pages || d.pages.length <= 1).length > 0 && (
            <div className="sheet__g sheet__g--first">
              {dropped.filter((d) => !d.pages || d.pages.length <= 1).map(row)}
            </div>
          )}

          {pins.length > 0 && (
            <div className="sheet__g">
              <p className="sheet__gk">
                Today<span>{pins.length}</span>
              </p>
              {pins.map((s) => (
                <Link
                  key={s.id}
                  className={`sheet__i sheet__i--pin${s.live ? ' sheet__i--now' : ''}${
                    s.done ? ' sheet__i--done' : ''
                  }`}
                  href={`/clients/${s.clientId}`}
                  onClick={onClose}
                >
                  <Avatar name={s.clientName} id={s.clientId} size="sm" />
                  <span className="sheet__l">{s.clientName}</span>
                  {s.done ? (
                    <span className="rail__pt rail__pt--done">
                      <Check size={12} />
                    </span>
                  ) : s.live ? (
                    <span className="rail__pt rail__pt--now">Now</span>
                  ) : (
                    <span className="rail__pt">
                      {s.time} {s.meridiem}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}

          <div className="sheet__g sheet__g--acct">
            <div className="sheet__acct">
              <span className="av av--sm" style={{ background: 'var(--tx-av-4)' }} aria-hidden="true">
                {initials(trainerName || 'X')}
              </span>
              <span>
                <b>{name}</b>
                {phone && <i>{phone}</i>}
              </span>
            </div>
            {/* Your profile and Settings, from `ACCOUNT` — the same two rows, in
                the same order, that `AccountMenu.tsx` draws in the rail's foot.
                Written once in `nav.tsx` so the two widths cannot disagree about
                what is on the account shelf.

                It was three. *Team* came off the shelf entirely when a team
                became a WORKSPACE rather than a permissions screen — it is the
                top bar's switcher now, which this half draws at every width, so
                the phone loses nothing by the row going. `nav.tsx` carries the
                argument. */}
            {ACCOUNT.map((d) => (
              <Link
                key={d.key}
                className="sheet__i sheet__i--two"
                href={d.href}
                onClick={onClose}
                {...(d.key === current ? { 'aria-current': 'page' as const } : {})}
              >
                {d.icon}
                <span className="sheet__l sheet__l--two">
                  <b>{d.label}</b>
                  <i>{d.purpose}</i>
                </span>
              </Link>
            ))}
            {/*
              A `<form>` posting the server action, `AccountMenu.tsx`'s reason
              unchanged: the response IS the navigation, so nothing here can
              leave a half-signed-out browser sitting on /today.

              And there is NO confirm step here, which is a deliberate difference
              from the rail's menu. That confirm exists because the rail's row is
              on screen on every screen, two rows below a client's name, where a
              misclick ends the session. This row is three taps deep — open the
              sheet, scroll to the foot, press it — so the accident it defends
              against cannot happen, and the cost is still named in the line
              underneath rather than in a step.
            */}
            {/* THE THEME SWITCH, and it was reachable from the desk only: it lived
                in `AccountMenu`'s panel, which is the rail's foot and is hidden
                with the rail under 900px. A phone trainer under gym strip-lights
                or in a bright car park had no way to the light palette, and the
                phone is where the ambient light changes most. Same control, same
                group name, same save-on-press; a row of its own so it is not
                read as one of the account's links. */}
            <div className="sheet__row">
              <span>Theme</span>
              <ThemeSwitch />
            </div>
            <form action={signOut}>
              <button className="sheet__i sheet__i--danger" type="submit">
                <Out size={17} />
                <span className="sheet__l">Sign out</span>
              </button>
            </form>
            <p className="sheet__note">
              Getting back in needs a fresh code on WhatsApp. Nothing on your account changes.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
