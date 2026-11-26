import Link from 'next/link';
import type { ReactNode } from 'react';

import { Check } from '@/components/shell/Icons';

/**
 * THE DAY, AS ONE RULED LIST — and since 26 Nov 2026, a list you can ANSWER.
 *
 * What it replaced first: `.slist` drew each session as its own bordered card
 * with a 7px gap between them, 68px a row and nine boxes to say one thing. This
 * is one list with a hairline between rows, and the rows read as one sequence.
 *
 * ── THE REVAMP (26 Nov 2026): A ROW HOLDS ITS OWN ANSWER ────────────────────
 *
 * The reference the Today revamp was drawn from puts *Done* and *No-show* on the
 * row of every session that has happened and is not marked. That is a better
 * screen than the one it replaced, which listed the rest of the day as links
 * and sent a trainer to another page through one *Log today's 4 sessions*
 * button to answer them. A pack only moves on a mark, so the answer belongs on
 * the row the trainer is already reading.
 *
 * A whole-row `<Link>` cannot hold a button (interactive content inside an
 * anchor is invalid, and the browser hoists it out). So the row is a `<div>`
 * and the NAME is the link, stretched over the row by `.agn__lk::after` — the
 * click target is still the whole row, while `actions` sit above the stretch
 * (`position:relative; z-index:1`) and take their own presses. Middle-click,
 * the status bar and ⌘-click all still see one real anchor.
 *
 * ── THE TIME GUTTER IS OPTIONAL NOW ─────────────────────────────────────────
 *
 * `Unmarked from last week` is the same row with a different first column: a
 * past session is identified by the person, and its date is a fact ABOUT it,
 * drawn as `meta`. Leaving `time` out drops the gutter and puts the avatar
 * first, which is the reference's own shape for that card. One row, two
 * callers — not a second list component (the catalogue's rule).
 *
 * ── A DELIVERED SESSION STEPS BACK, IT DOES NOT LEAVE ───────────────────────
 *
 * `done` drops the name to `--tx-ink-3` and puts the tick in the actions slot.
 * It stays legible because it is still part of the day's tally.
 */
export function Agenda({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="agn" role="list" aria-label={label}>
      {children}
    </div>
  );
}

export function AgendaRow({
  href,
  time,
  meridiem,
  avatar,
  name,
  detail,
  /** `now` draws the accent spine — the running session, the one row that is
      not merely scheduled. */
  state = 'idle',
  /** Tags set beside the detail line (mode, trial, free). On a phone they wrap
      under it; they never travel to the far edge of the row away from the
      session they describe, which is what the reference's lone *In person* did. */
  trailing,
  /** A fact about the row drawn as its own column at a desk — the date of a
      past session. Mono, so a column of dates reads down as a column. */
  meta,
  /** Answers on the row (Done · No-show) or a receipt in their place. Drawn
      above the stretched link so they take their own presses. On a delivered
      row with no actions given, the tick is drawn here. */
  actions,
  className,
}: {
  href: string;
  time?: string;
  meridiem?: string;
  avatar?: ReactNode;
  name: string;
  detail?: ReactNode;
  state?: 'now' | 'next' | 'done' | 'idle';
  trailing?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const cls = [
    'agn__r',
    time === undefined ? 'agn__r--notime' : null,
    meta !== undefined ? 'agn__r--meta' : null,
    state === 'done' ? 'agn__r--done' : null,
    state === 'now' ? 'agn__r--now' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} role="listitem">
      {time !== undefined && (
        <span className="agn__w">
          {time}
          {meridiem && <em>{meridiem}</em>}
        </span>
      )}
      {/* The track is fixed, so the slot is held even when a row has no avatar —
          otherwise one avatar-less row shifts its name left of every other. */}
      {avatar ?? <span aria-hidden="true" />}
      <span className="agn__m">
        <Link className="agn__lk" href={href}>
          <span className="agn__n">{name}</span>
        </Link>
        {(detail || trailing) && (
          <span className="agn__d">
            {detail && <span className="agn__dt">{detail}</span>}
            {trailing && <span className="agn__tg">{trailing}</span>}
          </span>
        )}
      </span>
      {meta !== undefined && <span className="agn__meta">{meta}</span>}
      <span className="agn__s">
        {actions ??
          (state === 'done' ? (
            <span className="agn__tick" aria-label="Delivered" title="Delivered">
              <Check size={14} />
            </span>
          ) : null)}
      </span>
    </div>
  );
}

/**
 * A DAY HEADING INSIDE THE LIST (revamp review, 26 Nov 2026).
 *
 * *Unmarked from last week* printed *Mon 23 Nov* on six rows in a row. A
 * trainer remembers a past week by DAY — "Monday everyone came" — so the date
 * is said once, as a heading, with the day's own verb beside it (*Mark the day
 * done*), and the rows under it carry only their times. It is an item of the
 * same list rather than a nested list, so the rows stay one sequence for a
 * reader and the heading is read in order, where it belongs.
 */
export function AgendaDay({
  title,
  aside,
  action,
}: {
  title: string;
  /** The count beside the title (*6 sessions*). */
  aside?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="agn__day" role="listitem">
      <span className="agn__day-t">{title}</span>
      {aside && <span className="agn__day-a">{aside}</span>}
      {action && <span className="agn__day-x">{action}</span>}
    </div>
  );
}
