import Link from 'next/link';

import { IconCheck, IconPlus } from '@/components/auth/Icons';
import { METER_WHY, meterItems, meterPercent } from '@/lib/setup/meter';
import type { SetupState } from '@/lib/setup/steps';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';

/**
 * Frame 6a · `/setup/done` — after setup.
 *
 * **No confetti.** Finishing a form is not an achievement — the celebration
 * belongs to the first booking and the first payment, where the trainer has
 * actually earned something, and spending it here devalues both. The app's own
 * `DoneScreen` says exactly that in its first four words.
 *
 * **The meter never opens at zero.** Anybody reaching this screen has answered
 * step 1 — the one the flow refuses to skip — so that block is already banked:
 * the meter starts at the work done rather than at the work owed. It no longer
 * opens at 70% for everyone, and that is the flow changing rather than this
 * screen: with seven of the eight steps skippable, a trainer can arrive here
 * having answered one of them, and a meter that read 70% over an otherwise
 * empty profile would be the opposite of what this screen is for.
 * Identical real effort, and the original endowed-progress study measured a
 * visible head start roughly doubling completion — 34% against 19%.
 *
 * **The items are weighted by what they are worth, not counted.** A UPI ID is 2×
 * a certification, because it is the difference between getting paid through the
 * app and not. And step 1's two answers are ONE row rather than two, because two
 * ticks for one sitting's work makes the meter feel like it is counting
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

      {/* ── ONE SCREEN, NOT ~950px (22 Nov 2026) ─────────────────────────────────────────────────────────────────
          At 100% the card was a full meter plus four rows that all said *Done* — the white "Done" louder than the items
          it described, and ticks that vanished on the lime boxes. Complete, it is one line. Incomplete, it is the meter
          and ONLY what is left, each with what it adds; what is done folds into a count. */}
      {percent >= 100 ? (
        <div className="dnone">
          <span className="dnone__tick" aria-hidden="true">
            <IconCheck size={14} />
          </span>
          <p>
            <b>Profile complete.</b> Clients see your name, languages, certifications and UPI ID before they accept an
            invite.
          </p>
        </div>
      ) : (
        <Card style={{ marginTop: 20, maxWidth: 520 }}>
          <Card.Head title="Your profile">
            <span className="tnum dnmeter__pct">{percent}%</span>
          </Card.Head>
          <Card.Body>
            <div className="meter meter--lg">
              <i style={{ width: `${percent}%` }} />
            </div>
            <p className="small ink3 mt2">
              {items.filter((i) => i.done).length} of {items.length} done · {METER_WHY}
            </p>
            <div className="dnleft">
              {items
                .filter((item) => !item.done)
                .map((item) => (
                  <div key={item.key} className="kv">
                    <span className="kv__k">{item.label}</span>
                    <span className="kv__v ink3">+{item.weight}%</span>
                  </div>
                ))}
            </div>
            <p className="small mt2">
              <Link href="/settings/profile">Finish in Settings → Your profile</Link>
            </p>
          </Card.Body>
        </Card>
      )}

      <div className="actrow dnacts">
        <Button href="/clients/new" variant="primary" size="lg">
          <IconPlus size={15} />
          Add your first client
        </Button>
        <Button href="/today" variant="secondary" size="lg">
          Go to today
        </Button>
      </div>

      {/* One line (22 Nov 2026). *No confetti* and *picked up once, by this meter* were the design's reasoning,
          addressed to a reviewer; the only fact a trainer needs here is the two profile parts setup never asks for. */}
      <p className="small ink3 dnmore">
        Add a short bio and an intro video any time in <Link href="/settings/profile">Settings → Your profile</Link> —
        clients read both before they accept.
      </p>
    </>
  );
}
