'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { ClientDetailWire } from '@/lib/clients/client-api';
import type { ClientScheduleWire, WorkingHourWire } from '@/lib/clients/new-api';
import { loadWeekPicker, saveClientWeek, type WeekSlotInput } from '@/lib/clients/week-actions';
import { useDismiss } from '@/lib/ui/dismiss';
import { useToast } from '@/lib/toast/store';
import { Button } from '@/web-components/ui/Button';
import { DaysPerWeekField, WEEKDAYS, WeekFields } from '../WeekFields';

/**
 * *Their week*, edited from the client file (22 Nov 2026).
 *
 * The same two questions as the add flow's Week step, drawn by the same
 * `WeekFields`: how many days a week (required — it is what a plan is chosen
 * against) and which days at what time (optional). Saving is the one
 * `PUT /v1/clients/{id}/schedule`, which books the standing slots ahead and
 * cancels the future sessions of any slot taken away — the toast says both.
 *
 * Three things it keeps that the add flow never had to:
 *   - a kept slot keeps its program day, duration and delivery mode, because
 *     PUT replaces and anything not sent back is cleared;
 *   - the client's own slots are not drawn as held by somebody else;
 *   - a change of days a week against a live plan with a different count is
 *     SAID, never refused — running a 4-day split over a 3-day week is a thing
 *     trainers do on purpose.
 */
export function WeekEditor({ client, onClose }: { client: ClientDetailWire; onClose: () => void }) {
  const router = useRouter();
  const { show } = useToast();
  const { closing, dismiss, ref: panelRef } = useDismiss<HTMLElement>(onClose);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hhmm = (t: string) => t.slice(0, 5);
  const [perWeek, setPerWeek] = useState<number | null>(client.schedule.sessionsPerWeek ?? (client.slots.length || null));
  const [weekdays, setWeekdays] = useState<Set<number>>(() => new Set(client.slots.map((s) => s.weekday)));
  const [slots, setSlots] = useState<Record<number, string>>(() =>
    Object.fromEntries(client.slots.map((s) => [s.weekday, hhmm(s.start)])),
  );

  /* The picker's hours and everybody's slots — read when the panel opens. */
  const [picker, setPicker] = useState<{ hours: WorkingHourWire[]; clients: ClientScheduleWire[] } | null>(null);
  const [pickerFailed, setPickerFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void loadWeekPicker().then((r) => {
      if (!live) return;
      if (r.ok) setPicker({ hours: r.workingHours, clients: r.clients });
      else setPickerFailed(true);
    });
    return () => { live = false; };
  }, []);

  /* A real dialog: focus in, Escape out, focus back — `PackPanel`'s three. */
  const returnTo = useRef<Element | null>(null);
  useEffect(() => {
    returnTo.current = document.activeElement;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); dismiss(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, [dismiss, panelRef]);

  const planDays = client.program?.days ?? null;
  const mismatch = planDays !== null && perWeek !== null && planDays !== perWeek;
  const first = client.name.split(' ')[0];

  const save = () => {
    if (perWeek === null) { setError('Pick how many days a week they train.'); return; }
    if (weekdays.size > perWeek) {
      setError(`${weekdays.size} days are ticked for ${perWeek} a week. Untick ${weekdays.size - perWeek}, or change the number.`);
      return;
    }
    const unset = [...weekdays].filter((wd) => !slots[wd]).sort((a, b) => a - b)
      .map((wd) => WEEKDAYS.find((w) => w.n === wd)?.label ?? '');
    if (unset.length > 0) {
      setError(`${unset.join(' and ')} ${unset.length === 1 ? 'has' : 'have'} no time yet. Pick one, or untick the day.`);
      return;
    }
    const kept = new Map(client.slots.map((s) => [`${s.weekday}@${hhmm(s.start)}`, s]));
    const out: WeekSlotInput[] = Object.entries(slots)
      .filter(([wd]) => weekdays.has(Number(wd)))
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([wd, time], idx) => {
        const was = kept.get(`${wd}@${time}`);
        if (was) {
          return { weekday: Number(wd), start: time, programDay: was.programDay, durationMinutes: was.durationMinutes, deliveryMode: was.deliveryMode };
        }
        /* A new slot books the plan's day in week order when the plan has that
           many days; otherwise null, which is the server's sequence rule. */
        const day = planDays !== null && idx + 1 <= planDays ? idx + 1 : null;
        return { weekday: Number(wd), start: time, programDay: day, durationMinutes: null, deliveryMode: null };
      });

    setError(null);
    startTransition(async () => {
      const r = await saveClientWeek(client.id, client.schedule.version, {
        sessionsPerWeek: perWeek,
        sessionDurationMinutes: client.schedule.sessionDurationMinutes,
        deliveryMode: client.schedule.deliveryMode,
        slots: out,
      });
      if (!r.ok) { setError(r.message); return; }
      const parts = [`${perWeek} day${perWeek === 1 ? '' : 's'} a week`];
      if (r.booked > 0) parts.push(`${r.booked} session${r.booked === 1 ? '' : 's'} booked`);
      if (r.cancelled > 0) parts.push(`${r.cancelled} cancelled`);
      show({ variant: 'receipt', tone: 'ok', title: <><b>Week saved</b> for {first}</>, body: parts.join(' · ') });
      router.refresh();
      dismiss();
    });
  };

  return (
    <>
      <div className={`scrim scrim--soft${closing ? ' scrim--out' : ''}`} onClick={dismiss} aria-hidden="true" />
      <aside
        ref={panelRef}
        tabIndex={-1}
        className={`panel rp-panel wkedit${closing ? ' panel--out' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${first}'s week`}
      >
        <div className="panel__hd">
          <span className="panel__t">{first}&rsquo;s week</span>
          <span style={{ flex: 1 }} />
          <button className="btn btn--icon btn--ghost" type="button" aria-label="Close" onClick={dismiss}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="panel__body wkedit__body">
          <DaysPerWeekField value={perWeek} onChange={setPerWeek} />

          {mismatch && (
            <p className="msg msg--warn" role="status">
              <span>
                Their plan, {client.program?.name}, has {planDays} days. That is fine if it is on
                purpose; otherwise assign a {perWeek}-day plan from the Plan tab.
              </span>
            </p>
          )}

          {picker ? (
            <WeekFields
              hours={picker.hours}
              clients={picker.clients}
              except={client.id}
              max={perWeek}
              weekdays={weekdays}
              onWeekdays={setWeekdays}
              slots={slots}
              onSlots={setSlots}
            />
          ) : (
            <p className="small" style={{ color: 'var(--tx-ink-3)' }}>
              {pickerFailed
                ? 'Your working hours did not load, so days and times cannot be picked right now. Days a week still saves.'
                : 'Loading your working hours…'}
            </p>
          )}

          <p className="small" style={{ color: 'var(--tx-ink-3)' }}>
            Fixed days are booked four weeks ahead and kept topped up. Taking a day away cancels its
            future sessions; sessions you booked by hand stay.
          </p>

          {error && (
            <p className="msg msg--warn" role="alert">
              <span>{error}</span>
            </p>
          )}

          <div className="wkedit__acts">
            <Button variant="primary" disabled={pending} onClick={save}>
              {pending ? 'Saving…' : 'Save week'}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={dismiss}>
              Cancel
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}

/** The door on Overview's *Turning up* card: the week, editable any time. */
export function EditWeekButton({ client }: { client: ClientDetailWire }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {client.schedule.sessionsPerWeek || client.slots.length ? 'Edit week' : 'Set week'}
      </Button>
      {open && <WeekEditor client={client} onClose={() => setOpen(false)} />}
    </>
  );
}
