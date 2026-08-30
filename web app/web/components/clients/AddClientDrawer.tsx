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
import { Glyph } from '@/components/shell/Icons';

/* ─────────────────────────────────────────────────── icons ── */

function CheckIcon() {
  return <Glyph size={10} d="M4 13l5 5L20 7" />;
}

function XIcon() {
  return <Glyph size={16} d="M18 6L6 18M6 6l12 12" />;
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

function StepBar({
  current,
  clientCreated,
  onGoBack,
}: {
  current: Step;
  clientCreated: boolean;
  onGoBack: (s: Step) => void;
}) {
  return (
    <div className="adrawer__steps" role="list" aria-label="Onboarding steps">
      {STEP_DEFS.map((s, i) => {
        const done = s.n < current;
        const active = s.n === current;
        // Once client is created (after step 2 completes), steps 1 and 2 cannot be revisited
        const canClick = done && !(clientCreated && s.n <= 2);
        const cls = done ? 'adstep adstep--done' : active ? 'adstep adstep--active' : 'adstep';

        return (
          <span key={s.n} style={{ display: 'contents' }} role="listitem">
            {i > 0 && <span className="adstep__sep" aria-hidden="true" />}
            {canClick ? (
              <button
                className={cls}
                type="button"
                onClick={() => onGoBack(s.n)}
                aria-label={`Go back to ${s.label} step`}
              >
                <span className="adstep__n">
                  <CheckIcon />
                </span>
                {s.label}
                {s.optional && <span style={{ fontSize: 9.5, color: 'var(--tx-ink-3)', marginLeft: 2 }}>opt</span>}
              </button>
            ) : (
              <span className={cls} aria-current={active ? 'step' : undefined}>
                <span className="adstep__n">
                  {done ? <CheckIcon /> : s.n}
                </span>
                {s.label}
                {s.optional && <span style={{ fontSize: 9.5, color: 'var(--tx-ink-3)', marginLeft: 2 }}>opt</span>}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────── slot helpers ── */

function slotsForDay(weekday: number, hours: WorkingHourWire[]) {
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
  const live = new Set(['active', 'invited']);
  for (const c of clients) {
    if (!live.has((c.status ?? '').toLowerCase())) continue;
    if ((c.weeklySchedule ?? []).some(s => s.weekday === weekday && s.time === time)) return c.name;
  }
  return null;
}

/* ─────────────────────────────────────────────────── phone helpers ── */

function cleanPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.startsWith('0') ? digits.slice(1) : digits;
}

function displayPhone(raw: string): string {
  const digits = cleanPhone(raw);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)} ${digits.slice(5, 10)}`;
}

/* ─────────────────────────────────────────────────── work-mode data ── */

const WORK_MODE_INFO: Record<string, { label: string; sub: string; tag: string; tagClass: string }> = {
  independent: {
    label: 'Independent',
    sub: 'They collect. Their own packs, price editable on the sale.',
    tag: 'no split',
    tagClass: 'tag tag--ok',
  },
  gym: {
    label: 'Gym',
    sub: "The counter collects. The gym's list, and one question: their share.",
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

/* ─────────────────────────────────────────────────── main component ── */

export function AddClientDrawer({
  data,
  onClose,
}: {
  data: NewClientData;
  now: number;
  onClose: () => void;
}) {
  const router = useRouter();

  /* form state */
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

  const phoneCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  /* focus name on open */
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  /* Esc to close */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* phone validation — debounced; state is reset in onChange, not in the effect */
  const doPhoneCheck = useCallback(async (rawPhone: string) => {
    const digits = cleanPhone(rawPhone);
    if (digits.length < 10) return;
    setPhoneCheck('checking');
    setRosterMatch(null);
    try {
      const result = await checkPhone(digits);
      if (!result.available) {
        if (result.code === 'CLIENT_PHONE_EXISTS') {
          setPhoneCheck('on-roster');
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
  }, []);

  /* trigger the debounced check whenever phone changes */
  useEffect(() => {
    if (phoneCheckTimer.current) clearTimeout(phoneCheckTimer.current);
    if (cleanPhone(phone).length >= 10) {
      phoneCheckTimer.current = setTimeout(() => { void doPhoneCheck(phone); }, 500);
    }
    return () => {
      if (phoneCheckTimer.current) clearTimeout(phoneCheckTimer.current);
    };
  }, [phone, doPhoneCheck]);

  /* derived */
  const showSplit =
    (data.trainer.workMode === 'gym' || data.trainer.workMode === 'both') &&
    deliveryMode === 'floor';
  const gymShare = 100 - trainerSplit;

  const eligibleTemplates =
    weekdays.size > 0
      ? data.templates.filter(t => (t.dayLabels?.length ?? 0) === weekdays.size)
      : data.templates;

  /* step navigation — back only, and only to allowed steps */
  const goBack = (target: Step) => {
    if (target >= step) return;
    if (createdClientId && target <= 2) return;
    setError(null);
    setStep(target);
  };

  /* step 1 */
  const handleStep1Continue = () => {
    if (!name.trim()) { setError('Enter their name.'); return; }
    const digits = cleanPhone(phone);
    if (digits.length < 10) { setError('Enter a 10-digit phone number.'); return; }
    if (phoneCheck === 'checking') { setError('Still checking this number — wait a moment.'); return; }
    if (phoneCheck === 'blocked') { setError('That number cannot be added.'); return; }
    setError(null);
    setStep(2);
  };

  /* step 2 */
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

  /* step 3 */
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

  /* step 4 */
  const handleApplyTemplate = async () => {
    if (!createdClientId || !selectedTemplateId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await applyTemplate(selectedTemplateId, { clientId: createdClientId });
      onClose();
      router.push(`/clients/${createdClientId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSubmitting(false);
    }
  };

  const goToClient = () => {
    onClose();
    if (createdClientId) router.push(`/clients/${createdClientId}`);
  };

  /* ── render ── */
  return (
    <>
      {/* Scrim behind the drawer */}
      <button
        className="scrim scrim--soft"
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
      />

      <div className="adrawer" role="dialog" aria-modal="true" aria-label="Add a client">

        {/* Header */}
        <div className="adrawer__hd">
          <span className="adrawer__t">Add a client</span>
          <button
            className="btn btn--icon btn--ghost btn--sm"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            <XIcon />
          </button>
        </div>

        {/* Step bar */}
        <StepBar current={step} clientCreated={!!createdClientId} onGoBack={goBack} />

        {/* Error banner */}
        {error && (
          <div style={{ padding: '8px 18px 0' }}>
            <div className="why why--warn" style={{ padding: '8px 12px' }}>
              <p style={{ margin: 0 }}>{error}</p>
            </div>
          </div>
        )}

        {/* ── Body ── */}
        <div className="adrawer__body">

          {/* STEP 1 — WHO */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="fld">
                <label className="fld__l" htmlFor="nc-name">Their name</label>
                <input
                  id="nc-name"
                  ref={nameRef}
                  className="ctl"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Arjun Subramanian"
                  autoComplete="off"
                  onKeyDown={e => { if (e.key === 'Enter') handleStep1Continue(); }}
                />
                <p className="fld__h">Use the name they are already known by.</p>
              </div>

              <div className="fld">
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
                      const v = e.target.value;
                      setPhone(v);
                      if (cleanPhone(v).length < 10) {
                        setPhoneCheck('idle');
                        setRosterMatch(null);
                      }
                    }}
                    placeholder="98410 22119"
                    inputMode="numeric"
                    autoComplete="tel"
                    onKeyDown={e => { if (e.key === 'Enter') handleStep1Continue(); }}
                  />
                </div>
                <p className="fld__h">
                  {phoneCheck === 'checking' ? (
                    <span style={{ color: 'var(--tx-ink-3)' }}>Checking…</span>
                  ) : phoneCheck === 'ok' ? (
                    <span style={{ color: 'var(--tx-accent-text)' }}>✓ Number is available</span>
                  ) : (
                    'Reminders and the invite both go to this number.'
                  )}
                </p>
              </div>

              {/* phone warnings */}
              {phoneCheck === 'on-roster' && !dismissedRosterWarn && (
                <div className="why why--warn" style={{ padding: '12px 14px' }}>
                  <p className="why__k" style={{ marginBottom: 4 }}>Already on your roster</p>
                  <p>
                    {rosterMatch
                      ? <><b>{rosterMatch.name}</b> has this number. </>
                      : <>Someone on your roster has this number. </>}
                    Two records for one person split their pack and history.
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    {rosterMatch && (
                      <Link
                        className="btn btn--secondary btn--sm"
                        href={`/clients/${rosterMatch.id}`}
                        onClick={onClose}
                      >
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
                <div className="why why--warn" style={{ padding: '12px 14px' }}>
                  <p className="why__k" style={{ marginBottom: 4 }}>This number cannot be added</p>
                  <p>
                    The number belongs to a trainer account or another trainer&apos;s
                    client — it cannot be on two rosters at once.
                  </p>
                </div>
              )}

              <div>
                <p className="micro">Any time later</p>
                <div className="card" style={{ marginTop: 8 }}>
                  <div className="card__b">
                    <div className="kv">
                      <span className="kv__k">
                        Program
                        <span className="small" style={{ marginLeft: 8 }}>After their first session</span>
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
              </div>
            </div>
          )}

          {/* STEP 2 — MONEY */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <p className="micro">On your profile</p>
                <div className="lgl" style={{ marginTop: 8 }}>
                  {ALL_MODES.map(mode => {
                    const info = WORK_MODE_INFO[mode];
                    const active = data.trainer.workMode === mode;
                    return (
                      <div key={mode} className="lrow" aria-selected={active}>
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
                <p className="small" style={{ marginTop: 6 }}>
                  Answered once at setup. Two of the three never ask who collects.
                </p>
              </div>

              <div>
                <p className="micro">Where they train</p>
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
              </div>

              <div className="why" style={{ padding: '10px 14px' }}>
                <p className="why__k" style={{ marginBottom: 2 }}>Pack selection — coming soon</p>
                <p style={{ margin: 0 }}>
                  Your price list is not yet accessible from the web. You can sell them a pack on the day they pay.
                </p>
              </div>

              {showSplit && (
                <div className="card">
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
            </div>
          )}

          {/* STEP 3 — WEEK */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              </div>

              {Array.from(weekdays)
                .sort((a, b) => a - b)
                .map(wd => {
                  const wdLabel = WEEKDAYS.find(w => w.n === wd)?.label ?? '';
                  const slots = slotsForDay(wd, data.workingHours);
                  const pickedTime = selectedSlots[wd];

                  if (slots.length === 0) {
                    return (
                      <div key={wd}>
                        <p className="micro">{wdLabel} · no working hours set</p>
                      </div>
                    );
                  }

                  return (
                    <div key={wd}>
                      <p className="micro">{wdLabel} · your hours</p>
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
                                setSelectedSlots(prev => {
                                  if (isPicked) {
                                    const copy = { ...prev };
                                    delete copy[wd];
                                    return copy;
                                  }
                                  return { ...prev, [wd]: slot.time };
                                })
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
            </div>
          )}

          {/* STEP 4 — PLAN */}
          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {eligibleTemplates.length === 0 ? (
                <div className="empty" style={{ minHeight: 240 }}>
                  <span className="empty__ic"><PackIcon size={22} /></span>
                  <p className="empty__t">No programs yet</p>
                  <p className="empty__b">
                    {weekdays.size > 0
                      ? `No programs with ${weekdays.size} day${weekdays.size > 1 ? 's' : ''} match.`
                      : 'Build a program template and apply it here.'}
                  </p>
                  <Link className="btn btn--secondary" href="/programs" onClick={onClose}>
                    Go to Programs
                  </Link>
                </div>
              ) : (
                <>
                  <p className="micro">Choose a program</p>
                  {weekdays.size > 0 && (
                    <p className="small" style={{ marginTop: -8 }}>
                      Showing programs with {weekdays.size} training day{weekdays.size > 1 ? 's' : ''}.
                    </p>
                  )}
                  <div className="lgl">
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
                          {t.dayLabels && <span className="tag">{t.dayLabels.length} days</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="adrawer__foot">
          {step === 1 && (
            <>
              <button
                className="btn btn--primary"
                type="button"
                onClick={handleStep1Continue}
              >
                Continue
              </button>
              <button className="btn btn--ghost" type="button" onClick={onClose}>
                Cancel
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <button
                className="btn btn--primary"
                type="button"
                disabled={submitting}
                onClick={() => void handleCreateClient(true)}
              >
                {submitting ? 'Saving…' : 'Continue'}
              </button>
              <button
                className="btn btn--ghost"
                type="button"
                disabled={submitting}
                onClick={() => void handleCreateClient(false)}
              >
                Skip — sell it on the day they pay
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <button
                className="btn btn--primary"
                type="button"
                disabled={submitting}
                onClick={() => void handleStep3Continue()}
              >
                {submitting ? 'Saving…' : 'Continue'}
              </button>
              <button
                className="btn btn--ghost"
                type="button"
                disabled={submitting}
                onClick={() => setStep(4)}
              >
                Skip for now
              </button>
            </>
          )}

          {step === 4 && (
            <>
              {eligibleTemplates.length > 0 && selectedTemplateId && (
                <button
                  className="btn btn--primary"
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleApplyTemplate()}
                >
                  {submitting ? 'Applying…' : 'Apply and finish'}
                </button>
              )}
              <button
                className="btn btn--ghost"
                type="button"
                disabled={submitting}
                onClick={goToClient}
              >
                {selectedTemplateId ? 'Skip for now' : 'Finish'}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
