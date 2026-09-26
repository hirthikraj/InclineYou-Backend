/**
 * THE WORKOUT BEING WRITTEN — a value, and every edit a pure function of it.
 *
 * `lib/programs/draft.ts` is the same shape for the week sheet and the reason
 * is the same: the undo stack is then a stack of these, at 20 deep, and an
 * "undo" is an assignment rather than a set of inverse operations somebody has
 * to keep in step with the forward ones. Nothing below reads a clock, a cookie
 * or the wire (trap 18), so the dialog can run every one of them in the browser
 * and hand the result to one save at the end.
 *
 * ── WHY THE DRAFT CARRIES THE NAME AND THE META, AND THE ROW DOES NOT ───────
 *
 * `WorkoutTemplateExerciseRow` stores an `exerciseId` and nothing else about
 * the movement, which is right for a table and useless for a card that has to
 * draw *Belt Squat — Machine · Quadriceps · Machine* the instant it is dropped.
 * The week sheet solved this with a `names` overlay fetched alongside the
 * template, and its own notes record the bug that produced: a freshly added row
 * read *Exercise not in your library* until the overlay caught up. Here the
 * movement arrives from the library panel WITH its record, so the draft keeps
 * it and there is no second fetch and no window in which a card cannot name
 * itself. `toWire` drops it again on the way out.
 */

import type { ExerciseWire } from '@/lib/exercises/api';
import type { WorkoutTemplateWire } from './api';

/**
 * WHAT A SET IS MEASURED IN — the two dropdowns on every set line.
 *
 * There are seven of each because a trainer writing a real session needs them:
 * *as much as possible* is a prescription, an RPE is not a weight, and a
 * carry is metres. The two pickers are drawn by `KindPicker`, which is a menu
 * rather than a `<select>` for the reason stated there — each row carries the
 * unit it will be written in, and a native option list cannot show one.
 */
export type LoadKind =
  | 'percent_1rm'
  | 'level'
  | 'weight'
  | 'weight_range'
  | 'bodyweight'
  | 'rpe_level'
  | 'rpe_weight';

export type EffortKind =
  | 'max_reps'
  | 'max_time'
  | 'max_distance'
  | 'distance'
  | 'reps'
  | 'rep_interval'
  | 'time';

export interface DraftSet {
  /** Local only. The wire has no per-set id — a set is identified by its
   *  position, which is the one thing about it that is always true. */
  uid: string;
  loadKind: LoadKind;
  loadValue: number | null;
  effortKind: EffortKind;
  effortValue: number | null;
  restSeconds: number | null;
  tempo: string | null;
  notes: string | null;
}

/**
 * ONE APPROVED SUBSTITUTE, WITH ITS OWN PRESCRIPTION.
 *
 * ── WHY IT CARRIES SETS AND THE WEEK SHEET'S ALTERNATE DOES NOT ─────────────
 *
 * `TemplateExerciseRow.altExerciseId` is a bare id and `.dayc__alt`'s own note
 * defends that: at week level there is no load to differ, so a second set of
 * numbers per row doubles the editing surface to serve the rarer half of the
 * case. Inside one session it is the other way round. A *Leg Press* standing in
 * for a *Back Squat* is not the same prescription in different kit — the load
 * is a different number, the rest is usually shorter, and a trainer who cannot
 * say so has written a substitution they would not actually give.
 *
 * So an alternative is a movement AND its sets, seeded as a copy of the
 * movement it stands in for, which makes *the same numbers* one click and
 * anything else an edit rather than an impossibility.
 *
 * It has no `groupId`: a substitute inherits its place in the circuit from the
 * movement it replaces, and a chain of alternates is not a thing a session can
 * mean.
 */
export interface DraftAlternative {
  uid: string;
  exerciseId: string;
  /** Drawn on the card. Not on the wire — see the header. */
  name: string;
  meta: string;
  sets: DraftSet[];
}

export interface DraftExercise {
  uid: string;
  exerciseId: string;
  /** Drawn on the card. Not on the wire — see the header. */
  name: string;
  meta: string;
  groupId: string | null;
  /**
   * WHAT THE CLIENT MAY SWAP TO — in the trainer's own order.
   *
   * §2: *"Swap exercise. The rack is busy, the machine is taken. Offer
   * trainer-approved alternatives rather than letting them skip."* A LIST
   * rather than the week sheet's single id, because the sentence is plural and
   * the reason is the gym: the squat rack being busy and the leg press being
   * busy are two different Tuesdays, and a trainer who has only one slot names
   * the machine and then watches the client skip anyway.
   *
   * Ordered, and the order is a ranking — the first is what the trainer would
   * pick, which is why the panel has a ↑ and no sort. Nothing dedupes it here:
   * `AltPanel` refuses the duplicate at the point of the click, where the
   * trainer can be told why.
   */
  alternatives: DraftAlternative[];
  sets: DraftSet[];
}

/**
 * A LABELLED BREAK IN THE SESSION — *Warm-up*, *Main set*, *Cool-down*.
 *
 * It is NOT a row of `exercises`, and that is the whole design. Everything that
 * reads this draft — `chainsOf`, `ordinalsOf`, the estimate, `toWire`, the
 * card's own drop arithmetic — is written against a list in which every entry is
 * a movement with sets, and a union member with no sets would have to be
 * excluded at each of those eight readers by whoever added the ninth. So the
 * dividers are their own list and the exercises are untouched: a reader that
 * does not care about headings sees the session it always saw, and is right.
 *
 * `before` is the uid of the movement the heading sits ABOVE, or null for the
 * foot of the workout — an anchor rather than an index, because an index is
 * wrong the moment anything is inserted above it. What an anchor costs instead
 * is that a card dragged away would take its heading with it, which is not what
 * a heading means: `reanchor` moves the divider onto whatever movement takes
 * that place, so headings stay where the trainer put them while cards move
 * through them.
 */
export interface DraftDivider {
  uid: string;
  label: string;
  /** The movement this heading sits above, or null for the end of the list. */
  before: string | null;
}

export interface Draft {
  name: string;
  notes: string | null;
  exercises: DraftExercise[];
  dividers: DraftDivider[];
}

/**
 * WHAT THE LIBRARY OFFERS UNDER *Dividers* — the blocks a session is actually
 * written in. Not a free-text-only control: a trainer picking *Warm-up* from a
 * list writes the same word every time, which is what makes the heading legible
 * on a client's phone across twenty workouts. The last row is the escape hatch
 * and it is edited in place on the canvas, so nothing here is a ceiling.
 */
export const DIVIDER_LABELS = [
  'Warm-up',
  'Activation',
  'Main set',
  'Strength',
  'Accessory',
  'Conditioning',
  'Core',
  'Cool-down',
  'Stretching',
  'Finisher',
] as const;

/* ─────────────────────────────────────────────────────────────── minting ── */

let counter = 0;
/** Local identity for the life of one dialog. NOT `crypto.randomUUID` and not
 *  `Date.now()` — trap 20 refuses a clock read during render, and these are
 *  minted inside reducers that a render may call. */
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}${counter}`;
}

/**
 * ONE ROW OF A KIND MENU.
 *
 * `label` is the sentence the menu prints, `short` the word the closed picker
 * shows — *Repetitions* is what you pick and *Reps* is what the line reads back,
 * because the line has six other controls beside it and the long name would push
 * the rest of the set off the card. `hint` is the greyed unit beside the label:
 * three of the effort kinds are the SAME sentence and the unit is the only thing
 * that tells them apart, so it is part of the option, not decoration.
 */
export interface KindOption<K> {
  kind: K;
  label: string;
  short: string;
  hint: string;
  /** What trails the number box, or null when the kind takes no number —
   *  bodyweight has nothing to prescribe and MAX is the prescription. */
  unit: string | null;
}

export const LOAD_KINDS: KindOption<LoadKind>[] = [
  { kind: 'percent_1rm', label: '%1RM', short: '%1RM', hint: 'kg', unit: '%' },
  { kind: 'level', label: 'Level / Intensity', short: 'Level', hint: 'level', unit: 'level' },
  { kind: 'weight', label: 'Weight', short: 'Weight', hint: 'kg', unit: 'kg' },
  { kind: 'weight_range', label: 'Weight range', short: 'Range', hint: 'kg', unit: 'kg' },
  { kind: 'bodyweight', label: 'Bodyweight', short: 'Bodyweight', hint: 'kg', unit: null },
  { kind: 'rpe_level', label: 'RPE', short: 'RPE', hint: 'level', unit: 'level' },
  { kind: 'rpe_weight', label: 'RPE', short: 'RPE', hint: 'kg', unit: 'kg' },
];

export const EFFORT_KINDS: KindOption<EffortKind>[] = [
  { kind: 'max_reps', label: 'As much as possible (MAX)', short: 'MAX', hint: 'reps', unit: null },
  { kind: 'max_time', label: 'As much as possible (MAX)', short: 'MAX', hint: 'hh:mm:ss', unit: null },
  { kind: 'max_distance', label: 'As much as possible (MAX)', short: 'MAX', hint: 'm', unit: null },
  { kind: 'distance', label: 'Distance', short: 'Distance', hint: 'm', unit: 'm' },
  { kind: 'reps', label: 'Repetitions', short: 'Reps', hint: 'reps', unit: null },
  { kind: 'rep_interval', label: 'Repetition Interval', short: 'Reps', hint: 'reps', unit: 'reps' },
  { kind: 'time', label: 'Time', short: 'Time', hint: 'hh:mm:ss', unit: 'sec' },
];

const LOAD_BY = new Map(LOAD_KINDS.map(o => [o.kind, o]));
const EFFORT_BY = new Map(EFFORT_KINDS.map(o => [o.kind, o]));

export function loadOption(kind: LoadKind): KindOption<LoadKind> {
  return LOAD_BY.get(kind) ?? LOAD_KINDS[2];
}

export function effortOption(kind: EffortKind): KindOption<EffortKind> {
  return EFFORT_BY.get(kind) ?? EFFORT_KINDS[4];
}

/** The word the closed picker and the rest of the app read a kind back as. */
export const LOAD_LABELS: Record<LoadKind, string> = Object.fromEntries(
  LOAD_KINDS.map(o => [o.kind, o.short]),
) as Record<LoadKind, string>;

export const EFFORT_LABELS: Record<EffortKind, string> = Object.fromEntries(
  EFFORT_KINDS.map(o => [o.kind, o.short]),
) as Record<EffortKind, string>;

/** The unit that trails the box, per kind. Null is *there is no box* — a
 *  bodyweight set has no load to give and a MAX set has no number to cap it,
 *  and a dead field is text rather than a greyed-out input. */
export function loadUnit(kind: LoadKind): string | null {
  return loadOption(kind).unit;
}

export function effortUnit(kind: EffortKind): string | null {
  return effortOption(kind).unit;
}

/** MAX is written, not typed — the three of them take no number at all. */
export function effortTakesNumber(kind: EffortKind): boolean {
  return kind !== 'max_reps' && kind !== 'max_time' && kind !== 'max_distance';
}

export function loadTakesNumber(kind: LoadKind): boolean {
  return kind !== 'bodyweight';
}

export function metaOf(exercise: Pick<ExerciseWire, 'target' | 'equipment' | 'level'>): string {
  return [exercise.target, exercise.equipment, exercise.level].filter(Boolean).join(' · ');
}

/**
 * A blank set, seeded from the movement.
 *
 * `logType` is read because it is the one thing that makes a plank written as
 * `3 × 45 reps` instead of a 45-second hold — the defect `blueprintOf` in the
 * seed is written to prevent, and the one the week sheet's dock shipped once.
 * Bodyweight movements arrive with no load box for the same reason: a pull-up
 * has no external load, and an empty kilogram field invites a number that means
 * nothing.
 */
export function blankSet(
  exercise?: Pick<ExerciseWire, 'logType'>,
  previous?: DraftSet,
): DraftSet {
  if (previous) return { ...previous, uid: uid('s') };
  const log = exercise?.logType;
  return {
    uid: uid('s'),
    loadKind: log === 'reps' || log === 'duration' ? 'bodyweight' : 'weight',
    loadValue: null,
    effortKind: log === 'duration' ? 'time' : 'reps',
    effortValue: null,
    restSeconds: 90,
    tempo: null,
    notes: null,
  };
}

export function emptyDraft(): Draft {
  return { name: '', notes: null, exercises: [], dividers: [] };
}

/* ─────────────────────────────────────────────────────────── the edits ── */

/**
 * Dropped from the library. `before` is the uid the new card lands ABOVE, or
 * null for the tail — `locateWorkoutDrop`'s answer, unchanged.
 *
 * `adopt` IS THE HEADINGS THE NEW CARD LANDS UNDER. A heading is drawn above
 * the movement it is anchored to, so *above Strength* and *below Strength* are
 * one anchor and two places: the drop says which by naming the headings the
 * pointer was below, and they re-anchor onto the arriving card so they stay
 * exactly where they were drawn.
 *
 * OMITTED IS *THE END, UNDER WHATEVER IS ALREADY THERE* — a click in the
 * library, which is the gesture with no pointer position to read. A heading
 * sitting at the foot was put there to open the next block, so the movement
 * that follows goes INTO it. Without this a click could never fill the last
 * block on the canvas, which is the defect this argument was written for.
 */
export function addExercise(
  draft: Draft,
  exercise: ExerciseWire,
  before: string | null,
  adopt?: string[],
): Draft {
  const row: DraftExercise = {
    uid: uid('e'),
    exerciseId: exercise.id,
    name: exercise.name,
    meta: metaOf(exercise),
    groupId: null,
    alternatives: [],
    sets: [blankSet(exercise), blankSet(exercise), blankSet(exercise)],
  };
  const taken =
    adopt ??
    (before === null ? draft.dividers.filter(d => d.before === null).map(d => d.uid) : []);
  return {
    ...draft,
    exercises: insert(draft.exercises, row, before),
    dividers: adoptDividers(draft.dividers, taken, row.uid),
  };
}

export function removeExercise(draft: Draft, exerciseUid: string): Draft {
  const kept = draft.exercises.filter(e => e.uid !== exerciseUid);
  return {
    ...draft,
    exercises: dissolveLoners(kept),
    /* THE HEADING OUTLIVES THE MOVEMENT UNDER IT. Deleting the first exercise
       of *Main set* is not a decision about the block, so the heading drops
       onto the next movement rather than off the canvas. */
    dividers: reanchor(draft.dividers, draft.exercises, exerciseUid),
  };
}

/* ────────────────────────────────────────────────────────────── dividers ── */

/** Dropped from the library's *Dividers* source. `before` is the uid it lands
 *  above, or null for the foot — the same vocabulary `addExercise` takes. */
export function addDivider(draft: Draft, label: string, before: string | null): Draft {
  return {
    ...draft,
    dividers: [...draft.dividers, { uid: uid('d'), label, before }],
  };
}

/**
 * A HEADING PICKED UP BY ITS GRIP AND PUT SOMEWHERE ELSE.
 *
 * Only the anchor moves: a divider has no position of its own beyond the
 * movement it sits above, so this is `addDivider`'s `before` written onto a
 * heading that already exists rather than a splice of any list. The order two
 * headings anchored to the SAME movement are drawn in is the order they were
 * added, which is what puts a heading dropped there last underneath the one
 * already there — and is why this does not re-order `dividers` as well.
 */
export function moveDivider(draft: Draft, dividerUid: string, before: string | null): Draft {
  const row = draft.dividers.find(d => d.uid === dividerUid);
  if (!row || row.before === before) return draft;
  return {
    ...draft,
    dividers: draft.dividers.map(d => (d.uid === dividerUid ? { ...d, before } : d)),
  };
}

export function removeDivider(draft: Draft, dividerUid: string): Draft {
  return { ...draft, dividers: draft.dividers.filter(d => d.uid !== dividerUid) };
}

/** Typed on the canvas. Committed on blur by the builder, not per keystroke —
 *  the argument `NumCell` makes for a number and the name field makes for the
 *  title: twenty rungs of undo spent on one word is a stack that cannot reach
 *  the edit before it. */
export function renameDivider(draft: Draft, dividerUid: string, label: string): Draft {
  return {
    ...draft,
    dividers: draft.dividers.map(d => (d.uid === dividerUid ? { ...d, label } : d)),
  };
}

/**
 * Moved by its grip.
 *
 * A CARD LEAVING A CIRCUIT LEAVES IT. Dragging the middle movement of a
 * three-part chain out and dropping it at the foot of the workout has to
 * detach it, or the chain becomes two runs of rows sharing a `groupId` with a
 * straight set wedged between them — which `chainsOf` would then read back as
 * one circuit containing a movement the trainer deliberately took out of it.
 */
export function moveExercise(
  draft: Draft,
  exerciseUid: string,
  before: string | null,
  /** The headings the card was dropped UNDER — `addExercise` carries the
   *  argument. A card moved to the foot of a session that ends on a heading
   *  belongs under it, and without this it could only ever land above. */
  adopted: string[] = [],
): Draft {
  const row = draft.exercises.find(e => e.uid === exerciseUid);
  if (!row || (before === exerciseUid && adopted.length === 0)) return draft;
  const without = draft.exercises.filter(e => e.uid !== exerciseUid);
  const landed = insert(without, { ...row, groupId: null }, before);
  return {
    ...draft,
    exercises: dissolveLoners(adopt(landed, exerciseUid)),
    /* A HEADING IS A PLACE, NOT A PROPERTY OF THE CARD UNDER IT. Read off the
       list as it was BEFORE the move, so *Cool-down* stays where it was written
       and the card travels out from under it — and THEN the headings the drop
       landed under take the card, which is the other half of the same rule. */
    dividers: adoptDividers(
      reanchor(draft.dividers, draft.exercises, exerciseUid),
      adopted,
      exerciseUid,
    ),
  };
}

/**
 * DROPPED ONTO ANOTHER CARD — the chain.
 *
 * The moved row lands directly beneath its target and takes the target's
 * `groupId`, minting one where the target had none. Members of a chain are
 * always ADJACENT, which is what lets every reader — the estimate, the save,
 * the card's own bracket — work from a run of rows rather than from a lookup.
 */
export function chainExercise(draft: Draft, exerciseUid: string, ontoUid: string): Draft {
  if (exerciseUid === ontoUid) return draft;
  const row = draft.exercises.find(e => e.uid === exerciseUid);
  const onto = draft.exercises.find(e => e.uid === ontoUid);
  if (!row || !onto) return draft;

  const groupId = onto.groupId ?? uid('g');
  const marked = draft.exercises
    .filter(e => e.uid !== exerciseUid)
    .map(e => (e.uid === ontoUid ? { ...e, groupId } : e));

  /* AFTER THE LAST MEMBER of the target's chain, not after the target itself —
     dropped onto the first of a pair, the row would otherwise land between
     them and split the pair it was being added to. */
  let at = marked.findIndex(e => e.uid === ontoUid);
  while (at + 1 < marked.length && marked[at + 1].groupId === groupId) at += 1;

  const out = [...marked.slice(0, at + 1), { ...row, groupId }, ...marked.slice(at + 1)];
  return { ...draft, exercises: dissolveLoners(out) };
}

/* ──────────────────────────────────────────────────── the alternatives ── */

/**
 * ONE MORE SUBSTITUTE, ON THE END, CARRYING THE MOVEMENT'S OWN NUMBERS.
 *
 * The sets are COPIED rather than blank, which is the same argument `addSet`
 * makes one screen down: *the same thing, again* is what is meant almost every
 * time, so it should be what happens, and a substitute that genuinely runs
 * different numbers is then an edit rather than a form to fill in twice.
 */
export function addAlternative(
  draft: Draft,
  exerciseUid: string,
  exercise: ExerciseWire,
): Draft {
  return mapExercise(draft, exerciseUid, e => ({
    ...e,
    alternatives: [
      ...e.alternatives,
      {
        uid: uid('a'),
        exerciseId: exercise.id,
        name: exercise.name,
        meta: metaOf(exercise),
        sets: e.sets.map(s => ({ ...s, uid: uid('s') })),
      },
    ],
  }));
}

export function removeAlternative(draft: Draft, exerciseUid: string, altUid: string): Draft {
  return mapExercise(draft, exerciseUid, e => ({
    ...e,
    alternatives: e.alternatives.filter(a => a.uid !== altUid),
  }));
}

/**
 * UP ONE PLACE — and there is deliberately no *down*.
 *
 * The order is a ranking and the only question a trainer asks of it is *which
 * of these is the one I would actually give*, which is an answer about the TOP
 * of the list. Every reordering reachable with both arrows is reachable with
 * this one, and half the buttons is half the row to read on a panel that
 * already carries a remove.
 */
export function raiseAlternative(draft: Draft, exerciseUid: string, altUid: string): Draft {
  return mapExercise(draft, exerciseUid, e => {
    const at = e.alternatives.findIndex(a => a.uid === altUid);
    if (at < 1) return e;
    const next = [...e.alternatives];
    [next[at - 1], next[at]] = [next[at], next[at - 1]];
    return { ...e, alternatives: next };
  });
}

export function addAlternativeSet(draft: Draft, exerciseUid: string, altUid: string): Draft {
  return mapAlternative(draft, exerciseUid, altUid, a => ({
    ...a,
    sets: [...a.sets, blankSet(undefined, a.sets[a.sets.length - 1])],
  }));
}

export function removeAlternativeSet(
  draft: Draft,
  exerciseUid: string,
  altUid: string,
  setUid: string,
): Draft {
  return mapAlternative(draft, exerciseUid, altUid, a => ({
    ...a,
    sets: a.sets.filter(s => s.uid !== setUid),
  }));
}

export function patchAlternativeSet(
  draft: Draft,
  exerciseUid: string,
  altUid: string,
  setUid: string,
  patch: Partial<Omit<DraftSet, 'uid'>>,
): Draft {
  return mapAlternative(draft, exerciseUid, altUid, a => ({
    ...a,
    sets: a.sets.map(s => (s.uid === setUid ? { ...s, ...patch } : s)),
  }));
}

/** The instructions field — one sentence, written to every set of this
 *  substitute. The set note is the column it lands in, because that is the only
 *  place a workout template has to put prose, and it is what the client reads. */
export function patchAlternativeSets(
  draft: Draft,
  exerciseUid: string,
  altUid: string,
  patch: Partial<Omit<DraftSet, 'uid'>>,
): Draft {
  return mapAlternative(draft, exerciseUid, altUid, a => ({
    ...a,
    sets: a.sets.map(s => ({ ...s, ...patch })),
  }));
}

/** Out of its circuit, in place. */
export function unchainExercise(draft: Draft, exerciseUid: string): Draft {
  const next = draft.exercises.map(e => (e.uid === exerciseUid ? { ...e, groupId: null } : e));
  return { ...draft, exercises: dissolveLoners(next) };
}

export function addSet(draft: Draft, exerciseUid: string): Draft {
  return mapExercise(draft, exerciseUid, e => ({
    ...e,
    /* Copied from the last one, not blank. A trainer writing four sets of the
       same thing should type it once; a pyramid is then three edits rather
       than four. */
    sets: [...e.sets, blankSet(undefined, e.sets[e.sets.length - 1])],
  }));
}

export function removeSet(draft: Draft, exerciseUid: string, setUid: string): Draft {
  return mapExercise(draft, exerciseUid, e => ({
    ...e,
    sets: e.sets.filter(s => s.uid !== setUid),
  }));
}

/**
 * The count chip on the card's head, typed.
 *
 * Growing copies the last set; shrinking drops from the end. It is the chip and
 * not a stepper because a trainer changing three to eight does it in one keypress
 * — and dropping to zero is refused rather than silently deleting the card,
 * which is what the ✕ on the head is for.
 */
export function setSetCount(draft: Draft, exerciseUid: string, count: number): Draft {
  const n = Math.max(1, Math.min(20, Math.round(count)));
  return mapExercise(draft, exerciseUid, e => {
    if (e.sets.length === n) return e;
    if (e.sets.length > n) return { ...e, sets: e.sets.slice(0, n) };
    const grown = [...e.sets];
    while (grown.length < n) grown.push(blankSet(undefined, grown[grown.length - 1]));
    return { ...e, sets: grown };
  });
}

export function patchSet(
  draft: Draft,
  exerciseUid: string,
  setUid: string,
  patch: Partial<Omit<DraftSet, 'uid'>>,
): Draft {
  return mapExercise(draft, exerciseUid, e => ({
    ...e,
    sets: e.sets.map(s => (s.uid === setUid ? { ...s, ...patch } : s)),
  }));
}

/** Every set on one card at once — what the head's kind pickers change. */
export function patchSets(
  draft: Draft,
  exerciseUid: string,
  patch: Partial<Omit<DraftSet, 'uid'>>,
): Draft {
  return mapExercise(draft, exerciseUid, e => ({
    ...e,
    sets: e.sets.map(s => ({ ...s, ...patch })),
  }));
}

/* ───────────────────────────────────────────────────────────── readers ── */

/** Runs of adjacent rows, each either one straight movement or one circuit.
 *  `blocksOf` in `lib/programs/blueprint.ts` is the same reader for the week
 *  sheet's supersets, and the card measures its drop targets off these for the
 *  reason `locateDrop` gives: a circuit is ONE block and therefore one target. */
export function chainsOf(exercises: DraftExercise[]): DraftExercise[][] {
  const out: DraftExercise[][] = [];
  for (const entry of exercises) {
    const last = out[out.length - 1];
    if (entry.groupId && last && last[0].groupId === entry.groupId) last.push(entry);
    else out.push([entry]);
  }
  return out;
}

/** `1`, `2a`, `2b`, `3` — the ordinal a card prints. Circuit members share the
 *  number and take a letter, which is the vocabulary the week sheet already
 *  uses for a superset. */
export function ordinalsOf(exercises: DraftExercise[]): Record<string, string> {
  const out: Record<string, string> = {};
  chainsOf(exercises).forEach((chain, i) => {
    chain.forEach((entry, j) => {
      out[entry.uid] = chain.length === 1 ? String(i + 1) : `${i + 1}${'abcdefgh'[j] ?? '?'}`;
    });
  });
  return out;
}

export function setCount(draft: Draft): number {
  return draft.exercises.reduce((n, e) => n + e.sets.length, 0);
}

/* ───────────────────────────────────────────────────────── the two ends ── */

/** The draft as the server takes it. The local uids and the drawn name go. */
export function toWire(draft: Draft) {
  /* THE ANCHOR BECOMES AN INDEX ON THE WAY OUT, and only here. A uid is local
     to one dialog — it means nothing to a row read back tomorrow — and the
     position is the thing the heading actually claims: `beforeIndex` is how
     many movements precede it, so `exercises.length` is the foot. */
  const at = new Map(draft.exercises.map((e, i) => [e.uid, i]));
  return {
    name: draft.name.trim() || 'Untitled workout',
    notes: draft.notes,
    dividers: draft.dividers
      .map(d => ({
        label: d.label,
        beforeIndex: d.before === null ? draft.exercises.length : at.get(d.before),
      }))
      /* A heading whose movement is gone is a heading the draft no longer has —
         but `removeExercise` re-anchors rather than orphans, so this is a belt
         on a state nothing here can reach, not a silent drop of the trainer's
         work. */
      .filter((d): d is { label: string; beforeIndex: number } => d.beforeIndex !== undefined)
      .sort((a, b) => a.beforeIndex - b.beforeIndex),
    exercises: draft.exercises.map(e => ({
      exerciseId: e.exerciseId,
      groupId: e.groupId,
      alternatives: e.alternatives.map(a => ({
        exerciseId: a.exerciseId,
        sets: a.sets.map(setWire),
      })),
      sets: e.sets.map(setWire),
    })),
  };
}

/** The local uid off, and nothing else — written once because the movement and
 *  its substitutes go through it. */
function setWire(s: DraftSet) {
  return {
    loadKind: s.loadKind,
    loadValue: s.loadValue,
    effortKind: s.effortKind,
    effortValue: s.effortValue,
    restSeconds: s.restSeconds,
    tempo: s.tempo,
    notes: s.notes,
  };
}

/**
 * And back, to open a saved workout for editing.
 *
 * `names` is the overlay the page fetches beside the template — the wire has
 * only ids, and the header's argument for keeping the name on the draft does
 * not extend to inventing one. A movement that has since left the library
 * renders the same sentence the week sheet's rows do rather than an empty card.
 */
export function fromWire(
  row: WorkoutTemplateWire,
  names: Record<string, Pick<ExerciseWire, 'name' | 'target' | 'equipment' | 'level'> | undefined>,
): Draft {
  const exercises = fromWireExercises(row, names);
  return {
    name: row.name,
    notes: row.notes,
    exercises,
    /* BACK ONTO AN ANCHOR, against the list that was just minted. An index past
       the last movement is the foot, which is what a workout that ends on
       *Cool-down* looks like on the wire. */
    dividers: (row.dividers ?? []).map(d => ({
      uid: uid('d'),
      label: d.label,
      before: exercises[d.beforeIndex]?.uid ?? null,
    })),
  };
}

function fromWireExercises(
  row: WorkoutTemplateWire,
  names: Record<string, Pick<ExerciseWire, 'name' | 'target' | 'equipment' | 'level'> | undefined>,
): DraftExercise[] {
  return row.exercises.map(e => {
    const known = names[e.exerciseId];
    return {
      uid: uid('e'),
      exerciseId: e.exerciseId,
      name: known?.name ?? 'Exercise not in your library',
      meta: known ? metaOf(known) : '',
      groupId: e.groupId,
      /* THE SAME OVERLAY AND THE SAME SENTENCE WHEN IT MISSES. A substitute
         deleted from the library is a fact about this workout, and dropping it
         quietly on the next save is how a client loses a swap they were told
         they had. */
      alternatives: (e.alternatives ?? []).map(a => {
        const alt = names[a.exerciseId];
        return {
          uid: uid('a'),
          exerciseId: a.exerciseId,
          name: alt?.name ?? 'Exercise not in your library',
          meta: alt ? metaOf(alt) : '',
          sets: a.sets.map(s => ({ ...s, uid: uid('s') })),
        };
      }),
      sets: e.sets.map(s => ({ ...s, uid: uid('s') })),
    };
  });
}

/**
 * A SAVED WORKOUT, POURED INTO THE ONE BEING WRITTEN — the library's
 * *Workout Templates* source.
 *
 * WHOLE, and as a COPY. Whole because a saved session is a structure — its
 * movements, its circuits and the headings that block them out — and pouring
 * only part of it is not a shorthand for anything a trainer meant. A copy
 * because a workout template dropped into a program is copied rather than
 * linked — the rule the delete confirm states in as many words. Editing the
 * session in front of you must not reach back into the one on the shelf.
 *
 * `before` IS WHERE THE WHOLE BLOCK LANDS, and it is the same vocabulary
 * `addExercise` takes: the uid the arriving movements go ABOVE, or null for the
 * end. A click in the library has no pointer position to read and passes
 * neither argument, which is the end — where clicking has put things since the
 * dialog was built. A drag passes `locateWorkoutDrop`'s answer, so a session
 * dropped between two movements arrives there rather than at the foot.
 *
 * The `groupId`s are re-minted rather than carried. Two templates sharing a
 * circuit id — and the seed's ids are stable, so the same template added twice
 * is that case exactly — would read back as ONE circuit with a straight set
 * wedged through it, which is the state `adopt` and `dissolveLoners` exist to
 * keep out of the model.
 */
export function addWorkoutTemplate(
  draft: Draft,
  row: WorkoutTemplateWire,
  names: Record<string, Pick<ExerciseWire, 'name' | 'target' | 'equipment' | 'level'> | undefined>,
  before: string | null = null,
  /** The headings the block was dropped UNDER — `addExercise` carries the
   *  argument, and a whole session lands under them the same way one movement
   *  does. Omitted is the click, which takes whatever sits at the foot. */
  adopt?: string[],
): Draft {
  const groups = new Map<string, string>();
  const added = fromWireExercises(row, names).map(e => {
    if (!e.groupId) return e;
    const mine = groups.get(e.groupId) ?? uid('g');
    groups.set(e.groupId, mine);
    return { ...e, groupId: mine };
  });

  /* THE HEADINGS THE BLOCK ARRIVES UNDER. A *Cool-down* the pointer was below
     anchors onto the first movement of the arriving session, or the whole of it
     lands underneath a heading that meant the end of the block. The click has
     no pointer to read and takes the foot, which is the same rule written for
     the gesture that has no position. */
  const taken =
    adopt ?? (before === null ? draft.dividers.filter(d => d.before === null).map(d => d.uid) : []);

  return {
    ...draft,
    exercises: spliceAll(draft.exercises, added, before),
    dividers: [
      ...(added.length > 0 ? adoptDividers(draft.dividers, taken, added[0].uid) : draft.dividers),
      /* The arriving session's own headings, on its own movements — a template
         written as warm-up / main / cool-down arrives as that session, not as a
         flat run of twelve cards. A heading the template kept at ITS foot
         anchors onto whatever the block was dropped above, so it stays between
         the block and what follows rather than jumping to the end of a workout
         it was never the end of. */
      ...(row.dividers ?? []).map(d => ({
        uid: uid('d'),
        label: d.label,
        before: added[d.beforeIndex]?.uid ?? before,
      })),
    ],
  };
}

/* ───────────────────────────────────────────────────────────── private ── */

/** `insert` for a whole run of movements that must stay in their own order —
 *  a saved session poured in by `addWorkoutTemplate`. One splice rather than a
 *  fold of `insert`, which would land each movement above the one before it and
 *  arrive with the session backwards. */
function spliceAll(
  rows: DraftExercise[],
  added: DraftExercise[],
  before: string | null,
): DraftExercise[] {
  if (added.length === 0) return rows;
  const at = before === null ? -1 : rows.findIndex(e => e.uid === before);
  if (at < 0) return [...rows, ...added];
  return [...rows.slice(0, at), ...added, ...rows.slice(at)];
}

function insert(rows: DraftExercise[], row: DraftExercise, before: string | null): DraftExercise[] {
  if (before === null) return [...rows, row];
  const at = rows.findIndex(e => e.uid === before);
  if (at < 0) return [...rows, row];
  return [...rows.slice(0, at), row, ...rows.slice(at)];
}

/** `mapExercise` one level down. Two lookups rather than one because an
 *  alternative's uid is unique within its movement and nowhere else. */
function mapAlternative(
  draft: Draft,
  exerciseUid: string,
  altUid: string,
  fn: (a: DraftAlternative) => DraftAlternative,
): Draft {
  return mapExercise(draft, exerciseUid, e => ({
    ...e,
    alternatives: e.alternatives.map(a => (a.uid === altUid ? fn(a) : a)),
  }));
}

function mapExercise(
  draft: Draft,
  exerciseUid: string,
  fn: (e: DraftExercise) => DraftExercise,
): Draft {
  return {
    ...draft,
    exercises: draft.exercises.map(e => (e.uid === exerciseUid ? fn(e) : e)),
  };
}

/**
 * A row dropped BETWEEN two members of one chain joins it.
 *
 * Without this the list would hold `a(g1) · new(null) · b(g1)`, which
 * `chainsOf` reads as three blocks and the card draws as a circuit split in
 * half by a straight set — a picture of a state the model does not have. The
 * trainer's gesture said *here*, and here is inside a circuit.
 */
function adopt(rows: DraftExercise[], exerciseUid: string): DraftExercise[] {
  const at = rows.findIndex(e => e.uid === exerciseUid);
  if (at <= 0 || at >= rows.length - 1) return rows;
  const before = rows[at - 1].groupId;
  const after = rows[at + 1].groupId;
  if (!before || before !== after) return rows;
  return rows.map(e => (e.uid === exerciseUid ? { ...e, groupId: before } : e));
}

/** The headings a drop landed under, re-anchored onto the card that landed —
 *  so they stay drawn where they were and the card arrives beneath them. */
function adoptDividers(
  dividers: DraftDivider[],
  adopted: string[],
  anchor: string,
): DraftDivider[] {
  if (adopted.length === 0) return dividers;
  return dividers.map(d => (adopted.includes(d.uid) ? { ...d, before: anchor } : d));
}

/**
 * THE HEADINGS STAY, WHATEVER HAPPENS TO ONE CARD.
 *
 * Read against the list as it stood BEFORE the edit: every divider anchored to
 * `leavingUid` re-anchors to the next movement that is still there, and to the
 * foot when there is none. `removeExercise` and `moveExercise` both call it and
 * both need the same answer — a heading is a position in the session, and
 * neither deleting nor dragging the card beneath one is a statement about the
 * block it opens.
 */
function reanchor(
  dividers: DraftDivider[],
  before: DraftExercise[],
  leavingUid: string,
): DraftDivider[] {
  if (!dividers.some(d => d.before === leavingUid)) return dividers;
  const at = before.findIndex(e => e.uid === leavingUid);
  const next = at < 0 ? null : before[at + 1]?.uid ?? null;
  return dividers.map(d => (d.before === leavingUid ? { ...d, before: next } : d));
}

/** A circuit that has lost every member but one is not a circuit. Run after
 *  every structural edit, so the state can never hold a one-movement chain the
 *  card would draw a bracket around. */
function dissolveLoners(rows: DraftExercise[]): DraftExercise[] {
  const sizes = new Map<string, number>();
  for (const row of rows) {
    if (row.groupId) sizes.set(row.groupId, (sizes.get(row.groupId) ?? 0) + 1);
  }
  return rows.map(row =>
    row.groupId && (sizes.get(row.groupId) ?? 0) < 2 ? { ...row, groupId: null } : row,
  );
}
