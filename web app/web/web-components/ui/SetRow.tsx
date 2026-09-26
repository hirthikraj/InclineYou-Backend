'use client';

import type { ReactNode } from 'react';

/**
 * Set row — one set in a workout log.
 *
 * The densest control in the product and the only one used with a barbell in
 * one hand, which is why the numbers are inputs rather than a tap-to-edit
 * field: you type over the previous value and move on.
 *
 * ── "LAST TIME" IS THE COMPONENT ────────────────────────────────────────────
 *
 * The right-hand column is what was done last time, and it is the reason a log
 * is usable at speed: nobody is recalling a number, they are beating one. It is
 * `aria-hidden` in the row and repeated into each input's `aria-describedby`,
 * so a reader hears "Load, 62.5, last time 60" rather than reading a column of
 * orphaned figures at the end.
 *
 * `data-state` on the row rather than a class, matching the design file — the
 * three states are a sequence (pending → done → skipped) rather than three
 * independent modifiers.
 *
 * ── IT HAS TWO MODES NOW, AND THAT IS THIS ENTRY EARNING ITS PLACE ──────────
 *
 * `c-setrow` has been in the catalogue since the beginning and **nothing in the
 * product imported it**: the trainer's console has its own `SetGrid`, so this
 * file was a specimen the library rendered and the app did not. That is the
 * exact condition `registry.ts` calls out — a catalogue row that cannot drift
 * from the app because it is not in the app.
 *
 * The client portal's workout flow needs the same table with two differences —
 * no RPE column and a tick that commits the row — and building a second one for
 * it would have made three set grids. So the entry behaviour is HERE:
 *
 *   · `onChange` absent  → the read-only specimen, byte-identical to before.
 *   · `onChange` present → controlled inputs, and a tick column when `onCommit`
 *     is passed too.
 *
 * `showRpe` defaults to true so the library's specimen keeps its five columns;
 * a client does not judge RPE — `webapp.css`'s own note says the figure is
 * "judged and typed once, not nudged" — so the portal passes false.
 */
export type SetLine = {
  n: number;
  load: string;
  reps: string;
  rpe?: string;
  /** What they did last time, as drawn: "60 × 8". */
  last?: string;
  state?: 'pending' | 'done' | 'skipped';
};

export type SetField = 'load' | 'reps' | 'rpe';

export function SetRows({
  sets,
  exercise,
  width,
  className,
  showRpe = true,
  onChange,
  onCommit,
  committing,
}: {
  sets: SetLine[];
  /** Names the table: "Bench press, 3 sets". */
  exercise: string;
  width?: number | string;
  className?: string;
  /** The RPE column. False on the client's flow — see the note above. */
  showRpe?: boolean;
  /**
   * Makes the inputs controlled. Absent, they are `defaultValue` and this is a
   * drawing — which is what the library renders and what the app never used.
   */
  onChange?: (n: number, field: SetField, value: string) => void;
  /**
   * Adds the commit column. A tick per row, because a set is finished one at a
   * time and a single Save at the bottom of a table somebody is filling in
   * between reps is a Save that loses a set to a locked screen.
   */
  onCommit?: (n: number) => void;
  /** The row whose write is in flight, so its tick can say so. */
  committing?: number | null;
}) {
  const controlled = onChange !== undefined;

  return (
    <table
      className={['sets', controlled ? 'sets--entry' : null, className].filter(Boolean).join(' ')}
      style={{ width }}
    >
      <caption className="vh">{exercise}</caption>
      <thead>
        <tr>
          <th scope="col">
            <span className="vh">Set</span>
          </th>
          <th scope="col">Load</th>
          <th scope="col">Reps</th>
          {showRpe && <th scope="col">RPE</th>}
          <th scope="col">Last time</th>
          {onCommit && (
            <th scope="col">
              <span className="vh">Done</span>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {sets.map((s) => {
          const lastId = `${exercise.replace(/\W+/g, '-')}-${s.n}-last`;
          const done = s.state === 'done';
          return (
            <tr key={s.n} data-state={s.state ?? 'pending'}>
              <td className="mono" style={{ width: 38 }}>
                {s.n}
              </td>
              <Cell
                label={`Load, set ${s.n}`}
                value={s.load}
                describedBy={s.last ? lastId : undefined}
                onChange={onChange && ((v) => onChange(s.n, 'load', v))}
              />
              <Cell
                label={`Reps, set ${s.n}`}
                value={s.reps}
                describedBy={s.last ? lastId : undefined}
                onChange={onChange && ((v) => onChange(s.n, 'reps', v))}
              />
              {showRpe && (
                <Cell
                  label={`RPE, set ${s.n}`}
                  value={s.rpe ?? ''}
                  onChange={onChange && ((v) => onChange(s.n, 'rpe', v))}
                />
              )}
              <td className="mono" id={lastId} aria-hidden="true">
                {s.last ?? '—'}
              </td>
              {onCommit && (
                <td>
                  {/*
                    `.tk`, §12's own commit control, with `aria-pressed` rather
                    than a checkbox: the row is not a value being collected, it
                    is a write that has happened. A pressed tick is a set on the
                    server, and pressing it again re-sends the row — which is
                    the correction path, and why it is never disabled once done.
                  */}
                  <button
                    type="button"
                    /* `.tk--on` AND `aria-pressed`, because §12 declares the
                       state as a class and a class says nothing to a reader.
                       `SetGrid` on the trainer's half writes the same pair. */
                    className={`tk${done ? ' tk--on' : ''}`}
                    aria-pressed={done}
                    aria-label={done ? `Set ${s.n} logged. Save it again` : `Save set ${s.n}`}
                    disabled={committing === s.n}
                    onClick={() => onCommit(s.n)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4.5 12.5l5 5 10-11" />
                    </svg>
                  </button>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Cell({
  label,
  value,
  describedBy,
  onChange,
}: {
  label: string;
  value: string;
  describedBy?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <td>
      <input
        className="ctl"
        /* Controlled when there is a handler, `defaultValue` when there is not.
           Both branches are needed and React refuses the middle: a `value` with
           no `onChange` is a field that cannot be typed into, which is right for
           a specimen and a bug in an app. */
        {...(onChange
          ? { value, onChange: (e) => onChange(e.currentTarget.value) }
          : { defaultValue: value })}
        aria-label={label}
        aria-describedby={describedBy}
        inputMode="decimal"
        style={{ background: 'transparent', borderColor: 'transparent' }}
      />
    </td>
  );
}

/** The header a set table sits under — the exercise and its target. */
export function SetHeader({ name, target }: { name: ReactNode; target?: ReactNode }) {
  return (
    <div className="row gap2" style={{ justifyContent: 'space-between' }}>
      <b style={{ fontSize: 13.5 }}>{name}</b>
      {target ? <span className="small" style={{ color: 'var(--tx-ink-3)' }}>{target}</span> : null}
    </div>
  );
}
