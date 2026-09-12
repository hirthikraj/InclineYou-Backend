'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import type { NewClientData, WorkingHourWire, ClientScheduleWire } from '@/lib/clients/new-api';
import {
  checkPhone,
  createClient,
  updateClientSchedule,
  applyTemplate,
  type WeeklySlot,
} from '@/lib/clients/new-actions';
import { TopBar } from '@/components/shell/TopBar';
import { Glyph } from '@/components/shell/Icons';

/* ──────────────────────────────────────────────── local icon helpers ── */

function CheckIcon({ size = 14 }: { size?: number }) {
  return <Glyph size={size} d="M4 13l5 5L20 7" />;
}

function PackIcon({ size = 20 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <rect x="3" y="8" width="18" height="13" rx="2" />
      <path d="M19 8V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v2" />
      <line x1="12" y1="12" x2="12" y2="17" />
    </Glyph>
  );
}

/* ─────────────────────────────────────────────────── step bar ── */

type Step = 1 | 2 | 3 | 4;

const STEP_DEFS = [
  { n: 1 as Step, label: 'Who', optional: false },
  { n: 2 as Step, label: 'Money', optional: false },
  { n: 3 as Step, label: 'Week', optional: true },
  { n: 4 as Step, label: 'Plan', optional: true },
];

function StepBar({ current }: { current: Step }) {
  return (
    <div className="stbar" style={{ paddingBottom: '14px' }}>
      {STEP_DEFS.map(s => {
        const cls = s.n < current ? 'done' : s.n === current ? 'on' : '';
        return (
          <div key={s.n} className={cls || undefined}>
            <em>
              {s.n < current ? <CheckIcon size={12} /> : s.n}
            </em>
            <span>{s.label}</span>
            {s.optional && <span className="opt">optional</span>}
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────── slot utilities ── */

function slotsForDay(
  weekday: number,
  hours: WorkingHourWire[],
): Array<{ minute: number; time: string }> {
  const hw = hours.find(h => h.weekday === weekday);
  if (!hw) return [];
  const slots: Array<{ minute: number; time: string }> = [];
  for (let m = hw.startMinute; m < hw.endMinute; m += 30) {
    const h = Math.floor(m / 60).toString().padStart(2, '0');
    const min = (m % 60).toString().padStart(2, '0');
    slots.push({ minute: m, time: `${h}:${min}` });
  }
  return slots;
}

function heldBy(weekday: number, time: string, clients: ClientScheduleWire[]): string | null {
  const liveStatuses = new Set(['active', 'invited']);
  for (const c of clients) {
    if (!liveStatuses.has((c.status ?? '').toLowerCase())) continue;
    const schedule = c.weeklySchedule ?? [];
    if (schedule.some(s => s.weekday === weekday && s.time === time)) return c.name;
  }
  return null;
}

/* ─────────────────────────────────────────────── phone formatting ── */

function cleanPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.startsWith('0') ? digits.slice(1) : digits;
}

function displayPhone(raw: string): string {
  const digits = cleanPhone(raw);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)} ${digits.slice(5, 10)}`;
}

/* ─────────────────────────────────────────── work mode display data ── */

const WORK_MODE_INFO: Record<string, { label: string; sub: string; tag: string; tagClass: string }> = {
  independent: {
    label: 'Independent',
    sub: 'They collect. Their own packs, price editable on the sale.',
    tag: 'no split',
    tagClass: 'tag tag--ok',
  },
  gym: {
    label: 'Gym',
    sub: "The counter collects. The gym’s list, and one question: their share.",
    tag: 'asks for a share',
    tagClass: 'tag tag--warn',
  },
  both: {
    label: 'Both',
    sub: 'Asks first — gym client, or one of your own?',
    tag: 'asks for a share',
    tagClass: 'tag tag--warn',
  },
};

const ALL_MODES = ['independent', 'gym', 'both'] as const;

const WEEKDAYS = [
  { n: 1, label: 'Mon' },
  { n: 2, label: 'Tue' },
  { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' },
  { n: 5, label: 'Fri' },
  { n: 6, label: 'Sat' },
  { n: 7, label: 'Sun' },
];

/* ─────────────────────────────────────────────── main component ── */

export function NewClient({ data, now: _now }: { data: NewClientData; now: number }) {
  const router = useRouter();

  /* ── form state ── */
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCheck, setPhoneCheck] = useState<'idle' | 'checking' | 'ok' | 'on-roster' | 'blocked'>('idle');
  const [rosterMatch, setRosterMatch] = useState<{ id: string; name: string } | null>(null);
  const [dismissedRosterWarn, setDismissedRosterWarn] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<'floor' | 'remote'>('floor');
  const [trainerSplit, setTrainerSplit] = useState<number>(
    data.trainer.gymSharePercent !== null ? 100 - data.trainer.gymSharePercent : 60,
  );
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set());
  const [selectedSlots, setSelectedSlots] = useState<Record<number, string>>({});
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── palette state (TopBar requires onSearch) ── */
  const [, setPaletteOpen] = useState(false);

  /* ── phone check debounce ── */
  const phoneCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doPhoneCheck = useCallback(
    async (rawPhone: string) => {
      const digits = cleanPhone(rawPhone);
      if (digits.length < 10) {
        setPhoneCheck('idle');
        setRosterMatch(null);
        return;
      }

      // First: local roster check
      const localMatch = data.clients.find(c => {
        const cd = cleanPhone(c.name ?? '');
        void cd;
        // match against phone field — clients have phone numbers, not names
        return false; // phone is not on ClientScheduleWire; skip local match
      });
      void localMatch;

      setPhoneCheck('checking');
      setRosterMatch(null);

      try {
        const result = await checkPhone(digits);
        if (!result.available) {
          // The code tells us why
          if (result.code === 'CLIENT_PHONE_EXISTS') {
            setPhoneCheck('on-roster');
            // Try to find matching client by phone
            setRosterMatch(null);
          } else {
            setPhoneCheck('blocked');
          }
        } else {
          setPhoneCheck('ok');
          setRosterMatch(null);
        }
      } catch {
        setPhoneCheck('idle');
      }
    },
    [data.clients],
  );

  /* The effect SCHEDULES and nothing else. Clearing the verdict when the number
     goes short is state derived from an edit, so it belongs to the edit — see the
     phone field's `onChange`. Setting it here instead paints the stale verdict for
     a frame, which on this field reads as the server having answered about a
     number the trainer has already changed. */
  useEffect(() => {
    if (phoneCheckTimer.current) clearTimeout(phoneCheckTimer.current);
    if (cleanPhone(phone).length < 10) return;
    phoneCheckTimer.current = setTimeout(() => {
      void doPhoneCheck(phone);
    }, 600);
    return () => {
      if (phoneCheckTimer.current) clearTimeout(phoneCheckTimer.current);
    };
  }, [phone, doPhoneCheck]);

  /* ── step 2: whether to show split field ── */
  const showSplit =
    (data.trainer.workMode === 'gym' || data.trainer.workMode === 'both') &&
    deliveryMode === 'floor';

  const gymShare = 100 - trainerSplit;

  /* ── step 4: filter templates by days picked ── */
  const eligibleTemplates =
    weekdays.size > 0
      ? data.templates.filter(t => (t.dayLabels?.length ?? 0) === weekdays.size)
      : data.templates;

  /* ── navigation ── */
  const goToClient = () => {
    router.push(createdClientId ? `/clients/${createdClientId}` : '/clients');
  };

  /* ── step 1 continue ── */
  const handleStep1Continue = () => {
    if (!name.trim()) { setError('Enter their name.'); return; }
    const digits = cleanPhone(phone);
    if (digits.length < 10) { setError('Enter a 10-digit phone number.'); return; }
    if (phoneCheck === 'blocked') { setError('That number cannot be added.'); return; }
    setError(null);
    setStep(2);
  };

  /* ── step 2 create client ── */
  const handleCreateClient = async (includeSplit: boolean) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createClient({
        name: name.trim(),
        phone: cleanPhone(phone),
        deliveryMode,
        trainerSplitPercent: includeSplit && showSplit ? trainerSplit : undefined,
      });
      setCreatedClientId(created.id);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── step 3 save schedule ── */
  const handleStep3Continue = async () => {
    if (!createdClientId || submitting) return;
    const slots = Object.entries(selectedSlots).map(([wd, time], idx) => ({
      templateDay: idx + 1,
      weekday: Number(wd),
      time,
    })) satisfies WeeklySlot[];

    if (slots.length === 0) { setStep(4); return; }
    setSubmitting(true);
    setError(null);
    try {
      await updateClientSchedule(createdClientId, slots);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── step 4 apply template ── */
  const handleApplyTemplate = async () => {
    if (!createdClientId || !selectedTemplateId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await applyTemplate(selectedTemplateId, { clientId: createdClientId });
      router.push('/clients');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSubmitting(false);
    }
  };

  /* ── render ── */
  const stepSubtitles: Record<Step, string> = {
    1: 'Step 1 of 4 · Their name and phone number',
    2: 'Step 2 of 4 · How they pay',
    3: 'Step 3 of 4 · Which days they train',
    4: 'Step 4 of 4 · Assign a program',
  };

  return (
    <>
      <TopBar crumb="Add a client" onSearch={() => setPaletteOpen(true)} />

      <main className="main" id="main-content">
        <div className="ph">
          <div className="ph__row">
            <div>
              <p className="ph__t">Add a client</p>
              <p className="ph__sub">{stepSubtitles[step]}</p>
            </div>
          </div>
          <StepBar current={step} />
        </div>

        {error && (
          <div className="body" style={{ paddingBottom: 0 }}>
            <div className="why why--warn" style={{ padding: '10px 16px' }}>
              <p>{error}</p>
            </div>
          </div>
        )}

        {/* ── STEP 1: WHO ── */}
        {step === 1 && (
          <div className="body">
            <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'minmax(0,480px) minmax(0,1fr)', maxWidth: 1040 }}>
              <div>
                <div className="fld">
                  <label className="fld__l" htmlFor="nc-name">Their name</label>
                  <input
                    id="nc-name"
                    className="ctl"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Arjun Subramanian"
                    autoComplete="off"
                  />
                  <p className="fld__h">Use the name they are already known by.</p>
                </div>

                <div className="fld" style={{ marginTop: 14 }}>
                  <label className="fld__l" htmlFor="nc-phone">Phone number</label>
                  <div className="affix">
                    <span
                      className="ctl ctl--said"
                      style={{
                        width: 52,
                        borderRadius: 'var(--tx-r2) 0 0 var(--tx-r2)',
                        borderRight: 0,
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      +91
                    </span>
                    <input
                      id="nc-phone"
                      className="ctl"
                      value={displayPhone(phone)}
                      onChange={e => {
                        setPhone(e.target.value);
                        /* Too short to check is not a verdict — drop whatever the
                           last complete number answered, in the same render as the
                           keystroke that invalidated it. `doPhoneCheck` guards the
                           same length again, because it is also reachable from the
                           debounce with a number that changed under it. */
                        if (cleanPhone(e.target.value).length < 10) {
                          setPhoneCheck('idle');
                          setRosterMatch(null);
                        }
                      }}
                      placeholder="98410 22119"
                      inputMode="numeric"
                      autoComplete="tel"
                    />
                  </div>
                  <p className="fld__h">Reminders and the invite both go to this number.</p>
                </div>

                {/* Phone check warnings */}
                {phoneCheck === 'on-roster' && !dismissedRosterWarn && (
                  <div className="why why--warn" style={{ marginTop: 12, padding: '12px 16px' }}>
                    <p className="why__k">Already on your roster</p>
                    <p>
                      {rosterMatch
                        ? <><b>{rosterMatch.name}</b> has this number. </>
                        : <>Someone on your roster has this number. </>
                      }
                      Two records for one person split their pack and their history in half — and two people do share a phone, so this is a caution, not a refusal.
                    </p>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      {rosterMatch && (
                        <Link className="btn btn--secondary btn--sm" href={`/clients/${rosterMatch.id}`}>
                          Open {rosterMatch.name.split(' ')[0]}&apos;s file
                        </Link>
                      )}
                      <button
                        className="btn btn--ghost btn--sm"
                        type="button"
                        onClick={() => setDismissedRosterWarn(true)}
                      >
                        It&apos;s a different person
                      </button>
                    </div>
                  </div>
                )}

                {phoneCheck === 'blocked' && (
                  <div className="why why--warn" style={{ marginTop: 12, padding: '12px 16px' }}>
                    <p className="why__k">This number cannot be added</p>
                    <p>The number belongs to a trainer account or another trainer&apos;s client — it cannot be on two rosters at once.</p>
                  </div>
                )}

                {/* Deferred fields */}
                <p className="micro" style={{ marginTop: 18 }}>Any time later</p>
                <div className="card" style={{ marginTop: 8 }}>
                  <div className="card__b">
                    <div className="kv">
                      <span className="kv__k">
                        Program
                        <span className="small" style={{ marginLeft: 8 }}>Assign one after their first session</span>
                      </span>
                      <span className="kv__v ink3">—</span>
                    </div>
                    <div className="kv">
                      <span className="kv__k">
                        Pack
                        <span className="small" style={{ marginLeft: 8 }}>Sell it on the day they pay</span>
                      </span>
                      <span className="kv__v ink3">—</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 9, marginTop: 20 }}>
                  <button
                    className="btn btn--primary btn--lg"
                    type="button"
                    onClick={handleStep1Continue}
                  >
                    Continue
                  </button>
                  <button
                    className="btn btn--ghost btn--lg"
                    type="button"
                    onClick={() => router.push('/clients')}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: MONEY ── */}
        {step === 2 && (
          <div className="body">
            <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'minmax(0,520px) minmax(0,1fr)', maxWidth: 1060 }}>
              <div>
                <p className="micro">On your profile</p>
                <div className="lgl" style={{ marginTop: 8 }}>
                  {ALL_MODES.map(mode => {
                    const info = WORK_MODE_INFO[mode];
                    const active = data.trainer.workMode === mode;
                    return (
                      <div
                        key={mode}
                        className="lrow"
                        aria-selected={active}
                      >
                        <span className={`rad${active ? ' rad--on' : ''}`} />
                        <span className="lrow__m">
                          <span className="lrow__t">{info.label}</span>
                          <span className="lrow__s">{info.sub}</span>
                        </span>
                        <span className={info.tagClass}>{info.tag}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="small" style={{ marginTop: 7 }}>
                  Answered once at setup. Two of the three never ask who collects.
                </p>

                <p className="micro" style={{ marginTop: 14 }}>Where they train</p>
                <div className="wk" style={{ marginTop: 8 }}>
                  {(['floor', 'remote'] as const).map(mode => (
                    <button
                      key={mode}
                      className="chip"
                      type="button"
                      aria-pressed={deliveryMode === mode}
                      onClick={() => setDeliveryMode(mode)}
                      style={
                        deliveryMode === mode
                          ? { background: 'var(--tx-accent-soft)', borderColor: 'var(--tx-accent-line)', color: 'var(--tx-accent-text)' }
                          : undefined
                      }
                    >
                      {mode === 'floor' ? 'Floor' : 'Remote'}
                    </button>
                  ))}
                  <span className="small" style={{ marginLeft: 6 }}>decides whether there is a share to ask for</span>
                </div>

                {/* BACKEND_GAP:packs — pack selector goes here once GET /v1/packs is available. */}
                {/* See BACKEND_GAPS.md §/clients/new·2 for the exact backend change. */}
                <p className="micro" style={{ marginTop: 14 }}>Their pack</p>
                <div className="why" style={{ marginTop: 8, padding: '12px 16px' }}>
                  <p className="why__k">Pack selection — coming soon</p>
                  <p>Your price list is not yet accessible from the web. You can sell them a session pack on the day they pay.</p>
                </div>

                {showSplit && (
                  <div className="card" style={{ marginTop: 14 }}>
                    <div className="card__b">
                      <div className="kv">
                        <span className="kv__k">What <b>you</b> keep</span>
                        <span className="kv__v">
                          <input
                            className="ctl ctl--num"
                            style={{ width: 64, height: 30 }}
                            value={trainerSplit}
                            min={0}
                            max={100}
                            type="number"
                            onChange={e => setTrainerSplit(Math.max(0, Math.min(100, Number(e.target.value))))}
                          />
                          {' %}'}
                        </span>
                      </div>
                      <div className="kv">
                        <span className="kv__k">The gym&apos;s share, therefore</span>
                        <span className="kv__v ink3">{gymShare}%</span>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
                  <button
                    className="btn btn--primary btn--lg"
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleCreateClient(true)}
                  >
                    {submitting ? 'Saving…' : 'Continue'}
                  </button>
                  <button
                    className="btn btn--ghost btn--lg"
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleCreateClient(false)}
                  >
                    Skip — sell it on the day they pay
                  </button>
                </div>
              </div>

              <div>
                <div className="why why--warn">
                  <p className="why__k">The field is what you keep</p>
                  <p>
                    <code>trainerSplitPercent</code> is what the trainer keeps. Type 46 and the trainer keeps 46%, not 54%.
                  </p>
                </div>
                <div className="why" style={{ marginTop: 12 }}>
                  <p className="why__k">The record exists after this screen</p>
                  <p>
                    <code>POST /v1/clients</code> runs here. A trainer who stops after this has a real client on the roster.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: WEEK ── */}
        {step === 3 && (
          <div className="body">
            <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'minmax(0,600px) minmax(0,1fr)', maxWidth: 1140 }}>
              <div>
                <p className="micro">Which days</p>
                <div className="wk" style={{ marginTop: 8 }}>
                  {WEEKDAYS.map(wd => {
                    const active = weekdays.has(wd.n);
                    return (
                      <button
                        key={wd.n}
                        className="chip"
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          const next = new Set(weekdays);
                          if (active) {
                            next.delete(wd.n);
                            const slots = { ...selectedSlots };
                            delete slots[wd.n];
                            setSelectedSlots(slots);
                          } else {
                            next.add(wd.n);
                          }
                          setWeekdays(next);
                        }}
                        style={
                          active
                            ? { background: 'var(--tx-accent-soft)', borderColor: 'var(--tx-accent-line)', color: 'var(--tx-accent-text)' }
                            : undefined
                        }
                      >
                        {wd.label}
                      </button>
                    );
                  })}
                </div>

                {/* Slot pickers for each selected day */}
                {Array.from(weekdays)
                  .sort((a, b) => a - b)
                  .map(wd => {
                    const wdLabel = WEEKDAYS.find(w => w.n === wd)?.label ?? '';
                    const slots = slotsForDay(wd, data.workingHours);
                    const pickedTime = selectedSlots[wd];

                    if (slots.length === 0) {
                      return (
                        <div key={wd} style={{ marginTop: 22 }}>
                          <p className="micro">{wdLabel} · no working hours set for this day</p>
                        </div>
                      );
                    }

                    return (
                      <div key={wd} style={{ marginTop: 22 }}>
                        <p className="micro">{wdLabel} · your hours, minus the hours other clients hold</p>
                        <div className="slots" style={{ marginTop: 8 }}>
                          {slots.map(slot => {
                            const holder = heldBy(wd, slot.time, data.clients);
                            const isPicked = pickedTime === slot.time;
                            if (holder) {
                              return (
                                <span key={slot.time} className="slot slot--held" aria-disabled="true">
                                  {slot.time}
                                  <small>{holder.split(' ')[0]} has it</small>
                                </span>
                              );
                            }
                            return (
                              <button
                                key={slot.time}
                                className={`slot${isPicked ? ' slot--on' : ''}`}
                                type="button"
                                onClick={() =>
                                  setSelectedSlots(prev => ({
                                    ...prev,
                                    [wd]: isPicked ? (() => { const copy = { ...prev }; delete copy[wd]; return copy; })()[wd] ?? '' : slot.time,
                                  }))
                                }
                              >
                                {slot.time}
                                <small>{isPicked ? 'picked' : 'free'}</small>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                <div style={{ display: 'flex', gap: 9, marginTop: 24 }}>
                  <button
                    className="btn btn--primary btn--lg"
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleStep3Continue()}
                  >
                    {submitting ? 'Saving…' : 'Continue'}
                  </button>
                  <button
                    className="btn btn--ghost btn--lg"
                    type="button"
                    disabled={submitting}
                    onClick={() => setStep(4)}
                  >
                    Skip for now
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 4: PLAN ── */}
        {step === 4 && (
          <div className="body">
            <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'minmax(0,520px) minmax(0,1fr)', maxWidth: 1060 }}>
              <div>
                {eligibleTemplates.length === 0 ? (
                  <div className="empty" style={{ minHeight: 320 }}>
                    <span className="empty__ic"><PackIcon size={24} /></span>
                    <p className="empty__t">No programs yet</p>
                    <p className="empty__b">
                      {weekdays.size > 0
                        ? `No programs with ${weekdays.size} day${weekdays.size > 1 ? 's' : ''} match. You can assign one later from their file.`
                        : 'Build a program template and apply it here. You can also assign one later.'}
                    </p>
                    <Link className="btn btn--secondary btn--lg" href="/programs">
                      Go to Programs
                    </Link>
                  </div>
                ) : (
                  <>
                    <p className="micro">Choose a program</p>
                    {weekdays.size > 0 && (
                      <p className="small" style={{ marginTop: 4 }}>
                        Showing programs with {weekdays.size} training day{weekdays.size > 1 ? 's' : ''} — matching the schedule you just set.
                      </p>
                    )}
                    <div className="lgl" style={{ marginTop: 10 }}>
                      {eligibleTemplates.map(t => {
                        const active = selectedTemplateId === t.id;
                        return (
                          <button
                            key={t.id}
                            className="lrow"
                            type="button"
                            aria-pressed={active}
                            onClick={() => setSelectedTemplateId(active ? null : t.id)}
                          >
                            <span className={`rad${active ? ' rad--on' : ''}`} />
                            <span className="lrow__m">
                              <span className="lrow__t">{t.name}</span>
                              {(t.goal || t.description) && (
                                <span className="lrow__s">{t.goal ?? t.description}</span>
                              )}
                            </span>
                            {t.dayLabels && (
                              <span className="tag">{t.dayLabels.length} days</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                <div style={{ display: 'flex', gap: 9, marginTop: 20 }}>
                  {eligibleTemplates.length > 0 && selectedTemplateId && (
                    <button
                      className="btn btn--primary btn--lg"
                      type="button"
                      disabled={submitting}
                      onClick={() => void handleApplyTemplate()}
                    >
                      {submitting ? 'Applying…' : 'Apply and finish'}
                    </button>
                  )}
                  <button
                    className="btn btn--ghost btn--lg"
                    type="button"
                    disabled={submitting}
                    onClick={goToClient}
                  >
                    {selectedTemplateId ? 'Skip for now' : 'Finish'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

    </>
  );
}
