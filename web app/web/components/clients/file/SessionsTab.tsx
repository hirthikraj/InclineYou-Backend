'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { ClientSessionWire } from '@/lib/clients/client-api';

import {
  Blank,
  classifySession,
  sessionPackLabel,
  shortDate,
  shortTime,
  type SessionFilter,
} from './shared';

/**
 * SESSIONS — WHAT EACH ONE DID TO THE PACK.
 *
 * The design's frame 3b, and its argument is the `pack −1` / `pack kept` column:
 * a session history that only lists dates makes the trainer do the arithmetic
 * that the disagreement with the client is always about.
 *
 * ── THE WINDOW IS THREE MONTHS AND THE SCREEN SAYS SO ───────────────────────
 *
 * `getClientSessionsWindowed` asks for 90 days back and 28 forward. That is a
 * data-layer decision this tab cannot see and a trainer cannot guess, and a
 * history that silently stops is one a trainer will read as *they trained with
 * me for three months* about somebody who has been with them two years. So the
 * foot states the window. The `workouts` count in the header is unwindowed and
 * is the all-time figure.
 *
 * ── EVERY ROW OPENS ITS SESSION ─────────────────────────────────────────────
 *
 * Only the unmarked rows were reachable before, through a *Mark it* button, so
 * the two hundred rows that were fine were dead text. The whole row is the link
 * now — `role="link"` on the `<tr>` with Enter and Space, the same pattern the
 * roster's rows use in `Clients.tsx`, because a `<tr>` cannot contain an `<a>`
 * that covers it and six per-cell links would be six tab stops a row.
 *
 * *Mark it* survives as the action cell's own link. It points at the same place
 * the row does, and stops the click bubbling so the row does not push the route
 * a second time on top of it.
 */

const FILTERS: { key: SessionFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'done', label: 'Done' },
  { key: 'no_show', label: 'No-show' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'booked', label: 'Booked' },
  { key: 'not_marked', label: 'Not marked' },
];

function statusTag(cls: SessionFilter) {
  if (cls === 'done') return <span className="tag tag--ok">Done</span>;
  if (cls === 'no_show') return <span className="tag tag--danger">No-show</span>;
  if (cls === 'cancelled') return <span className="tag">Cancelled</span>;
  if (cls === 'booked') return <span className="tag tag--info">Booked</span>;
  return <span className="tag">Not marked</span>;
}

export function SessionsTab({
  sessions,
  now,
}: {
  sessions: ClientSessionWire[];
  now: number;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<SessionFilter>('all');

  const classified = sessions
    .map((s) => ({ ...s, cls: classifySession(s, now) }))
    .sort((a, b) => b.scheduledAt - a.scheduledAt);

  const counts = FILTERS.reduce<Record<SessionFilter, number>>(
    (acc, f) => {
      acc[f.key] = f.key === 'all' ? classified.length : classified.filter((s) => s.cls === f.key).length;
      return acc;
    },
    {} as Record<SessionFilter, number>,
  );

  const visible = filter === 'all' ? classified : classified.filter((s) => s.cls === filter);

  return (
    <>
      <div className="tools" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`chip${f.key === 'not_marked' ? ' chip--ghost' : ''}`}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            style={
              filter === f.key
                ? {
                    background: 'var(--tx-accent-soft)',
                    borderColor: 'var(--tx-accent-line)',
                    color: 'var(--tx-accent-text)',
                  }
                : undefined
            }
          >
            {f.label}
            {counts[f.key] > 0 && <span className="rail__n">{counts[f.key]}</span>}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card__b card__b--flush">
          {visible.length === 0 ? (
            <Blank>No sessions match</Blank>
          ) : (
            <table className="tbl cftbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {visible.map((s) => (
                  <tr
                    key={s.id}
                    className={s.cls === 'no_show' ? 'crit' : undefined}
                    style={{ cursor: 'pointer' }}
                    role="link"
                    tabIndex={0}
                    aria-label={`Open the session on ${shortDate(s.scheduledAt)} at ${shortTime(s.scheduledAt)}`}
                    onClick={() => router.push(`/sessions/${s.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(`/sessions/${s.id}`);
                      }
                    }}
                  >
                    <td className="mono" style={{ width: 88, color: 'var(--tx-ink-3)' }}>
                      {shortDate(s.scheduledAt)}
                    </td>
                    <td className="mono" style={{ width: 56 }}>
                      {shortTime(s.scheduledAt)}
                    </td>
                    <td className="strong">
                      {s.dayLabel ?? s.notes ?? (
                        <span className="ink3">{s.cls === 'no_show' ? "Didn't turn up" : '—'}</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--tx-ink-3)' }}>{sessionPackLabel(s.cls)}</td>
                    <td style={{ width: 110 }}>{statusTag(s.cls)}</td>
                    <td className="act" style={{ width: 120 }}>
                      {s.cls === 'not_marked' && (
                        <Link
                          className="btn btn--secondary btn--sm"
                          href={`/sessions/${s.id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          Mark it
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <p className="small" style={{ marginTop: 10, color: 'var(--tx-ink-3)' }}>
        The last three months and the next four weeks. Older sessions are on the
        record and are not drawn here.
      </p>
    </>
  );
}
