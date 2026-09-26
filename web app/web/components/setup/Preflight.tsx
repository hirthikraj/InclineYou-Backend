'use client';


import { MessageSlot } from '@/components/auth/MessageSlot';
import { TrustLine } from '@/components/auth/TrustLine';
import { finishSetup } from '@/lib/setup/actions';
import {
  PREFLIGHT_TRUST_LEAD,
  PREFLIGHT_TRUST_REST,
  RESUME_TRUST_LEAD,
  RESUME_TRUST_REST,
} from '@/lib/setup/copy';
import {
  SETUP_STEPS,
  hasProgress,
  isRequired,
  nextStep,
  secondsLeft,
  settledCount,
  stepHref,
  type SetupState,
  type SetupStep,
} from '@/lib/setup/steps';
import { GroupLabel, StepHead } from './SetupShell';
import { useStepAction } from './useStepAction';
import { Brief, type BriefItem } from '@/web-components/ui/Brief';
import { Button } from '@/web-components/ui/Button';
import { Tag } from '@/web-components/ui/Tag';

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
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => finishSetup('/setup/done'))}
          >
            Finish the rest later
          </Button>
        ) : null}
        <span className="sp" />
        {owed ? (
          <Button href={stepHref(owed)} variant="primary" size="lg">
            {resuming ? 'Continue setup' : 'Start'}
          </Button>
        ) : (
          /* Nothing left to ask means every step was answered or skipped, and
             this is the last thing standing between that and a finished
             profile. It has to WRITE — a link straight to /setup/done would
             show the meter over a profile the server still considers
             mid-setup, and the next sign-in would ask for setup again. */
          <Button
            variant="primary"
            size="lg"
            disabled={pending}
            onClick={() => run(() => finishSetup('/setup/done'))}
          >
            {pending ? 'Saving…' : 'Finish setup'}
          </Button>
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
 * trainer would recognise as questions, with the one that cannot be skipped
 * marked as such in the same breath.
 *
 * ── EACH GROUP CARRIES ITS STEPS, RATHER THAN A HAND-TYPED RANGE ─────────────
 *
 * `Brief` draws `1`, `2–4`, `5`, `6–7`, `8` beside the five titles, and that
 * range is the only thing tying this body to the rail beside it. Typing the
 * strings would make them the one part of the screen that cannot notice a step
 * being added, removed or reordered — and a contents page that disagrees with
 * the rail two inches away is worse than no contents page, because the screen's
 * entire promise is that nothing is being hidden.
 *
 * The marker is derived for the same reason, and it marks the REQUIRED group
 * rather than the optional ones — the same switch `RailRow` makes and for the
 * same arithmetic. Four of the five groups are now entirely skippable, so
 * tagging those four would put an identical chip down four of five rows and
 * leave the one that matters as the only bare one. `some` rather than `every`
 * is what the tag needs to be honest: a group holding one required step among
 * optional ones is not a group you can skip, and today that is group one, which
 * holds nothing else.
 */
const WHAT_WE_ASK: { title: string; body: string; steps: SetupStep[] }[] = [
  {
    steps: ['name'],
    title: 'Your name and gender',
    body: 'Clients see your name on every invite you send, and filter on the other',
  },
  {
    steps: ['experience', 'specialities', 'certifications'],
    title: 'Experience, specialities and certifications',
    body: '“Not certified yet” is a real answer',
  },
  {
    steps: ['languages'],
    title: 'Languages you coach in',
    body: 'Clients filter by this. Nobody else asks it',
  },
  {
    steps: ['hours', 'packs'],
    title: 'When you work and what you sell',
    body: 'The week the diary reads, and the prices the money book groups by',
  },
  {
    steps: ['payment'],
    title: 'How you get paid',
    body: 'Your UPI ID. You can do this later',
  },
];

/** `1` for one step, `2–4` for a run of them. An en dash: it is a range. */
function countFor(steps: SetupStep[]): string {
  const numbers = steps.map((s) => SETUP_STEPS.indexOf(s) + 1);
  const first = Math.min(...numbers);
  const last = Math.max(...numbers);
  return first === last ? `${first}` : `${first}–${last}`;
}

const BRIEF: BriefItem[] = WHAT_WE_ASK.map((row) => ({
  count: countFor(row.steps),
  title: row.title,
  body: row.body,
  right: row.steps.some(isRequired) ? <Tag>Required</Tag> : undefined,
}));

function FirstRunBody() {
  return (
    <>
      <StepHead
        title="Let’s set up your account"
        sub="8 questions. Mostly clicking — you type twice. About a minute."
      />

      <GroupLabel top={26}>WHAT WE’LL ASK</GroupLabel>

      {/* `.stp__row` rather than the `maxWidth: '64ch'` this carried: 64ch is a
          ninth measure on a flow that already has one, and it put the list at
          565px with the trust line under it running to 1,004 on a 1440 window —
          two right edges on a screen whose five rows are the only thing to
          read. `--stp-measure` is the width every step after this one uses. */}
      <Brief items={BRIEF} label="What we’ll ask" className="stp__row" />

      {/* Stated BEFORE anything is asked rather than after — which is the
          frame's rule. What it states is different from the frame's: this half
          is online-only, so the promise is that each answer is already saved,
          not that none of them needed a connection. See lib/setup/copy.ts. */}
      <div className="stp__row" style={{ marginTop: 22 }}>
        <TrustLine>
          <b>{PREFLIGHT_TRUST_LEAD}</b> {PREFLIGHT_TRUST_REST}
        </TrustLine>
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
      {/* `.stp__row` rather than the 62ch this inlined — which is §10's cap on
          `.stp__sub` restated, and lands ~90px right of the trust line under
          it. Two right edges on a body that is two elements tall. */}
      <p className="stp__sub stp__row" style={{ marginTop: 18 }}>
        The steps list is the record: what you answered, where you stopped, and what is still
        optional.
      </p>

      {/* The frame says the answers live in this browser until the flow
          finishes, and that clearing site data loses them. Neither is true
          here, and the truth is the better promise — see lib/setup/copy.ts. */}
      <div className="stp__row" style={{ marginTop: 22 }}>
        <TrustLine>
          <b>{RESUME_TRUST_LEAD}</b> {RESUME_TRUST_REST}
        </TrustLine>
      </div>
    </>
  );
}
