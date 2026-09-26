import type { MeWire } from '@/lib/portal/api';
import type { HistoryOption, PortalHistoryRow } from '@/lib/portal/progress';
import { clockParts, monthName } from '@/lib/today/time';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { InlineLink } from '@/web-components/ui/InlineLink';
import { ListRow, ListRows } from '@/web-components/ui/ListRow';
import { Meter } from '@/web-components/ui/Meter';
import { Stat, Stats } from '@/web-components/ui/Stat';
import { Tag } from '@/web-components/ui/Tag';

import { HistoryFilters } from './HistoryFilters';

/** §2's three taps, read back to the client who gave them. Never a judgement. */
const EFFORT: Record<'easy' | 'right' | 'hard', string> = {
  easy: 'felt easy',
  right: 'felt about right',
  hard: 'felt hard',
};

/**
 * A running total of kilos, at a size a 13px tabular figure can hold.
 *
 * The third declaration of this function — `Home.tsx` and the old `Progress`
 * each had one, and the duplication was excused there as "four lines used by two
 * screens in one folder, worth extracting the day a third caller wants it."
 * **This is the third caller.** It lives here rather than being copied again
 * because a client can read a tonnage on Home and the same tonnage on this tab,
 * and two roundings of one number is the defect `Change` was written to end.
 */
export function formatVolume(kg: number): string {
  if (kg < 1000) return `${Math.round(kg).toLocaleString('en-IN')} kg`;
  const t = kg / 1000;
  return `${(t < 100 ? Math.round(t * 10) / 10 : Math.round(t)).toLocaleString('en-IN')} t`;
}

/**
 * §3 · Progress → **History** — every session, newest first, each one openable.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * TWENTY-ONE ROWS AND THREE OF THE FIVE FACTS WERE THE SAME ON ALL OF THEM
 *
 * The first version listed date, time, exercise count, set count, effort and
 * volume. On a client who trains the same shape every session — which is most
 * of them — that renders as:
 *
 *     Mon · 7 Sep · 7:00 AM    6 exercises · 20 sets · felt about right    5.4 t
 *     Wed · 2 Sep · 7:00 AM    6 exercises · 20 sets · felt about right    9.5 t
 *     Mon · 31 Aug · 7:00 AM   6 exercises · 20 sets · felt about right    5.3 t
 *
 * **`7:00 AM`, `6 exercises` and `20 sets` were identical on all twenty-one
 * rows**, and `.lrow__s` — an 847px track at desk width — was spending all of
 * it saying them. What actually varied was the date and the tonnage. A client
 * scanning this could not tell one session from another, which on a screen
 * whose whole job is *find the day you are thinking of* is the only thing that
 * matters.
 *
 * ── THE FIX IS NOT LAYOUT, IT IS THE THREE FACTS THAT WERE MISSING ──────────
 *
 * Every one of them was already paid for:
 *
 *   · **which session it was** — `dayLabel`, off the bookings this page fetches
 *     for its own clock. `/me/workout/:id` opens with *"Upper B · 57 minutes"*,
 *     so the product knew what each one was and the list of them did not say;
 *   · **how long it took** — `endedAt − startedAt`, on the wire, discarded;
 *   · **whether it was a day something happened** — the milestones, one
 *     `cache()`d read the Summary already makes.
 *
 * ── AND THE BAR IS THE ARC, WHICH IS THE OTHER THING A HISTORY IS FOR ───────
 *
 * The tonnages read 5.4 · 9.5 · 5.3 · 4.6 · 9.3 · 5.4 · 4.2 · 9.3 — **every
 * third session is nearly double**, because every third session is the lower-body
 * day. That is the most interesting pattern in the client's own training and a
 * column of right-ranged figures hides it completely: reading it off requires
 * comparing twenty-one numbers by eye, which nobody does.
 *
 * One bar per row against the biggest session on record, and the rhythm is the
 * first thing you see.
 */
export function ProgressHistory({
  me,
  rows,
  total,
  peak,
  months,
  types,
  month,
  type,
  bookedAt,
}: {
  me: MeWire;
  /** What the filters left. Every figure on the screen is over THESE. */
  rows: PortalHistoryRow[];
  /** How many there are before filtering — so the card can say so. */
  total: number;
  /** The biggest session on record. The bar's scale, and NOT the filter's. */
  peak: number;
  months: HistoryOption[];
  types: HistoryOption[];
  month: string;
  type: string;
  /** workoutId → the booked minute, where there is a booking. */
  bookedAt: Record<string, number>;
}) {
  const first = me.trainer.name.split(' ')[0];

  const filtered = month !== 'all' || type !== 'all';
  const monthLabel = months.find((m) => m.value === month)?.label ?? '';

  if (rows.length === 0) {
    /* ── TWO EMPTIES, AND THEY ARE NOT THE SAME SENTENCE ─────────────────────
       *You have not trained yet* is a fact about the client; *nothing matching
       these two filters* is a fact about two controls they just used, and the
       way out is different for each. Telling somebody who filtered to *Lower A
       in July* that they have not trained is the screen forgetting what it was
       asked — the same distinction `emptyRange` draws on the Summary between
       a narrowed range and an empty account. */
    return (
      <div className="portal col gap4">
        {filtered ? (
          <Card>
            <CardHead
              title={`No ${type === 'all' ? 'workouts' : type} ${
                month === 'all' ? 'on record' : `in ${monthLabel}`
              }`}
            />
            <CardBody>
              <p className="small">
                You trained {total} {total === 1 ? 'time' : 'times'} altogether —
                just not this combination.
              </p>
              <p className="small mt3">
                <InlineLink href="/me/progress/history">Show everything again</InlineLink>
              </p>
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardHead title="No workouts yet" />
            <CardBody>
              <p className="small">
                Every session you log lands here, with what you lifted in it and
                how it compares to the ones before it.
              </p>
              <p className="small mt3">
                <InlineLink href="/me/today">Back to today</InlineLink>
              </p>
            </CardBody>
          </Card>
        )}
      </div>
    );
  }

  /* Grouped in render order — `rows` is already newest-first, so pushing into
     the last group whenever the month changes preserves it without a sort. */
  const groups: { key: string; label: string; rows: PortalHistoryRow[] }[] = [];
  for (const row of rows) {
    const at = new Date(`${row.iso}T00:00:00`).getTime();
    const key = row.iso.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else groups.push({ key, label: `${monthName(at)} ${new Date(at).getFullYear()}`, rows: [row] });
  }

  const totalVolume = rows.reduce((n, r) => n + r.volumeKg, 0);
  const timed = rows.filter((r) => r.minutes !== null);
  const typical =
    timed.length > 0
      ? Math.round(timed.reduce((n, r) => n + (r.minutes ?? 0), 0) / timed.length)
      : null;

  return (
    <div className="portal col gap4">
      <HistoryFilters months={months} types={types} month={month} type={type} />

      {/* ══ the totals ═════════════════════════════════════════════════════
          Tiles rather than the sentence this used to be, for the reason the
          Exercises tab's own count row gives: the two tabs are siblings a
          client moves between in one tap, and an overview drawn as prose on one
          and as figures on the other is two answers to one question.

          *Typical length* is new — see `minutes` — and it is the one figure
          here a client cannot get anywhere else in the product.

          ── AND THERE ARE THREE, NOT FOUR ──────────────────────────────────
          MEASURED at 390px: four tiles wrap to 2×2 and cost **~300px before a
          single workout is on screen**, on the tab named after the workouts.
          Three fit one row at ~110px and the list starts 190px higher.

          *Sets* is the one that went, and it is the right one: `420` and
          `130 t` are two spellings of *how much work* — the second is the one
          with a unit anybody has intuition for — and the per-row `20 sets` is
          still there for a session a client is actually looking at. */}
      <Card level={2}>
        <CardBody>
          <Stats up={typical === null ? 2 : 3} className="phstats">
            {/* The detail says what is being counted, which changes the moment
                a filter is on: *21 · since you started* is a different claim
                from *7 · Lower A*, and a card whose figure moves while its
                caption does not is a card that has stopped being true. */}
            <Stat
              label="Workouts"
              value={String(rows.length)}
              detail={
                filtered
                  ? [type === 'all' ? null : type, month === 'all' ? null : monthLabel]
                      .filter(Boolean)
                      .join(' · ')
                  : 'on record'
              }
            />
            <Stat label="Lifted" value={formatVolume(totalVolume)} detail="altogether" />
            {typical !== null && (
              <Stat label="Typical" value={`${typical} min`} detail="a session" />
            )}
          </Stats>
          <p className="small mt3">
            Open any one to see every set in it.
            {filtered && ` You logged ${total} altogether.`}
          </p>
        </CardBody>
      </Card>

      {groups.map((g) => {
        const mv = g.rows.reduce((n, r) => n + r.volumeKg, 0);
        return (
          <Card key={g.key} className="pgchk">
            <CardHead title={g.label} level={3}>
              {/* The month's own total, because a heading that only counts is a
                  heading doing half a job — and the count is already legible
                  from the rows under it. */}
              <span className="small ink3">
                {g.rows.length} {g.rows.length === 1 ? 'workout' : 'workouts'} ·{' '}
                {formatVolume(mv)}
              </span>
            </CardHead>
            <CardBody flush>
              <ListRows label={`Workouts in ${g.label}`}>
                {g.rows.map((w) => {
                  /* The booked minute where there is one, else when the log was
                     opened — see the page's own note on why those differ. */
                  const at = bookedAt[w.id] ?? w.at;
                  const { time, meridiem } = clockParts(at);
                  return (
                    <ListRow
                      key={w.id}
                      href={`/me/workout/${w.id}`}
                      /* ── THE DATE LEADS AND THE LABEL QUALIFIES IT ──────────
                         Date first because that is how somebody navigates their
                         own history — *the one before I went away* — and the
                         label immediately after because that is what tells two
                         Mondays apart. A `pr` tag rides the same line: it is the
                         one thing on the row worth interrupting the scan for. */
                      title={
                        <>
                          <time dateTime={w.iso}>{w.stamp}</time>
                          {w.dayLabel && (
                            <>
                              {' · '}
                              <span className="ink2">{w.dayLabel}</span>
                            </>
                          )}
                          {w.pr && (
                            <>
                              {' '}
                              <Tag tone="pr">PB</Tag>
                            </>
                          )}
                        </>
                      }
                      /* The count of exercises is gone: it was identical on
                         every row, and the SETS figure already says how much
                         work the session was. What replaced it is the two facts
                         that actually differ — when it started and how long it
                         ran. */
                      sub={[
                        `${time} ${meridiem}`,
                        w.minutes !== null ? `${w.minutes} min` : null,
                        `${w.setCount} ${w.setCount === 1 ? 'set' : 'sets'}`,
                        /* Their own answer, read back. §2 stores it in its own row
                           precisely because it is the client's and not the
                           trainer's, and *felt hard* is a fact about a session
                           rather than a mark against it — which is why there is no
                           tone on it anywhere. */
                        w.effort ? EFFORT[w.effort] : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      right={
                        <>
                          <span className="lrow__n">{formatVolume(w.volumeKg)}</span>
                          {/* ── DECORATIVE, AND DELIBERATELY SO ─────────────
                              `Meter` names itself to a screen reader, and
                              twenty-one of them inside twenty-one links would
                              append *"Volume: ok 57%"* to every row's accessible
                              name — noise, and a second statement of the figure
                              printed directly above it. The bar adds nothing a
                              reader does not already have, so it is hidden from
                              them and kept for the eye. */}
                          <span aria-hidden="true">
                            <Meter
                              className="phvol"
                              label="Session volume"
                              total={peak}
                              /* `acc`, never `ok` — a tonnage is a magnitude, not a verdict.
                                 See `MeterTone`. */
                              segments={[{ tone: 'acc', value: w.volumeKg }]}
                            />
                          </span>
                        </>
                      }
                    />
                  );
                })}
              </ListRows>
            </CardBody>
          </Card>
        );
      })}

      <p className="small">
        Everything you have ever logged is here, whatever the filters are set
        to — and {first} can pull any of it up.{' '}
        {rows.length > 1 && 'Bars compare each session to your biggest.'}
      </p>
    </div>
  );
}
