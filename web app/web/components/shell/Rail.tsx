import Link from 'next/link';

import type { DeckSession } from '@/lib/today/deck';
import { avatarToken, initials } from '@/lib/today/time';
import { Check, Mark, Panel } from './Icons';
import {
  PRIMARY, type Destination, type RailBadge, type RailCounts, type RailKey,
} from './nav';
import { AccountMenu } from './AccountMenu';

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
}: {
  dest: Destination;
  current: RailKey;
  badge?: RailBadge;
}) {
  return (
    <Link
      className="rail__i"
      href={dest.href}
      /* The purpose line, as a tooltip rather than a second line of text. Five
         rows with a subtitle each is a menu; five rows with a hover is a rail. */
      title={dest.purpose}
      {...(dest.key === current ? { 'aria-current': 'page' as const } : {})}
    >
      {dest.icon}
      <span>{dest.label}</span>
      <kbd className="rail__k">{dest.accel}</kbd>
      <Badge badge={badge} />
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
      <span
        className="av av--sm"
        style={{ background: `var(${avatarToken(session.clientId)})` }}
        aria-hidden="true"
      >
        {initials(session.clientName)}
      </span>
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
    </Link>
  );
}

export function Rail({
  current,
  trainerName,
  trainerPhone = null,
  counts = {},
  pins = [],
  firstRun = false,
}: {
  current: RailKey;
  trainerName: string;
  /** The number this session signs in with — the foot menu's header prints it so
   *  a trainer with two accounts can tell which one is open. */
  trainerPhone?: string | null;
  counts?: RailCounts;
  /** Today's sessions, in time order. Empty on a day with none. */
  pins?: DeckSession[];
  firstRun?: boolean;
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
    <nav className="rail" aria-label="Sections">
      <div className="rail__top">
        <span className="rail__mark">
          <Mark />
        </span>
        <span className="rail__word">X&nbsp;REP</span>
        {/* Always drawn, never hover-revealed: a control that appears when the
            pointer arrives is a control a keyboard user has to already know
            about. Inert until the collapsed rail is built — see AppShell. */}
        <button
          className="rail__col"
          type="button"
          aria-label="Collapse the rail"
          aria-expanded="true"
          disabled
        >
          <Panel size={17} />
        </button>
      </div>

      <div className="rail__body">
        <div className="rail__group">
          {PRIMARY.map((d) => (
            <Item key={d.key} dest={d} current={current} badge={shown[d.key as keyof RailCounts]} />
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
      <AccountMenu trainerName={trainerName} trainerPhone={trainerPhone} />
    </nav>
  );
}
