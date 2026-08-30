'use client';

import Link from 'next/link';
import { useState } from 'react';

/* The auth folder holds the glyph set for this whole document — `webapp-auth.html`
   is one file covering sign-in (§04–§08) and setup (§09–§11), so the icons are
   in one place rather than copied into a second. */
import { BrandMark, IconCheck, IconChevronDown } from '@/components/auth/Icons';
import { RAIL_FOOT } from '@/lib/setup/copy';
import {
  CERTIFICATIONS,
  EXPERIENCE_BANDS,
  LANGUAGES,
  SPECIALITIES,
  labelFor,
  labelList,
} from '@/lib/setup/options';
import {
  SETUP_STEPS,
  STEP_HINTS,
  STEP_LABELS,
  isAnswered,
  isOptional,
  isSettled,
  settledCount,
  stepHref,
  type SetupState,
  type SetupStep,
} from '@/lib/setup/steps';

/**
 * The rail — frames 4a, 4b, 5a–5e — and the bar it becomes on a phone.
 *
 * **It carries the answers, which is what makes it a record rather than a
 * progress bar.** A done row shows what was said, the current row is lit, the
 * rest recede. And because the rail is already the progress indicator there is
 * **no bar as well** — two progress systems for one flow is the mistake the
 * mobile design names by name, and the reason the phone's resume screen drops
 * its step bar too.
 *
 * Every row is a `Link`, because every step is its own URL. That is not a
 * convenience: a rail row that changed state in place rather than navigating
 * would break the back button on a flow whose whole claim is that a refresh
 * mid-flow lands where it left off.
 *
 * ## Under 900px it is a bar, and it is still one indicator
 *
 * `.stp` is a 332px track beside the form, which on a 390px phone leaves 58px
 * for the form. The rail cannot be the half that disappears — `SetupShell`'s
 * comment says why — so it re-shapes: the count, the step's name and a meter
 * across the top, with the eight-row record one tap behind a disclosure.
 *
 * **The meter is not the second progress system §10 forbids.** That rule is
 * about two of them being visible at once, and here exactly one ever is: the bar
 * on a phone, the rows on a desk. The record is still the record — it is one tap
 * away rather than gone, because "what did I already answer" is a question a
 * trainer asks occasionally and "which step is this" is one they ask constantly.
 *
 * A client component for that one piece of state. The toggle is overruled by CSS
 * above 900px rather than branched on in JSX, so there is one rail rather than a
 * desktop one and a mobile one that can disagree about what a done row says.
 */
export function Rail({ current, state }: { current: SetupStep | null; state: SetupState }) {
  const [open, setOpen] = useState(false);
  const index = current ? SETUP_STEPS.indexOf(current) : -1;
  const done = settledCount(state);
  const percent = Math.round((done / SETUP_STEPS.length) * 100);

  return (
    <div className="stp__l">
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span className="rail__mark" style={{ width: 30, height: 30 }}>
          <BrandMark />
        </span>
        <span
          style={{
            fontFamily: 'var(--tx-brand)',
            fontWeight: 800,
            fontSize: 16,
            letterSpacing: '-.02em',
          }}
        >
          X&nbsp;REP
        </span>
      </div>

      {/* The bar. In the markup at every width and shown only under 900px — see
          the class comment. */}
      <div className="stp__mob">
        <div className="stp__mobrow">
          <span className="micro">
            {current ? `STEP ${index + 1} OF ${SETUP_STEPS.length}` : 'SETTING UP'}
          </span>
          <button
            className="btn btn--sm btn--ghost"
            type="button"
            aria-expanded={open}
            aria-controls="stp-record"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Hide steps' : 'All steps'}
            <IconChevronDown size={13} />
          </button>
        </div>
        <p className="stp__mobt">
          {current ? (
            <>
              {STEP_LABELS[current]} <span>· {STEP_HINTS[current]}</span>
            </>
          ) : (
            <>
              8 questions <span>· about a minute</span>
            </>
          )}
        </p>
        <div
          className="meter"
          style={{ marginTop: 8 }}
          role="progressbar"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={SETUP_STEPS.length}
          aria-label={`${done} of ${SETUP_STEPS.length} steps settled`}
        >
          <i style={{ width: `${percent}%` }} />
        </div>
      </div>

      {/* The record: the rail on a desk, a disclosure panel on a phone. */}
      <div className="stp__rec" id="stp-record" data-open={open}>
        <p className="micro stp__cnt" style={{ margin: '26px 0 10px' }}>
          SETTING UP · STEP {index >= 0 ? index + 1 : 1} OF {SETUP_STEPS.length}
        </p>

        <nav className="wiz" aria-label="Setup steps">
          {SETUP_STEPS.map((step, i) => (
            <RailRow
              key={step}
              step={step}
              number={i + 1}
              current={step === current}
              state={state}
              onNavigate={() => setOpen(false)}
            />
          ))}
        </nav>

        <p className="small" style={{ marginTop: 'auto', paddingTop: 20 }}>
          {RAIL_FOOT}
        </p>
      </div>
    </div>
  );
}

function RailRow({
  step,
  number,
  current,
  state,
  onNavigate,
}: {
  step: SetupStep;
  number: number;
  current: boolean;
  state: SetupState;
  onNavigate: () => void;
}) {
  const settled = isSettled(step, state);
  // `--now` wins over `--done`: a trainer who navigated back to a step they
  // already answered is on that step, and two lit rows would say otherwise.
  const mod = current ? ' wiz__i--now' : settled ? ' wiz__i--done' : '';
  const answer = settled && !current ? answerFor(step, state) : null;

  return (
    <Link
      className={`wiz__i${mod}`}
      href={stepHref(step)}
      aria-current={current ? 'step' : undefined}
      /* The panel closes on the way out. On a phone the record is an overlay on
         the step you are leaving, and leaving it open would put the next step's
         headline under a list of the last one's answers. */
      onClick={onNavigate}
    >
      <span className="wiz__n">
        {settled && !current ? <IconCheck size={12} /> : number}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="wiz__t">{STEP_LABELS[step]}</span>
        {answer ? (
          <span className="wiz__a">{answer}</span>
        ) : (
          <span className="wiz__s">{STEP_HINTS[step]}</span>
        )}
      </span>
      {/* Marked optional BEFORE the step is reached, not on arrival. The
          most-named onboarding complaint in the teardown was surprise. */}
      {isOptional(step) ? <span className="wiz__opt">optional</span> : null}
    </Link>
  );
}

/**
 * What a settled row shows.
 *
 * "Skipped" is its own answer and reads as one — a row that showed nothing would
 * be indistinguishable from a step not yet reached, and the trainer would not
 * know whether the flow still wanted it.
 */
function answerFor(step: SetupStep, state: SetupState): string {
  if (!isAnswered(step, state)) return 'Skipped';

  switch (step) {
    case 'name':
      return state.name;
    case 'experience':
      return state.experience ? labelFor(state.experience, EXPERIENCE_BANDS) : '';
    case 'specialities':
      return labelList(state.specialities, SPECIALITIES);
    case 'certifications':
      return labelList(state.certifications, CERTIFICATIONS, 2);
    case 'languages':
      return labelList(state.languages, LANGUAGES);
    case 'hours':
      return `${state.hoursCount} window${state.hoursCount === 1 ? '' : 's'}`;
    case 'packs':
      return `${state.packCount} pack${state.packCount === 1 ? '' : 's'}`;
    case 'payment':
      return state.upiId;
  }
}
