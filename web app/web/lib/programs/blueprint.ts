/**
 * THE BLUEPRINT — the model behind `/programs`, and the only file that knows
 * what a template MEANS.
 *
 * Pure. No server, no React, no DOM. Every write on the builder is a pure
 * function from one entry list to another, which is what makes the undo stack
 * a stack of arrays and what lets the whole hierarchy — Program → Week → Day →
 * Exercise → Sets — be derived rather than stored.
 *
 * ── FOUR LAWS, AND THREE OF THEM ARE OLDER THAN THIS FILE ────────────────────
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
 */

import type { SetDetailWire, TemplateExerciseWire, TemplateWire } from './api';

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
  /** Per-set prescription. Null on the straight-sets majority. */
  setDetail: SetDetail[] | null;
}

export interface SetDetail {
  reps: number | null;
  durationSeconds: number | null;
  toFailure: boolean;
}

let uidSeq = 0;
export function newUid(): string {
  uidSeq += 1;
  return `e${uidSeq}`;
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
  return wire.map(w => ({
    uid: newUid(),
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
    setDetail: w.setDetail ? w.setDetail.map(fromWireSet) : null,
  }));
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
 * The day slots this template lays out.
 *
 * `trainingDays` wins — law 2. The union with wherever exercises sit is the
 * fallback for a template authored before the column was writable over REST,
 * which is every template the web has ever created, and for one authored on the
 * phone before V24.
 */
export function daysOf(template: TemplateWire, entries: Entry[]): number[] {
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

/** How long the program runs. `weeks` wins; the blueprint's own maximum is the
 *  floor, because a week with content in it exists whatever the column says. */
export function weekCountOf(template: TemplateWire, entries: Entry[]): number {
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
    list.forEach((e, i) => out.push(e.order === i ? e : { ...e, order: i }));
  }
  return out;
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
  const copies = source.map(e => ({
    ...e,
    uid: newUid(),
    week: to,
    groupId: e.groupId ? mapGroup(groups, e.groupId) : null,
  }));
  return reindex([...entries.filter(e => e.week !== to), ...copies]);
}

/** Copy one day onto another inside the same week. The second-most-used action
 *  in the builder after duplicate: a Push day is most of a Pull day. */
export function copyDay(entries: Entry[], week: number, from: number, to: number): Entry[] {
  if (from === to) return entries;
  const source = entriesFor(entries, week, from);
  const groups = new Map<string, string>();
  const copies = source.map(e => ({
    ...e,
    uid: newUid(),
    day: to,
    groupId: e.groupId ? mapGroup(groups, e.groupId) : null,
  }));
  return reindex([...entries.filter(e => !(e.week === week && e.day === to)), ...copies]);
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

/** "3 days a week · 8 weeks · 9 clients on a copy" — the shelf row's subtitle
 *  and the builder's, written once so they cannot disagree. */
export function shapeLine(days: number, weeks: number, clients: number): string {
  const parts = [
    `${days} day${days === 1 ? '' : 's'} a week`,
    `${weeks} week${weeks === 1 ? '' : 's'}`,
  ];
  parts.push(
    clients === 0
      ? 'nobody on it yet'
      : `${clients} client${clients === 1 ? '' : 's'} on a copy`,
  );
  return parts.join(' · ');
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
