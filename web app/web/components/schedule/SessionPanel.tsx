'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';

import { dayLong, formatMinute, formatMinuteRange, formatSpan, minuteOfDay, rupees } from '@/lib/today/time';
import type { ScheduleClient, ScheduleSession } from '@/lib/schedule/api';
import { lengthChoices } from '@/lib/schedule/result';
import {
  cancelSession, markDone, markNoShow, reopenSession, updateSession,
} from '@/lib/schedule/actions';
import type { WriteResult } from '@/lib/schedule/result';
import { Calendar, Check, Chevron } from '@/components/shell/Icons';
import { Cross, Remote, WarnTriangle } from './Icons';
import { useToast } from '@/lib/toast/store';
import { useDismiss } from '@/lib/ui/dismiss';
import { Button } from '@/web-components/ui/Button';
import { Chip } from '@/web-components/ui/Chip';
import { Field } from '@/web-components/ui/Field';
import { KeyValueRow } from '@/web-components/ui/KeyValue';
import { Avatar } from '@/web-components/ui/Avatar';

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
 * and Save sends the changed fields in one `PATCH` (R14), with the row's version
 * as If-Match so a panel left open cannot undo a move made in another tab — a
 * 412 reloads the week and says so (R69). Discard puts the row back. Nothing is written until one of them is pressed, which also means
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

  const returnTo = useRef<Element | null>(null);

  /* ── CLOSING IS NOW TWO STEPS, AND THE PANEL OWNS THE FIRST ────────────────
   *
   * `onClose` unmounts this component. Called directly it did so between two
   * frames, which left the panel with a 240ms arrival and no departure at all —
   * `lib/ui/dismiss.ts` has the argument. `dismiss` puts webapp.css's closed
   * state on the box, waits for the transition that state actually starts, and
   * then calls `onClose`. Every way OUT of this panel goes through it: the
   * header cross, Escape, the scrim, Close, and the last line of a cancel.
   *
   * It also retires this file's `closeRef`. That ref existed to keep the mount
   * effect off `[onClose]` — an inline arrow from `Schedule`, which re-renders
   * every thirty seconds — and `dismiss` is `useCallback([])`, so the effect can
   * name its dependency and still mean `[]`. The hook keeps the same guard for
   * the same reason, one level down. */
  const { closing, dismiss, ref: panelRef } = useDismiss<HTMLElement>(onClose);

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
      // Focus goes back to the block that opened this. Without it a keyboard user
      // lands at the top of the document and re-walks the rail to get back.
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, [dismiss, panelRef]);

  const startMinute = minuteOfDay(session.at);
  const { show } = useToast();
  const endMinute = startMinute + session.minutes;

  const run = (fn: () => Promise<WriteResult>) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.message ?? 'That did not go through.');
        // A stale row has been revalidated; let the shell redraw from it.
        if (res.stale) onChanged?.();
      } else onChanged?.();
    });
  };

  const settled = session.done || session.noShow || session.dead;
  /* A log is open: the session is happening, so its time, length and mode are
     what it is being logged as, and it can be neither cancelled nor a no-show. */
  const started = session.startedAt !== null;
  /* Done and No-show only from the start minute on (R15): the server refuses
     both before it, and a panel offering them on a Thursday for a Saturday is the
     §01.7 finding. Before the start, Move and Cancel are the verbs. */
  const begun = now >= session.at;
  const first = session.clientName.split(' ')[0] || session.clientName;

  /**
   * Every settle — done, no-show, cancel — gets a receipt whose Undo reopens the
   * session (R69), which reverses any pack charge on the server. The panel
   * closes, because the block it was about has changed state under it.
   */
  const settle = (
    fn: () => Promise<WriteResult>,
    title: string,
    body: (res: WriteResult) => ReactNode,
  ) =>
    run(async () => {
      const res = await fn();
      if (res.ok) {
        show({
          tone: 'ok',
          variant: 'receipt',
          title: <>{title}</>,
          body: body(res),
          action: {
            label: 'Undo',
            onClick: () => void reopenSession(session.id).then((back) => {
              if (!back.ok) show({ tone: 'danger', title: <>Could not undo</>, body: back.message });
              else onChanged?.();
            }),
          },
        });
        dismiss();
      }
      return res;
    });

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

  /** One `PATCH` of the dirty fields only (R14), conditional on the row's version. */
  const save = () =>
    run(() =>
      updateSession({
        id: session.id,
        version: session.version,
        durationMinutes: minutes !== session.minutes ? minutes : undefined,
        deliveryMode: mode !== session.mode ? mode : undefined,
        notes: notes !== (session.notes ?? '') ? notes : undefined,
      }),
    );

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
        aria-label={`${session.clientName}, ${dayLong(session.at)} at ${formatMinute(startMinute)}`}
      >
        <div className="panel__hd">
          <Avatar name={session.clientName} id={session.clientId} />
          <div style={{ minWidth: 0 }}>
            <p className="panel__t">{session.clientName}</p>
            <p className="small">
              {dayLong(session.at)} · {formatMinuteRange(startMinute, endMinute)}
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
                    session.charged
                    ? 'Marked no-show · pack −1'
                    : 'Marked no-show · pack unchanged'
                  : 'Cancelled'}
            </p>
          )}
          {!settled && session.late && (
            <p className="sch__state sch__state--warn">
              <WarnTriangle size={14} />
              {now < session.at + session.minutes * 60_000 ? (
                <>
                  Started{' '}
                  {formatSpan(Math.max(0, Math.round((now - session.at) / 60_000)))}{' '}
                  ago and no log is open
                </>
              ) : (
                <>
                  This ran{' '}
                  {formatSpan(
                    Math.max(0, Math.round((now - (session.at + session.minutes * 60_000)) / 60_000)),
                  )}{' '}
                  ago and is still unmarked
                </>
              )}
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
            <Button href={`/sessions/${session.id}`} variant="secondary" size="sm">
              Open the session
              <Chevron size={14} />
            </Button>
          </div>

          <div className="sect">
            <KeyValueRow k="Plan">{session.detail}</KeyValueRow>
            <KeyValueRow k="Package">
              {client?.packLeft != null && client.packTotal != null
                ? `${client.packLeft} of ${client.packTotal} left`
                : '—'}
            </KeyValueRow>
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
                  <Chip
                    pressed={minutes === m}
                    key={m}
                    disabled={pending || settled || started}
                    onClick={() => setMinutes(m)}
                  >
                    {m} min
                  </Chip>
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
                <Chip
                  pressed={mode === 'floor'}
                  disabled={pending || settled || started}
                  onClick={() => setMode('floor')}
                >
                  In Person
                </Chip>
                <Chip
                  pressed={mode === 'remote'}
                  disabled={pending || settled || started}
                  onClick={() => setMode('remote')}
                >
                  <Remote size={13} />
                  Online
                </Chip>
              </div>
            </div>

            <Field
              label="Notes"
              id="sch-notes"
            >
              {(a) => (
                <textarea className="ctl" {...a} value={notes} disabled={pending} placeholder="Anything to remember about this one" onChange={(e) => setNotes(e.target.value)} />
              )}
            </Field>

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
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={pending}
                    onClick={save}
                  >
                    <Check size={14} />
                    Save changes
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={discard}
                  >
                    Discard
                  </Button>
                </div>
                <p className="fld__h">
                  {settled || started
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
          {!settled && !started && onMove && (
            <div className="sect">
              <Button
                variant="secondary"
                disabled={pending}
                onClick={onMove}
              >
                <Calendar size={15} />
                Move this session
              </Button>
              <p className="fld__h mt2">
                Then pick the new slot on the grid. It saves ten seconds after you
                place it, with an Undo. {first} is not told automatically.
              </p>
            </div>
          )}

          <div className="sect">
            <Button href={`/clients/${session.clientId}`} variant="ghost" size="sm">
              Open {session.clientName}
              <Chevron size={14} />
            </Button>
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
          Cancel keeps the row in the diary (R12) and its receipt's Undo reopens
          it, but it is still the verb a trainer usually presses after a phone
          call, so it asks once. The confirm replaces the foot's contents in the
          same box rather than opening a second surface: a panel foot cannot hold
          a modal. Every settle's receipt carries an Undo that reopens (R69).
        */}
        <div className="panel__foot">
          {confirming ? (
            <>
              <p className="small sch__confirm">
                Cancel this session? {first} is not told automatically. It stays in
                the diary, and you can reopen it.
              </p>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Keep it
              </Button>
              <Button
                variant="danger"
                disabled={pending}
                onClick={() => settle(
                  () => cancelSession(session.id),
                  'Session cancelled',
                  () => (
                    <>
                      {session.clientName} &middot; {dayLong(session.at)} at{' '}
                      {formatMinute(startMinute)} &mdash; they are not told automatically.
                    </>
                  ),
                )}
              >
                Cancel session
              </Button>
            </>
          ) : settled ? (
            <>
              {/* Reopen: a mis-tapped done, no-show or cancel goes back to
                  booked, and any pack charge is given back (R69). */}
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => run(async () => {
                  const res = await reopenSession(session.id);
                  if (res.ok) {
                    show({
                      tone: 'ok',
                      variant: 'receipt',
                      title: <>Reopened</>,
                      body: <>{session.clientName} is booked again.{res.message ? <> {res.message}</> : null}</>,
                    });
                    dismiss();
                  }
                  return res;
                })}
              >
                Reopen
              </Button>
              <Button variant="secondary" onClick={dismiss}>
                Close
              </Button>
            </>
          ) : (
            <>
              {!started && (
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setConfirming(true)}
                >
                  Cancel session
                </Button>
              )}
              {/* One press, and it TAKES A SESSION — the design's rule and what
                  the phone's `markNotTrained` has always done. The considered
                  version of this decision lives on the finish screen, which
                  offers the checkbox; the diary is the fast surface. Safe to
                  press: the receipt's Undo reopens it and gives the session back.
                  Not on a started session: somebody trained. */}
              {begun && !started && (
                <Button
                  variant="secondary"
                  disabled={pending}
                  title="Records a no-show and takes one off the client’s pack. Undo gives it back."
                  onClick={() => settle(
                    () => markNoShow({ id: session.id, costsASession: true }),
                    'No-show recorded',
                    (res) => res.message
                      ? <>{session.clientName} &mdash; {res.message}</>
                      : <>{session.clientName} &mdash; one session off their pack.</>,
                  )}
                >
                  No-show &middot; &minus;1
                </Button>
              )}
              {/* `POST /v1/sessions/{id}/done`, never a status flip: the endpoint
                  also charges the pack and closes an open log, and a flip would
                  leave the money book and the calendar disagreeing about how many
                  sessions a client had used. */}
              {begun && (
                <Button
                  variant="primary"
                  disabled={pending}
                  onClick={() => settle(
                    () => markDone(session.id),
                    'Marked done',
                    (res) => res.message
                      ? <>{session.clientName} &mdash; {res.message}</>
                      : <>{session.clientName}&rsquo;s session is done, and one is off their pack.</>,
                  )}
                >
                  <Check size={15} />
                  Mark done
                </Button>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
