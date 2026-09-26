'use client';

import { useEffect, useState } from 'react';

import { Clock, Check } from '@/components/shell/Icons';
import { Button } from '@/web-components/ui/Button';

/**
 * §2's rest timer — **"auto-starting on set completion."**
 *
 * ── IT IS `.rst2`, THE STRIP THE CONSOLE ALREADY DRAWS ──────────────────────
 *
 * Same three states, same classes, same two controls: `.rst2--run` counting and
 * `.rst2--over` green with an instruction in it. `SetGrid.tsx` carries the
 * arguments for all of it, and none of them is about who is reading:
 *
 *   · the clock is the number that was already on screen, starting to move —
 *     "a clock that appeared somewhere else on the tick would be a second thing
 *     to learn and a second thing to look for";
 *   · **zero is a state, not an ending** — the strip turns green and says which
 *     set is up, because *rest over* is a fact about the past and what somebody
 *     needs is the instruction;
 *   · it does not move and it does not sound. The keyframe vocabulary is closed
 *     at seven, and a chime is a product decision no brief authorises.
 *
 * ── `endsAt` IS WALL-CLOCK, NEVER A COUNTER ─────────────────────────────────
 *
 * The phone's rule, and it matters more on a client's phone than on either
 * other surface: a browser throttles `setInterval` in a background tab, so
 * somebody who spends forty seconds in WhatsApp between sets must come back to
 * a clock that spent them. The interval ticks at 250ms and re-derives from
 * `Date.now()` every time — which is also what makes *+15* land in the digits
 * at once rather than up to a second later.
 *
 * ── ONE DIVERGENCE FROM THE CONSOLE, AND IT IS ABOUT WHO IS THERE ───────────
 *
 * The console offers **−15** as well as **+15**. This does not. A trainer
 * shortening somebody's rest is coaching; a client shortening their own is
 * skipping, and *Skip* already says that in a word rather than in three
 * presses. §2's audience "hired a trainer *because* they don't know what
 * they're doing", and the rest length is one of the things they hired them for.
 */
export function RestTimer({
  endsAt,
  seconds,
  nextLabel,
  onExtend,
  onDismiss,
}: {
  /** The wall-clock instant rest is over. */
  endsAt: number;
  /** The prescribed rest, so the bar has a denominator. */
  seconds: number;
  /**
   * What is up next — *Set 3 of bench press*, or null when that was the last
   * set of the movement. It is the half of the sentence somebody cannot see
   * without counting rows, and it is why *Rest over* alone would be useless.
   */
  nextLabel: string | null;
  onExtend: () => void;
  onDismiss: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt - Date.now() <= 0) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const over = left === 0;
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;

  if (over) {
    return (
      <div className="rst2 rst2--over mt3">
        <Check size={16} />
        <b>0:00</b>
        <span>
          Rest over.{' '}
          {nextLabel ? (
            <>
              <u>{nextLabel}</u> is up.
            </>
          ) : (
            'That was the last set of this one.'
          )}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <Button variant="ghost" size="sm" onClick={onExtend}>
            +15 more
          </Button>
          <Button variant="secondary" size="sm" onClick={onDismiss}>
            Got it
          </Button>
        </span>
        {/* A PERSISTENT live region, whether or not it has text — `AGENTS.md`
            records why: a region inserted at the same moment as its content is
            read unreliably across screen readers. The counting state below
            renders the same span empty. */}
        <span className="vh" role="status">
          Rest over. {nextLabel ?? 'That was the last set of this exercise'}.
        </span>
      </div>
    );
  }

  return (
    <div
      className="rst2 rst2--run mt3"
      role="timer"
      aria-label={`${clock} of rest left`}
    >
      <Clock size={16} />
      <b>{clock}</b>
      <span className="rst2__bar" aria-hidden="true">
        {/* The clock ticks four times a second and the digits change on the
            fourth, so the bar carries the other three. It EMPTIES as the rest
            is spent, which is the direction that reads as time running out. */}
        <span className="rst2__fill" style={{ width: `${(left / Math.max(seconds, 1)) * 100}%` }} />
      </span>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
        <Button variant="ghost" size="sm" onClick={onExtend}>
          +15
        </Button>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Skip
        </Button>
      </span>
      <span className="vh" role="status" />
    </div>
  );
}
