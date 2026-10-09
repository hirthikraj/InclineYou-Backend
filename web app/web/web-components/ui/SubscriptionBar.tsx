import type { ReactNode } from 'react';

/**
 * Subscription bar — one live agreement, folded to one line.
 *
 * What was bought, what state it is in, and the handful of figures a reader
 * checks before they open anything: the amount, when it is due, when it
 * started, what is left of it, and what is still owed on it.
 *
 * ── WHY IT IS NOT A ROW OF STAT TILES ───────────────────────────────────────
 *
 * `Stat` is one figure standing on its own ground, sized to be read across a
 * room, and it is the right instrument for the row of totals ABOVE this bar —
 * lifetime billed, collected, pending, next payment. Those four are a
 * dashboard: four independent questions, four answers, any of which can be
 * read alone.
 *
 * The fields here are not that. They are seven facts about ONE object, and the
 * first of them is a name, which has no figure in it at all. Drawn as tiles
 * they become seven cards that all say "this pack", separated by gutters that
 * claim they are unrelated. So: one bordered object, cells divided by a rule,
 * values at reading size.
 *
 * ── AND NOT `.strip` EITHER ─────────────────────────────────────────────────
 *
 * `.strip` is the three-figure summary above a table — 19px Archivo numbers
 * with mono captions under them, and no slot for an identity or a status. A
 * bar that opens with a name and a tag is a different object, so it has a
 * class of its own rather than `.strip` carrying two modifiers it was not
 * drawn for.
 *
 * ── AND IT CAN ACT ON WHAT IT STATES ────────────────────────────────────────
 *
 * `actions` is a shelf at the end of the bar, and it exists because the first
 * call-site shipped without one: the client file's Payments tab drew a live
 * pack with a balance six days overdue and offered no control anywhere on the
 * screen to collect it, renew it or chase it. The only button on the tab was
 * the one for a client with no pack at all.
 *
 * It is a slot rather than a prop list — `actions?: ReactNode` — because the
 * verbs belong to the domain and not to this component. A pack renews and
 * collects; a membership upgrades and cancels; neither list is the other's, and
 * a component that enumerated them would have to grow a prop per screen.
 *
 * ── THE TONE IS ON THE CELL, NOT ON THE BAR ─────────────────────────────────
 *
 * A pack with money outstanding is not a red pack; it is a pack with one red
 * figure on it. Toning the whole bar would say the agreement is in trouble
 * when what is true is that one of five numbers wants attention — and the
 * status tag beside the name is already the place where the agreement's own
 * state is stated.
 */
export type SubscriptionFactTone = 'neutral' | 'acc' | 'warn' | 'danger';

export type SubscriptionFact = {
  /** The label, said the way a trainer would say it: "Due", "Sessions left". */
  k: ReactNode;
  v: ReactNode;
  tone?: SubscriptionFactTone;
};

export function SubscriptionBar({
  name,
  status,
  facts,
  actions,
  label,
  className,
}: {
  /** What was bought. The pack's own name where it has one. */
  name: ReactNode;
  /** Usually a `Tag`. Optional, because not every agreement has a state worth stamping. */
  status?: ReactNode;
  facts: SubscriptionFact[];
  /**
   * The verbs for THIS agreement — renew it, collect against it. Usually one or
   * two `Button`s. Omitted where the bar is a read-out and nothing more.
   */
  actions?: ReactNode;
  /**
   * What the bar is a summary OF, for a reader who cannot see that it sits
   * under a heading. It names the region; it is not drawn.
   */
  label?: string;
  className?: string;
}) {
  return (
    <section
      className={['subbar', className].filter(Boolean).join(' ')}
      aria-label={label}
    >
      <div className="subbar__id">
        <span className="subbar__nm" title={typeof name === 'string' ? name : undefined}>{name}</span>
        {status}
      </div>
      {facts.map((f, i) => (
        <div
          key={i}
          className={['subbar__c', f.tone && f.tone !== 'neutral' ? `subbar__c--${f.tone}` : null]
            .filter(Boolean)
            .join(' ')}
        >
          <span className="subbar__k">{f.k}</span>
          <span className="subbar__v">{f.v}</span>
        </div>
      ))}
      {actions && <div className="subbar__act">{actions}</div>}
    </section>
  );
}
