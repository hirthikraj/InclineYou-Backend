'use client';

import { useId, useState } from 'react';

import {
  MEV,
  MAV,
  SCALE,
  MUSCLE_ORDER,
  PATTERN_ORDER,
  balanceFlags,
  inOrder,
  type Balance,
} from '@/lib/programs/balance';
import { BalanceStrip } from '@/web-components/ui/BalanceStrip';

import { ArrowDown, WarnIcon } from '../Icons';

/**
 * THIS WEEK'S BALANCE — what the week actually asks of each muscle group.
 *
 * The one module on this screen that says something no single day can. A
 * trainer building Push / Pull / Legs one column at a time cannot see that
 * chest has ended up on 7 sets and back on 22; the columns each look fine.
 *
 * ── THE BAND IS A RANGE, NEVER A TARGET ────────────────────────────────────
 *
 * Every sentence here says *under the floor* or *above the ceiling*. Ten and
 * twenty are landmarks that move with the trainee, the exercise selection and
 * the phase of the block, so the panel states a threshold and never prescribes
 * a number — *"you should do 15"* is a claim the evidence does not support and
 * a trainer would be right to stop trusting the panel over.
 *
 * ── AND NO BAND IS DRAWN FOR PATTERNS ──────────────────────────────────────
 *
 * The 10–20 range is a claim about muscle groups. Inventing one for movement
 * patterns would be a second number wearing the first one's authority, so the
 * pattern tracks are plain and scaled to the week's own biggest pattern.
 *
 * ── AND IT COLLAPSES TO ONE LINE WHEN THERE IS NO ROOM FOR A COLUMN ──────
 *
 * `@container ws (max-width:900px)` used to drop this panel out of its 280px
 * track and land the whole chart FULL WIDTH above the board. The intent was
 * right — *a balance figure read after scrolling past the whole week is a
 * figure read too late to act on* — but the plane pays 248px of rail and 400px
 * of shelf before it starts, so the state fired at EVERY laptop width and the
 * consequence inverted the intent: 690px of bar chart above the fold and the
 * first exercise at y=993 of a 900px viewport.
 *
 * So the narrow state is the PHONE's answer, which was already written and
 * already argued — `.wsm__balb`: one line saying whether anything is out of
 * band, opening to the panel. Same component, ONE instance, one accessibility
 * tree. CSS decides whether the strip exists; React only remembers whether it
 * was opened, so nothing here branches on a measured width and the wide state
 * ignores `data-open` entirely.
 */
/**
 * ONE ENTRY POINT TO THE PROGRESSION PANEL, AND IT IS NOT HERE.
 *
 * This panel used to carry *Set a progression rule* at its foot while the
 * toolbar carried `PROGRESSION · Set a rule` — two controls opening one panel,
 * on one screen. The toolbar's is the one that survives, for three reasons and
 * the third settles it:
 *
 * · it STATES the rule as well as offering it. The chip prints the ladder read
 *   back off the authored rows (`overloadLine`), so it answers *is there one*
 *   before it is pressed. A bare button at the foot of a chart cannot.
 * · it sits beside the WEEK STRIP, which is the thing a progression is about.
 * · it is always there. This foot lives inside `.wsbal__body`, which the
 *   narrow-plane state hides — so at every laptop width with the shelf open the
 *   button was already gone, and a control that disappears at some widths
 *   cannot be the primary one. It was also never on the phone: `PhoneProgram`
 *   renders this panel without the prop, so nothing is lost there either.
 */
export function BalancePanel({
  balance,
  week,
}: {
  balance: Balance;
  week: number;
}) {
  const { low, high, say } = balanceFlags(balance);
  /* Opened-ness is remembered for the sitting and nothing else. It is read
     ONLY by the narrow CSS state, so a trainer at 1920 who never sees the
     strip is never affected by its value. */
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const muscles = inOrder(balance.muscle, MUSCLE_ORDER);
  const patterns = inOrder(balance.pattern, PATTERN_ORDER);
  const patMax = Math.max(1, ...Object.values(balance.pattern));

  const skew =
    balance.push === balance.pull
      ? 'balanced'
      : balance.push > balance.pull
        ? `${balance.push - balance.pull} sets push-heavy`
        : `${balance.pull - balance.push} sets pull-heavy`;

  return (
    <aside className="wsbal" aria-label="This week's balance" data-open={open ? '1' : undefined}>
      {/* THE ONE-LINE STATE, and it is `ui/BalanceStrip.tsx` — the library
          renders the same import, so the specimen on `/library/c-balancestrip`
          cannot drift from what a trainer sees here. Always in the document and
          `display:none` wherever the panel has a column of its own, so the wide
          layout carries neither a duplicate control nor a duplicate node in the
          accessibility tree.

          THE TWO READINGS TRAVEL SEPARATELY, and they used to arrive as
          `[...high, ...low]` — one list, drawn under one amber glyph. The
          ordering that flattening encoded (over the ceiling first, as the more
          urgent) survives as the order the strip draws its two halves in; what
          it no longer does is tell a trainer that four groups UNDER the floor
          are four warnings. `Track` below has held that distinction since it
          was written; the strip holds it now too. */}
      <BalanceStrip
        total={balance.total}
        over={high}
        under={low}
        open={open}
        bodyId={bodyId}
        onToggle={() => setOpen(v => !v)}
      />

      {/* THE BODY IS A GRID TRACK, AND `.wsbal__bodyin` IS WHY IT EXISTS.
          The narrow state used to `display:none` the body, which is a cut, not
          a fold — the panel blinked in and out and the strip's chevron spun on
          its own beside it. A height transition needs a number to run between,
          so the body is a one-row grid animated `0fr` ↔ `1fr` and the inner
          box clips to it. The wrapper is the only thing that can carry
          `overflow:hidden` without clipping the panel's own border radius. */}
      <div className="wsbal__body" id={bodyId}>
      <div className="wsbal__bodyin">
      <div className="wsbal__hd">
        <div className="wsbal__k">Week {week}</div>
        <div className="wsbal__tot">
          {balance.exercises} exercise{balance.exercises === 1 ? '' : 's'} · {balance.total} sets
        </div>
        {balance.ton.kgs > 0 && (
          <>
            <div className="wsbal__ton">{grouped(balance.ton.kgs)} kg volume load</div>
            {balance.ton.skipped > 0 && (
              <div className="wsbal__fine">
                {balance.ton.skipped} bodyweight row{balance.ton.skipped === 1 ? '' : 's'} not
                counted — {balance.ton.skipped === 1 ? 'it carries' : 'they carry'} no load
              </div>
            )}
          </>
        )}
        {/* A row the library could not name counts NOWHERE, and the panel says
            so rather than quietly disagreeing with the column beside it. */}
        {balance.unknown > 0 && (
          <div className="wsbal__fine">
            {balance.unknown} set{balance.unknown === 1 ? '' : 's'} on {' '}
            {balance.unknown === 1 ? 'a row whose exercise' : 'rows whose exercises'} the library
            cannot name — not counted anywhere below
          </div>
        )}
      </div>

      {muscles.length > 0 && (
        <div className="wsbal__s">
          <div
            className="wsbal__st"
            title={`The shaded part of each track is ${MEV}–${MAV} sets a week — the range most trainees progress on.`}
          >
            Sets per muscle group
          </div>
          {muscles.map(m => (
            <Track key={m} label={m} value={balance.muscle[m]} max={SCALE} banded />
          ))}
          <p className="wsbal__fine">
            shaded band = {MEV}–{MAV} sets a week
          </p>
        </div>
      )}

      {patterns.length > 0 && (
        <div className="wsbal__s wsbal__s--pat">
          <div
            className="wsbal__st"
            title="No band is drawn for patterns. The volume-landmark range is a claim about muscle groups; inventing one for patterns would be a number the evidence does not support."
          >
            Movement patterns
          </div>
          <div className="wsbal__pp">
            <span>
              {balance.push} : {balance.pull}
            </span>
            <em>push : pull — {skew}</em>
          </div>
          {patterns.map(p => (
            <Track key={p} label={p} value={balance.pattern[p]} max={patMax} banded={false} />
          ))}
          <p className="wsbal__fine">
            no band — the {MEV}–{MAV} range is about muscle groups, not patterns
          </p>
        </div>
      )}

      {muscles.length === 0 && patterns.length === 0 ? (
        <p className="wsbal__say">Nothing prescribed this week yet.</p>
      ) : (
        <p className="wsbal__say">{say}</p>
      )}

      </div>
      </div>
    </aside>
  );
}

/**
 * ONE TRACK — and UNDER the floor is not the same thing as OVER the ceiling.
 *
 * Both used to draw `--tx-warn`. Amber for *add volume* and amber for *cut
 * volume* is one colour carrying two opposite instructions, and the only thing
 * that told them apart was the sentence at the foot of the panel — which names
 * the groups but not which bar is which. Now:
 *
 * · OVER the ceiling is the risk, so it keeps amber and points UP.
 * · UNDER the floor is a gap rather than a hazard, so the bar stays neutral
 *   and points DOWN.
 *
 * Neither is colour alone: the direction is a glyph, the glyph carries the
 * sentence as its accessible name, and the figure beside the label was always
 * the authoritative reading. That is SC 1.4.1 satisfied three ways over.
 */
function Track({
  label,
  value,
  max,
  banded,
}: {
  label: string;
  value: number;
  max: number;
  banded: boolean;
}) {
  const lowOut = banded && value < MEV;
  const highOut = banded && value > MAV;
  const out = lowOut || highOut;
  const pct = Math.min(100, (value / max) * 100);
  const why = lowOut
    ? `${label} is ${value} sets — under the ${MEV}-set minimum effective volume.`
    : highOut
      ? `${label} is ${value} sets — above the ${MAV}-set adaptive ceiling.`
      : '';

  return (
    <div
      className={`wsbal__r${out ? ' wsbal__r--out' : ''}${lowOut ? ' wsbal__r--low' : ''}${
        highOut ? ' wsbal__r--high' : ''
      }`}
    >
      <span className="wsbal__l">{label}</span>
      <span className="wsbal__v">{value}</span>
      <span className={`wsbal__t${banded ? '' : ' wsbal__t--plain'}`}>
        {/* THE BAND IS TWO TICKS NOW, not a wash. Measured, the wash was
            **1.09:1** against its own track in dark and 1.16:1 in light —
            WCAG 1.4.11 asks 3:1 of a graphical object you have to read — and
            the fill painted straight over it, so it vanished at exactly the
            moment a bar reached the range it marks. The ticks are drawn ABOVE
            the fill and survive it. */}
        <span className="wsbal__band" />
        <span className="wsbal__f" style={{ width: `${pct}%` }} />
      </span>
      {/* `hidden` rather than unmounted, so the four-track grid keeps its
          columns and the figures stay in one line down the panel. */}
      <span className="wsbal__w" hidden={!out} title={why} role="img" aria-label={why}>
        {lowOut ? <ArrowDown size={13} /> : <WarnIcon size={13} />}
      </span>
    </div>
  );
}

/** Indian grouping — 1,20,000, not 120,000. */
function grouped(n: number): string {
  return Math.round(n).toLocaleString('en-IN');
}
