'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

import type { ClientPlanData, ExerciseNameWire } from '@/lib/programs/api';
import type { ExerciseWire } from '@/lib/exercises/api';
import { notifyPlanChange, saveClientPlan } from '@/lib/programs/actions';
import { balance, placementOf } from '@/lib/programs/balance';
import { prescribeFor } from '@/lib/programs/prescribe';
import { useBlueprintDraft, patchOf } from '@/lib/programs/draft';
import { useDayReflow } from '@/lib/programs/reflow';
import { entriesFromWorkout, exerciseIdsOf, workoutWireOf } from '@/lib/programs/fromWorkout';
import { fromWire as draftFromWire, toWire as workoutToWire, type Draft } from '@/lib/workouts/draft';
import { fetchExercise } from '@/lib/exercises/actions';
import type { WorkoutTemplateWire } from '@/lib/workouts/api';
import { diffPlans, type DiffRow, type PlanDiff } from '@/lib/programs/diff';
import { withField, type NumField } from '@/lib/programs/weeksheet';
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
  nudge,
  nudgeWorkout,
  overloadLine,
  reindex,
  removeEntries,
  removeWorkout,
  repeatLine,
  replaceWorkout,
  unlinkGroup,
  ordinalDayWord,
  ownWeek,
  updateEntry,
  workoutAt,
  type Entry,
  type ProgressionStep,
} from '@/lib/programs/blueprint';
import { type PlanOrigin } from '@/lib/programs/plan-origin';
import { useToast } from '@/lib/toast/store';
import { TopBar } from '@/components/shell/TopBar';
import { SaveLine, Toolbar, pairNameFor, type Detail } from '@/components/programs/Builder';
import { ExerciseInfoPanel, type ProgramContext } from '@/components/programs/ExerciseInfo';
import { LibraryPanel, type Prescription } from '@/components/programs/LibraryPanel';
import { ProgressionPanel } from '@/components/programs/ProgressionPanel';
import { DuplicateWeekPanel } from '@/components/programs/DuplicateWeekPanel';
import { RowPanel } from '@/components/programs/RowPanel';
import { DotsIcon } from '@/components/programs/Icons';
import { LibraryDock } from '@/components/programs/week/LibraryDock';
import { PhoneProgram } from '@/components/programs/week/PhoneProgram';
import { WeekBoard } from '@/components/programs/week/WeekBoard';
import { WorkoutBuilder } from '@/components/programs/workout/WorkoutBuilder';
import { Button } from '@/web-components/ui/Button';
import { Crumbs } from '@/web-components/ui/Crumbs';
import { Modal, ModalHost } from '@/web-components/ui/Modal';

import { ChangePanel, ChangeSide, type ChangeState } from './ChangePanel';
import { OriginPanel } from './OriginPanel';
import { PlanRail, firstName } from './PlanRail';

/**
 * `/clients/:id/program/:pid` — ONE CLIENT'S OWN COPY OF A PLAN, EDITABLE.
 *
 * ── THE THING THE PRODUCT DID AND COULD NOT SHOW ────────────────────────────
 *
 * Assigning has always made a COPY. `POST /v1/templates/{id}/apply` writes an
 * independent `program` with its own `program_exercise` rows in one
 * transaction, and `ProgramRow` carries the shape — day labels, weeks, training
 * days — precisely so a copy can be changed for one person without the
 * blueprint being consulted again. Every piece of that existed. What did not
 * exist was a screen: the assign panel promised *editing this one will not
 * reach it*, the client file's plan tab said *Open the plan* and sent the
 * trainer to `/programs`, and the only thing a trainer could do to a copy was
 * overwrite it wholesale from the blueprint.
 *
 * So the copy was a thing the product created for good reasons and then gave
 * nobody a way to open. This is that screen, and the rule it is built on is one
 * sentence: **edits here belong to this client and reach nobody else, and edits
 * to the plan they came from reach this copy only when somebody sends them.**
 *
 * ── IT IS THE BUILDER'S BOARD AND NOT THE BUILDER'S SHELL ───────────────────
 *
 * The board, the day card, the library, the row panel, the progression ladder,
 * the balance — all shared, because a day of training is a day of training
 * whichever table it is stored in, and `CertifiedPreview` already established
 * that the line is drawn at the BOARD rather than at the machinery around it.
 * The draft machinery is shared too, and that is newer: `lib/programs/draft.ts`
 * was lifted out of `Builder` for this screen, so the undo stack, the debounce
 * and the `beforeunload` cannot drift apart between the blueprint and the copy.
 *
 * What is NOT shared is the shell, and the difference is the point. There is no
 * shelf — nobody moves between plans here, they move between CLIENTS. There is
 * no *Assign* — this copy is already assigned, to the person whose name is in
 * the corner. There is no *Duplicate* and no *Delete*: the blueprint owns
 * those, and a copy that could be duplicated would be a plan nobody is on. In
 * their place is the one pair of acts a copy has and a blueprint does not —
 * *what is different from the plan this came from*, and *take that plan again*.
 *
 * ── TWO HAND-WRITTEN DESIGN-SYSTEM CLASSES, AND WHY THEY ARE RECORDED ───────
 *
 * `check-components` owns `.ph` and `.split`, and this file writes both by hand
 * — so both are in `component-baseline.json` rather than quietly passing.
 * Neither component can express what this plane needs, and it is the same
 * limitation `Builder` and `CertifiedPreview` already hit:
 *
 * - `PageHeader` renders `.ph__row > div`, and `.ph--builder`'s whole phone
 *   layout is written against `.ph__row.pg__ph > .pg__phm` — `display:contents`
 *   on that middle element is what puts the name, the shape and the save state
 *   on two lines at 390px. A header without those two classes is one that
 *   silently loses that rule.
 * - `Split` is the LIST-DETAIL split: two panes, each wrapped in its own
 *   `.split__scroll`. This is the builder's plane — `.split__r` is
 *   `.pg__builder`, a flex column owning its own scroller, and the third track
 *   exists only because `.split:has(> .dock)` reads a DIRECT child. A scroll
 *   wrapper around either would break both.
 *
 * The ratchet's own header names this case — *"call-sites this cannot fix by
 * fiat"* — and the honest move is to record them with the reason rather than
 * bend a component into a shape it does not have.
 */

type Panel =
  | { kind: 'changes' }
  | { kind: 'row'; uid: string }
  | { kind: 'library'; week: number; day: number }
  | { kind: 'exinfo'; uid: string }
  | { kind: 'progression' }
  | { kind: 'duplicate' }
  | { kind: 'origin' }
  | null;

const ALL_SLOTS = [1, 2, 3, 4, 5, 6, 7];

export function ClientPlan({
  data,
  now,
  /* WHICH SHELF THE TRAINER CAME OFF, and NOT to be confused with `origin`
     below, which is this file's older word for the BLUEPRINT this copy was
     made from. Two different senses of the same English word, one screen: the
     plan this came from, and the list the trainer came from. `plan-origin.ts`
     carries the argument for reading it off the address. */
  from = 'file',
}: {
  data: ClientPlanData;
  now: number;
  from?: PlanOrigin;
}) {
  const router = useRouter();
  const { show } = useToast();
  const { program, client, origin, names: serverNames } = data;

  /* ── THE WAY BACK, AND IT IS TWO DIFFERENT PLACES ─────────────────────────
     A client's copy hangs off two shelves and both are real doors: the client's
     own file, and `/programs` — the list of every client's copy. The screen is
     identical from either, so the crumb is the only thing that can tell a
     trainer which one Back means, and getting it wrong lands them among forty
     strangers with the person they were reading nowhere on the page. That is
     the sentence `/clients/:clientId/assessments/:assessmentId` was split out
     of the book-wide check-in screen to fix, one folder along.

     FROM THE FILE it is three levels — the roster, the person, the leaf — and
     the person's level points at the PROGRAM TAB rather than the file's
     Overview, because a breadcrumb is a RETURN and the tab is the shelf the row
     was clicked in. That is the assessment crumb's rule, restated.

     FROM `/programs` it is two, and the client is deliberately not one of them:
     the trainer did not come through this person's file, the subtitle below
     already says *for {first name}*, and a middle level pointing at a file they
     never opened is a path with a step they did not take. */
  const crumbs =
    from === 'programs'
      ? [{ label: 'Programs', href: '/programs' }, { label: program.name }]
      : [
          { label: 'Clients', href: '/clients' },
          { label: client.name, href: `/clients/${client.id}/program` },
          { label: program.name },
        ];

  /* ── the view ── */
  const [week, setWeek] = useState(1);
  /** WHICH AXIS THE BOARD IS LAID ON — week, or one day across every week.
   *  `Builder`'s own `axis` state carries the argument; it is wired here for
   *  the reason everything else on this screen is: the client's copy is the
   *  same board, and a capability that existed on one and not the other is the
   *  drift this file exists to avoid. It is a stronger reading here, if
   *  anything — *did this client's Tuesday get harder over eight weeks* is a
   *  question about a copy somebody is actually running. */
  const [axis, setAxis] = useState<'week' | 'day'>('week');
  const [focusDay, setFocusDay] = useState(1);
  const [library, setLibrary] = useState<{ day: number } | null>(null);
  const [carrying, setCarrying] = useState<ExerciseWire | null>(null);
  /* FULL BY DEFAULT, and this screen is the case that argument was made for.
     The builder opens Compact because its reader wrote the blueprint an hour
     ago; `CertifiedPreview` opens Full because its reader has never seen the
     program. A trainer opening Meera's plan in week 5 is the second reader more
     often than the first — they are checking what she is on, not recalling what
     they typed. */
  const [detail, setDetail] = useState<Detail>('full');
  const [added, setAdded] = useState<Record<string, ExerciseNameWire>>({});
  const [panel, setPanel] = useState<Panel>(null);
  const [menu, setMenu] = useState(false);

  /* ── READ, THEN EDIT, THEN REVIEW ──────────────────────────────────────────

     This screen used to open straight into the builder with a 900ms autosave
     behind it, which made it the only screen in the product where READING
     somebody's prescription and REWRITING it were the same act. Two things
     were wrong with that, and neither is a matter of taste:

     - **A copy is live.** The blueprint builder autosaves because a blueprint
       is a document nobody is training on yet. This is the plan Meera is
       running on Thursday, and a debounce that fires while the trainer is still
       thinking puts a half-finished session in front of her.
     - **Reading is the common case.** A trainer opens a client's plan far more
       often to check what they are on than to change it, and a screen that
       arms every drag handle and every number field for that reader is one
       where a mis-drop is indistinguishable from an edit.

     So the default is read-only, *Edit plan* arms the board, and the edits
     stage locally until the trainer reads them back in `ChangePanel` and saves.
     `readOnly` did not have to be built for any of it: `WeekBoard`, `DayCard`,
     `DayColumn`, `PhoneProgram` and `AcrossWeeks` all carry the flag already,
     because `CertifiedPreview` needed exactly this shape first. */
  const [editing, setEditing] = useState(false);
  /** How many changes the last save carried. The review panel needs the number
   *  that went over the wire, and the live diff is zero by then. */
  const [savedChanges, setSavedChanges] = useState<number | null>(null);
  /* THE SEND'S STATE IS THE SHELL'S, not the panel's, because there are two
     panels. The desk draws `ChangeSide` inside the board and the phone draws
     `ChangePanel` as a sheet; state held inside either one would reset when the
     window crossed 900px, and a trainer who had just notified somebody would be
     offered the button again. */
  const [notifying, setNotifying] = useState(false);
  /** null while unasked; then whether the client's own settings let it land. */
  const [notified, setNotified] = useState<boolean | null>(null);
  const [notifyError, setNotifyError] = useState<string | null>(null);
  /** The trainer is leaving with unsaved work and has been asked which way. */
  const [leaving, setLeaving] = useState<null | { to: 'read' }>(null);

  /* ── THE WORKOUT DIALOG, AND LAW 5 ARRIVING ON THIS SCREEN ─────────────────

     `AGENTS.md` recorded the gap by name: *"the client's own copy (`ClientPlan`)
     and the certified preview draw containers but hand over no container
     actions — so nothing on those boards opens the dialog."* The board has
     drawn every session as a container since law 5; clicking one did nothing
     here while the identical card on `/programs/:id` opened the whole session
     on one screen.

     Every function below is `Builder`'s, unchanged in substance — same
     `blueprint.ts` writes, same `workoutWireOf` → `fromWire` → `toWire` →
     `entriesFromWorkout` round trip, same `reflow` on the four writes that
     re-place a card. That is deliberate rather than lazy: two implementations
     of *what happens when a session is dragged onto another day* is exactly the
     drift the shared board was built to prevent. What is NOT shared is the
     shell around them, which is this file's standing rule. */

  /** A brand-new session being written onto this day, or null. */
  const [workoutDay, setWorkoutDay] = useState<number | null>(null);
  /** An existing container reopened in the dialog. NOT called `editing` —
   *  that is this screen's read/write mode, and `Builder`'s own name for this
   *  state would shadow it. */
  const [workoutEdit, setWorkoutEdit] = useState<{ workoutId: string; initial: Draft } | null>(
    null,
  );
  /** The session on the clipboard. Every other day draws *Paste it*. */
  const [copied, setCopied] = useState<{
    workoutId: string;
    name: string;
    day: number;
    week: number;
  } | null>(null);

  /* ── A BOARD THAT RE-PLACES ITSELF, ANIMATED ───────────────────────────────
     `lib/programs/reflow.ts`, which is the builder's own machinery — the view
     transition scoped to this scroller, the `flushSync`, the `html.vt-days`
     window and the before-paint reveal. This screen shipped without it and the
     cards teleported here exactly as they teleported in the builder; it is the
     same board, so it gets the same wiring. */
  const { plane, reflow, armed: vtArmed } = useDayReflow({ libraryDay: library?.day ?? null });

  /* ── the draft ──
     `source` is memoised on the two fields the adopt rule reads plus the rows
     themselves: a fresh object literal every render would re-run the effect on
     every keystroke, and while the stamp guard inside makes that harmless it is
     harmless by accident. */
  const source = useMemo(
    () => ({
      id: program.id,
      updatedAt: program.updatedAt,
      exercises: data.exercises,
      dayLabels: program.dayLabels,
      weeks: program.weeks,
      trainingDays: program.trainingDays,
    }),
    [program, data.exercises],
  );

  /* THE VERSION THE NEXT SAVE CARRIES as `If-Match` (R46/R82). Each save returns
     the new one; a fresh server render (another tab, a revalidate) replaces it. */
  const version = useRef(program.version);
  const seenVersion = useRef(program.version);
  if (seenVersion.current !== program.version) {
    seenVersion.current = program.version;
    version.current = program.version;
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
    baseline,
    discard,
  } = useBlueprintDraft({
    source,
    /* NOT AUTOSAVED, and it is the one line that makes this screen different
       from the builder. See the `editing` note above and `autosave`'s own. */
    autosave: false,
    /* THE OTHER TABLE, and that is the whole difference between this screen and
       the builder. `PUT /v1/programs/:id/exercises` replaces this copy's rows
       and deliberately does NOT move `synced_at` — tuning a copy is not the
       same act as taking the blueprint, and the assignment list on
       `/programs/:id` must go on saying so. */
    save: async patch => {
      const result = await saveClientPlan(client.id, program.id, version.current, patch);
      if (!result.ok) return result;
      version.current = result.value.version;
      return { ok: true, value: null };
    },
    onAdopt: () => {
      setLibrary(null);
      setPanel(null);
      /* A NEWER SERVER VERSION LANDED AND TOOK THE DRAFT WITH IT. Staying in
         edit mode over rows the trainer never saw would be offering to save
         somebody else's work as their own, so the screen drops back to reading
         and they can decide what to change against what is actually there. */
      setEditing(false);
      setSavedChanges(null);
      setLeaving(null);
    },
  });

  /* ── keyboard ─────────────────────────────────────────────────────────────
     The builder's ladder, and this screen shipped without it for one render —
     found by pressing Escape over the open diff panel and watching nothing
     happen. Every surface in this product answers Escape, and a panel that does
     not is the one a trainer tries to close twice.

     ONE RUNG PER PRESS, topmost first. Every surface that owns an inner step —
     the library dock, the phone's levels — consumes Escape in CAPTURE, so it
     never reaches this and closes two things at once. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        /* ⌘Z IS AN EDIT, so it is armed with the board and not before it. On a
           read-only screen the stack is empty anyway and `undo` is a no-op; the
           guard is for what the chord MEANS, since a browser-level undo is what
           a trainer reading a plan expects the key to do. */
        if (!editing) return;
        e.preventDefault();
        undo();
      } else if (e.key === 'Escape') {
        /* The exit prompt is NOT a rung here. It is a `ModalHost`, which binds
           Escape in capture and answers first — a rung for it would close it
           twice. See trap 49. */
        if (menu) setMenu(false);
        else if (copied) setCopied(null);
        else if (library) setLibrary(null);
        else if (panel) setPanel(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, panel, library, menu, editing, copied]);

  /* ── derived ── */
  const shown = effectiveWeek(entries, week);
  const sourceWeek = shown.repeat ? 1 : week;
  const names = useMemo(() => ({ ...serverNames, ...added }), [serverNames, added]);
  const weekBalance = useMemo(
    () => balance(shown.rows, days, sourceWeek, names),
    [shown.rows, days, sourceWeek, names],
  );
  /** The day the day axis is on, and what sits there week by week. Derived
   *  rather than corrected, and law 3 resolved before the board sees it —
   *  `Builder`'s two notes carry both arguments. */
  const dayShown = days.includes(focusDay) ? focusDay : days[0] ?? 1;
  const weekOfDay = useCallback(
    (w: number) => {
      const eff = effectiveWeek(entries, w);
      return { rows: entriesFor(eff.rows, eff.repeat ? 1 : w, dayShown), repeat: eff.repeat };
    },
    [entries, dayShown],
  );

  /* ── AND WHAT THIS COPY SAYS THAT THE BLUEPRINT DOES NOT ───────────────────
     Computed off the DRAFT rather than off `data.exercises`, so the count moves
     as the trainer types: swap an exercise and the pill reads *4 changes*
     before the autosave has fired. The blueprint is a snapshot from the server
     and only moves when the page reloads, which is correct — it is somebody
     else's document. */
  const diff: PlanDiff | null = useMemo(() => {
    if (!origin) return null;
    const mine = patchOf(entries, labels, days, weeks);
    return diffPlans({
      base: origin.exercises as DiffRow[],
      copy: (mine.exercises ?? []) as DiffRow[],
      baseShape: {
        weeks: origin.weeks,
        trainingDays: origin.trainingDays,
        dayLabels: origin.dayLabels,
      },
      copyShape: { weeks, trainingDays: days, dayLabels: labels },
      nameOf: id => names[id]?.name ?? 'an exercise',
    });
  }, [origin, entries, labels, days, weeks, names]);

  /** The blueprint has moved since this copy last took it. `syncedAt` and NOT
   *  `updatedAt`, for the reason `ProgramRow` gives: this copy's own stamp
   *  moves every time the trainer edits it here, and an edit is not a sync. */
  const moved = Boolean(origin && (program.syncedAt ?? program.createdAt) < origin.updatedAt);

  /* ── AND WHAT THIS EDIT SESSION CHANGED, WHICH IS A DIFFERENT QUESTION ─────

     The same `diffPlans` as the block above, handed a different base. That one
     is measured against the BLUEPRINT and answers *how is this person's plan
     tuned*; this one is measured against `baseline` — the last state the server
     acknowledged — and answers *what am I about to do to them*. `ChangePanel`'s
     own header carries the argument for keeping both.

     `nameOf` matters more here than there: a movement added and reviewed in the
     same session is one the server has never been asked about, so the name
     comes from `names`, which already merges `added`. Without that the review
     list would read *added an exercise* for the one row the trainer most wants
     to see named. */
  const changes: PlanDiff = useMemo(() => {
    const before = patchOf(baseline.entries, baseline.labels, baseline.days, baseline.weeks);
    const after = patchOf(entries, labels, days, weeks);
    return diffPlans({
      base: (before.exercises ?? []) as DiffRow[],
      copy: (after.exercises ?? []) as DiffRow[],
      baseShape: {
        weeks: baseline.weeks,
        trainingDays: baseline.days,
        dayLabels: baseline.labels,
      },
      copyShape: { weeks, trainingDays: days, dayLabels: labels },
      nameOf: id => names[id]?.name ?? 'an exercise',
    });
  }, [baseline, entries, labels, days, weeks, names]);

  /** Genuinely unsaved work. `save` alone is not enough: a failed save leaves
   *  the state `failed` with real edits behind it, and an undo back to the
   *  baseline leaves it `dirty` with nothing to save. The diff is the truth. */
  const unsaved = changes.total > 0;

  /* ── entering, leaving, and saving ──────────────────────────────────────── */

  const startEditing = useCallback(() => {
    setEditing(true);
    setSavedChanges(null);
    setNotified(null);
    setNotifyError(null);
    /* AND NOTHING IS OPENED. The review panel arrives WITH the mode on a desk,
       because `ChangeSide` is the board's own right column from the first
       frame — there is nothing to open and nothing to go and find.

       It deliberately does not open the DOCK either, which is what this used to
       do: on a desk that would draw the same list twice, once in the board and
       once in a 380px track stealing the width the collapsed rail just gave
       back. The dock is the phone's surface and the phone opens it from the
       header menu. */
    setLibrary(null);
    setPanel(null);
  }, []);

  /** Back to reading. Only ever called once there is nothing unsaved — the
   *  guard below is what stands between an edit and this. */
  const stopEditing = useCallback(() => {
    setEditing(false);
    setSavedChanges(null);
    setNotified(null);
    setNotifyError(null);
    setLeaving(null);
    setLibrary(null);
    setPanel(null);
  }, []);

  /** *Done*, and the one place the exit prompt is raised. */
  const askToLeave = useCallback(() => {
    if (unsaved) setLeaving({ to: 'read' });
    else stopEditing();
  }, [unsaved, stopEditing]);

  const notifyNow = useCallback(async () => {
    setNotifying(true);
    setNotifyError(null);
    const result = await notifyPlanChange(program.id);
    setNotifying(false);
    if (result.ok) setNotified(result.value.sent);
    else setNotifyError(result.message);
  }, [program.id]);

  const saveNow = useCallback(async (): Promise<boolean> => {
    /* READ BEFORE THE AWAIT. `flush` is what moves the baseline, so by the time
       it resolves `changes.total` is on its way to zero. */
    const carried = changes.total;
    /* AND THE COUNT IS RECORDED ONLY ON A SAVE THAT LANDED — `flush` keeps the
       draft and reports false when the write is refused, and recording
       regardless would flip the panel into its *saved, tell them?* state over
       work that is still sitting in the browser. */
    const ok = await flush();
    if (ok) setSavedChanges(carried);
    return ok;
  }, [changes.total, flush]);

  const selected = useMemo(
    () => (panel?.kind === 'row' ? entries.find(e => e.uid === panel.uid) ?? null : null),
    [panel, entries],
  );
  const infoRow = useMemo(
    () => (panel?.kind === 'exinfo' ? entries.find(e => e.uid === panel.uid) ?? null : null),
    [panel, entries],
  );

  /* ── WHAT A DAY IS CALLED HERE, AND IT IS NOT `DAY 2` ─────────────────────

     Law 1 holds for a BLUEPRINT: its days are ordinal slots, because it is
     written for nobody in particular and cannot know which weekday anybody
     trains on. A copy is the other case and the server has always known it —
     `apply` translates every row through the schedule the trainer chose, so
     `day_of_week` on a `program_exercise` is a concrete ISO weekday.

     So on that screen `DAY 2` would not mean the second day of the plan. It
     would mean Tuesday, which on a Tue/Fri client is the FIRST session of their
     week — a number that reads as an ordinal and means a weekday, which is
     worse than either alone. The board takes `weekdayWord` there and names the
     real day; the builder passes nothing and keeps the ordinal.

     ── AND THIS TREE IS THE ONE THAT DIVERGES ──────────────────────────────

     **The mock's `apply` does not translate.** `mock/router.ts` copies every
     blueprint row into `program_exercise` with its ordinal day intact, where
     the product's `copyBlueprintInto` maps it through the client's schedule. So
     on THIS wire a copy's days are still slots, and naming them Monday and
     Tuesday would be the invention the product's version exists to avoid —
     pointing in the opposite direction.

     `ordinalDayWord` is therefore passed explicitly rather than by omission:
     the default would read as nobody having thought about it, and this is the
     one line where the two trees deliberately differ. **Fixing the mock is the
     better end state** — a mock whose wire disagrees with the product's is a
     mock that will eventually teach a screen something false — and it is a
     seed-and-router change rather than a UI one: apply must translate, the seed
     must write weekdays, and `/me/plan`'s day lookups move with them. */
  const dayName = useCallback(
    (day: number) => {
      /* The same word the board draws, for the same reason — this sentence is
         read beside it, in the exercise panel, about the same day. */
      const label = labels[String(day)];
      const word = ordinalDayWord(day);
      return label ? `${word} · ${label}` : word;
    },
    [labels],
  );

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

  const freeSlots = ALL_SLOTS.filter(s => !days.includes(s));
  const nextFreeSlot = freeSlots[0] ?? null;

  /** EVERYTHING BOTH REVIEW CHROMES READ, in one object. `ChangeSide` and
   *  `ChangePanel` are the same content in two wrappers and this is what keeps
   *  them from becoming two screens. */
  const changeState: ChangeState = {
    clientName: client.name,
    diff: changes,
    save,
    saveError,
    savedChanges,
    notified,
    notifying,
    notifyError,
    onSave: () => void saveNow(),
    onDiscard: discard,
    onNotify: () => void notifyNow(),
  };

  /* ── the writes ── */

  /** A movement the server has never been asked about — the dock hands over the
   *  whole row, so it is merged in here rather than waiting for a reload. */
  function remember(list: { id: string; name: string; muscleGroup: string | null; bodyPart: string | null; target: string | null; equipment: string | null; movementPattern: string | null; level: string | null; isCustom?: boolean }[]) {
    setAdded(prev => {
      const next = { ...prev };
      for (const ex of list) {
        next[ex.id] = {
          id: ex.id,
          name: ex.name,
          muscleGroup: ex.muscleGroup,
          bodyPart: ex.bodyPart,
          target: ex.target,
          equipment: ex.equipment,
          movementPattern: ex.movementPattern,
          level: ex.level,
          isCustom: ex.isCustom ?? false,
        };
      }
      return next;
    });
  }

  /** The builder's own, and it must stay its own: `commit` drops a write that
   *  changed nothing, so a blur with the same number in the box costs no undo
   *  step and no autosave. */
  /**
   * WRITE INTO THE WEEK ON SCREEN, WHOEVER WROTE IT — `Builder.commitOwn` is
   * the same function and carries the whole argument. The short version: law 3
   * is a storage rule, not a permission, so a week with nothing of its own
   * becomes its own on the first write and `id` moves the id the click was
   * carrying onto the copy.
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

  function addOne(day: number, exercise: ExerciseWire, before: string | null = null) {
    remember([exercise]);
    const rx = prescribeFor(exercise);
    /* THE LANE IS READ AFTER THE WEEK IS MADE ITS OWN — `Builder.addOne` has
       the argument: on a materialising week the rows in `entries` are week 1's
       and the ones this row is joining are the copies. */
    commitOwn((prev, id) => {
      const lane = entriesFor(prev, week, day);
      const above = before === null ? null : lane.find(e => e.uid === id(before));
      const order = above ? above.order - 0.5 : Math.max(-1, ...lane.map(e => e.order)) + 1;
      /* The container it joins — law 5, and the argument is `Builder.addOne`'s. */
      const host = hostWorkout(lane, above);
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

  function addBatch(items: Prescription[], toWeek: number, toDay: number) {
    if (items.length === 0) return;
    remember(items.map(i => i.exercise));
    const write = (prev: Entry[]) => {
    const lane = entriesFor(prev, toWeek, toDay);
    const tail = Math.max(-1, ...lane.map(e => e.order)) + 1;
    const host = hostWorkout(lane);
    return (
      addEntries(
        prev,
        items.map((item, i) => ({
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
          setDetail: null,
        })),
      )
    );
    };
    if (toWeek === week) commitOwn(write);
    else commit(write);
    setPanel(null);
  }

  /* ── THE CONTAINER'S OWN WRITES ─ `Builder`'s, and deliberately so ──────

     Each one is one line of model from `blueprint.ts` and the rest is the
     bookkeeping the model does not do: what closes, what the toast says, where
     the trainer is left looking. `Builder` carries the long-form argument for
     every one of them; the notes here say only what is different on a COPY.  */

  /** Name what was never named, at the moment it stops being obvious. A
   *  pre-law-5 container is drawn under the day's label, which is unambiguous
   *  for exactly as long as it is alone on that day. `Builder.nameTheUnnamed`
   *  carries the whole argument. */
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

  /** Every movement a session brings with it is one this screen has never heard
   *  of — drawn *Exercise not in your library* and counted for nothing by
   *  `balance()` until it is asked for. `remember` is the one overlay both the
   *  dock and the dialog write through. */
  async function learnNames(workout: WorkoutTemplateWire) {
    const unknown = exerciseIdsOf(workout).filter(id => !names[id]);
    if (unknown.length === 0) return;
    const rows = await Promise.all(unknown.map(id => fetchExercise(id)));
    remember(rows.filter((row): row is ExerciseWire => Boolean(row)));
  }

  /** Reopen the dialog on a container already on a day — the click the user
   *  asked for, and the one thing this board drew and could not do. */
  function editWorkout(workoutId: string) {
    const found = workoutAt(entries, workoutId);
    if (!found) return;
    const title = found.workout.name || labels[String(found.day)] || 'Workout';
    setPanel(null);
    setLibrary(null);
    /* THROUGH THE WIRE SHAPE AND `fromWire`, never a second translator — the
       draft's uid minting belongs to `lib/workouts/draft.ts` and stays there. */
    setWorkoutEdit({
      workoutId,
      initial: draftFromWire(workoutWireOf(found.workout.entries, title), names),
    });
  }

  /** What the dialog wrote, back into the container it came from. */
  function landEdit(workoutId: string, draft: Draft) {
    const found = workoutAt(entries, workoutId);
    setWorkoutEdit(null);
    if (!found) return;
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
       rows on SCREEN, which on a repeating week are week 1's — so a
       `replaceWorkout` aimed at that id would rewrite week 1's session while
       the trainer watched week 4. `mapId` moves both onto the week that has
       just become its own. */
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
   * A WHOLE SESSION WRITTEN FROM NOTHING, LANDED ON A DAY.
   *
   * `Builder.landWorkout`, and the one sentence that differs is the toast's:
   * there, the session is also saved to the Workouts shelf and the confirm says
   * so. It is saved here too — `WorkoutBuilder`'s `onSaved` is what does it and
   * it is the same dialog — and that is right rather than a leak: a session
   * written for one client is still a session the trainer may want on Tuesday
   * for somebody else. What does NOT travel is the edit: see `onLocalSave`.
   */
  function landWorkout(day: number, workout: WorkoutTemplateWire) {
    const count = entriesFromWorkout(workout, { day, week, from: 0 }).length;
    if (count > 0) {
      commitOwn(prev => {
        const lane = entriesFor(prev, week, day);
        const from = Math.max(-1, ...lane.map(e => e.order)) + 1;
        const additions = entriesFromWorkout(workout, { day, week, from });
        if (additions.length === 0) return prev;
        return addEntries(nameTheUnnamed(prev, day), additions);
      });
    }
    setWorkoutDay(null);
    void learnNames(workout);
    show({
      tone: 'ok',
      title: <>{workout.name} added</>,
      body: (
        <>
          {count === 1 ? '1 exercise' : `${count} exercises`} on{' '}
          {ordinalDayWord(day).toLowerCase()} of {firstName(client.name)}&rsquo;s plan. It is on
          your Workouts shelf too, to reuse.
        </>
      ),
    });
  }

  /** Arm the paste. Nothing is written until a day is chosen. */
  function copyWorkout(workoutId: string) {
    const found = workoutAt(entries, workoutId);
    if (!found) return;
    setCopied({
      workoutId,
      name: found.workout.name || labels[String(found.day)] || 'this workout',
      day: found.day,
      /* THE WEEK ON SCREEN, not `found.week` — on a repeating week the container
         under the pointer is week 1's, and the flag marks the card the trainer
         armed the copy from. */
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

  function duplicateRow(uid: string) {
    commitOwn((prev, id) => {
      const row = prev.find(e => e.uid === id(uid));
      if (!row) return prev;
      return reindex([...prev, { ...row, uid: newUid(), order: row.order + 0.5, groupId: null }]);
    });
  }

  function addDay(slot: number) {
    if (days.includes(slot)) return;
    setDays([...days, slot].sort((a, b) => a - b));
    setLabels(prev => ({ ...prev, [String(slot)]: prev[String(slot)] ?? '' }));
  }

  const canAddWeek = weeks < 52;
  const addWeek = () => setWeeks(w => Math.min(52, w + 1));
  const copyWeekTo = (to: number) => commit(prev => copyWeek(prev, sourceWeek, to));
  const repeatWeek = () =>
    commit(prev => removeEntries(prev, new Set(prev.filter(e => e.week === week).map(e => e.uid))));

  const openPanel = (next: NonNullable<Panel>) => {
    setLibrary(null);
    setPanel(next);
  };

  /** The identical vocabulary the builder hands its two shells — one object, so
   *  a row action cannot exist on the desk and not on the phone. */
  const rowActions = {
    onOpenRow: (entry: Entry) => openPanel({ kind: 'row', uid: entry.uid }),
    onInfoRow: (entry: Entry) => openPanel({ kind: 'exinfo', uid: entry.uid }),
    /* THROUGH `commitOwn`, AND THE ID IS TRANSLATED — see its note. */
    onNudge: (entry: Entry, d: -1 | 1) => commitOwn((prev, id) => nudge(prev, id(entry.uid), d)),
    onLink: (entry: Entry) => commitOwn((prev, id) => linkWithNext(prev, id(entry.uid))),
    onUnlink: (groupId: string) => commitOwn((prev, id) => unlinkGroup(prev, id(groupId))),
    onDuplicateRow: (entry: Entry) => duplicateRow(entry.uid),
    onRemoveRow: (entry: Entry) =>
      commitOwn((prev, id) => removeEntries(prev, new Set([id(entry.uid)]))),
    moveTargets: days,
    onMoveRowTo: (entry: Entry, to: number) =>
      commitOwn((prev, id) => moveEntries(prev, new Set([id(entry.uid)]), week, to)),
    copyTargets: ALL_SLOTS,
    onCopyDayTo: (from: number, to: number) => {
      if (!days.includes(to)) addDay(to);
      commitOwn(prev => copyDay(prev, week, from, to));
    },
    onClearDay: (day: number) =>
      commitOwn(prev =>
        removeEntries(prev, new Set(entriesFor(prev, week, day).map(e => e.uid))),
      ),
    onRemoveDay: (day: number) => {
      setDays(prev => prev.filter(d => d !== day));
      if (library?.day === day) setLibrary(null);
      commit(prev => reindex(prev.filter(e => e.day !== day)));
    },
  };

  return (
    <>
      {/* THE BAR NAMES WHERE THIS CAME FROM AND IS THE WAY BACK TO IT — which
          here is the CLIENT'S FILE and not the plan shelf. A trainer reaches
          this screen from one person's file, and the plan they are editing has
          no meaning apart from that person. `CertifiedPreview` makes the same
          call for its own section and records the measurement: the name goes
          in the `<h1>`, where it can wrap, and the bar takes the word the
          screen does not otherwise say. */}
      {/* AND THE PHONE'S DOOR TURNS WITH IT. `titleHref` is the small screen's
          only back control — `.top__title--back` is styled inside
          `@media (max-width:900px)` and nowhere else — so a bar still pointing
          at the client file while the crumb points at `/programs` would be the
          two halves of one shell disagreeing about where the trainer came
          from. `titleHref`'s own rule holds either way: the pair is a return,
          so the word is the DESTINATION and not this screen. */}
      {from === 'programs' ? (
        <TopBar
          crumb={`Fitness · Programs · ${program.name}`}
          title="Programs"
          titleHref="/programs"
        />
      ) : (
        <TopBar
          crumb={`Clients · ${client.name} · ${program.name}`}
          title={client.name}
          titleHref={`/clients/${client.id}/program`}
        />
      )}

      <main className="main body--flush pg pg--plan" id="main-content">
        {/* `ph--builder` FOR THE PHONE GRID, `ph--plan` FOR THE ONE THING THIS
            HEADER DOES NOT SHARE WITH IT. See the pair of rules in `app.css`:
            the builder hides its `<h1>` under 900px because `ProgramSwitcher`
            takes its place, and this screen has no switcher — there is one plan
            and one client, and nothing to switch between. Without the second
            class the phone header drew an EMPTY left half with a lone lime
            *Done* floating in it and the plan's name nowhere on the screen. */}
        <div className="ph ph--builder ph--plan">
          <div className="ph__row pg__ph">
            <div className="pg__phm">
              {/* FIRST CHILD OF `.pg__phm`, WHICH IS WHERE BOTH PROGRAM SCREENS
                  PUT IT — the builder and the certified preview draw the same
                  nav in the same slot with the same class, and `app.css` owns
                  the two rules that make it work here for free: `.pg__crumbs`
                  for the 24px-plus-2 of link, and `.pg .pg__crumbs{flex:1 0
                  100%}` under `@media (max-height:700px)`, where `.pg__phm`
                  becomes a wrapping flex row and an unclaimed nav would sit
                  INLINE between the name and the shape line. `.main` here
                  carries `pg`, so neither has to be restated.

                  AND IT IS GONE ON A PHONE with nothing new written either:
                  this header carries `ph--builder`, so
                  `.ph--builder .pg__crumbs{display:none}` already covers it —
                  under 900px the bar draws the door above, and `.pg__phm` is
                  `display:contents` into a named-area grid where an unplaced
                  child would push the whole header down a row. */}
              <Crumbs className="pg__crumbs" items={crumbs} />
              <h1 className="ph__t">{program.name}</h1>
              <p className="ph__sub">
                <span className="pg__shape">
                  {/* THIS PERSON'S SHAPE, which is not the blueprint's. A copy
                      that runs nine weeks for one client while the blueprint
                      runs eight is the feature, so the counts are read off the
                      DRAFT and the third clause names the client rather than a
                      count of clients — there is exactly one, and it is the
                      only reason this screen exists. */}
                  <span>
                    {days.length} day{days.length === 1 ? '' : 's'} a week
                  </span>
                  <span>
                    {weeks} week{weeks === 1 ? '' : 's'}
                  </span>
                  <span className="pg__shapecl">for {firstName(client.name)}</span>
                </span>
                <span className="pg__sep" aria-hidden="true">
                  ·
                </span>
                <span className="pg__save">
                  {/* THE DIFF DECIDES, NOT THE DIRTY FLAG. `commit` marks the
                      draft dirty on every write and has no way to notice that
                      twenty of them cancelled out, so a trainer who edits a
                      number and undoes it sits on `dirty` with nothing to save
                      — and this line said *unsaved changes* beside a review
                      panel correctly reporting none and a Save button correctly
                      disabled. Three readings of one fact, one of them wrong.
                      `saving` and `failed` are passed through untouched: both
                      are facts about a request, which no diff can see. */}
                  <SaveLine
                    state={save === 'dirty' && !unsaved ? 'clean' : save}
                    savedAt={savedAt}
                    error={saveError}
                    onRetry={() => void flush()}
                  />
                </span>
              </p>
            </div>

            <div className="ph__acts">
              {/* ── THE ACTION ROW IS TWO ROWS, ONE PER MODE ─────────────────
                  Reading and editing are asked different questions, so they get
                  different verbs rather than one row with things greyed out.
                  Both keep exactly ONE primary, which is the row's whole job:
                  *Edit plan* while reading, *Done* while editing.

                  `Open {origin}` is drawn only while READING. It is a
                  navigation away from a screen that now holds unsaved work, and
                  a link that can silently discard an edit does not belong beside
                  the edit. The header menu keeps it at every width. */}
              {!editing && (
                <>
                  {/* THE ONE FACT THIS SCREEN HAS THAT NO OTHER SCREEN DOES, and
                      it is a control rather than a tag because the interesting
                      half is always the next question: *what is different?* */}
                  <Button
                    variant="secondary"
                    className="pg__act--desk"
                    onClick={() => openPanel({ kind: 'origin' })}
                  >
                    {diff && diff.total > 0
                      ? `Tuned · ${diff.total} ${diff.total === 1 ? 'change' : 'changes'}`
                      : moved
                        ? 'The plan has moved'
                        : 'Matches the plan'}
                  </Button>
                  {origin && (
                    <Button
                      variant="secondary"
                      className="pg__act--desk"
                      href={`/programs/${origin.id}`}
                    >
                      Open {origin.name}
                    </Button>
                  )}
                </>
              )}

              {/* NO *Your changes* BUTTON WHILE EDITING, and its absence is the
                  point. `.pg__act--desk` is a desk-only control, and on a desk
                  the review panel is already the board's right column — a button
                  that opens what is on screen is the false affordance §22
                  records. The phone, where the list IS behind a press, carries
                  it in the header menu at the width the menu is the only
                  control. */}
              {/* ── THE ONE PRIMARY, AND IT MEANS TWO DIFFERENT THINGS ──────

                  READING · *Edit plan* arms the board. It is the verb this
                  screen exists for and the only one that changes what every
                  other control on it does, so it is the primary and it is not
                  duplicated anywhere at this width.

                  EDITING · *Done* puts the board back to read-only. It goes
                  through `askToLeave`, never straight to `stopEditing`: the
                  draft is local, so leaving edit mode with work in it would
                  discard that work silently, which is the one thing staging was
                  built to prevent.

                  BOTH STAND DOWN ON A PHONE, which the *Done* that used to live
                  here already did, and the reason transfers: `.pg__act--desk`
                  is ~61px of a 366px row, and the header menu two pixels away
                  carries both verbs at every width. */}
              {editing ? (
                <Button variant="primary" className="pg__act--desk" onClick={askToLeave}>
                  Done
                </Button>
              ) : (
                <Button variant="primary" className="pg__act--desk" onClick={startEditing}>
                  Edit plan
                </Button>
              )}

              <div className="pg__hdmenu">
                <Button
                  variant="ghost"
                  iconOnly
                  label="More actions for this plan"
                  aria-expanded={menu}
                  onClick={() => setMenu(v => !v)}
                  title={undefined}
                  icon={<DotsIcon />}
                />
                {menu && (
                  <div className="pg__hdscrim" role="presentation" onClick={() => setMenu(false)} />
                )}
                {menu && (
                  <div className="menu" role="menu">
                    {/* THE MODE VERB IS THE MENU'S FIRST ROW AND IS DRAWN AT
                        EVERY WIDTH — no `--phone`. The header button beside it
                        is desk-only, so on a phone this is the only door into
                        editing, and a row that vanished at 901px would be a
                        capability the two widths disagree about. */}
                    {editing ? (
                      <>
                        <button
                          className="menu__i"
                          role="menuitem"
                          type="button"
                          onClick={() => {
                            setMenu(false);
                            openPanel({ kind: 'changes' });
                          }}
                        >
                          {unsaved
                            ? `Review ${changes.total} ${changes.total === 1 ? 'change' : 'changes'}`
                            : 'Your changes'}
                        </button>
                        <button
                          className="menu__i"
                          role="menuitem"
                          type="button"
                          onClick={() => {
                            setMenu(false);
                            askToLeave();
                          }}
                        >
                          Done editing
                        </button>
                      </>
                    ) : (
                      <button
                        className="menu__i"
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          setMenu(false);
                          startEditing();
                        }}
                      >
                        Edit plan
                      </button>
                    )}
                    <div className="menu__sep" />
                    <button
                      className="menu__i menu__i--phone"
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setMenu(false);
                        openPanel({ kind: 'origin' });
                      }}
                    >
                      What is different from the plan
                    </button>
                    {origin && (
                      <Link className="menu__i menu__i--phone" role="menuitem" href={`/programs/${origin.id}`}>
                        Open {origin.name}
                      </Link>
                    )}
                    {/* UNDO IS DRAWN WHILE EDITING AND NOWHERE ELSE. Reading, the
                        stack is empty by construction and the row would be a
                        permanently disabled control explaining nothing. */}
                    {editing && (
                      <>
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
                          Undo <kbd className="pg__chord">⌘Z</kbd>
                        </button>
                      </>
                    )}
                    <div className="menu__sep" />
                    <Link className="menu__i" role="menuitem" href={`/clients/${client.id}/program`}>
                      Back to {firstName(client.name)}&rsquo;s file
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── THE BLUEPRINT HAS MOVED, SAID ONCE, WHERE IT CANNOT BE MISSED ──
            The mirror image of the push prompt on `/programs/:id`: there the
            trainer has edited a plan thirteen people are on and is asked
            whether to send it; here one of those thirteen copies is open and
            has not received it. Neither one propagates anything. Both name the
            act and leave it to the trainer. */}
        {moved && origin && (
          <p className="pg__flash cplan__moved" role="status">
            <span>
              <b>{origin.name}</b> has changed since {firstName(client.name)} took this copy.
              Nothing has reached them.
            </span>
            <Button variant="secondary" size="sm" onClick={() => openPanel({ kind: 'origin' })}>
              See what is new
            </Button>
          </p>
        )}

        <div className="split">
          <PlanRail
            collapsed={editing}
            data={data}
            now={now}
            diff={diff}
            moved={moved}
            from={from}
            onOpenDiff={() => openPanel({ kind: 'origin' })}
          />

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
              onDuplicateWeek={() => openPanel({ kind: 'duplicate' })}
              axis={axis}
              onAxis={next => {
                setAxis(next);
                setLibrary(null);
              }}
              days={days}
              focusDay={dayShown}
              onFocusDay={setFocusDay}
              readOnly={!editing}
            />

            <div className="pgw" ref={plane}>
              <div className="pgw__desk">
                <WeekBoard
                  days={days}
                  labels={labels}
                  dayWord={ordinalDayWord}
                  detail={detail}
                  rows={shown.rows}
                  names={names}
                  week={week}
                  repeat={shown.repeat}
                  balance={weekBalance}
                  entriesForDay={day => entriesFor(shown.rows, sourceWeek, day)}
                  /* ── THE OTHER AXIS — `WeekBoard.axis` carries it. ─────── */
                  axis={axis}
                  weekCount={weeks}
                  focusDay={dayShown}
                  weekOf={weekOfDay}
                  onPickWeek={setWeek}
                  /* THE DAY MENU'S *Name this day*, written on the card's own
                     header — see `DayCardProps.onRelabel`. */
                  onRelabel={(d, value) => setLabels(prev => ({ ...prev, [String(d)]: value }))}
                  library={library}
                  onOpenLibrary={d => {
                    if (!editing) return;
                    setPanel(null);
                    setLibrary({ day: d });
                  }}
                  onAddExercise={addOne}
                  carrying={carrying}
                  onCarry={setCarrying}
                  onAddDay={
                    !editing || nextFreeSlot == null ? undefined : () => addDay(nextFreeSlot)
                  }
                  /* ── LAW 5's CONTAINER ACTIONS, ARMED ONLY WHILE EDITING ─────

                     `Builder` wires exactly these and they behave identically,
                     which is the point: one board, one vocabulary. Handing them
                     over `undefined` while reading is what keeps the read-only
                     card a summary — `DayCard` tests each handler and draws the
                     control only where there is one behind it.

                     The four that RE-PLACE a card go through `reflow`, and
                     `onDropWorkout` passes `names:false` when the container
                     changes day: a card that moves between days is a different
                     DOM node afterwards, and a duplicate `view-transition-name`
                     inside the update callback makes Chrome refuse the whole
                     transition. `DayReflow.reflow` carries the measurement. */
                  onEditWorkout={editing ? editWorkout : undefined}
                  onCopyWorkout={editing ? copyWorkout : undefined}
                  onNudgeWorkout={
                    editing
                      ? (workoutId, direction) =>
                          reflow(() =>
                            commitOwn((prev, id) => nudgeWorkout(prev, id(workoutId), direction)),
                          )
                      : undefined
                  }
                  onRemoveWorkout={
                    editing
                      ? workoutId =>
                          reflow(() => commitOwn((prev, id) => removeWorkout(prev, id(workoutId))))
                      : undefined
                  }
                  copied={editing ? copied : null}
                  onPasteWorkout={editing ? pasteWorkout : undefined}
                  onCancelCopy={() => setCopied(null)}
                  onDropWorkout={
                    editing
                      ? (workoutId, day, before) =>
                          reflow(
                            () =>
                              commitOwn((prev, id) => {
                                const target = id(workoutId);
                                const found = workoutAt(prev, target);
                                /* THE NAME IS WRITTEN DOWN BEFORE THE MOVE, on
                                   both ends: the container leaving loses the day
                                   whose label it was borrowing, and the day it
                                   lands on is about to hold two. */
                                let next =
                                  found && found.day !== day ? nameTheUnnamed(prev, found.day) : prev;
                                next = nameTheUnnamed(next, day);
                                return moveWorkout(
                                  next,
                                  target,
                                  week,
                                  day,
                                  before === null ? null : id(before),
                                );
                              }),
                            { names: workoutAt(entries, workoutId)?.day === day },
                          )
                      : undefined
                  }
                  /* THE TAIL CONTROL OF A DAY WITH NOTHING ON IT. It closes the
                     dock and any panel first: a drawer left open under an
                     `aria-modal` dialog is 380px of board a trainer can see and
                     cannot reach. */
                  onCreateWorkout={
                    editing
                      ? d => {
                          setPanel(null);
                          setLibrary(null);
                          setWorkoutDay(d);
                        }
                      : undefined
                  }
                  vt={vtArmed}
                  /* THE REVIEW PANEL IS THE BOARD'S RIGHT COLUMN WHILE EDITING,
                     in the slot `BalancePanel` holds the rest of the time. See
                     `WeekBoard.side` and `ChangeSide` — the short version is
                     that a dock cost the board 80px net and tipped the day cards
                     from two lanes to one, which is a review panel making the
                     thing under review harder to read. */
                  side={editing ? <ChangeSide state={changeState} /> : undefined}
                  /* ONE FLAG STANDS DOWN EVERY WRITE ON THE BOARD — the grips,
                     the drop targets, the row menus, the `+ Add exercise` tail
                     and the day menu. `CertifiedPreview` needed exactly this and
                     built it; nothing here had to be added. */
                  readOnly={!editing}
                  {...rowActions}
                />
              </div>

              <div className="pgw__phone">
                <PhoneProgram
                  programName={program.name}
                  days={days}
                  labels={labels}
                  dayWord={ordinalDayWord}
                  weeks={weeks}
                  week={week}
                  authored={authoredWeeks(entries)}
                  onWeek={setWeek}
                  repeat={shown.repeat}
                  balance={weekBalance}
                  names={names}
                  entriesForDay={day => entriesFor(shown.rows, sourceWeek, day)}
                  onAdd={d => openPanel({ kind: 'library', week, day: d })}
                  onField={setField}
                  onAddDay={addDay}
                  freeSlots={freeSlots}
                  onAddWeek={canAddWeek ? addWeek : undefined}
                  onProgression={() => openPanel({ kind: 'progression' })}
                  onDuplicateWeek={() => openPanel({ kind: 'duplicate' })}
                  onCopyWeekTo={copyWeekTo}
                  onRepeatWeek={week > 1 && !shown.repeat ? repeatWeek : undefined}
                  entries={entries}
                  covered={
                    panel !== null ||
                    menu ||
                    leaving !== null ||
                    workoutDay !== null ||
                    workoutEdit !== null
                  }
                  readOnly={!editing}
                  {...rowActions}
                />
              </div>
            </div>
          </div>

          {/* ── the panels, in the split's third track ── */}

          {/* THE REVIEW DOCK, AND IT IS A DOCK RATHER THAN A SHEET FOR
              `LibraryDock`'s REASON, READ BACKWARDS. That one pushes instead of
              covering because the board beside it is what the trainer is
              filling. This one pushes because the board beside it is what the
              trainer is CHECKING the list against: *Swapped Bench Press for
              Dumbbell Press* is a line somebody wants to read with the card it
              is about still on screen. A scrim would make the review and the
              thing reviewed two screens.

              `.split:has(> .dock)` reads a DIRECT child, so this sits in the
              split rather than inside `.pg__builder`. */}
          {panel?.kind === 'changes' && (
            <ChangePanel state={changeState} onClose={() => setPanel(null)} />
          )}

          {library && (
            <LibraryDock
              key={library.day}
              day={library.day}
              dayWord={ordinalDayWord}
              dayLabel={labels[String(library.day)] ?? ''}
              onClose={() => setLibrary(null)}
              onAdd={ex => addOne(library.day, ex, null)}
              onCarry={setCarrying}
              countFor={id =>
                entriesFor(shown.rows, sourceWeek, library.day).filter(e => e.exerciseId === id)
                  .length
              }
              contextFor={contextFor}
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
                /* The strip follows the copy onto the first week it wrote, as
                   the builder's does — and asks `duplicateTargets` rather than
                   guessing, so it cannot light a week the write skipped. */
                const first = duplicateTargets(sourceWeek, weeks, opts.spread).find(
                  w => opts.conflict !== 'skip' || !authoredWeeks(entries).has(w),
                );
                if (first != null) setWeek(first);
              }}
            />
          )}

          {/* ── THE WORKOUT DIALOG, OVER THE WHOLE FRAME ─────────────────

              `WorkoutBuilder`'s own header argues the modal against
              `LibraryDock`'s drawer and the same argument decides it here: a
              trainer writing a session needs a searchable library, a canvas and
              set lines seven controls wide, and there is nothing on the board
              underneath worth 380px of what is left.

              `key` on the day, so opening a second day's dialog starts on an
              empty canvas rather than on the last one's draft. */}
          {workoutDay != null && (
            <WorkoutBuilder
              key={workoutDay}
              onClose={() => setWorkoutDay(null)}
              onSaved={row => landWorkout(workoutDay, row)}
            />
          )}

          {/* THE SAME DIALOG, REOPENED ON A CONTAINER ALREADY ON A DAY, and
              `onLocalSave` rather than `onSaved` is the whole difference. It is
              *a copy is a copy* one level down: these rows belong to this
              client, and editing their Tuesday must not rewrite the workout
              template it was built from any more than it rewrites the
              blueprint. The draft comes back and lands in the container. */}
          {workoutEdit && (
            <WorkoutBuilder
              key={workoutEdit.workoutId}
              initial={workoutEdit.initial}
              onClose={() => setWorkoutEdit(null)}
              onLocalSave={draft => landEdit(workoutEdit.workoutId, draft)}
            />
          )}

          {/* ── LEAVING EDIT MODE WITH WORK IN THE BROWSER ───────────────

              The prompt the staged draft owes the trainer. Autosaving screens
              never need one because there is nothing to lose; this one loses
              everything on a press, so the press asks.

              THREE ANSWERS AND NOT TWO. *Keep editing* is the one a confirm
              built from `confirm`/`cancel` would not have: a trainer who
              pressed *Done* by accident wants neither to save nor to throw the
              work away, and a dialog that offers only those two makes the
              accident expensive either way. So `foot` takes the whole band —
              which is the prop's own stated case, *a dialog that is not asking
              a question* — and `Discard` carries `danger` because it is the
              only irreversible button in the group.

              `cover="frame"` and not `main`: the rail and the section pane are
              both navigations out of this screen, and a scrim that leaves them
              live is a scrim around a decision the trainer can walk past. */}
          {leaving && (
            <ModalHost onClose={() => setLeaving(null)} cover="frame">
              <Modal
                title={
                  <>
                    Save your changes to {firstName(client.name)}&rsquo;s plan?
                  </>
                }
                foot={
                  <>
                    <Button variant="ghost" onClick={() => setLeaving(null)}>
                      Keep editing
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => {
                        discard();
                        stopEditing();
                      }}
                    >
                      Discard
                    </Button>
                    <Button
                      variant="primary"
                      disabled={save === 'saving'}
                      onClick={() => {
                        /* ONLY A SAVE THAT LANDED LEAVES. A refused write that
                           closed this anyway would drop the trainer back on a
                           board they believe is saved, with the error reported
                           in a dock that is no longer open. The prompt stays,
                           `saveError` is under it, and the draft is intact. */
                        void saveNow().then(ok => {
                          if (ok) stopEditing();
                        });
                      }}
                    >
                      {save === 'saving' ? 'Saving…' : 'Save'}
                    </Button>
                  </>
                }
              >
                <p className="small">
                  {changes.total} {changes.total === 1 ? 'change is' : 'changes are'} still only
                  in this browser. {firstName(client.name)} is training on the version you
                  opened, and discarding puts the board back to it.
                </p>
                {save === 'failed' && saveError && (
                  <p className="small pg__behindbad" role="status">
                    {saveError}
                  </p>
                )}
              </Modal>
            </ModalHost>
          )}

          {panel?.kind === 'origin' && (
            <OriginPanel
              clientId={client.id}
              clientName={client.name}
              programId={program.id}
              originName={origin?.name ?? null}
              originMoved={moved}
              originEditedAt={origin?.updatedAt ?? null}
              diff={diff}
              unsaved={save !== 'clean'}
              onClose={() => setPanel(null)}
              onReset={result => {
                setPanel(null);
                /* THE ROW IT CHANGED IS THE WHOLE SCREEN, so the receipt is a
                   card rather than a header state — and `router.refresh()` is
                   what puts the blueprint's rows on the board, because the
                   draft this screen holds is now a version of the plan that no
                   longer exists anywhere. */
                show({
                  tone: 'ok',
                  title: <>{firstName(client.name)}&rsquo;s plan is back on the blueprint</>,
                  body: (
                    <>
                      {result.added} exercise{result.added === 1 ? '' : 's'} taken from{' '}
                      {origin?.name ?? 'it'}. Their days, times and logged sets are untouched.
                    </>
                  ),
                });
                router.refresh();
              }}
            />
          )}
        </div>
      </main>
    </>
  );
}
