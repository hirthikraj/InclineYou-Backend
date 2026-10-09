import Link from 'next/link';

import type { DeckSession } from '@/lib/today/deck';
import { Check, Panel } from './Icons';
import { Logo } from '@/web-components/ui/Logo';
import {
  PRIMARY, type Destination, type RailBadge, type RailCounts, type RailKey,
} from './nav';
import { AccountMenu } from './AccountMenu';
import { Avatar } from '@/web-components/ui/Avatar';

/**
 * The navigation rail. FIVE destinations, always visible, in one group.
 *
 * The app's navigation drawer is a whole screen you have to open; here it is
 * furniture you never open. Everything below is `gen_rail.py`'s second pass,
 * built rather than drawn — with two changes and one thing left out.
 *
 * ── ONE DEFECT FIXED, AND IT IS THE ONE THE DESIGN FILE OPENS ON ──────────────
 *
 * `rail()` in the design set hard-codes today's five pins AND their states, so
 * every frame it draws is 09:12 whatever the screen beside it says. The Today
 * page then has to rewrite the two stateful slots and assert the rewrite landed.
 * Its own note says the real fix is a parameter: here the pins ARE a parameter,
 * derived from the same `deck.today` the screen is drawn from, so a rail claiming
 * a live session cannot sit next to a screen saying the day is over.
 *
 * ── AND WHAT IS LEFT OUT ─────────────────────────────────────────────────────
 *
 * Every count badge is the trainer's own data and comes in as a prop. None is
 * hardcoded, because a number in markup is a number that goes stale silently.
 *
 * The counts are what makes the empty state work: a sidebar claiming *Clients 22*
 * beside *Add your first client* is the same defect one level out, so `firstRun`
 * drops every count and every pin rather than drawing zeroes.
 *
 * ── AND THE FOOT IS ITS OWN COMPONENT ────────────────────────────────────────
 *
 * `AccountMenu.tsx`. It is the only part of the rail that holds state — an open
 * panel and, inside it, a sign-out confirm — and this file is otherwise a pure
 * function of its props on either side of the client boundary. Sign-out itself is
 * the one thing the shell could not previously do; the reasoning about the
 * design's ellipsis, and about the two of §2b's four rows that are deliberately
 * not built yet, is over there.
 *
 * ── AND THE DESTINATIONS ARE NO LONGER DECLARED HERE ─────────────────────────
 *
 * `nav.tsx`, because the phone-width pass added a second surface that draws the
 * same list — `TabBar.tsx`'s bar and the sheet behind its fifth slot. Two copies
 * of a destination list is how a screen ends up reachable from one of them and
 * not the other. The rail is hidden by CSS under 900px rather than by a prop, so
 * there is one rail and it cannot drift from the bar that stands in for it.
 *
 * ── AND THE RAIL IS FIXED AT 64px ──────────────────────────────────────────
 *
 * `.app--rail-min` is unconditional in both shells. The rail has no collapsed
 * state of its own — the mark-as-the-way-out that stood in for one is gone with
 * it — and the section pane is the column that closes now. What the rail DOES
 * carry, since 14 Sep 2026, is that pane's switch: see the `pane` prop. The rail
 * is the only column always on screen, so it is the only place a control that
 * reopens a hidden column can live. `paneCollapse.ts` holds the state.
 *
 * ── AND THE GROUP HEADINGS ARE GONE, WHICH IS THE POINT OF THE RESTRUCTURE ───
 *
 * There used to be three groups — the four daily ones, then `BUILD`, then `GROW`
 * — and the headings were the tell. A column that needs headings has stopped
 * being a list of places; six of those eleven rows were tabs that had escaped,
 * and `nav.tsx` has the table of where each one went. Five rows do not need a
 * taxonomy, so there is one group and no keys above it, and the pins below are
 * the only thing in the body that still carries a heading — because they are the
 * one group whose LENGTH changes daily and needs a count.
 */

export type { RailBadge, RailCounts, RailKey } from './nav';

function Badge({ badge }: { badge?: RailBadge }) {
  if (!badge) return null;
  return (
    <span
      className={`rail__n${badge.tone ? ` rail__n--${badge.tone}` : ''}`}
      aria-label={badge.label}
    >
      {badge.text}
    </span>
  );
}

/** An `<a>`, because it navigates. The design set's eleven `<div>`s are its §02.2. */
function Item({
  dest,
  current,
  badge,
  onPreview,
  onLeave,
}: {
  dest: Destination;
  current: RailKey;
  badge?: RailBadge;
  /** Rest here and this section's pages open beside the rail — `panePreview.ts`
   *  has the timing and the argument for it. Called with this row's key, or with
   *  `null` from a row that has no pages, which is a request to close. */
  onPreview?: (key: RailKey | null) => void;
  /** Left this row. The pane's own `hold` is what stops a pointer on its way
   *  INTO the pane from being read as a pointer leaving the rail. */
  onLeave?: () => void;
}) {
  return (
    <Link
      className="rail__i"
      href={dest.href}
      /* ON THE ROW AND NOT ON THE NAV. A `mouseleave` on `.rail` fires when the
         pointer leaves the COLUMN, so sliding off *Fitness* onto the pinned
         sessions below it — or onto the rail's own empty ground — would leave a
         pane open for a section the pointer is nowhere near. Per row, the leave
         fires on every one of those and the grace in `panePreview.ts` covers the
         only case that must survive it: row → pane, which the pane cancels.
         `onFocus` beside `onMouseEnter`, and for the reason the tooltips are
         specified rather than left to `title=`: at 64px this is the one way to
         the section's pages, and a keyboard user arrives here with no pointer. */
      onMouseEnter={onPreview ? () => onPreview(dest.pages?.length ? dest.key : null) : undefined}
      onFocus={onPreview ? () => onPreview(dest.pages?.length ? dest.key : null) : undefined}
      onMouseLeave={onLeave}
      onBlur={onLeave}
      /* The purpose line, as a tooltip rather than a second line of text. Five
         rows with a subtitle each is a menu; five rows with a hover is a rail. */
      title={dest.purpose}
      {...(dest.key === current ? { 'aria-current': 'page' as const } : {})}
    >
      {dest.icon}
      <span>{dest.label}</span>
      <kbd className="rail__k">{dest.accel}</kbd>
      <Badge badge={badge} />
      {/* §06's tooltip, the collapsed rail's only label. Rendered on every row
          rather than on the hovered one — a component cannot know where the
          pointer is — and hidden at rest by `.rail--tips`, which is on the nav
          for exactly that reason. The label, not the purpose line: at 64px the
          question is *which row is this*, and the browser's own `title` above
          still answers the other one. */}
      <span className="rail__tip" role="tooltip">{dest.label}</span>
    </Link>
  );
}

/**
 * A pinned session: who, when, and whether it is done — three encodings, one slot.
 *
 * Not the whole roster. 22 clients at 40px is 880px, which is the entire rail;
 * these are the ones with a session today, which is the set a trainer actually
 * touches. Derived, so it needs no curating, and LAST in the rail so that a group
 * whose length changes daily can never move the furniture above it.
 *
 * It reads as a client — the name and the avatar are the client's — and it is
 * addressed as a session, which is the honest split: the pin exists *because*
 * there is a session today, the time and the done tick beside the name are that
 * session's, and only one of the two things the slot could open answers what the
 * tick is about. It pointed at `/clients/{id}` until 28 Aug 2026, when
 * `/sessions/{id}` stopped being a placeholder.
 */
function Pin({ session, index }: { session: DeckSession; index: number }) {
  const state = session.live ? 'now' : session.done ? 'done' : '';
  return (
    <Link
      className={`rail__pin${state ? ` rail__pin--${state}` : ''}`}
      href={`/sessions/${session.id}`}
    >
      <Avatar name={session.clientName} id={session.clientId} size="sm" />
      <span className="rail__pn">{session.clientName}</span>
      <kbd className="rail__k">{index + 1}</kbd>
      {state === 'done' ? (
        <span className="rail__pt rail__pt--done">
          <Check size={12} />
        </span>
      ) : state === 'now' ? (
        <span className="rail__pt rail__pt--now">Now</span>
      ) : (
        <span className="rail__pt">
          {session.time} {session.meridiem}
        </span>
      )}
      {/* Collapsed, a pin is an avatar and two initials. The tooltip carries the
          name AND the slot the row gives up — "Kavya M · 9:00 AM", "Kavya M ·
          Now" — because a pin that has lost its time has lost the half of itself
          that says why it is pinned. */}
      <span className="rail__tip" role="tooltip">
        {session.clientName} &middot;{' '}
        {state === 'now' ? 'Now' : state === 'done' ? 'Done' : `${session.time} ${session.meridiem}`}
      </span>
    </Link>
  );
}

export function Rail({
  current,
  trainerName,
  trainerPhone = null,
  destinations = PRIMARY,
  accountRows,
  accountRole,
  counts = {},
  pins = [],
  firstRun = false,
  pane,
  onPreview,
  onPreviewLeave,
}: {
  current: RailKey;
  trainerName: string;
  /** The number this session signs in with — the foot menu's header prints it so
   *  a trainer with two accounts can tell which one is open. */
  trainerPhone?: string | null;
  /**
   * WHICH DESTINATIONS THIS RAIL DRAWS, and it is a parameter rather than a
   * second component.
   *
   * The client portal draws the same rail with four rows instead of five
   * (`nav.tsx`'s `CLIENT_PRIMARY`). Forking this file for it was the obvious
   * move and it is exactly what `nav.tsx` exists to prevent one level up: two
   * rails is two places `.rail__i`'s markup, its `aria-current`, its collapsed
   * tooltip and its badge live, and the second one drifts. The design frame
   * agrees — its own note reads *"Same four. The client role never needed a
   * drawer."*
   *
   * Defaults to the trainer's five, so no existing call-site changed.
   */
  destinations?: Destination[];
  /** The foot menu's rows. Defaults to `ACCOUNT` inside `AccountMenu`. */
  accountRows?: Destination[];
  /** The line under the name in the foot — *Trainer*, or *with Arun*. */
  accountRole?: string;
  counts?: RailCounts;
  /** Today's sessions, in time order. Empty on a day with none. */
  pins?: DeckSession[];
  firstRun?: boolean;
  /**
   * THE SECTION PANE'S SWITCH, on the column that never collapses.
   *
   * It sat in `.pane__top` until 14 Sep 2026, which is the one place it cannot
   * be: the pane is HIDDEN outright when collapsed now — not narrowed to 56px —
   * and a control that leaves with the column it closes is a door that locks
   * from the inside. The rail is the only chrome that is always drawn, so the
   * way back lives here, directly under the mark.
   *
   * Absent on a route with no section (`AppShell` passes it only when
   * `sectionFor` resolves one) and in a bench, and the row is not drawn at all
   * then rather than drawn inert — there is nothing to reveal.
   */
  pane?: {
    /** The section's name, for the label: *Show Fitness pages*. */
    label: string;
    collapsed: boolean;
    onToggle: () => void;
  };
  /**
   * THE HOVER PREVIEW, and it is a pair of callbacks rather than state here for
   * the reason every other piece of the pane's geometry is somewhere else: this
   * component renders a 64px column, and what a hover over it opens is a second
   * column it does not own. `AppShell` holds the answer, `panePreview.ts` holds
   * the timing, and the rail only reports what the pointer is on.
   *
   * Absent in a bench and in the portal, where no rail row has pages and the
   * handlers would be wired to nothing.
   */
  onPreview?: (key: RailKey | null) => void;
  onPreviewLeave?: () => void;
}) {
  // Every count here is the trainer's own data, and a trainer with no clients has
  // none of it. Drawing zeroes would be a row of lies about how the product works.
  //
  // The exception this line used to carry is gone with the row it belonged to: the
  // exercise library's 1,324 was true on day one and survived `firstRun`, and the
  // library is now a tab inside Programs rather than a destination. A tab counts
  // itself.
  const shown: RailCounts = firstRun ? {} : counts;

  return (
    /* Every row carries a tip — a component cannot know where the pointer is —
       and `rail--tips` is what hides all of them until one is hovered. */
    <nav className="rail rail--tips" aria-label="Sections">
      <div className="rail__top">
        {/* The mark, not a button. It was one for as long as the rail had a
            state to leave — §05's call that the logo and the escape hatch had to
            be the same 28px square, because the brand row cannot hold both.
            `variant="mark"` drops the wordmark in the MARKUP: one that is
            present and invisible is still read aloud. */}
        <Logo cap={17} variant="mark" className="rail__lk" />
      </div>

      {/* BELOW THE MARK, AND IN ITS OWN ROW RATHER THAN IN THE BRAND ROW.
          §05's note in webapp.css is still true — at 64px the brand row cannot
          hold a 28px mark AND a 32px control — so the control takes the row
          under it, where it is a full `--w-tap` target and centred on the same
          axis as every glyph in the body below. */}
      {pane ? (
        <div className="rail__ctl">
          <button
            className="rail__pc"
            type="button"
            aria-label={pane.collapsed ? `Show ${pane.label} pages` : `Hide ${pane.label} pages`}
            aria-expanded={!pane.collapsed}
            onClick={pane.onToggle}
          >
            <Panel size={17} />
            <span className="rail__tip" role="tooltip">
              {pane.collapsed ? `Show ${pane.label} pages` : `Hide ${pane.label} pages`}
            </span>
          </button>
        </div>
      ) : (
        /* THE SLOT IS KEPT WHEN THERE IS NOTHING TO PUT IN IT. MEASURED at 1440:
           the first destination sat at y=66 on /today and /schedule — no section,
           no switch, no row — and at y=108 on every route that has a pane, so the
           whole column of glyphs jumped 42px on the navigation a trainer makes
           most. A target aimed from memory is the one thing a rail must not move.
           Empty and `aria-hidden`: it is a measurement, not a control. */
        <div className="rail__ctl rail__ctl--idle" aria-hidden="true" />
      )}

      <div className="rail__body">
        <div className="rail__group">
          {destinations.map((d) => (
            <Item
              key={d.key}
              dest={d}
              current={current}
              badge={shown[d.key as keyof RailCounts]}
              onPreview={onPreview}
              onLeave={onPreviewLeave}
            />
          ))}
        </div>

        {!firstRun && pins.length > 0 && (
          <div className="rail__group rail__group--pins">
            <p className="rail__gk">
              TODAY<span>{pins.length}</span>
            </p>
            {pins.map((s, i) => (
              <Pin key={s.id} session={s} index={i} />
            ))}
          </div>
        )}
      </div>

      {/* The foot owns its own `.rail__foot` — it is the menu's positioning
          context (`position:relative` in §04) as well as the button's frame, and
          splitting the two would put the panel's anchor in one file and the panel
          in another. */}
      <AccountMenu
        trainerName={trainerName}
        trainerPhone={trainerPhone}
        rows={accountRows}
        role={accountRole}
      />
    </nav>
  );
}
