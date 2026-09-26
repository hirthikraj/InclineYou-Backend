import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Stat tile — one figure, large, with where it came from.
 *
 * ── AND OPTIONALLY A DOOR ────────────────────────────────────────────────────
 *
 * `href` makes the whole tile a link, which is what a figure on a home screen
 * usually is: the trainer's Today has drawn three linked tiles since it shipped
 * — hand-written as `<Link className="stat">` inside `.srail` — and the client
 * portal's Home wants the same thing pointing at Progress and Me. Two screens
 * writing an anchor with this component's class on it is the drift the
 * catalogue exists to stop, so it is a prop.
 *
 * The `.stat--link` modifier in §04 carries the one thing that cannot be left
 * to the call-site: §01's base rule paints every anchor `--tx-accent-text`, so
 * an unmodified linked tile renders its figure LIME, which on a dashboard reads
 * as a status rather than as a number.
 *
 * A `delta` and an `href` compose, and that is deliberate — *↑ 12% · see how*
 * is one thought. What does NOT compose is `href` and a nested control: the
 * tile is one target, and a button inside a link is a target inside a target.
 *
 * ── THE DELTA IS NOT A COLOUR ───────────────────────────────────────────────
 *
 * "+8% on July" in green and "−8% on July" in red is the obvious rendering and
 * it is wrong twice over. Colour alone carries the direction, so it is gone for
 * anyone who cannot separate the two hues; and up is not always good — a rise
 * in the gym's share is a fall in the trainer's.
 *
 * So `delta` takes a `direction` (which way the number moved) and a `good`
 * (whether that is welcome), and they are separate arguments because they are
 * separate facts. The arrow says the first, the tone says the second, and the
 * accessible text says both in words.
 */
export type StatTone = 'neutral' | 'acc' | 'warn' | 'danger';

export function Stat({
  label,
  value,
  detail,
  delta,
  tone = 'neutral',
  href,
  className,
}: {
  /**
   * A node, not a string. It was typed `string` and the product disagrees:
   * *You earned · {periodTag(period)}*, *The gym's {stats.gymCutPercent}%* —
   * a third of the labels interpolate, and the tile is the natural place for
   * the period or the share to be said.
   */
  label: ReactNode;
  value: ReactNode;
  /** Where the figure came from: "21 sessions", "46% of floor sessions". */
  detail?: ReactNode;
  delta?: { text: string; direction: 'up' | 'down'; good?: boolean };
  tone?: StatTone;
  /** Makes the whole tile a link. See the note above for why it is a prop. */
  href?: string;
  className?: string;
}) {
  const cls = [
    'stat',
    tone === 'neutral' ? null : `stat--${tone}`,
    href ? 'stat--link' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  /*
   * `<p>`s inside the link form as well, and not `<span>`s.
   *
   * The obvious worry is that a `<p>` inside an `<a>` is invalid HTML — it is
   * not: `<a>` is transparent content, so it takes whatever its parent would.
   * The trainer's `.srail` writes spans and then spends two rules in app.css
   * (`display:block` on both parts) buying back the line breaks it gave away,
   * which is the shape of a workaround rather than a decision.
   */
  const body = (
    <>
      <p className="stat__k">{label}</p>
      <p className="stat__v">{value}</p>
      {detail || delta ? (
        <p className="stat__d">
          {detail}
          {detail && delta ? ' · ' : null}
          {delta ? (
            <b className="stat__delta">
              <span aria-hidden="true">{delta.direction === 'up' ? '↑' : '↓'}</span>
              {delta.text}
              {/* The direction in words, for a reader that gets neither the arrow
                  nor the colour. */}
              <span className="vh">
                {' '}
                {delta.direction}
                {delta.good === undefined ? '' : delta.good ? ', which is welcome' : ', which is not'}
              </span>
            </b>
          ) : null}
        </p>
      ) : null}
    </>
  );

  if (href !== undefined) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }

  return <div className={cls}>{body}</div>;
}

/**
 * A row of two, three or four. More than four and none of them is large.
 *
 * ── `className` IS FOR THE NARROW RUNG, AND THAT IS ALL IT IS FOR ────────────
 *
 * `.stats--2/3/4` are PINNED counts with no breakpoint, and webapp.css says why
 * — `auto-fit` left an orphan tile on its own row. The consequence is that
 * every screen that puts a row of tiles on a phone has to hang its own rung off
 * a second class, and four have now done it: `.cfstats`, `.cfprog`, `.rptstats`
 * and `.mnystats`, each with the identical note that a pass about one screen
 * must not restyle the other three by editing `.stats--n` itself. All four
 * passed the class through `className` on a `<div>` they wrote by hand or
 * through the component's parent; this is that hook, so the fifth does not have
 * to hand-write `.stats`.
 */
export function Stats({
  up = 3,
  className,
  children,
}: {
  up?: 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={['stats', `stats--${up}`, className].filter(Boolean).join(' ')} style={{ width: '100%' }}>
      {children}
    </div>
  );
}
