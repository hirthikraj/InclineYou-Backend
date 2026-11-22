'use client';

/**
 * THE CLIENT'S WEEK, AS ONE PICKER WITH TWO DOORS (22 Nov 2026).
 *
 * The add flow's Week step and the client file's *Their week* editor ask the
 * same two questions — how many days a week, and (optionally) which days at
 * what time — so they draw this one component. It was private to
 * `AddClientFlow`, and the file had no way to set or change a week at all; two
 * copies of a picker is how one answer set ends up with two spellings, which is
 * the rule `CertificationPicker` and `WeekPicker` were extracted under.
 *
 * Days a week is the PROGRAMMING answer — it decides which plans fit (a 3-day
 * full body or a 4-day upper/lower). The days and times are the CALENDAR answer
 * and are optional: a trainer adding somebody on the gym floor often knows
 * "three days, mornings" before the exact slots. So the count is stored on its
 * own (`client_schedule.sessions_per_week`) and never derived from the slots.
 */

import { useState, type ReactNode } from 'react';

import type { WorkingHourWire, ClientScheduleWire } from '@/lib/clients/new-api';
import { formatMinute } from '@/lib/today/time';
import { Chip } from '@/web-components/ui/Chip';
import { Segment, SegmentButton } from '@/web-components/ui/Segment';

/* ─────────────────────────────────────────────────── slot helpers ── */

/**
 * THE ONE PLACE THIS SCREEN CROSSES THE TWO WEEKDAY CONVENTIONS.
 *
 * The chips, and everything this step SAVES, are standing slots — 1 = Monday …
 * 7 = Sunday, which is what `client.weekly_schedule` and `program.schedule` both
 * hold and what `TemplateService.validateSchedule` enforces.
 * `working_hours.weekday` is the other one: 0 = Monday … 6 = Sunday, stated on
 * `WorkingHoursService`'s parameter and read that way by `lib/today/time.ts` and
 * `lib/schedule/grid.ts`.
 *
 * This function was handed the first and looked up the second, so pressing *Mon*
 * offered **Tuesday's** working hours, and *Sun* (7) matched no row at all and
 * could never be picked — a whole weekday the trainer could not schedule
 * anybody on. `lib/clients/booking.ts` states both conventions in one place now;
 * the `- 1` is the translation and it belongs here, at the crossing.
 */
export function slotsForDay(weekday: number, hours: WorkingHourWire[]) {
  return halfHours(hours, weekday - 1, 0).map(m => ({ minute: m, time: hhmm(m), label: formatMinute(m) }));
}

/**
 * EVERY WINDOW OF THE DAY, NOT THE FIRST ONE (22 Nov 2026).
 *
 * A working day is often two windows — 6–11 in the morning and 5–10 in the
 * evening — and `working_hours` holds one row per window. Both slot helpers read
 * `hours.find(...)`, so only the first row of the day was ever offered and every
 * evening hour the trainer had set was missing from Week and Demo alike.
 *
 * Half-hour starts across all of the weekday's windows (0 = Monday, the table's
 * convention), sorted, each minute once. `fits` is how long a session starting
 * there must run before the window ends; 0 keeps the Week step's old rule, where
 * any start inside the window counts.
 */
export function halfHours(hours: WorkingHourWire[], weekday0: number, fits: number): number[] {
  const out = new Set<number>();
  for (const w of hours) {
    if (w.weekday !== weekday0) continue;
    for (let m = w.startMinute; fits > 0 ? m + fits <= w.endMinute : m < w.endMinute; m += 30) out.add(m);
  }
  return Array.from(out).sort((a, b) => a - b);
}

/** `06:30` — the wire's standing-slot time, never shown. */
export function hhmm(m: number): string {
  return `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`;
}

/** Morning before noon, afternoon to 5 PM, evening after — the three a trainer says. */
export const DAY_PARTS = [
  { key: 'morning', label: 'Morning', until: 12 * 60 },
  { key: 'afternoon', label: 'Afternoon', until: 17 * 60 },
  { key: 'evening', label: 'Evening', until: 24 * 60 },
] as const;

export type PartKey = typeof DAY_PARTS[number]['key'];

export function partOf(minute: number): PartKey {
  return (DAY_PARTS.find(p => minute < p.until) ?? DAY_PARTS[DAY_PARTS.length - 1]).key;
}

/** One chip's worth of the Week step: the hour, and who already holds it. */
export interface PickSlot { minute: number; time: string; label: string; holder: string | null }

/**
 * ONE PART OF THE DAY AT A TIME (22 Nov 2026).
 *
 * Every window of a day drawn at once was twenty chips a day, and five days
 * picked was a hundred chips in a 420px drawer. So the slots sit behind a
 * Morning / Afternoon / Evening switch: only the parts the trainer works are
 * offered, a part with nothing free is shown and locked (with its 0) rather than
 * hidden, and the switch opens on the part that holds the pick, else the first
 * part with a free hour. One part on its own gets no switch at all.
 */
export function SlotPicker({
  label, slots, picked, part, onPart, onPick,
}: {
  label: string;
  slots: PickSlot[];
  picked: string | null;
  part: PartKey | undefined;
  onPart: (p: PartKey) => void;
  onPick: (time: string) => void;
}) {
  const parts = DAY_PARTS
    .map(p => {
      const inPart = slots.filter(s => partOf(s.minute) === p.key);
      return { ...p, slots: inPart, free: inPart.filter(s => !s.holder).length };
    })
    .filter(p => p.slots.length > 0);
  const pickedMinute = slots.find(s => s.time === picked)?.minute;
  const shown =
    parts.find(p => p.key === part && p.free > 0)
    ?? parts.find(p => pickedMinute !== undefined && p.key === partOf(pickedMinute))
    ?? parts.find(p => p.free > 0)
    ?? parts[0];
  if (!shown) return null;

  return (
    <div className="slotpk">
      {parts.length > 1 && (
        <Segment label={`${label}: part of the day`} mode="single">
          {parts.map(p => (
            <SegmentButton
              key={p.key}
              mode="single"
              pressed={p.key === shown.key}
              disabled={p.free === 0}
              title={p.free === 0 ? `Nothing free in the ${p.label.toLowerCase()}` : undefined}
              count={p.free}
              onClick={() => onPart(p.key)}
            >
              {p.label}
            </SegmentButton>
          ))}
        </Segment>
      )}
      <div className="slots">
        {shown.slots.map(slot => {
          if (slot.holder) {
            return (
              <span key={slot.time} className="slot slot--held" aria-disabled="true">
                {slot.label}
                <small>{slot.holder} has it</small>
              </span>
            );
          }
          const isPicked = picked === slot.time;
          return (
            <button
              key={slot.time}
              className={`slot${isPicked ? ' slot--on' : ''}`}
              type="button"
              aria-pressed={isPicked}
              onClick={() => onPick(slot.time)}
            >
              {slot.label}
              <small>{isPicked ? 'picked' : 'free'}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The Demo step's dates: each day's slots under small Morning / Evening labels.
 *  A demo is one date out of fourteen, so it is picked by scanning, not set. */
export function SlotGroups<T extends { minute: number }>({ slots, render }: { slots: T[]; render: (slot: T) => ReactNode }) {
  const groups = DAY_PARTS
    .map(part => ({ ...part, slots: slots.filter(s => partOf(s.minute) === part.key) }))
    .filter(g => g.slots.length > 0);
  if (groups.length <= 1) return <div className="slots">{slots.map(render)}</div>;
  return (
    <div className="slotgrp">
      {groups.map(g => (
        <div key={g.key} role="group" aria-label={g.label}>
          <p className="slotgrp__l">{g.label}</p>
          <div className="slots">{g.slots.map(render)}</div>
        </div>
      ))}
    </div>
  );
}

export function heldBy(
  weekday: number,
  time: string,
  clients: ClientScheduleWire[],
  /** The client whose week is being edited — their own slot is not somebody else's. */
  except?: string | null,
): string | null {
  const live = new Set(['active', 'invited']);
  for (const c of clients) {
    if (except && c.id === except) continue;
    if (!live.has((c.status ?? '').toLowerCase())) continue;
    if ((c.weeklySchedule ?? []).some(s => s.weekday === weekday && s.time === time)) return c.name;
  }
  return null;
}
export const WEEKDAYS = [
  { n: 1, label: 'Mon' },
  { n: 2, label: 'Tue' },
  { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' },
  { n: 5, label: 'Fri' },
  { n: 6, label: 'Sat' },
  { n: 7, label: 'Sun' },
];

const labelOf = (wd: number) => WEEKDAYS.find(w => w.n === wd)?.label ?? '';

/** A mono kicker with a rule running to the right edge, and an optional count. */
export function Sec({ k, n }: { k: string; n?: string }) {
  return (
    <div className="adsec">
      <span className="adsec__k">{k}</span>
      <span className="adsec__r" />
      {n && <span className="adsec__n">{n}</span>}
    </div>
  );
}

/**
 * Seven is the ceiling a week has; the schema allows 14 (two a day) and nothing
 * in this product books two a day, so the chips stop at the week.
 */
const PER_WEEK = [1, 2, 3, 4, 5, 6, 7];

/** The add flow's picked-chip treatment, kept so the two doors draw one chip. */
const ON = { background: 'var(--tx-accent-soft)', borderColor: 'var(--tx-accent-line)', color: 'var(--tx-accent-text)' };

/** "How many days a week?" — the one answer a plan is chosen against. */
export function DaysPerWeekField({
  value,
  onChange,
  required = true,
}: {
  value: number | null;
  onChange: (n: number) => void;
  required?: boolean;
}) {
  return (
    <div>
      <Sec k="How many days a week" n={value ? `${value} a week` : required ? 'required' : 'not set'} />
      <div className="wk" role="group" aria-label="Training days a week">
        {PER_WEEK.map(n => (
          <Chip
            key={n}
            pressed={value === n}
            onClick={() => onChange(n)}
            aria-label={`${n} day${n === 1 ? '' : 's'} a week`}
            style={value === n ? ON : undefined}
          >
            {n}
          </Chip>
        ))}
      </div>
      <p className="small slotpk__alt">
        This decides which plans fit. Days and times are optional; set them now or later from their file.
      </p>
    </div>
  );
}

/**
 * Which weekdays, and the hour on each — optional, capped at `max` days.
 *
 * Controlled: the caller owns `weekdays` and `slots` because the caller saves
 * them. The two layout choices (one time for every day or one per day, and
 * which part of the day each picker shows) are this component's own.
 */
export function WeekFields({
  hours,
  clients,
  except = null,
  max,
  weekdays,
  onWeekdays,
  slots,
  onSlots,
}: {
  /** The trainer's working hours, 0 = Monday (the `working_hours` convention). */
  hours: WorkingHourWire[];
  /** Everybody's standing slots, for *who already holds this hour*. */
  clients: ClientScheduleWire[];
  /** The client being edited, whose own slots are not a clash. */
  except?: string | null;
  /** Days a week agreed; no more weekdays than this can be ticked. Null = no cap. */
  max: number | null;
  weekdays: Set<number>;
  onWeekdays: (next: Set<number>) => void;
  /** weekday (1 = Monday) → `HH:mm` */
  slots: Record<number, string>;
  onSlots: (next: Record<number, string>) => void;
}) {
  /* The two layouts (22 Nov 2026): one time for every picked day, which is how
     most clients train, or a picker per day. And which part of the day each
     picker shows — keyed 'all' or by weekday. */
  const [perDay, setPerDay] = useState(false);
  const [slotPart, setSlotPart] = useState<Record<string, PartKey>>({});

  const full = max !== null && weekdays.size >= max;
  const over = max !== null && weekdays.size > max;

  const toggleDay = (wd: number) => {
    const active = weekdays.has(wd);
    const next = new Set(weekdays);
    if (active) {
      next.delete(wd);
      const rest = { ...slots };
      delete rest[wd];
      onSlots(rest);
    } else {
      next.add(wd);
      /* One time for every day: a day added later takes the time the others
         share, when it is free then. */
      const times = new Set(Object.values(slots));
      const shared = !perDay && times.size === 1 ? [...times][0] : null;
      if (shared
        && slotsForDay(wd, hours).some(sl => sl.time === shared)
        && !heldBy(wd, shared, clients, except)) {
        onSlots({ ...slots, [wd]: shared });
      }
    }
    onWeekdays(next);
  };

  const days = Array.from(weekdays).sort((a, b) => a - b);
  const pickSlots = (wd: number): PickSlot[] => slotsForDay(wd, hours)
    .map(sl => ({ ...sl, holder: heldBy(wd, sl.time, clients, except)?.split(' ')[0] ?? null }));
  const withHours = days.filter(wd => slotsForDay(wd, hours).length > 0);
  const noHours = days.filter(wd => !withHours.includes(wd));

  /* ONE TIME FOR EVERY DAY. The hours all the picked days share; a chip is held
     when any of those days has it taken, and says which day. */
  const per = withHours.map(pickSlots);
  const common: PickSlot[] = (per[0] ?? [])
    .filter(sl => per.every(day => day.some(d => d.time === sl.time)))
    .map(sl => {
      const at = withHours.findIndex((_, k) => per[k].find(d => d.time === sl.time)?.holder);
      return at === -1 ? sl : {
        ...sl,
        holder: `${per[at].find(d => d.time === sl.time)?.holder} · ${labelOf(withHours[at])}`,
      };
    });
  const times = new Set(withHours.map(wd => slots[wd]).filter(Boolean));
  const sharedPick = times.size === 1 && withHours.every(wd => slots[wd]) ? [...times][0] : null;
  const together = !perDay && withHours.length >= 2 && common.length > 0;
  const noShared = !perDay && withHours.length >= 2 && common.length === 0;

  const unset = noHours.map((wd, i) => (
    <div key={`nh${wd}`} style={{ ['--i' as string]: i + 2 }}>
      <Sec k={labelOf(wd)} n="no working hours set for this day" />
    </div>
  ));

  let times_: ReactNode;
  if (together) {
    times_ = (
      <>
        <div style={{ ['--i' as string]: 2 }}>
          <Sec
            k={`${withHours.map(labelOf).join(' · ')} · same time each day`}
            n={sharedPick ? common.find(c => c.time === sharedPick)?.label ?? sharedPick : times.size > 1 ? 'varies' : '—'}
          />
          <SlotPicker
            label="Every picked day"
            slots={common}
            picked={sharedPick}
            part={slotPart.all}
            onPart={p => setSlotPart(prev => ({ ...prev, all: p }))}
            onPick={time => {
              const next = { ...slots };
              const off = sharedPick === time;
              for (const wd of withHours) {
                if (off) delete next[wd];
                else next[wd] = time;
              }
              onSlots(next);
            }}
          />
          <p className="small slotpk__alt">
            Only hours free on all {withHours.length} days are shown.{' '}
            <button type="button" className="slotpk__sw" onClick={() => setPerDay(true)}>
              Pick a different time for each day
            </button>
          </p>
        </div>
        {unset}
      </>
    );
  } else {
    times_ = (
      <>
        {noShared && (
          <p className="small slotpk__alt" style={{ ['--i' as string]: 2 }}>
            These days share no free hour, so each gets its own time.
          </p>
        )}
        {perDay && withHours.length >= 2 && (
          <p className="small slotpk__alt" style={{ ['--i' as string]: 2 }}>
            <button type="button" className="slotpk__sw" onClick={() => setPerDay(false)}>
              Use the same time every day
            </button>
          </p>
        )}
        {days.map((wd, i) => {
          if (!withHours.includes(wd)) {
            return (
              <div key={wd} style={{ ['--i' as string]: i + 2 }}>
                <Sec k={labelOf(wd)} n="no working hours set for this day" />
              </div>
            );
          }
          const daySlots = pickSlots(wd);
          const pickedTime = slots[wd] ?? null;
          return (
            <div key={wd} style={{ ['--i' as string]: i + 2 }}>
              <Sec
                k={`${labelOf(wd)} · your hours, minus the hours others hold`}
                n={pickedTime ? daySlots.find(sl => sl.time === pickedTime)?.label ?? pickedTime : '—'}
              />
              <SlotPicker
                label={labelOf(wd)}
                slots={daySlots}
                picked={pickedTime}
                part={slotPart[String(wd)]}
                onPart={p => setSlotPart(prev => ({ ...prev, [String(wd)]: p }))}
                onPick={time => {
                  const next = { ...slots };
                  if (next[wd] === time) delete next[wd];
                  else next[wd] = time;
                  onSlots(next);
                }}
              />
            </div>
          );
        })}
      </>
    );
  }

  return (
    <>
      <div style={{ ['--i' as string]: 1 }}>
        <Sec
          k="Which days · optional"
          n={weekdays.size ? `${weekdays.size}${max ? ` of ${max}` : ''} picked` : 'none yet'}
        />
        <div className="wk">
          {WEEKDAYS.map(wd => {
            const active = weekdays.has(wd.n);
            return (
              <Chip
                pressed={active}
                key={wd.n}
                disabled={!active && full}
                title={!active && full ? `${max} days picked. Untick one to choose another.` : undefined}
                onClick={() => toggleDay(wd.n)}
                style={active ? ON : undefined}
              >
                {wd.label}
              </Chip>
            );
          })}
        </div>
        {over && (
          <p className="small slotpk__alt" role="status">
            {weekdays.size} days picked for {max} a week. Untick {weekdays.size - (max ?? 0)}.
          </p>
        )}
      </div>
      {times_}
    </>
  );
}
