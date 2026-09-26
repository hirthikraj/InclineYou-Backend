'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import { Bell } from '@/components/shell/Icons';
import { byDay, longAgo, stampFor } from '@/lib/notifications/copy';

import { Button } from './Button';
import { Chip } from './Chip';
import { EmptyState } from './EmptyState';

/**
 * The notification centre — §03's `.ntf`.
 *
 * A record of what somebody else did, grouped by day, newest first. The design
 * system's own file carries the argument for what belongs in it and why it is a
 * popover rather than a destination; `lib/notifications/types.ts` carries the
 * line between this and Today's attention queue, which is the decision the
 * whole surface rests on.
 *
 * This component decides four things and no more:
 *
 *   · which class combinations are legal — the tone plate, the unread row
 *   · the element — a `next/link` for a row that has somewhere to go, a plain
 *     `<div>` for one that does not, because a dead link is worse than a fact
 *     you cannot click
 *   · what will not compile — `onOpen` and `onMarkAll` are required, so a panel
 *     cannot ship with rows that mark nothing read
 *   · nothing about how any of it looks. That is §03's job.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IT TAKES A VIEW, NOT A `Notification`, AND THAT IS WHAT LET THE CLIENT HAVE
 * A BELL
 *
 * It used to import `KIND_TONE`, `hrefFor`, `lineFor` and `detailFor` from
 * `lib/notifications/` and switch on four trainer kinds. Every one of those is
 * a decision about **whose feed this is**: `payment` means a client paid *you*,
 * `hrefFor` lands on `/clients/{id}/payments`, and the empty state names
 * "changes your team makes". None of it is true on the client half, where the
 * kinds are the five things a trainer did to *you* and the hrefs are `/me/*`.
 *
 * The wrong fix is a second `.ntf` component. `AGENTS.md`'s rule for this
 * folder is that a BEM family is ONE component with parts, and a portal copy
 * would be the same twelve classes in a second file that drifts — the defect
 * the design system exists to prevent, committed by the design system.
 *
 * So the panel lost the four imports and gained `NotificationView`: a row
 * already reduced to a tone, a glyph, a bolded name, the rest of a sentence and
 * somewhere to go. Two adapters build it —
 * `components/shell/notificationViews.tsx` for the trainer and
 * `components/portal/notificationViews.tsx` for the client — and each one lives
 * beside the copy it is made of. What stayed here is everything that is true of
 * a feed whoever is reading it: the grouping, the filter, the arrow keys, the
 * empty states, the horizon and the two shapes a row can take.
 *
 * It is still deliberately a PURE component: it fetches nothing, holds no timer
 * and knows nothing about the shell. `NotificationsHost` owns the state and the
 * open/close, `/library` renders the same import against a fixed list, and
 * neither can drift from the other because there is one file.
 */

/**
 * One row, with every decision about whose feed it is already made.
 *
 * The two things NOT on it are worth naming, because both were and neither
 * should have been:
 *
 *   · **no `kind`.** The panel switched on it to pick a plate and a glyph, and
 *     both are now given. A kind that reached this file would be a fifth place
 *     the union is written down, and the first one that could not compile
 *     against a second half's kinds.
 *   · **no `label`.** The screen-reader sentence is built here, out of the
 *     pieces below plus the row's own read state and age — which is exactly
 *     the information the panel has and the adapter does not, since a row's
 *     read state changes in the browser after the adapter has run.
 */
export interface NotificationView {
  id: string;
  /** The modifier after `.ntf__ic--` — §04's five plate tones. */
  tone: string;
  glyph: React.ReactNode;
  /** Bolded, and the only thing bolded. Null on an event with no person in it. */
  who: string | null;
  /** The rest of the sentence, starting lowercase where `who` leads. */
  said: string;
  /** The second line, or null where the first has said everything. */
  detail: string | null;
  /** Where the row goes. `null` renders a fact rather than a dead link. */
  href: string | null;
  at: number;
  readAt: number | null;
}

export function NotificationPanel({
  notifications,
  /**
   * `Date.now()` from the component that owns the state, passed in rather than
   * read here.
   *
   * Every stamp on this panel is relative — "2 h", "Yesterday" — so reading the
   * clock during render makes the server's HTML and the browser's first paint
   * disagree by however long the request took, which React reports as a
   * hydration mismatch on a row whose text is otherwise identical. One clock,
   * fixed for the life of the open, is also the honest model: the feed does not
   * tick while it is being read.
   */
  now,
  onOpen,
  onMarkAll,
  onClose,
  empty,
  horizon = 'Showing the last three weeks.',
}: {
  notifications: NotificationView[];
  now: number;
  /** A row was followed. Marks it read; the navigation is the link's own. */
  onOpen: (id: string) => void;
  onMarkAll: () => void;
  /** Escape, and the row that navigates away. */
  onClose: () => void;
  /**
   * What an empty feed says, and it is REQUIRED.
   *
   * "Nothing has happened" is true on both halves and the sentence under it is
   * not: a trainer is told about payments and their team, a client about their
   * trainer. A default would be one half's copy quietly serving the other,
   * which on the one surface whose whole job is *there is nothing you missed*
   * is the worst place in the product to be vague.
   *
   * The FILTERED empty state has no prop, deliberately — "nothing unread" says
   * the same thing to everybody, and its body is a statement about the horizon
   * below rather than about the contents.
   */
  empty: { title: string; body: string };
  /**
   * THE HORIZON, STATED. The panel holds everything and there is no screen
   * behind it, which is only an honest promise if "everything" is bounded and
   * the bound is written down. Without this line somebody looking for last
   * month's payment would scroll to the end of the list and conclude it never
   * happened.
   *
   * It has a default because both halves window to twenty-one days today — and
   * it is a prop rather than a constant because the day one of them changes its
   * window, the sentence has to change with it or the panel starts lying.
   */
  horizon?: string;
}) {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const unread = notifications.reduce((n, row) => (row.readAt ? n : n + 1), 0);

  /* The filter is applied before the grouping, so a day whose every row is read
     loses its heading too rather than standing over nothing. */
  const days = useMemo(
    () => byDay(unreadOnly ? notifications.filter((n) => !n.readAt) : notifications, now),
    [notifications, unreadOnly, now],
  );

  /*
   * Escape closes, and the caret comes back with it.
   *
   * The same promise `AccountMenu` makes and for the same reason: the trigger is
   * the last control in the top bar, and a keyboard user who presses Escape
   * inside a panel that then unmounts is returned to the top of the document.
   * The host owns the trigger, so it owns the focus return — this only has to
   * report that the panel is done.
   *
   * Down-arrow and up-arrow walk the rows. They are links in a scrolling list,
   * NOT `role="menu"` items: a menu takes its rows out of the tab sequence,
   * which is right for six commands and wrong for twenty links somebody may
   * want to Tab through. The arrows are a convenience on top of Tab, not a
   * replacement for it.
   */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const rows = [...(box.current?.querySelectorAll<HTMLElement>('.ntf__i') ?? [])];
      if (rows.length === 0) return;
      event.preventDefault();
      const at = rows.indexOf(document.activeElement as HTMLElement);
      const to =
        at < 0 ? 0
        : event.key === 'ArrowDown' ? (at + 1) % rows.length
        : (at - 1 + rows.length) % rows.length;
      rows[to]?.focus();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="ntf" ref={box} role="dialog" aria-label="Notifications">
      <div className="ntf__hd">
        <p className="ntf__t">Notifications</p>
        {/*
          THE BUTTON IS ABSENT WHEN THERE IS NOTHING TO MARK, not disabled.

          A greyed *Mark all read* over an already-read list is a control
          explaining a state the list has already made obvious — and it is the
          only thing in this header, so its absence leaves the title alone on a
          clean bar, which is what "you are up to date" should look like.
        */}
        {unread > 0 && (
          <Button variant="ghost" size="sm" onClick={onMarkAll}>
            Mark all read
          </Button>
        )}
      </div>

      {/*
        The filter is drawn only when it can do something. With nothing unread
        the *Unread* chip leads to an empty list, and with nothing at all both
        chips lead to the same empty list — a control whose two settings give
        the same answer is a control that has nothing to say.
      */}
      {notifications.length > 0 && unread > 0 && (
        <div className="ntf__seg">
          <Chip pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>
            All {notifications.length}
          </Chip>
          <Chip pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>
            Unread {unread}
          </Chip>
        </div>
      )}

      <div className="ntf__list">
        {days.length === 0 ? (
          /*
            TWO EMPTY STATES, BECAUSE THEY ARE TWO DIFFERENT FACTS.

            "Nothing in three weeks" and "nothing you have not already read" are
            not the same news, and a panel that answered both with the same
            sentence would tell somebody who just pressed *Unread* that their
            account is quiet. `kind="filtered"` on the second is what makes a
            screen reader announce it — it appears in response to a click, so
            the rows silently vanish and the reader is left in a blank region.
          */
          unreadOnly ? (
            <EmptyState
              kind="filtered"
              icon={<Bell size={20} />}
              title="Nothing unread"
              body="You have read everything the panel is holding."
            />
          ) : (
            <EmptyState icon={<Bell size={20} />} title={empty.title} body={empty.body} />
          )
        ) : (
          days.map((day) => (
            <section key={day.heading}>
              <h3 className="ntf__day">{day.heading}</h3>
              {day.rows.map((n) => (
                <Row key={n.id} n={n} now={now} onOpen={onOpen} onClose={onClose} />
              ))}
            </section>
          ))
        )}
      </div>

      <p className="ntf__foot">{horizon}</p>
    </div>
  );
}

/**
 * What a screen reader is given for the whole row, in one string.
 *
 * The row is a link whose visible content is a glyph, two fragments of a
 * sentence and an abbreviation — read out in order that is "money, Rohan
 * Sharma, paid ₹9,000, collected at the gym counter, 2 h". The stamp is the
 * problem: "2 h" is not a duration to a screen reader, and "unread" is carried
 * by a coloured dot with no text at all.
 *
 * Built HERE and not in the adapter, because two of its four pieces are things
 * only the panel knows: the row's read state changes in the browser after the
 * adapter has run, and the clock is the one the host fixed when the panel
 * opened.
 */
function labelFor(n: NotificationView, now: number): string {
  return [n.readAt ? null : 'Unread.', [n.who, n.said].filter(Boolean).join(' '), n.detail, longAgo(n.at, now)]
    .filter(Boolean)
    .join(' · ');
}

function Row({
  n,
  now,
  onOpen,
  onClose,
}: {
  n: NotificationView;
  now: number;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const body = (
    <>
      {/* The dot is the only thing in column one, and column one exists whether
          or not the dot does — see §03 on why a read row does not close it. */}
      {n.readAt ? null : <span className="ntf__dot" aria-hidden="true" />}
      <span className={`ntf__ic ntf__ic--${n.tone}`} aria-hidden="true">
        {n.glyph}
      </span>
      <span className="ntf__c">
        <span className="ntf__l">
          {n.who ? <b>{n.who}</b> : null}
          {n.who ? ' ' : null}
          {n.said}
        </span>
        {n.detail ? <span className="ntf__m">{n.detail}</span> : null}
      </span>
      {/* Hidden from the reader, which gets the long form inside the row's own
          label instead — "2 h" is not a duration when it is spoken. */}
      <span className="ntf__w" aria-hidden="true">
        {stampFor(n.at, now)}
      </span>
    </>
  );

  const cls = ['ntf__i', n.readAt ? null : 'ntf__i--unread'].filter(Boolean).join(' ');
  const label = labelFor(n, now);

  /* A row with nowhere to go is not a link and not a button. It is a fact, and
     the panel has no third thing to do with it — making it focusable would put
     a stop in the tab order that answers no key. */
  if (!n.href) {
    return (
      <div className={cls} aria-label={label}>
        {body}
      </div>
    );
  }

  return (
    <Link
      className={cls}
      href={n.href}
      aria-label={label}
      onClick={() => {
        /* Read first, then close. Both are synchronous here — the write is
           fired and not awaited (see `actions.ts`) — so the navigation the
           browser is already committing to is not held up by either. */
        onOpen(n.id);
        onClose();
      }}
    >
      {body}
    </Link>
  );
}
