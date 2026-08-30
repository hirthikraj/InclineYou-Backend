import Link from 'next/link';

import type { DeckMoney, DeckWeek } from '@/lib/today/deck';
import { clients } from '@/lib/today/copy';
import { rupees } from '@/lib/today/time';
import { Chevron, Send } from '@/components/shell/Icons';

/*
 * TWO CARDS IN ONE FILE, and named for the first — `MonthCard` is below.
 *
 * They are here together because they are the same object: five key-value pairs
 * and a footnote, sitting side by side as columns two and three of the third row.
 * The stylesheet has one `.kv` for both and the deck one `DeckWeek`/`DeckMoney`
 * pair, so a change to how a figure is stated in one is nearly always a change to
 * the other — which is the argument for one file rather than two.
 */

/**
 * THIS WEEK · SO FAR — and "so far" is the whole card.
 *
 * `buildWeek` on the phone counts delivered over everything SCHEDULED for the
 * week, which on a Tuesday morning is a fraction whose denominator is mostly in
 * the future. At 09:12 on the second day that reads as a 33% adherence rate for a
 * week that is going perfectly well. It survives on a phone, where the figure is a
 * row of seven bars nobody reads as a percentage. It does not survive in a card
 * whose headline IS a percentage — the page this replaces printed "18 of 21 · 86%
 * adherence" at 09:12 on a Tuesday, when nine sessions had started.
 *
 * So the rate here is delivered over what has SETTLED — delivered plus no-shows —
 * and everything still to come is stated as its own number rather than folded into
 * a denominator. A session that has not started yet is not one you failed to
 * deliver.
 *
 * The meter's four segments are shares of the WHOLE week, which is a different
 * question from the percentage above it and the reason they can disagree: the bar
 * is how the week is filling up, the number is how the settled part went.
 */
export function WeekCard({ week }: { week: DeckWeek }) {
  const total = Math.max(1, week.scheduled);
  const pct = (n: number) => Math.round((100 * n) / total);
  const ok = pct(week.delivered);
  const no = pct(week.noShows);
  const open = pct(week.unmarked);
  const rest = Math.max(0, 100 - ok - no - open);

  return (
    <div className="card">
      <div className="card__hd">
        <h2 className="card__t">This week · so far</h2>
        <span className="card__acts">
          <Link className="btn btn--sm btn--ghost" href="/reports">
            <Send size={14} />
            Reports
          </Link>
        </span>
      </div>
      <div className="card__b">
        <div className="kv">
          <span className="kv__k">Delivered</span>
          <span className="kv__v">{week.delivered}</span>
        </div>
        <div className="kv">
          <span className="kv__k">No-shows</span>
          <span className={`kv__v${week.noShows > 0 ? ' warn' : ''}`}>{week.noShows}</span>
        </div>
        {week.unmarked > 0 && (
          <div className="kv">
            {/*
              "Not marked", never "Running now". These are sessions whose hour has
              passed with no outcome recorded — on real data eleven of them had
              built up over one week, and calling them running claimed the trainer
              was in eleven sessions at once. The `.acc` tone goes with the word:
              this is a small debt to clear, not a live state, so it takes ink
              rather than lime.
            */}
            <span className="kv__k">Not marked</span>
            <span className="kv__v">{week.unmarked}</span>
          </div>
        )}
        <div className="kv">
          <span className="kv__k">Still to come</span>
          <span className="kv__v">{week.stillToCome}</span>
        </div>

        <div className="meter meter--lg mt3" aria-hidden="true">
          <i className="ok" style={{ width: `${ok}%` }} />
          <i className="warn" style={{ width: `${no}%` }} />
          {/* `.open`, not `.dim` — a delta in app.css, added because these two
              segments were adjacent and identical. See the note there. */}
          <i className="open" style={{ width: `${open}%` }} />
          <i className="dim" style={{ width: `${rest}%` }} />
        </div>

        <p className="small mt2">
          {week.scheduled === 0 ? (
            <>Nothing booked this week yet.</>
          ) : week.delivered + week.noShows === 0 ? (
            <>
              <b>
                {week.started} of {week.scheduled}
              </b>{' '}
              have started. Nothing has settled yet, so there is no rate to quote.
            </>
          ) : (
            <>
              <b>
                {week.started} of {week.scheduled}
              </b>{' '}
              have started, and {week.percent}% of what settled was delivered.
              {/*
                The unmarked count sits in neither side of that fraction, so
                leaving it out of the sentence would let "100%" read as a clean
                week when a third of it has no outcome recorded. Stated, with the
                number — §06's rule: explicit beats vague.
              */}
              {week.unmarked > 0 && (
                <>
                  {' '}
                  <b>{week.unmarked}</b> {week.unmarked === 1 ? 'is' : 'are'} still unmarked and
                  counted in neither.
                </>
              )}
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * AUGUST · THE MONTH — all four of `DeckMoney`'s fields, each under its own name.
 *
 * `DeckMoney` and `rupees` are IMPORTED, not restated. This card used to declare
 * the shape inline and keep a private copy of the Indian-grouping formatter — a
 * second place the deck's shape was written down and a third place the rupee's
 * grouping was, both of which `copy.ts` exists to argue against ("a helper that
 * returned it as one string would be the third place that label is written
 * down"). `WeekCard` above already imports `DeckWeek`; this is the same rule.
 *
 * ── THE BUG THIS SHAPE EXISTS TO PREVENT ─────────────────────────────────────
 *
 * The deck this replaces had one card labelled *Billed this month* holding the
 * COLLECTED figure, and derived "Yours" from it. `yours` is `billed − cut`, not
 * `collected − cut`, and the wrong base produced an answer that CLOSED: on the
 * month in question collected happened to equal floor billing, so the two
 * subtractions were the same one. It was out by the whole of the month's remote
 * work — ₹18,000 of ₹75,500, understated, on the figure a trainer uses to decide
 * whether this is working.
 *
 * So: four names, four figures, and the gym's share on its own line with the
 * percentage beside it — because "−₹49,000" without "46% of floor" next to it is a
 * number a trainer cannot check.
 *
 * ── AND THE POSITION IS THE ARGUMENT ─────────────────────────────────────────
 *
 * Fourth in reading order, in the third column of the third row, because
 * `deck.ts` puts money fourth of six: "what's next, where the day stands, who
 * needs chasing, the schedule, the money, what happened." A component was drawn
 * for this once — five month figures on a ruled row across the bottom — and
 * deleted before it shipped. The argument it was built to win, *money is present
 * but not dominant*, is won by POSITION, which costs no CSS.
 */
export function MonthCard({ money }: { money: DeckMoney }) {
  // The percentage the cut represents, computed from the figures rather than read
  // from the trainer's profile: the profile holds today's contract, and these rows
  // hold what was actually stamped on each payment at the time. If they disagree
  // the rows are right — that is the whole reason V11 stores the share per row.
  const sharePercent = money.billed > 0 ? Math.round((100 * money.cut) / money.billed) : 0;

  return (
    <div className="card">
      <div className="card__hd">
        <h2 className="card__t">{money.monthLabel} · the month</h2>
        <span className="card__acts">
          <Link className="btn btn--sm btn--ghost" href="/business">
            Open
            <Chevron size={14} />
          </Link>
        </span>
      </div>
      <div className="card__b">
        <div className="kv">
          <span className="kv__k">Billed</span>
          <span className="kv__v">
            {rupees(money.billed)}{' '}
            {money.trendPercent !== null && (
              <span className="ink3" style={{ fontWeight: 400 }}>
                {money.trendPercent >= 0 ? '+' : '−'}
                {Math.abs(money.trendPercent)}%
              </span>
            )}
          </span>
        </div>
        <div className="kv">
          <span className="kv__k">Collected</span>
          <span className="kv__v">{rupees(money.collected)}</span>
        </div>
        <div className="kv">
          <span className="kv__k">Still owed</span>
          <span className="kv__v" style={{ color: 'var(--tx-danger)' }}>
            {rupees(money.pending)}
          </span>
        </div>
        {/* No gym, no line. A 0% cut and no arrangement at all are different
            facts, and drawing "−₹0 · 0% of floor" claims one the trainer never
            made. `gymName` being null is what says so — see /v1/trainers/me. */}
        {money.cut > 0 && (
          <div className="kv">
            <span className="kv__k">
              The gym’s share <span className="ink3">· {sharePercent}% of billing</span>
            </span>
            <span className="kv__v" style={{ color: 'var(--tx-warn)' }}>
              −{rupees(money.cut)}
            </span>
          </div>
        )}
        <div className="kv">
          <span className="kv__k">
            <b style={{ color: 'var(--tx-ink)' }}>Yours</b>
          </span>
          <span className="kv__v" style={{ color: 'var(--tx-accent-text)' }}>
            {rupees(money.yours)}
          </span>
        </div>
        {money.pending > 0 && (
          <p className="small mt3">
            <b>{clients(money.clientsOwing)}</b> still {money.clientsOwing === 1 ? 'owes' : 'owe'}{' '}
            you {rupees(money.pending)}.
          </p>
        )}
      </div>
    </div>
  );
}
