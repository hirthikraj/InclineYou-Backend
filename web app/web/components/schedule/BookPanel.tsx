'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { dayLong, formatMinute, formatMinuteRange, rupees } from '@/lib/today/time';
import type { RateSource } from '@/lib/today/day';
import type { BookSession, ScheduleClient } from '@/lib/schedule/session';
import { bookSession, cancelSession } from '@/lib/schedule/actions';
import { useToast } from '@/lib/toast/store';
import { lengthChoices, SNAP_MINUTES } from '@/lib/schedule/result';
import { TimeField } from '@/components/shell/TimeField';
import { collisionsAt, insideHours, suggestClients } from '@/lib/schedule/book';
import { Check, Search } from '@/components/shell/Icons';
import { Cross, Remote, WarnTriangle } from './Icons';
import { useDismiss } from '@/lib/ui/dismiss';
import { Button } from '@/web-components/ui/Button';
import { Tag } from '@/web-components/ui/Tag';
import { Chip } from '@/web-components/ui/Chip';
import { KeyValueRow } from '@/web-components/ui/KeyValue';
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
  windows: { startMinute: number; endMinute: number }[];
  rates: RateSource;
  onClose: () => void;
  onBooked: () => void;
}

export function BookPanel({
  dayAt, minute, clients, clientId: asked = null, sessions, windows, rates, onClose, onBooked,
}: BookPanelProps) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { show } = useToast();
  const [query, setQuery] = useState('');
  const [clientId, setClientId] = useState<string | null>(asked);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [mode, setMode] = useState<'floor' | 'remote' | null>(null);
  const [startMinute, setStartMinute] = useState(minute);

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
    const requestId = attemptFor(`${clientId}|${at}|${length}|${mode ?? ''}`);
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
         makes it the other motion is `sessionId`: `cancelSession` is a real
         inverse, so this confirm can carry an Undo, and an Undo is only honest
         while the card is up. Five seconds, then it is a booking like any
         other and the way back is the block's own panel.

         The trainer is not messaged either way — `cancelSession` says so — so
         undoing inside the window costs nobody an explanation. */
      const id = res.sessionId;
      show({
        tone: 'ok',
        variant: 'receipt',
        title: <>Booked</>,
        body: (
          <>
            {client?.name ?? 'Session'} &middot; {dayLong(dayAt)} at {formatMinute(startMinute)}
          </>
        ),
        action: id ? { label: 'Undo', onClick: () => void cancelSession(id) } : undefined,
      });
      /* A booking that lands leaves the same way a cancelled one does. `onBooked`
         unmounts this panel AND refreshes the grid behind it, so calling it
         straight made the successful path the only one that snapped shut — the
         reward and the retreat with their motion the wrong way round. */
      dismissThen(onBooked);
    });
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
        aria-label={`New session, ${dayLong(dayAt)} at ${formatMinute(startMinute)}`}
      >
        <div className="panel__hd">
          <div style={{ minWidth: 0 }}>
            <p className="panel__t">New session</p>
            <p className="small">
              {dayLong(dayAt)} · {formatMinuteRange(startMinute, startMinute + length)}
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
          {/*
            THE TIME IS A FIELD, NOT A HEADING.
            The click answered it, and a click can be off by a few minutes — so it
            is shown as what it is, an answer that can be corrected, at the app's
            own fifteen-minute step. A read-only heading here is how a booking
            ends up at 07:15 because the pointer was low.
          */}
          <div className="fld">
            {/* A `<span>`, not a `<label htmlFor>`. `TimeField` is three
                controls, and `for` names exactly one — it would have pointed at
                whichever segment happened to carry the id and left the other
                two anonymous. The group takes the name instead, by id, which is
                the same fix the two windows in `WeekPicker` needed for the same
                reason and got in the opposite direction. */}
            <span className="fld__l" id="bk-time-l">
              Starts
            </span>
            <TimeField
              /* Both: `labelledBy` ties the group to the visible `Starts`
                 above it, and `label` is what each segment prefixes its own
                 name with — "Starts, hour", not "Time, hour". */
              labelledBy="bk-time-l"
              label="Starts"
              value={startMinute}
              onChange={setStartMinute}
              /* The arrows land on the quarter-hours the grid snaps a drag to —
                 this was `step={SNAP_MINUTES * 60}` on the native control, in
                 seconds because that is the unit `type="time"` counts in. */
              step={SNAP_MINUTES}
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

          {client && (
            <>
              <div className="sect fld">
                <span className="fld__l">Length</span>
                <div className="row gap2 sch__wrap">
                  {lengthChoices(length).map((m) => (
                    <Chip
                      pressed={length === m}
                      key={m}
                      onClick={() => setMinutes(m)}
                    >
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

              <div className="sect fld">
                <span className="fld__l">Delivery</span>
                <div className="row gap2">
                  <Chip
                    pressed={delivery === 'floor'}
                    onClick={() => setMode('floor')}
                  >
                    In Person
                  </Chip>
                  <Chip
                    pressed={delivery === 'remote'}
                    onClick={() => setMode('remote')}
                  >
                    <Remote size={13} />
                    Online
                  </Chip>
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
          <Button variant="ghost" onClick={dismiss}>
            Cancel
          </Button>
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
