'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';

import {
  avatarToken, dayLong, formatMinute, formatSpan, initials, minuteOfDay, rupees,
} from '@/lib/today/time';
import type { ScheduleClient, ScheduleSession } from '@/lib/schedule/api';
import { lengthChoices } from '@/lib/schedule/result';
import {
  cancelSession, markDone, markNoShow, updateSession,
} from '@/lib/schedule/actions';
import { Calendar, Check, Chevron } from '@/components/shell/Icons';
import { Cross, Remote, WarnTriangle } from './Icons';

/**
 * ONE SESSION — AND ITS LENGTH.
 *
 * Frame 6a. The first pass of this screen had a panel that could not name a
 * duration, on a product that has stored one per client since schema V2; §01.2 of
 * the design set is that finding. So length is a CONTROL here, not a constant:
 * three chips for the three lengths `BookSheet.tsx` offers, plus 45, which no
 * client in the design's fixture has and any imported one can.
 *
 * ── IT IS A PANEL, AND THAT MEANS IT IS NOT MODAL ────────────────────────────
 *
 * webapp.css: *"A sheet slides over the thing you were looking at; a panel sits
 * beside it, so you can read the client while you edit the client."* And the
 * scrim behind it is `--scrim-soft` rather than `--scrim`, with a measured reason
 * kept as a comment in the stylesheet: a 66% wash dropped the panel's neighbour
 * to 1.8:1, which contradicts the panel's whole purpose.
 *
 * Two things follow, and they are the opposite of the usual dialog checklist:
 *
 *   · **No focus trap.** Tabbing out of the panel into the week behind it is the
 *     point. `aria-modal` is therefore absent rather than `false` — the attribute
 *     is not the way to say "this is not a dialog".
 *   · **Escape still closes it**, and focus returns to whatever opened it, which
 *     on this screen is a block in a grid a keyboard user would otherwise have to
 *     re-find from the top.
 *
 * On a phone it becomes a bottom sheet, and there the reasoning inverts: 390px
 * has no room to sit beside anything, so the panel covers the week and the scrim
 * goes solid. That is one rule in app.css, not a second component.
 *
 * ── AND IT IS ONLY REACHED BY SESSIONS THAT HAVE NOT HAPPENED — 28 Aug 2026 ──
 *
 * A click on a PAST block now goes to `/sessions/{id}` and never opens this
 * panel; `Schedule.tsx`'s `openSessionById` carries the argument. What is left
 * here is a session still to come or one running now, which is exactly the set
 * this panel's controls are for — a delivered session has nothing to decide, and
 * its record does not fit beside a week grid.
 *
 * The panel is still reachable for a settled session by deep link, so every
 * `settled` branch below stays.
 *
 * ── EDITS ARE STAGED, AND ONE SAVE COMMITS THEM ─────────────────────────────
 *
 * Length and delivery used to `PUT` on the chip press and the note had a Save of
 * its own, so changing all three was three round trips and two of them were
 * invisible. `updateSession` is a `PUT` that REPLACES the row, which makes three
 * separate writes of one edit the wrong shape twice over: it is three chances for
 * a half-applied session, and the second write is built from a row the first one
 * has already changed.
 *
 * So the three controls hold local state, `dirty` compares it against the row,
 * and Save sends all of it in the single `PUT` the endpoint wanted. Discard puts
 * the row back. Nothing is written until one of them is pressed, which also means
 * a trainer who opened a panel to look at a client's pack cannot change the
 * session by brushing a chip.
 *
 * The panel is keyed on `session.id` in `Schedule.tsx`, which is what makes this
 * state safe: clicking a second block while the first is open remounts rather
 * than carrying the first session's staged note onto the second one.
 */

interface SessionPanelProps {
  session: ScheduleSession;
  client: ScheduleClient | undefined;
  rate: number | null;
  /**
   * The ticking instant, from the shell.
   *
   * NOT `Date.now()` in the body of this component. Two reasons, and only the
   * second is about lint: a component that reads the clock while rendering is
   * impure — React may replay a render and get a different sentence — and the
   * shell already owns a `now` that ticks, so a second clock here would let the
   * panel and the grid behind it disagree about how late a session is while both
   * are on screen.
   */
  now: number;
  onClose: () => void;
  /** Told when a write lands, so the shell can clear its own optimistic state. */
  onChanged?: () => void;
  /**
   * Enter the grid's move mode. Owned by `Schedule.tsx` rather than by this
   * panel, because moving is a conversation between the panel and the GRID —
   * the panel names the session, the grid takes the second click.
   */
  onMove?: () => void;
}

export function SessionPanel({
  session, client, rate, now, onClose, onChanged, onMove,
}: SessionPanelProps) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  /* Staged, not written. See the note on this file about why all three moved off
     the chip press and onto one Save. */
  const [minutes, setMinutes] = useState(session.minutes);
  const [mode, setMode] = useState(session.mode);
  const [notes, setNotes] = useState(session.notes ?? '');

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
      // Focus goes back to the block that opened this. Without it a keyboard user
      // lands at the top of the document and re-walks the rail to get back.
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  const startMinute = minuteOfDay(session.at);
  const endMinute = startMinute + session.minutes;

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.message ?? 'That did not go through.');
      else onChanged?.();
    });
  };

  const settled = session.done || session.noShow || session.dead;

  /*
   * WHAT IS STAGED, AND WHETHER ANY OF IT DIFFERS FROM THE ROW.
   *
   * Compared against the SESSION rather than against a snapshot taken on mount,
   * so a save settles the button on its own: `router.refresh()` re-renders the
   * grid, the new row arrives with the values that were just written, and `dirty`
   * goes false without this component having to track its own request.
   */
  const dirty =
    minutes !== session.minutes ||
    mode !== session.mode ||
    notes !== (session.notes ?? '');

  const discard = () => {
    setMinutes(session.minutes);
    setMode(session.mode);
    setNotes(session.notes ?? '');
  };

  /** One `PUT`, the whole row. `updateSession` says why it must be the whole row. */
  const save = () =>
    run(() =>
      updateSession({
        id: session.id,
        scheduledAt: session.at,
        durationMinutes: minutes,
        status: session.status,
        deliveryMode: mode,
        notes,
      }),
    );

  return (
    <>
      <div className="scrim scrim--soft" onClick={onClose} aria-hidden="true" />

      <aside
        ref={panelRef}
        tabIndex={-1}
        className="panel sch__panel"
        role="region"
        aria-label={`${session.clientName}, ${dayLong(session.at)} at ${formatMinute(startMinute)}`}
      >
        <div className="panel__hd">
          <span className="av" style={{ background: avatarToken(session.clientId) }} aria-hidden="true">
            {initials(session.clientName)}
          </span>
          <div style={{ minWidth: 0 }}>
            <p className="panel__t">{session.clientName}</p>
            <p className="small">
              {dayLong(session.at)} · {formatMinute(startMinute)} – {formatMinute(endMinute)}
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
          {/* THE STATE, FIRST AND IN WORDS.
              §01.7 is a panel headed Thursday that said "Marked no-show" for a
              session two days in the future, and the finding's own note says why
              nothing caught it: with no now-line and no minute axis, nothing on
              the screen could contradict it. This says the state and the screen
              says the minute, and the two are derived from one row. */}
          {settled && (
            <p className={`sch__state sch__state--${session.done ? 'ok' : 'danger'}`}>
              {session.done ? <Check size={14} /> : <Cross size={14} />}
              {session.done
                ? 'Delivered'
                : session.noShow
                  ? /* The charge is part of the state, not a detail of it. A
                       no-show that cost a session and one that did not are the
                       two outcomes this button has, and a panel that drew them
                       identically would send the trainer to the money book to
                       find out which one they picked. */
                    session.packDelta < 0
                    ? 'Marked no-show · pack −1'
                    : 'Marked no-show · pack unchanged'
                  : 'Cancelled'}
            </p>
          )}
          {!settled && session.late && (
            <p className="sch__state sch__state--warn">
              <WarnTriangle size={14} />
              This ran{' '}
              {formatSpan(
                Math.max(0, Math.round((now - (session.at + session.minutes * 60_000)) / 60_000)),
              )}{' '}
              ago and is still unmarked
            </p>
          )}

          {/*
            THE WAY OUT TO THE WHOLE RECORD.
            The panel answers what a trainer needs from the GRID — how long, where,
            a note, move it, mark it. Everything else about the session — the
            prescription with its sets and reps, the log once there is one, the
            client's pinned notes — lives on its own page, because none of it fits
            beside a week and all of it is what the trainer wants the night before.
            A past block goes straight there and never opens this panel at all.
          */}
          <div className="sect">
            <Link className="btn btn--secondary btn--sm" href={`/sessions/${session.id}`}>
              Open the session
              <Chevron size={14} />
            </Link>
          </div>

          <div className="sect">
            <div className="kv">
              <span className="kv__k">Plan</span>
              <span className="kv__v">{session.detail}</span>
            </div>
            <div className="kv">
              <span className="kv__k">Package</span>
              <span className="kv__v">
                {client?.packLeft != null && client.packTotal != null
                  ? `${client.packLeft} of ${client.packTotal} left`
                  : '—'}
              </span>
            </div>
            <div className="kv">
              <span className="kv__k">This session</span>
              {/* A rate, or the honest absence of one. `perSession` yields nothing
                  for a client on a monthly fee — a month is not attributable to
                  one hour of it — and "₹0" would be a claim rather than a blank. */}
              <span className="kv__v">{rate ? rupees(rate) : 'No per-session rate'}</span>
            </div>
          </div>

          <div className="sect col gap3">
            <div className="fld">
              <span className="fld__l">Length</span>
              <div className="row gap2 sch__wrap">
                {lengthChoices(session.minutes).map((m) => (
                  <button
                    key={m}
                    className="chip"
                    type="button"
                    aria-pressed={minutes === m}
                    disabled={pending || settled}
                    onClick={() => setMinutes(m)}
                  >
                    {m} min
                  </button>
                ))}
              </div>
              <p className="fld__h">
                {client
                  ? `${client.name} usually trains for ${client.minutes} minutes.`
                  : 'Changing this moves the block’s bottom edge, not its start.'}
              </p>
            </div>

            <div className="fld">
              <span className="fld__l">Delivery</span>
              <div className="row gap2">
                <button
                  className="chip"
                  type="button"
                  aria-pressed={mode === 'floor'}
                  disabled={pending || settled}
                  onClick={() => setMode('floor')}
                >
                  Floor
                </button>
                <button
                  className="chip"
                  type="button"
                  aria-pressed={mode === 'remote'}
                  disabled={pending || settled}
                  onClick={() => setMode('remote')}
                >
                  <Remote size={13} />
                  Remote
                </button>
              </div>
            </div>

            <div className="fld">
              <label className="fld__l" htmlFor="sch-notes">
                Notes
              </label>
              <textarea
                id="sch-notes"
                className="ctl"
                value={notes}
                disabled={pending}
                placeholder="Anything to remember about this one"
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/*
              THE SAVE, AND IT ONLY EXISTS WHEN THERE IS SOMETHING TO SAVE.
              A button that is always there and usually does nothing teaches a
              trainer to press it on the way out of every panel. This appears with
              the first change and goes when the write lands, which makes its
              presence the answer to "is there anything unsaved here" — the one
              question a staged form owes the person leaving it.
            */}
            {dirty && (
              <div className="fld">
                <div className="row gap2">
                  <button
                    className="btn btn--primary btn--sm"
                    type="button"
                    disabled={pending}
                    onClick={save}
                  >
                    <Check size={14} />
                    Save changes
                  </button>
                  <button
                    className="btn btn--ghost btn--sm"
                    type="button"
                    disabled={pending}
                    onClick={discard}
                  >
                    Discard
                  </button>
                </div>
                <p className="fld__h">
                  {settled
                    ? 'Length and delivery are settled with the session; the note is not.'
                    : 'Length, delivery and the note go together in one write.'}{' '}
                  Nothing has changed on {session.clientName.split(' ')[0]}&rsquo;s calendar
                  yet.
                </p>
              </div>
            )}
          </div>

          {/*
            MOVE IS SELECT-THEN-PLACE, AND THAT IS THE WHOLE MECHANISM.
            Frames 5a/5b draw a drag; the component library specifying them
            already noted that a keyboard move has to be cut and paste "because
            drag alone would fail SC 2.5.7". Building only the accessible half —
            for everybody — is one code path instead of two, and it is the half
            that also works on a touch screen. `Schedule.tsx` carries the
            argument in full.
          */}
          {!settled && onMove && (
            <div className="sect">
              <button
                className="btn btn--secondary"
                type="button"
                disabled={pending}
                onClick={onMove}
              >
                <Calendar size={15} />
                Move this session
              </button>
              <p className="fld__h mt2">
                Then pick the new slot on the grid. {session.clientName} is told
                automatically, ten seconds after you place it.
              </p>
            </div>
          )}

          <div className="sect">
            <Link className="btn btn--ghost btn--sm" href={`/clients/${session.clientId}`}>
              Open {session.clientName}
              <Chevron size={14} />
            </Link>
          </div>

          {error && (
            <p className="sch__err" role="alert">
              <WarnTriangle size={14} />
              {error}
            </p>
          )}
        </div>

        {/*
          THE FOOT, AND THE ONE VERB BEHIND A CONFIRM.
          Cancelling is the only thing on this panel with no undo — a move gets
          ten seconds because it is a gesture, and a cancel usually follows a
          phone call, so the trainer is certain and a delay is friction. The
          confirm replaces the foot's contents in the same box rather than
          opening a second surface, which is the call `AccountMenu` already made
          and for the same reason: a panel foot cannot hold a modal.
        */}
        <div className="panel__foot">
          {confirming ? (
            <>
              <p className="small sch__confirm">
                Cancel this session? {session.clientName} is not told automatically, and
                this cannot be undone.
              </p>
              <button className="btn btn--ghost" type="button" onClick={() => setConfirming(false)}>
                Keep it
              </button>
              <button
                className="btn btn--danger"
                type="button"
                disabled={pending}
                onClick={() => run(async () => {
                  const res = await cancelSession(session.id);
                  if (res.ok) onClose();
                  return res;
                })}
              >
                Cancel session
              </button>
            </>
          ) : settled ? (
            <button className="btn btn--secondary" type="button" onClick={onClose}>
              Close
            </button>
          ) : (
            <>
              <button
                className="btn btn--ghost"
                type="button"
                disabled={pending}
                onClick={() => setConfirming(true)}
              >
                Cancel session
              </button>
              {/* One press, and it TAKES A SESSION — the design's rule and what
                  the phone's `markNotTrained` has always done. The considered
                  version of this decision lives on the finish screen, which
                  offers the checkbox; the diary is the fast surface and a
                  two-step here would make the common case slower to serve the
                  rare one. Safe to press: the server settles from what the
                  session has already taken, so re-marking it from the finish
                  screen with the box clear puts the session back. The label
                  says so rather than leaving it to be discovered. */}
              <button
                className="btn btn--secondary"
                type="button"
                disabled={pending}
                title="Records a no-show and takes one off her pack. Change it on the finish screen."
                onClick={() => run(() => markNoShow({
                  id: session.id,
                  scheduledAt: session.at,
                  durationMinutes: session.minutes,
                  costsASession: true,
                }))}
              >
                No-show &middot; &minus;1
              </button>
              {/* `POST /v1/sessions/{id}/done`, never a status flip: the endpoint
                  also creates the workout row and decrements the pack, and a flip
                  would leave the money book and the calendar disagreeing about
                  how many sessions a client had used. */}
              <button
                className="btn btn--primary"
                type="button"
                disabled={pending}
                onClick={() => run(() => markDone(session.id))}
              >
                <Check size={15} />
                Mark done
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
