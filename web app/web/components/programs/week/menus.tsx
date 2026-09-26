'use client';

import type { Entry } from '@/lib/programs/blueprint';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CopyIcon,
  InfoIcon,
  LinkIcon,
  MoonIcon,
  TrashIcon,
} from '../Icons';

/**
 * ONE VOCABULARY OF ACTIONS, rendered by the board's menus and the phone's
 * sheets alike.
 *
 * The board draws them in a `.menu` beside the row; the phone draws the same
 * list in a bottom sheet, because a 160px dropdown anchored to a row is a
 * dropdown a thumb cannot hit. Same items, same order, same handlers — which is
 * what stops an action existing on one shell and not the other, the failure
 * §13.4 is written against.
 */
export interface DayActions {
  onOpenRow?: (entry: Entry) => void;
  onInfoRow?: (entry: Entry) => void;
  onNudge?: (entry: Entry, direction: -1 | 1) => void;
  onLink?: (entry: Entry) => void;
  onUnlink?: (groupId: string) => void;
  onDuplicateRow?: (entry: Entry) => void;
  onRemoveRow?: (entry: Entry) => void;
  /** Send this row to another day. THE KEYBOARD PATH FOR THE DRAG, and the
   *  reason the drag was allowed to exist: moving a row between days had no
   *  route at all before — *Move up* / *Move down* stop at the day's edge — so
   *  a pointer-only gesture would have been the only way to do it, which is the
   *  trade SC 2.5.7 refuses. Targets are named, so it commits on one click
   *  rather than arming a mode that waits. */
  onMoveRowTo?: (entry: Entry, day: number) => void;
  /** Every day this row could go to, its own excluded by the caller. */
  moveTargets?: number[];
  onRenameDay?: (day: number) => void;
  /** Copy this day's rows onto another slot. A DIRECT action with its target
   *  named, not a mode that waits for a second click somewhere else. */
  onCopyDayTo?: (from: number, to: number) => void;
  /** Every slot a day could be copied onto, including empty ones — copying the
   *  only authored day into a NEW slot is the most useful move there is while
   *  building, and gating it on a second day already existing turns it off in
   *  exactly the state that wants it. */
  copyTargets?: number[];
  onClearDay?: (day: number) => void;
  /**
   * STAND THIS DAY DOWN — the write behind the board's rest cards.
   *
   * It removes the slot from `trainingDays` and touches NOTHING else: the rows
   * stay on the slot, the name stays on the slot, and flipping it back gives
   * the trainer the day they had. That is the whole difference from
   * `onRemoveDay`, which deletes both, and the reason the two are separate
   * items rather than one with a confirm — "mark as rest" is an ordinary weekly
   * decision (three on, four off) and a destructive action wearing an ordinary
   * name is one a trainer only learns about afterwards.
   *
   * Absent when the day is the program's LAST trained one. A program with no
   * training days is a program `daysOf` cannot tell from one authored before
   * the column existed — it would fall back to deriving days from wherever the
   * parked rows sit and hand every one of them back as a training day on the
   * next load. The floor is one.
   */
  onMakeRest?: (day: number) => void;
  onRemoveDay?: (day: number) => void;
}

/**
 * WHETHER THERE IS A MENU TO OPEN AT ALL.
 *
 * Every member of `DayActions` is optional, which is what lets the certified
 * preview reuse this whole vocabulary by simply handing over none of the writes
 * — but an omitted handler removes the ITEM and not the `⋯` that opens the box
 * it would have been in. Read-only, the row's overflow button was a 28px
 * control that opened an empty popup, which is the false affordance §22 already
 * records once for `DayColumn`'s grab cursor, arriving from a third direction.
 *
 * So the two callers ask first. `onInfoRow` counts — *what Barbell Row is* is a
 * question a trainer reading somebody else's program asks more often than one
 * reading their own — and it is the only action that survives read-only, which
 * is why a row can still have a menu when a day cannot.
 */
export function hasRowActions(a: DayActions): boolean {
  return Boolean(
    a.onOpenRow ||
      a.onInfoRow ||
      a.onNudge ||
      a.onLink ||
      a.onUnlink ||
      a.onDuplicateRow ||
      a.onRemoveRow ||
      a.onMoveRowTo,
  );
}

/**
 * THE CONTAINER'S OWN FIVE — law 5's vocabulary, and it is deliberately NOT
 * `DayActions` with more members on it.
 *
 * A row menu and a day menu both act on things a day CONTAINS; this acts on the
 * workout itself, and three of its items have the same words as a row's (*Move
 * up*, *Move down*, *Delete*) with a different subject. Folding them into one
 * interface would mean every caller handing over row handlers also handing over
 * container handlers, and the certified preview — which hands over neither —
 * would be the one place the difference showed.
 */
export interface WorkoutActions {
  /** Reopen the workout dialog on this container's exercises. */
  onEditWorkout?: (workoutId: string) => void;
  /** Arm the paste: every OTHER day then offers to take a copy. A two-step with
   *  its target chosen afterwards, rather than a submenu naming seven slots —
   *  the day a session goes onto is a day the trainer is looking at. */
  onCopyWorkout?: (workoutId: string) => void;
  onNudgeWorkout?: (workoutId: string, direction: -1 | 1) => void;
  onRemoveWorkout?: (workoutId: string) => void;
}

export function hasWorkoutActions(a: WorkoutActions): boolean {
  return Boolean(a.onEditWorkout || a.onCopyWorkout || a.onNudgeWorkout || a.onRemoveWorkout);
}

/**
 * The items, in the order a trainer reaches for them: change it, put it on
 * another day, move it within this one, throw it away.
 *
 * NO CONFIRM ON *Delete*, and that is `removeWorkout` being one write: ⌘Z
 * brings the whole session back, which is a better answer than a dialog asking
 * about something the trainer can see.
 */
export function WorkoutMenuItems({
  workoutId,
  name,
  first,
  last,
  actions,
  close,
}: {
  workoutId: string;
  name: string;
  /** Its position in the day — the two nudges that would do nothing are not
   *  drawn, for `onRemoveDay`'s reason: an item that cannot act is an item a
   *  trainer has to learn to ignore. */
  first: boolean;
  last: boolean;
  actions: WorkoutActions;
  close: () => void;
}) {
  const run = (fn?: (...a: never[]) => void, ...args: unknown[]) =>
    (e: React.MouseEvent) => {
      e.stopPropagation();
      close();
      (fn as ((...a: unknown[]) => void) | undefined)?.(...args);
    };

  return (
    <>
      {actions.onEditWorkout && (
        <button
          className="menu__i"
          role="menuitem"
          type="button"
          onClick={run(actions.onEditWorkout, workoutId)}
        >
          Edit workout
        </button>
      )}
      {actions.onCopyWorkout && (
        <button
          className="menu__i"
          role="menuitem"
          type="button"
          onClick={run(actions.onCopyWorkout, workoutId)}
        >
          <CopyIcon size={13} />
          Copy to day…
        </button>
      )}
      {actions.onNudgeWorkout && (!first || !last) && <div className="menu__sep" />}
      {actions.onNudgeWorkout && !first && (
        <button
          className="menu__i"
          role="menuitem"
          type="button"
          onClick={run(actions.onNudgeWorkout, workoutId, -1)}
        >
          <ArrowUp size={13} />
          Move up
        </button>
      )}
      {actions.onNudgeWorkout && !last && (
        <button
          className="menu__i"
          role="menuitem"
          type="button"
          onClick={run(actions.onNudgeWorkout, workoutId, 1)}
        >
          <ArrowDown size={13} />
          Move down
        </button>
      )}
      {actions.onRemoveWorkout && (
        <>
          <div className="menu__sep" />
          <button
            className="menu__i menu__i--danger"
            role="menuitem"
            type="button"
            onClick={run(actions.onRemoveWorkout, workoutId)}
          >
            <TrashIcon size={13} />
            Delete {name || 'this workout'}
          </button>
        </>
      )}
    </>
  );
}

export function hasDayActions(a: DayActions): boolean {
  return Boolean(
    a.onRenameDay || a.onCopyDayTo || a.onClearDay || a.onMakeRest || a.onRemoveDay,
  );
}

export function RowMenuItems({
  entry,
  name,
  actions,
  close,
}: {
  entry: Entry;
  name: string;
  actions: DayActions;
  close: () => void;
}) {
  const run = (fn?: (...a: never[]) => void, ...args: unknown[]) =>
    (e: React.MouseEvent) => {
      e.stopPropagation();
      close();
      (fn as ((...a: unknown[]) => void) | undefined)?.(...args);
    };

  return (
    <>
      {actions.onOpenRow && (
        <button className="menu__i" role="menuitem" type="button" onClick={run(actions.onOpenRow, entry)}>
          Edit everything on this row
        </button>
      )}
      {actions.onInfoRow && (
        <button className="menu__i" role="menuitem" type="button" onClick={run(actions.onInfoRow, entry)}>
          <InfoIcon size={13} />
          What {name} is
        </button>
      )}
      {/* CONDITIONAL, because a separator is a claim that something follows it.
          With only `onInfoRow` handed over — the certified preview — this was a
          rule under the single item in the menu, drawn as the boundary of a
          group with nothing in it. */}
      {(actions.onLink ||
        actions.onUnlink ||
        actions.onNudge ||
        actions.onMoveRowTo ||
        actions.onDuplicateRow) && <div className="menu__sep" />}
      {entry.groupId && actions.onUnlink ? (
        <button
          className="menu__i"
          role="menuitem"
          type="button"
          onClick={run(actions.onUnlink, entry.groupId)}
        >
          <LinkIcon size={13} />
          Break the superset
        </button>
      ) : (
        actions.onLink && (
          <button className="menu__i" role="menuitem" type="button" onClick={run(actions.onLink, entry)}>
            <LinkIcon size={13} />
            Superset with the next
          </button>
        )
      )}
      {actions.onNudge && (
        <>
          <button
            className="menu__i"
            role="menuitem"
            type="button"
            onClick={run(actions.onNudge, entry, -1)}
          >
            <ArrowUp size={13} />
            Move up
          </button>
          <button
            className="menu__i"
            role="menuitem"
            type="button"
            onClick={run(actions.onNudge, entry, 1)}
          >
            <ArrowDown size={13} />
            Move down
          </button>
        </>
      )}
      {actions.onMoveRowTo && (actions.moveTargets ?? []).filter(t => t !== entry.day).length > 0 && (
        <>
          <div className="menu__why">Move to…</div>
          {(actions.moveTargets ?? [])
            .filter(t => t !== entry.day)
            .map(t => (
              <button
                key={t}
                className="menu__i"
                role="menuitem"
                type="button"
                onClick={run(actions.onMoveRowTo, entry, t)}
              >
                <ArrowRight size={13} />
                Day {t}
              </button>
            ))}
        </>
      )}
      {actions.onDuplicateRow && (
        <button
          className="menu__i"
          role="menuitem"
          type="button"
          onClick={run(actions.onDuplicateRow, entry)}
        >
          <CopyIcon size={13} />
          Duplicate
        </button>
      )}
      {actions.onRemoveRow && (
        <>
          <div className="menu__sep" />
          <button
            className="menu__i menu__i--danger"
            role="menuitem"
            type="button"
            onClick={run(actions.onRemoveRow, entry)}
          >
            <TrashIcon size={13} />
            Remove
          </button>
        </>
      )}
    </>
  );
}

export function DayMenuItems({
  day,
  actions,
  close,
}: {
  day: number;
  actions: DayActions;
  close: () => void;
}) {
  const run = (fn?: (d: number) => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    close();
    fn?.(day);
  };

  return (
    <>
      {actions.onRenameDay && (
        <button className="menu__i" role="menuitem" type="button" onClick={run(actions.onRenameDay)}>
          Name this day
        </button>
      )}
      {actions.onCopyDayTo && (actions.copyTargets ?? []).filter(t => t !== day).length > 0 && (
        <>
          <div className="menu__why">Copy this day to…</div>
          {(actions.copyTargets ?? [])
            .filter(t => t !== day)
            .map(t => (
              <button
                key={t}
                className="menu__i"
                role="menuitem"
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  close();
                  actions.onCopyDayTo?.(day, t);
                }}
              >
                <CopyIcon size={13} />
                Day {t}
              </button>
            ))}
        </>
      )}
      {(actions.onClearDay || actions.onMakeRest || actions.onRemoveDay) && (
        <div className="menu__sep" />
      )}
      {/* ABOVE THE DANGER PAIR AND NOT IN IT. Marking a day as rest throws
          nothing away — it is the constructive half of this group, and drawn in
          red beside *Clear every exercise* it would read as the destructive one
          a trainer skips. */}
      {actions.onMakeRest && (
        <button className="menu__i" role="menuitem" type="button" onClick={run(actions.onMakeRest)}>
          <MoonIcon size={13} />
          Mark as rest day
        </button>
      )}
      {actions.onClearDay && (
        <button
          className="menu__i menu__i--danger"
          role="menuitem"
          type="button"
          onClick={run(actions.onClearDay)}
        >
          Clear every exercise
        </button>
      )}
      {actions.onRemoveDay && (
        <button
          className="menu__i menu__i--danger"
          role="menuitem"
          type="button"
          onClick={run(actions.onRemoveDay)}
        >
          <TrashIcon size={13} />
          Remove this day
        </button>
      )}
    </>
  );
}
