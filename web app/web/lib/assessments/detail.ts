/**
 * ONE CHECK-IN, READ — the wire and the arithmetic behind
 * `/clients/assessments/:id`.
 *
 * Its own module beside `vocab.ts` and for the same reason, which is trap 18:
 * `api.ts` imports `server-only`, and a client component that reached through
 * it for a type would render the whole route blank with every gate green. What
 * is here reads no request, no cookie and no clock — it is the shape of the
 * payload and the sums taken over it, and both halves may import it.
 *
 * ── AND EVERY SUM IN IT IS TONELESS ─────────────────────────────────────────
 *
 * `ProgressAssessments` states the rule and it is the one rule this whole
 * screen is built around: **a waist going up on a client putting on muscle is
 * the plan working, and the same number on a client cutting is not.** This
 * product holds no field that tells those apart — `client.goal` is the
 * trainer's free text — so nothing below returns a tone, a direction that is
 * "good", or a rate. A change is a signed number and a fact; what it means is
 * the trainer's, and they are the one reading it.
 */

import type { AnswerKind, AssessmentWire, QuestionWire } from './vocab';

/* ────────────────────────────────────────────────────────────── the wire ── */

/** One reading, joined to the catalogue row that gives it a label and a unit. */
export interface ReadingWire {
  key: string;
  label: string;
  group: string;
  unit: string;
  /** The V5 metric id this charts as, or null. See `MeasurementDefRow`. */
  metric: string | null;
  value: number;
}

/**
 * One answer, joined to the question it answers.
 *
 * `text` is the QUESTION and `answer` is the sentence the client typed, which
 * is a naming the server chose deliberately: two fields called `text` and
 * `answerText` one line apart is the pair a reader gets wrong.
 */
export interface AnswerWire {
  questionId: string;
  text: string;
  kind: AnswerKind;
  scale: number | null;
  options: { id: string; text: string }[];
  allowMultiple: boolean;
  yes: boolean | null;
  rating: number | null;
  answer: string | null;
  optionIds: string[];
  /** The chosen options' own words, resolved on the server. */
  chosen: string[];
}

/** One reading in the record, and which check-in it came back on. */
export interface PointWire {
  assessmentId: string;
  /** `completedAt` — when the tape was read, not when it was asked for. */
  at: string;
  value: number;
}

/** Every reading this client has for one measurement, oldest first. */
export interface HistoryWire {
  key: string;
  points: PointWire[];
}

export interface AssessmentDetailWire extends AssessmentWire {
  client: { id: string; name: string; status: string } | null;
  template: { id: string; name: string; description: string | null } | null;
  /** What the template asks for — the whole content of a check-in not back yet. */
  asked: {
    measurements: { key: string; label: string; group: string; unit: string }[];
    questions: QuestionWire[];
  };
  readings: ReadingWire[];
  answers: AnswerWire[];
  history: HistoryWire[];
  /** Every check-in this client has had back, newest first. */
  returned: { id: string; name: string; at: string }[];
}

/* ───────────────────────────────────────────────────────── the arithmetic ── */

/** `72.2`, `62`, `-1.5` — a figure with no trailing zero it has not earned. */
export function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1);
}

/**
 * `+2.5` / `−1.2` / `no change`.
 *
 * A MINUS SIGN AND NOT A HYPHEN (U+2212), which is what the figure face draws
 * at the same width as the plus — a hyphen in a column of signed numbers sits
 * high and narrow and reads as a dash.
 *
 * `no change` in words rather than `0.0` is `ProgressAssessments`' call: a
 * zero in a column of signed figures reads as a missing value, where the words
 * are a fact.
 */
export function signed(d: number): string {
  const r = Math.round(d * 10) / 10;
  if (r === 0) return 'no change';
  return `${r > 0 ? '+' : '−'}${trim(Math.abs(r))}`;
}

export interface Reading {
  at: string;
  value: number;
  assessmentId: string;
}

/**
 * What the Measurements tab says about one measurement, for one check-in.
 *
 * `current` is the reading THIS check-in brought back and not the newest one on
 * record — a trainer opening a check-in from March is reading March, and a
 * panel that answered with September's number would be answering a question
 * nobody asked.
 *
 * `previous` is the reading before it in the record, which is the comparison
 * the tape is actually taken for, and it is null on a first check-in rather
 * than a zero: a `+72.2` against nothing is a claim about a change that was
 * never measured.
 */
export interface MeasureStats {
  current: Reading | null;
  previous: Reading | null;
  /** Against `previous`. Null where there is none. */
  step: number | null;
  /** Against the first reading on record. Null where this IS the first. */
  sinceFirst: number | null;
  first: Reading | null;
  low: Reading | null;
  high: Reading | null;
  points: Reading[];
}

export function measureStats(points: PointWire[], assessmentId: string): MeasureStats {
  const all: Reading[] = points.map((p) => ({
    at: p.at,
    value: p.value,
    assessmentId: p.assessmentId,
  }));

  const i = all.findIndex((p) => p.assessmentId === assessmentId);
  const current = i >= 0 ? all[i] : null;
  const previous = i > 0 ? all[i - 1] : null;
  const first = all.length > 0 ? all[0] : null;

  let low: Reading | null = null;
  let high: Reading | null = null;
  for (const p of all) {
    if (low === null || p.value < low.value) low = p;
    if (high === null || p.value > high.value) high = p;
  }

  return {
    current,
    previous,
    step: current && previous ? round1(current.value - previous.value) : null,
    /* Against the first reading and not against the whole record's last, which
       is the same figure only while the check-in being read is the newest one.
       Opened from March it would otherwise print September's progress under
       March's heading. */
    sinceFirst:
      current && first && first.assessmentId !== current.assessmentId
        ? round1(current.value - first.value)
        : null,
    first,
    low,
    high,
    points: all,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * The answer, in the words the screen prints.
 *
 * One function rather than a branch at the call-site, because the four kinds
 * are a closed list and the fifth reader of an answer would otherwise write
 * its own fourth branch. A rating keeps its scale — *7 out of 10* and not *7*,
 * which is a number with no size — and an unanswered question is null rather
 * than an empty string, so a caller can draw the difference between *they
 * skipped it* and *they wrote nothing*.
 */
export function answerText(a: AnswerWire): string | null {
  if (a.kind === 'yesno') return a.yes === null ? null : a.yes ? 'Yes' : 'No';
  if (a.kind === 'rating')
    return a.rating === null ? null : `${a.rating} out of ${a.scale ?? 10}`;
  if (a.kind === 'choice') {
    const words = [...a.chosen];
    if (a.answer) words.push(a.answer);
    return words.length === 0 ? null : words.join(' · ');
  }
  return a.answer && a.answer.trim() !== '' ? a.answer : null;
}

/** Whether anything came back for this question at all. */
export function answered(a: AnswerWire): boolean {
  return answerText(a) !== null;
}

/**
 * The measurements of one check-in, in catalogue order, grouped by body area.
 *
 * The catalogue's own order is "the order the tape goes round a body, top to
 * bottom", and the groups are its four headings — so a trainer reading the
 * card reads it in the order they would take it. Sorting by size of change, or
 * by name, would be this screen inventing an order the protocol already has.
 */
export function byGroup<T extends { group: string }>(rows: T[]): { group: string; rows: T[] }[] {
  const out: { group: string; rows: T[] }[] = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    if (last && last.group === row.group) last.rows.push(row);
    else out.push({ group: row.group, rows: [row] });
  }
  return out;
}
