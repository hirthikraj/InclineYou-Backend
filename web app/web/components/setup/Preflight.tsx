'use client';

import Link from 'next/link';

import { MessageSlot } from '@/components/auth/MessageSlot';
import { IconLock } from '@/components/auth/Icons';
import { finishSetup } from '@/lib/setup/actions';
import {
  PREFLIGHT_TRUST_LEAD,
  PREFLIGHT_TRUST_REST,
  RESUME_TRUST_LEAD,
  RESUME_TRUST_REST,
} from '@/lib/setup/copy';
import {
  hasProgress,
  nextStep,
  secondsLeft,
  settledCount,
  stepHref,
  type SetupState,
} from '@/lib/setup/steps';
import { StepHead } from './SetupShell';
import { useStepAction } from './useStepAction';

/**
 * Frames 4a and 4b · `/setup` — the pre-flight, and coming back to a
 * part-finished flow.
 *
 * **A pre-flight screen costs one click and prevents the worst review you will
 * get.** The evidence is a quote from a competitor's trainer: *"I wasn't made
 * aware of all the things they would require from me before they could launch my
 * platform."* The most-named onboarding complaint across every platform in the
 * teardown was not form length — it was SURPRISE.
 *
 * **There is no greeting, and its absence is deliberate.** All the code has
 * given us is a phone number; we learn the name on the very next screen. A
 * screen that said *Welcome!* here would be greeting nobody.
 */
export function Preflight({ state }: { state: SetupState }) {
  const { run, pending, message } = useStepAction();
  const resuming = hasProgress(state);
  const owed = nextStep(state);

  return (
    <>
      {resuming ? <ResumeBody state={state} /> : <FirstRunBody />}

      <MessageSlot message={message} />

      <div className="stp__ft">
        {resuming ? (
          /* "Finish the rest later" IS finishing setup — the remainder moves to
             the completion meter. So it stamps the profile complete rather than
             just navigating away; without the stamp the server would ask for
             setup again on every fresh sign-in, which is the one thing this flow
             must not do to somebody who has already given it their name. */
          <button
            className="btn btn--ghost"
            type="button"
            disabled={pending}
            onClick={() => run(() => finishSetup('/setup/done'))}
          >
            Finish the rest later
          </button>
        ) : null}
        <span className="sp" />
        {owed ? (
          <Link className="btn btn--primary btn--lg" href={stepHref(owed)}>
            {resuming ? 'Continue setup' : 'Start'}
          </Link>
        ) : (
          /* Nothing left to ask means every step was answered or skipped, and
             this is the last thing standing between that and a finished
             profile. It has to WRITE — a link straight to /setup/done would
             show the meter over a profile the server still considers
             mid-setup, and the next sign-in would ask for setup again. */
          <button
            className="btn btn--primary btn--lg"
            type="button"
            disabled={pending}
            onClick={() => run(() => finishSetup('/setup/done'))}
          >
            {pending ? 'Saving…' : 'Finish setup'}
          </button>
        )}
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────── 4a ─────── */

/**
 * Five lines, not eight.
 *
 * The eight steps are on the rail; the body groups them into the five things a
 * trainer would recognise as questions, with the optional ones marked optional
 * in the same breath.
 */
const WHAT_WE_ASK: { title: string; body: string }[] = [
  {
    title: 'Your name',
    body: 'Clients see this on every invite and receipt you send',
  },
  {
    title: 'Experience, specialities and certifications',
    body: 'Optional — and “not certified yet” is a real answer',
  },
  {
    title: 'Languages you coach in',
    body: 'Clients filter by this. Nobody else asks it',
  },
  {
    title: 'When you work and what you sell',
    body: 'The week the diary reads, and the prices the money book groups by',
  },
  {
    title: 'How you get paid',
    body: 'Your UPI ID. You can do this later',
  },
];

function FirstRunBody() {
  return (
    <>
      <StepHead
        title="Let’s set up your account"
        sub="8 questions. Mostly clicking — you type twice. About a minute."
      />

      <div style={{ marginTop: 20, maxWidth: '64ch' }}>
        {WHAT_WE_ASK.map((row) => (
          /* `.h5` and `.small` — §17 ships both at exactly these values, and
             the row was declaring 13.5/ink and 12.5/ink-3 inline instead. Not
             `.lrow`, which is the app's two-line list row: its `__t` and `__s`
             ellipsise on one line, and every subtitle here is a sentence that
             has to wrap. */
          <div key={row.title} className="kv" style={{ alignItems: 'flex-start', padding: '11px 0' }}>
            <span style={{ flex: 1 }}>
              <b className="h5" style={{ display: 'block' }}>
                {row.title}
              </b>
              <span className="small" style={{ display: 'block', marginTop: 3 }}>
                {row.body}
              </span>
            </span>
          </div>
        ))}
      </div>

      {/* Stated BEFORE anything is asked rather than after — which is the
          frame's rule. What it states is different from the frame's: this half
          is online-only, so the promise is that each answer is already saved,
          not that none of them needed a connection. See lib/setup/copy.ts. */}
      <div className="trust" style={{ marginTop: 22 }}>
        <IconLock size={15} />
        <span>
          <b>{PREFLIGHT_TRUST_LEAD}</b> {PREFLIGHT_TRUST_REST}
        </span>
      </div>

    </>
  );
}

/* ─────────────────────────────────────────────────────────────── 4b ─────── */

function ResumeBody({ state }: { state: SetupState }) {
  const done = settledCount(state);

  return (
    <>
      <StepHead
        title="Nearly there"
        sub={
          <>
            {done === 1 ? 'One step' : `${done} steps`} done, nothing lost. About{' '}
            {secondsLeft(state)} seconds left.
          </>
        }
      />

      {/* NOT "the rail on the left". Under 900px it is a bar across the top and
          the record is behind *All steps*, so a sentence that names a side is
          wrong on a phone — and this is the screen whose whole job is telling a
          trainer where their answers went. It names the thing, not its edge. */}
      <p className="stp__sub" style={{ marginTop: 18, maxWidth: '62ch' }}>
        The steps list is the record: what you answered, where you stopped, and what is still
        optional.
      </p>

      {/* The frame says the answers live in this browser until the flow
          finishes, and that clearing site data loses them. Neither is true
          here, and the truth is the better promise — see lib/setup/copy.ts. */}
      <div className="trust" style={{ marginTop: 22 }}>
        <IconLock size={15} />
        <span>
          <b>{RESUME_TRUST_LEAD}</b> {RESUME_TRUST_REST}
        </span>
      </div>
    </>
  );
}
