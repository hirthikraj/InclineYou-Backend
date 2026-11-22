'use client';

import { useEffect, useRef, useState } from 'react';

import type { LogExerciseViewX as LogExerciseView, LogSetRowX as LogSetRow } from '@/lib/sessionlog/select';
import { EFFORT, LOAD } from '@/lib/sessionlog/kinds';
import { effortHead, effortText, hasLoadBox, loadHead, loadText, parseEffort, parseLoad } from './kindfields';
import { Trash } from './Icons';
import { useDismiss } from '@/lib/ui/dismiss';
import { usePhone } from '@/lib/ui/phone';
import { ScreenSheet } from '@/web-components/ui/ScreenSheet';
import { Button } from '@/web-components/ui/Button';
import { Tag } from '@/web-components/ui/Tag';
import { Chip } from '@/web-components/ui/Chip';
import { TextField } from '@/web-components/ui/Field';

/**
 * FRAME 1b — ONE SET, IN FULL.
 *
 * RPE and a note: the two things the row has no width for on a phone and no
 * competitor asks for. They are what the trainer knows and the client's own app
 * never records — and the note is the one thing TrueCoach does better than
 * anybody, a comment on a single set, which it then puts in an inbox. This puts
 * it two lines under its own row in the table, read next week with the same set
 * in front of you.
 *
 * **A panel and not a modal**, which is `webapp.css`'s own rule for the two: the
 * row it is about stays on screen behind it, and a 26% scrim keeps the grid at
 * 6.4:1 rather than the 1.8:1 a modal scrim measured. A payment is decided while
 * looking at the payments list; a set is corrected while looking at the set.
 *
 * **Delete goes straight through.** §09: *undo after, never confirm before* —
 * a trainer logs twenty sets a session and twenty confirmations is a different
 * app. The undo lives in the console, for `UNDO_SECONDS`. The one place a
 * confirm survives on this screen is discarding a whole session, which is not
 * reversible.
 */
export function SetPanel({
  view,
  row,
  onSave,
  onDelete,
  onClose,
  busy,
  message,
  skipped = false,
  onSkip,
  onUnskip,
  onRemoveSlot,
}: {
  view: LogExerciseView;
  row: LogSetRow;
  onSave: (values: { load: number | null; effort: number | null; rpe: number | null; notes: string | null }) => void;
  onDelete: () => void;
  onClose: () => void;
  busy: boolean;
  message: string | null;
  /** Skipped in this tab (see `Console`'s *a skipped set*). */
  skipped?: boolean;
  onSkip?: () => void;
  onUnskip?: () => void;
  /** Given only for an extra slot nobody has logged. */
  onRemoveSlot?: () => void;
}) {
  // The boxes hold what is logged, in the set's own kind: `80`, `1:30`, `400`.
  const [load, setLoad] = useState(loadText(row.loadValue));
  const [reps, setReps] = useState(effortText(row.effortKind, row.effortValue));
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const loadBox = hasLoadBox(row.loadKind, row.effortKind);
  const [rpe, setRpe] = useState<number | null>(row.rpe);
  const [note, setNote] = useState(row.note ?? '');
  const first = useRef<HTMLInputElement | null>(null);
  const phone = usePhone();

  /* Not on a phone (21 Nov 2026): a focused field raises the keyboard over the RPE and the note —
     the two things the set number is tapped for — before the trainer has seen the sheet. */
  useEffect(() => {
    if (phone) return;
    first.current?.focus();
    first.current?.select();
    // Once, on arrival; `phone` does not change while the panel is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Every way out goes through `dismiss` so the panel leaves the way it
     arrived — `lib/ui/dismiss.ts`. `onClose` is the unmount at the end of it. */
  const { closing, dismiss, dismissThen, ref: panelRef } = useDismiss<HTMLDivElement>(onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismiss]);

  const save = () => {
              // Each box is read as its own kind's number (`1:30` is a time, `70` a percentage); a box that
              // cannot be one is said in a sentence here and nothing is sent.
              const l = loadBox ? parseLoad(row.loadKind, load) : ({ ok: true, value: null } as const);
              const e = parseEffort(row.effortKind, reps);
              const bad = [l, e].find((p) => !p.ok);
              if (bad && !bad.ok) { setLocalMessage(bad.message); return; }
              setLocalMessage(null);
              onSave({
                load: l.ok ? l.value : null,
                effort: e.ok ? e.value : null,
                rpe,
                notes: note.trim() || null,
              });
  };

  const saveButton = (size?: 'sm') => (
    <Button variant="primary" size={size} disabled={busy} onClick={save}>
      {busy ? 'Saving…' : size ? 'Save' : 'Save the set'}
    </Button>
  );

  const body = (
    <>
          <div className="grid2">
            {loadBox ? (
              <TextField
                label={loadHead(row.loadKind)}
                id="set-load"
                numeric
                ref={first}
                inputMode={LOAD[row.loadKind].inputMode}
                value={load}
                onChange={(e) => setLoad(e.target.value)}
              />
            ) : (
              <div className="fld">
                <span className="fld__l">Load</span>
                <p className="small ink3" style={{ paddingTop: 9 }}>
                  No load. The column stays and says so.
                </p>
              </div>
            )}
            <TextField
              label={effortHead(row.effortKind)}
              id="set-reps"
              numeric
              ref={loadBox ? undefined : first}
              inputMode={EFFORT[row.effortKind].inputMode}
              value={reps}
              onChange={(e) => setReps(e.target.value)}
            />
          </div>

          <p className="micro" style={{ margin: '18px 0 8px' }}>Effort · RPE</p>
          <div className="wk" role="group" aria-label="RPE">
            {[6, 7, 8, 9, 10].map((n) => (
              <Chip
                pressed={rpe === n}
                key={n}
                onClick={() => setRpe(rpe === n ? null : n)}
              >
                {n}
              </Chip>
            ))}
          </div>
          <p className="small" style={{ marginTop: 7 }}>
            Optional, and the reason a log written by a coach is worth more than one written by a
            lifter.
          </p>

          <p className="micro" style={{ margin: '18px 0 8px' }}>
            <label htmlFor="set-note">Note</label>
          </p>
          <textarea
            id="set-note"
            className="ctl"
            style={{ height: 70, padding: '8px 11px', resize: 'none', fontFamily: 'var(--tx-font)', textAlign: 'left' }}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <p className="small" style={{ marginTop: 7 }}>
            Two lines under the row in the table — read next week with the same set in front of you,
            not in an inbox.
          </p>

          {localMessage ?? message ? (
            <p className="msg msg--err" style={{ marginTop: 14 }} role="alert">{localMessage ?? message}</p>
          ) : null}

          {/* ── WHAT CAN BE DONE TO THIS SET (21 Nov 2026) ────────────────────────
              It depends on what the set IS, and only one sentence is drawn:
              · logged → *Delete this set* (un-logs a planned set, deletes an extra one; Undo after);
              · planned, not done → *Skip this set* (this tab only: it stays not done on the server,
                the way an unticked set is in Strong or Hevy — and *Log set* moves past it);
              · skipped → *Undo the skip*;
              · an extra slot nobody logged → *Remove this slot*. */}
          <div style={{ marginTop: 22, borderTop: '1px solid var(--tx-line)', paddingTop: 14 }}>
            {row.done ? (
              <>
                <Button
                  variant="ghost"
                  style={{ color: 'var(--tx-danger)' }}
                  /* Delete closes the panel in `Console` the moment it is pressed,
                     so it leaves through the same wait as Cancel. Save does NOT —
                     it is async and can come back with a message and stay open, so
                     wrapping it would dismiss a panel that failed. */
                  onClick={() => dismissThen(onDelete)}
                  disabled={busy || !row.setId}
                >
                  <Trash /> Delete this set
                </Button>
                <p className="small" style={{ marginTop: 6 }}>
                  Goes straight through, with an undo behind it.{' '}
                  <b className="ink">Undo after, never confirm before</b> — the one exception in this
                  whole screen is discarding a session.
                </p>
              </>
            ) : onRemoveSlot ? (
              <>
                <Button variant="ghost" onClick={() => dismissThen(onRemoveSlot)}>
                  <Trash /> Remove this slot
                </Button>
                <p className="small" style={{ marginTop: 6 }}>
                  An extra set nobody has logged. Taking it back writes nothing.
                </p>
              </>
            ) : skipped ? (
              <>
                <Button variant="ghost" onClick={() => onUnskip && dismissThen(onUnskip)}>
                  Undo the skip
                </Button>
                <p className="small" style={{ marginTop: 6 }}>
                  It goes back to being the next set to log.
                </p>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => onSkip && dismissThen(onSkip)} disabled={!onSkip}>
                  Skip this set
                </Button>
                <p className="small" style={{ marginTop: 6 }}>
                  The client did not do it. It stays not done, and <i>Log set</i> moves on to the next one.
                </p>
              </>
            )}
          </div>
    </>
  );

  /* ── ON A PHONE, A SCREEN AND NOT A SIDE PANEL (21 Nov 2026, from a screenshot) ──
     A 380px panel on a 390px phone is a full screen pretending to be a side pane,
     with a foot of two buttons and a scroller inside the page's. The other phone
     editors' answer: `c-screensheet`, the back chevron as Cancel and *Save* in the
     header. Escape still closes (the listener above); `dismiss` waits for the
     sheet's slide-out as it waited for the panel's. */
  if (phone) {
    return (
      <ScreenSheet
        title={<>{view.name} · set {row.number}</>}
        backLabel="Cancel"
        onBack={dismiss}
        action={saveButton('sm')}
        closing={closing}
        surfaceRef={panelRef}
      >
        {row.pr ? <Tag tone="pr" className="setp__pr">Record</Tag> : null}
        {body}
      </ScreenSheet>
    );
  }

  return (
    <>
      <div
        className={`scrim scrim--soft${closing ? ' scrim--out' : ''}`}
        onClick={dismiss}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className={`panel${closing ? ' panel--out' : ''}`}
        style={{ width: 380 }}
        role="dialog"
        aria-label={`${view.name}, set ${row.number}`}
      >
        <div className="panel__hd">
          <span className="panel__t">{view.name} · set {row.number}</span>
          {row.pr ? <Tag tone="pr" style={{ marginLeft: 'auto' }}>Record</Tag> : null}
        </div>

        <div className="panel__body">{body}</div>

        <div className="panel__foot">
          <Button variant="ghost" onClick={dismiss}>Cancel</Button>
          {saveButton()}
        </div>
      </div>
    </>
  );
}
