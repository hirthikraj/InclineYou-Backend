'use client';

import { useMemo, useState } from 'react';

import type { ClientWire, ScheduleEntryPayload } from '@/lib/programs/api';
import { WEEKDAYS } from '@/lib/programs/blueprint';
import { CloseIcon, SearchIcon } from './Icons';

/**
 * ASSIGN — where an ordinal slot becomes a real Tuesday.
 *
 * The design set files this as *still open · 02*: "the step where Day 1 becomes
 * Monday 6:00 am … it has no drawing on the web yet. The app spends 597 lines on
 * it." So this frame is argued rather than copied, and it is built around the
 * one rule the server will not bend on.
 *
 * ── A TEMPLATE'S DAYS ARE ORDINAL. THE WEEKDAY IS THIS CLIENT'S ──────────────
 *
 * "Day 1" is the first day this program trains, not Monday — which is why the
 * builder has no Rest column and why a template that claimed Wednesday would be
 * claiming something it cannot know. The mapping is made **here**, once, per
 * client, and it is stored on their copy in `program.schedule`.
 *
 * `TemplateService.validateSchedule` enforces the count match: exactly one
 * weekday per slot, each weekday distinct, each time a well-formed HH:mm. This
 * form is built so that cannot be got wrong — one row per slot, a weekday
 * already taken is refused in the picker, and the button says what is missing
 * rather than going grey and silent. The server's sentence is still what a
 * trainer reads if the two ever disagree.
 *
 * ── AND WHAT IT PRODUCES IS A COPY ───────────────────────────────────────────
 *
 * `apply` writes an independent `program` with its own `program_exercise` rows.
 * Editing the blueprint afterwards changes the blueprint. That is the whole
 * reason `template` and `program` are two tables, and the panel says it in
 * words, because a trainer about to assign a program to their ninth client is
 * exactly the person who needs to know that editing it later is safe.
 */
export function AssignPanel({
  templateName,
  days,
  dayLabels,
  clients,
  onClose,
  onAssign,
  busy,
  error,
}: {
  templateName: string;
  /** The template's ordinal slots, in order. */
  days: number[];
  dayLabels: Record<string, string>;
  clients: ClientWire[];
  onClose: () => void;
  onAssign: (input: {
    clientId: string;
    startDate: number | null;
    schedule: ScheduleEntryPayload[];
  }) => void;
  busy: boolean;
  error: string | null;
}) {
  const [query, setQuery] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));

  /* Seeded at 06:00 on the pattern a trainer would have typed — see PATTERNS
     at the foot of this file. A seed they change, rather than a blank grid they
     have to fill three times. */
  const [slots, setSlots] = useState<Record<number, { weekday: number; time: string }>>(() =>
    seedSchedule(days),
  );

  const active = useMemo(
    () => clients.filter(c => (c.status ?? 'active') !== 'inactive'),
    [clients],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? active.filter(c => c.name.toLowerCase().includes(q)) : active;
  }, [active, query]);

  const client = clients.find(c => c.id === clientId) ?? null;
  const taken = new Set(Object.values(slots).map(s => s.weekday));

  const missing = days.filter(d => !slots[d]?.time);
  const ready = Boolean(clientId) && missing.length === 0 && days.length > 0;

  return (
    <aside className="pg__panel" aria-label={`Assign ${templateName}`}>
      <header className="pg__panelhd">
        <div>
          <p className="pg__panelt">Assign {templateName}</p>
          <p className="small">
            {days.length} day{days.length === 1 ? '' : 's'} a week to place
          </p>
        </div>
        <button className="btn btn--icon btn--ghost" type="button" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>

      <div className="pg__panelb">
        <section className="card">
          <div className="card__hd">
            <span className="card__t">Who</span>
          </div>
          <div className="card__b">
            {client ? (
              <p className="kv">
                <span className="kv__v">{client.name}</span>
                <button
                  className="btn btn--sm btn--ghost"
                  type="button"
                  onClick={() => setClientId(null)}
                >
                  Change
                </button>
              </p>
            ) : (
              <>
                <label className="search">
                  <SearchIcon />
                  <input
                    type="search"
                    value={query}
                    placeholder="Find a client"
                    aria-label="Find a client"
                    onChange={e => setQuery(e.target.value)}
                  />
                </label>
                <div className="pg__picklist">
                  {matches.length === 0 ? (
                    <p className="small">Nobody matches.</p>
                  ) : (
                    matches.slice(0, 30).map(c => (
                      <button
                        key={c.id}
                        className="rowpick"
                        type="button"
                        onClick={() => setClientId(c.id)}
                      >
                        <span>{c.name}</span>
                        <span className="small">
                          {c.sessionsPerWeek ? `${c.sessionsPerWeek}× a week` : ''}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card__hd">
            <span className="card__t">When each day lands</span>
          </div>
          <div className="card__b">
            {days.length === 0 ? (
              <p className="small">
                This program has no days laid out yet. Add one before assigning it.
              </p>
            ) : (
              days.map(day => {
                const slot = slots[day];
                return (
                  <div className="pg__slot" key={day}>
                    <span className="pg__slotk">
                      Day {day}
                      {dayLabels[String(day)] && (
                        <i className="pg__slotlbl">{dayLabels[String(day)]}</i>
                      )}
                    </span>
                    <div className="tools">
                      {WEEKDAYS.map((name, i) => {
                        const weekday = i + 1;
                        const mine = slot?.weekday === weekday;
                        return (
                          <button
                            key={weekday}
                            className="chip"
                            type="button"
                            aria-pressed={mine}
                            /* A weekday already spoken for is `aria-disabled`,
                               never `disabled` — the setup flow's rule, and for
                               its reason: a real `disabled` tabs a screen-reader
                               user straight past the choices they were not told
                               about. It is refused and still announced. */
                            aria-disabled={!mine && taken.has(weekday) ? true : undefined}
                            onClick={() => {
                              if (!mine && taken.has(weekday)) return;
                              setSlots(s => ({
                                ...s,
                                [day]: { weekday, time: s[day]?.time ?? '06:00' },
                              }));
                            }}
                          >
                            {name}
                          </button>
                        );
                      })}
                      <input
                        className="ctl pg__slottime"
                        type="time"
                        value={slot?.time ?? ''}
                        aria-label={`Time for day ${day}`}
                        onChange={e =>
                          setSlots(s => ({
                            ...s,
                            [day]: { weekday: s[day]?.weekday ?? 1, time: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>
                );
              })
            )}
            <p className="small pg__gap">
              Each day needs its own weekday — the same one twice would put two sessions on one
              morning, which is why the taken ones are refused.
            </p>
          </div>
        </section>

        <section className="card">
          <div className="card__hd">
            <span className="card__t">From when</span>
          </div>
          <div className="card__b">
            <label className="fld">
              <span className="fld__l">Start date</span>
              <input
                className="ctl"
                type="date"
                value={start}
                onChange={e => setStart(e.target.value)}
              />
            </label>
          </div>
        </section>

        <div className="why">
          <p className="why__k">What this does</p>
          <p>
            {client ? client.name : 'Your client'} gets their <b>own copy</b> of this program. Editing{' '}
            {templateName} afterwards will not touch it — you push a change onto a client only when
            you choose to, from the list of who is on this.
          </p>
        </div>

        {error && (
          <div className="why why--warn">
            <p className="why__k">Not assigned</p>
            <p>{error}</p>
          </div>
        )}
      </div>

      <footer className="pg__panelft">
        <button className="btn btn--secondary" type="button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          className="btn btn--primary"
          type="button"
          disabled={!ready || busy}
          onClick={() =>
            onAssign({
              clientId: clientId!,
              startDate: start ? new Date(`${start}T00:00:00`).getTime() : null,
              schedule: days.map(day => ({
                day,
                weekday: slots[day].weekday,
                time: slots[day].time,
              })),
            })
          }
        >
          {/* The button says what is missing rather than going grey and silent —
              a disabled primary with no explanation is the commonest dead end in
              a form this shape. */}
          {busy
            ? 'Assigning…'
            : !clientId
              ? 'Choose a client'
              : missing.length > 0
                ? `Give Day ${missing[0]} a time`
                : `Assign to ${client?.name}`}
        </button>
      </footer>
    </aside>
  );
}

function seedSchedule(days: number[]): Record<number, { weekday: number; time: string }> {
  const spread = days.length <= 1 ? [1] : spreadWeekdays(days.length);
  const out: Record<number, { weekday: number; time: string }> = {};
  days.forEach((day, i) => {
    out[day] = { weekday: spread[i] ?? ((i % 7) + 1), time: '06:00' };
  });
  return out;
}

/**
 * The pattern a trainer would have typed, so the form opens already right most
 * of the time.
 *
 * A TABLE, not arithmetic. The first version spread the days evenly across the
 * seven and rounded — which for three days gives **Mon / Thu / Sun**, and the
 * comment above it claimed Mon/Wed/Fri. Found by rendering, and the comment was
 * the half that was right: three days a week is Mon/Wed/Fri, four is
 * Mon/Tue/Thu/Fri, and neither is what an even spread produces. Six days rests
 * Sunday rather than Wednesday, for the same reason.
 *
 * It is a seed and not a rule — every chip is one click from changing it.
 */
const PATTERNS: Record<number, number[]> = {
  1: [1],
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5, 6],
  7: [1, 2, 3, 4, 5, 6, 7],
};

function spreadWeekdays(count: number): number[] {
  return PATTERNS[Math.min(7, Math.max(1, count))] ?? [1];
}
