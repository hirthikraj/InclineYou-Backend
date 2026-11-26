'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { dayLong, formatMinute, formatMinuteRange, rupees } from '@/lib/today/time';
import type { RateSource } from '@/lib/today/day';
import type { BookSession, ScheduleClient } from '@/lib/schedule/session';
import { bookSession, undoBooking } from '@/lib/schedule/actions';
import { useToast } from '@/lib/toast/store';
import { lengthChoices, SNAP_MINUTES } from '@/lib/schedule/result';
import { TimeField } from '@/components/shell/TimeField';
import { collisionsAt, insideHours, suggestClients } from '@/lib/schedule/book';
import { Check, ChevronLeft, Search } from '@/components/shell/Icons';
import { SlotPicker } from '@/web-components/ui/SlotPicker';
import { openTimes, weekDays, weekTitle, windowsOn, zoneLabel } from '@/lib/schedule/slots';
import type { WorkWindow } from '@/lib/today/day';
import { DAY_MS, MONTHS_LONG, startOfDay, startOfWeek } from '@/lib/today/time';
import { Cross, Remote, WarnTriangle } from './Icons';
import { useDismiss } from '@/lib/ui/dismiss';
import { Button } from '@/web-components/ui/Button';
import { Tag } from '@/web-components/ui/Tag';
import { Chip } from '@/web-components/ui/Chip';
import { KeyValueRow } from '@/web-components/ui/KeyValue';
import { TextField } from '@/web-components/ui/Field';
import {
  BILLING_CHOICES, coverage, coverageLine, defaultBilling, isProspect, noPackLine, readPrice, serviceOf, type Billing,
} from '@/lib/schedule/billing';
import { Avatar } from '@/web-components/ui/Avatar';

/**
 * NEW SESSION — AND THE CLICK ANSWERED THREE OF THE FIVE QUESTIONS.
 *
 * Frames 4a and 4b. A booking needs five answers: which day, what time, who, how
 * long, and against which plan. Opening this from a click on the grid supplies
 * the first two and the form asks the rest — which is why the roster is a ranked
 * list here and an alphabetical scroll on the phone. `lib/schedule/book.ts`
 * carries the ranking and why it is deliberately not cleverer.
 *
 * ── PICKING THE CLIENT REDRAWS THE PICTURE ───────────────────────────────────
 *
 * Frame 4b's whole subject: the block goes from 60 to whatever THIS client's
 * sessions are, because `session_duration_minutes` is theirs and not a default.
 * Picking somebody therefore changes the length, the delivery mode and the plan
 * in one step — and every one of those is still editable afterwards, because a
 * default that cannot be overridden is a rule wearing a control's clothes.
 *
 * ── WHAT IS WARNED ABOUT AND WHAT IS REFUSED ─────────────────────────────────
 *
 * Nothing is refused except a booking with no client, which is not a booking.
 * A clash is NAMED — "Arjun S is already here" — and the button still books,
 * because the trainer sometimes means it and because a wall they cannot pass is a
 * wall they work around by guessing. Outside working hours is stated the same
 * way and for the reason `WorkingHoursScreen` states on itself: those hours
 * constrain what a client can self-book and have never constrained the trainer.
 *
 * The one thing that changes the BUTTON is the clash: it goes secondary and reads
 * *Book anyway*. Same action, different sentence — which is the difference
 * between error prevention and an obstacle.
 */

interface BookPanelProps {
  /** The day the click landed on, at local midnight. */
  dayAt: number;
  /** Minutes from midnight, already snapped to fifteen. */
  minute: number;
  clients: ScheduleClient[];
  /**
   * Who the click already named, or null.
   *
   * Only the week-by-client pivot sets it: a cell there is the intersection of a
   * person and a day, so the form opens with three of its five questions
   * answered instead of two. Everything downstream still derives from the
   * picked client the way it always did — the length, the delivery mode, the
   * rate and the pack warning are all read off `clientId` — so seeding the state
   * is the whole change, and the roster below stays open and re-pickable rather
   * than collapsing into a fact. A default that cannot be overridden is a rule
   * wearing a control's clothes.
   */
  clientId?: string | null;
  /**
   * Every session the opening screen holds, in the five fields this form reads.
   *
   * The schedule passes its own window; Today passes the thirty days it already
   * fetched. Wider than the day being booked on purpose — `suggestClients` ranks
   * on *trains around this hour on Thursdays*, and one day's rows cannot say
   * that about anybody. `collisionsAt` narrows to the slot's own day itself.
   */
  sessions: BookSession[];
  /** The opening day's merged windows — the fallback when `hours` is not given. */
  windows: { startMinute: number; endMinute: number }[];
  /**
   * Every `working_hours` row. With it, step 2's week strip can say which times
   * are open on ANY day, not only the one the panel opened on.
   */
  hours?: WorkWindow[];
  /**
   * Fetches one Monday-first week of the diary, so a day outside the screen's
   * own window is counted against its real bookings. Without it the strip
   * counts against `sessions` alone.
   */
  loadWeek?: (weekStart: number) => Promise<BookSession[] | null>;
  /**
   * The minute was CLICKED on the grid, so keep it. Otherwise (the + button, a
   * default slot) it is a guess, and step 2 snaps it to the day's first open time.
   */
  exact?: boolean;
  /** The screen's clock (`useNow`) — no `Date.now()` during render (trap 20). */
  now: number;
  rates: RateSource;
  onClose: () => void;
  onBooked: () => void;
}

export function BookPanel({
  dayAt, minute, clients, clientId: asked = null, sessions, windows, hours, loadWeek, now, exact = false, rates, onClose, onBooked,
}: BookPanelProps) {
  /* TWO STEPS (23 Nov 2026). Step 1 asks WHO and nothing else; step 2 asks
     everything that follows from the answer — length, delivery, when, paid by —
     with Back to change the client. Opened from the week-by-client pivot the
     client is already named, so it opens on step 2. */
  const [step, setStep] = useState<1 | 2>(asked ? 2 : 1);
  const [day, setDay] = useState(startOfDay(dayAt));
  const [weekAt, setWeekAt] = useState(startOfWeek(dayAt));
  const [otherOpen, setOtherOpen] = useState(false);
  // A day picked before its week's diary arrived: snapped once the rows land.
  const [snapOn, setSnapOn] = useState<number | null>(null);
  const [weeks, setWeeks] = useState<ReadonlyMap<number, BookSession[]>>(() => new Map());
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { show } = useToast();
  const [query, setQuery] = useState('');
  const [clientId, setClientId] = useState<string | null>(asked);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [mode, setMode] = useState<'floor' | 'remote' | null>(null);
  // V32: how this booking is paid for. Null until the trainer picks one, and then
  // it follows the client: a trial for a prospect, a pack for everyone else
  // (`defaultBilling`). The price is only asked for, and only sent, for a single session.
  const [billingPicked, setBilling] = useState<Billing | null>(null);
  const [priceText, setPriceText] = useState<string | null>(null);
  const [startMinute, setStartMinute] = useState(minute);
  // Whether the start is still the guess `exact` describes; cleared once snapped.
  const guessed = useRef(!exact && !asked);

  const returnTo = useRef<Element | null>(null);

  /* ── CLOSING IS TWO STEPS, AND THE PANEL OWNS THE FIRST ────────────────────
   *
   * The same split `SessionPanel` takes, for the same reason and out of the same
   * hook: `onClose` unmounts this box, so calling it directly gave the panel a
   * 240ms arrival and no departure. `dismiss` applies webapp.css's closed state,
   * waits for the transition it starts, and then unmounts. It also retires the
   * `closeRef` below, because `dismiss` is stable and the mount effect can now
   * name its dependency honestly — `lib/ui/dismiss.ts` keeps that same guard one
   * level down, where the inline arrow from `Schedule` actually lands. */
  const { closing, dismiss, dismissThen, ref: panelRef } = useDismiss<HTMLElement>(onClose);

  /*
   * ── THE PANEL USED TO STEAL FOCUS EVERY THIRTY SECONDS ────────────────────
   *
   * This effect mounts the panel: it remembers what was focused, focuses the
   * panel, and binds Escape. All three are once-per-open things, and it was
   * keyed `[onClose]` — a prop `Schedule` passes as an inline arrow, so a NEW
   * FUNCTION on every render of the parent.
   *
   * `Schedule` calls `useNow`, which `setNow`s on a 30-second interval. So
   * every thirty seconds the parent re-rendered, `onClose` changed identity,
   * this effect tore down and re-ran — and its cleanup calls
   * `returnTo.current?.focus()`, which throws focus back to the control that
   * opened the panel before the body focuses the panel again. Mid-sentence, in
   * whatever field the trainer was typing into.
   *
   * FOUND BY TYPING INTO THE NEW TIME FIELD and watching `focusin
   * INPUT.tfld__n` be followed immediately by `focusin ASIDE.panel` with no
   * keystroke in between. It is not a new bug and not that field's: the roster
   * search box here and the notes textarea in the sibling panel have been
   * losing focus to it too. A segmented field only made it impossible to miss,
   * because it takes four keystrokes where a text box takes one.
   *
   * The handler goes in a ref so the effect can key on `[]` and mean it.
   * Escape still calls the LATEST `onClose` — the ref is kept current by its
   * own effect above — which is the whole reason the dependency was there.
   */
  useEffect(() => {
    returnTo.current = document.activeElement;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        dismiss();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, [dismiss, panelRef]);

  /* Each week the strip shows is fetched once (`loadWeek`) so its counts are
     against that week's real bookings. setState lands in the promise, never
     synchronously in the effect. */
  useEffect(() => {
    if (!loadWeek || weeks.has(weekAt)) return;
    let live = true;
    void loadWeek(weekAt).then((rows) => {
      if (live && rows) setWeeks((m) => new Map(m).set(weekAt, rows));
    });
    return () => {
      live = false;
    };
  }, [loadWeek, weekAt, weeks]);

  const known = useMemo(() => {
    const byId = new Map<string, BookSession>();
    for (const s of sessions) byId.set(s.id, s);
    for (const rows of weeks.values()) for (const s of rows) byId.set(s.id, s);
    return [...byId.values()];
  }, [sessions, weeks]);

  const windowsFor = (d: number) =>
    hours ? windowsOn(hours, d) : d === startOfDay(dayAt) ? windows : [];
  const dayWindows = windowsFor(day);

  const at = day + startMinute * 60_000;
  const client = clients.find((c) => c.id === clientId) ?? null;

  // The length is the CLIENT's until the trainer says otherwise. `minutes` stays
  // null while it is theirs, so picking a second client re-reads their length
  // rather than keeping the first one's — which is the bug a `useState(60)`
  // seeded from the first pick would produce and never show.
  const length = minutes ?? client?.minutes ?? 60;
  const delivery = mode ?? client?.mode ?? 'floor';

  const suggestions = useMemo(
    () => suggestClients(clients, sessions, at),
    [clients, sessions, at],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suggestions;
    return suggestions.filter((s) => s.client.name.toLowerCase().includes(q));
  }, [suggestions, query]);

  const collisions = collisionsAt(known, at, length);
  const outside = !insideHours(dayWindows, at, length);

  /* ── WHEN: the week strip and the open times ─────────────────────────── */
  const today = startOfDay(now);
  const weekLoaded = !loadWeek || weeks.has(weekAt);
  const stripDays = weekDays(weekAt).map((d) => {
    const date = new Date(d);
    return {
      at: d,
      label: d === today ? 'Today' : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()],
      date: date.getDate(),
      open: weekLoaded ? openTimes(windowsFor(d), known, d, length, now).length : null,
    };
  });
  const times = openTimes(dayWindows, known, day, length, now);
  const offered = times.includes(startMinute);
  const showOther = otherOpen || !offered;
  // Adjust-during-render (trap 21): the week has landed, so the day's first
  // open time is now known against its real bookings.
  if (snapOn !== null && weekLoaded && snapOn === day) {
    setSnapOn(null);
    if (!offered && times[0] !== undefined) setStartMinute(times[0]);
  }
  const dayDate = new Date(day);
  const caption = `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayDate.getDay()]} ${dayDate.getDate()} ${MONTHS_LONG[dayDate.getMonth()].slice(0, 3)} · ${
    times.length === 1 ? '1 open time' : `${times.length} open times`}`;
  const emptyLine = day < today
    ? 'This day has passed. Type a time below to back-date a session.'
    : hours && hours.length === 0
      ? 'No working hours set, so nothing is offered. Type a time below.'
      : dayWindows.length === 0
        ? 'You do not work this day. You can still book — type a time below.'
        : 'Nothing open at this length. Type a time below to book anyway.';

  const pickDay = (d: number) => {
    guessed.current = false;
    setDay(d);
    // Land on the day's first open time; with none, the typed field takes over.
    const first = openTimes(windowsFor(d), known, d, length, now)[0];
    if (first !== undefined) setStartMinute(first);
    if (loadWeek && !weeks.has(startOfWeek(d))) setSnapOn(d);
  };
  const moveWeek = (by: number) => {
    const next = startOfWeek(weekAt + by * 7 * DAY_MS + DAY_MS / 2);
    setWeekAt(next);
    pickDay(next === startOfWeek(today) ? today : next);
  };
  const goStep = (n: 1 | 2) => {
    setStep(n);
    requestAnimationFrame(() => panelRef.current?.focus());
  };
  const rate = client ? rates.perSession.get(client.id) ?? null : null;

  /*
   * THE MONEY LINE (V32). It used to read the newest package's count alone, so
   * "6 of 12 left" said nothing about the six sessions already booked against
   * it, a floor pack answered for an online booking, and a paused pack looked
   * live. `coverage` asks the server's question instead — which live, unpaused
   * pack of THIS service will pay when it is marked done — and subtracts what is
   * already booked. It never blocks: a booking the pack does not cover is still
   * a booking, and the sentence says what will happen when it is delivered.
   */
  const gymClient = client?.billing?.gymClient ?? false;
  // Picking a gym client after choosing Single falls back to the pack: Single is not theirs to have.
  const billingWanted: Billing = billingPicked ?? defaultBilling(client);
  const billing: Billing = gymClient && billingWanted === 'single' ? 'pack' : billingWanted;
  const service = serviceOf(mode, client?.billing ?? null);
  const covered = client ? coverage(client.billing, service, at) : null;
  const moneyLine = client && covered && billing === 'pack' ? coverageLine(covered, client.name, service) : null;
  // A single session is priced at the client's per-session rate until the trainer types another.
  const priceShown = priceText ?? (rate ? String(rate) : '');
  const price = billing === 'single' ? readPrice(priceShown) : null;
  const priceMissing = billing === 'single' && price === null;

  /*
   * One id per booking attempt (1.1 Conventions · Ids & retries). Pressing
   * Book again after a failure with the same client, time, length and mode is
   * a retry of the same booking and reuses it, so a first try that landed but
   * never answered replays instead of double-booking. Changing any of those
   * makes it a different booking, with a new id.
   */
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const attemptFor = (key: string): string => {
    if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
    return attempt.current.id;
  };

  const book = () => {
    if (!clientId) return;
    setError(null);
    if (priceMissing) {
      setError('A single session needs a price.');
      return;
    }
    const requestId = attemptFor(`${clientId}|${at}|${length}|${mode ?? ''}|${billing}|${price ?? ''}`);
    start(async () => {
      const res = await bookSession({
        requestId,
        clientId,
        scheduledAt: at,
        durationMinutes: length,
        programId: client?.programId ?? null,
        // Sent only when the trainer changed it. Null means "use whatever this
        // client usually does" — freezing today's default onto the row would keep
        // drawing them on the floor forever after they switch to remote.
        deliveryMode: mode,
        billing,
        price,
      });
      if (!res.ok) {
        setError(res.message ?? 'The booking did not go through.');
        return;
      }
      attempt.current = null;
      /* A RECEIPT, NOT A NOTICE, and the difference is the deadline.
         The panel closes over the grid it just wrote to, and on the day and
         week views the new block is usually below the fold or behind the
         scroller — so there is no row on screen for the write to land on. What
         makes it the other motion is `sessionId`: `undoBooking` (DELETE, R12) is
         a real inverse, so this confirm can carry an Undo, and an Undo is only honest
         while the card is up. Five seconds, then it is a booking like any
         other and the way back is the block's own panel.

         The trainer is not messaged either way, so
         undoing inside the window costs nobody an explanation. */
      const id = res.sessionId;
      show({
        tone: 'ok',
        variant: 'receipt',
        title: <>Booked</>,
        body: (
          <>
            {client?.name ?? 'Session'} &middot; {dayLong(day)} at {formatMinute(startMinute)}
            {/* 10 Nov 2026: a single session is sold when it is booked — owed, due on its day. */}
            {billing === 'single' && price ? <> &mdash; {client?.name.split(' ')[0] ?? 'They'} owes {rupees(Number(price))}, due that day.</> : null}
          </>
        ),
        /* A single session's sale goes with the booking, so its receipt stays up as
           long as a sold pack's (10 s); the server allows the Undo for 10 minutes. */
        ...(billing === 'single' ? { duration: 10_000 } : {}),
        action: id ? {
          label: 'Undo',
          onClick: () => void undoBooking(id).then((back) => {
            if (!back.ok) show({ tone: 'danger', title: <>Could not undo</>, body: back.message });
          }),
        } : undefined,
      });
      /* A booking that lands leaves the same way a cancelled one does. `onBooked`
         unmounts this panel AND refreshes the grid behind it, so calling it
         straight made the successful path the only one that snapped shut — the
         reward and the retreat with their motion the wrong way round. */
      dismissThen(onBooked);
    });
  };

  const pickClient = (id: string) => {
    if (guessed.current) {
      guessed.current = false;
      const len = clients.find((c) => c.id === id)?.minutes ?? 60;
      const first = openTimes(windowsFor(day), known, day, len, now)[0];
      if (first !== undefined) setStartMinute(first);
    }
    if (id !== clientId) {
      setClientId(id);
      // Their length and their mode come back with them. Explicit
      // rather than left as the previous pick's — see `length`.
      setMinutes(null);
      setMode(null);
      setBilling(null);
      setPriceText(null);
    }
    goStep(2);
  };

  return (
    <>
      <div
        className={`scrim scrim--soft${closing ? ' scrim--out' : ''}`}
        onClick={dismiss}
        aria-hidden="true"
      />

      <aside
        ref={panelRef}
        tabIndex={-1}
        className={`panel sch__panel${closing ? ' panel--out' : ''}`}
        role="region"
        aria-label={step === 1
          ? 'New session, choose a client'
          : `New session, ${dayLong(day)} at ${formatMinute(startMinute)}`}
      >
        <div className="panel__hd">
          {step === 2 && (
            <Button
              variant="ghost"
              iconOnly
              label="Back to choosing a client"
              onClick={() => goStep(1)}
              icon={<ChevronLeft size={16} />}
            />
          )}
          <div style={{ minWidth: 0 }}>
            <p className="panel__t">New session</p>
            <p className="small">
              {step === 1
                ? 'Step 1 of 2 · Who is it for?'
                : `${dayLong(day)} · ${formatMinuteRange(startMinute, startMinute + length)}`}
            </p>
          </div>
          <Button
            variant="ghost"
            iconOnly
            label="Close"
            onClick={dismiss}
            style={{ marginLeft: 'auto' }}
            title={undefined}
            icon={<Cross size={16} />}
          />
        </div>

        <div className="panel__body">
          {step === 1 && (
            <div className="fld">
              <span className="fld__l">Who</span>
              <div className="search">
                <Search size={15} />
                <input
                  type="search"
                  value={query}
                  placeholder="Search the roster"
                  aria-label="Search the roster"
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              <div className="sch__list sch__list--tall" role="listbox" aria-label="Clients">
                {filtered.length === 0 && (
                  <p className="small" style={{ padding: '10px 2px' }}>
                    Nobody on the roster matches “{query.trim()}”.
                  </p>
                )}
                {filtered.slice(0, 40).map(({ client: c, band, because }) => (
                  <button
                    key={c.id}
                    type="button"
                    role="option"
                    aria-selected={c.id === clientId}
                    className="rowpick sch__pick"
                    onClick={() => pickClient(c.id)}
                  >
                    <Avatar name={c.name} id={c.id} size="sm" />
                    <span className="sch__pickt">
                      <b>{c.name}</b>
                      {because && <i>{because}</i>}
                    </span>
                    {band === 1 && <Tag tone="acc">This hour</Tag>}
                    {c.id === clientId && <Check size={15} />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && client && (
            <>
              <div className="sch__who">
                <Avatar name={client.name} id={client.id} size="sm" />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{client.name}</b>
                  <i>{client.programName ?? 'No live plan'}</i>
                </span>
                <Button variant="ghost" size="sm" onClick={() => goStep(1)}>
                  Change
                </Button>
              </div>

              <div className="sect fld">
                <span className="fld__l">Delivery</span>
                <div className="row gap2">
                  <Chip pressed={delivery === 'floor'} onClick={() => setMode('floor')}>
                    In Person
                  </Chip>
                  <Chip pressed={delivery === 'remote'} onClick={() => setMode('remote')}>
                    <Remote size={13} />
                    Online
                  </Chip>
                </div>
              </div>

              <div className="sect fld">
                <span className="fld__l">Length</span>
                <div className="row gap2 sch__wrap">
                  {lengthChoices(length).map((m) => (
                    <Chip pressed={length === m} key={m} onClick={() => setMinutes(m)}>
                      {m} min
                    </Chip>
                  ))}
                </div>
                <p className="fld__h">
                  {minutes === null
                    ? `${client.name}’s sessions are ${client.minutes} minutes.`
                    : `${client.name}’s sessions are usually ${client.minutes} minutes.`}
                </p>
              </div>

              {/* WHEN. The open times are an OFFER — working hours minus what is
                  booked — and *Another time* is always there, because those hours
                  limit what a client can self-book and never limit the trainer. */}
              <div className="sect fld">
                <SlotPicker
                  title={weekTitle(weekAt, now)}
                  hint={`Times in ${zoneLabel(now)}`}
                  days={stripDays}
                  dayAt={day}
                  onDay={pickDay}
                  onPrevWeek={() => moveWeek(-1)}
                  onNextWeek={() => moveWeek(1)}
                  caption={caption}
                  times={times.map((m) => ({ minute: m, label: formatMinute(m) }))}
                  minute={offered && !otherOpen ? startMinute : null}
                  onTime={(m) => {
                    setStartMinute(m);
                    setOtherOpen(false);
                  }}
                  empty={emptyLine}
                />
                <div className="sch__other">
                  {showOther ? (
                    <>
                      <span className="fld__l" id="bk-time-l">Another time</span>
                      <TimeField
                        labelledBy="bk-time-l"
                        label="Starts"
                        value={startMinute}
                        onChange={(m) => {
                          setStartMinute(m);
                          setOtherOpen(true);
                        }}
                        step={SNAP_MINUTES}
                      />
                    </>
                  ) : (
                    <Button variant="ghost" size="sm" className="bk-other" onClick={() => setOtherOpen(true)}>
                      Another time
                    </Button>
                  )}
                </div>
              </div>

              <div className="sect">
                <KeyValueRow k="Plan">{client.programName ?? 'No live plan'}</KeyValueRow>
                <KeyValueRow k="Package">
                  {client.packLeft != null && client.packTotal != null
                    ? `${client.packLeft} of ${client.packTotal} left`
                    : '—'}
                </KeyValueRow>
                <KeyValueRow k="Worth">{rate ? rupees(rate) : 'No per-session rate'}</KeyValueRow>
              </div>

              {/* PAID BY (V32). Four answers to one question, and the default is
                  today's: the pack pays when it is marked done. Trial and Free are
                  free on purpose, so they never turn up later as money to chase;
                  Single is sold on its own when it is booked. A gym client buys
                  only the gym's packs, so Single is not offered to one. */}
              <div className="sect fld">
                <span className="fld__l">Paid by</span>
                <div className="row gap2 sch__wrap">
                  {BILLING_CHOICES.filter((b) => b.id !== 'single' || !gymClient).map((b) => (
                    <Chip key={b.id} pressed={billing === b.id} onClick={() => setBilling(b.id)}>
                      {b.label}
                    </Chip>
                  ))}
                </div>
                {billing === 'single' && (
                  <div style={{ marginTop: 8 }}>
                    <TextField
                      label="Price (₹)"
                      numeric
                      inputMode="decimal"
                      width={140}
                      value={priceShown}
                      onChange={(e) => setPriceText(e.target.value)}
                      error={priceMissing && priceShown !== '' ? 'A price above 0, like 800' : undefined}
                    />
                  </div>
                )}
                <p className="fld__h">
                  {billing === 'pack' && 'Taken off their pack when you mark it done.'}
                  {billing === 'trial' && (isProspect(client) && billingPicked === null
                    ? `${client.name.split(' ')[0]} hasn’t bought anything yet, so this is booked as a trial — delivered free, never charged.`
                    : 'A trial before they buy — delivered free, never charged.')}
                  {billing === 'complimentary' && 'Free — delivered, never charged.'}
                  {billing === 'single' && 'Sold on its own when you book it: owed from the session’s day until it’s paid. Their pack is not touched.'}
                </p>
              </div>

              {/*
                THE VERDICTS. Every one of them names a fact, and none of them blocks.
                Three separate notes rather than one combined sentence: a clash is a
                decision, out-of-hours is a shrug, and an empty pack is a conversation.
              */}
              <div className="sect col gap2">
                {collisions.length > 0 && (
                  <p className="sch__note sch__note--danger">
                    <WarnTriangle size={14} />
                    <span>
                      {collisions.map((c) => c.clientName).join(', ')}{' '}
                      {collisions.length === 1 ? 'is' : 'are'} already booked across this slot.{' '}
                      Booking here draws all {collisions.length + 1} side by side.
                    </span>
                  </p>
                )}
                {outside && (
                  <p className="sch__note sch__note--warn">
                    <WarnTriangle size={14} />
                    <span>
                      This falls outside your working hours. That is allowed — your hours only
                      limit what a client can book themselves.
                    </span>
                  </p>
                )}
                {/* NO PACK (25 Nov 2026, review §5 P0). A client who has bought
                    before and has no pack for this day is the leak: say it, and
                    put the two ways to make it paid beside the sentence. A
                    prospect is already defaulted to Trial, so keeps the plain line. */}
                {moneyLine && covered?.kind === 'none' && client && !isProspect(client) ? (
                  <div className="sch__note sch__note--warn">
                    <WarnTriangle size={14} />
                    <span>
                      <Tag tone="warn">No pack</Tag>{' '}
                      {noPackLine({ at }, client.billing, client.name.split(' ')[0] || client.name)}
                      <span className="row gap2 sch__wrap" style={{ marginTop: 8 }}>
                        <Button href={`/clients/${client.id}/payments?renew=1`} variant="secondary" size="sm">
                          Renew
                        </Button>
                        {!gymClient && (
                          <Button variant="secondary" size="sm" onClick={() => setBilling('single')}>
                            Make it single{rate ? <> &middot; {rupees(rate)}</> : null}
                          </Button>
                        )}
                      </span>
                    </span>
                  </div>
                ) : moneyLine && (
                  <p className={moneyLine.warn ? 'sch__note sch__note--warn' : 'sch__note'}>
                    {moneyLine.warn ? <WarnTriangle size={14} /> : <Check size={14} />}
                    <span>{moneyLine.text}</span>
                  </p>
                )}
                {error && (
                  <p className="sch__err" role="alert">
                    <WarnTriangle size={14} />
                    {error}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="panel__foot">
          {step === 1 ? (
            <>
              <Button variant="ghost" onClick={dismiss}>
                Cancel
              </Button>
              <Button variant="primary" disabled={!clientId} onClick={() => goStep(2)}>
                Next
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => goStep(1)}>
                Back
              </Button>
              <button
                className={collisions.length ? 'btn btn--secondary' : 'btn btn--primary'}
                type="button"
                disabled={!clientId || pending}
                onClick={book}
              >
                {pending ? 'Booking…' : collisions.length ? 'Book anyway' : 'Book session'}
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
