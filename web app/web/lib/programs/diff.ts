/**
 * WHAT ONE CLIENT'S COPY SAYS THAT THE BLUEPRINT DOES NOT.
 *
 * The two-table design — `template` is the blueprint, `program` is the copy a
 * client is actually on — is what makes per-client coaching safe, and until this
 * file the product could not SAY what the difference was. It could only say
 * *behind*, which is a stamp comparison: it answers "has the blueprint moved
 * since this copy took it" and never "what did I change for Meera".
 *
 * Both screens that care ask the same question from opposite ends:
 *
 * - `/clients/:id/program/:pid` asks *how is this person's plan tuned* — so the
 *   trainer knows what they are about to throw away when they take the
 *   blueprint again;
 * - the push panel on `/programs/:id` asks *whose copy would this overwrite* —
 *   so a tidy-up of the blueprint does not silently delete a shoulder
 *   adaptation somebody wrote three weeks ago.
 *
 * One implementation, therefore, and it is PURE and IMPORT-FREE on purpose: the
 * mock backend computes it per assignment inside `mock/router.ts` (a real
 * backend would do the same — thirteen copies diffed in the browser is thirteen
 * round trips), and the client plan screen computes it against its own unsaved
 * draft. Anything imported here would have to be safe in both places, and
 * `lib/programs/api.ts` is `server-only`.
 *
 * ── IT DIFFS PRESCRIPTIONS, NOT ROWS ────────────────────────────────────────
 *
 * A row's identity on the wire is its `id`, and a copy's ids are its own — they
 * were minted by `apply`, so no id in a program matches any id in a template and
 * an id-keyed diff would report every row as both added and removed. What a
 * trainer means by "the same exercise" is the same movement in the same lane, so
 * that is what is paired: within one (week, day), in order, by `exerciseId`.
 *
 * ── AND A SWAP IS ONE FINDING, NOT TWO ──────────────────────────────────────
 *
 * *Bench Press → Dumbbell Press* is the single most common per-client edit there
 * is (an injury, a busy rack, a missing bar), and reported as `- Bench Press`
 * plus `+ Dumbbell Press` it reads as two changes and loses the fact that one
 * replaced the other. A lane whose leftovers are one of each is reported as a
 * swap.
 */

export interface DiffSet {
  reps: number | null;
  durationSeconds: number | null;
  toFailure: boolean | null;
}

/** The wire shape both a `template.exercises` row and a `program_exercise` row
 *  already have. Deliberately structural: neither side has to convert. */
export interface DiffRow {
  exerciseId: string;
  /** The approved alternate. Compared on its own — see `diffPlans`. */
  altExerciseId?: string | null;
  dayOfWeek: number | null;
  week: number | null;
  orderIndex: number;
  sets: number | null;
  reps: number | null;
  durationSeconds: number | null;
  restSeconds: number | null;
  targetLoad: number | null;
  tempo: string | null;
  notes: string | null;
  setDetail: DiffSet[] | null;
}

export type DiffKind =
  /** A movement in the copy that the blueprint does not have in that lane. */
  | 'added'
  /** A movement the blueprint has and the copy does not. */
  | 'removed'
  /** One movement standing in for another, in the same place. */
  | 'swapped'
  /** The same movement, prescribed differently — sets, reps, load, rest. */
  | 'changed'
  /** The same movement and the same numbers, with a line written for this
   *  client under it. Its own kind, and that is the correction below. */
  | 'note'
  /** The alternate this client may do instead — the approved swap. */
  | 'alt'
  /** The SHAPE — a day, a week, a label. Not a row at all. */
  | 'shape';

export interface DiffLine {
  kind: DiffKind;
  /** `0` on a shape line, which belongs to no week. */
  week: number;
  /** `0` on a shape line. */
  day: number;
  /** One sentence a trainer can read without opening anything. */
  text: string;
}

export interface PlanDiff {
  added: number;
  removed: number;
  swapped: number;
  changed: number;
  /** Cues written for this client. Counted apart from the prescription — see
   *  `prescriptionText`. */
  noted: number;
  /** Approved alternates set for this client. */
  alts: number;
  /** Shape changes — days, weeks, labels — counted apart from the rows. */
  shape: number;
  /** Everything above. `0` means the copy still says what the blueprint says. */
  total: number;
  lines: DiffLine[];
}

export const EMPTY_DIFF: PlanDiff = {
  added: 0,
  removed: 0,
  swapped: 0,
  changed: 0,
  noted: 0,
  alts: 0,
  shape: 0,
  total: 0,
  lines: [],
};

export interface DiffShape {
  weeks: number | null;
  trainingDays: number[];
  dayLabels: Record<string, string>;
}

export interface DiffInput {
  /** The blueprint — what the copy was taken from. */
  base: DiffRow[];
  /** The copy — what it says now. */
  copy: DiffRow[];
  baseShape?: DiffShape;
  copyShape?: DiffShape;
  /** A movement's name. Unknown ids fall back to a neutral word rather than an
   *  id, because a diff line is read aloud to nobody who knows what `ex_114` is. */
  nameOf?: (exerciseId: string) => string;
}

/** `week:day`, which is the lane a row lives in. Nulls read as 1 — the same
 *  reading `toEntries` gives them, so the diff and the board agree. */
function laneOf(row: DiffRow): string {
  return `${row.week ?? 1}:${row.dayOfWeek ?? 1}`;
}

function lanesOf(rows: DiffRow[]): Map<string, DiffRow[]> {
  const lanes = new Map<string, DiffRow[]>();
  for (const row of rows) {
    const key = laneOf(row);
    const lane = lanes.get(key);
    if (lane) lane.push(row);
    else lanes.set(key, [row]);
  }
  for (const lane of lanes.values()) lane.sort((a, b) => a.orderIndex - b.orderIndex);
  return lanes;
}

/**
 * `3 × 10 · 60s rest · @ 40 kg` — the app's own notation, short.
 *
 * `blueprint.prescribe` is the canonical renderer and this is NOT it: that one
 * returns tone-carrying parts for a board row and takes an `Entry`, and this
 * file may not import it (see the header). What matters is that two rows whose
 * prescriptions differ produce different strings, and that the string reads the
 * way a trainer says it.
 *
 * ── AND THE NOTE IS NOT IN IT, WHICH `prescribe` GETS RIGHT FOR A ROW AND
 *    WRONG FOR A DIFF ─────────────────────────────────────────────────────────
 *
 * FOUND BY RENDERING. `prescribe` appends `entry.notes` to the line because on
 * a board that is the whole row — the prescription and the cue under it read as
 * one instruction. Folded into a COMPARISON it is a different claim: the seed
 * attaches the trainer's per-client cue at the copy step, so every copy in the
 * book reported *17 re-prescribed* against a blueprint it agrees with on every
 * set, rep, load and rest. A trainer reading that opens the plan expecting the
 * numbers to have moved.
 *
 * A cue written for one client is a real difference and it is its OWN kind —
 * `note` — which is also the more useful answer for the push panel: those cues
 * are precisely what a blueprint push would wipe.
 */
export function prescriptionText(row: DiffRow): string {
  const parts: string[] = [];

  if (row.setDetail && row.setDetail.length > 0) {
    parts.push(
      row.setDetail
        .map(s => (s.toFailure ? 'F' : s.durationSeconds != null ? `${s.durationSeconds}s` : s.reps ?? '—'))
        .join(' · '),
    );
  } else {
    const work = row.durationSeconds ? `${row.durationSeconds}s` : row.reps;
    if (row.sets && work) parts.push(`${row.sets} × ${work}`);
    else if (row.sets) parts.push(`${row.sets} sets`);
    else if (row.durationSeconds) parts.push(`${row.durationSeconds}s`);
    else if (row.reps) parts.push(`${row.reps} reps`);
  }

  if (row.targetLoad != null) parts.push(`@ ${row.targetLoad} kg`);
  if (row.restSeconds) parts.push(`${row.restSeconds}s rest`);
  if (row.tempo) parts.push(`${row.tempo} tempo`);

  return parts.join(' · ') || 'no prescription';
}

function dayWord(day: number, labels: Record<string, string> | undefined): string {
  const label = labels?.[String(day)];
  return label ? `Day ${day} · ${label}` : `Day ${day}`;
}

/**
 * THE COMPARISON, and the order of the lines is the order a trainer reads them:
 * shape first (a day that is not there changes the meaning of every row under
 * it), then week by week, day by day.
 */
export function diffPlans(input: DiffInput): PlanDiff {
  const name = input.nameOf ?? (() => 'an exercise');
  const labels = input.copyShape?.dayLabels ?? input.baseShape?.dayLabels;
  const lines: DiffLine[] = [];
  let added = 0;
  let removed = 0;
  let swapped = 0;
  let changed = 0;
  let noted = 0;
  let alts = 0;
  let shape = 0;

  /* ── the shape ── */
  if (input.baseShape && input.copyShape) {
    const baseDays = [...new Set(input.baseShape.trainingDays)].sort((a, b) => a - b);
    const copyDays = [...new Set(input.copyShape.trainingDays)].sort((a, b) => a - b);
    for (const day of copyDays) {
      if (!baseDays.includes(day)) {
        shape += 1;
        lines.push({ kind: 'shape', week: 0, day: 0, text: `${dayWord(day, labels)} added` });
      }
    }
    for (const day of baseDays) {
      if (!copyDays.includes(day)) {
        shape += 1;
        lines.push({
          kind: 'shape',
          week: 0,
          day: 0,
          text: `${dayWord(day, input.baseShape.dayLabels)} removed`,
        });
      }
    }
    const baseWeeks = input.baseShape.weeks ?? null;
    const copyWeeks = input.copyShape.weeks ?? null;
    if (baseWeeks && copyWeeks && baseWeeks !== copyWeeks) {
      shape += 1;
      lines.push({
        kind: 'shape',
        week: 0,
        day: 0,
        text: `Runs ${copyWeeks} weeks, not ${baseWeeks}`,
      });
    }
    for (const day of copyDays) {
      const before = input.baseShape.dayLabels[String(day)] ?? '';
      const after = input.copyShape.dayLabels[String(day)] ?? '';
      if (baseDays.includes(day) && before !== after && (before || after)) {
        shape += 1;
        lines.push({
          kind: 'shape',
          week: 0,
          day: 0,
          text: after
            ? `Day ${day} is called ${after}${before ? `, not ${before}` : ''}`
            : `Day ${day} lost its name${before ? ` (${before})` : ''}`,
        });
      }
    }
  }

  /* ── the rows, lane by lane ── */
  const baseLanes = lanesOf(input.base);
  const copyLanes = lanesOf(input.copy);
  const keys = [...new Set([...baseLanes.keys(), ...copyLanes.keys()])].sort((a, b) => {
    const [aw, ad] = a.split(':').map(Number);
    const [bw, bd] = b.split(':').map(Number);
    return aw - bw || ad - bd;
  });

  for (const key of keys) {
    const [week, day] = key.split(':').map(Number);
    const mine = [...(copyLanes.get(key) ?? [])];
    const theirs = [...(baseLanes.get(key) ?? [])];

    /* PAIRED BY MOVEMENT, IN ORDER — not by position. A row inserted at the top
       of a day would otherwise report every row under it as changed, which is
       four findings for one edit and none of them true. */
    const pairs: { before: DiffRow; after: DiffRow }[] = [];
    const spareBase: DiffRow[] = [];
    const takenCopy = new Set<number>();
    for (const before of theirs) {
      const at = mine.findIndex(
        (row, i) => !takenCopy.has(i) && row.exerciseId === before.exerciseId,
      );
      if (at < 0) spareBase.push(before);
      else {
        takenCopy.add(at);
        pairs.push({ before, after: mine[at] });
      }
    }
    const spareCopy = mine.filter((_, i) => !takenCopy.has(i));

    for (const { before, after } of pairs) {
      const wasRx = prescriptionText(before);
      const nowRx = prescriptionText(after);
      if (wasRx !== nowRx) {
        changed += 1;
        lines.push({
          kind: 'changed',
          week,
          day,
          /* *the plan says*, not *was*. The same line is read from both ends
             — from a client's copy it means "yours says this, the blueprint
             says that", and from the push panel it means the same thing about
             somebody else's copy. "Was" reads as a change over time, which is
             the one thing neither screen is describing. */
          text: `${dayWord(day, labels)} · ${name(after.exerciseId)} ${nowRx} — the plan says ${wasRx}`,
        });
      }

      /* THE CUE, ON ITS OWN. Three cases and each reads differently: written
         for this client, rewritten, or taken off. */
      const wasNote = (before.notes ?? '').trim();
      const nowNote = (after.notes ?? '').trim();
      if (wasNote !== nowNote) {
        noted += 1;
        lines.push({
          kind: 'note',
          week,
          day,
          text: nowNote
            ? `${dayWord(day, labels)} · ${name(after.exerciseId)} — “${nowNote}”${wasNote ? ' (was a different cue)' : ''}`
            : `${dayWord(day, labels)} · ${name(after.exerciseId)} — the cue was removed`,
        });
      }

      /* AND THE APPROVED ALTERNATE, which is the one field on a row that is
         about what the client may do INSTEAD — a fact about them rather than
         about the movement, and the reason `/me/workout` can refuse a swap
         nobody signed off. */
      const wasAlt = before.altExerciseId ?? null;
      const nowAlt = after.altExerciseId ?? null;
      if (wasAlt !== nowAlt) {
        alts += 1;
        lines.push({
          kind: 'alt',
          week,
          day,
          text: nowAlt
            ? `${dayWord(day, labels)} · ${name(after.exerciseId)} — may do ${name(nowAlt)} instead`
            : `${dayWord(day, labels)} · ${name(after.exerciseId)} — the alternate was removed`,
        });
      }
    }

    /* ONE OUT, ONE IN, SAME LANE — the injury swap, and it is one change. Only
       when the leftovers are exactly one of each: two and two is a day that was
       rewritten, and pairing those by position would invent a correspondence
       nobody wrote. */
    if (spareBase.length === 1 && spareCopy.length === 1) {
      swapped += 1;
      lines.push({
        kind: 'swapped',
        week,
        day,
        text: `${dayWord(day, labels)} · ${name(spareBase[0].exerciseId)} → ${name(spareCopy[0].exerciseId)}`,
      });
    } else {
      for (const row of spareCopy) {
        added += 1;
        lines.push({
          kind: 'added',
          week,
          day,
          text: `${dayWord(day, labels)} · ${name(row.exerciseId)} added — ${prescriptionText(row)}`,
        });
      }
      for (const row of spareBase) {
        removed += 1;
        lines.push({
          kind: 'removed',
          week,
          day,
          text: `${dayWord(day, labels)} · ${name(row.exerciseId)} removed`,
        });
      }
    }
  }

  return {
    added,
    removed,
    swapped,
    changed,
    noted,
    alts,
    shape,
    total: added + removed + swapped + changed + noted + alts + shape,
    lines,
  };
}

/**
 * THE WORD FOR A KIND, once.
 *
 * Both panels tag their lines and the first pass gave them two vocabularies —
 * the client's plan said *Cue* and *Alternate* while the push panel printed the
 * raw enum through `text-transform:capitalize` as *Note* and *Alt*. One diff,
 * read from two ends, must not be two glossaries: a trainer comparing what they
 * are about to overwrite with what the client's screen says it is would be
 * reading two names for one thing.
 */
export function kindLabel(kind: DiffKind): string {
  switch (kind) {
    case 'added':
      return 'Added';
    case 'removed':
      return 'Removed';
    case 'swapped':
      return 'Swapped';
    case 'changed':
      return 'Changed';
    case 'note':
      return 'Cue';
    case 'alt':
      return 'Alternate';
    default:
      return 'Shape';
  }
}

/**
 * THE COLOUR FOR A KIND, once, and beside `kindLabel` for its reason.
 *
 * Three panels tag these lines now — what this copy says that the blueprint
 * does not, what the push would overwrite, and what an edit session changed —
 * and a kind that is warm on one and neutral on another would be three screens
 * disagreeing about which findings matter.
 *
 * **Removed is the only warm one, and that is not a judgement.** It is the line
 * a trainer scanning the list is hunting for, because it is the only kind that
 * is INVISIBLE ON THE BOARD ITSELF: an added row is a card that appeared, a
 * changed one is a figure that moved, and a removed one is a gap where nobody
 * is looking.
 */
export function diffTone(kind: DiffKind): 'warn' | 'acc' | 'neutral' {
  if (kind === 'removed') return 'warn';
  if (kind === 'added') return 'acc';
  return 'neutral';
}

/**
 * *3 changes* / *2 swaps, 1 added*. The sentence a row in the push panel and
 * the pill on the client plan both print, so the two cannot disagree.
 */
export function diffSummary(diff: PlanDiff): string {
  if (diff.total === 0) return 'matches the plan';
  const bits: string[] = [];
  if (diff.swapped) bits.push(`${diff.swapped} swapped`);
  if (diff.changed) bits.push(`${diff.changed} re-prescribed`);
  if (diff.added) bits.push(`${diff.added} added`);
  if (diff.removed) bits.push(`${diff.removed} removed`);
  if (diff.noted) bits.push(`${diff.noted} ${diff.noted === 1 ? 'cue' : 'cues'}`);
  if (diff.alts) bits.push(`${diff.alts} ${diff.alts === 1 ? 'alternate' : 'alternates'}`);
  if (diff.shape) bits.push(`${diff.shape} to the shape`);
  return bits.join(' · ');
}
