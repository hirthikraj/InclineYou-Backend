import Link from 'next/link';

import { Plus, Users } from '@/components/shell/Icons';

/**
 * ONE CARD, AND NOTHING ELSE ON THE SCREEN.
 *
 * That is not restraint, it is the phone's own rule read carefully. `HomeScreen`
 * wraps the stat rail, the attention list, the day, the money and the week in
 * `{deck.firstRun ? null : …}`. Every module on this screen is derived from
 * clients, sessions and payments, so with none of those there is nothing for five
 * boxes to say — and drawing them empty would be five lies about how the product
 * works.
 *
 * Two things go with it, and both are handled by the caller:
 *
 *   · the rail loses five of its six counts. A sidebar claiming *Clients 22*
 *     beside *Add your first client* is the same defect one level out. The sixth
 *     stays: the exercise library holds its rows before anybody signs up, and a
 *     number that is true on the first run is not a first-run bug.
 *   · the two page-header controls go. *The week* has no week and *New session*
 *     has nobody to book, and a live button that cannot work is the defect the
 *     schedule design's §08 is named after — nineteen of them, pointing at a
 *     screen that did not exist.
 */
export function FirstRun() {
  return (
    <div className="card">
      {/*
        `.empty--tall`, not `minHeight:400` inline. §04 already pads `.empty` at
        `64px 24px` with a 280px floor, and 400px of that on a 390px screen is the
        whole viewport spent on one sentence — the trainer scrolls to reach the
        only button the screen has. The class carries the desk's height and gives
        it back on a phone.
      */}
      <div className="empty empty--tall">
        <span className="empty__ic">
          <Users size={22} />
        </span>
        <p className="empty__t">Add your first client</p>
        <p className="empty__b">
          Name and number is all it takes. A roster of one is enough to book a session, log a set
          and take a payment — and every other module on this screen is derived from clients,
          sessions and payments, so until there is one there is nothing for them to say.
        </p>
        <div className="row gap2 mt2">
          <Link className="btn btn--primary" href="/clients/new">
            <Plus size={15} />
            Add a client
          </Link>
        </div>
      </div>
    </div>
  );
}
