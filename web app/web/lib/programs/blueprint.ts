/**
 * THE BLUEPRINT — the model behind `/programs`, and the only file that knows
 * what a template MEANS.
 *
 * Pure. No server, no React, no DOM. Every write on the builder is a pure
 * function from one entry list to another, which is what makes the undo stack
 * a stack of arrays and what lets the whole hierarchy — Program → Week → Day →
 * Exercise → Sets — be derived rather than stored.
 *
 * ── FIVE LAWS, AND THREE OF THEM ARE OLDER THAN THIS FILE ────────────────────
 *
 * 1 · **A DAY IS AN ORDINAL SLOT, NEVER A WEEKDAY.** "Day 1" is the first day
 *     this program trains, not Monday. Which weekday it lands on is the
 *     *client's*, chosen once at assign time into `program.schedule` — so a
 *     template that claimed Wednesday would be claiming something it cannot
 *     know. This is the law V24 exists for, and it is why there is no Rest
 *     column anywhere on this screen: rest is the absence of a slot, and the
 *     absence is already drawn by there being no column.
 *
 * 2 · **A DAY EXISTS WHEN THE TRAINER LAYS IT OUT, NOT WHEN SOMETHING LANDS ON
 *     IT.** `trainingDays` is the authority. Deriving the day list from wherever
 *     exercises happen to sit has a trap in it that the design set names: the
 *     first exercise goes on Day 1, Day 1 becomes the only day the program has,
 *     and there is nowhere left to put Day 2's first exercise. The union below
 *     is a *fallback* for templates authored before the column was writable, not
 *     the rule.
 *
 * 3 · **A WEEK WITH NOTHING OF ITS OWN REPEATS WEEK 1.** That is the whole model
 *     of a multi-week program here, and it is what lets an eight-week block
 *     exist without the blank twelve-week grid the phone deliberately refuses.
 *     `authoredWeeks` is the set that has content; everything else is a repeat,
 *     drawn dimmed and dashed and one click from becoming its own.
 *
 * 4 · **SETS IS A LIST, NOT A COUNT.** "Four sets, the last two to failure" is
 *     an ordinary prescription and an exercise-level mode cannot say it — there
 *     is nothing for "the last two" to attach to. `setDetail` is the list;
 *     `sets` and `reps` stay authoritative *while the sets agree*, which is what
 *     keeps a straight 4 × 12 readable by every build that predates V31.
 *
 * 5 · **EVERY ROW IS INSIDE A WORKOUT, AND A DAY MAY HOLD SEVERAL.** A day is
 *     not a flat list of exercises any more: it is a run of named CONTAINERS —
 *     *Upper A*, *Conditioning* — each one a session written once and droppable
 *     onto any other day whole. `workoutId` is that container and the storage
 *     contract is the one `groupId` already uses a level down: adjacent rows,
 *     one key. `reindex` is where the invariant is kept, so a row moved into
 *     the middle of a container joins it rather than splitting it in two.
 */

import type { SetDetailWire, TemplateExerciseWire } from './api';

/* ══════════════════════════════════════════════════════════ goals ══ */

/**
 * The five the brief names. `template.goal` is free text and stays free text —
 * this is a *reading* of it, not a constraint on it.
 *
 * A trainer who typed "Strength & size" keeps that on the card and files under
 * *Strength*; a goal nothing matches files under *General*, which is what
 * "general" means rather than a bucket for failures. Classifying rather than
 * migrating, because rewriting somebody's own word for their own program is not
 * a filter's business.
 */
export const GOALS = [
  { key: 'fat-loss', label: 'Fat loss', match: ['fat', 'weight loss', 'lose', 'cut', 'lean'] },
  { key: 'strength', label: 'Strength', match: ['strength', 'strong', 'power', 'force'] },
  { key: 'hypertrophy', label: 'Hypertrophy', match: ['hypertroph', 'muscle', 'size', 'mass', 'build'] },
  { key: 'rehab', label: 'Rehab', match: ['rehab', 'injur', 'recover', 'mobility', 'physio', 'prehab'] },
  { key: 'general', label: 'General', match: ['general', 'fitness', 'health', 'maintain'] },
] as const;

export type GoalKey = (typeof GOALS)[number]['key'];

/** Free text → one of the five. Unmatched and empty both read as *General*. */
export function goalKeyOf(goal: string | null | undefined): GoalKey {
  const g = (goal ?? '').toLowerCase().trim();
  if (!g) return 'general';
  for (const entry of GOALS) {
    if (entry.match.some(m => g.includes(m))) return entry.key;
  }
  return 'general';
}

export function goalLabel(key: GoalKey): string {
  return GOALS.find(g => g.key === key)?.label ?? 'General';
}

/* ═══════════════════════════════════════════════════ the entry ══ */

/**
 * One blueprint entry, with a **local id**.
 *
 * The wire has no id for a blueprint row — the whole structure is one jsonb blob
 * rewritten as a unit — so the builder mints one per entry at load. It is what
 * selection, the row panel, the undo stack and React keys all address, and it
 * must survive a reorder, which `${week}-${day}-${index}` does not.
 */
export interface Entry {
  /** Local only. Never sent; never persisted. */
  uid: string;
  exerciseId: string;
  day: number;
  week: number;
  order: number;
  sets: number | null;
  reps: number | null;
  durationSeconds: number | null;
  restSeconds: number | null;
  targetLoad: number | null;
  tempo: string | null;
  notes: string | null;
  altExerciseId: string | null;
  /** Shared by the members of one superset. Adjacent rows, one key. */
  groupId: string | null;
  /**
   * WHICH WORKOUT ON THIS DAY THIS ROW BELONGS TO — law 5.
   *
   * Adjacent rows, one key, exactly as `groupId` works one level down: a
   * workout is a CONTAINER of blocks the way a block is a container of rows.
   * Nullable only on the wire, where a blueprint written before the column
   * existed has none; `toEntries` gives those rows the day's seed container, so
   * nothing inside the builder ever holds a row that is in no workout.
   */
  workoutId: string | null;
  /** What that container is CALLED — *Upper A*, *Home Full Body*. Carried on
   *  every member rather than in a list beside the rows, so every write already
   *  in this file (copy, drop, progression, reindex) moves the name with the
   *  rows it belongs to and there is no second structure to keep in step. A
   *  container whose rows are all deleted stops existing, which is the right
   *  answer: an empty workout is not a thing a trainer can act on. */
  workoutName: string | null;
  /** Per-set prescription. Null on the straight-sets majority. */
  setDetail: SetDetail[] | null;
}

export interface SetDetail {
  reps: number | null;
  durationSeconds: number | null;
  toFailure: boolean;
}

/* ── UIDS: SEEDED ROWS DERIVE THEIRS, NEW ROWS ARE COUNTED ──────────────────
 *
 * A uid is a purely local handle. It is a React key, the thing `data-block`
 * carries so a column can measure a drop, and the argument every row callback
 * closes over. It is NEVER serialised — `Builder`'s save payload rebuilds each
 * wire row field by field and no `uid` is among them — so its shape is ours to
 * choose and changing it costs nothing on the server.
 *
 * ── WHY THIS IS NOT ONE COUNTER ANY MORE ───────────────────────────────────
 *
 * It was, and it produced a hydration mismatch on `.dayc__ex`:
 *
 *     data-block="e80"   (server)   vs   data-block="e1"   (client)
 *
 * `toEntries` is called during RENDER — `useMemo` in `Builder`, and again in
 * `Shelf` for every template on the shelf. A module-level counter is process
 * state, and the two processes do not agree: on the server this module is
 * evaluated once and lives for the life of the worker, so the counter carries
 * every row minted for every earlier request and is already at 79 when this
 * page renders; in the browser the module is fresh and the same first row comes
 * out `e1`. React compares the two `data-block` attributes, finds them
 * different, and abandons the attribute — leaving a row whose drop target is
 * whatever the server happened to say, which is the drag bug behind the noise.
 *
 * Seeding was never the counter's job. The rows in a template arrive in a fixed
 * order and their identity IS that order, so a seeded uid is derived from it and
 * is the same value in both processes by construction — no counter to desync, no
 * `useId`, no suppressed warning.
 *
 * The counter stays for rows that genuinely come into being at runtime — "add
 * exercise", duplicate, `copyDay`, `copyWeek`, the progression plan. Every one
 * of those runs in an event handler, on the client, after hydration, so there is
 * no server to disagree with.
 *
 * The two live in SEPARATE NAMESPACES and that is load-bearing: `e0…eN` is
 * dense from zero, so a minted `e1` would collide with the second seeded row and
 * two entries sharing a uid means selection, drag and remove all hit the wrong
 * one. `n` cannot collide with `e` at any count. */
const SEEDED_UID_PREFIX = 'e';

let uidSeq = 0;
/** A uid for a row created at runtime. Client-only — never call this during
 *  render, or the mismatch above comes straight back. */
export function newUid(): string {
  uidSeq += 1;
  return `n${uidSeq}`;
}

/**
 * A workout container's local id — law 5.
 *
 * Minted like a superset's, and like a superset's it is re-minted whenever rows
 * are COPIED: two days sharing one container id would make *this workout* a
 * thing in two places, and one menu press would move or delete both.
 *
 * Runtime only, for `newUid`'s reason — every caller is an event handler.
 */
export function newWorkoutId(): string {
  uidSeq += 1;
  return `w${uidSeq}-${Math.random().toString(36).slice(2, 7)}`;
}

/** A correlation id for a superset. `crypto.randomUUID` where it exists — the
 *  server stores it as a uuid, so a short local string would 500 on save. */
export function newGroupId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // A last resort for a runtime without it. Same shape, weaker entropy, and it
  // only ever has to be unique inside one blueprint.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function toEntries(wire: TemplateExerciseWire[]): Entry[] {
  /* Derived from position, NOT `newUid()` — this runs during render on both the
     server and the client and the two have to produce the same string. See the
     note on the uid namespaces above. */
  return wire.map((w, i) => ({
    uid: `${SEEDED_UID_PREFIX}${i}`,
    exerciseId: w.exerciseId,
    // An entry with no day is one no column can draw. Parked on Day 1, which is
    // where the trainer will find it, rather than dropped — losing a row nobody
    // can see is worse than putting it somewhere wrong and visible.
    day: w.dayOfWeek ?? 1,
    week: w.week ?? 1,
    order: w.orderIndex,
    sets: w.sets,
    reps: w.reps,
    durationSeconds: w.durationSeconds,
    restSeconds: w.restSeconds,
    targetLoad: w.targetLoad,
    tempo: w.tempo,
    notes: w.notes,
    altExerciseId: w.altExerciseId,
    groupId: w.groupId,
    /* A BLUEPRINT WRITTEN BEFORE LAW 5 IS ONE WORKOUT PER DAY, and it is given
       one here rather than left null — every reader above this line would
       otherwise need a branch for *the rows in no container*, and the first one
       that forgets draws a day whose exercises are invisible. The id is derived
       from the slot, not minted, for `SEEDED_UID_PREFIX`'s reason: this runs
       during render on both halves and a counter does not agree across them.
       The NAME stays null — the day already has one, and `DayCard` falls back
       to it rather than writing the same string into every row. */
    workoutId: w.workoutId ?? seedWorkoutId(w.week ?? 1, w.dayOfWeek ?? 1),
    workoutName: w.workoutName ?? null,
    setDetail: w.setDetail ? w.setDetail.map(fromWireSet) : null,
  }));
}

/** The container a pre-law-5 day is read as. Derived, never minted. */
export function seedWorkoutId(week: number, day: number): string {
  return `w-seed-${week}-${day}`;
}

function fromWireSet(s: SetDetailWire): SetDetail {
  return {
    reps: s.reps ?? null,
    durationSeconds: s.durationSeconds ?? null,
    toFailure: s.toFailure === true,
  };
}

/* ══════════════════════════════════════════════ shape of a template ══ */

/**
 * THE THREE SHAPE COLUMNS, AND WHOEVER HAS THEM.
 *
 * `daysOf` and `weekCountOf` used to take a `TemplateWire`, which was true
 * while a blueprint was the only thing with a shape. A client's copy owns the
 * same three — `ProgramRow`'s own note argues why it must, and it is the whole
 * reason `/clients/:id/program/:pid` can add a fourth training day for one
 * person — so the parameter is the three columns rather than the row that
 * happened to hold them first. `TemplateWire` still satisfies it, structurally
 * and without a cast; `ProgramWire`, whose three are optional on the wire,
 * satisfies it too and falls through to the same derivation.
 */
export interface Shaped {
  trainingDays?: number[];
  dayLabels?: Record<string, string>;
  weeks?: number | null;
}

/**
 * The day slots this template lays out.
 *
 * `trainingDays` wins — law 2. The union with wherever exercises sit is the
 * fallback for a template authored before the column was writable over REST,
 * which is every template the web has ever created, and for one authored on the
 * phone before V24.
 */
export function daysOf(template: Shaped, entries: Entry[]): number[] {
  if (template.trainingDays && template.trainingDays.length > 0) {
    return [...new Set(template.trainingDays)].filter(d => d >= 1 && d <= 7).sort((a, b) => a - b);
  }
  const used = new Set<number>();
  for (const key of Object.keys(template.dayLabels ?? {})) {
    const n = Number.parseInt(key, 10);
    if (Number.isInteger(n) && n >= 1 && n <= 7) used.add(n);
  }
  for (const e of entries) if (e.day >= 1 && e.day <= 7) used.add(e.day);
  return [...used].sort((a, b) => a - b);
}

/**
 * WHAT THE BLUEPRINT IS MADE OF, in slot order — *Upper A · Lower A · Upper B*.
 *
 * The one fact about a program that is neither a figure nor a picture, and the
 * shelf drew neither it nor anything else in the 700px its name column had
 * spare. `dayLabels` is on the wire for every template and has been since the
 * builder could name a day.
 *
 * An UNNAMED slot is *Day 3* and not a gap: a trainer who named two of four
 * days should read the two they named in the right places, and a joined string
 * with a hole in it reads as a bug. The caller passes `days` rather than this
 * function deriving them, so the labels and the shape strip beside them can
 * never be computed off two different answers to *which slots does this train*.
 */
export function dayNamesOf(
  template: { dayLabels?: Record<string, string> | null },
  days: number[],
): string {
  const labels = template.dayLabels ?? {};
  return days
    .map(d => {
      const named = labels[String(d)];
      return named && named.trim() ? named.trim() : `Day ${d}`;
    })
    .join(' · ');
}

/** How long the program runs. `weeks` wins; the blueprint's own maximum is the
 *  floor, because a week with content in it exists whatever the column says. */
export function weekCountOf(template: Shaped, entries: Entry[]): number {
  const authored = entries.reduce((max, e) => Math.max(max, e.week), 1);
  return Math.max(template.weeks ?? 1, authored, 1);
}

/** The weeks that have something of their own. Everything else repeats week 1. */
export function authoredWeeks(entries: Entry[]): Set<number> {
  const out = new Set<number>();
  for (const e of entries) out.add(e.week);
  // Week 1 is authored by definition — it is what the others repeat, even when
  // it is still empty, and drawing it as "repeats week 1" would be circular.
  out.add(1);
  return out;
}

export function isRepeat(entries: Entry[], week: number): boolean {
  return week > 1 && !entries.some(e => e.week === week);
}

/**
 * What a given week actually contains — its own rows, or week 1's if it has
 * none. The `repeat` flag travels with them so the caller can draw the
 * distinction rather than having to re-derive it.
 */
export function effectiveWeek(entries: Entry[], week: number): { rows: Entry[]; repeat: boolean } {
  const own = entries.filter(e => e.week === week);
  if (own.length > 0 || week === 1) return { rows: own, repeat: false };
  return { rows: entries.filter(e => e.week === 1), repeat: true };
}

export function entriesFor(entries: Entry[], week: number, day: number): Entry[] {
  return entries
    .filter(e => e.week === week && e.day === day)
    .sort((a, b) => a.order - b.order);
}

/* ═════════════════════════════════════════════════════ blocks ══ */

/**
 * A day, read as BLOCKS rather than as rows.
 *
 * A superset is one block and not two rows, because the thing a trainer scans a
 * day for is "how many blocks is this", not "how many exercises". Members are
 * adjacent and share a `groupId`; the ordinal goes 4a / 4b rather than A1 / A2,
 * so the number still answers *where am I in the day* while the letter says
 * these two are one position.
 *
 * A group whose members are NOT adjacent is split into separate blocks rather
 * than gathered — the storage contract is "adjacent rows, one key", and quietly
 * reordering somebody's day to make a group contiguous is a write nobody asked
 * for.
 */
export interface Block {
  /** The block's position in the day, 1-based. The "4" of 4a. */
  ordinal: number;
  entries: Entry[];
  groupId: string | null;
}

export function blocksOf(rows: Entry[]): Block[] {
  const out: Block[] = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    if (last && row.groupId && last.groupId === row.groupId) {
      last.entries.push(row);
    } else {
      out.push({ ordinal: out.length + 1, entries: [row], groupId: row.groupId });
    }
  }
  return out;
}

/** "4a", "4b" — or just "4" when the block is one exercise. */
export function ordinalLabel(block: Block, index: number): string {
  if (block.entries.length === 1) return String(block.ordinal);
  return `${block.ordinal}${'abcdefgh'[index] ?? String(index + 1)}`;
}

/* ══════════════════════════════════════════════════ the containers ══ */

/**
 * A DAY, READ AS WORKOUTS — law 5, and the level above `blocksOf`.
 *
 * One run of adjacent rows sharing a `workoutId` is one container. Read exactly
 * as `blocksOf` reads a superset, and for the same reason: the storage contract
 * is *adjacent rows, one key*, so a non-adjacent run is drawn as two containers
 * rather than silently gathered — except that here it cannot happen, because
 * `reindex` settles the invariant on every write and every write goes through
 * it. `blocksOf` runs INSIDE each container, so the superset ordinals (`3a` /
 * `3b`) count within the workout, which is the number a trainer reads off the
 * card while coaching it.
 */
export interface DayWorkout {
  /** The container's id — what a menu action, a drag and a drop all address. */
  id: string;
  /** The trainer's name for it. Empty is legitimate: a day that predates law 5
   *  has a container and no name, and the card falls back to the day's. */
  name: string;
  /** Its position in the day, 1-based — *Workout 2* when nothing names it. */
  ordinal: number;
  entries: Entry[];
  blocks: Block[];
}

export function workoutsOf(rows: Entry[]): DayWorkout[] {
  const out: DayWorkout[] = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    const id = row.workoutId ?? '';
    if (last && last.id === id) last.entries.push(row);
    else out.push({ id, name: row.workoutName ?? '', ordinal: out.length + 1, entries: [row], blocks: [] });
  }
  for (const w of out) w.blocks = blocksOf(w.entries);
  return out;
}

/** One container out of a whole draft, with the lane it sits in. `null` when
 *  nothing holds that id any more — every caller is a menu item on a container
 *  that may have been removed by another tab's write in between. */
export function workoutAt(
  entries: Entry[],
  workoutId: string,
): { workout: DayWorkout; week: number; day: number } | null {
  const rows = entries.filter(e => e.workoutId === workoutId);
  if (rows.length === 0) return null;
  const { week, day } = rows[0];
  const found = workoutsOf(entriesFor(entries, week, day)).find(w => w.id === workoutId);
  return found ? { workout: found, week, day } : null;
}

/** What a container says about itself — `6 ex · 20 sets`, the day header's own
 *  figures one level down. Kept here rather than in `weeksheet.ts` so the card
 *  and the phone cannot print two different counts of one workout. */
export function workoutFigures(rows: Entry[]): string {
  const sets = rows.reduce((n, e) => n + (e.setDetail?.length ?? e.sets ?? 0), 0);
  return `${rows.length} ex · ${sets} sets`;
}

/* ═══════════════════════════════════════════════ the prescription ══ */

/**
 * A prescription is drawn in PARTS, not as a string.
 *
 * Because one of them is red: a set taken to failure reads as `F` in the danger
 * tone, and it is the only figure on a row that is not a number. And in the
 * weeks-across view exactly one part is accented — the figure that changed from
 * the week before — so the block reads as a progression rather than as four
 * columns of similar text.
 */
export interface Part {
  text: string;
  tone?: 'fail' | 'changed';
}

/** Consecutive sets that agree collapse into a run, which is also how a trainer
 *  says it out loud. `[12,12,F,F]` → two runs; `[10,8,6,4]` → four of one. */
export function collapseSets(detail: SetDetail[]): { label: string; count: number; fail: boolean }[] {
  const runs: { label: string; count: number; fail: boolean }[] = [];
  for (const set of detail) {
    const label = set.toFailure
      ? 'F'
      : set.durationSeconds != null
        ? `${set.durationSeconds}s`
        : set.reps != null
          ? String(set.reps)
          : '—';
    const last = runs[runs.length - 1];
    if (last && last.label === label) last.count += 1;
    else runs.push({ label, count: 1, fail: set.toFailure });
  }
  return runs;
}

/**
 * The app's own notation from `training/training.ts` — `3 × 8 · 90s rest`, and
 * `3 × 45s · 30s rest` for a hold. Whatever is missing is simply not said.
 *
 * Two departures from the phone, both additive:
 *
 * - a per-set list prints its runs (`2 × 12, 2 × F`), and where no two sets
 *   agree it prints them plainly (`10 · 8 · 6 · 4`) — a list of four "1 ×"
 *   runs is longer and says less;
 * - `tempo` and `targetLoad` are printed when they are set. The design set
 *   refuses a load here and says why — *"a load is not a field a template
 *   has"* — and that was true of the phone's blueprint and is not true of the
 *   wire: `targetLoad` has been on `TemplateExerciseInput` since templates
 *   existed and `apply` has always copied it to `program_exercise`. So it is a
 *   starting load the trainer may set and usually will not, rather than a
 *   number the screen invents.
 */
export function prescribe(entry: Entry, groupRest = false): Part[] {
  const parts: Part[] = [];

  if (entry.setDetail && entry.setDetail.length > 0) {
    const runs = collapseSets(entry.setDetail);
    const anyRepeat = runs.some(r => r.count > 1);
    if (anyRepeat) {
      runs.forEach((run, i) => {
        if (i > 0) parts.push({ text: ', ' });
        parts.push({ text: `${run.count} × ` });
        parts.push({ text: run.label, tone: run.fail ? 'fail' : undefined });
      });
    } else {
      runs.forEach((run, i) => {
        if (i > 0) parts.push({ text: ' · ' });
        parts.push({ text: run.label, tone: run.fail ? 'fail' : undefined });
      });
    }
  } else {
    const work = entry.durationSeconds ? `${entry.durationSeconds}s` : entry.reps;
    if (entry.sets && work) parts.push({ text: `${entry.sets} × ${work}` });
    else if (entry.sets) parts.push({ text: `${entry.sets} sets` });
    else if (entry.durationSeconds) parts.push({ text: `${entry.durationSeconds}s` });
    else if (entry.reps) parts.push({ text: `${entry.reps} reps` });
  }

  if (entry.targetLoad != null) push(parts, `@ ${trimNumber(entry.targetLoad)} kg`);
  // A superset's rest is after the ROUND, not between the movements, so the
  // block prints it once and the member rows say nothing. Printing it twice is
  // how a superset turns back into two straight sets on the gym floor.
  if (entry.restSeconds && !groupRest) push(parts, `${entry.restSeconds}s rest`);
  if (entry.tempo) push(parts, `${entry.tempo} tempo`);
  if (entry.notes) push(parts, entry.notes);

  return parts;
}

function push(parts: Part[], text: string) {
  if (parts.length > 0) parts.push({ text: ' · ' });
  parts.push({ text });
}

export function partsToText(parts: Part[]): string {
  return parts.map(p => (p.tone === 'fail' ? 'to failure' : p.text)).join('');
}

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/**
 * The same prescription, with the one figure that moved since the week before
 * marked. Used only by the weeks-across view, where the whole point is the
 * comparison.
 *
 * Compares rendered text rather than fields, because that is what the trainer is
 * comparing: `3 × 8` → `3 × 10` accents the second half whichever field carries
 * it. Falls back to marking nothing when the rows do not line up — a diff
 * against a different exercise is noise dressed as a finding.
 */
export function prescribeAgainst(entry: Entry, previous: Entry | null): Part[] {
  const parts = prescribe(entry);
  if (!previous || previous.exerciseId !== entry.exerciseId) return parts;
  const before = prescribe(previous);
  return parts.map((part, i) => {
    const was = before[i];
    if (part.tone === 'fail') return part;
    if (!was || was.text !== part.text) return { ...part, tone: 'changed' as const };
    return part;
  });
}

/* ══════════════════════════════════════════════════════ writes ══ */

/** Renumber a day's rows 0…n after any structural change, so `order` is always
 *  dense and a saved blueprint reads back in the order it was drawn in. */
export function reindex(entries: Entry[]): Entry[] {
  const byLane = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = `${e.week}:${e.day}`;
    const list = byLane.get(key) ?? [];
    list.push(e);
    byLane.set(key, list);
  }
  const out: Entry[] = [];
  for (const list of byLane.values()) {
    list.sort((a, b) => a.order - b.order);
    settleWorkouts(list).forEach((e, i) => out.push(e.order === i ? e : { ...e, order: i }));
  }
  return out;
}

/**
 * LAW 5'S INVARIANT, KEPT IN THE ONE PLACE EVERY WRITE PASSES THROUGH.
 *
 * A container is *adjacent rows, one key*, and a row-level write can break that
 * from two directions: a row dragged out of *Upper A* into the middle of
 * *Conditioning* would leave *Upper A* in two pieces, and a row nudged past a
 * container boundary would be drawn inside a workout it does not belong to.
 *
 * **POSITION WINS, AND THAT IS THE DELIBERATE READING.** A row that has been
 * put somewhere adopts the container it was put INTO: the trainer aimed at a
 * gap between two movements of *Conditioning*, and the only answer that matches
 * what they aimed at is that the row is now part of it. The alternative — refuse
 * the drop, or split the container — either takes a gesture away or produces a
 * second workout with the same name that the trainer never asked for.
 *
 * It is a no-op on the ordinary write: a day whose containers are already whole
 * comes back with the same objects, so `commit` still sees *nothing changed*
 * where nothing changed.
 */
function settleWorkouts(lane: Entry[]): Entry[] {
  let current: string | null = null;
  const closed = new Set<string>();
  return lane.map(row => {
    const id = row.workoutId;
    if (current === null || id === current) {
      current = id;
      return row;
    }
    // A container that has already had its run and is being met again — the row
    // was dropped inside somebody else's workout. It joins the one it is in.
    if (id === null || closed.has(id)) {
      const host = lane.find(e => e.workoutId === current);
      return { ...row, workoutId: current, workoutName: host?.workoutName ?? row.workoutName };
    }
    closed.add(current);
    current = id;
    return row;
  });
}

export function addEntries(entries: Entry[], additions: Entry[]): Entry[] {
  return reindex([...entries, ...additions]);
}

export function removeEntries(entries: Entry[], uids: Set<string>): Entry[] {
  const kept = entries.filter(e => !uids.has(e.uid));
  // A group that has lost all but one member is not a superset any more. Left
  // alone, the survivor keeps a `groupId` nothing else shares, which draws as a
  // one-member block with a "Superset" footer and no partner.
  return reindex(dissolveOrphanGroups(kept));
}

function dissolveOrphanGroups(entries: Entry[]): Entry[] {
  const counts = new Map<string, number>();
  for (const e of entries) if (e.groupId) counts.set(e.groupId, (counts.get(e.groupId) ?? 0) + 1);
  return entries.map(e => (e.groupId && counts.get(e.groupId) === 1 ? { ...e, groupId: null } : e));
}

export function updateEntry(entries: Entry[], uid: string, patch: Partial<Entry>): Entry[] {
  return entries.map(e => (e.uid === uid ? { ...e, ...patch } : e));
}

/**
 * Move rows to the end of another day — the keyboard path, and the only path.
 *
 * A drag is fast for a mouse and impossible for a keyboard, and WCAG 2.2 SC
 * 2.5.7 requires the single-pointer alternative. That is normally met by
 * building a drag and bolting a worse mechanism beside it; this builds only the
 * second one, for everybody. It works on a touch screen, it is one code path,
 * and the target is a click so it can be read before it commits — the same trade
 * `/schedule` made for moving a session.
 *
 * Rows keep their relative order, and a group moves whole: half a superset in
 * another day is a prescription nobody wrote.
 */
export function moveEntries(
  entries: Entry[],
  uids: Set<string>,
  toWeek: number,
  toDay: number,
): Entry[] {
  const expanded = expandToWholeGroups(entries, uids);
  const tail = Math.max(-1, ...entries.filter(e => e.week === toWeek && e.day === toDay).map(e => e.order)) + 1;
  const moving = entries.filter(e => expanded.has(e.uid)).sort((a, b) => a.order - b.order);
  const offsets = new Map(moving.map((e, i) => [e.uid, tail + i]));
  return reindex(
    entries.map(e =>
      expanded.has(e.uid) ? { ...e, week: toWeek, day: toDay, order: offsets.get(e.uid)! } : e,
    ),
  );
}

/**
 * Drop rows into a lane at a POSITION — the pointer path, beside the two that
 * were already here.
 *
 * `moveEntries` appends to the end of a day and `nudge` swaps two neighbours;
 * neither can say "this one goes third". A drag can, so it gets its own write
 * rather than being expressed as a run of nudges — twelve swaps is twelve undo
 * steps for one gesture, and the last one is what the trainer would have to
 * press ⌘Z twelve times to take back.
 *
 * `beforeUid` is the row the moving block lands ABOVE, or null for the tail.
 * The rest is `moveEntries`' contract, unchanged: a group travels whole, and a
 * block dropped on itself is not a move.
 */
export function dropEntries(
  entries: Entry[],
  uids: Set<string>,
  toWeek: number,
  toDay: number,
  beforeUid: string | null,
): Entry[] {
  const moving = expandToWholeGroups(entries, uids);
  /* LAW 5 — THE ROW JOINS THE WORKOUT IT WAS DROPPED INTO, and it is decided
     HERE rather than left to `settleWorkouts`.

     FOUND BY RENDERING, and it is the case that proves a position-only rule
     cannot work: dropping *Back Squat* between exercise 1 and 2 of a six-movement
     session leaves the lane holding [A, foreign, A, A, A, A], and any rule that
     reads only the sequence has to decide whether the run that resumes after the
     intruder is the same container or a new one. It picked *new* and split a
     workout in two — MEASURED: one row dropped, *Upper B* became *Workout 1* (one
     exercise) and *Workout 2* (six).

     The drop knows what the sequence cannot: the row was aimed AT a block, and
     the container that block belongs to is the answer. `beforeUid` names it;
     a drop at the tail joins the day's last container. */
  entries = adoptWorkout(entries, moving, toWeek, toDay, beforeUid);
  if (moving.size === 0) return entries;
  // Landing on your own block is where a drag most often ends — the trainer
  // thought better of it — and it must not cost an undo step.
  if (beforeUid !== null && moving.has(beforeUid)) return entries;

  const lane = entriesFor(entries, toWeek, toDay);
  const kept = lane.filter(e => !moving.has(e.uid));
  const taken = entries.filter(e => moving.has(e.uid)).sort((a, b) => a.order - b.order);
  const at = beforeUid === null ? -1 : kept.findIndex(e => e.uid === beforeUid);
  const cut = at < 0 ? kept.length : at;
  const next = [...kept.slice(0, cut), ...taken, ...kept.slice(cut)];

  // A drop that changes nothing returns the same array, so `commit` can tell a
  // gesture that moved something from one that did not.
  const settled =
    taken.every(e => e.week === toWeek && e.day === toDay) &&
    lane.length === next.length &&
    lane.every((e, i) => e.uid === next[i].uid);
  if (settled) return entries;

  const orders = new Map(next.map((e, i) => [e.uid, i]));
  return reindex(
    entries.map(e => {
      if (moving.has(e.uid)) return { ...e, week: toWeek, day: toDay, order: orders.get(e.uid)! };
      return orders.has(e.uid) ? { ...e, order: orders.get(e.uid)! } : e;
    }),
  );
}

/**
 * Put the moving rows into the container they were aimed at — see the note in
 * `dropEntries`, which is the only caller.
 *
 * Returns the SAME array when they are already in it, so a drag inside one
 * workout still reports itself as having changed nothing.
 */
function adoptWorkout(
  entries: Entry[],
  moving: Set<string>,
  toWeek: number,
  toDay: number,
  beforeUid: string | null,
): Entry[] {
  const lane = entriesFor(entries, toWeek, toDay).filter(e => !moving.has(e.uid));
  const above = beforeUid === null ? null : lane.find(e => e.uid === beforeUid) ?? null;
  /* A DAY WITH NOTHING ON IT gives the arriving rows a container of their own,
     and it is a NEW one carrying the old name rather than the id they came
     with: half a session dragged off Monday and the half left behind would
     otherwise share an id across two days, and every menu item addresses a
     container by that id — *Delete Upper A* would have taken both halves. */
  const host =
    lane.length === 0
      ? {
          workoutId: newWorkoutId(),
          workoutName: entries.find(e => moving.has(e.uid))?.workoutName ?? null,
        }
      : hostWorkout(lane, above);
  let touched = false;
  const next = entries.map(e => {
    if (!moving.has(e.uid) || e.workoutId === host.workoutId) return e;
    touched = true;
    return { ...e, workoutId: host.workoutId, workoutName: host.workoutName };
  });
  return touched ? next : entries;
}

/** A selection that touches one member of a superset touches all of them. */
export function expandToWholeGroups(entries: Entry[], uids: Set<string>): Set<string> {
  const groups = new Set<string>();
  for (const e of entries) if (uids.has(e.uid) && e.groupId) groups.add(e.groupId);
  if (groups.size === 0) return uids;
  const out = new Set(uids);
  for (const e of entries) if (e.groupId && groups.has(e.groupId)) out.add(e.uid);
  return out;
}

/** Nudge one row up or down inside its own day. The pointer-free reorder. */
export function nudge(entries: Entry[], uid: string, direction: -1 | 1): Entry[] {
  const self = entries.find(e => e.uid === uid);
  if (!self) return entries;
  const lane = entriesFor(entries, self.week, self.day);
  const at = lane.findIndex(e => e.uid === uid);
  const to = at + direction;
  if (at < 0 || to < 0 || to >= lane.length) return entries;
  const reordered = [...lane];
  [reordered[at], reordered[to]] = [reordered[to], reordered[at]];
  const orders = new Map(reordered.map((e, i) => [e.uid, i]));
  return reindex(entries.map(e => (orders.has(e.uid) ? { ...e, order: orders.get(e.uid)! } : e)));
}

/* ────────────────────────────────────────────────────── supersets ── */

/**
 * Pair a row with the one after it in the same day.
 *
 * The link affordance lives in the GAP between two rows, which is where the
 * relationship it creates lives — but it is also on the row menu and on ⌘L,
 * because a gap is pointer-only and this builder has already been through that
 * argument once for drag.
 *
 * Joining a row to one that is already in a group joins the group rather than
 * starting a second one, which is what makes a three-way superset one action
 * repeated rather than a different action.
 */
export function linkWithNext(entries: Entry[], uid: string): Entry[] {
  const self = entries.find(e => e.uid === uid);
  if (!self) return entries;
  const lane = entriesFor(entries, self.week, self.day);
  const at = lane.findIndex(e => e.uid === uid);
  const next = lane[at + 1];
  if (!next) return entries;

  const groupId = self.groupId ?? next.groupId ?? newGroupId();
  return entries.map(e => {
    if (e.uid === self.uid || e.uid === next.uid) return { ...e, groupId };
    // Anything already in either row's group comes along, so linking the tail of
    // a pair to a third row makes one block of three rather than two of two.
    if (e.groupId && (e.groupId === self.groupId || e.groupId === next.groupId)) {
      return { ...e, groupId };
    }
    return e;
  });
}

/** Break a whole block apart. Each row gets its own rest back — which is what
 *  the panel warns about before the link is made, because it is the one
 *  consequence nobody predicts. */
export function unlinkGroup(entries: Entry[], groupId: string): Entry[] {
  return entries.map(e => (e.groupId === groupId ? { ...e, groupId: null } : e));
}

/* ────────────────────────────────────────────────── copy week / day ── */

/**
 * Copy one week's rows onto another, replacing whatever was there.
 *
 * This is how progressive overload is actually written: build week 1, copy it
 * forward, adjust the loads. It is also what turns a *repeating* week into one
 * of its own — the design's "making a week its own is one action", offered in
 * the column that would change.
 *
 * Group ids are re-minted per week. Two weeks sharing one correlation id would
 * make "the rows in this superset" a question with an answer spanning both.
 */
export function copyWeek(entries: Entry[], from: number, to: number): Entry[] {
  if (from === to) return entries;
  const source = entries.filter(e => e.week === from);
  const groups = new Map<string, string>();
  /* AND SO IS THE CONTAINER ID, which this function did not do and
     `duplicateWeek` beside it always has. Every write addressed by container —
     `workoutAt`, `rowsOfWorkout`, `removeWorkout`, `nudgeWorkout` — filters the
     WHOLE draft by `workoutId` and takes the first week it finds, so two weeks
     sharing one id is *Remove this workout* on week 3 emptying week 1 as well.
     Latent for as long as a repeating week had to be made its own before it
     could be touched; reachable the moment any week can be written in
     directly. Same rule as the group id above it, and the same wording as
     `duplicateWeek`'s. */
  const workouts = new Map<string, string>();
  const copies = source.map(e => ({
    ...e,
    uid: newUid(),
    week: to,
    workoutId: e.workoutId ? mapWorkout(workouts, e.workoutId) : null,
    groupId: e.groupId ? mapGroup(groups, e.groupId) : null,
  }));
  return reindex([...entries.filter(e => e.week !== to), ...copies]);
}

/**
 * THE SAME WEEK, MADE ITS OWN ON THE WAY TO WRITING IN IT.
 *
 * ── LAW 3 IS A STORAGE RULE, AND IT HAD BECOME A PERMISSION ────────────────
 *
 * *A week with nothing of its own repeats week 1* is what lets an eight-week
 * block exist without eight copies of one week on the wire, and it stays. What
 * went with it was a GATE: the card on a repeating week drew its rows greyed
 * into one blob, refused every drag and every row menu, and put *Make this week
 * its own* where the numbers should have been. So writing week 4 was: notice
 * the sentence, read it, press the button, wait for the board to redraw, then
 * make the edit you came for. Four steps to reach the state week 1 is in
 * permanently, and nothing about the model required any of them.
 *
 * This is that button, moved to where it belongs: a week becomes its own the
 * instant somebody writes in it, and not one keystroke sooner. A week nobody
 * has touched still repeats week 1 — the storage rule is intact, the toolbar's
 * *weeks 2–8 repeat week 1* is still true, and the wire still carries one
 * week's rows instead of eight.
 *
 * ── AND THE IDS IT HANDS BACK ──────────────────────────────────────────────
 *
 * The copies are new rows with new ids, so every id the CALLER is holding —
 * the uid of the row it is about to nudge, the container it is about to
 * remove, the group it is about to unlink — names week 1's copy of that thing
 * and would write into week 1. `id` translates one: hand it whatever the click
 * carried and it comes back pointing at this week's row. It is the identity
 * function when nothing was copied, which is every call on an authored week,
 * so the write sites read the same either way and there is no branch to forget.
 */
export function ownWeek(
  entries: Entry[],
  week: number,
): { entries: Entry[]; id: (id: string) => string } {
  const same = { entries, id: (id: string) => id };
  /* Week 1 is authored by definition — `authoredWeeks` says so — and a week
     that has anything of its own is already what this function makes. */
  if (week === 1 || entries.some(e => e.week === week)) return same;
  const source = entries.filter(e => e.week === 1);
  /* NOTHING TO COPY is not the same as nothing to do, and it is still nothing
     to do: the write that follows lands on an empty week, which is exactly
     what week 1 would give it. */
  if (source.length === 0) return same;

  const map = new Map<string, string>();
  const groups = new Map<string, string>();
  const workouts = new Map<string, string>();
  const copies = source.map(e => {
    const uid = newUid();
    map.set(e.uid, uid);
    const groupId = e.groupId ? mapGroup(groups, e.groupId) : null;
    const workoutId = e.workoutId ? mapWorkout(workouts, e.workoutId) : null;
    if (e.groupId && groupId) map.set(e.groupId, groupId);
    if (e.workoutId && workoutId) map.set(e.workoutId, workoutId);
    return { ...e, uid, week, groupId, workoutId };
  });
  /* ONE MAP FOR ALL THREE KINDS OF ID. A uid, a group id and a container id are
     three separate spaces of unique strings and a caller knows which one it is
     holding, so a map that answers all three is one lookup rather than three
     translators the call sites would have to pick between. */
  return { entries: reindex([...entries, ...copies]), id: (id: string) => map.get(id) ?? id };
}

/** Copy one day onto another inside the same week. The second-most-used action
 *  in the builder after duplicate: a Push day is most of a Pull day. */
export function copyDay(entries: Entry[], week: number, from: number, to: number): Entry[] {
  if (from === to) return entries;
  const source = entriesFor(entries, week, from);
  const groups = new Map<string, string>();
  /* And the container id, for `copyWeek`'s reason one level down: a workout
     names a container in one DAY, and two days sharing one id is *Remove this
     workout* on Thursday emptying Monday. */
  const workouts = new Map<string, string>();
  const copies = source.map(e => ({
    ...e,
    uid: newUid(),
    day: to,
    workoutId: e.workoutId ? mapWorkout(workouts, e.workoutId) : null,
    groupId: e.groupId ? mapGroup(groups, e.groupId) : null,
  }));
  return reindex([...entries.filter(e => !(e.week === week && e.day === to)), ...copies]);
}

/* ═════════════════════════════════════════ the container's own writes ══

   FIVE WRITES ON A WORKOUT, AND EVERY ONE OF THEM IS THE ROW-LEVEL WRITE ONE
   LEVEL UP. `moveWorkout` is `dropEntries` with a container for a payload,
   `copyWorkoutTo` is `copyDay` for one of a day's several workouts,
   `nudgeWorkout` is `nudge` measured in containers rather than blocks. They are
   separate functions rather than a `scope` argument because the UNIT differs:
   *before* means *above this row* to one and *above this workout* to the other,
   and a caller that got the two confused would drop a session into the middle
   of another one — which `settleWorkouts` would then absorb, silently.        */

/**
 * WHICH CONTAINER A NEW ROW JOINS — the one question every *add* on this screen
 * has to answer now that law 5 says there are no loose rows.
 *
 * `at` is the row it was aimed at: the block a drag was let go above, or the
 * row a menu was opened on. Absent, it is the tail of the day, which is what a
 * click on a library row means. An EMPTY day has no container to join, so one
 * is minted — unnamed, drawn under the day's own name — because the alternative
 * is a click that does nothing on the one day that most needs an exercise.
 */
export function hostWorkout(
  lane: Entry[],
  at?: Entry | null,
): { workoutId: string; workoutName: string | null } {
  const anchor = at ?? lane[lane.length - 1] ?? null;
  if (anchor?.workoutId) {
    return { workoutId: anchor.workoutId, workoutName: anchor.workoutName };
  }
  return { workoutId: newWorkoutId(), workoutName: null };
}

/** The rows of one container, in order. */
function rowsOfWorkout(entries: Entry[], workoutId: string): Entry[] {
  return entries.filter(e => e.workoutId === workoutId).sort((a, b) => a.order - b.order);
}

/**
 * MOVE A WHOLE WORKOUT ONTO ANOTHER DAY — the container drag, and the menu's
 * *Move up* / *Move down* when the target is the same day.
 *
 * `beforeWorkoutId` is the container it lands ABOVE, null for the tail. A move
 * that changes nothing returns the same array, so a drag the trainer thought
 * better of costs no undo step and no autosave — `dropEntries`' rule, kept.
 */
export function moveWorkout(
  entries: Entry[],
  workoutId: string,
  toWeek: number,
  toDay: number,
  beforeWorkoutId: string | null = null,
): Entry[] {
  const moving = rowsOfWorkout(entries, workoutId);
  if (moving.length === 0 || beforeWorkoutId === workoutId) return entries;

  const lane = entriesFor(entries, toWeek, toDay).filter(e => e.workoutId !== workoutId);
  const at = beforeWorkoutId === null ? -1 : lane.findIndex(e => e.workoutId === beforeWorkoutId);
  const cut = at < 0 ? lane.length : at;
  const next = [...lane.slice(0, cut), ...moving, ...lane.slice(cut)];

  const before = entriesFor(entries, toWeek, toDay);
  const settled =
    moving.every(e => e.week === toWeek && e.day === toDay) &&
    before.length === next.length &&
    before.every((e, i) => e.uid === next[i].uid);
  if (settled) return entries;

  const orders = new Map(next.map((e, i) => [e.uid, i]));
  return reindex(
    entries.map(e => {
      if (!orders.has(e.uid)) return e;
      return { ...e, week: toWeek, day: toDay, order: orders.get(e.uid)! };
    }),
  );
}

/**
 * THE SAME SESSION ON A SECOND DAY — *Copy to day…*, and the paste it arms.
 *
 * A COPY AND NOT A LINK. `apply`'s rule one level up — *a copy is a copy* — is
 * the same here: Wednesday's version of Monday's session is going to be tuned
 * for Wednesday, and a container that edited both days at once would make that
 * tuning a thing the trainer has to undo somewhere they are not looking. Ids
 * are re-minted (the container's and every superset's) for exactly that reason;
 * the NAME is kept, because it is what the trainer recognises it by.
 */
export function copyWorkoutTo(
  entries: Entry[],
  workoutId: string,
  toWeek: number,
  toDay: number,
  /** What to CALL the copy when the original has no name of its own — the
   *  pre-law-5 container, whose name has always been the day's. Landed on
   *  another day it would have nothing left to be called, and two boxes reading
   *  *Workout 1* and *Workout 2* on one card is the one outcome worse than a
   *  duplicated string. The caller passes the source day's label. */
  name?: string,
): Entry[] {
  const source = rowsOfWorkout(entries, workoutId);
  if (source.length === 0) return entries;
  const groups = new Map<string, string>();
  const minted = newWorkoutId();
  const tail = Math.max(-1, ...entriesFor(entries, toWeek, toDay).map(e => e.order)) + 1;
  const copies = source.map((e, i) => ({
    ...e,
    uid: newUid(),
    week: toWeek,
    day: toDay,
    order: tail + i,
    workoutId: minted,
    workoutName: e.workoutName ?? name ?? null,
    groupId: e.groupId ? mapGroup(groups, e.groupId) : null,
  }));
  return reindex([...entries, ...copies]);
}

/** Throw a whole container away. One write, so one ⌘Z brings the session back
 *  — which is what lets the menu item not ask first. */
export function removeWorkout(entries: Entry[], workoutId: string): Entry[] {
  const uids = new Set(rowsOfWorkout(entries, workoutId).map(e => e.uid));
  if (uids.size === 0) return entries;
  return removeEntries(entries, uids);
}

/** Swap this container with its neighbour inside its own day — the pointer-free
 *  reorder, `nudge` counted in workouts. */
export function nudgeWorkout(entries: Entry[], workoutId: string, direction: -1 | 1): Entry[] {
  const found = workoutAt(entries, workoutId);
  if (!found) return entries;
  const lane = workoutsOf(entriesFor(entries, found.week, found.day));
  const at = lane.findIndex(w => w.id === workoutId);
  const to = at + direction;
  if (at < 0 || to < 0 || to >= lane.length) return entries;
  /* Moving DOWN is landing above the one after the neighbour — there is no
     *after* in `moveWorkout`'s vocabulary, and adding one would be a second way
     to say every position. The tail is `null`, which is what `to` being the
     last container means. */
  const before = direction === -1 ? lane[to].id : (lane[to + 1]?.id ?? null);
  return moveWorkout(entries, workoutId, found.week, found.day, before);
}

/** Rename one container, on every row that carries the name. */
export function renameWorkout(entries: Entry[], workoutId: string, name: string): Entry[] {
  return entries.map(e => (e.workoutId === workoutId ? { ...e, workoutName: name } : e));
}

/**
 * WHAT THE DIALOG WROTE, PUT BACK WHERE THE CONTAINER WAS — *Edit workout*.
 *
 * The rows are REPLACED rather than diffed: the dialog is a whole session
 * editor and what comes back out of it is the session, so matching movements up
 * to preserve uids would be guessing at an identity the dialog does not carry.
 * The container keeps its id and its position in the day, so a day's second
 * workout stays its second workout after an edit.
 */
export function replaceWorkout(entries: Entry[], workoutId: string, rows: Entry[]): Entry[] {
  const found = workoutAt(entries, workoutId);
  if (!found) return entries;
  const head = Math.min(...found.workout.entries.map(e => e.order));
  const kept = entries.filter(e => e.workoutId !== workoutId);
  const placed = rows.map((row, i) => ({
    ...row,
    week: found.week,
    day: found.day,
    /* `+ i / 1000` keeps the new rows between the row above and the one below —
       `reindex` makes the fractions whole again, the trick `duplicateRow` and
       the drag both already use. */
    order: head + i / 1000,
    workoutId,
  }));
  return reindex([...kept, ...placed]);
}

function mapWorkout(seen: Map<string, string>, id: string): string {
  const found = seen.get(id);
  if (found) return found;
  const minted = newWorkoutId();
  seen.set(id, minted);
  return minted;
}

function mapGroup(seen: Map<string, string>, id: string): string {
  const found = seen.get(id);
  if (found) return found;
  const minted = newGroupId();
  seen.set(id, minted);
  return minted;
}

/* ─────────────────────────────────────────────────────── progression ── */

/**
 * The rule that replaces thirty-six cells with one form.
 *
 * "Week 1: 3 × 8, week 2: 3 × 10, week 3: 3 × 12" is how a block is actually
 * programmed, and typing it costs one edit per exercise per week — nine
 * exercises across eight weeks is seventy-two. So the trainer states the ladder
 * once and it is materialised: every week in `plan` is week 1's structure with
 * week 1's exercises, carrying that week's numbers.
 *
 * Three things it deliberately does:
 *
 * - **It only ever writes the weeks named in the plan**, so a trainer laddering
 *   weeks 1–4 of an eight-week block leaves 5–8 repeating week 1, which is the
 *   model's own answer for "nothing of its own".
 * - **A week that already has content is replaced, not merged.** Merging two
 *   prescriptions for one exercise has no honest answer, and the panel says
 *   which weeks it is about to overwrite before it runs.
 * - **`setDetail` is cleared on a laddered week.** A ladder states one pair of
 *   numbers for the week; leaving a per-set list behind would let the row draw
 *   `2 × 12, 2 × F` under a heading that says 3 × 10, and the list would win.
 */
export interface ProgressionStep {
  week: number;
  sets: number | null;
  reps: number | null;
  durationSeconds: number | null;
  /** Absent leaves each row's own rest alone, which is usually right. */
  restSeconds: number | null;
  targetLoad: number | null;
}

export function applyProgression(
  entries: Entry[],
  plan: ProgressionStep[],
  days: number[],
): Entry[] {
  if (plan.length === 0) return entries;
  const touched = new Set(plan.map(p => p.week));
  const inScope = (e: Entry) => days.includes(e.day);

  // Week 1 is the shape every other week takes. Rows outside the chosen days
  // are left exactly as they are, in every week.
  const source = entries.filter(e => e.week === 1 && inScope(e));

  const kept = entries.filter(e => !(touched.has(e.week) && inScope(e)));
  const written: Entry[] = [];

  for (const step of plan) {
    const groups = new Map<string, string>();
    for (const row of source) {
      written.push({
        ...row,
        uid: step.week === 1 ? row.uid : newUid(),
        week: step.week,
        sets: step.sets ?? row.sets,
        reps: step.durationSeconds != null ? null : (step.reps ?? row.reps),
        durationSeconds: step.durationSeconds ?? (step.reps != null ? null : row.durationSeconds),
        restSeconds: step.restSeconds ?? row.restSeconds,
        targetLoad: step.targetLoad ?? row.targetLoad,
        setDetail: null,
        groupId: row.groupId ? mapGroup(groups, row.groupId) : null,
      });
    }
  }

  return reindex([...kept, ...written]);
}

/**
 * The ladder a trainer most often means, seeded from week 1 so the form opens
 * already holding what the program currently says.
 *
 * `repsStep` of 2 over 4 weeks is 8, 10, 12, 14. `setsEvery` of 2 adds a set
 * every second week. Both are starting points the trainer then edits per week —
 * a generator that cannot be overridden is a rule, and nobody's block is a rule
 * all the way to week eight.
 */
export function ladder(
  weeks: number,
  base: { sets: number | null; reps: number | null; durationSeconds: number | null },
  opts: { repsStep?: number; setsEvery?: number; loadStep?: number; baseLoad?: number | null } = {},
): ProgressionStep[] {
  const out: ProgressionStep[] = [];
  for (let w = 1; w <= weeks; w += 1) {
    const i = w - 1;
    const setsBump = opts.setsEvery && opts.setsEvery > 0 ? Math.floor(i / opts.setsEvery) : 0;
    out.push({
      week: w,
      sets: base.sets == null ? null : base.sets + setsBump,
      reps: base.reps == null ? null : base.reps + (opts.repsStep ?? 0) * i,
      durationSeconds:
        base.durationSeconds == null ? null : base.durationSeconds + (opts.repsStep ?? 0) * i,
      restSeconds: null,
      targetLoad:
        opts.baseLoad == null ? null : Number((opts.baseLoad + (opts.loadStep ?? 0) * i).toFixed(2)),
    });
  }
  return out;
}

/* ══════════════════════════════════════════════════════ summaries ══ */

/** "2–8", "3, 5–7" — a run of week numbers said as a range rather than a list.
 *  Eight commas is a sentence a trainer has to parse; a dash is one they read. */
export function weekRanges(weeks: number[]): string {
  const ns = [...weeks].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < ns.length; ) {
    let j = i;
    while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j += 1;
    out.push(j > i ? `${ns[i]}–${ns[j]}` : `${ns[i]}`);
    i = j + 1;
  }
  return out.join(', ');
}

/**
 * THE REPEATS, SAID ONCE — never eight identical chips explained eight times.
 *
 * Law 3's whole cost to a reader is that the week they are not looking at may
 * be week 1 wearing a different number, so the strip states it in one sentence
 * beside the chips rather than leaving it to be discovered a click at a time.
 * Empty when nothing repeats, which is the honest answer for a fully authored
 * block and the reason the caller renders nothing rather than "no repeats".
 */
export function repeatLine(entries: Entry[], weeks: number): string {
  const repeats: number[] = [];
  for (let w = 2; w <= weeks; w += 1) if (isRepeat(entries, w)) repeats.push(w);
  if (repeats.length === 0) return '';
  if (repeats.length === 1) return `week ${repeats[0]} repeats week 1`;
  return `weeks ${weekRanges(repeats)} repeat week 1`;
}

/** `3 × 8`, `3 × 45s` — one row's shape, without its load or its rest. */
function shapeOf(entry: Entry): string | null {
  if (entry.sets == null) return null;
  if (entry.durationSeconds != null) return `${entry.sets} × ${entry.durationSeconds}s`;
  if (entry.reps != null) return `${entry.sets} × ${entry.reps}`;
  return null;
}

/** The commonest value in a list — the week's shape, when its rows disagree.
 *  A week is rarely uniform (the last accessory is 3 × 15 while the compounds
 *  are 4 × 6), so the modal value is what "this week is 4 × 6" means. */
function commonest<T>(values: (T | null)[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) if (v != null) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let seen = 0;
  for (const [value, n] of counts) if (n > seen) [best, seen] = [value, n];
  return best;
}

/**
 * THE LADDER THIS PROGRAM ACTUALLY CARRIES, read back off the rows.
 *
 * The prototype's `Overload` chips are a fixture switch — they GENERATE weeks
 * 2–8 from `+2.5 kg / 2 wk`, which this model has no room for: law 3 says a
 * week is rows somebody wrote or it is week 1, and `TemplateWire` has no rule
 * column to hold one. So the strip states what is TRUE rather than what was
 * set: the shape week 1 opens on, the shape the last authored week reaches,
 * and the span between them.
 *
 * `null` when there is nothing to say — one authored week, or eight that all
 * say the same thing — and the caller offers *Set a rule* in its place.
 */
export function overloadLine(entries: Entry[]): string | null {
  const authored = [...authoredWeeks(entries)].sort((a, b) => a - b);
  const last = authored[authored.length - 1];
  if (last == null || last <= 1) return null;

  const rowsIn = (week: number) => entries.filter(e => e.week === week);
  const first = commonest(rowsIn(1).map(shapeOf));
  const final = commonest(rowsIn(last).map(shapeOf));
  const span = `wk 1–${last}`;

  if (first && final && first !== final) return `${first} → ${final} · ${span}`;

  // The shape held and the load moved — the other half of how a block is
  // written, and the half the prototype's `+2.5 kg` chip was about.
  const fromLoad = commonest(rowsIn(1).map(e => e.targetLoad));
  const toLoad = commonest(rowsIn(last).map(e => e.targetLoad));
  if (fromLoad != null && toLoad != null && fromLoad !== toLoad) {
    return `${fromLoad} → ${toLoad} kg · ${span}`;
  }
  return null;
}

/** "3 days a week · 8 weeks · 9 clients on a copy" — the shelf row's subtitle
 *  and the builder's, written once so they cannot disagree. */
/**
 * THE SHAPE, AS PARTS RATHER THAN A SENTENCE.
 *
 * `shapeLine` joins these and is still what the desk reads. The phone needs the
 * third clause as its own ELEMENT, because a 360px header cannot hold all three
 * and clipping a string mid-word produced *"13 clients on a c…"* — a figure with
 * its unit cut off, which is worse than the clause being absent. A CSS rule can
 * drop a span; it cannot drop the last clause of a string.
 *
 * The count is why this is structural and not a width tune: at 390px the line
 * fits to the pixel, so a trainer whose roster reaches three digits, or whose
 * block reaches ten weeks, breaks it again.
 */
export function shapeParts(days: number, weeks: number, clients: number): string[] {
  return [
    `${days} day${days === 1 ? '' : 's'} a week`,
    `${weeks} week${weeks === 1 ? '' : 's'}`,
    clients === 0 ? 'nobody on it yet' : `${clients} client${clients === 1 ? '' : 's'} on a copy`,
  ];
}

export function shapeLine(days: number, weeks: number, clients: number): string {
  return shapeParts(days, weeks, clients).join(' · ');
}

export function relativeDay(ms: number, now = Date.now()): string {
  const days = Math.floor((now - ms) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months <= 1 ? 'a month ago' : `${months} months ago`;
}

/** ISO weekday → the short name the assign form prints. 1 = Monday. */
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/**
 * WHAT A DAY IS CALLED ON THE THING THAT OWNS IT.
 *
 * Law 1 says a template's days are ORDINAL SLOTS — "Day 1" is the first day this
 * program trains, never Monday — and the board has printed `DAY 1` since it
 * existed because that is exactly right for a blueprint: it is written for
 * nobody in particular and cannot know which weekday anybody will train on.
 *
 * **A client's COPY is the other case, and the backend has always known it.**
 * `apply` translates every row through the schedule the trainer chose
 * (`copyBlueprintInto`, since V24), so `program_exercise.day_of_week` is a
 * concrete ISO weekday. On that screen `DAY 2` is not the second day of the
 * plan — it is Tuesday, which on a Tue/Fri client is the FIRST session of their
 * week. A number that reads as an ordinal and means a weekday is worse than
 * either alone.
 *
 * So the two screens name days differently, from one function: the builder gets
 * the ordinal and the copy gets the weekday. Nothing else about the board
 * changes, because nothing else about a day differs between them.
 */
export function ordinalDayWord(day: number): string {
  return `DAY ${day}`;
}

export function weekdayWord(day: number): string {
  return day >= 1 && day <= 7 ? WEEKDAYS[day - 1].toUpperCase() : `DAY ${day}`;
}

/* ────────────────────────────────────────────────── duplicate a week ── */

/**
 * COPYING A WEEK FORWARD, WHICH IS HOW A BLOCK IS ACTUALLY WRITTEN.
 *
 * `copyWeek` moves one week onto one other week, and it is what the day menu's
 * *Copy week to…* has always used. What a trainer means by "duplicate" is
 * rarely one week: they mean *this, again, for the rest of the block* — and
 * then, usually, *with a little more each time*. Three answers in one form:
 *
 * - **Which weeks.** The next one, every second one, or all of them. Nothing
 *   past `weeks`, because a week the block does not have is not a destination.
 * - **What happens to weeks that already have content.** `copyWeek` replaces,
 *   which is the only honest answer when one exercise has two prescriptions —
 *   but it is not the only useful one. *Keep both* appends, for a trainer
 *   building a week out of two sources; *skip* leaves authored weeks alone, so
 *   "fill the empty weeks" is one action rather than a survey of the strip.
 * - **Whether the copies climb.** Same as `ladder`'s seeds, applied by DISTANCE
 *   from the source week rather than by copy index: with *every 2 weeks*
 *   selected, week 5 gets what week 5 would get whether or not week 3 was
 *   written, so the ladder reads the same in the calendar either way.
 *
 * A stepped copy clears `setDetail` for the same reason `applyProgression`
 * does: a per-set list left under a changed heading would draw `2 × 12, 2 × F`
 * below a row that now says 3 × 12, and the list would win.
 */
export type DuplicateSpread = 'next' | 'alternate' | 'all';
export type DuplicateConflict = 'replace' | 'keep' | 'skip';
export type DuplicateStep = 'reps2' | 'reps1' | 'sets2' | 'same';

/** The weeks a spread names, given where the copy starts and how long the block
 *  is. Empty when the source is the last week — the caller says so rather than
 *  offering a button that writes nothing. */
export function duplicateTargets(from: number, weeks: number, spread: DuplicateSpread): number[] {
  const out: number[] = [];
  if (spread === 'next') {
    if (from + 1 <= weeks) out.push(from + 1);
    return out;
  }
  const stride = spread === 'alternate' ? 2 : 1;
  for (let w = from + stride; w <= weeks; w += stride) out.push(w);
  return out;
}

/** What one copied row carries in a week `distance` weeks after its source. */
function stepped(row: Entry, distance: number, step: DuplicateStep): Entry {
  if (step === 'same') return row;
  const bump =
    step === 'reps2' ? 2 * distance : step === 'reps1' ? 1 * distance : 0;
  const sets = step === 'sets2' ? Math.floor(distance / 2) : 0;
  return {
    ...row,
    sets: row.sets == null ? null : row.sets + sets,
    reps: row.reps == null ? null : row.reps + bump,
    durationSeconds: row.durationSeconds == null ? null : row.durationSeconds + bump,
    setDetail: null,
  };
}

export function duplicateWeek(
  entries: Entry[],
  from: number,
  weeks: number,
  opts: { spread: DuplicateSpread; conflict: DuplicateConflict; step: DuplicateStep },
): Entry[] {
  const source = entries.filter(e => e.week === from);
  if (source.length === 0) return entries;

  const authored = authoredWeeks(entries);
  const targets = duplicateTargets(from, weeks, opts.spread).filter(
    w => !(opts.conflict === 'skip' && authored.has(w)),
  );
  if (targets.length === 0) return entries;

  const replaced = new Set(
    opts.conflict === 'replace' ? targets : [],
  );
  const kept = entries.filter(e => !replaced.has(e.week));
  const copies: Entry[] = [];

  for (const to of targets) {
    /* Group ids are re-minted per destination week, for `copyWeek`'s reason:
       two weeks sharing one correlation id would make "the rows in this
       superset" a question with an answer spanning both. */
    const groups = new Map<string, string>();
    /* A workout id names a container in ONE week, so each destination week gets
       its own — minted per SOURCE container, so a day holding two workouts
       still holds two after the copy. Same rule as the group id above it. */
    const workouts = new Map<string, string>();
    for (const row of source) {
      copies.push(
        stepped(
          {
            ...row,
            uid: newUid(),
            week: to,
            /* *Keep both* appends: the copies land BELOW whatever the week
               already holds, so the trainer reads their own week first and the
               copy after it. `reindex` makes the numbers whole again. */
            order: row.order + (opts.conflict === 'keep' ? 1000 : 0),
            workoutId: row.workoutId ? mapWorkout(workouts, row.workoutId) : null,
            groupId: row.groupId ? mapGroup(groups, row.groupId) : null,
          },
          to - from,
          opts.step,
        ),
      );
    }
  }

  return reindex([...kept, ...copies]);
}
