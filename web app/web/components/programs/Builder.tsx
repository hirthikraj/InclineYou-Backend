'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

import type { AssignmentWire, ClientWire, ExerciseNameWire, TemplateWire } from '@/lib/programs/api';
import type { ExerciseWire } from '@/lib/exercises/api';
import { balance, placementOf } from '@/lib/programs/balance';
import { prescribeFor } from '@/lib/programs/prescribe';
import { withField, type NumField } from '@/lib/programs/weeksheet';
import { ExerciseInfoPanel, type ProgramContext } from './ExerciseInfo';
import { WeekBoard } from './week/WeekBoard';
import { PhoneProgram } from './week/PhoneProgram';
import { assignTemplate, duplicateTemplate, removeTemplate, saveTemplate } from '@/lib/programs/actions';
import { useBlueprintDraft, patchOf, type SaveState } from '@/lib/programs/draft';
import { entriesFromWorkout, exerciseIdsOf, workoutWireOf } from '@/lib/programs/fromWorkout';
import { fromWire as draftFromWire, toWire as workoutToWire, type Draft } from '@/lib/workouts/draft';
import { fetchExercise } from '@/lib/exercises/actions';
import type { WorkoutTemplateWire } from '@/lib/workouts/api';
import { useDayReflow } from '@/lib/programs/reflow';
import { diffPlans, type DiffRow } from '@/lib/programs/diff';
import { useToast } from '@/lib/toast/store';
import {
  addEntries,
  applyProgression,
  duplicateTargets,
  duplicateWeek,
  authoredWeeks,
  copyDay,
  copyWeek,
  copyWorkoutTo,
  effectiveWeek,
  entriesFor,
  hostWorkout,
  linkWithNext,
  moveEntries,
  moveWorkout,
  newUid,
  nudgeWorkout,
  nudge,
  ordinalDayWord,
  overloadLine,
  ownWeek,
  reindex,
  relativeDay,
  removeEntries,
  removeWorkout,
  repeatLine,
  replaceWorkout,
  shapeParts,
  unlinkGroup,
  updateEntry,
  workoutAt,
  type Entry,
  type ProgressionStep,
} from '@/lib/programs/blueprint';
import { AssignPanel } from './AssignPanel';
import { AssignedList } from './AssignedList';
import { CloseIcon, CopyIcon, DotsIcon, PlusIcon, UsersIcon } from './Icons';
import { LibraryPanel, type Prescription } from './LibraryPanel';
import { WorkoutBuilder } from './workout/WorkoutBuilder';
import { LibraryDock } from './week/LibraryDock';
import { ProgressionPanel } from './ProgressionPanel';
import { DuplicateWeekPanel } from './DuplicateWeekPanel';
import { RowPanel } from './RowPanel';
import { Button } from '@/web-components/ui/Button';
import { Chip } from '@/web-components/ui/Chip';
import { Crumbs } from '@/web-components/ui/Crumbs';

/**
 * THE BUILDER — Program → Week → Day → Exercise → Sets, on one plane.
 *
 * Every day of the week is a column, so a mistake in Day 3 is caught while
 * editing Day 1 — which is what the phone's three levels of push cannot do and
 * the whole reason this screen exists on a desk.
 *
 * ── IT OWNS THE PAGE, AND THERE IS NO LIST BESIDE IT ─────────────────────────
 *
 * The plane takes the whole width: 400px of program shelf beside the board is
 * 400px spent on a list nobody is reading while they edit. `/programs` is the
 * list, the section pane is the way back to it, and the phone keeps its sheet
 * behind the program's name. Everything the header says belongs to the DRAFT —
 * the day and week counts as edited, the save state, the actions — so the
 * builder renders the header rather than a parent guessing at it.
 *
 * ── THE DRAFT AUTOSAVES; THERE IS NO SAVE BUTTON ─────────────────────────────
 *
 * The design set says so — *"adding, removing and reordering are local writes,
 * and the sync pill in the top bar is what answers 'is this safe yet'"* — and
 * this half has no sync pill, because it has no queue: the web app is
 * online-only. So the equivalent honest thing is an autosave with the status
 * said in the header, and a retry when it fails.
 *
 * It is debounced rather than per-keystroke because `template.structure` is one
 * jsonb column: there is no row to PATCH, so every save rewrites the whole
 * blueprint.
 *
 * The ROW PANEL keeps its explicit Save, which the design also draws and gives
 * the reason for: rewriting an entry's numbers is a different act from moving
 * one. It commits into the draft; the draft is what reaches the server.
 *
 * ── AND THE UNDO STACK IS REAL ───────────────────────────────────────────────
 *
 * The design's *still open · 01* is "the undo stack itself — specified at 20
 * steps and drawn here at one." Twenty here, because every write on this screen
 * is a pure function from one entry list to another, so the stack is a stack of
 * arrays and costs nothing to keep.
 */

type Panel =
  | { kind: 'row'; uid: string }
  | { kind: 'exinfo'; uid: string }
  | { kind: 'library'; week: number; day: number }
  | { kind: 'progression' }
  | { kind: 'duplicate' }
  | { kind: 'assign' }
  | { kind: 'assigned' }
  | null;

/** The row density the strip's *Compact / Full* pair sets. */
export type Detail = 'compact' | 'full';

export function Builder({
  template,
  assignments,
  clients,
  names: serverNames,
  switcher,
  switcherOpen = false,
}: {
  template: TemplateWire;
  assignments: AssignmentWire[];
  clients: ClientWire[];
  names: Record<string, ExerciseNameWire>;
  /** The shelf, as a bottom sheet behind the program's name — the phone's whole
   *  answer to the other programs. `ProgramSwitcher` carries the argument.
   *  Opaque here: this component renders it and does not own it. */
  switcher?: React.ReactNode;
  /** Whether that sheet is open — the one thing this component needs to know
   *  about a node it does not own, because `PhoneProgram`'s Escape ladder
   *  stands down on `covered` and only this component sets it. Raised through
   *  `Programs.tsx`, which builds the switcher. */
  switcherOpen?: boolean;
  /* `shelfCount` and `certifiedCount` were here for the tab strip's two counts
     and left with it — the strip was section navigation and is now the pane
     beside the rail, which counts nothing. A count belongs next to the thing it
     is counting, and neither number was ever about the program on this screen. */
}) {
  const router = useRouter();
  const { show } = useToast();
  /* ── the view ── */
  const [week, setWeek] = useState(1);
  /**
   * WHICH AXIS THE BOARD IS LAID ON — *Week* or *Day*.
   *
   * Week is the board this screen shipped with: one week, every day of it, and
   * it is the right default because writing a program is writing a week.
   * READING one is a different act. *Is the bench going up* is a question about
   * Day 1 of week 1 next to Day 1 of week 8, and on the week axis the only way
   * to ask it is to step the week strip and hold six numbers in your head —
   * which is a recall task where a recognition one is available.
   *
   * So the day axis is the same board transposed: one day, every week of it,
   * cards left to right. `WeekBoard`'s `axis` prop carries the rest, including
   * why one card renderer draws both and why every card on it may be written
   * in — `week` is still the week the writes land in, but on that axis it is
   * set by the card the trainer reaches for rather than by a strip.
   *
   * VIEW STATE, like `detail` — it changes what is on the board and nothing
   * about the draft, so it is not in the URL (trap 25: the URL carries what is
   * FETCHED) and it does not survive a reload. The week it is pointed at does
   * survive the switch, which is the thing that actually matters: step to week
   * 4 on the week axis, switch to Day, and week 4 is still the one a write
   * without a gesture behind it would land in.
   */
  const [axis, setAxis] = useState<'week' | 'day'>('week');
  /** Which day the day axis is showing. A SLOT, not a weekday — law 1. */
  const [focusDay, setFocusDay] = useState(1);
  /** The block a pointer is carrying — its head row's uid. Held here rather
   *  than in the column, because a drag that starts in Day 1 is a drop in
   *  Day 3 and both columns have to know about it. */
  /* ── the week sheet's own view state ── */
  /** The dock's target — a DAY and, since law 5, the container on it the rows
   *  land in. `workoutId` is null only on a board that predates the containers
   *  reaching it (a client's own copy), where `addOne` falls back to the day's
   *  last workout. */
  const [library, setLibrary] = useState<{ day: number; workoutId: string | null } | null>(null);
  /** THE DAY THE WORKOUT DIALOG IS WRITING, if it is open. One number rather
   *  than a `{day}` record, because unlike the dock there is nothing else about
   *  the surface to hold — it is `aria-modal` over the frame and the board
   *  behind it is not a drop target while it is up. */
  const [workoutDay, setWorkoutDay] = useState<number | null>(null);
  /** The container *Edit workout* is rewriting, with the draft the dialog opens
   *  on. Held as a pair so the save knows which container to put the session
   *  back into — the dialog itself is told nothing about the day. */
  const [editing, setEditing] = useState<{ workoutId: string; initial: Draft } | null>(null);
  /**
   * THE SESSION ON THE CLIPBOARD — *Copy to day…*, armed.
   *
   * A two-step with the target chosen by looking at the board, rather than a
   * submenu naming seven slots: the day a session goes onto is a day the
   * trainer is looking at, and `DAY 5` in a dropdown is a number they have to
   * translate back into the card they meant. It also survives changing WEEK,
   * which a submenu could not offer at all — copy Monday's session in week 1,
   * step to week 3, paste it there.
   */
  const [copied, setCopied] = useState<{
    workoutId: string;
    name: string;
    day: number;
    week: number;
  } | null>(
    null,
  );
  /** THE MOVEMENT A POINTER IS CARRYING, out of the library and towards a day.
   *  `WeekBoard` held this while the dock was one of its children; the dock is
   *  a drawer beside the whole builder now, so the two ends of that drag are in
   *  different subtrees and the record belongs to the one thing above both. */
  const [carrying, setCarrying] = useState<ExerciseWire | null>(null);
  /* HOW MUCH OF EACH ROW TO DRAW. View state and nothing else — Full adds a
     second line to a row and never moves one, which is why it is one attribute
     on the plane rather than a branch in the renderer. Compact is the default
     because the thing a trainer scans a day for is its blocks and their
     prescriptions, and muscle · equipment · level doubles the height of that
     scan to say what the exercise page already says. */
  const [detail, setDetail] = useState<Detail>('compact');
  /* WHAT THE SERVER HAS NOT BEEN ASKED ABOUT YET.
     `names` is fetched for the exercises the template ALREADY uses, so a
     movement added from the library is a row the board cannot name and the
     balance cannot count — it read *Exercise not in your library* and left the
     muscle group's total where it was, on the exercise the trainer had just
     chosen. The old screen hid this behind the reload after every autosave;
     that reload is gone (see the self-save note above), and relying on a round
     trip to learn a name we were handed in the click is the wrong shape anyway.
     The dock hands over the whole row, so it is merged in here and the next
     genuine reload supersedes it. */
  const [added, setAdded] = useState<Record<string, ExerciseNameWire>>({});
  const [panel, setPanel] = useState<Panel>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  /** The trainer has read the push prompt and said not now. Per sitting, and
   *  per program — it is dismissed by identity below, not by a boolean, so
   *  opening a second program does not inherit the first one's dismissal. */
  const [pushHidden, setPushHidden] = useState<string | null>(null);

  /* ── A BOARD THAT RE-PLACES ITSELF, ANIMATED ───────────────────────────────
     The scoped view transition, the `flushSync`, the `html.vt-days` window and
     the before-paint reveal are all `lib/programs/reflow.ts` now, because
     `/clients/:id/program/:pid` draws the identical board and shipped without
     any of it — the cards teleported there exactly as they teleported here
     before this was written. `plane` goes on `.pgw`. */
  const { plane, reflow, armed: vtArmed } = useDayReflow({
    libraryDay: library?.day ?? null,
  });

  /* ── THE DRAFT ─────────────────────────────────────────────────────────────
     Twenty-deep undo, one write funnel, a debounced autosave and its
     `beforeunload`, and the rule for adopting a version the server has that
     this draft does not. All of it is `lib/programs/draft.ts` now, because
     `/clients/:id/program/:pid` edits the client's COPY with the identical
     machinery pointed at the other table — see that file's header for what is
     shared and what deliberately is not.

     `onAdopt` is the shell's half: when a genuinely newer version arrives (a
     second tab, or a push that rewrote this blueprint) the row a panel was
     editing may not exist any more, so whatever is open closes. */
  /* THE VERSION THE NEXT SAVE CARRIES as `If-Match` (R46/R82). Each save returns
     the new one; a fresh server render (another tab, a revalidate) replaces it. */
  const version = useRef(template.version);
  const seenVersion = useRef(template.version);
  if (seenVersion.current !== template.version) {
    seenVersion.current = template.version;
    version.current = template.version;
  }

  const {
    entries,
    labels,
    days,
    weeks,
    commit,
    undo,
    undoDepth,
    setLabels,
    setDays,
    setWeeks,
    save,
    saveError,
    savedAt,
    flush,
  } = useBlueprintDraft({
    source: template,
    save: async patch => {
      const result = await saveTemplate(template.id, version.current, patch);
      if (!result.ok) return result;
      version.current = result.value.version;
      return { ok: true, value: null };
    },
    onAdopt: () => {
      setLibrary(null);
      setPanel(null);
    },
  });

  /* ── keyboard ── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (e.key === 'Escape') {
        /* THE LADDER, and it is shorter than it was: the old board's *moving*
           mode and multi-select are gone with the columns, and copy-a-day is a
           direct menu action rather than a mode that waits. What is left spends
           one rung per press, and every surface that owns an inner step (the
           library dock, a menu, the phone's levels) consumes Escape in CAPTURE
           so it never reaches this and closes two things at once.

           THE HEADER MENU IS THE FIRST RUNG, and it was missing from the ladder
           entirely — a surface this component owns, opens over everything else,
           and had no key that closed it. Survivable while it was a dropdown a
           click outside dismissed; not once it is a bottom sheet over a scrim
           below 900px, where every other sheet on this screen answers Escape.
           It goes first because it is the last thing opened and the topmost
           thing drawn. */
        /* THE DIALOG OWNS THE KEY WHILE IT IS UP. `ModalHost` closes it, and
           this listener spending a rung on the same press would take the day
           open behind the scrim down with it — trap 49, one press one rung. */
        if (workoutDay != null || editing) return;
        if (menu) setMenu(false);
        else if (copied) setCopied(null);
        else if (library) setLibrary(null);
        else if (panel) setPanel(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, panel, library, menu, workoutDay, editing, copied]);

  /* ── WHAT THIS SITTING CHANGED, AND WHO IS DOWNSTREAM OF IT ────────────────
     The prompt's two figures, and both of them are subtle enough to be worth
     stating.

     The BASELINE is frozen at mount and never re-read. `template` refreshes
     after every autosave — that is what keeps the shelf's *edited 2m ago*
     honest — so diffing the draft against the live prop would answer *what have
     you changed since your last keystroke*, which is nothing, always. What a
     trainer means by "I edited this plan" is the whole sitting.

     And it is NOT the same question as `behindTemplate`. That is a per-copy
     clock comparison and it is true of a client who was assigned six months ago
     and never resynced, whether or not anybody has touched the blueprint today.
     This prompt is about an edit the trainer has just made. */
  const [baseline, setBaseline] = useState(() => snapshotOf(template));
  /* ADJUSTED DURING RENDER when another program is opened, which is React's own
     documented pattern for deriving state from a changed prop — `Schedule.tsx`
     uses it for `?new=1` and records why an effect is wrong here: an effect
     would paint one frame of the new program diffed against the old one's rows,
     and every row would read as changed. */
  if (baseline.id !== template.id) {
    setBaseline(snapshotOf(template));
    setPushHidden(null);
  }

  const sessionDiff = useMemo(() => {
    const mine = patchOf(entries, labels, days, weeks);
    return diffPlans({
      base: baseline.exercises as DiffRow[],
      copy: (mine.exercises ?? []) as DiffRow[],
      baseShape: {
        weeks: baseline.weeks,
        trainingDays: baseline.trainingDays,
        dayLabels: baseline.dayLabels,
      },
      copyShape: { weeks, trainingDays: days, dayLabels: labels },
    });
  }, [baseline, entries, labels, days, weeks]);

  const liveCount = assignments.filter(a => a.status === 'active').length;
  /* SHOWN ONLY WHEN ALL THREE ARE TRUE: somebody is on this, this sitting
     changed something, and the trainer has not said not now. Never while the
     draft is still dirty — offering to send a version the server does not have
     yet is offering to send the previous one. */
  const showPush =
    liveCount > 0 &&
    sessionDiff.total > 0 &&
    save === 'clean' &&
    pushHidden !== template.id &&
    panel?.kind !== 'assigned';

  /* ── derived ── */
  const shown = effectiveWeek(entries, week);
  const sourceWeek = shown.repeat ? 1 : week;

  /**
   * THE DAY THE DAY AXIS IS ON, and it is DERIVED rather than corrected.
   *
   * `focusDay` is a slot the trainer picked and slots come and go: marking Day
   * 3 as rest while looking at it would leave the board pointed at a day the
   * program no longer trains. An effect that wrote `focusDay` back would be
   * trap 21 (no `setState` in an effect to sync a prop); adjusting during
   * render would forget which day they had picked the moment it came back. A
   * read is both — the board falls to the first trained day while the picked
   * one is gone, and returns to it if the trainer makes that slot a workout
   * again.
   */
  const dayShown = days.includes(focusDay) ? focusDay : days[0] ?? 1;

  /**
   * WHAT IS ON THAT DAY IN WEEK `w` — one lane of the day board.
   *
   * LAW 3 IS RESOLVED HERE and not in the board: a week with nothing of its own
   * is holding week 1's rows, so the rows have to be read out of week 1 while
   * the card still says the week is a repeat. `WeekBoard` is handed the answer
   * and neither axis has to know the law twice.
   */
  const weekOfDay = useCallback(
    (w: number) => {
      const eff = effectiveWeek(entries, w);
      return { rows: entriesFor(eff.rows, eff.repeat ? 1 : w, dayShown), repeat: eff.repeat };
    },
    [entries, dayShown],
  );

  const selected = useMemo(
    () => (panel?.kind === 'row' ? entries.find(e => e.uid === panel.uid) ?? null : null),
    [panel, entries],
  );

  /** The server's names plus anything added since — one map, so no reader has
   *  to know which half a given exercise came from. */
  const names = useMemo(() => ({ ...serverNames, ...added }), [serverNames, added]);

  /* ── what the week asks of each muscle group ──────────────────────────────
     Computed here rather than inside the panel so that every reader of it —
     the exercise panel today, a balance panel next — is looking at ONE figure.
     Over `shown.rows` and `sourceWeek`, because a repeating week is week 1's
     rows and its balance is week 1's balance (law 3). */
  const weekBalance = useMemo(
    () => balance(shown.rows, days, sourceWeek, names),
    [shown.rows, days, sourceWeek, names],
  );

  const dayName = useCallback(
    (day: number) => {
      const label = labels[String(day)];
      return label ? `Day ${day} · ${label}` : `Day ${day}`;
    },
    [labels],
  );

  /**
   * The third section of the exercise panel, for whichever exercise it is on.
   *
   * TAKES THE EXERCISE, NOT ITS ID. `names` holds only the exercises this
   * template already uses, so looking the group up there works for a row in a
   * column and returns NOTHING for a library row — which is the case the panel
   * exists for. FOUND BY RENDERING: every exercise a trainer had not yet added
   * reported *Chest is 0 sets this week* under a day carrying seven, silently,
   * on the one section that is supposed to be the reason to open the panel.
   *
   * `ExerciseWire` and `ExerciseNameWire` both satisfy this shape, so the
   * library passes the row it already has and a column passes the name it has.
   */
  const contextFor = useCallback(
    (
      exercise: { id: string; muscleGroup: string | null; movementPattern: string | null },
      note?: string | null,
      noteDay?: number,
    ): ProgramContext => {
      const where = placementOf(shown.rows, days, sourceWeek, exercise.id);
      return {
        week,
        dayName,
        onDays: where.days,
        ownSets: where.sets,
        muscleSets: exercise.muscleGroup ? weekBalance.muscle[exercise.muscleGroup] ?? 0 : 0,
        patternSets: exercise.movementPattern
          ? weekBalance.pattern[exercise.movementPattern] ?? 0
          : 0,
        note: note ?? null,
        noteDay,
      };
    },
    [shown.rows, days, sourceWeek, week, dayName, weekBalance],
  );

  const ALL_SLOTS = [1, 2, 3, 4, 5, 6, 7];
  /* THE SLOTS THIS PROGRAM RESTS ON. The desk board draws a card for each of
     them; the phone still offers them as *+ Add a day* chips, which is the same
     write under a smaller shell. */
  const freeSlots = ALL_SLOTS.filter(s => !days.includes(s));

  /**
   * ONE NUMBER, WRITTEN TO ONE ROW.
   *
   * The prototype writes a typed number as a delta across every week, because
   * it GENERATES weeks 2–8 from a progression rule and a flat write would
   * silently flatten the ladder. This model has no generated weeks — law 3 says
   * a week with nothing of its own repeats week 1, and every other week is rows
   * somebody actually wrote — so a number typed against week 3 belongs to week
   * 3's row and to nothing else. Porting the delta would have made every edit
   * reach seven weeks the trainer could not see. `lib/programs/weeksheet.ts`
   * carries the argument at the call site.
   */
  /**
   * ── WRITE INTO THE WEEK ON SCREEN, WHOEVER WROTE IT ──────────────────────
   *
   * Every entry write on this screen goes through here, and what it adds is one
   * line: a week that has nothing of its own becomes its own the instant
   * somebody writes in it. `ownWeek` carries the whole argument — law 3 stays a
   * STORAGE rule and stops being a permission, so weeks 2–8 are edited exactly
   * the way week 1 is and the *Make this week its own* step that used to stand
   * between them is gone.
   *
   * `id` translates whatever id the click was carrying. The rows on screen on a
   * repeating week are week 1's, so the uid under the pointer, the container
   * behind the menu and the group being unlinked all name week 1's copy — and a
   * write that used them unchanged would edit the week the trainer is NOT
   * looking at, silently, which is the one outcome worse than the old gate. It
   * is the identity function on every authored week, so each write site reads
   * the same whichever week it is on.
   *
   * NOT every write: `copyWeekTo`, `repeatWeek`, `applyProgression` and
   * `onRemoveDay` are writes ABOUT weeks rather than writes INTO one, and
   * materialising for them would be the copy the trainer is asking not to make.
   */
  function commitOwn(fn: (prev: Entry[], id: (x: string) => string) => Entry[]) {
    commit(prev => {
      const own = ownWeek(prev, week);
      return fn(own.entries, own.id);
    });
  }

  function setField(entry: Entry, field: NumField, value: number) {
    /* NOT THROUGH `commitOwn`, AND THIS IS THE ONE WRITE THAT MUST NOT BE.
       A blur with the same number in the box is a call that changes nothing,
       and `commit` drops it — which is what keeps an undo step and an autosave
       off a caret that only passed through. Materialised first, "nothing
       changed" would still be a changed array: tabbing across a repeating
       week's four cells would author the week without altering a figure. So
       the copy is made, the write is tried against it, and the ORIGINAL draft
       is returned when it came to nothing. */
    commit(prev => {
      const own = ownWeek(prev, week);
      const uid = own.id(entry.uid);
      const next = own.entries.map(e => (e.uid === uid ? withField(e, field, value) : e));
      return next.some((e, i) => e !== own.entries[i]) ? next : prev;
    });
  }

  /**
   * THE NAME OVERLAY, and both add paths owe it.
   *
   * `names` is fetched for the exercises the blueprint already uses, so an
   * exercise arriving from the library is one `names` has never heard of — and
   * a row whose name is missing reads *Exercise not in your library* and counts
   * for nothing in `balance()`. The dock learned this; `addBatch` did not, and
   * shipped without it for as long as it was unreachable. One helper, so the
   * two paths cannot disagree again.
   *
   * It returns the SAME object when every exercise is already known, so a
   * movement re-added to a second day costs no render.
   */
  function remember(exercises: ExerciseWire[]) {
    setAdded(prev => {
      const fresh = exercises.filter(ex => !prev[ex.id]);
      if (fresh.length === 0) return prev;
      const next = { ...prev };
      for (const ex of fresh) {
        next[ex.id] = {
          id: ex.id,
          name: ex.name,
          muscleGroup: ex.muscleGroup,
          bodyPart: ex.bodyPart,
          target: ex.target,
          equipment: ex.equipment,
          movementPattern: ex.movementPattern,
          level: ex.level,
          isCustom: ex.isCustom,
        };
      }
      return next;
    });
  }

  /**
   * The dock adds ONE, on one click — the day beside it is the review.
   *
   * `before` is the block it lands ABOVE, or null for the tail. A CLICK always
   * passes null, because the dock is beside the board and not over any
   * particular gap in it; a DRAG passes wherever it was let go, since by then
   * the trainer has aimed at one. Same write either way.
   */
  function addOne(
    day: number,
    exercise: ExerciseWire,
    before: string | null = null,
    workoutId?: string,
  ) {
    remember([exercise]);
    /* WHICH CONTAINER IT JOINS — law 5, and the answer is *the one it was aimed
       at*. A click in a workout's own `+` says so outright; a drag says it by
       where it was let go, so the row adopts the container of the block it
       landed above, or the day's last container at the tail. A day with no
       container at all — every row deleted, or a slot just made a training day
       — mints one rather than refusing the drop: a gesture that does nothing
       and says nothing is the worse answer, and the container it makes is the
       unnamed one the card draws under the day's own name. */
    /* WHAT IT ARRIVES AS, from the movement rather than from one constant.
       `3 × 10 · 60s` was exactly right for 2 of the 131 prescriptions written
       by hand in the specs, and it wrote `reps` for a PLANK. `prescribe.ts`
       carries the derivation and the caveat. */
    const rx = prescribeFor(exercise);
    /* THE LANE IS READ AFTER THE WEEK IS MADE ITS OWN, and not from `entries`
       above it. On a week that has just materialised, `entries` is the draft as
       it was a moment ago — the day this row is landing on holds week 1's rows
       in that array and this week's in the one the write is building, and an
       order computed from the first lands the row among rows that are about to
       be replaced. */
    commitOwn((prev, id) => {
      const lane = entriesFor(prev, week, day);
      /* `order - 0.5` lands it above its target and `reindex` — which
         `addEntries` runs — makes the halves whole again. The same trick
         `duplicateRow` uses to put a copy directly under its original, rather
         than a second write that renumbers the day. */
      const above = before === null ? null : lane.find(e => e.uid === id(before));
      const order = above ? above.order - 0.5 : Math.max(-1, ...lane.map(e => e.order)) + 1;
      const host = workoutId
        ? {
            workoutId: id(workoutId),
            workoutName:
              lane.find(e => e.workoutId === id(workoutId))?.workoutName ?? null,
          }
        : hostWorkout(lane, above);
      return addEntries(prev, [
        {
          uid: newUid(),
          exerciseId: exercise.id,
          day,
          week,
          order,
          sets: rx.sets,
          reps: rx.reps,
          durationSeconds: rx.durationSeconds,
          restSeconds: rx.restSeconds,
          targetLoad: null,
          tempo: null,
          notes: null,
          altExerciseId: null,
          groupId: null,
          workoutId: host.workoutId,
          workoutName: host.workoutName,
          setDetail: null,
        },
      ]);
    });
  }

  function addDay(slot: number) {
    if (days.includes(slot)) return;
    const next = [...days, slot].sort((a, b) => a - b);
    setDays(next);
    setLabels(prev => ({ ...prev, [String(slot)]: prev[String(slot)] ?? '' }));
  }

  /**
   * STAND A DAY DOWN — `addDay`'s inverse, and it is NOT `onRemoveDay`.
   *
   * The whole write is one line of shape: the slot leaves `trainingDays` and
   * everything else stays exactly where it is. The rows keep their `day`, so
   * `entriesFor(rows, week, slot)` still finds them and the rest card can say
   * how many are parked; the label keeps its key, so the day comes back called
   * what it was called. `onRemoveDay` deletes both and reindexes, which is the
   * right thing for *Remove this day* and the wrong thing for *three on, four
   * off* — a trainer laying out a week should not pay for the layout with six
   * prescriptions.
   *
   * NOT THROUGH `commit`, because commit is the ENTRY stack and no entry
   * changed. `setDays` marks the draft dirty on its own — see `draft.ts` — so
   * this autosaves like every other shape write. The trade is that ⌘Z does not
   * take it back; the card that appears in its place is one click from undoing
   * it, which is a better undo than a keystroke the trainer has to know about.
   *
   * The caller guards the floor of one — see `onMakeRest` on `DayActions`.
   */
  function markRest(slot: number) {
    if (!days.includes(slot) || days.length <= 1) return;
    setDays(prev => prev.filter(d => d !== slot));
    /* WHAT WAS OPEN OVER IT HAS TO CLOSE. The library dock is addressed BY DAY
       and a rest slot cannot take a row — left open, its header would read
       *ADDING TO DAY 4* over a card with nowhere to put one. */
    if (library?.day === slot) setLibrary(null);
  }

  /* ── THE WEEK'S WRITES, IN ONE PLACE ──────────────────────────────────────
     `rowActions` below has been the reason a row action cannot exist on one
     shell and not the other since the phone shipped. The WEEK's actions had no
     such object: *Add a week* and *Progression* were closures typed inline into
     `Toolbar`'s props, and `Toolbar` is `display:none` below 900px — so the two
     capabilities lived in the one place a phone could never reach them, and
     nothing in the tree said so. Named here, both shells are handed the same
     four functions and the next one added is handed to both by default. */

  /** The 52-week ceiling is the model's, not the control's — see `weekCountOf`. */
  const canAddWeek = weeks < 52;
  const addWeek = () => {
    setWeeks(w => Math.min(52, w + 1));
  };
  /**
   * ONE TRACK, SO ONE PANEL — and this is a rule the grid enforces whether or
   * not the code does.
   *
   * `.split:has(> .dock)` opens a THIRD column at 380px. It opens exactly
   * one: a second panel child auto-places into an implicit row underneath and
   * takes the board's height with it. That was unreachable while the library
   * lived inside the plane — a dock in `.ws__side` and an assign panel in the
   * split were different boxes and coexisting was fine — and it is reachable
   * now, because the library is a panel in that same track.
   *
   * So every route that opens one closes the other, in one place rather than at
   * seven call sites that each have to remember. `setLibrary(null)` on an
   * already-null library is a no-op React drops.
   */
  const openPanel = (next: NonNullable<Panel>) => {
    setLibrary(null);
    setPanel(next);
  };

  const openProgression = () => openPanel({ kind: 'progression' });
  const openDuplicate = () => openPanel({ kind: 'duplicate' });
  /** Copy what the trainer is LOOKING AT onto another week.
   *
   *  Over `sourceWeek` and not `week`: on a repeating week the rows on screen
   *  are week 1's, and `copyWeek(prev, 5, 3)` — week 5 having nothing of its
   *  own — would have copied an empty set onto week 3 and cleared it. The
   *  sentence in the menu is still true either way, because a repeating week
   *  and its source hold the same program. */
  const copyWeekTo = (to: number) => commit(prev => copyWeek(prev, sourceWeek, to));
  /** Give the week back to week 1 — `onMakeOwn`'s inverse, which existed on
   *  neither shell. Through `removeEntries` rather than a filter so a superset
   *  spanning the week is taken apart the way every other removal takes one
   *  apart, and through `commit` so it is one undo. */
  const repeatWeek = () =>
    commit(prev => removeEntries(prev, new Set(prev.filter(e => e.week === week).map(e => e.uid))));

  /** Every action a row or a day menu can perform, in one object, so the board
   *  and the phone are handed the identical vocabulary. */
  const rowActions = {
    onOpenRow: (entry: Entry) => openPanel({ kind: 'row', uid: entry.uid }),
    onInfoRow: (entry: Entry) => openPanel({ kind: 'exinfo', uid: entry.uid }),
    /* THROUGH `commitOwn`, AND THE ID IS TRANSLATED — every one of these is
       addressed by an id read off the row under the pointer, and on a repeating
       week that row is week 1's. See `commitOwn`. */
    onNudge: (entry: Entry, d: -1 | 1) => commitOwn((prev, id) => nudge(prev, id(entry.uid), d)),
    onLink: (entry: Entry) => commitOwn((prev, id) => linkWithNext(prev, id(entry.uid))),
    onUnlink: (groupId: string) => commitOwn((prev, id) => unlinkGroup(prev, id(groupId))),
    onDuplicateRow: (entry: Entry) => duplicateRow(entry.uid),
    onRemoveRow: (entry: Entry) =>
      commitOwn((prev, id) => removeEntries(prev, new Set([id(entry.uid)]))),
    /* MOVE, LIKE COPY, NAMES ITS TARGETS. Only days that exist, because unlike
       copy-a-day — where landing in an empty slot is the most useful move there
       is while building — moving one exercise into a day that does not exist yet
       creates a day whose only content is the row that was somewhere else a
       moment ago. `+ Add a day` is the way to want a new day. */
    moveTargets: days,
    onMoveRowTo: (entry: Entry, to: number) =>
      commitOwn((prev, id) => moveEntries(prev, new Set([id(entry.uid)]), week, to)),
    /* COPY IS A DIRECT ACTION, not a mode. The old screen armed a *copying Day
       1* banner and waited for a second click on a column; with days down the
       page there is no column to click, and a mode that has to be explained in
       a banner is a mode. The menu lists the targets and one click does it. */
    copyTargets: ALL_SLOTS.filter(x => x !== undefined),
    onCopyDayTo: (from: number, to: number) => {
      if (!days.includes(to)) addDay(to);
      commitOwn(prev => copyDay(prev, week, from, to));
    },
    onClearDay: (day: number) =>
      commitOwn(prev =>
        removeEntries(prev, new Set(entriesFor(prev, week, day).map(e => e.uid))),
      ),
    /* THE FLOOR IS ONE TRAINING DAY, and it is a persistence rule rather than a
       taste one: `daysOf` treats an empty `trainingDays` as *this template
       predates the column* and derives the days from wherever rows sit, so a
       week marked rest all the way down would come back on the next load with
       every parked day trained again. */
    onMakeRest: days.length > 1 ? markRest : undefined,
    onRemoveDay: (day: number) => {
      setDays(prev => prev.filter(d => d !== day));
      if (library?.day === day) setLibrary(null);
      commit(prev => reindex(prev.filter(e => e.day !== day)));
    },
  };

  /** The row the exercise panel was opened from, if it was opened from one. */
  const infoRow = useMemo(
    () => (panel?.kind === 'exinfo' ? entries.find(e => e.uid === panel.uid) ?? null : null),
    [panel, entries],
  );

  /* ── actions ── */

  /**
   * THE PHONE'S ADD, and it is a batch because every add on a phone costs a
   * trip through a picker — one-at-a-time round trips are the single
   * most-cited reason program building on a phone gets abandoned.
   *
   * Each item carries its OWN numbers, because the picker's second step asks per
   * exercise. A batch-wide prescription could not: it had no honest place to put
   * a load, and it wrote *3 x 10* against a plank. ONE `commit` for the whole
   * batch, so one undo takes it all back rather than one row of it.
   */
  function addBatch(items: Prescription[], toWeek: number, toDay: number) {
    if (items.length === 0) return;
    remember(items.map(i => i.exercise));
    /* THE LANE AND THE CONTAINER ARE READ INSIDE THE WRITE, for `addOne`'s
       reason: on a week that is materialising, the day's rows in `entries` are
       week 1's and the ones this batch is joining are the copies. */
    const write = (prev: Entry[]) => {
    const lane = entriesFor(prev, toWeek, toDay);
    const tail = Math.max(-1, ...lane.map(e => e.order)) + 1;
    /* THE WHOLE BATCH INTO ONE CONTAINER — law 5. The picker's second step asks
       per exercise and the batch lands at the foot of the day, so the container
       is the day's last one, or a new one on a day that has none. */
    const host = hostWorkout(lane);
    const additions: Entry[] = items.map((item, i) => ({
      uid: newUid(),
      exerciseId: item.exercise.id,
      day: toDay,
      week: toWeek,
      order: tail + i,
      sets: item.sets,
      reps: item.reps,
      durationSeconds: item.durationSeconds,
      restSeconds: item.restSeconds,
      targetLoad: item.targetLoad,
      tempo: null,
      notes: null,
      altExerciseId: null,
      groupId: null,
      workoutId: host.workoutId,
      workoutName: host.workoutName,
      /* `setDetail` stays null: the picker prescribes N straight sets, and a
         per-set list — "four sets, the last two to failure" — is `RowPanel`'s,
         on a row that exists. `collapseSets` reads a null list as N x reps, so
         nothing downstream has to branch. */
      setDetail: null,
    }));
    return addEntries(prev, additions);
    };
    /* `toWeek` IS THE WEEK ON SCREEN on every route that reaches this — the
       phone's picker is opened from the open week — so the materialisation is
       the same one every other write gets. A batch aimed at another week would
       be a different function. */
    if (toWeek === week) commitOwn(write);
    else commit(write);
    setPanel(null);
  }

  /**
   * A WHOLE SESSION, WRITTEN ONCE AND LANDED ON A DAY.
   *
   * The collapsed card's tail control — `DayCard.onCreateWorkout` carries why it
   * replaced *+ Add exercise* there. What lands is the workout's movements in
   * the workout's own order, at the TAIL of whatever the day already holds: a
   * trainer who writes a second session onto Day 1 has added to it, and a write
   * that replaced the day would throw away rows without saying so. *Clear every
   * exercise* on the day menu is the thing that empties a day, and it says it.
   *
   * ONE `commit`, so one ⌘Z takes the session back rather than eight.
   *
   * THE DAY IS NOT RENAMED, and law 5 is what changed that. It used to take the
   * workout's name when it had none, which was right while a day could hold one
   * session and the day header was the only place to write its name. The
   * container carries its own name now, drawn on its own header — so writing it
   * onto the day as well would print one string twice in forty pixels, and then
   * be wrong the moment a second workout landed on the same day.
   */
  function landWorkout(day: number, workout: WorkoutTemplateWire) {
    /* THE TAIL IS FOUND INSIDE THE WRITE, for `addOne`'s reason: on a week that
       is materialising, the rows this session is landing behind do not exist in
       `entries` yet and `from` computed there would be 0 — the session would
       interleave with the week it was copied from instead of following it. */
    const count = entriesFromWorkout(workout, { day, week, from: 0 }).length;
    if (count > 0) {
      commitOwn(prev => {
        const lane = entriesFor(prev, week, day);
        const from = Math.max(-1, ...lane.map(e => e.order)) + 1;
        const additions = entriesFromWorkout(workout, { day, week, from });
        if (additions.length === 0) return prev;
        /* And whatever was already on the day gets its name written down — see
           `nameTheUnnamed`. This is the commonest way a day comes to hold two. */
        return addEntries(nameTheUnnamed(prev, day), additions);
      });
    }
    setWorkoutDay(null);
    /* AND THE BOARD HAS TO BE ABLE TO NAME WHAT IT JUST GAINED. `names` was
       fetched for the exercises the blueprint already used, so every movement a
       workout brings with it is one this screen has never heard of — drawn
       *Exercise not in your library* and counted for nothing in `balance()`.
       The dock hands the whole row over at the click and pays nothing; a saved
       workout hands over ids only, so the names are asked for. `remember` is the
       one overlay both paths write through. */
    void learnNames(workout);
    show({
      tone: 'ok',
      title: <>{workout.name} added</>,
      body: (
        <>
          {count === 1 ? '1 exercise' : `${count} exercises`} on{' '}
          {ordinalDayWord(day).toLowerCase()}. It is on your Workouts shelf too, to reuse.
        </>
      ),
    });
  }

  /* ── THE CONTAINER'S OWN WRITES ───────────────────────────────────────────
     Law 5's five, each one line of model and the rest of it bookkeeping the
     model deliberately does not do: what closes, what the toast says, and where
     the trainer is left looking. `blueprint.ts` holds the argument for each
     write; these hold the argument for the surface around it.                */

  /** Reopen the dialog on a container that is already on a day. */
  function editWorkout(workoutId: string) {
    const found = workoutAt(entries, workoutId);
    if (!found) return;
    const title = found.workout.name || labels[String(found.day)] || 'Workout';
    /* THROUGH THE WIRE SHAPE AND `fromWire`, not through a second translator —
       `workoutWireOf`'s own note carries why, and the short version is that the
       draft's uid minting is `lib/workouts/draft.ts`' and stays there. */
    setPanel(null);
    setLibrary(null);
    setEditing({
      workoutId,
      initial: draftFromWire(workoutWireOf(found.workout.entries, title), names),
    });
  }

  /** What the dialog wrote, back into the container it came from. */
  function landEdit(workoutId: string, draft: Draft) {
    const found = workoutAt(entries, workoutId);
    setEditing(null);
    if (!found) return;
    /* `toWire` then `entriesFromWorkout` — the same pair the create path uses,
       so a session that arrives by editing and one that arrives by saving are
       translated by one function and cannot differ. The container id is passed
       through, which is what keeps the workout in its place in the day. */
    const wire = workoutToWire(draft);
    const rows = entriesFromWorkout(
      {
        id: workoutId,
        name: wire.name,
        notes: wire.notes,
        exercises: wire.exercises.map((e, i) => ({ ...e, id: `local_${i}`, orderIndex: i })),
        dividers: wire.dividers,
        createdAt: 0,
        updatedAt: 0,
        exerciseCount: wire.exercises.length,
        setCount: 0,
      },
      { day: found.day, week: found.week, from: 0, workoutId },
    );
    /* THE CONTAINER IS RE-ADDRESSED INSIDE THE WRITE. `found` was read off the
       rows on SCREEN, and on a repeating week those are week 1's — so
       `found.week` is 1 and a `replaceWorkout` aimed at that id would rewrite
       week 1's session while the trainer watched week 4. `id` moves both the
       container and the rows onto the week that has just become its own. */
    commitOwn((prev, mapId) => {
      const target = mapId(workoutId);
      if (rows.length === 0) return removeWorkout(prev, target);
      const here = workoutAt(prev, target);
      const placed = rows.map(r => ({
        ...r,
        week: here?.week ?? week,
        day: here?.day ?? found.day,
        workoutId: target,
      }));
      return replaceWorkout(prev, target, placed);
    });
    void learnNames({
      id: workoutId,
      name: wire.name,
      notes: null,
      exercises: rows.map((r, i) => ({
        id: `local_${i}`,
        exerciseId: r.exerciseId,
        orderIndex: i,
        groupId: r.groupId,
        alternatives: [],
        sets: [],
      })),
      createdAt: 0,
      updatedAt: 0,
      exerciseCount: rows.length,
      setCount: 0,
    });
  }

  /**
   * NAME WHAT WAS NEVER NAMED, at the moment it stops being obvious.
   *
   * A container written before law 5 has no name of its own and is drawn under
   * the day's — which is right and unambiguous for exactly as long as it is the
   * only session on that day. The moment a second one lands, the card holds two
   * boxes and the day's name belongs to neither: drawn honestly they read
   * *Workout 1* and *Workout 2*, which is a position rather than a name and
   * tells a trainer nothing about which is which.
   *
   * So the day's label is written onto it — once, as a real name, at the point
   * where it would otherwise be lost. Nothing is renamed that has a name, and a
   * day with no label of its own has nothing to give and is left alone.
   */
  function nameTheUnnamed(prev: Entry[], day: number): Entry[] {
    const label = labels[String(day)]?.trim();
    if (!label) return prev;
    let touched = false;
    const next = prev.map(e => {
      if (e.week !== week || e.day !== day || e.workoutName) return e;
      touched = true;
      return { ...e, workoutName: label };
    });
    return touched ? next : prev;
  }

  /** Arm the paste. Nothing is written until a day is chosen. */
  function copyWorkout(workoutId: string) {
    const found = workoutAt(entries, workoutId);
    if (!found) return;
    setCopied({
      workoutId,
      name: found.workout.name || labels[String(found.day)] || 'this workout',
      day: found.day,
      /* THE WEEK ON SCREEN, not `found.week`. On a repeating week the container
         under the pointer is week 1's and `found.week` is 1 — but the card the
         trainer armed the copy from is this week's, and the flag exists to mark
         that card. The day board's cards are eight weeks of one day, so the day
         alone cannot tell them apart. */
      week,
    });
  }

  function pasteWorkout(day: number) {
    if (!copied) return;
    reflow(() =>
      commitOwn((prev, id) =>
        copyWorkoutTo(nameTheUnnamed(prev, day), id(copied.workoutId), week, day, copied.name),
      ),
    );
    setCopied(null);
    show({
      tone: 'ok',
      title: <>Copied</>,
      body: (
        <>
          {copied.name} is on {ordinalDayWord(day).toLowerCase()} as well. It is a copy — changing
          one does not change the other.
        </>
      ),
    });
  }

  async function learnNames(workout: WorkoutTemplateWire) {
    const unknown = exerciseIdsOf(workout).filter(id => !names[id]);
    if (unknown.length === 0) return;
    const rows = await Promise.all(unknown.map(id => fetchExercise(id)));
    remember(rows.filter((row): row is ExerciseWire => Boolean(row)));
  }

  function duplicateRow(uid: string) {
    commitOwn((prev, id) => {
      const source = prev.find(e => e.uid === id(uid));
      if (!source) return prev;
      // `order + 0.5` lands it directly under the original and `reindex` makes
      // the halves whole again. `groupId` is dropped: a copy of one half of a
      // superset is a third movement, not a third member.
      const copy: Entry = { ...source, uid: newUid(), order: source.order + 0.5, groupId: null };
      return reindex([...prev, copy]);
    });
  }

  async function onDuplicate() {
    if (save !== 'clean') await flush();
    const result = await duplicateTemplate(template.id);
    if (result.ok) {
      show({
        tone: 'ok',
        title: <>Duplicated</>,
        body: <>{result.value.name} &mdash; nobody is on it yet, so it is safe to change.</>,
      });
      router.push(`/programs/${result.value.id}`);
    } else show({ tone: 'danger', title: <>Could not duplicate</>, body: result.message });
  }

  async function onDelete() {
    const result = await removeTemplate(template.id);
    if (result.ok) {
      /* No Undo, and therefore not a receipt: `removeTemplate` has no inverse
         on the wire, so a five-second window offering one would be a button
         this screen cannot honour. What the confirm says instead is the thing
         a trainer will want to know — the clients already on a copy of this
         keep theirs. */
      show({
        tone: 'ok',
        title: <>{template.name} deleted</>,
        body: <>Anyone already on a copy of it keeps theirs.</>,
      });
      router.push('/programs/templates');
    } else show({ tone: 'danger', title: <>Could not delete it</>, body: result.message });
  }

  async function onAssign(input: {
    clientId: string;
    startDate: number | null;
    schedule: { day: number; weekday: number; time: string }[];
  }) {
    setAssignBusy(true);
    setAssignError(null);
    // The copy is made from what the SERVER holds, so an unsaved draft would
    // assign the previous version — silently, and to a real person.
    if (save !== 'clean') await flush();
    const result = await assignTemplate(template.id, {
      clientId: input.clientId,
      startDate: input.startDate,
      schedule: input.schedule,
    });
    setAssignBusy(false);
    if (result.ok) {
      setPanel(null);
      /* THE ROW IT CHANGED IS ON ANOTHER ROUTE. Assigning writes a program onto
         a CLIENT, and the client's file is where that row lives — so the house
         rule's usual answer, *answer the write on the row it changed*, has
         nothing on this screen to land on. That is the case the deck exists
         for, and it is why this is the one write in the builder that gets a
         card rather than a header state. */
      show({
        tone: 'ok',
        title: <>Assigned to {clients.find(c => c.id === input.clientId)?.name ?? 'them'}</>,
        body: <>They have their own copy of it now &mdash; editing this one will not reach it.</>,
      });
      router.refresh();
    } else {
      setAssignError(result.message);
    }
  }


  return (
    <>
      {/* `ph--builder` — the class per screen `/today`'s note in the stylesheet
          asks for, and this screen needed it most: measured at 390px this header
          was **225px** over a 510px content window, with the overflow button
          wrapped onto a row of its own to spend 42px on one 32px icon. */}
      <div className="ph ph--builder">
        <div className="ph__row pg__ph">
          <div className="pg__phm">
            {/* ── THE WAY BACK TO THE SHELF, AND ON A DESK IT WAS MISSING ────
                Asked for on 17 Sep 2026: *provide breadcrumbs to go back to all
                programs*. MEASURED at 1536 before this, with the rail and the
                pane both minimised — which is how this screen loads — there was
                exactly ONE visible link to `/programs` anywhere in the chrome:
                a 47×40 unlabelled `.rail__i` icon. The builder was a dead end.

                Three things that each look like the answer are not:
                · `TopBar`'s `crumb` prop IS passed (*Fitness · Programs · Return
                  to Lifting · post-injury*) and `app.css` sets
                  `.top .crumbs{display:none}` above 900px — the workspace plate
                  took that slot, deliberately, and the crumb survives only
                  outside the shell.
                · `titleHref` draws `‹ Programs` in the bar, and
                  `.top__title--back` is styled ONLY inside
                  `@media (max-width:900px)`. It is the phone's door.
                · `{switcher}` below is `display:none` on a desk — its own note
                  calls it "the phone's only door to the other programs", and it
                  is exactly that.

                So all three routes out of this screen were the phone's, and the
                desk had the rail icon. `TopBar`'s own docstring weighed "a crumb
                row inside `.ph`" and rejected it as "~22px to say a word the bar
                was already drawing" — true of the phone, where the bar draws it,
                and not of the desk, where the bar draws neither. This is that
                22px, spent only at the width that has nothing else.

                `Crumbs` from the design system rather than a ninth hand-written
                `<nav className="crumbs">` — see the component, which could not
                draw a separator until today and is very likely why the other
                eight are hand-written. `app.css` records that those eight are
                each "the way back out of a flow that has no rail row to light",
                which is this screen's case stated for it.

                TWO LEVELS, NOT THREE. The bar's string starts at *Fitness*, and
                the rail's Fitness icon points at `/programs` — the same place
                *Programs* does. A crumb whose first two levels are one
                destination is a path with a step that goes nowhere.

                ── AND WHY THIS IS NOT `cert__back` ────────────────────────

                The screen next door — `/programs/certified/:id` — answers the
                same question with a *Back to templates* `Button` inside
                `.ph__acts`, hidden below 900px, and its note argues the case in
                almost these words. Two adjacent screens answering one question
                two ways is what heuristic 4 forbids, so the difference has to be
                paid for rather than inherited.

                IT IS PAID FOR, AND THE NUMBER IS ZERO. MEASURED at 960, 1024,
                1200, 1366 and 1536: `.ph__acts` here is **358px at every one of
                them** — four controls, all fixed-width — and `.pg__phm` is
                `flex:1`, so the header row's spare space is **−6px** at all five
                widths. A fifth control of ~150px cannot come out of the row; it
                comes out of the title, which at 960 has 266px for a name that
                already ellipsizes. The certified preview carries TWO actions and
                has the room. This screen does not, and a wrapped `.ph__acts` is
                34px — more than the 26 the crumb row costs, and it lands on the
                primary.

                So: same question, two controls, and the reason is the
                measurement. If the actions here are ever cut to two, this should
                become `cert__back` and the two screens should agree. */}
            <Crumbs
              className="pg__crumbs"
              items={[{ label: 'Templates', href: '/programs/templates' }, { label: template.name }]}
            />
            {/* THE NAME, TWICE, AND CSS PICKS ONE. The `<h1>` is this document's
                outline and stays at every width — visually hidden on a phone
                rather than dropped, which is the declaration `.ph--today .ph__t`
                and `.sch__ph .ph__t` both make and for their reason. The
                switcher is drawn in its place and is the phone's only door to
                the other programs. */}
            {switcher}
            <h1 className="ph__t">{template.name}</h1>
            <p className="ph__sub">
              {/* WRAPPED, so the shape can ellipsize and the save state cannot.
                  At 390px the two ran to a second line and the header paid 19px
                  for it; the shape is a fact a trainer can re-read from the
                  tiles below, and *Save failed — retry* is not. */}
              {/* THREE SPANS AND NOT ONE STRING, so the narrowest phone can
                  drop a clause instead of clipping a word. The separator is
                  `::before` on every span but the first, so a hidden clause
                  takes its own `·` with it and the line never ends in one. */}
              <span className="pg__shape">
                {shapeParts(days.length, weeks, template.activeAssignedCount).map((part, i) => (
                  <span key={i} className={i === 2 ? 'pg__shapecl' : undefined}>
                    {part}
                  </span>
                ))}
              </span>
              <span className="pg__sep" aria-hidden="true">
                ·
              </span>
              <span className="pg__save">
                <SaveLine
                  state={save}
                  savedAt={savedAt}
                  error={saveError}
                  onRetry={() => void flush()}
                />
              </span>
            </p>
          </div>
          <div className="ph__acts">
            {/* THE TWO SECONDARIES STAND DOWN ON A PHONE and are re-offered as
                rows in the menu below — §13.5's own IA table already files both
                there (*Assign to client, publish → L1 program menu*; *Duplicate
                day / week / program → … program menu*). `Assign` stays on the
                row: it is the primary, and a primary behind an unlabelled ⋯ is a
                primary a trainer has to already know about. */}
            <Button variant="secondary" className="pg__act--desk" onClick={() => openPanel({ kind: 'assigned' })}>
              <UsersIcon />
              {template.assignedCount === 0
                ? 'Nobody on this'
                : `${template.activeAssignedCount} on this`}
            </Button>
            {/* DUPLICATE IS THE MOST-USED ACTION ON THIS SCREEN, so it is a
                labelled secondary beside the primary rather than a row in the
                overflow. Trainers build one good program and tweak it per
                client, and the copy is what makes the tweak safe. */}
            <Button variant="secondary" className="pg__act--desk" onClick={() => void onDuplicate()}>
              <CopyIcon />
              Duplicate
            </Button>
            <Button variant="primary" onClick={() => openPanel({ kind: 'assign' })}>
              <PlusIcon />
              Assign
            </Button>
            <div className="pg__hdmenu">
              <Button
                variant="ghost"
                iconOnly
                label="More actions for this program"
                aria-expanded={menu}
                onClick={() => setMenu(v => !v)}
                title={undefined}
                icon={<DotsIcon />}
              />
              {/* A SCRIM, because below 900px this menu is a bottom sheet and a
                  sheet without one is the defect phase 2b names: a 196px
                  dropdown pinned to the top-right corner, over a screen that
                  still looks live, with no way out but the trigger it came from.
                  Every other menu on this screen already has one.

                  Drawn at every width and `display:none` above 900px, which is
                  this shell's rule since `Rail.tsx` — a component that branched
                  on a measured width would paint the wrong half for a frame
                  after every resize. On a desk the dropdown keeps its own
                  dismissal: `.pg__hdmenu` is `position:relative` and the button
                  toggles. */}
              {menu && (
                <div
                  className="pg__hdscrim"
                  role="presentation"
                  onClick={() => setMenu(false)}
                />
              )}
              {menu && (
                <div className="menu" role="menu">
                  {/* PHONE ONLY, and drawn at every width so the menu cannot
                      disagree with the row above it about what this program can
                      do. `.menu__i--phone` is `display:none` over 900px, where
                      both are labelled buttons in `.ph__acts`. */}
                  <button
                    className="menu__i menu__i--phone"
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setMenu(false);
                      openPanel({ kind: 'assigned' });
                    }}
                  >
                    {template.assignedCount === 0
                      ? 'Nobody on this'
                      : `${template.activeAssignedCount} on this`}
                  </button>
                  <button
                    className="menu__i menu__i--phone"
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setMenu(false);
                      void onDuplicate();
                    }}
                  >
                    Duplicate this program
                  </button>
                  <div className="menu__sep menu__sep--phone" />
                  <button
                    className="menu__i"
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setMenu(false);
                      undo();
                    }}
                    disabled={undoDepth === 0}
                  >
                    {/* THE CHORD STANDS DOWN ON A PHONE, and nothing else about
                        the row changes. A `⌘Z` printed on a touch screen
                        advertises a key most of them do not have — the same call
                        `.omni`'s own `<kbd>` makes below 900px, and the reason
                        it is a class here rather than a branch: the row is one
                        row, and the hint is the only part of it that is about a
                        keyboard. `aria-keyshortcuts` is deliberately NOT added
                        in its place, because nothing in this screen binds ⌘Z —
                        the accelerator is the browser's own undo and this button
                        is the only thing that reaches the draft's stack. */}
                    Undo <kbd className="pg__chord">⌘Z</kbd>
                  </button>
                  <div className="menu__sep" />
                  <button
                    className="menu__i menu__i--danger"
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setMenu(false);
                      void onDelete();
                    }}
                  >
                    Remove this program
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* ── YOU CHANGED THIS, AND THIRTEEN PEOPLE ARE ON IT ──────────────────

          The mirror of the band on `/clients/:id/program/:pid`: there a client's
          copy is open and its blueprint has moved; here the blueprint is open
          and its copies have not. **Neither one propagates anything.** Both name
          the act and leave it to the trainer, which is the rule the two-table
          design exists to enforce — see `AssignedList`, which is where this
          button leads and which is the screen that does the sending.

          It is a PROMPT and not a confirm: it appears after the autosave has
          landed, it names the count, and it is dismissible. A trainer tidying a
          blueprint nobody is on never sees it. */}
      {showPush && (
        <p className="pg__push" role="status">
          <span>
            <b>
              {liveCount} client{liveCount === 1 ? '' : 's'}
            </b>{' '}
            {liveCount === 1 ? 'is' : 'are'} on this plan. You have made{' '}
            <b>
              {sessionDiff.total} change{sessionDiff.total === 1 ? '' : 's'}
            </b>{' '}
            &mdash; their copies still say what it said before.
          </span>
          <Button variant="secondary" size="sm" onClick={() => openPanel({ kind: 'assigned' })}>
            <UsersIcon />
            Review who gets it
          </Button>
          <Button
            variant="ghost"
            iconOnly
            label="Not now"
            title={undefined}
            onClick={() => setPushHidden(template.id)}
            icon={<CloseIcon />}
          />
        </p>
      )}

      <div className="split split--solo">
        <div className="split__r pg__builder">
          <Toolbar
            weeks={weeks}
            week={week}
            setWeek={setWeek}
            onAddWeek={addWeek}
            authored={new Set(entries.map(e => e.week))}
            repeats={repeatLine(entries, weeks)}
            overload={overloadLine(entries)}
            detail={detail}
            setDetail={setDetail}
            onDuplicateWeek={openDuplicate}
            axis={axis}
            /* THE SWITCH CLOSES THE SURFACE THAT IS ADDRESSED BY DAY. The
               dock's header reads *ADDING TO DAY 1*; on the other axis that is
               still true of a card that is now one of eight, and a drawer left
               open beside a board that has just changed shape is 380px the
               trainer did not ask for. */
            onAxis={next => {
              setAxis(next);
              setLibrary(null);
            }}
            days={days}
            focusDay={dayShown}
            onFocusDay={setFocusDay}
          />

          {/* ── THE WEEK SHEET, on both shells ─────────────────────────────
              Both are in the tree and CSS picks one at 900px, the width the
              shell already swaps its rail at. A component that branched on a
              measured width would paint the wrong half for a frame after every
              resize and could not be server-rendered — `Rail.tsx`'s call, for
              its reason. They are two designs rather than one that adapts,
              because a day at a desk is a card in a grid beside two panels and
              on a phone it is a tile that opens a screen. */}
          <div className="pgw" ref={plane}>
            <div className="pgw__desk">
              <WeekBoard
                days={days}
                labels={labels}
                detail={detail}
                rows={shown.rows}
                names={names}
                week={week}
                repeat={shown.repeat}
                balance={weekBalance}
                entriesForDay={day => entriesFor(shown.rows, sourceWeek, day)}
                /* THE DAY MENU'S *Name this day*, written on the card's own
                   header — the `DAY NAME` field it used to open is gone with
                   the inline editor. */
                onRelabel={(d, value) => {
                  setLabels(prev => ({ ...prev, [String(d)]: value }));
                }}
                library={library}
                onOpenLibrary={d => {
                  /* AND IT CLOSES WHATEVER PANEL WAS UP, for `openPanel`'s
                     reason read the other way: the drawer wants the same 380px
                     track a row or a progression panel is already holding. */
                  setPanel(null);
                  setLibrary({ day: d, workoutId: null });
                }}
                onAddExercise={addOne}
                onEditWorkout={editWorkout}
                onCopyWorkout={copyWorkout}
                /* THE FOUR WRITES THAT MOVE A CARD GO THROUGH `reflow` — the
                   container travels to its new place and the two days it
                   leaves and joins change height under it, in one 240ms
                   movement instead of a teleport. `DayReflow.reflow` carries
                   the mechanism; everything else on this board still commits
                   directly, because nothing else re-places a card. */
                onNudgeWorkout={(workoutId, direction) =>
                  reflow(() =>
                    commitOwn((prev, id) => nudgeWorkout(prev, id(workoutId), direction)),
                  )
                }
                onRemoveWorkout={workoutId =>
                  reflow(() => commitOwn((prev, id) => removeWorkout(prev, id(workoutId))))
                }
                vt={vtArmed}
                copied={copied}
                onPasteWorkout={pasteWorkout}
                onCancelCopy={() => setCopied(null)}
                onDropWorkout={(workoutId, day, before) =>
                  /* `names` ONLY WHEN IT STAYS ON ITS DAY — `DayReflow.reflow`
                     carries the measurement. A container that changes card is a
                     different DOM node afterwards, and a duplicate
                     `view-transition-name` inside the update callback makes
                     Chrome refuse the transition outright; without the names the
                     two day cards still morph around it. */
                  reflow(
                    () =>
                    commitOwn((prev, id) => {
                      const target = id(workoutId);
                      const found = workoutAt(prev, target);
                      /* THE NAME IS WRITTEN DOWN BEFORE THE MOVE, on both ends
                         and for one reason — see `nameTheUnnamed`. The container
                         that is leaving loses the day whose label it was
                         borrowing, and the day it lands on is about to hold
                         two. */
                      let next = found && found.day !== day ? nameTheUnnamed(prev, found.day) : prev;
                      next = nameTheUnnamed(next, day);
                      return moveWorkout(next, target, week, day, before === null ? null : id(before));
                    }),
                    { names: workoutAt(entries, workoutId)?.day === day },
                  )
                }
                /* THE TAIL CONTROL OF A COLLAPSED DAY. It closes the dock and
                   any panel first for the reason `openPanel` does — but the
                   stronger one here is the scrim: a drawer left open under an
                   `aria-modal` dialog is 380px of board a trainer can see and
                   cannot reach. */
                onCreateWorkout={d => {
                  setPanel(null);
                  setLibrary(null);
                  setWorkoutDay(d);
                }}
                carrying={carrying}
                onCarry={setCarrying}
                /* SEVEN CARDS, and the untrained ones drawn as rest. This is
                   the screen the flag exists for — `WeekBoard`'s own prop
                   carries the argument, and `+ Add a day` goes with it: every
                   slot is on the board already. */
                fullWeek
                onMakeWorkout={addDay}
                /* ── THE OTHER AXIS ───────────────────────────────────────
                   One day, every week. `WeekBoard`'s `axis` prop carries the
                   argument for why this is the same component and the same
                   card rather than a second board. */
                axis={axis}
                weekCount={weeks}
                focusDay={dayShown}
                weekOf={weekOfDay}
                /* REACHING FOR A CARD MOVES THE WRITE ONTO ITS WEEK — every
                   card on this axis is writable and this is how each one says
                   it is the one being written. Fired on the pointer DOWN, a
                   whole event before the click that writes, for the reason
                   `DayCard`'s `onActivate` gives. */
                onPickWeek={setWeek}
                {...rowActions}
              />
            </div>

            <div className="pgw__phone">
              <PhoneProgram
                programName={template.name}
                days={days}
                labels={labels}
                weeks={weeks}
                week={week}
                authored={authoredWeeks(entries)}
                onWeek={setWeek}
                repeat={shown.repeat}
                balance={weekBalance}
                names={names}
                entriesForDay={day => entriesFor(shown.rows, sourceWeek, day)}
                /* NOT `setLibrary`, and that is the whole of the bug this
                   control had for as long as it existed: `library` is read only
                   by `WeekBoard`, which lives inside `.pgw__desk` —
                   `display:none` under 900px — so the tap mounted the dock into
                   a hidden subtree. No surface, no error, no console warning,
                   and one Escape press afterwards spent closing something
                   nobody could see. The two shells shared one handler and only
                   one of them rendered what it opened.

                   The phone gets `LibraryPanel` instead, which is already
                   `position:fixed;inset:0` under 1180px and already takes a
                   batch — the right shape here, because 1,324 rows need a
                   search field, a chip row and a reachable footer, and there is
                   no version of that which leaves the day usefully visible. */
                onAdd={d => openPanel({ kind: 'library', week, day: d })}
                onField={setField}
                onAddDay={addDay}
                freeSlots={freeSlots}
                /* THE FOUR THE PHONE WAS MISSING. Three of them are the desk
                   toolbar's, reached from the week strip's own `⋮`; the fourth
                   is `onMakeOwn`'s inverse, which the desk does not have
                   either. `undefined` is a capability the trainer genuinely
                   does not have here — the ceiling, or week 1, which has
                   nothing to repeat — and the menu draws no dead item for it. */
                onAddWeek={canAddWeek ? addWeek : undefined}
                onProgression={openProgression}
                onDuplicateWeek={openDuplicate}
                onCopyWeekTo={copyWeekTo}
                onRepeatWeek={week > 1 && !shown.repeat ? repeatWeek : undefined}
                /* The WHOLE draft, for L2's across-weeks strip. `entriesForDay`
                   is closed over `sourceWeek` and so can only ever answer about
                   the week on screen, which is one week short of a comparison. */
                entries={entries}
                /* Any panel `Builder` renders sits OVER the phone's levels, so
                   Escape belongs to it and not to L2. */
                /* AND THE HEADER MENU COUNTS AS COVER, which `panel !== null`
                   alone does not say. FOUND BY RENDERING phase 2b: with the
                   program menu open over an open DAY, one Escape closed the day
                   and left the menu standing — the wrong rung, and the surface
                   the trainer was looking at untouched.

                   It is this component's own documented failure arriving from a
                   second direction. `PhoneProgram`'s handler runs in CAPTURE
                   with `stopImmediatePropagation`, so it fires before the
                   builder's ladder and swallows the press; its guard is exactly
                   this prop. The menu is not a `panel`, so nothing told it that
                   a sheet at z-index 71 had opened above `.wsm`.

                   The rule the prop's own doc states — "while a surface is
                   above these levels the press is not ours to spend" — is about
                   surfaces, not about the state field that happens to hold one,
                   so every surface this component opens over the phone's levels
                   belongs in here. */
                covered={panel !== null || menu || switcherOpen}
                {...rowActions}
              />
            </div>
          </div>
        </div>

        {/* ── the panels ── */}

        {/* THE LIBRARY, AS A DRAWER — the desk's, and only the desk's.
            `.pgw__phone` has its own answer in `LibraryPanel` below: a
            full-screen `.pgsheet` with a scrim, a grab handle and a batch,
            because on a phone the day is not on screen while you pick. That is
            unchanged and must stay unchanged. This is the ≥900px surface.

            WHY IT MOVED OUT OF THE RAIL. `WeekBoard`'s own note carries the
            measurement; the short version is that a 280px card appearing in a
            rail that was already there, 900px from the button that summoned it,
            reads as nothing having happened. Here it takes the same third grid
            track *Assign* takes, the board narrows by 380px to make room, and
            the reflow is what says the library is open.

            NO SCRIM, AND THAT IS LOAD-BEARING rather than an omission. *Drag by
            the grip to land on any day* is half the dock's vocabulary, and a
            scrim between the drawer and the board is a surface a drop cannot
            cross. The board stays live behind it for exactly that reason —
            which is also why this is a drawer and not `aria-modal`.

            `key` ON THE DAY so switching target days remounts: the search, the
            filters and the open info view all belong to the day being filled,
            and carrying a chest filter over into Day 4's leg session is a
            state bug that looks like a search bug. */}
        {library && (
          <LibraryDock
            key={`${library.day}-${library.workoutId ?? ''}`}
            day={library.day}
            /* THE CONTAINER, WHEN THERE IS ONE — law 5. The dock adds to a
               workout now, not to a day, and *ADDING TO DAY 4 · UPPER B* over a
               dock pinned to the second session on that day names the wrong
               thing twice. Falls back to the day's own label, which is what the
               header said before containers existed and what a board without
               them still wants. */
            dayLabel={
              (library.workoutId
                ? workoutAt(entries, library.workoutId)?.workout.name
                : null) || (labels[String(library.day)] ?? '')
            }
            onClose={() => setLibrary(null)}
            onAdd={ex => addOne(library.day, ex, null, library.workoutId ?? undefined)}
            onCarry={setCarrying}
            /* Over `shown.rows`/`sourceWeek` and not `entries`/`week`, so a
               repeating week counts week 1's rows — the ones on screen. */
            countFor={id =>
              entriesFor(shown.rows, sourceWeek, library.day).filter(e => e.exerciseId === id)
                .length
            }
            contextFor={contextFor}
          />
        )}

        {/* THE WORKOUT DIALOG, over the whole frame — `WorkoutBuilder`'s own
            header argues the modal against `LibraryDock`'s drawer, and the same
            argument decides it here: a trainer writing a session from nothing
            needs a searchable library, a canvas and set lines seven controls
            wide, and there is nothing on the board underneath worth 380px of
            what is left. `key` on the day, so opening a second day's dialog
            starts on an empty canvas rather than on the last one's draft.

            IT SAVES A REUSABLE WORKOUT AND FILLS THE DAY — both, from one
            press. The row on `/programs/workouts` is what makes the session
            reusable; `landWorkout` is what puts it on this program. */}
        {workoutDay != null && (
          <WorkoutBuilder
            key={workoutDay}
            onClose={() => setWorkoutDay(null)}
            onSaved={row => landWorkout(workoutDay, row)}
          />
        )}

        {/* THE SAME DIALOG, REOPENED ON A CONTAINER THAT IS ALREADY ON A DAY.
            `onLocalSave` rather than `onSaved` is the whole difference and its
            note carries why: the rows on this day are a copy, and an edit to
            one day's session is not an edit to the template it came from. */}
        {editing && (
          <WorkoutBuilder
            key={editing.workoutId}
            initial={editing.initial}
            onClose={() => setEditing(null)}
            onLocalSave={draft => landEdit(editing.workoutId, draft)}
          />
        )}

        {panel?.kind === 'row' && selected && (
          <RowPanel
            key={selected.uid}
            entry={selected}
            name={names[selected.exerciseId]?.name ?? 'This exercise'}
            names={names}
            pairName={pairNameFor(entries, selected, names)}
            canLink={Boolean(pairNameFor(entries, selected, names))}
            onClose={() => setPanel(null)}
            /* THE PANEL'S THREE WRITES GO THROUGH `commitOwn` LIKE THE
               BOARD'S. It is opened from a row on screen, and on a repeating
               week that row is week 1's — so a rewritten prescription would
               have landed in week 1 while the header said week 4. */
            onSave={patch => {
              commitOwn((prev, id) => updateEntry(prev, id(selected.uid), patch));
              setPanel(null);
            }}
            onLink={() => {
              commitOwn((prev, id) => linkWithNext(prev, id(selected.uid)));
              setPanel(null);
            }}
            onUnlink={() => {
              const groupId = selected.groupId;
              if (groupId) commitOwn((prev, id) => unlinkGroup(prev, id(groupId)));
              setPanel(null);
            }}
          />
        )}

        {panel?.kind === 'library' && (
          <LibraryPanel
            key={`${panel.week}-${panel.day}`}
            destination={`Day ${panel.day}${labels[String(panel.day)] ? ` · ${labels[String(panel.day)]}` : ''}`}
            onClose={() => setPanel(null)}
            onAdd={items => addBatch(items, panel.week, panel.day)}
            contextFor={exercise => contextFor(exercise)}
          />
        )}

        {/* THE SECOND DOOR to the same body. A row knows its day and its note;
            a library row knows neither, so this is the only caller that passes
            them — and the panel is the only place they are drawn together. */}
        {panel?.kind === 'exinfo' && infoRow && (
          <ExerciseInfoPanel
            key={infoRow.uid}
            exerciseId={infoRow.exerciseId}
            fallbackName={names[infoRow.exerciseId]?.name}
            context={contextFor(
              names[infoRow.exerciseId] ?? {
                id: infoRow.exerciseId,
                muscleGroup: null,
                movementPattern: null,
              },
              infoRow.notes,
              infoRow.day,
            )}
            onClose={() => setPanel(null)}
          />
        )}

        {panel?.kind === 'progression' && (
          <ProgressionPanel
            entries={entries}
            weeks={weeks}
            days={days}
            dayLabels={labels}
            onClose={() => setPanel(null)}
            onApply={(plan: ProgressionStep[], scope) => {
              commit(prev => applyProgression(prev, plan, scope));
              setWeeks(w => Math.max(w, plan[plan.length - 1]?.week ?? w));
              setPanel(null);
            }}
          />
        )}

        {panel?.kind === 'duplicate' && (
          <DuplicateWeekPanel
            entries={entries}
            week={week}
            sourceWeek={sourceWeek}
            weeks={weeks}
            onClose={() => setPanel(null)}
            onApply={opts => {
              commit(prev => duplicateWeek(prev, sourceWeek, weeks, opts));
              setPanel(null);
              /* THE POINT OF A COPY IS THE WEEK IT LANDED ON, so the strip goes
                 there — the first one written, which is the one a trainer will
                 check. `duplicateTargets` is asked rather than guessed at, so
                 the chip that lights is a week the write actually touched. */
              const first = duplicateTargets(sourceWeek, weeks, opts.spread).find(
                w => opts.conflict !== 'skip' || !authoredWeeks(entries).has(w),
              );
              if (first != null) setWeek(first);
            }}
          />
        )}

        {panel?.kind === 'assign' && (
          <AssignPanel
            templateName={template.name}
            days={days}
            dayLabels={labels}
            clients={clients}
            busy={assignBusy}
            error={assignError}
            onClose={() => setPanel(null)}
            onAssign={onAssign}
          />
        )}

        {panel?.kind === 'assigned' && (
          <AssignedList
            templateId={template.id}
            assignments={assignments}
            /* The DRAFT's week count, not `template.weeks` — a trainer who has
               just added week 9 is asking about the block they are looking at. */
            weeks={weeks}
            onDone={() => setPanel(null)}
          />
        )}
      </div>
    </>
  );
}

/** THE BLUEPRINT AS IT WAS WHEN THIS SITTING OPENED IT — see the push prompt.
 *  A plain object rather than the `TemplateWire` itself, so it cannot be
 *  mistaken for the live prop by a later reader: the whole point is that this
 *  one does not move when the template refreshes. */
function snapshotOf(template: TemplateWire) {
  return {
    id: template.id,
    exercises: template.exercises,
    dayLabels: template.dayLabels,
    weeks: template.weeks,
    trainingDays: template.trainingDays,
  };
}

/* ─────────────────────────────────────────── the save line ── */

/* THE THREE BELOW ARE EXPORTED, and the caller is `components/clients/plan`.
   A client's copy of a plan is edited on its own screen with its own header and
   its own left column, but the CONTROL STRIP above the board and the sentence
   that says whether the draft is safe are properties of the board and the
   draft — the two things the screens genuinely share. `CertifiedPreview` has a
   `ReadToolbar` of its own instead, for the reason it states: every write on
   this strip is stood down there, and a `readOnly` flag through a control that
   would then draw two of its four chips is a worse trade than 40 lines. */

export function pairNameFor(
  entries: Entry[],
  entry: Entry,
  names: Record<string, ExerciseNameWire>,
): string | null {
  const lane = entriesFor(entries, entry.week, entry.day);
  const at = lane.findIndex(e => e.uid === entry.uid);
  const next = lane[at + 1];
  if (!next) return null;
  return names[next.exerciseId]?.name ?? 'the next exercise';
}

/**
 * WHETHER THIS IS SAFE YET, said in the header rather than by a Save button.
 *
 * The design set answers *is this safe* with the sync pill, and this half has no
 * pill because it has no queue — so the honest equivalent is a debounced
 * autosave with its state written down and a retry when it fails. A failure is
 * the only state that gets a control, because it is the only one the trainer can
 * do anything about.
 */
export function SaveLine({
  state,
  savedAt,
  error,
  onRetry,
}: {
  state: SaveState;
  savedAt: number;
  error: string | null;
  onRetry: () => void;
}) {
  if (state === 'saving') return <>saving…</>;
  if (state === 'failed') {
    return (
      <span className="pg__savefail" role="status">
        {error ?? 'that didn’t save'}
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </span>
    );
  }
  if (state === 'dirty') return <>unsaved changes</>;
  return <>saved {relativeDay(savedAt)}</>;
}

/**
 * THE CONTROL STRIP — which week, what rule, how much of each row.
 *
 * `week-sheet.html`'s `.wsc`, to the class name. One row, and every control on
 * it changes what the board below is SHOWING rather than what it means: the
 * week you are reading, the ladder that week is part of, and the density the
 * rows are drawn at. Nothing here edits the program.
 *
 * ── WHAT LEFT: THE *DAYS A WEEK* SELECT ──────────────────────────────────────
 *
 * Days are ORDINAL SLOTS and gaps are legal — `tpl_001` is 1, 2, 4, 5. The
 * select could only ever write `1..count`, so on that template picking **4**,
 * the number it was already showing, silently renumbered Day 4 to Day 3 and Day
 * 5 to Day 4; picking **3** merged eleven exercises off Days 4 and 5 onto one
 * day. A control whose no-op destroys the layout is not a control. Adding a day
 * is the board's own `+ Add a day` tile, which takes the next free slot, and
 * removing one is the day menu, which leaves the slot behind — both already
 * built, and between them they can express 1, 2, 4, 5. The shape line in the
 * header still reads "4 days a week", because that sentence was never wrong.
 *
 * ── AND WHAT *OVERLOAD* IS HERE ──────────────────────────────────────────────
 *
 * The prototype's chip pair is a fixture switch: it GENERATES weeks 2–8 from
 * `+2.5 kg / 2 wk` so you can compare the block with the rule and without. This
 * model has no generated weeks (law 3) and `TemplateWire` has no rule column,
 * so the strip states what is TRUE instead of what was set — the ladder read
 * back off the authored rows by `overloadLine`. That sentence is all `overload`
 * is now: a READING, beside the repeat line, in the same quiet type.
 *
 * The CONTROL in that slot used to be *Progression · Set a rule*, and it is now
 * *Duplicate week*. The argument is in `DuplicateWeekPanel`: copying this week
 * forward is the thing a trainer does far more often than laddering one, it was
 * reachable only from a day menu one destination at a time, and the four ladder
 * seeds ride along inside the copy — so the slot lost nothing and gained the
 * common action. `ProgressionPanel` keeps its other two doors (the phone's week
 * menu, `/clients/[id]/plan`).
 */
export function Toolbar({
  weeks,
  week,
  setWeek,
  onAddWeek,
  authored,
  repeats,
  overload,
  detail,
  setDetail,
  onDuplicateWeek,
  axis,
  onAxis,
  days,
  focusDay,
  onFocusDay,
  readOnly = false,
}: {
  weeks: number;
  week: number;
  setWeek: (w: number) => void;
  onAddWeek: () => void;
  authored: Set<number>;
  /** "weeks 2–8 repeat week 1", or empty when nothing does. */
  repeats: string;
  /** The ladder the rows actually carry, or null when none is written. */
  overload: string | null;
  detail: Detail;
  setDetail: (d: Detail) => void;
  onDuplicateWeek: () => void;
  /** Which way the board is laid — see `Builder`'s own `axis` state. */
  axis: 'week' | 'day';
  onAxis: (axis: 'week' | 'day') => void;
  /** The trained slots, and which one the day axis is on. Drawn only on that
   *  axis: on the week axis every day is already a card, and a control that
   *  picked one of them would be picking nothing. */
  days: number[];
  focusDay: number;
  onFocusDay: (day: number) => void;
  /**
   * THE TWO WRITES STAND DOWN, and nothing else moves.
   *
   * `CertifiedPreview` needed this shape first and got it as a whole second
   * component, `ReadToolbar`. A client's copy opens read-only too, so this is
   * the third caller and the copy would have been the fourth vocabulary for one
   * strip. A flag is the smaller thing: the strip stays the same 47px band in
   * the same place, and `+` (adds a week) and *Duplicate week* (writes a week's
   * worth of rows) are the only children of it that edit a program.
   *
   * Everything else here is a VIEW control — which axis, which week, which day,
   * how much of a row to draw — and a read-only screen wants every one of them.
   * The ghost chip especially: *is week 6 different from week 1* is the
   * question a trainer opening somebody's plan is actually asking.
   */
  readOnly?: boolean;
}) {
  return (
    <div className="wsc">
      {/* EACH KEY WRAPS WITH THE CONTROL IT NAMES. The pane is ~790px at 1440
          once the rail and the shelf are paid for, so this row wraps where the
          prototype's page-wide one does not — and a flat row of eight children
          wrapped between `Detail` and its own chips. */}
      {/* ── THE AXIS, FIRST ON THE STRIP ────────────────────────────────
          Before *Week*, because it decides what the week strip beside it
          MEANS: on the week axis it chooses the board, on the day axis it
          chooses which of the cards already on the board is the live one. A
          control that changes the reading of the control next to it goes to
          its left, which is the order the strip is read in. */}
      <div className="wsc__g">
        <span className="wsc__k">View</span>
        <div className="tools" role="group" aria-label="How the board is laid out">
          {(['week', 'day'] as const).map(a => (
            <Chip pressed={axis === a} key={a} onClick={() => onAxis(a)}>
              {a === 'week' ? 'Week' : 'Day'}
            </Chip>
          ))}
        </div>
      </div>

      {/* ── WHICH WEEK, AND ONLY ON THE WEEK AXIS ───────────────────────
          This strip was drawn on both, keyed *Week* on one and *EDITING* on
          the other, and on the day axis it was a mode: eight cards on the
          board, seven of them read-only, and this the control that moved the
          one you were allowed to type in. Every card on a day board writes now
          — the week is read off the card you reach for (`DayCard`'s
          `onActivate`) — so the strip has nothing left to say there. Eight
          numbers in the toolbar answering a question the cards already answer,
          in front of a trainer who never asked to be in a mode, is worse than
          no control. It stays on the WEEK axis, where it is not a mode but the
          only thing that chooses the board. */}
      {axis === 'week' && (
      <div className="wsc__g">
        <span className="wsc__k">Week</span>
        <div className="wk">
          {Array.from({ length: weeks }, (_, i) => i + 1).map(w => (
            <button
              key={w}
              /* A SOLID chip is a week somebody authored; a GHOST chip is a week
                 that repeats week 1. That distinction is the whole model, so the
                 strip draws it — twelve identical chips would be the blank
                 twelve-week grid the phone deliberately refuses. */
              className={authored.has(w) ? 'chip' : 'chip chip--ghost'}
              type="button"
              aria-pressed={week === w}
              onClick={() => setWeek(w)}
            >
              {w}
            </button>
          ))}
          {!readOnly && (
            <Chip
              ghost
              aria-label="Add a week"
              onClick={onAddWeek}
            >
              <PlusIcon size={12} />
            </Chip>
          )}
        </div>
      </div>
      )}


      {/* ── WHICH DAY THE BOARD IS ON ──────────────────────────────────
          Chips and not a `<select>`, for the reason the week strip above is
          chips: a program trains three to five slots, they all fit, and a
          menu would hide behind a click the one number that says what the
          whole board is. `DAY 4` is `ordinalDayWord`'s wording, so the chip
          and the cards it moves agree — and the note under the board carries
          law 1, that a slot is not a weekday. */}
      {axis === 'day' && (
        <div className="wsc__g">
          <span className="wsc__k">Day</span>
          <div className="wk" role="group" aria-label="Which day the board is on">
            {/* `Chip`, where the week strip above is a hand-written button —
                and the difference is `chip--ghost`, which that strip toggles to
                say which weeks are authored. This row has no second state to
                draw, so it takes the component. */}
            {days.map(d => (
              <Chip
                key={d}
                pressed={focusDay === d}
                aria-label={`Day ${d}`}
                onClick={() => onFocusDay(d)}
              >
                {d}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* THE WRITE, BESIDE THE SELECTION IT ACTS ON. See the note where it used
          to live, at the head of `.wsc__gs`.

          ITS OWN GROUP, and not a child of the week strip above, for two
          reasons. `.wk` is the row of weeks and every child of it is one week,
          so a verb in there would read as an eighth number. And the week strip
          is drawn on the WEEK AXIS ONLY — a day board picks its week by the
          card you reach for — while the live week, and so this action, exist on
          both. Inside that block the chip would have vanished the moment a
          trainer switched to *Day*, which is the axis on which copying a week
          forward is easiest to want. */}
      {!readOnly && (
        <div className="wsc__g">
          <Chip onClick={onDuplicateWeek}>
            <CopyIcon size={12} />
            Duplicate week
          </Chip>
        </div>
      )}

      {/* The seven weeks you are NOT looking at, in one sentence, so law 3 is
          read rather than discovered a chip at a time. */}
      {repeats && <span className="wsc__rep">{repeats}</span>}
      {/* The ladder the authored rows actually carry. A reading rather than a
          control since *Set a rule* left the strip — `overloadLine` returns
          null when there is nothing true to say, which is most blocks. */}
      {overload && <span className="wsc__rep">{overload}</span>}

      <span className="wsc__sp" />

      {/* The two RULES travel as one cluster, so when the pane is too narrow for
          one line the break falls at the strip's only real seam — which week you
          are reading, then how it is drawn. */}
      <div className="wsc__gs">
        {/* *Duplicate week* USED TO STAND HERE, and this cluster is the one
            place on the strip it could not be. `.wsc__gs` is the RULES group —
            what the board is showing, and only that: `Detail` adds a line to a
            row and moves nothing. Duplicating a week is the strip's one WRITE,
            and it sat at the far right of the row, unlabelled, 900px from the
            week strip whose selection it acts on. A trainer who has just
            pressed `3` and wants week 3 copied forward was reading left and
            the control was ranged right, against the only group on the strip
            that changes nothing about the program.

            It is beside the week numbers now — same group, same `Week` key —
            where the thing it copies is the thing under the cursor. The old
            note here argued it should carry no key of its own, because *Week ·
            Duplicate week* would repeat the key in the control. That is still
            true and is now the reason it can share the week group's key
            instead of needing one. */}

        {/* DENSITY, NEVER ARRANGEMENT — the prototype's own rule for this pair.
            Full adds the muscle · equipment · level line to each row; it does
            not move a single row. So it is a `data-detail` attribute on the
            plane and one CSS rule, not a second renderer. */}
        <div className="wsc__g">
          <span className="wsc__k">Detail</span>
          <div className="tools" role="group" aria-label="How much of each row to draw">
            {(['compact', 'full'] as const).map(d => (
              <Chip
                pressed={detail === d}
                key={d}
                onClick={() => setDetail(d)}
              >
                {d === 'compact' ? 'Compact' : 'Full'}
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
