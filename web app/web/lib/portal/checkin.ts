import type { MeasurementWire, QuestionWire } from '@/lib/assessments/vocab';
import { daysBetween, dayStamp } from '@/lib/today/time';

/**
 * THE CHECK-IN, AS THE CLIENT ANSWERS IT — the wire, the words, and the one
 * derivation both halves of the flow read.
 *
 * No `server-only` here, and that is trap 18 rather than an omission: the flow
 * is a client component and every type and function below is read inside it.
 * `lib/portal/range.ts` and `lib/assessments/vocab.ts` are the same arrangement
 * — and `vocab.ts` is where `QuestionWire` and `MeasurementWire` come from,
 * because a second declaration of the trainer's question is a second thing to
 * keep in step with the catalogue.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ONE ASK PER STEP, MEASUREMENTS FIRST, AND THAT IS THE WHOLE MODEL
 *
 * A template carries two blocks and the flow does not: it carries a flat list
 * of ASKS, in the order the check-in asks them. Fifteen tapes and eleven
 * questions is twenty-six steps and no second interaction to learn halfway
 * through — which is the decision `Flow.tsx` makes one screen over for six
 * movements, and it is stronger here. A client taking their own measurements
 * has a tape in one hand; a grid of fifteen fields asks them to find their
 * place in a list every time they look up, where one ask on a screen cannot be
 * lost. The protocol is the whole point of the closed catalogue — *Waist, at
 * the navel* — and on its own step it is a sentence rather than a label.
 *
 * Measurements come first because they are the part with a physical object in
 * it. Somebody who has got the tape out finishes with it and then sits down to
 * the questions; the other order asks them to fetch it eleven questions in.
 */

/* ────────────────────────────────────────────────────────────── the wire ── */

/** The client's three states — `mock/portal.ts` carries why they are not four. */
export type CheckInStatus = 'open' | 'late' | 'done';

/** One check-in as a row in the client's own list. */
export interface CheckInWire {
  id: string;
  name: string;
  dueAt: string;
  sentAt: string | null;
  completedAt: string | null;
  status: CheckInStatus;
  measurements: { got: number; asked: number };
  questions: { got: number; asked: number };
}

/** One tape reading, as stored. */
export interface ReadingWire {
  key: string;
  value: number;
}

/** One answer, as stored. Four kinds, four fields — `mock/types.ts` says why. */
export interface AnswerWire {
  questionId: string;
  yes: boolean | null;
  rating: number | null;
  text: string | null;
  optionIds: string[];
}

/** The whole check-in: what it asks, and whatever is in it so far. */
export interface CheckInDetailWire extends CheckInWire {
  description: string | null;
  asked: { measurements: MeasurementWire[]; questions: QuestionWire[] };
  readings: ReadingWire[];
  answers: AnswerWire[];
}

/* ───────────────────────────────────────────────────────────── the steps ── */

/**
 * One ask, ready to be drawn.
 *
 * A discriminated union rather than an object with two nullable halves: the
 * step IS one or the other, and a reader that has checked `kind` knows exactly
 * which fields it has. The same call `AssessmentAnswerRow`'s four columns make.
 */
export type Step =
  | { kind: 'measurement'; id: string; measurement: MeasurementWire }
  | { kind: 'question'; id: string; question: QuestionWire };

/**
 * The flat list of asks, in the order they are put.
 *
 * `id` is the catalogue key or the question id, which is what every save is
 * addressed to — so nothing downstream has to know an index, and a step list
 * rebuilt after a save cannot re-point an answer at a different ask.
 */
export function buildSteps(asked: CheckInDetailWire['asked']): Step[] {
  return [
    ...asked.measurements.map(
      (m): Step => ({ kind: 'measurement', id: m.key, measurement: m }),
    ),
    ...asked.questions.map((q): Step => ({ kind: 'question', id: q.id, question: q })),
  ];
}

/** Whether this ask has something in it — a reading, or an answer of its kind. */
export function isAnswered(step: Step, data: CheckInDetailWire): boolean {
  if (step.kind === 'measurement') {
    return data.readings.some((r) => r.key === step.id);
  }
  return data.answers.some((a) => a.questionId === step.id);
}

/** How far through: answered, and the total asked. */
export function progressOf(steps: Step[], data: CheckInDetailWire) {
  const done = steps.filter((s) => isAnswered(s, data)).length;
  return { done, total: steps.length, left: steps.length - done };
}

/**
 * WHERE TO OPEN, on a check-in somebody has already started.
 *
 * The first UNANSWERED step, and step 0 only when nothing has been answered —
 * `Flow.tsx`'s own rule for resuming a workout: index 0 is where somebody
 * stopped exactly once, on the first set of the day. A fully answered check-in
 * that has not been sent opens on the LAST step, because the only thing left to
 * do with it is read it back and send it.
 */
export function openAt(steps: Step[], data: CheckInDetailWire): number {
  const i = steps.findIndex((s) => !isAnswered(s, data));
  return i === -1 ? Math.max(0, steps.length - 1) : i;
}

/* ───────────────────────────────────────────────────────────── the words ── */

/**
 * The client's three states, said as facts about them rather than about the
 * trainer waiting. `STATUS_LABEL` in `lib/assessments/vocab.ts` is the other
 * half of the same table, written for the person who sent it.
 *
 * *Late* and never *Overdue* or *Missed*: a check-in is not a debt, and the
 * person reading this word is the one who has not done it. The trainer's list
 * says *Missed* because a trainer deciding whether to chase somebody needs to
 * know the answer did not come; telling the client the same thing in the same
 * word is the shaming §1 refuses outright.
 */
export const CHECKIN_LABEL: Record<CheckInStatus, string> = {
  open: 'To fill in',
  late: 'Still open',
  done: 'Sent',
};

/** `Tag`'s tones, and `late` is deliberately not a warning — see above. */
export const CHECKIN_TONE: Record<CheckInStatus, 'neutral' | 'ok' | 'acc'> = {
  open: 'acc',
  late: 'neutral',
  done: 'ok',
};

/**
 * *15 measurements and 11 questions*, or whichever half there is.
 *
 * Written out rather than `15 · 11`, because this sentence is read once, before
 * the first step, by somebody deciding whether they have twenty minutes. A
 * check-in with neither block is not drawn at all — `mock/portal.ts` drops it
 * from the list rather than offering an empty form.
 */
export function checkInShape(asked: CheckInDetailWire['asked']): string {
  const parts: string[] = [];
  const m = asked.measurements.length;
  const q = asked.questions.length;
  if (m > 0) parts.push(`${m} measurement${m === 1 ? '' : 's'}`);
  if (q > 0) parts.push(`${q} question${q === 1 ? '' : 's'}`);
  return parts.join(' and ');
}

/**
 * What a client is asked to do with a `choice` whose answers are sentences.
 *
 * The prompt is the question's own text, so this is only the second line — and
 * it exists for one case: a question that takes several answers has to say so
 * before somebody taps one and moves on. A single-answer choice says nothing,
 * because one tap and the flow advances, which is the answer.
 */
export function choiceHint(q: QuestionWire): string | null {
  return q.allowMultiple ? 'Pick as many as apply.' : null;
}

/**
 * *Due today* · *Due tomorrow* · *Due Fri · 3 Oct* · *Was due Tue · 30 Sep*.
 *
 * ── THE PAST TENSE IS THE WHOLE POINT OF THIS FUNCTION ──────────────────────
 *
 * A date that has gone still has to be said, or a client cannot tell a
 * check-in that is due next week from one that was due on Tuesday — and the
 * two mean different things about whether to get the tape out tonight. What it
 * must not do is turn that into a demand. *Was due* is a fact; *overdue* is a
 * debt, and the trainer's own list says *Missed* precisely because it is read
 * by the person deciding whether to chase somebody. This one is read by the
 * person who has not done it.
 *
 * Both clocks are the SERVER's — `now` is threaded down from the guard, for the
 * reason `react-hooks/purity` refuses a `Date.now()` during render and the
 * larger one that a browser's clock disagrees with the HTML it was handed.
 */
export function dueClause(dueAt: string, now: number): string {
  const at = Date.parse(dueAt);
  if (!Number.isFinite(at)) return '';
  const days = daysBetween(now, at);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days > 1) return `Due ${dayStamp(at)}`;
  if (days === -1) return 'Was due yesterday';
  return `Was due ${dayStamp(at)}`;
}
