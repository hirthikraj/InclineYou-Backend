'use client';

import { useState } from 'react';
import Link from 'next/link';

import type { SessionsData, SessionRow } from '@/lib/sessions/api';
import { clockParts, dayStamp, formatSpan, avatarToken, initials } from '@/lib/today/time';
import { TopBar } from '@/components/shell/TopBar';
import { Glyph } from '@/components/shell/Icons';

/* ─────────────────────────────────────────────────────── inline icons ── */

function CheckIcon() {
  return <Glyph size={14} d="M4.5 12.5l5 5 10-11" />;
}

function ClockIcon({ size = 14 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M12 7.5V12l3.5 2" />
      <circle cx="12" cy="12" r="8.5" />
    </Glyph>
  );
}

function FloorIcon({ size = 14 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M4 9v6M7 7.5v9M17 7.5v9M20 9v6M7 12h10" />
    </Glyph>
  );
}

function RemoteIcon({ size = 14 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </Glyph>
  );
}

function LogIcon({ size = 14 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </Glyph>
  );
}

function NoShowIcon({ size = 14 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M5.07 18.93A9 9 0 1 1 18.93 5.07M2 2l20 20" />
    </Glyph>
  );
}

/* ───────────────────────────────────────────────── session card ── */

function SessionCard({ row }: { row: SessionRow }) {
  const { time, meridiem } = clockParts(row.scheduledAt);
  const stamp = dayStamp(row.scheduledAt);
  const duration = formatSpan(row.minutes);
  const isNoShow = row.status === 'no_show' || row.status === 'noshow';
  const isDone = row.status === 'done' || row.status === 'completed';
  const token = avatarToken(row.clientId);

  /* Every row goes to its own session. An upcoming row went to `/schedule`
     while `/sessions/:id` had nothing to say about a session that had not
     happened — it now leads with the prescription, which is the thing a trainer
     opening tomorrow's row is after. */
  const href = `/sessions/${row.id}`;

  return (
    <Link
      href={href}
      className={`srow${isDone ? ' srow--done' : ''}${isNoShow ? ' srow--noshow' : ''}`}
      aria-label={`${row.clientName} · ${stamp} · ${time} ${meridiem} · ${isDone ? 'Done' : isNoShow ? 'No-show' : 'Scheduled'}`}
    >
      <span className={`av av--sm`} style={{ background: `var(--tx-av-${token})` }}>
        {initials(row.clientName)}
      </span>

      <span className="srow__body">
        <span className="srow__name">{row.clientName}</span>
        {row.programName && (
          <span className="srow__plan">{row.dayLabel ?? row.programName}</span>
        )}
      </span>

      <span className="srow__meta">
        <span className="srow__time">
          {time} <span className="ink3">{meridiem}</span>
        </span>
        <span className="srow__dur">{duration}</span>
      </span>

      <span className="srow__tags">
        {row.mode === 'remote' ? (
          <span className="srow__tag srow__tag--remote" aria-label="Remote">
            <RemoteIcon size={12} />
          </span>
        ) : (
          <span className="srow__tag srow__tag--floor" aria-label="Floor">
            <FloorIcon size={12} />
          </span>
        )}

        {isDone && row.hasLog && (
          <span className="srow__tag srow__tag--log" aria-label="Workout logged">
            <LogIcon size={12} />
          </span>
        )}
      </span>

      <span className="srow__state">
        {isDone && <CheckIcon />}
        {isNoShow && <NoShowIcon size={14} />}
      </span>
    </Link>
  );
}

/* ──────────────────────────────────────── date group header ── */

function dateGroupKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function DateGroupHeader({ at }: { at: number }) {
  const d = new Date(at);
  const day = d.getDate();
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return (
    <p className="slist__date" aria-hidden="true">
      {weekdays[d.getDay()]} · {day} {months[d.getMonth()]}
    </p>
  );
}

/* ─────────────────────────────────────────────── sessions list ── */

function SessionsList({ rows, emptyText }: { rows: SessionRow[]; emptyText: string }) {
  if (rows.length === 0) {
    return (
      <div className="slist__empty">
        <ClockIcon size={32} />
        <p>{emptyText}</p>
      </div>
    );
  }

  /* Group by calendar date. */
  const groups: { key: string; at: number; rows: SessionRow[] }[] = [];
  for (const row of rows) {
    const key = dateGroupKey(row.scheduledAt);
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.rows.push(row);
    } else {
      groups.push({ key, at: row.scheduledAt, rows: [row] });
    }
  }

  return (
    <div className="slist">
      {groups.map((g) => (
        <div key={g.key} className="slist__group">
          <DateGroupHeader at={g.at} />
          {g.rows.map((r) => (
            <SessionCard key={r.id} row={r} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────── main component ── */

export function Sessions({ data }: { data: SessionsData }) {
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  return (
    <>
      <TopBar crumb="Sessions" onSearch={() => {}} />
      <main className="main">
        <div className="ph">
          <div className="ph__row">
            <div>
              <h1 className="ph__t">Sessions</h1>
              <p className="ph__sub">
                {data.upcoming.length} upcoming ·{' '}
                {data.past.length} in history
              </p>
            </div>
            {/* The console's front door. Frame 5a asks one question — who is
                this for — and its third group needs no booking at all, which is
                why this is a peer of the diary rather than something reached
                through it. */}
            <div className="ph__acts">
              <Link className="btn btn--primary" href="/sessions/new">Log a workout</Link>
            </div>
          </div>
        </div>

        <div className="body">
          {/* Tab strip */}
          <div className="tabs2" role="tablist" aria-label="Sessions view">
            <button
              className={`tabs2__i${tab === 'upcoming' ? ' tabs2__i--sel' : ''}`}
              type="button"
              role="tab"
              aria-selected={tab === 'upcoming'}
              onClick={() => setTab('upcoming')}
            >
              Upcoming
              {data.upcoming.length > 0 && (
                <span className="tabs2__n">{data.upcoming.length}</span>
              )}
            </button>
            <button
              className={`tabs2__i${tab === 'past' ? ' tabs2__i--sel' : ''}`}
              type="button"
              role="tab"
              aria-selected={tab === 'past'}
              onClick={() => setTab('past')}
            >
              Past sessions
            </button>
          </div>

          {/* Content */}
          <div className="sessions__panel" role="tabpanel">
            {tab === 'upcoming' ? (
              <SessionsList
                rows={data.upcoming}
                emptyText="No upcoming sessions. Book one from the schedule."
              />
            ) : (
              <SessionsList
                rows={data.past}
                emptyText="No past sessions in the last 90 days."
              />
            )}
          </div>
        </div>
      </main>

    </>
  );
}
