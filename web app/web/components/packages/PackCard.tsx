'use client';

import type { PackRow } from '@/lib/packs/compute';
import { periodLabel } from '@/lib/packs/vocab';
import { rupees } from '@/lib/today/time';
import { Button } from '@/web-components/ui/Button';

/**
 * ONE PACK, AS A CARD.
 *
 * The price list used to be two tables, and the table was the wrong object: a
 * pack is read as a SENTENCE (*12 sessions, good for 60 days*), a price and what
 * that comes to a session — three things of three different sizes, which a
 * column of equal-width cells flattens into six numbers. The terms are one line
 * of words, the price is the figure, and the per-session is the line a trainer
 * compares between packs.
 *
 * **On a gym pack the figure is still the gym's price**, and the line under it is
 * the trainer's own number, because it is the one they will ask the card for.
 *
 * Two controls only on the face — *Edit* and a *More* — so the card stays a
 * card. Reordering and removing live behind *More*, in a tray that opens inside
 * the card and not in a floating menu, because a floating menu on a phone is a
 * second thing to dismiss and this row sits in a scroller.
 */
export function PackCard({
  row,
  first,
  last,
  trayOpen,
  confirming,
  sold,
  pending,
  gym,
  onEdit,
  onTray,
  onMove,
  onAskRemove,
  onCancelRemove,
  onRetire,
  onDelete,
}: {
  row: PackRow;
  first: boolean;
  last: boolean;
  trayOpen: boolean;
  confirming: boolean;
  /** The server said it was sold after all: Delete is withdrawn. */
  sold: boolean;
  pending: boolean;
  gym: string | null;
  onEdit: () => void;
  onTray: () => void;
  onMove: (dir: -1 | 1) => void;
  onAskRemove: () => void;
  onCancelRemove: () => void;
  onRetire: () => void;
  onDelete: () => void;
}) {
  const theirs = row.owner === 'gym';
  const programming = row.service === 'programming';

  const terms = row.basis === 'sessions'
    ? `${row.sessions} ${row.sessions === 1 ? 'session' : 'sessions'}${row.validityDays != null ? ` · good for ${row.validityDays} days` : ' · no expiry'}`
    : programming
      ? `A plan for ${periodLabel(row.validityDays ?? 30)}`
      : `Unlimited sessions for ${periodLabel(row.validityDays ?? 30)}`;

  const wasSold = row.sold > 0 || sold;

  /* The group heading already names the gym, so a gym pack named *12 sessions ·
     Iron Temple* says it twice and wraps. Drops a trailing ` · X` where X is the
     gym's name or the start of it. Display only: the stored name is untouched. */
  const tail = row.name.match(/ · ([^·]+)$/)?.[1]?.trim();
  const shownName = theirs && gym && tail && gym.toLowerCase().startsWith(tail.toLowerCase())
    ? row.name.slice(0, row.name.lastIndexOf(' · '))
    : row.name;

  return (
    <article className="pkx-c" data-theirs={theirs || undefined}>
      <header className="pkx-c__hd">
        <h3 className="pkx-c__n">{shownName}</h3>
      </header>
      <p className="pkx-c__t">{terms}</p>

      <p className="pkx-c__p">
        <span className="pkx-c__amt">{rupees(row.amount)}</span>
        {row.perSession != null && (
          <span className="pkx-c__per">{rupees(row.perSession)} a session{theirs ? ' to you' : ''}</span>
        )}
      </p>

      {row.split && (
        <dl className="pkx-c__s">
          <div><dt>You keep · {row.split.trainerLabel}</dt><dd>{rupees(row.split.trainer)}</dd></div>
          <div><dt>Gym keeps</dt><dd>{rupees(row.split.gym)}</dd></div>
        </dl>
      )}

      {confirming ? (
        <div className="pkx-c__ask" role="group" aria-label={`Remove ${row.name}`}>
          <p>
            {wasSold
              ? `Sold ${row.sold} time${row.sold === 1 ? '' : 's'}; ${row.clients} on it keep${row.clients === 1 ? 's' : ''} what they bought.`
              : 'Never sold, so it can be removed for good.'}
          </p>
          <div className="pkx-c__acts">
            <Button variant="secondary" size="sm" disabled={pending} onClick={onRetire}>Retire it</Button>
            {!wasSold && <Button variant="ghost" size="sm" disabled={pending} onClick={onDelete}>Delete it</Button>}
            <Button variant="ghost" size="sm" onClick={onCancelRemove}>Keep selling it</Button>
          </div>
        </div>
      ) : (
        <>
          <footer className="pkx-c__ft">
            <span className="pkx-c__use">
              <b>{row.clients}</b> on it · {row.sold} sold
            </span>
            <span className="pkx-c__acts">
              <Button variant="secondary" size="sm" onClick={onEdit} aria-label={`Edit ${row.name}`}>Edit</Button>
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={trayOpen}
                aria-label={`More for ${row.name}`}
                onClick={onTray}
              >
                More
              </Button>
            </span>
          </footer>
          {trayOpen && (
            <div className="pkx-c__tray" role="group" aria-label={`More for ${row.name}`}>
              <Button variant="ghost" size="sm" disabled={pending || first} onClick={() => onMove(-1)}>Move earlier</Button>
              <Button variant="ghost" size="sm" disabled={pending || last} onClick={() => onMove(1)}>Move later</Button>
              <Button variant="ghost" size="sm" onClick={onAskRemove}>Remove</Button>
            </div>
          )}
        </>
      )}
    </article>
  );
}
