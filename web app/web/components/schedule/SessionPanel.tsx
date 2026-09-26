'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import { dayLong, formatMinute, formatMinuteRange, formatSpan, minuteOfDay, rupees } from '@/lib/today/time';
import type { ScheduleClient, ScheduleSession } from '@/lib/schedule/api';
import { lengthChoices } from '@/lib/schedule/result';
import {
  cancelSession, markDone, markNoShow, updateSession,
} from '@/lib/schedule/actions';
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
                    disabled={pending || settled}
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
                  disabled={pending || settled}
                  onClick={() => setMode('floor')}
                >
                  In Person
                </Chip>
                <Chip
                  pressed={mode === 'remote'}
                  disabled={pending || settled}
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
              <Button
                variant="secondary"
                disabled={pending}
                onClick={onMove}
              >
                <Calendar size={15} />
                Move this session
              </Button>
              <p className="fld__h mt2">
                Then pick the new slot on the grid. {session.clientName} is told
                automatically, ten seconds after you place it.
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
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Keep it
              </Button>
              <Button
                variant="danger"
                disabled={pending}
                onClick={() => run(async () => {
                  const res = await cancelSession(session.id);
                  if (res.ok) {
                    /* THE BLOCK LEAVES THE GRID AND THE PANEL GOES WITH IT, so
                       nothing is left on screen to say what happened — the one
                       shape the deck is for. A receipt rather than a notice
                       because it is a single fact about a moment, and with NO
                       action on it: the confirm above says in as many words
                       that this cannot be undone, and a card offering Undo
                       five seconds later would contradict the sentence the
                       trainer just agreed to. */
                    show({
                      tone: 'ok',
                      variant: 'receipt',
                      title: <>Session cancelled</>,
                      body: (
                        <>
                          {session.clientName} &middot; {dayLong(session.at)} at{' '}
                          {formatMinute(startMinute)} &mdash; they are not told
                          automatically.
                        </>
                      ),
                    });
                    dismiss();
                  }
                  return res;
                })}
              >
                Cancel session
              </Button>
            </>
          ) : settled ? (
            <Button variant="secondary" onClick={dismiss}>
              Close
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => setConfirming(true)}
              >
                Cancel session
              </Button>
              {/* One press, and it TAKES A SESSION — the design's rule and what
                  the phone's `markNotTrained` has always done. The considered
                  version of this decision lives on the finish screen, which
                  offers the checkbox; the diary is the fast surface and a
                  two-step here would make the common case slower to serve the
                  rare one. Safe to press: the server settles from what the
                  session has already taken, so re-marking it from the finish
                  screen with the box clear puts the session back. The label
                  says so rather than leaving it to be discovered. */}
              <Button
                variant="secondary"
                disabled={pending}
                title="Records a no-show and takes one off the client’s pack. Change it on the finish screen."
                onClick={() => run(() => markNoShow({
                  id: session.id,
                  scheduledAt: session.at,
                  durationMinutes: session.minutes,
                  costsASession: true,
                }))}
              >
                No-show &middot; &minus;1
              </Button>
              {/* `POST /v1/sessions/{id}/done`, never a status flip: the endpoint
                  also creates the workout row and decrements the pack, and a flip
                  would leave the money book and the calendar disagreeing about
                  how many sessions a client had used. */}
              <Button
                variant="primary"
                disabled={pending}
                onClick={() => run(() => markDone(session.id))}
              >
                <Check size={15} />
                Mark done
              </Button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
