import Link from 'next/link';
import type { ReactNode } from 'react';

import { Check } from '@/components/shell/Icons';

/**
 * THE REST OF THE DAY, AS ONE RULED LIST.
 *
 * What it replaces: `.slist` drew each session as its own bordered card with a
 * 7px gap between them, which cost 68px a row and put nine boxes on the screen
 * to say one thing. Nine rows was 612px of the 586px content window — the
 * second block on the page did not fit in the viewport by itself.
 *
 * Here it is a single list with one hairline between rows at 48px each: 432px
 * for the same nine sessions, 180px back, and the rows read as one sequence
 * rather than nine objects.
 *
 * ── THE TIME GUTTER ─────────────────────────────────────────────────────────
 *
 * Mono and tabular in a fixed 58px track, so every colon lands on the same x
 * and the column can be read down as a column. The meridiem is set beside the
 * hour at micro size rather than under it: `6:00 AM` is one value and the first
 * drawing broke it across two lines to save 14px of width it had 1,200px of.
 *
 * ── A DELIVERED SESSION STEPS BACK, IT DOES NOT LEAVE ───────────────────────
 *
 * `done` drops the name to `--tx-ink-3` and the weight to 500, and puts the
 * tick in the state slot. It stays legible because it is still part of the
 * day's tally — "7 of 9 done" is the figure at the foot of the page, and a
 * trainer checking it wants to see WHICH seven.
 */
export function Agenda({ children }: { children: ReactNode }) {
  return <div className="agn">{children}</div>;
}

export function AgendaRow({
  href,
  time,
  meridiem,
  avatar,
  name,
  detail,
  /** `now` draws the accent spine. It is the running session, and it is the one
      row that is not merely scheduled. */
  state = 'idle',
  /** The mode tag, or whatever the caller wants in the row's last slot. On a
      delivered row the tick replaces it: there is one slot and "delivered"
      outranks "in person" in it. */
  trailing,
  className,
}: {
  href: string;
  time: string;
  meridiem: string;
  avatar?: ReactNode;
  name: string;
  detail: string;
  state?: 'now' | 'next' | 'done' | 'idle';
  trailing?: ReactNode;
  className?: string;
}) {
  const cls = [
    'agn__r',
    state === 'done' ? 'agn__r--done' : null,
    state === 'now' ? 'agn__r--now' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Link className={cls} href={href}>
      <span className="agn__w">
        {time}
        <em>{meridiem}</em>
      </span>
      {/* The grid has a fixed 26px track here, so the slot is held even when a
          row has no avatar — otherwise one avatar-less row shifts its name
          26px left of every other row's. */}
      {avatar ?? <span aria-hidden="true" />}
      <span style={{ minWidth: 0 }}>
        <span className="agn__n">{name}</span>
        <span className="agn__d">{detail}</span>
      </span>
      <span className="agn__s">
        {state === 'done' ? (
          <span aria-label="Delivered" title="Delivered">
            <Check size={14} />
          </span>
        ) : (
          trailing
        )}
      </span>
    </Link>
  );
}
