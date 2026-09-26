'use client';

import { useEffect } from 'react';
import Link from 'next/link';

import { useDismiss } from '@/lib/ui/dismiss';

import { Calendar, Dumbbell, Grid, Rupee, Users } from './Icons';

/**
 * THE + SHEET — the phone's 3d, on the web's bar.
 *
 * A port of `app/src/screens/main/home/AddSheet.tsx`, including the test that
 * decided its rows: *something a trainer does between sessions, on a phone, and
 * at least three taps deep in every competitor we tore down*. Anything that
 * fails it belongs in the rail or on a client's screen, and the test is still
 * what a sixth row has to pass — the fifth arrived because the product owner's
 * brief for the phone shell named it, and it passes: writing a movement is four
 * taps deep here and behind a desktop-only builder everywhere else.
 *
 * It asks **"What are you doing?"** rather than listing nouns, which is the app's
 * wording and its argument: the + is pressed with an intention already formed, so
 * the sheet's job is to route one, not to offer a menu of objects.
 *
 * ── NO ROW SAYS *SOON* ANY MORE, AND THAT IS FIVE SCREENS ARRIVING ──────────
 *
 * This file used to draw four rows with three of them `<button disabled>` and the
 * word *Soon* beside them, because `/clients/new`, `/money` and `/sessions` were
 * all `NotBuilt`. The argument for marking them was right — "a row that looks
 * live and lands on *not built yet* spends a tap to teach nothing" — and it has
 * expired: every destination the sheet wants now exists. So the rows are `<Link>`s
 * and the `disabled` branch is gone with the last of them.
 *
 * Two of the five needed nothing but the href, and three needed a reader for a
 * parameter that was already the screen's own way in:
 *
 * | Row | Lands on | What made it live |
 * | --- | --- | --- |
 * | Add a client | `/clients/new` | the screen shipped; this row was stale |
 * | Book a session | `/schedule?new=1` | already read by `Schedule.tsx` |
 * | Log a workout | `/sessions/new` | already live |
 * | Add an exercise | `/programs/exercises?new=1` | `ExerciseLibrary` reads it now |
 * | Record a payment | `/business/transactions?record=` | Transactions already reads `?record=<id>` |
 *
 * The last one is the one worth knowing: `?record=` with nothing after it is a
 * STRING, not a missing parameter, so `recordFor` is `''` — truthy enough to open
 * the panel and falsy enough that no client and no pack are seeded. That is the
 * right shape for this caller, because the + is pressed with an amount in mind and
 * not a client: `/clients/[id]` is where a payment starts from a person.
 *
 * ── AND THE ROW SET IS THE PRODUCT OWNER'S THREE, PLUS THE TWO IT HAD ───────
 *
 * The brief for the phone shell asks the + for *clients, sessions, exercises*.
 * Those are the first, second and fourth rows, and the two that were already here
 * are kept rather than cut: *Log a workout* is the app's own first row and the one
 * action a trainer takes on the floor rather than at a desk, and *Record a
 * payment* is the only way into the money book from a screen that is not it.
 *
 * The order is the brief's, with the two floor actions interleaved by when they
 * happen rather than appended: a client is added before they are booked, a booking
 * is logged after it happens, and an exercise is written while a program is being
 * built. Money is last because it is the one that can wait until the shift ends.
 */

export interface AddAction {
  key: 'client' | 'session' | 'workout' | 'exercise' | 'payment';
  icon: React.ReactNode;
  title: string;
  /** The line under it. States what the next screen will ask for. */
  hint: string;
  href: string;
}

export const ADD_ACTIONS: AddAction[] = [
  {
    key: 'client',
    icon: <Users size={19} />,
    title: 'Add a client',
    // The screen's own promise, and it is literal: `NewClient`'s first step asks
    // for a name and a number and nothing else, and every other field on that
    // flow is skippable. A hint that over-promised here would be read at the one
    // moment a trainer has decided to do the thing.
    hint: 'Name and number is enough',
    href: '/clients/new',
  },
  {
    key: 'session',
    icon: <Calendar size={19} />,
    title: 'Book a session',
    hint: 'One-off or repeating',
    // It opens the booking FORM rather than the schedule: `?new=1` is read in
    // `Schedule.tsx`, which calls the same `defaultSlot` its own *New session*
    // button does. Landing on a grid with nothing open would make the + a
    // navigation, and the + is an action.
    href: '/schedule?new=1',
  },
  {
    key: 'workout',
    icon: <Dumbbell size={19} />,
    title: 'Log a workout',
    // The app's own subtitle, minus "or for yourself" — self-training is switched
    // off behind a flag, and the sheet is read at the moment of intent, which is
    // the worst place in the product to promise something the next screen cannot
    // keep.
    hint: 'Booked or not — pick who',
    // The hint was already the promise this route keeps: frame 5a's third group
    // is "everybody else · no booking needed", so "booked or not" is literal
    // rather than aspirational.
    href: '/sessions/new',
  },
  {
    key: 'exercise',
    // `Grid` and not a second `Dumbbell`: the library is a tab of Programs and
    // this is the glyph the *Programs* row carries in the sheet directly behind
    // this one, so the row points at a place a trainer has already seen named.
    // Two identical dumbbells in a five-row sheet would make the two rows a
    // trainer is most likely to confuse — logging a movement and writing one —
    // look like the same action twice.
    icon: <Grid size={19} />,
    title: 'Add an exercise',
    // What the create form actually asks for, in its own order. It is a CUSTOM
    // exercise — the 1,324 in the library are the dataset's and are not editable
    // — and the hint says "your own" so the row cannot be read as a way to
    // correct one of those.
    hint: 'Your own movement, with its steps',
    // `?new=1`, the same parameter name and the same three-part reader as
    // `/schedule` — an initialiser, a render-time adjustment for arriving here
    // from here, and then the parameter is stripped. `ExerciseLibrary` carries
    // the argument; it is one pattern in this app and not two.
    href: '/programs/exercises?new=1',
  },
  {
    key: 'payment',
    icon: <Rupee size={19} />,
    title: 'Record a payment',
    hint: 'UPI, cash or gym-collected',
    // `?record=` with nothing after it — see the docstring. An empty STRING
    // opens the panel with nothing seeded, which is what the + wants: pressed
    // from the bar there is no client in context, and `RecordPanel` asks for one
    // as its first field.
    href: '/business/transactions?record=',
  },
];

export function AddSheet({
  id,
  onClose,
  onReady,
}: {
  id: string;
  onClose: () => void;
  /** See `MoreSheet`'s copy of this prop — the bar's own + has to dismiss too. */
  onReady?: (dismiss: () => void) => void;
}) {
  /* `panel` and the hook's `ref` were two refs on one box. One now: the focus
     call below and the exit both want the same element. */
  const { closing, dismiss, ref: panel } = useDismiss<HTMLDivElement>(onClose);

  useEffect(() => { onReady?.(dismiss); }, [onReady, dismiss]);

  // Escape, and focus into the sheet on the render that created it — the same two
  // obligations `MoreSheet` carries, for the same reason: a modal that keeps focus
  // outside itself is an overlay a keyboard user can tab behind.
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
    panel.current?.querySelector<HTMLElement>('a,button:not([disabled])')?.focus({ preventScroll: true });
    return () => document.removeEventListener('keydown', onKey);
  }, [dismiss, panel]);

  return (
    <>
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

          {/* Five `<Link>`s and no branch. The `<button disabled>` half of this
              map, and the *Soon* tag beside it, went when the last of the five
              screens landed — see the docstring's table. Nothing else about the
              row's markup changed, which is what that pass predicted would
              happen. */}
          <div className="sheet__g sheet__g--first">
            {ADD_ACTIONS.map((a) => (
              <Link key={a.key} className="sheet__i add__i" href={a.href} onClick={onClose}>
                {a.icon}
                <span className="add__l">
                  <b>{a.title}</b>
                  <i>{a.hint}</i>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
