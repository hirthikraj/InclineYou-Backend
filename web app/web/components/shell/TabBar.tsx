'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';

import type { DeckSession } from '@/lib/today/deck';
import { avatarToken, initials } from '@/lib/today/time';
import { formatPhone } from '@/lib/auth/policy';
import { signOut } from '@/lib/auth/actions';
import {
  ACCOUNT, BAR, HIDDEN_FROM_BAR, PRIMARY,
  type Destination, type RailBadge, type RailCounts, type RailKey,
  moreBadge,
} from './nav';
import { Check, Dots6, Out, Plus } from './Icons';
import { AddSheet } from './AddSheet';

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
 * flanks it is symmetrical, so the bar is `Today · Clients · (+) · Schedule ·
 * More`: two tabs, the action, a tab and the door.
 *
 * *Programs* and *Business* are what came off, and `nav.tsx`'s `BAR` carries the
 * argument plus the one thing it cost — the owed badge is the only `alert` in the
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
  counts = {},
  pins = [],
  firstRun = false,
}: {
  current: RailKey;
  trainerName: string;
  trainerPhone?: string | null;
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

  // Whether the current screen is one of the ones behind *More* — Programs,
  // Business, Settings and Team. Without it the bar has no selected slot at all on
  // those pages, which reads as "you are nowhere". `BAR` and not `PRIMARY`: the
  // test is "does the bar draw a tab for where I am", and it does not draw one for
  // the two primaries it dropped.
  const inMore = !BAR.some((d) => d.key === current);

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
          onClick={() => setAdd(!added)}
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
          onClick={() => setOpen(!open)}
        >
          <span className="tabs__ic">
            <Dots6 />
            <Dot badge={behind} />
          </span>
          <span className="tabs__t">More</span>
        </button>
      </nav>

      {added && <AddSheet id={addId} onClose={() => setAdd(false)} />}

      {open && (
        <MoreSheet
          id={sheetId}
          current={current}
          counts={shown}
          pins={firstRun ? [] : pins}
          trainerName={trainerName}
          trainerPhone={trainerPhone}
          onClose={() => setOpen(false)}
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
}: {
  id: string;
  current: RailKey;
  counts: RailCounts;
  pins: DeckSession[];
  trainerName: string;
  trainerPhone: string | null;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  // Escape, and focus into the sheet on the render that created it. Both are the
  // obligations of `aria-modal`, and a modal that keeps focus outside itself is
  // an overlay a keyboard user can tab behind.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    panel.current?.querySelector<HTMLElement>('a,button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const name = trainerName || 'Your account';
  // `formatPhone` always returns a string — handed '' it answers a bare `+91 `,
  // which is the blank line this header is supposed to drop. Decided here,
  // before the formatter sees it. Same call as `AccountMenu.tsx`.
  const phone = trainerPhone ? formatPhone(trainerPhone) : null;

  const dropped = PRIMARY.filter((d) => HIDDEN_FROM_BAR.includes(d.key));

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
      <button className="scrim scrim--top" type="button" aria-label="Close" onClick={onClose} />
      <div
        className="sheet"
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
          {dropped.length > 0 && (
            <div className="sheet__g sheet__g--first">{dropped.map(row)}</div>
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
                  <span
                    className="av av--sm"
                    style={{ background: `var(${avatarToken(s.clientId)})` }}
                    aria-hidden="true"
                  >
                    {initials(s.clientName)}
                  </span>
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
            {/* Settings and Team, from `ACCOUNT` — the same two rows, in the same
                order, that `AccountMenu.tsx` draws in the rail's foot. Written
                once in `nav.tsx` so the two widths cannot disagree about what is
                on the account shelf. */}
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
            <form action={signOut}>
              <button className="sheet__i sheet__i--danger" type="submit">
                <Out size={17} />
                <span className="sheet__l">Sign out</span>
              </button>
            </form>
            <p className="sheet__note">
              Getting back in needs a fresh code by SMS. Nothing on your account changes.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
