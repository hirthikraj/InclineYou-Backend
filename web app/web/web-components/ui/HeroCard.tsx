import Link from 'next/link';
import type { ReactNode } from 'react';

export type HeroCardBand = {
  icon: ReactNode;
  tone?: 'acc' | 'warn';
  text: ReactNode;
};

/**
 * THE HERO CARD, REDRAWN. Prop-for-prop the same API as `ui/HeroCard`, so the
 * five call-sites in `components/today/Hero.tsx` swap one import and change
 * nothing else — which is also what makes it cheap to prove that no content
 * moved.
 *
 * ── THE ONE SURFACE ON THE SCREEN THAT KEEPS A FILL ─────────────────────────
 *
 * `quiet` is the dial, and it now decides something stronger than a tint.
 * A running session is the only thing on `/today` that is HAPPENING, so it is
 * the only thing that gets a ground (`.hro`, the lime wash at
 * `--tx-accent-soft`). Everything else — the session after it, tomorrow's
 * first, the closed day — is a ruled panel with no fill (`.hro--quiet`). The
 * first drawing gave the second card the same `.card` box as the first and
 * then relied on `card--acc` alone to separate them, which is a tint doing a
 * hierarchy's job.
 *
 * The lime is never asked to carry type. Text on the wash is ordinary
 * `--tx-ink`, which clears AA on both themes; `--tx-accent-text` (#4F6B0A on
 * light) is what the kicker uses, and that is the token §01 exists to force.
 *
 * ── `tone: 'acc'` STAYS, AND THE LIVE CARD NEUTRALISES IT INSTEAD ───────────
 *
 * The running card used to pass `tone: 'acc'`, so the lime card carried a lime
 * plate inside it: an accent on an accent, which is why the band never read as
 * a separate fact. The first repair deleted the tone from the union, and that
 * was too wide a cut — the client portal's Home and its finished-workout screen
 * both draw a QUIET card with an accent band, where the tint is doing real work
 * and there is no accent underneath it to fight.
 *
 * So the tone stays and the fix moves to where the conflict actually is:
 * `.hro:not(.hro--quiet) .hro__w` in §25 flattens any band inside a LIVE card
 * back to a plain surface. One rule, scoped to the one card that has a lime
 * ground, and every other caller keeps the tone it asked for.
 *
 * ── THE FIGURE ──────────────────────────────────────────────────────────────
 *
 * 44px Archivo at -0.04em, tabular. Tabular is not a detail on this one: the
 * running card's figure is a clock that re-renders every second, and
 * proportional digits change width as the minutes roll, so the card twitches
 * once a second under the reader.
 */
export function HeroCard({
  kicker,
  live = false,
  figure,
  unit,
  name,
  nameHref,
  detail,
  chips,
  band,
  actions,
  label,
  quiet = false,
}: {
  kicker: ReactNode;
  live?: boolean;
  /** Accepted, and deliberately not read. `HeroCard` used it to add
      `card--lead`; the hero pair is ranked by FILL now, so there is nothing
      for a weight modifier to do. It stays in the type so the eight call-sites
      in `Hero.tsx` did not have to change when they moved over. */
  lead?: boolean;
  figure?: ReactNode;
  unit?: string;
  name?: ReactNode;
  nameHref?: string;
  detail?: ReactNode;
  chips?: ReactNode;
  band?: HeroCardBand;
  actions?: ReactNode;
  /** The whole card as one sentence, for a screen reader. The figure is
      `aria-hidden` because "37" alone is not a fact. */
  label: string;
  quiet?: boolean;
}) {
  const quietly = quiet || !live;
  return (
    <div className={`hro${quietly ? ' hro--quiet' : ''}`} role="group" aria-label={label}>
      <h3 className="hro__k">
        {live && <i />}
        {kicker}
      </h3>

      {figure !== undefined && (
        <p className="hro__c" aria-hidden="true">
          {figure}
          {unit && <em className="hro__u">{unit}</em>}
        </p>
      )}

      {name && (
        <p className="hro__n">
          {nameHref ? (
            <Link href={nameHref} style={{ color: 'inherit' }}>
              {name}
            </Link>
          ) : (
            name
          )}
        </p>
      )}

      {detail && <p className="hro__d">{detail}</p>}
      {chips && <div className="hro__c2">{chips}</div>}

      {band && (
        <div className={`hro__w${band.tone ? ` hro__w--${band.tone}` : ''}`}>
          {band.icon}
          <span>{band.text}</span>
        </div>
      )}

      {actions && <div className="hro__a">{actions}</div>}
    </div>
  );
}
