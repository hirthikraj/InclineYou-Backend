/**
 * THE ASSESSMENT VOCABULARY — the words, the tones and the shapes, and NOTHING
 * that reads a request, a cookie, a database or a clock.
 *
 * Its own module for trap 18's reason, which this codebase has paid for twice:
 * a module that imports `server-only` cannot be read by a client component, and
 * putting a shared vocabulary in one renders the whole route blank with every
 * gate green. `api.ts` beside this file is the `server-only` half; everything
 * both halves need is here.
 *
 * `lib/portal/range.ts` and `lib/today/time.ts` are the same arrangement.
 */

/* ────────────────────────────────────────────────────────── the wire ── */

/**
 * THREE STATES ON THE 1.1 WIRE. `waiting` (sent to the client, not back) is
 * next release's, with the portal: nothing is ever sent in v1, so nothing is
 * ever waiting. The field is `state` now and not `status` — it is derived from
 * `completedAt` and `dueOn`, never stored, and `status` is a stored column
 * everywhere else on this wire (R37).
 */
export type AssessmentStatus = 'booked' | 'missed' | 'done';

export type AnswerKind = 'yesno' | 'rating' | 'text' | 'choice';

export interface QuestionWire {
  id: string;
  text: string;
  kind: AnswerKind;
  /** 5, 10 or 20 on a `rating`; null on every other kind. */
  scale: number | null;
  /** `choice` only. */
  options: { id: string; text: string }[];
  /** `choice` only — the client may tick more than one. */
  allowMultiple: boolean;
  /** `choice` only — an *Other* line the client types into. */
  allowCustom: boolean;
}

export interface TemplateWire {
  id: string;
  name: string;
  description: string | null;
  measurements: { on: boolean; keys: string[] };
  questions: { on: boolean; items: QuestionWire[] };
  /** Clients on a live cycle of it right now — "on 6 clients", and the delete warning. */
  liveCycles: number;
  /** Epoch ms, like every instant on the 1.1 wire. */
  createdAt: number;
  updatedAt: number;
  /** Opaque; goes back as `If-Match` on the PUT, so an edit made in another tab is a 412 and not a silent overwrite. */
  version: string;
}

/** The list item (contract Assessments L1). */
export interface AssessmentWire {
  id: string;
  clientId: string;
  templateId: string;
  scheduleId: string | null;
  name: string;
  /** A calendar date, `yyyy-MM-dd`, in the workspace's zone — not an instant. */
  dueOn: string;
  /**
   * DERIVED ON THE SERVER, and read here rather than worked out again.
   *
   * The pair that would disagree if both sides derived it is a count on a
   * filter chip and the rows that chip selects.
   */
  state: AssessmentStatus;
  /** Epoch ms; null until done. */
  completedAt: number | null;
  /** `'trainer'` in v1, once done. */
  enteredBy: string | null;
  measurements: { got: number; asked: number };
  questions: { got: number; asked: number };
  createdAt: number;
  version: string;
}

/** A client's cycle on one template (contract Assessments L5). */
export interface ScheduleWire {
  id: string;
  clientId: string;
  templateId: string;
  templateName: string;
  intervalDays: number;
  nextDueOn: string;
  endedAt: number | null;
  /** The one not yet done — what *Take* opens. */
  openAssessmentId: string | null;
  createdAt: number;
  updatedAt: number;
  version: string;
}

export interface MeasurementWire {
  key: string;
  label: string;
  group: string;
  unit: string;
  /** Whether the client file draws a series for it (the six V5 ids). */
  charted: boolean;
}

export interface CatalogWire {
  groups: string[];
  measurements: MeasurementWire[];
  questions: QuestionWire[];
}

/* ───────────────────────────────────────────────────────── the words ── */

/**
 * Four states, four words, and the words are the argument.
 *
 * *Missed* and not *Overdue*: a check-in is not a debt. The trainer reading
 * this column is deciding whether to chase somebody, and what they need to
 * know is that the client did not answer — the money screens own *overdue* and
 * it means an invoice.
 *
 * *Waiting* and not *Sent*: the row is not about the email. It is about the
 * twenty minutes somebody still owes you.
 */
export const STATUS_LABEL: Record<AssessmentStatus, string> = {
  booked: 'Booked',
  missed: 'Missed',
  done: 'Done',
};

/**
 * `Tag`'s tones, and only three are spent.
 *
 * *Booked* and *Waiting* are both `neutral`, which looks like a missed
 * distinction and is not: neither is a thing to act on, and a list where every
 * row is coloured is a list with no colour in it. The two states that ARE
 * actionable — one client did not answer, one client did — are the two that
 * get a tone.
 */
export const STATUS_TONE: Record<AssessmentStatus, 'neutral' | 'ok' | 'warn'> = {
  booked: 'neutral',
  missed: 'warn',
  done: 'ok',
};

/**
 * The four stored states, in the order *what needs doing, then what does not*.
 *
 * KEPT WITH NO CONSUMER, which this codebase does deliberately rather than
 * deleting: it was the status facet's option list until the filter collapsed
 * `booked` and `waiting` into `incoming` (see `StatusFilter`), and it is the
 * one written-down ordering of the four states themselves — the next screen
 * that lists them, rather than filters by them, wants exactly this.
 */
export const STATUS_ORDER: AssessmentStatus[] = ['missed', 'booked', 'done'];

/* ───────────────────────────────────────────────── what the filter offers ── */

/**
 * FOUR FILTERS OVER FOUR STATES, AND THEY ARE NOT THE SAME FOUR.
 *
 * The facet used to offer the four statuses as a multi-select, which is the
 * model that falls out of the data and not the one a trainer asks the screen
 * for. Two changes, and both are the same argument read twice:
 *
 * **`incoming` is `booked` + `waiting`**, because the difference between them
 * is whether the EMAIL has gone out and a trainer filtering a list is asking
 * about the twenty minutes, not the email. `STATUS_TONE` already says this in
 * colour — the two are both `neutral`, "neither is a thing to act on" — so a
 * filter that splits them splits an axis the rest of the screen treats as one.
 * The row's own tag still says which, because on ONE row it is worth knowing.
 *
 * **And it is single-select with an explicit `all`.** Multi-select is right
 * where two values are one question (`Facet`'s own default, written for
 * exactly this axis) — but with `incoming` collapsed there is no pair left to
 * ask for: done, missed and incoming are three disjoint answers to *which
 * ones*. An explicit *All* then costs nothing and buys the row a trainer looks
 * for first, rather than making them find *Clear status* at the foot of a menu.
 */
export type StatusFilter = 'all' | 'done' | 'missed' | 'incoming';

/** The order the facet draws them: everything, then the two that need doing. */
export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'done', label: 'Taken' },
  { value: 'missed', label: 'Not taken' },
  { value: 'incoming', label: 'To take' },
];

/**
 * Which stored states a filter selects — the one place the collapse is
 * written down, read by the address on the way out and the wire on the way in.
 */
export const STATUSES_FOR: Record<StatusFilter, AssessmentStatus[]> = {
  all: [],
  done: ['done'],
  missed: ['missed'],
  incoming: ['booked'],
};

/**
 * What the client is shown, and therefore what the editor has to draw.
 *
 * FOUR, and the words are the reference's own — a trainer picking an answer
 * type is picking the CONTROL their client will see, so the list reads as the
 * four controls rather than as four grammars. *Several answers* is not among
 * them and must not come back: it is `allowMultiple` on a Multiple choice, for
 * the reason `AssessmentAnswerKind` gives at length.
 */
export const KIND_LABEL: Record<AnswerKind, string> = {
  yesno: 'Yes/No',
  rating: 'Rating',
  text: 'Text',
  choice: 'Multiple choice',
};

/** Simplest first. A trainer scanning this list is looking for the shape of an
 *  answer, and the shapes get bigger down it. */
export const KIND_ORDER: AnswerKind[] = ['yesno', 'rating', 'text', 'choice'];

/** The three scales a rating may use. See `AssessmentQuestionRow` for why three. */
export const SCALES = [5, 10, 20];

/* ──────────────────────────────────────────────────────── the shapes ── */

/**
 * `12 / 15` — what came back over what was asked, and whether that is short.
 *
 * A block that was never asked for answers `null` rather than `0 / 0`. The
 * difference is the whole reason the count columns exist: *0 / 11* is a client
 * who answered nothing, and a template with its questions switched off is not
 * a client who did anything at all. Drawing both as a zero would make the
 * column a liar on exactly the row a trainer is scanning for.
 */
export function blockCount(
  block: { got: number; asked: number },
  status: AssessmentStatus,
): { text: string; short: boolean } | null {
  if (block.asked === 0) return null;
  /* Nothing is back yet, so there is nothing to be short of — the ask alone.
     `0 / 11` on a check-in sent this morning reads as a failure and is not. */
  if (status !== 'done') return { text: String(block.asked), short: false };
  return { text: `${block.got} / ${block.asked}`, short: block.got < block.asked };
}

/**
 * One template's two counts, for the row on the Templates tab and the headings
 * inside the editor.
 */
export function templateCounts(t: TemplateWire) {
  return {
    measurements: t.measurements.on ? t.measurements.keys.length : 0,
    questions: t.questions.on ? t.questions.items.length : 0,
  };
}

/**
 * *15 measurements · 11 questions*, with the off blocks left out.
 *
 * A template with every block off says *Nothing asked yet*, which is a real
 * state — it is what a template looks like thirty seconds after it is created
 * — and it is the one sentence on that row that tells a trainer the row is not
 * finished rather than not loaded.
 */
export function templateShape(t: TemplateWire): string {
  const c = templateCounts(t);
  const parts: string[] = [];
  if (c.measurements > 0) parts.push(`${c.measurements} measurement${c.measurements === 1 ? '' : 's'}`);
  if (c.questions > 0) parts.push(`${c.questions} question${c.questions === 1 ? '' : 's'}`);
  return parts.length === 0 ? 'Nothing asked yet' : parts.join(' · ');
}

/** The lettering down the side of a multiple choice — A, B, C … Z, then AA. */
export function optionLetter(i: number): string {
  let n = i;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/**
 * A blank question of a given kind.
 *
 * The defaults are the two the editor cannot leave unset without drawing a
 * broken control: a `rating` arrives on 10 (the middle scale, and the one every
 * seeded question uses), and a `choice` arrives with TWO empty options rather
 * than none — a multiple choice with one option is not a choice, and one with
 * none is a question nobody can answer.
 */
export function blankQuestion(id: string, kind: AnswerKind = 'rating'): QuestionWire {
  return {
    id,
    text: '',
    kind,
    scale: kind === 'rating' ? 10 : null,
    options: kind === 'choice' ? blankOptions(id) : [],
    /* Both off. A closed list and one tick is the shape that can be charted
       against the same question eight weeks from now; each flag is a decision
       to loosen that, and a default nobody chose is not a decision. */
    allowMultiple: false,
    allowCustom: false,
  };
}

/** The pair a Multiple choice cannot be drawn without. See `blankQuestion`. */
function blankOptions(id: string) {
  return [
    { id: `${id}_a`, text: '' },
    { id: `${id}_b`, text: '' },
  ];
}

/**
 * The same clamp the server applies, run in the browser so a kind change does
 * not have to round-trip to draw the right control.
 *
 * It is deliberately NOT destructive about the other kind's data: switching a
 * rating to a choice and back must not lose the scale, and switching a choice
 * to a rating and back must not lose four options somebody typed. The server
 * drops what the kind does not use at save; until then the draft remembers.
 */
export function forKind(q: QuestionWire, kind: AnswerKind): QuestionWire {
  return {
    ...q,
    kind,
    scale: kind === 'rating' ? (q.scale ?? 10) : q.scale,
    options: kind === 'choice' && q.options.length < 2 ? blankOptions(q.id) : q.options,
    /* The two flags ride along untouched, which is the same call as the scale
       and the options: switching a choice to a rating and back must not lose
       *allow several answers* any more than it loses the four options it was
       set on. The SERVER forces them false off a choice at save — see
       `readQuestions` — so the draft may remember what the stored row may not. */
  };
}

/** Move `from` to `to` in a copy. Out-of-range indices are a no-op. */
export function moved<T>(rows: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return rows;
  const next = rows.slice();
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  return next;
}
