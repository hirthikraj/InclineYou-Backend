'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';

import { Calendar, Dumbbell, Rupee, Users } from './Icons';

/**
 * THE + SHEET — the phone's 3d, on the web's bar.
 *
 * A port of `app/src/screens/main/home/AddSheet.tsx`, including the test that
 * decided its four rows: *something a trainer does between sessions, on a phone,
 * and at least three taps deep in every competitor we tore down*. Anything that
 * fails it belongs in the rail or on a client's screen, and this sheet has no
 * fifth row for that reason rather than for want of ideas.
 *
 * It asks **"What are you doing?"** rather than listing nouns, which is the app's
 * wording and its argument: the + is pressed with an intention already formed, so
 * the sheet's job is to route one, not to offer a menu of objects.
 *
 * ── WHY THREE ROWS SAY *SOON* ────────────────────────────────────────────────
 *
 * `/clients`, `/clients/new`, `/money` and `/sessions` are all `NotBuilt` on this
 * half. Three of the four actions therefore have nowhere real to land, and there
 * were three ways to handle that: draw one row and call it a sheet, draw four rows
 * that navigate — three of them into a placeholder — or draw four rows and mark
 * which ones are not there yet.
 *
 * The third shipped. A one-row sheet is the thing `NavBar.tsx` names as the reason
 * the client role has no + at all ("a global + would open a sheet with one item in
 * it"), and a row that looks live and lands on *not built yet* spends a tap to
 * teach nothing — the trainer already knows what they wanted. A row marked *Soon*
 * spends no tap and says the same thing, and the sheet's shape is final: when the
 * money book lands, the row stops being a `<button disabled>` and nothing else
 * about this file changes.
 *
 * `disabled` rather than an `aria-disabled` link, deliberately: it leaves the row
 * in the accessibility tree — a reader still finds it and hears it is unavailable
 * — while taking it out of the tab order, so a keyboard walking the sheet lands on
 * the one row that works.
 */

export interface AddAction {
  key: 'workout' | 'session' | 'client' | 'payment';
  icon: React.ReactNode;
  title: string;
  /** The line under it. States what the next screen will ask for. */
  hint: string;
  /** Null until that half of the app exists — see the docstring. */
  href: string | null;
}

export const ADD_ACTIONS: AddAction[] = [
  {
    key: 'workout',
    icon: <Dumbbell size={19} />,
    title: 'Log a workout',
    // The app's own subtitle, minus "or for yourself" — self-training is switched
    // off behind a flag, and the sheet is read at the moment of intent, which is
    // the worst place in the product to promise something the next screen cannot
    // keep.
    hint: 'Booked or not — pick who',
    // Live since the console shipped, and the hint was already the promise this
    // route keeps: frame 5a's third group is "everybody else · no booking
    // needed", so "booked or not" is literal rather than aspirational.
    href: '/sessions/new',
  },
  {
    key: 'session',
    icon: <Calendar size={19} />,
    title: 'Book a session',
    hint: 'One-off or repeating',
    // The only live row, and it opens the booking form rather than the schedule:
    // `?new=1` is read in `Schedule.tsx`, which calls the same `defaultSlot` its
    // own *New session* button does. Landing on a grid with nothing open would
    // make the + a navigation, and the + is an action.
    href: '/schedule?new=1',
  },
  {
    key: 'client',
    icon: <Users size={19} />,
    title: 'Add a client',
    hint: 'Name and number is enough',
    href: null,
  },
  {
    key: 'payment',
    icon: <Rupee size={19} />,
    title: 'Record a payment',
    hint: 'UPI, cash or gym-collected',
    href: null,
  },
];

export function AddSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);

  // Escape, and focus into the sheet on the render that created it — the same two
  // obligations `MoreSheet` carries, for the same reason: a modal that keeps focus
  // outside itself is an overlay a keyboard user can tab behind.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    panel.current?.querySelector<HTMLElement>('a,button:not([disabled])')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <button className="scrim scrim--top" type="button" aria-label="Close" onClick={onClose} />
      <div
        className="sheet"
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        ref={panel}
      >
        <div className="sheet__grip" aria-hidden="true" />
        <div className="sheet__b">
          {/*
            A HEADING, and it is the question rather than the word "Add".
            `MoreSheet` needs no heading because its groups name themselves; this
            sheet is four verbs, and the question is what makes them read as a
            choice between things you are DOING rather than things you are adding.
          */}
          <h2 className="add__q" id={`${id}-t`}>
            What are you doing?
          </h2>

          <div className="sheet__g sheet__g--first">
            {ADD_ACTIONS.map((a) =>
              a.href ? (
                <Link key={a.key} className="sheet__i add__i" href={a.href} onClick={onClose}>
                  {a.icon}
                  <span className="add__l">
                    <b>{a.title}</b>
                    <i>{a.hint}</i>
                  </span>
                </Link>
              ) : (
                <button key={a.key} className="sheet__i add__i" type="button" disabled>
                  {a.icon}
                  <span className="add__l">
                    <b>{a.title}</b>
                    <i>{a.hint}</i>
                  </span>
                  {/* The word, not a tooltip. A trainer who taps and gets nothing
                      learns the app is broken; a row that says Soon before the tap
                      is the only version of this that is honest. */}
                  <span className="tag">Soon</span>
                </button>
              ),
            )}
          </div>
        </div>
      </div>
    </>
  );
}
