'use client';

import { useCallback, useRef } from 'react';

import type { LogExerciseView, LogSetRow } from '@/lib/log/log';
import { Note, Plus, Swap, Timer, Tick } from './Icons';

/**
 * THE SET GRID — FIVE COLUMNS, AND THE FIRST OF THEM IS THE ARGUMENT.
 *
 * `# · Last time · Load kg · Reps · RPE · tick`. Four of the six are the phone's
 * and are ported unchanged. Two are the desk being wider rather than merely
 * different, and both need saying:
 *
 * **RPE is a column here and a sheet there.** §09 fixes the phone at five
 * columns because that is what fits at 360dp with Previous intact. A desk has
 * the width, and RPE is what the trainer knows and the client's own app never
 * records — so it goes in the row, and the sheet keeps the note.
 *
 * **Previous is a column, not a placeholder.** Hevy solved this years ago and
 * there is no reason to redraw a solved table; Strong offers last time's numbers
 * as placeholder text inside the field instead, and a placeholder disappears the
 * moment you type — which is exactly the moment you want it. §09 makes this the
 * one thing on the screen that may never collapse, truncate or hide.
 *
 * ── THE ROW THAT HAS NOT CLAIMED ANYTHING ────────────────────────────────────
 *
 * An open slot shows last time's numbers IN the field, at the quiet ink behind a
 * dashed border (`.ctl.said`). One press takes them exactly as shown — the desk
 * equivalent of the app's one-tap tick. Until somebody presses, **the log has
 * not claimed a weight nobody lifted**, and nothing here auto-progresses a load:
 * §09's rule is that the app never puts a number in a row that nobody lifted.
 *
 * ── AND THE ACCELERATORS HAVE POINTER PATHS ──────────────────────────────────
 *
 * NN/g's rule (Krause & Harley 2024): *"an accelerator is not a new feature — it
 * is merely an additional way of completing an existing action"*, and *"those
 * users who never discover the accelerator should be able to complete the same
 * task in another way."* That is the rule the page this replaces broke — it drew
 * a keyboard bar and no pointer path for the tick, the note or the swap. Every
 * shortcut in the bar at the foot of this screen has a button in this component.
 */

export interface GridHandlers {
  /** A tick, or a commit from the keyboard. Values come from the row's fields. */
  commit: (exerciseId: string, row: LogSetRow, values: Draft) => void;
  /** Un-tick: the set goes, the slot stays. */
  remove: (exerciseId: string, row: LogSetRow) => void;
  /** Open frame 1b for this set. */
  openSet: (exerciseId: string, setNumber: number) => void;
  /** Open frame 3b for this exercise. */
  openSwap: (exerciseId: string) => void;
  /** One more slot than the plan asked for. */
  addSlot: (exerciseId: string) => void;
  /** Change the rest for this exercise. */
  changeRest: (exerciseId: string) => void;
}

export interface Draft {
  load?: string;
  reps?: string;
  rpe?: string;
}

const KEY = (exerciseId: string, n: number) => `${exerciseId}:${n}`;

export function draftKey(exerciseId: string, n: number): string {
  return KEY(exerciseId, n);
}

/** What is actually in a field: what was typed, else what is logged. */
export function fieldValue(row: LogSetRow, draft: Draft | undefined, which: keyof Draft): string {
  const typed = draft?.[which];
  if (typed !== undefined) return typed;
  if (which === 'load') return row.load;
  if (which === 'reps') return row.reps;
  return row.rpe != null ? String(row.rpe) : '';
}

/** The number last time's column is offering, when the slot is still open. */
function suggestion(row: LogSetRow, which: 'load' | 'reps'): string {
  if (row.done) return '';
  const value = which === 'load' ? row.previousLoad : row.previousReps;
  return value != null ? String(value) : '';
}

/**
 * What the two stepped columns move by.
 *
 * 2.5 kg is a pair of 1.25 plates and the smallest real jump on a barbell in
 * an Indian commercial gym; a rep is a rep. Neither is a preference, which is
 * why neither is configurable — a stepper whose size you have to check before
 * pressing is slower than typing the number.
 */
const LOAD_STEP = 2.5;
const REPS_STEP = 1;

/** What is actually in the field: what was typed, else what last time offers. */
function shownValue(
  row: LogSetRow,
  draft: Draft | undefined,
  which: 'load' | 'reps',
  said: boolean,
): string {
  return fieldValue(row, draft, which) || (said ? suggestion(row, which) : '');
}

/**
 * One press of a stepper.
 *
 * It steps from what the trainer can SEE, which on an untouched row is last
 * time's number — so `+` on a row offering 60 kg claims 62.5, and that is the
 * progression the column exists to make one press long. §09's rule is not
 * broken by this: the app still never puts a number in a row by itself. The
 * trainer pressed the button.
 *
 * `floor` differs by column and the difference is real. A set at 0 kg is a
 * bare bar or a bodyweight movement and happens; a set of 0 reps is not a set,
 * and `commit` would post it, because it only refuses a row where load AND
 * reps are both absent. So reps stop at 1 rather than walking to a row the
 * history would have to explain.
 */
function stepped(shown: string, delta: number, floor: number): string {
  const base = Number.parseFloat(shown.replace(',', '.'));
  const next = Math.max(floor, (Number.isFinite(base) ? base : 0) + delta);
  // 2.5 and 1 are both exact in binary, so the grid itself never drifts. A
  // typed 61.3 can, so the result is rounded to the two decimals a gym uses.
  return String(Math.round(next * 100) / 100);
}

/** `2:00`, `0:45`. The clock's own format, and the strip's at rest. */
function clock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/**
 * What the spent clock says — and it is an INSTRUCTION, not a fact.
 *
 * "Rest is over" is a statement about the past and the trainer already half
 * knows it. What they cannot see without counting rows is which set is up, so
 * the sentence carries the number: *Set 3 of bench press is up.* And when
 * there is no open slot left it says that instead, which is the more useful
 * thing at the end of an exercise — the trainer is about to move on, and the
 * strip is the only thing on the card that knows the exercise is finished.
 *
 * `plain` drops the `<u>`, for the live region that reads it aloud.
 */
function restOverLine(name: string, nextSet: number | null, plain = false): React.ReactNode {
  const exercise = name.toLowerCase();
  const named = plain ? exercise : <u>{exercise}</u>;
  return nextSet === null ? (
    <>Rest over — and that was the last {named} set.</>
  ) : (
    <>
      Rest over. Set {nextSet} of {named} is up.
    </>
  );
}

/** How much of the rest is left, 0…1. Clamped: `+15` may exceed what it started at. */
function bar(remaining: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, remaining / total));
}

function num(raw: string): number | null {
  const value = Number.parseFloat(raw.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

export function readDraft(row: LogSetRow, draft: Draft | undefined, useSuggestion: boolean) {
  const load = fieldValue(row, draft, 'load') || (useSuggestion ? suggestion(row, 'load') : '');
  const reps = fieldValue(row, draft, 'reps') || (useSuggestion ? suggestion(row, 'reps') : '');
  const rpe = fieldValue(row, draft, 'rpe');
  return { loadKg: num(load), reps: num(reps), rpe: num(rpe) };
}

export function SetGrid({
  view,
  drafts,
  onDraft,
  handlers,
  busy,
  error,
  restEditable,
  restScope,
  rest,
  onAdjustRest,
  onSkipRest,
}: {
  view: LogExerciseView;
  drafts: Record<string, Draft>;
  onDraft: (key: string, patch: Draft) => void;
  handlers: GridHandlers;
  /** Set keys with a request in flight. The tick shows it and does not stack. */
  busy: Set<string>;
  /** Set key → what went wrong, said in the row it happened in. */
  error: Record<string, string>;
  restEditable: boolean;
  /**
   * Which row a change lands on, and it is a real difference the trainer should
   * see before they press it: `program` is an edit to her plan and is still 90
   * seconds next Tuesday; `today` is this session's card only.
   */
  restScope: 'program' | 'today';
  /** The rest running for THIS exercise, or null. Owned by the console. */
  rest: { total: number; remaining: number; over: boolean } | null;
  onAdjustRest: (deltaSeconds: number) => void;
  onSkipRest: () => void;
}) {
  const table = useRef<HTMLTableElement | null>(null);
  const weights = view.logType === 'weight_reps';

  /* ── the keyboard model ─────────────────────────────────────────────────
     ↵ commits and opens the next set. ⌘↵ takes last time's numbers — the one
     non-obvious binding, printed in the bar and duplicated as a button. ↑ ↓
     move between sets in the same column, so a trainer entering twelve loads
     from a notebook never leaves the load column. Nothing here rebinds copy,
     paste, select-all, print or ⌘Z. */
  const move = useCallback((from: HTMLElement, rows: number) => {
    const cell = from.closest('td');
    const row = from.closest('tr');
    if (!cell || !row || !table.current) return;
    const columnIndex = [...(row.children as unknown as HTMLElement[])].indexOf(cell);
    const all = [...table.current.querySelectorAll('tbody tr[data-set]')] as HTMLElement[];
    const index = all.indexOf(row);
    const next = all[index + rows];
    if (!next) return;
    const target = next.children[columnIndex]?.querySelector('input') as HTMLInputElement | null;
    (target ?? (next.querySelector('input') as HTMLInputElement | null))?.focus();
    target?.select();
  }, []);

  const onKeyDown = (row: LogSetRow) => (event: React.KeyboardEvent<HTMLInputElement>) => {
    const key = KEY(view.exerciseId, row.number);

    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) {
        // Accept last time's numbers exactly as shown.
        onDraft(key, {
          load: suggestion(row, 'load') || fieldValue(row, drafts[key], 'load'),
          reps: suggestion(row, 'reps') || fieldValue(row, drafts[key], 'reps'),
        });
      }
      handlers.commit(view.exerciseId, row, drafts[key] ?? {});
      move(event.currentTarget, 1);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(event.currentTarget, 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(event.currentTarget, -1);
      return;
    }
    if (event.key === 'n' || event.key === 'N') {
      // The fields are decimal, so a letter in one is never wanted. The pointer
      // path is the Note button on the same row's panel.
      event.preventDefault();
      handlers.openSet(view.exerciseId, row.number);
    }
  };

  const openSlot = view.sets.find((s) => !s.done) ?? null;

  return (
    <div className="card">
      <div className="card__hd">
        <h2 className="card__t">{view.name}</h2>
        {view.verdict === 'record' || view.verdict === 'quiet' ? (
          <span className="tag tag--pr">
            Record{view.verdict === 'quiet' ? ' · quiet' : ''}
            {view.sets.find((s) => s.pr) ? ` · set ${view.sets.find((s) => s.pr)?.number}` : ''}
          </span>
        ) : view.verdict === 'matched' ? (
          <span className="tag">Matched</span>
        ) : view.verdict === 'first' ? (
          <span className="tag tag--info">Her first</span>
        ) : null}
        <span className="small mono" style={{ marginLeft: 'auto' }}>
          {view.historySets > 0
            ? `${view.historySets} set${view.historySets === 1 ? '' : 's'} before today`
            : view.swappedFrom
              ? `swapped from ${view.swappedFrom}`
              : view.unplanned
                ? 'not on her program'
                : 'first time'}
        </span>
      </div>

      <div className="card__b">
        {/* Live and PERSISTENT — it is in the DOM whether or not it has
            anything to say, because a live region inserted at the same moment
            as its text is announced unreliably across screen readers. The
            running clock carries `role="timer"` and announces nothing, which
            is right; the end of it is the one thing worth interrupting for. */}
        <span className="vh" role="status">
          {rest?.over ? restOverLine(view.name, openSlot?.number ?? null, true) : ''}
        </span>
        <table className="sets" ref={table} style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th className="n">
                <span className="vh">Set</span>
              </th>
              <th className="prev">Last time</th>
              <th className="num">{weights ? 'Load kg' : 'Load'}</th>
              <th className="num">Reps</th>
              <th className="num">RPE</th>
              <th>
                <span className="vh">Logged</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {view.sets.map((row) => {
              const key = KEY(view.exerciseId, row.number);
              const draft = drafts[key];
              const active = openSlot?.number === row.number;
              const said = !row.done && row.previous !== null;
              const working = busy.has(key);

              return [
                <tr
                  key={key}
                  data-set={row.number}
                  data-state={row.done ? 'done' : active ? 'active' : undefined}
                  className={row.pr ? 'pr' : undefined}
                >
                  <td className="n">{row.number}</td>
                  <td className="prev">
                    {row.previous ?? <em>first time</em>}
                  </td>
                  <td className="num">
                    {weights ? (
                      <div className="stp">
                        <Step
                          label={`Load down ${LOAD_STEP} kg, set ${row.number}`}
                          sign="minus"
                          onPress={() =>
                            onDraft(key, {
                              load: stepped(shownValue(row, draft, 'load', said), -LOAD_STEP, 0),
                            })
                          }
                        />
                        <input
                          className={`ctl${said && !draft?.load ? ' said' : ''}`}
                          inputMode="decimal"
                          autoComplete="off"
                          value={shownValue(row, draft, 'load', said)}
                          onChange={(e) => onDraft(key, { load: e.target.value })}
                          onKeyDown={onKeyDown(row)}
                          aria-label={`Load, set ${row.number}`}
                        />
                        <Step
                          label={`Load up ${LOAD_STEP} kg, set ${row.number}`}
                          sign="plus"
                          onPress={() =>
                            onDraft(key, {
                              load: stepped(shownValue(row, draft, 'load', said), LOAD_STEP, 0),
                            })
                          }
                        />
                      </div>
                    ) : (
                      /* §09: a time or a reps-only exercise RELABELS the two
                         input columns; it never adds one. The load column is not
                         removed and no column is added — it says no load and
                         stays, because a sixth column would have to come out of
                         Previous. */
                      <span className="small ink3">— no load</span>
                    )}
                  </td>
                  <td className="num">
                    <div className="stp">
                      <Step
                        label={`One rep fewer, set ${row.number}`}
                        sign="minus"
                        onPress={() =>
                          onDraft(key, {
                            reps: stepped(shownValue(row, draft, 'reps', said), -REPS_STEP, 1),
                          })
                        }
                      />
                      <input
                        className={`ctl${said && !draft?.reps ? ' said' : ''}`}
                        inputMode="numeric"
                        autoComplete="off"
                        value={shownValue(row, draft, 'reps', said)}
                        onChange={(e) => onDraft(key, { reps: e.target.value })}
                        onKeyDown={onKeyDown(row)}
                        aria-label={`Reps, set ${row.number}`}
                      />
                      <Step
                        label={`One rep more, set ${row.number}`}
                        sign="plus"
                        onPress={() =>
                          onDraft(key, {
                            reps: stepped(shownValue(row, draft, 'reps', said), REPS_STEP, 1),
                          })
                        }
                      />
                    </div>
                  </td>
                  <td className="num">
                    <input
                      className="ctl"
                      style={{ maxWidth: 56 }}
                      inputMode="decimal"
                      autoComplete="off"
                      value={fieldValue(row, draft, 'rpe')}
                      onChange={(e) => onDraft(key, { rpe: e.target.value })}
                      onKeyDown={onKeyDown(row)}
                      aria-label={`RPE, set ${row.number}`}
                    />
                  </td>
                  <td className="tick">
                    <button
                      type="button"
                      className={`tk${row.done ? ' tk--on' : ''}`}
                      aria-pressed={row.done}
                      disabled={working}
                      onClick={() =>
                        row.done
                          ? handlers.remove(view.exerciseId, row)
                          : handlers.commit(view.exerciseId, row, draft ?? {})
                      }
                      aria-label={row.done ? `Set ${row.number} logged — un-log it` : `Log set ${row.number}`}
                      title={row.done ? `Set ${row.number} logged` : `Log set ${row.number}`}
                    >
                      <Tick />
                    </button>
                  </td>
                </tr>,

                row.note ? (
                  <tr key={`${key}-note`} className="note">
                    <td />
                    <td colSpan={5}>
                      <p>
                        <Note /> {row.note}
                      </p>
                    </td>
                  </tr>
                ) : null,

                error[key] ? (
                  <tr key={`${key}-err`} className="note">
                    <td />
                    <td colSpan={5}>
                      <p style={{ color: 'var(--tx-danger)', borderLeftColor: 'var(--tx-danger)' }}>
                        {error[key]}
                      </p>
                    </td>
                  </tr>
                ) : null,

                row.done ? (
                  <tr key={`${key}-act`} className="note">
                    <td />
                    <td colSpan={5} style={{ paddingBottom: 6 }}>
                      <button
                        className="btn btn--ghost btn--sm"
                        type="button"
                        onClick={() => handlers.openSet(view.exerciseId, row.number)}
                      >
                        <Note /> RPE and a note
                      </button>
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>

        <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
          {openSlot ? (
            <>
              <button
                className="btn btn--primary btn--sm"
                type="button"
                disabled={openSlot.previous === null}
                onClick={() => {
                  const key = KEY(view.exerciseId, openSlot.number);
                  onDraft(key, {
                    load: suggestion(openSlot, 'load'),
                    reps: suggestion(openSlot, 'reps'),
                  });
                  handlers.commit(view.exerciseId, openSlot, {
                    load: suggestion(openSlot, 'load'),
                    reps: suggestion(openSlot, 'reps'),
                  });
                }}
              >
                <Tick /> Take last time&rsquo;s numbers
              </button>
              <span className="small mono">⌘↵</span>
            </>
          ) : null}
          <button className="btn btn--secondary btn--sm" type="button" onClick={() => handlers.addSlot(view.exerciseId)}>
            <Plus /> Add a set
          </button>
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => handlers.openSwap(view.exerciseId)}>
            <Swap /> Swap
          </button>
          <span style={{ flex: 1 }} />
          <span className="small mono">volume {view.volumeKg.toLocaleString('en-IN')} kg</span>
        </div>

        {/* Rest is per exercise, not per trainer: 90 seconds after a bench set
            and 20 after a curl is one trainer, not two preferences.

            It used to live only on the program row, so an exercise off the plan
            had nowhere to keep one and this strip said so rather than offering a
            dead control. `workout_exercise.rest_seconds` — V13's column, on REST
            since 28 Aug 2026 — is where an off-plan card keeps it, so the
            control is live for every card now and the strip says which row a
            change would land on instead. */}
        {rest?.over ? (
          /* Spent. The strip does not disappear at zero — see `Rest.over` in
             `Console.tsx` for why — it turns green and says which set is up.
             That sentence is the whole point of the state: "rest over" is a
             fact about the past, and the trainer needs the instruction. */
          <div className="rst2 rst2--over" style={{ marginTop: 10 }}>
            <Tick />
            <b>0:00</b>
            <span>{restOverLine(view.name, openSlot?.number ?? null)}</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* Not a stopped clock's controls — the only two things left to
                  say are "she needs longer" and "we are going". */}
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => onAdjustRest(15)}>
                +15 more
              </button>
              <button className="btn btn--secondary btn--sm" type="button" onClick={onSkipRest}>
                Got it
              </button>
            </span>
          </div>
        ) : rest ? (
          /* Counting. Same strip, same place — the number the trainer was
             already reading starts moving, rather than a clock appearing
             somewhere else on the screen and asking to be found. */
          <div
            className="rst2 rst2--run"
            style={{ marginTop: 10 }}
            role="timer"
            aria-label={`${clock(rest.remaining)} rest remaining after a ${view.name.toLowerCase()} set`}
          >
            <Timer />
            <b>{clock(rest.remaining)}</b>
            <span className="rst2__bar" aria-hidden="true">
              <span
                className="rst2__fill"
                style={{ width: `${bar(rest.remaining, rest.total) * 100}%` }}
              />
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* At the two ends of the clock on the phone because it is used
                  one-handed at arm's length. On a desk they are a pair, next
                  to the thing they change. */}
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => onAdjustRest(-15)}>
                &minus;15
              </button>
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => onAdjustRest(15)}>
                +15
              </button>
              <button className="btn btn--secondary btn--sm" type="button" onClick={onSkipRest}>
                Skip
              </button>
            </span>
          </div>
        ) : (
          <div className="rst2" style={{ marginTop: 10 }}>
            <Timer />
            <b>{view.restSeconds ? clock(view.restSeconds) : '—'}</b>
            <span>
              {view.restSeconds ? 'rest after a ' : 'no rest set for '}
              <u>{view.name.toLowerCase()}</u> {view.restSeconds ? 'set. Per exercise, not per trainer.' : 'yet.'}
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="small ink3">
                {restScope === 'program' ? 'on her program' : 'today only'}
              </span>
              {restEditable ? (
                <button className="btn btn--ghost btn--sm" type="button" onClick={() => handlers.changeRest(view.exerciseId)}>
                  Change
                </button>
              ) : null}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One stepper button.
 *
 * ── Why it is not in the tab order ────────────────────────────────────────
 *
 * Tab order down this row is Load → Reps → RPE, and it is the whole reason the
 * console beats the phone at *catching up a session logged on paper*: twelve
 * sets out of a notebook is tab-type-tab-type. Four extra tab stops per row
 * would make the keyboard path 2.3× longer to serve a control the keyboard
 * user does not need — they are typing the number.
 *
 * So `tabIndex={-1}`, and WCAG 2.1.1 is met by the input, not by the button:
 * the FUNCTION — setting a load or a rep count — is fully keyboard operable
 * where it always was. This is the same argument `app.css` already makes for
 * hiding the accelerator bar on a touch screen, pointing the other way: a
 * redundant path for one input device does not get to tax the other.
 *
 * Still a real `<button>`, so it takes a click, an Enter or a Space once
 * focused, and reads its own label to a screen reader that lands on it.
 */
function Step({
  label,
  sign,
  onPress,
}: {
  label: string;
  sign: 'minus' | 'plus';
  onPress: () => void;
}) {
  return (
    <button
      className="stp__b"
      type="button"
      tabIndex={-1}
      onClick={onPress}
      aria-label={label}
      title={label}
    >
      {/* An SVG rather than a glyph: `−` and `+` at 13px in the UI face sit on
          different optical centres, so a text pair never lines up vertically
          however the box is padded. Two strokes do. */}
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        <path d={sign === 'plus' ? 'M12 5v14M5 12h14' : 'M5 12h14'} />
      </svg>
    </button>
  );
}
