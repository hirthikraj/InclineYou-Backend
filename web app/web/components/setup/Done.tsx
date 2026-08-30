import Link from 'next/link';

import { IconCheck, IconPlus } from '@/components/auth/Icons';
import { METER_WHY, meterItems, meterPercent } from '@/lib/setup/meter';
import type { SetupState } from '@/lib/setup/steps';

/**
 * Frame 6a · `/setup/done` — after setup.
 *
 * **No confetti.** Finishing a form is not an achievement — the celebration
 * belongs to the first booking and the first payment, where the trainer has
 * actually earned something, and spending it here devalues both. The app's own
 * `DoneScreen` says exactly that in its first four words.
 *
 * **The meter opens at 70%, not at zero.** Anybody reaching this screen has
 * finished the flow, so the name / experience / specialities block is already
 * banked: the meter starts at the work done rather than at the work owed.
 * Identical real effort, and the original endowed-progress study measured a
 * visible head start roughly doubling completion — 34% against 19%.
 *
 * **The items are weighted by what they are worth, not counted.** A UPI ID is 2×
 * a certification, because it is the difference between getting paid through the
 * app and not. And the three core answers are ONE row rather than three, because
 * three ticks for one sitting's work makes the meter feel like it is counting
 * keystrokes.
 *
 * A route rather than a state, deliberately, so it survives a refresh and can be
 * linked to from a support conversation.
 */
export function Done({ state }: { state: SetupState }) {
  const items = meterItems(state);
  const percent = meterPercent(items);
  // First name only. "You're set up, Ravi Kannan" reads like a form letter.
  const firstName = state.name.trim().split(/\s+/)[0] ?? '';

  return (
    <>
      {/* An `h1`, and no inline size — same two corrections as `StepHead`. */}
      <h1 className="stp__hd">
        {firstName ? `You’re set up, ${firstName}` : 'You’re set up'}
      </h1>
      <p className="stp__sub" style={{ marginTop: 8 }}>
        Your first client is the next thing worth doing.
      </p>

      <div className="card" style={{ marginTop: 22, maxWidth: 520 }}>
        {/* A real `.card__hd`. The title and the figure were a `.row` inside the
            body, which put them on the body's ground with no rule under them —
            one of three different card headings in this flow. */}
        <div className="card__hd">
          <span className="card__t">Your profile</span>
          <span
            className="mono"
            style={{
              marginLeft: 'auto',
              fontSize: 19,
              fontWeight: 600,
              color: 'var(--tx-accent-text)',
            }}
          >
            {percent}%
          </span>
        </div>
        <div className="card__b">
          <div className="meter meter--lg">
            <i style={{ width: `${percent}%` }} />
          </div>

          <div style={{ marginTop: 14 }}>
            {items.map((item) => (
              <div key={item.key} className="kv">
                {/* §07's `.check`, in its indicator form — see app.css. It was
                    a hand-rolled box duplicating the class's radius, fill and
                    knocked-out tick, plus a `verticalAlign:-3` nudge to sit it
                    on the text baseline. `aria-hidden`, because the row's own
                    Done / +10% already says the state in words. */}
                <span className="kv__k" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    className="check check--static"
                    data-done={item.done}
                    aria-hidden="true"
                  >
                    <IconCheck size={11} />
                  </span>
                  {item.label}
                </span>
                <span className={`kv__v${item.done ? '' : ' ink3'}`}>
                  {item.done ? 'Done' : `+${item.weight}%`}
                </span>
              </div>
            ))}
          </div>

          <p className="small mt3" style={{ color: 'var(--tx-ink-3)' }}>
            {METER_WHY}
          </p>
        </div>
      </div>

      <div className="actrow" style={{ marginTop: 20 }}>
        <Link className="btn btn--primary btn--lg" href="/clients/new">
          <IconPlus size={15} />
          Add your first client
        </Link>
        <Link className="btn btn--secondary btn--lg" href="/today">
          Go to today
        </Link>
      </div>

      {/* Two sentences, not five. The endowed-progress arithmetic and the
          weighting rationale were addressed to a reviewer, not to a trainer who
          has just finished eight questions and wants the next thing — and on a
          phone they were the difference between this screen fitting and not.
          They live in `lib/setup/meter.ts`, where the weights are. */}
      <p className="small" style={{ marginTop: 18, maxWidth: '66ch' }}>
        <b>No confetti.</b> Finishing a form is not an achievement — the celebration belongs to the
        first booking and the first payment.
        <br />
        <br />
        Whatever you skipped is not asked for again. It is picked up once, by this meter and then by
        the same one on your deck.
        <br />
        <br />
        {/* The bio and the intro video were never ASKED, which is a different
            thing from skipped, so they are not on the meter and this is the only
            place that says where they are. One sentence: the note above it is
            capped at two on purpose, because on a phone these lines are the
            difference between the screen fitting and not. */}
        There are two more things a client can read about you — a short bio and an intro video — in{' '}
        <Link href="/settings/profile">Settings → Your profile</Link>.
      </p>
    </>
  );
}
