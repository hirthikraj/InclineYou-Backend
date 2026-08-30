'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import {
  avatarToken, dayLong, formatMinute, initials, rupees,
} from '@/lib/today/time';
import type { RateSource } from '@/lib/today/day';
import type { ScheduleClient, ScheduleSession } from '@/lib/schedule/api';
import { bookSession } from '@/lib/schedule/actions';
import { lengthChoices, SNAP_MINUTES } from '@/lib/schedule/result';
import { collisionsAt, insideHours, suggestClients } from '@/lib/schedule/book';
import { Check, Search } from '@/components/shell/Icons';
import { Cross, Remote, WarnTriangle } from './Icons';

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
  sessions: ScheduleSession[];
  windows: { startMinute: number; endMinute: number }[];
  rates: RateSource;
  onClose: () => void;
  onBooked: () => void;
}

export function BookPanel({
  dayAt, minute, clients, sessions, windows, rates, onClose, onBooked,
}: BookPanelProps) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [mode, setMode] = useState<'floor' | 'remote' | null>(null);
  const [startMinute, setStartMinute] = useState(minute);

  const panelRef = useRef<HTMLElement | null>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    returnTo.current = document.activeElement;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  const at = dayAt + startMinute * 60_000;
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

  const collisions = collisionsAt(sessions, at, length);
  const outside = !insideHours(windows, at, length);
  const rate = client ? rates.perSession.get(client.id) ?? null : null;

  /*
   * The last-session warning. `packLeft` is what the newest package has left, so
   * booking one more when it reads 1 is the session that empties it — and a
   * trainer who knows that before booking is a trainer who has the renewal
   * conversation at the right moment rather than after the fact.
   */
  const emptiesPack = client?.packLeft === 1;
  const packEmpty = client?.packLeft === 0;

  const book = () => {
    if (!clientId) return;
    setError(null);
    start(async () => {
      const res = await bookSession({
        clientId,
        scheduledAt: at,
        durationMinutes: length,
        programId: client?.programId ?? null,
        // Sent only when the trainer changed it. Null means "use whatever this
        // client usually does" — freezing today's default onto the row would keep
        // drawing them on the floor forever after they switch to remote.
        deliveryMode: mode,
      });
      if (!res.ok) setError(res.message ?? 'The booking did not go through.');
      else onBooked();
    });
  };

  return (
    <>
      <div className="scrim scrim--soft" onClick={onClose} aria-hidden="true" />

      <aside
        ref={panelRef}
        tabIndex={-1}
        className="panel sch__panel"
        role="region"
        aria-label={`New session, ${dayLong(dayAt)} at ${formatMinute(startMinute)}`}
      >
        <div className="panel__hd">
          <div style={{ minWidth: 0 }}>
            <p className="panel__t">New session</p>
            <p className="small">
              {dayLong(dayAt)} · {formatMinute(startMinute)} – {formatMinute(startMinute + length)}
            </p>
          </div>
          <button
            className="btn btn--icon btn--ghost"
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{ marginLeft: 'auto' }}
          >
            <Cross size={16} />
          </button>
        </div>

        <div className="panel__body">
          {/*
            THE TIME IS A FIELD, NOT A HEADING.
            The click answered it, and a click can be off by a few minutes — so it
            is shown as what it is, an answer that can be corrected, at the app's
            own fifteen-minute step. A read-only heading here is how a booking
            ends up at 07:15 because the pointer was low.
          */}
          <div className="fld">
            <label className="fld__l" htmlFor="bk-time">
              Starts
            </label>
            <input
              id="bk-time"
              className="ctl"
              type="time"
              step={SNAP_MINUTES * 60}
              value={formatMinute(startMinute)}
              onChange={(e) => {
                const [h, m] = e.target.value.split(':').map(Number);
                if (Number.isFinite(h) && Number.isFinite(m)) setStartMinute(h * 60 + m);
              }}
            />
          </div>

          <div className="sect fld">
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

            <div className="sch__list" role="listbox" aria-label="Clients">
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
                  onClick={() => {
                    setClientId(c.id);
                    // Their length and their mode come back with them. Explicit
                    // rather than left as the previous pick's — see `length`.
                    setMinutes(null);
                    setMode(null);
                  }}
                >
                  <span className="av av--sm" style={{ background: avatarToken(c.id) }} aria-hidden="true">
                    {initials(c.name)}
                  </span>
                  <span className="sch__pickt">
                    <b>{c.name}</b>
                    {because && <i>{because}</i>}
                  </span>
                  {band === 1 && <span className="tag tag--acc">This hour</span>}
                  {c.id === clientId && <Check size={15} />}
                </button>
              ))}
            </div>
          </div>

          {client && (
            <>
              <div className="sect fld">
                <span className="fld__l">Length</span>
                <div className="row gap2 sch__wrap">
                  {lengthChoices(length).map((m) => (
                    <button
                      key={m}
                      className="chip"
                      type="button"
                      aria-pressed={length === m}
                      onClick={() => setMinutes(m)}
                    >
                      {m} min
                    </button>
                  ))}
                </div>
                <p className="fld__h">
                  {minutes === null
                    ? `${client.name}’s sessions are ${client.minutes} minutes.`
                    : `${client.name}’s sessions are usually ${client.minutes} minutes.`}
                </p>
              </div>

              <div className="sect fld">
                <span className="fld__l">Delivery</span>
                <div className="row gap2">
                  <button
                    className="chip"
                    type="button"
                    aria-pressed={delivery === 'floor'}
                    onClick={() => setMode('floor')}
                  >
                    Floor
                  </button>
                  <button
                    className="chip"
                    type="button"
                    aria-pressed={delivery === 'remote'}
                    onClick={() => setMode('remote')}
                  >
                    <Remote size={13} />
                    Remote
                  </button>
                </div>
              </div>

              <div className="sect">
                <div className="kv">
                  <span className="kv__k">Plan</span>
                  <span className="kv__v">{client.programName ?? 'No live plan'}</span>
                </div>
                <div className="kv">
                  <span className="kv__k">Package</span>
                  <span className="kv__v">
                    {client.packLeft != null && client.packTotal != null
                      ? `${client.packLeft} of ${client.packTotal} left`
                      : '—'}
                  </span>
                </div>
                <div className="kv">
                  <span className="kv__k">Worth</span>
                  <span className="kv__v">{rate ? rupees(rate) : 'No per-session rate'}</span>
                </div>
              </div>
            </>
          )}

          {/*
            THE VERDICTS. Every one of them names a fact, and none of them blocks.
            Three separate notes rather than one combined sentence, because they
            are three unrelated things to know and a trainer acts on them
            differently: a clash is a decision, out-of-hours is a shrug, and an
            empty pack is a conversation.
          */}
          <div className="sect col gap2">
            {collisions.length > 0 && (
              <p className="sch__note sch__note--danger">
                <WarnTriangle size={14} />
                <span>
                  {collisions.map((c) => c.clientName).join(', ')}{' '}
                  {collisions.length === 1 ? 'is' : 'are'} already booked across this slot.{' '}
                  {/* "draws both" was written against a fixture where a clash
                      meant two people. It is five on a real Thursday evening, and
                      "both" then names a pair that is not there — the reader
                      counts the names, finds five, and stops trusting the
                      sentence. The count is stated instead of implied, and it is
                      the count the grid will actually draw: this booking plus the
                      ones it lands on. */}
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
            {packEmpty && (
              <p className="sch__note sch__note--warn">
                <WarnTriangle size={14} />
                <span>{client?.name}’s package is already empty.</span>
              </p>
            )}
            {emptiesPack && (
              <p className="sch__note sch__note--warn">
                <WarnTriangle size={14} />
                <span>This is the last session on {client?.name}’s package.</span>
              </p>
            )}
            {error && (
              <p className="sch__err" role="alert">
                <WarnTriangle size={14} />
                {error}
              </p>
            )}
          </div>
        </div>

        <div className="panel__foot">
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className={collisions.length ? 'btn btn--secondary' : 'btn btn--primary'}
            type="button"
            disabled={!clientId || pending}
            onClick={book}
          >
            {pending ? 'Booking…' : collisions.length ? 'Book anyway' : 'Book session'}
          </button>
        </div>
      </aside>
    </>
  );
}
