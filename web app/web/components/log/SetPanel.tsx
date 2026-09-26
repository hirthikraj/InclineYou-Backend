'use client';

import { useEffect, useRef, useState } from 'react';

import type { LogExerciseView, LogSetRow } from '@/lib/log/log';
import { Trash } from './Icons';
import { useDismiss } from '@/lib/ui/dismiss';
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
}: {
  view: LogExerciseView;
  row: LogSetRow;
  onSave: (values: { loadKg: number | null; reps: number | null; rpe: number | null; notes: string | null }) => void;
  onDelete: () => void;
  onClose: () => void;
  busy: boolean;
  message: string | null;
}) {
  const [load, setLoad] = useState(row.load);
  const [reps, setReps] = useState(row.reps);
  const [rpe, setRpe] = useState<number | null>(row.rpe);
  const [note, setNote] = useState(row.note ?? '');
  const first = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    first.current?.focus();
    first.current?.select();
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

  const number = (raw: string) => {
    const value = Number.parseFloat(raw.replace(',', '.'));
    return Number.isFinite(value) ? value : null;
  };

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

        <div className="panel__body">
          <div className="grid2">
            {view.logType === 'weight_reps' ? (
              <TextField
                label="Load kg"
                id="set-load"
                numeric
                ref={first}
                inputMode="decimal"
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
              label="Reps"
              id="set-reps"
              numeric
              ref={view.logType === 'weight_reps' ? undefined : first}
              inputMode="numeric"
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

          {message ? (
            <p className="msg msg--err" style={{ marginTop: 14 }} role="alert">{message}</p>
          ) : null}

          <div style={{ marginTop: 22, borderTop: '1px solid var(--tx-line)', paddingTop: 14 }}>
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
          </div>
        </div>

        <div className="panel__foot">
          <Button variant="ghost" onClick={dismiss}>Cancel</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              onSave({
                loadKg: view.logType === 'weight_reps' ? number(load) : null,
                reps: number(reps),
                rpe,
                notes: note.trim() || null,
              })
            }
          >
            {busy ? 'Saving…' : 'Save the set'}
          </Button>
        </div>
      </div>
    </>
  );
}
