'use client';

/**
 * Scale — a point on a fixed range, every point a target.
 *
 * 1 to `top`, drawn whole, answered with one tap. Each point is a `<label>`
 * wrapping a visually hidden `<input type="radio">`, so the group is a real
 * radio group: one tab stop, arrows along the range, and a reader hears the
 * question and then *7 of 10*.
 *
 * ── WHY IT IS NOT A SLIDER ──────────────────────────────────────────────────
 *
 * A `range` input is for a continuum somebody is aiming at; this is a label
 * somebody already has. Dragging to a seven they knew before they touched the
 * screen is work the question did not ask for, the handle is the smallest
 * target on the page, and the value is never quite certain — which defeats the
 * one property a fixed scale exists for, that the same question can be put
 * beside its own answer eight weeks from now.
 *
 * ── THE ENDS ARE THE CALLER'S WORDS, AND USUALLY THERE ARE NONE ─────────────
 *
 * `low` and `high` caption the two ends — *Not at all* / *Completely*. They are
 * optional and this product passes neither, which is deliberate rather than
 * unfinished: the question bank has no anchor text in it, every rating question
 * in it is phrased *how well* or *how would you rate*, and inventing a pair at
 * the call-site would put words in the trainer's mouth that the chart then
 * treats as part of the question. A screen that HAS them should pass them; none
 * should make them up.
 */
export function Scale({
  name,
  label,
  value,
  top = 10,
  onChange,
  low,
  high,
  className,
}: {
  /** The radio group's shared name — a radio's exclusivity is its name. */
  name: string;
  /** The question. Read out before the first point. */
  label: string;
  /** The chosen point, or null while unanswered. */
  value: number | null;
  /** 5, 10 or 20 — `SCALES` in `lib/assessments/vocab.ts` carries why three. */
  top?: number;
  onChange: (value: number) => void;
  low?: string;
  high?: string;
  className?: string;
}) {
  const points = Array.from({ length: top }, (_, i) => i + 1);

  return (
    <div className={['scale', className].filter(Boolean).join(' ')}>
      <div role="radiogroup" aria-label={label} className="scale__r">
        {points.map((n) => (
          <label
            key={n}
            className={['scale__p', value === n ? 'scale__p--on' : ''].filter(Boolean).join(' ')}
          >
            <input
              type="radio"
              className="vh"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
            />
            {/* The number is drawn once and read twice: the digit for the eye,
                and `aria-label` for the ear, because *7* alone out of context
                is a figure with no range behind it. */}
            <span aria-hidden="true">{n}</span>
            <span className="vh">{`${n} of ${top}`}</span>
          </label>
        ))}
      </div>
      {(low || high) && (
        <p className="scale__ends">
          <span>{low}</span>
          <span>{high}</span>
        </p>
      )}
    </div>
  );
}
