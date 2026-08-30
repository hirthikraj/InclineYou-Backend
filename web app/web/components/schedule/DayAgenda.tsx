'use client';

import { DAY_MS, formatMinute, minuteOfDay, startOfDay } from '@/lib/today/time';
import { gridStart } from '@/lib/schedule/view';
import type { ScheduleGrid, Placed } from '@/lib/schedule/grid';
import type { Gap } from '@/lib/today/day';

/** 0 = Monday … 6 = Sunday — matches `working_hours.weekday` convention. */
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Stable avatar hue from a client name — cycles through 12 color tokens. */
function avIndex(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return (h % 12) + 1;
}

/** Up to two initials from a display name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

interface DayAgendaProps {
  grid: ScheduleGrid;
  anchor: number;
  now: number;
  placing: boolean;
  justMovedId: string | null;
  onOpenSession: (id: string) => void;
  onBook: (dayAt: number, minute: number) => void;
  onGoToDay: (at: number) => void;
}

type Item =
  | { kind: 'ses'; placed: Placed; sortKey: number }
  | { kind: 'gap'; gap: Gap; sortKey: number }
  | { kind: 'now'; minute: number; sortKey: number };

/**
 * THE MOBILE DAY — AN AGENDA, NOT AN HOUR GRID.
 *
 * The time grid (TimeGrid.tsx) is pixel-accurate: one minute is one scaled
 * pixel, and a 90-minute session is visually three times a 30-minute one.
 * On a 390px phone that accuracy is also the problem — the grid forces two
 * axes of scroll and positions blocks at sub-pixel precisions that become
 * invisible with the context lane dropped.
 *
 * The agenda answers a different question: WHO at WHAT TIME, with dead time
 * collapsed to a single bar that names the gap and offers to fill it. Exact
 * duration is in the session panel one tap away. Shape is what the agenda
 * is for; position is what the time grid is for.
 *
 * Rendered at all widths. CSS (`app.css`, `.dag`) hides it above 900px where
 * the time grid picks up. `.sch__tg` wraps the time grid and is hidden at
 * ≤900px so both components are always mounted and there is no flash on resize.
 */
export function DayAgenda({
  grid,
  anchor,
  now,
  placing,
  justMovedId,
  onOpenSession,
  onBook,
  onGoToDay,
}: DayAgendaProps) {
  const day = grid.days[0];
  if (!day) return null;

  const nowMinute = minuteOfDay(now);
  const today = startOfDay(now);

  /* ── seven-day strip for the week containing the anchor ── */
  const weekStart = gridStart('week', anchor);
  const strip = Array.from({ length: 7 }, (_, i) => {
    const at = weekStart + i * DAY_MS;
    return {
      at,
      weekday: i,
      dayOfMonth: new Date(at).getDate(),
      isToday: at === today,
      isSelected: at === day.at,
      isPast: at < today,
    };
  });

  /* ── build the interleaved agenda list ── */
  const isEmpty = day.placed.length === 0 && day.gaps.length === 0;

  const items: Item[] = isEmpty
    ? []
    : [
        ...day.placed.map(
          (p) => ({ kind: 'ses' as const, placed: p, sortKey: p.startMinute }),
        ),
        ...day.gaps.map(
          (g) => ({ kind: 'gap' as const, gap: g, sortKey: g.startMinute }),
        ),
        ...(day.isToday
          ? [{ kind: 'now' as const, minute: nowMinute, sortKey: nowMinute - 0.5 }]
          : []),
      ].sort((a, b) => a.sortKey - b.sortKey);

  return (
    <div className="dag">
      {/* ── week strip ── */}
      <div className="dag__strip" role="tablist" aria-label="Days this week">
        {strip.map((d) => (
          <button
            key={d.at}
            type="button"
            className="dag__d"
            role="tab"
            aria-selected={d.isSelected}
            data-today={d.isToday || undefined}
            data-past={d.isPast || undefined}
            onClick={() => onGoToDay(d.at)}
            aria-label={`${DAY_SHORT[d.weekday]} ${d.dayOfMonth}${d.isToday ? ', today' : ''}${d.isSelected ? ', selected' : ''}`}
          >
            <span>{DAY_SHORT[d.weekday]}</span>
            <b>{d.dayOfMonth}</b>
          </button>
        ))}
      </div>

      {/* ── agenda or empty ── */}
      {isEmpty ? (
        <div className="dag__empty">
          <p>Nothing booked</p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => onBook(day.at, 9 * 60)}
          >
            New session
          </button>
        </div>
      ) : (
        <div className="dag__agenda">
          {items.map((item) => {
            /* ── now line ── */
            if (item.kind === 'now') {
              return (
                <div key="now" className="dag__now" aria-hidden="true">
                  <b>{formatMinute(item.minute)}</b>
                  <s />
                </div>
              );
            }

            /* ── gap bar ── */
            if (item.kind === 'gap') {
              const { gap } = item;
              const h = Math.round(gap.minutes / 60);
              const label = `${h > 0 ? `${h}h` : `${gap.minutes}m`} free · ${formatMinute(gap.startMinute)} – ${formatMinute(gap.endMinute)}`;
              return (
                <div key={`g${gap.startMinute}`} className="dag__row">
                  <button
                    type="button"
                    className="dag__gap"
                    onClick={() => onBook(day.at, gap.startMinute)}
                    aria-label={`${label}. Tap to book.`}
                  >
                    <b>{h > 0 ? `${h}h` : `${gap.minutes}m`}</b>
                    <span>{`free · ${formatMinute(gap.startMinute)} – ${formatMinute(gap.endMinute)}`}</span>
                    <em>Book</em>
                  </button>
                </div>
              );
            }

            /* ── session card ── */
            const { placed } = item;
            const { session } = placed;
            const isNow =
              day.isToday &&
              placed.startMinute <= nowMinute &&
              nowMinute < placed.endMinute;

            let status: string | undefined;
            if (session.done) status = 'done';
            else if (session.noShow) status = 'noshow';

            return (
              <div key={session.id} className="dag__row">
                <span className="dag__t" aria-hidden="true">
                  {formatMinute(placed.startMinute)}
                </span>
                <button
                  type="button"
                  className={[
                    'dag__ses',
                    isNow ? 'dag__ses--now' : '',
                    session.id === justMovedId ? 'dag__ses--moved' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-status={status}
                  onClick={() => onOpenSession(session.id)}
                  disabled={placing}
                  aria-label={[
                    session.clientName,
                    formatMinute(placed.startMinute),
                    session.mode,
                    status,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                >
                  <span
                    className="dag__av"
                    style={{ background: `var(--tx-av-${avIndex(session.clientName)})` }}
                    aria-hidden="true"
                  >
                    {initials(session.clientName)}
                  </span>
                  <span className="dag__main">
                    <b>{session.clientName}</b>
                    <span>{session.programName ?? `${session.minutes} min`}</span>
                  </span>
                  <span className={`dag__tag dag__tag--${session.mode}`} aria-hidden="true">
                    {session.mode === 'remote' ? 'Remote' : 'Floor'}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
