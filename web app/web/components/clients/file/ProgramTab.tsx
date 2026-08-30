import Link from 'next/link';

import { Plus } from '@/components/shell/Icons';
import { DAY_MS, startOfWeek } from '@/lib/today/time';
import type { ClientProgramWire, ClientSessionWire } from '@/lib/clients/client-api';

import { ListIcon, Meter, dateStr, isoDateStr } from './shared';

/**
 * PROGRAM — WHAT THEY ARE ON, AND EVERYTHING THEY HAVE BEEN ON.
 *
 * Singular now. It was *Programs*, which named the timeline rather than the
 * question: a trainer opening this tab wants the plan the client is following
 * today, and the history is the supporting evidence beside it.
 *
 * ── THE GAP IS A ROW ────────────────────────────────────────────────────────
 *
 * A client who trained for six weeks before anyone wrote them a plan has a real
 * period with no program in it, and a timeline that skips it implies a plan that
 * was never there. So it gets its own row, drawn quiet — the design's frame 3d,
 * "including the gap".
 */

function weekOf(p: ClientProgramWire, now: number): { current: number; total: number | null } | null {
  if (!p.startDate) return null;
  const startMs = new Date(p.startDate).getTime();
  if (startMs > now) return null;
  const current = Math.max(1, Math.floor((now - startMs) / (7 * DAY_MS)) + 1);
  let total: number | null = null;
  if (p.endDate) {
    const endMs = new Date(p.endDate).getTime();
    total = Math.max(1, Math.round((endMs - startMs) / (7 * DAY_MS)));
  }
  return { current, total };
}

export function ProgramTab({
  programs,
  sessions,
  client,
  now,
}: {
  programs: ClientProgramWire[];
  sessions: ClientSessionWire[];
  client: { createdAt: number };
  now: number;
}) {
  const sorted = [...programs].sort((a, b) => b.createdAt - a.createdAt);
  const active = sorted.find((p) => p.status === 'active') ?? null;

  const weekStart = startOfWeek(now);
  const thisWeek = active
    ? sessions.filter(
        (s) =>
          s.scheduledAt >= weekStart &&
          s.scheduledAt < weekStart + 7 * DAY_MS &&
          s.programId === active.id,
      )
    : [];
  const logged = thisWeek.filter((s) => s.status === 'done').length;
  const planned = thisWeek.filter((s) => s.status !== 'cancelled').length;
  const dayLabels = [
    ...new Set(thisWeek.filter((s) => s.dayLabel).map((s) => s.dayLabel as string)),
  ].join(', ');

  const firstStart = sorted.length > 0 ? sorted[sorted.length - 1].startDate : null;
  const showGap = firstStart && new Date(firstStart).getTime() > client.createdAt + 3 * DAY_MS;

  const week = active ? weekOf(active, now) : null;

  return (
    <div
      className="cfgrid"
      style={{
        display: 'grid',
        gap: 12,
        alignItems: 'start',
        gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1fr)',
      }}
    >
      {active ? (
        <div className="card">
          <div className="card__hd">
            <p className="card__t">{active.name}</p>
            <span className="tag tag--acc">Live</span>
          </div>
          <div className="card__b">
            {active.startDate && <p className="small">Assigned {isoDateStr(active.startDate)}</p>}
            {week && (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
                  <p
                    style={{
                      fontFamily: 'var(--tx-brand)',
                      fontWeight: 800,
                      fontSize: 32,
                      letterSpacing: '-.03em',
                      lineHeight: 1,
                    }}
                  >
                    Week {week.current}
                  </p>
                  {week.total && <p className="small">of {week.total}</p>}
                </div>
                {week.total && (
                  <Meter pct={Math.round((week.current / week.total) * 100)} />
                )}
              </>
            )}
            <div style={{ marginTop: 16, borderTop: '1px solid var(--tx-line)', paddingTop: 6 }}>
              {active.goal && (
                <div className="kv">
                  <span className="kv__k">Goal</span>
                  <span className="kv__v">{active.goal}</span>
                </div>
              )}
              {dayLabels && (
                <div className="kv">
                  <span className="kv__k">This week</span>
                  <span className="kv__v">{dayLabels}</span>
                </div>
              )}
              {planned > 0 && (
                <div className="kv">
                  <span className="kv__k">Logged</span>
                  <span className="kv__v">
                    {logged} of {planned} days
                  </span>
                </div>
              )}
              {active.endDate && (
                <div className="kv">
                  <span className="kv__k">Ends</span>
                  <span className="kv__v">{isoDateStr(active.endDate)}</span>
                </div>
              )}
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              <Link className="btn btn--secondary" href="/programs">
                <ListIcon />
                Open the plan
              </Link>
              <Link className="btn btn--secondary" href="/programs">
                Assign another
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card__b">
            <p className="small" style={{ color: 'var(--tx-ink-3)' }}>
              No program assigned. Sessions can still be logged — they just will not
              be measured against a plan.
            </p>
            <div style={{ marginTop: 12 }}>
              <Link className="btn btn--primary" href="/programs">
                <Plus size={15} />
                Assign a program
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card__hd">
          <p className="card__t">Every program, newest first</p>
        </div>
        <div className="card__b">
          {sorted.length === 0 && !showGap ? (
            <p className="small" style={{ color: 'var(--tx-ink-3)' }}>
              Nothing assigned yet
            </p>
          ) : (
            <div className="tl">
              {sorted.map((p, i) => {
                const w = weekOf(p, now);
                const isLive = p.status === 'active';
                return (
                  <div key={p.id} className={`tl__i${isLive ? ' tl__i--acc' : ''}`}>
                    <p className="tl__d">{sorted.length - i}</p>
                    <p className="tl__t">
                      {p.name}
                      {isLive && (
                        <span className="tag tag--acc" style={{ marginLeft: 6 }}>
                          Live
                        </span>
                      )}
                    </p>
                    <p className="tl__b">
                      {p.startDate && isoDateStr(p.startDate)}
                      {p.endDate ? ` – ${isoDateStr(p.endDate)}` : isLive ? ' – now' : ''}
                      {w && ` · week ${w.current}${w.total ? ` of ${w.total}` : ''}`}
                    </p>
                  </div>
                );
              })}
              {showGap && (
                <div className="tl__i">
                  <p className="tl__d">—</p>
                  <p className="tl__t" style={{ color: 'var(--tx-ink-3)' }}>
                    No program
                  </p>
                  <p className="tl__b">
                    {dateStr(client.createdAt)} –{' '}
                    {firstStart ? isoDateStr(firstStart) : '—'} · sessions logged as you
                    went
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
