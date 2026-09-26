'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';

import {
  buildSteps,
  checkInShape,
  dueClause,
  isAnswered,
  openAt,
  progressOf,
  type CheckInDetailWire,
  type Step,
} from '@/lib/portal/checkin';
import {
  clearCheckInAnswer,
  saveCheckInAnswer,
  submitCheckIn,
  type CheckInAnswerInput,
} from '@/lib/portal/actions';
import { dayLong } from '@/lib/today/time';
import { Button } from '@/web-components/ui/Button';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { Markup } from '@/web-components/ui/Markup';
import { Message } from '@/web-components/ui/Message';
import { Meter } from '@/web-components/ui/Meter';
import { Modal, ModalHost } from '@/web-components/ui/Modal';
import { Tag } from '@/web-components/ui/Tag';

import { Ask, AskHint, BLANK, OTHER_ID, type Draft } from './Ask';
import { Review } from './Review';

/**
 * §"assessments" · THE CHECK-IN, ONE ASK AT A TIME.
 *
 * ── FOUR STAGES, AND ONLY TWO OF THE BOUNDARIES ARE LOCAL ───────────────────
 *
 * | stage | when |
 * | --- | --- |
 * | `intro` | nothing answered yet and *Start* not pressed |
 * | `run` | the asks, one per screen |
 * | `review` | every ask and what was said, before it goes |
 * | `done` | `completedAt !== null` |
 *
 * `done` is the SERVER's, exactly as `Flow.tsx`'s is one screen over: a
 * check-in that has come back is closed for good, on every device, and the two
 * write routes refuse it rather than trusting this screen to stop asking.
 * `intro` stands itself down the moment anything is answered, so a client who
 * did four tapes on Tuesday is not asked to read the preamble again on
 * Thursday — which is also why `openAt` exists.
 *
 * ── EVERY ANSWER IS SAVED AS IT IS GIVEN ────────────────────────────────────
 *
 * Not on the review and not on the send. A block check-in is twenty-six asks
 * and this is the screen in the product most likely to be put down halfway:
 * the tape is out, somebody knocks, the phone locks. The draft is local so
 * typing is instant; the commit is one request; and the screen redraws from
 * what the server sends back rather than from an optimistic splice, because a
 * tape reading must never appear to have saved when it has not.
 *
 * The cost is stated: a step costs a round trip. It is paid at exactly the
 * moment somebody has finished an answer and is looking away from the screen,
 * which is the cheapest moment there is.
 *
 * ── NOTHING HERE IS REQUIRED, AND NOTHING HERE NAGS ─────────────────────────
 *
 * *Next* is stood down until the step has an answer, and *Skip* is beside it at
 * the other end of the foot. That pair is the whole policy: the ask is put
 * properly, and a client with no tape measure can still finish the form. The
 * model has always allowed it — `mock/seed.ts` ships returned check-ins two
 * tapes short and says the count columns exist "to find the client who
 * answered the questions and skipped the tape" — and the review says plainly
 * what was left, once, without a tone on it.
 */
type Stage = 'intro' | 'run' | 'review';

/**
 * What is already stored for this ask, as the control's own draft.
 *
 * Read off the server's copy rather than kept in a parallel map: the flow
 * re-seeds the draft every time the step changes, so going back to step 3 shows
 * what step 3 actually holds — not what was typed into it before a save failed.
 */
function draftFor(step: Step, data: CheckInDetailWire): Draft {
  if (step.kind === 'measurement') {
    const r = data.readings.find((x) => x.key === step.id);
    return { ...BLANK, text: r ? String(r.value) : '' };
  }
  const a = data.answers.find((x) => x.questionId === step.id);
  if (!a) return BLANK;
  const q = step.question;
  if (q.kind === 'rating') return { ...BLANK, text: a.rating === null ? '' : String(a.rating) };
  if (q.kind === 'yesno') return { ...BLANK, ids: a.yes === null ? [] : [a.yes ? 'yes' : 'no'] };
  if (q.kind === 'text') return { ...BLANK, text: a.text ?? '' };
  return {
    text: '',
    ids: [...a.optionIds, ...(a.text ? [OTHER_ID] : [])],
    other: a.text ?? '',
  };
}

/** The draft as the wire takes it, or null where it is not an answer yet. */
function inputFor(step: Step, draft: Draft): CheckInAnswerInput | null {
  if (step.kind === 'measurement') {
    const value = Number(draft.text.trim().replace(',', '.'));
    if (draft.text.trim() === '' || !Number.isFinite(value)) return null;
    return { kind: 'measurement', key: step.id, value };
  }
  const q = step.question;
  if (q.kind === 'rating') {
    return draft.text === '' ? null : { kind: 'question', questionId: q.id, rating: Number(draft.text) };
  }
  if (q.kind === 'yesno') {
    if (draft.ids.length === 0) return null;
    return { kind: 'question', questionId: q.id, yes: draft.ids[0] === 'yes' };
  }
  if (q.kind === 'text') {
    return draft.text.trim() === '' ? null : { kind: 'question', questionId: q.id, text: draft.text.trim() };
  }
  const picked = draft.ids.filter((id) => id !== OTHER_ID);
  const other = draft.ids.includes(OTHER_ID) ? draft.other.trim() : '';
  if (picked.length === 0 && other === '') return null;
  return {
    kind: 'question',
    questionId: q.id,
    optionIds: picked,
    ...(other === '' ? {} : { text: other }),
  };
}

export function Flow({
  data: initial,
  trainerFirstName,
  now,
}: {
  data: CheckInDetailWire;
  trainerFirstName: string;
  /** The SERVER's instant, threaded down — `react-hooks/purity` refuses a read. */
  now: number;
}) {
  /* The server's copy of the check-in, replaced by whatever each write returns.
     There is no `router.refresh()` in this file and there does not need to be:
     every write answers with the whole row, so the screen is never drawing a
     guess about what was saved. */
  const [data, setData] = useState(initial);
  const steps = useMemo(() => buildSteps(data.asked), [data.asked]);

  const [stage, setStage] = useState<Stage>(() =>
    data.completedAt
      ? 'review'
      : steps.some((s) => isAnswered(s, initial))
        ? 'run'
        : 'intro',
  );
  const [at, setAt] = useState(() => openAt(steps, initial));
  const [draft, setDraft] = useState<Draft>(() =>
    steps[openAt(steps, initial)] ? draftFor(steps[openAt(steps, initial)], initial) : BLANK,
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const step = steps[at] ?? null;
  const progress = progressOf(steps, data);
  const last = at >= steps.length - 1;

  /** Move to a step and re-seed its draft from what the server holds. */
  const goTo = useCallback(
    (i: number, from: CheckInDetailWire) => {
      const next = Math.max(0, Math.min(steps.length - 1, i));
      setAt(next);
      setDraft(steps[next] ? draftFor(steps[next], from) : BLANK);
      setFailure(null);
    },
    [steps],
  );

  /**
   * Save this step and move on — or, on the last one, go to the review.
   *
   * `next` is passed in rather than read from state because the one-tap kinds
   * call this from inside their own `onChange`: the draft they are committing
   * is the one they just built, and the state holding it has not been applied
   * yet.
   */
  const commit = useCallback(
    (next: Draft) => {
      if (!step || busy) return;
      const input = inputFor(step, next);
      if (!input) return;
      setDraft(next);
      setBusy(true);
      setFailure(null);
      void (async () => {
        const res = await saveCheckInAnswer(data.id, input);
        setBusy(false);
        if (!res.ok) {
          setFailure(res.message);
          return;
        }
        setData(res.value);
        if (last) setStage('review');
        else goTo(at + 1, res.value);
      })();
    },
    [at, busy, data.id, goTo, last, step],
  );

  /**
   * Leave this one out.
   *
   * It CLEARS where something was already stored, which is the half that is
   * easy to miss: a client who typed 88, thought better of it and skipped would
   * otherwise have sent their trainer a number they had withdrawn. Where
   * nothing is stored it costs no request at all.
   */
  const skip = useCallback(() => {
    if (!step || busy) return;
    const stored = isAnswered(step, data);
    if (!stored) {
      if (last) setStage('review');
      else goTo(at + 1, data);
      return;
    }
    setBusy(true);
    setFailure(null);
    void (async () => {
      const res = await clearCheckInAnswer(
        data.id,
        step.kind === 'measurement'
          ? { kind: 'measurement', key: step.id }
          : { kind: 'question', questionId: step.id },
      );
      setBusy(false);
      if (!res.ok) {
        setFailure(res.message);
        return;
      }
      setData(res.value);
      if (last) setStage('review');
      else goTo(at + 1, res.value);
    })();
  }, [at, busy, data, goTo, last, step]);

  const send = useCallback(() => {
    setBusy(true);
    setFailure(null);
    void (async () => {
      const res = await submitCheckIn(data.id);
      setBusy(false);
      setConfirm(false);
      if (!res.ok) {
        setFailure(res.message);
        return;
      }
      setData(res.value);
    })();
  }, [data.id]);

  /* ── done · the server's state, and the end of the road ─────────────────── */
  if (data.completedAt) {
    return (
      <div className="pchk col gap4">
        <Card level={2}>
          <CardHead title="That is with your trainer">
            <Tag tone="ok">Sent</Tag>
          </CardHead>
          <CardBody>
            <p className="small">
              {/* No congratulation and no figure out of twenty-six. §1's rule
                  is the product's: a short answer is still an answer, and a
                  screen that scores somebody for filling in a form is a screen
                  they fill in less honestly next time. */}
              {trainerFirstName} will read this before your next session. Nothing
              else to do.
            </p>
            <p className="small mt3 ink3">Sent {dayLong(Date.parse(data.completedAt))}.</p>
          </CardBody>
          <CardBody divided>
            {/* Not *Back to home*, which is what this said while the only way
                in was Home's card. Progress → Assessments is where this one is
                now a row, and it is the screen somebody reading a RECORD wants
                next — the other five they have sent, and the tape those sittings
                produced. Home is a tap away on the bar either way, which is what
                makes this the one that is worth the button. */}
            <Button variant="primary" href="/me/progress/assessments">
              See your check-ins
            </Button>
          </CardBody>
        </Card>

        {/* What went, read back. A record somebody can check, on the one screen
            where they have just answered twenty-six questions about their own
            body and cannot change any of them again. */}
        <Card>
          <CardHead title="What you sent" />
          <CardBody>
            <Review data={data} steps={steps} />
          </CardBody>
        </Card>
      </div>
    );
  }

  /* ── intro · what this is and how long it takes ─────────────────────────── */
  if (stage === 'intro') {
    return (
      <div className="pchk col gap4">
        <Card level={2}>
          <CardHead title={data.name}>
            <span className="small ink3">from {trainerFirstName}</span>
          </CardHead>
          {data.description && (
            <CardBody>
              {/* The trainer's own words, in the format the editor writes —
                  `c-markup` is the only reader of it, and printing the string
                  bare would show a client the asterisks. */}
              <Markup value={data.description} />
            </CardBody>
          )}
          <CardBody divided={Boolean(data.description)}>
            <p className="h4" style={{ fontSize: 17 }}>{checkInShape(data.asked)}</p>
            <p className="small mt2">
              {/* Stated as an estimate, for the workout flow's reason: a client
                  told ten minutes who takes twenty has been misled by a number
                  nobody needed. Twenty seconds an ask is measured off the
                  slowest of them — a tape reading, where the tape has to go
                  round something first. */}
              About {Math.max(3, Math.round((steps.length * 20) / 60))} minutes. You
              can stop partway and come back — every answer saves as you give it.
            </p>
            <p className="small mt2 ink3">
              {/* The date, in the tense it is actually in. `dueClause` carries
                  why a date that has gone is said as *was due* and never as
                  overdue — the trainer's list says *Missed* because a trainer
                  is deciding whether to chase somebody; this is read by the
                  person who has not done it. */}
              {dueClause(data.dueAt, now)}
              {data.status === 'late' ? ' — still open, take your time.' : '.'}
            </p>
          </CardBody>
          <CardBody divided>
            <Button variant="primary" wide onClick={() => setStage('run')}>
              Start
            </Button>
          </CardBody>
        </Card>

        {steps.length === 0 && (
          <Card>
            <CardBody>
              <Message tone="warn">
                There is nothing in this check-in to fill in. Have a word with{' '}
                {trainerFirstName}.
              </Message>
            </CardBody>
          </Card>
        )}
      </div>
    );
  }

  /* ── review · everything, before it goes ────────────────────────────────── */
  if (stage === 'review') {
    return (
      <div className="pchk col gap4">
        <div className="col gap2">
          <p className="h5">Before you send it</p>
          <p className="small">
            {progress.left === 0
              ? 'All of them answered. Tap anything to change it.'
              : `${progress.done} of ${progress.total} answered. Tap anything to change it — what you leave out is left out.`}
          </p>
        </div>

        <Card>
          <CardBody>
            <Review
              data={data}
              steps={steps}
              onEdit={(i) => {
                setStage('run');
                goTo(i, data);
              }}
            />
          </CardBody>
        </Card>

        {failure && <Message tone="err">{failure}</Message>}

        <div className="pchk__ft">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setStage('run');
              goTo(steps.length - 1, data);
            }}
          >
            Back
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => setConfirm(true)}>
            Send to {trainerFirstName}
          </Button>
        </div>

        {confirm && (
          <ModalHost onClose={() => setConfirm(false)}>
            <Modal
              title="Send this check-in?"
              width={460}
              cancel={{ label: 'Not yet', onClick: () => setConfirm(false) }}
              confirm={{ label: 'Send', onClick: send }}
            >
              <p className="small">
                {trainerFirstName} will be able to read it, and you will not be
                able to change it afterwards.
              </p>
              {progress.left > 0 && (
                <p className="small mt3 ink3">
                  {/* Not a warning tone and not a reproach — the same call the
                      workout flow's *finish early* makes. Leaving four tapes
                      out is a legitimate answer to not owning a tape. */}
                  {progress.left} of them {progress.left === 1 ? 'is' : 'are'} not
                  answered. That is fine — they will show as not given.
                </p>
              )}
            </Modal>
          </ModalHost>
        )}
      </div>
    );
  }

  /* ── run · one ask ──────────────────────────────────────────────────────── */
  if (!step) return null;

  const answerable = inputFor(step, draft) !== null;
  const prompt = step.kind === 'measurement' ? step.measurement.label : step.question.text;

  return (
    <div className="pchk col gap4">
      <div className="col gap2">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <p className="h5 pchk__n">
            {at + 1} of {steps.length}
          </p>
          {/* The block, named, so a client knows when the tape can go away. */}
          <p className="small ink3">
            {step.kind === 'measurement' ? 'Measurements' : 'Questions'}
          </p>
        </div>
        <Meter
          size="lg"
          label="Answers given in this check-in"
          total={steps.length}
          segments={[{ tone: 'ok', value: progress.done, label: 'answered' }]}
        />
      </div>

      <Card level={2}>
        <CardBody>
          {/* The prompt is a heading and not a `<label>`: three of the five
              controls under it are a GROUP rather than a field, and a group's
              name is `aria-label` on the group — which `ChoiceList` and `Scale`
              are both given, from this same string. */}
          <h2 className="pchk__q">{prompt}</h2>
          <AskHint step={step} />
          <div className="mt4">
            <Ask
              step={step}
              draft={draft}
              onDraft={setDraft}
              onCommit={commit}
              busy={busy}
            />
          </div>
        </CardBody>
      </Card>

      {failure && <Message tone="err">{failure}</Message>}

      <div className="pchk__ft">
        <Button
          variant="secondary"
          disabled={at === 0 || busy}
          onClick={() => goTo(at - 1, data)}
        >
          Back
        </Button>
        {/* STOOD DOWN UNTIL THERE IS AN ANSWER, which is the half of the policy
            that makes *Skip* mean something: a live *Next* on an empty step is
            a skip nobody chose, and it is the one somebody presses by
            accident. */}
        <Button variant="primary" disabled={!answerable || busy} onClick={() => commit(draft)}>
          {last ? 'Review' : 'Next'}
        </Button>
        <span className="sp" />
        <Button variant="ghost" disabled={busy} onClick={skip}>
          Skip this one
        </Button>
      </div>

      <p className="small ink3">
        <Link href="/me/today">Stop for now</Link> — everything you have answered
        is saved.
      </p>
    </div>
  );
}
