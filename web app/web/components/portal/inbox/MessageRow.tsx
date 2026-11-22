'use client';

import Link from 'next/link';
import { useId, useState } from 'react';

import { markMessageRead } from '@/lib/portal/inbox-actions';
import { ClampText } from '@/web-components/ui/ClampText';
import { Tag } from '@/web-components/ui/Tag';

/* What the message IS (22 Nov 2026). It read *Weekly note from Hirthikraj* on every row under a heading that already
   says *From Hirthikraj*, so the name was nine copies of the screen's title and the rows told the client nothing
   about which was which. */
const KIND: Record<string, string> = { note: 'A note', recap: 'About a session', weekly: 'Weekly note' };

/**
 * One message (22 Nov 2026, second pass). The text is a `ClampText`: one line that opens to the whole message, and
 * only when the message is longer than its line — a short one is shown whole, with no chevron and nothing to press,
 * and counts as read the moment it is shown. Where it does open, the header is the `aria-expanded` button (keyboard,
 * screen reader) and the whole row is the pointer target, so a thumb anywhere on it works. *See that session* is always
 * on the row, outside the text, so it neither hides behind the clamp nor makes a fitting message look longer.
 */
export function MessageRow({ m }: { m: { id: string; kind: string; body: string; at: number; readAt: number | null; sessionId: string | null; trainerName: string } }) {
  const [read, setRead] = useState(m.readAt !== null);
  const [open, setOpen] = useState(false);
  const [fits, setFits] = useState<boolean | null>(null);
  const id = useId();
  const expandable = fits === false;

  function markRead() {
    if (read) return;
    setRead(true);
    void markMessageRead(m.id).then((ok) => { if (!ok) setRead(false); });
  }

  function toggle() {
    if (!expandable) return;
    if (!open) markRead();
    setOpen((o) => !o);
  }

  function onFits(next: boolean) {
    setFits(next);
    if (next) markRead();
  }

  const title = KIND[m.kind] ?? 'A note';
  const date = new Date(m.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

  return (
    <li
      className={`inbm${expandable ? ' inbm--x' : ''}`}
      data-open={open || undefined}
      onClick={(e) => {
        if ((e.target as Element).closest('a,button')) return;
        toggle();
      }}
    >
      <div className="inbm__hd">
        {expandable ? (
          <button type="button" className="inbm__btn" aria-expanded={open} aria-controls={id} onClick={toggle}>
            {title}
          </button>
        ) : (
          <span className="inbm__t">{title}</span>
        )}
        <span className="inbm__meta">
          {!read && <Tag tone="info">New</Tag>}
          <span className="inbm__d">{date}</span>
          {expandable && <span className="inbm__chev" aria-hidden="true" />}
        </span>
      </div>
      <ClampText id={id} text={m.body} open={open} onFits={onFits} />
      {m.sessionId && (
        <p className="inbm__lk">
          <Link href={`/me/session/${m.sessionId}`}>See that session</Link>
        </p>
      )}
    </li>
  );
}
