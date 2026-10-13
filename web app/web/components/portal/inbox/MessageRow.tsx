'use client';

import Link from 'next/link';
import { useState } from 'react';

import { markMessageRead } from '@/lib/portal/inbox-actions';
import { Tag } from '@/web-components/ui/Tag';

const KIND: Record<string, string> = { note: 'A line from', recap: 'About a session —', weekly: 'Weekly note from' };

/** A message. Opening it is what marks it read — Home showing it does not — and the trainer sees that it was read. */
export function MessageRow({ m }: { m: { id: string; kind: string; body: string; at: number; readAt: number | null; sessionId: string | null; trainerName: string } }) {
  const [read, setRead] = useState(m.readAt !== null);
  const first = m.trainerName.split(' ')[0];

  function opened(e: React.SyntheticEvent<HTMLDetailsElement>) {
    if ((e.currentTarget as HTMLDetailsElement).open && !read) {
      setRead(true);
      void markMessageRead(m.id).then((ok) => { if (!ok) setRead(false); });
    }
  }

  return (
    <li>
      <details className="inb" onToggle={opened}>
        <summary className="inb__sum">
          <span className="pl__t">{KIND[m.kind] ?? 'A line from'} {first}</span>
          <span className="pl__tags">
            {!read && <Tag tone="info">New</Tag>}
            <span className="pl__s">{new Date(m.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}</span>
          </span>
        </summary>
        <p className="pl__q">{m.body}</p>
        {m.sessionId && <p className="pl__s"><Link href={`/me/session/${m.sessionId}`}>See that session</Link></p>}
      </details>
    </li>
  );
}
