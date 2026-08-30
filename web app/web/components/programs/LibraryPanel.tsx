'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import { fetchExerciseMeta, searchExercises } from '@/lib/exercises/actions';
import type { ExerciseWire, ExercisesMeta } from '@/lib/exercises/api';
import { CheckIcon, CloseIcon, SearchIcon } from './Icons';

/**
 * THE LIBRARY PANEL — the job typing is bad at.
 *
 * There are two ways into a day and they are two different jobs. The add row on
 * the column is a **type-ahead**, because TrueCoach's builder is the quickest in
 * the category for exactly one reason — you type a movement's name and never
 * leave the keyboard — and a trainer adding a ninth exercise already knows what
 * it is called. This panel is the other job: browsing 1,324 rows and taking six
 * at once.
 *
 * ── THE COUNT ON THE BUTTON STATES THE OUTCOME ───────────────────────────────
 *
 * "Add 4 to Day 1 · Push", not "Done", and it names the slot — so a panel opened
 * from the wrong column is caught before it is committed rather than after.
 *
 * ── AND THE NUMBERS ARE ASKED, NOT INVENTED ──────────────────────────────────
 *
 * The phone asks per exercise, in a sheet, because every add on a phone is one
 * add. Here four are going in together, so it is asked **once for the batch**
 * with the app's own defaults — 3 × 10 · 60s — and the Reps / Time toggle is
 * present because "3 × 45s plank" has no honest spelling in a reps field. The
 * page this replaces wrote a prescription silently and left the trainer to fix
 * forty-five cells afterwards.
 */

export interface BatchPrescription {
  sets: number;
  value: number;
  mode: 'reps' | 'time';
  restSeconds: number;
}

export function LibraryPanel({
  destination,
  onClose,
  onAdd,
}: {
  /** "Day 1 · Push" — named on the button, not just in the header. */
  destination: string;
  onClose: () => void;
  onAdd: (ids: string[], prescription: BatchPrescription) => void;
}) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<ExerciseWire[]>([]);
  const [total, setTotal] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [meta, setMeta] = useState<ExercisesMeta | null>(null);
  const [muscle, setMuscle] = useState<string | null>(null);
  const [noKit, setNoKit] = useState(false);
  const [pending, start] = useTransition();
  const search = useRef<HTMLInputElement>(null);

  const [sets, setSets] = useState(3);
  const [value, setValue] = useState(10);
  const [mode, setMode] = useState<'reps' | 'time'>('reps');
  const [rest, setRest] = useState(60);

  useEffect(() => {
    search.current?.focus();
    start(async () => {
      const [page, m] = await Promise.all([searchExercises({ size: 60 }), fetchExerciseMeta()]);
      if (page) {
        setRows(page.exercises);
        setTotal(page.total);
      }
      if (m) setMeta(m);
    });
    // Mount only: the panel is keyed on its destination by the caller, so
    // re-opening it for another day remounts rather than re-running this.
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function refetch(next: { q?: string; muscle?: string | null; noKit?: boolean }) {
    const q = next.q ?? query;
    const mg = next.muscle === undefined ? muscle : next.muscle;
    const kit = next.noKit === undefined ? noKit : next.noKit;
    start(async () => {
      const page = await searchExercises({
        size: 60,
        ...(q ? { q } : {}),
        ...(mg ? { muscleGroup: mg } : {}),
        ...(kit ? { equipment: 'body weight' } : {}),
      });
      if (page) {
        setRows(page.exercises);
        setTotal(page.total);
      }
    });
  }

  function toggle(id: string) {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <aside className="pg__panel" aria-label={`Add exercises to ${destination}`}>
      <header className="pg__panelhd">
        <div>
          <p className="pg__panelt">Add exercises</p>
          <p className="small">to {destination}</p>
        </div>
        <button className="btn btn--icon btn--ghost" type="button" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>

      <div className="pg__panelfilters">
        <label className="search">
          <SearchIcon />
          <input
            ref={search}
            type="search"
            value={query}
            placeholder="Search the library"
            aria-label="Search the exercise library"
            onChange={e => {
              setQuery(e.target.value);
              refetch({ q: e.target.value });
            }}
          />
        </label>
        <div className="tools">
          <button
            className="chip"
            type="button"
            aria-pressed={noKit}
            onClick={() => {
              const next = !noKit;
              setNoKit(next);
              if (next) setMuscle(null);
              refetch({ noKit: next, muscle: next ? null : muscle });
            }}
          >
            No kit
          </button>
          {/* All of them, not `.slice(0, 8)`.
              FOUND BY RENDERING: the library came back sorted, so eight chips
              meant *abductors, abs, adductors, biceps, calves, cardiovascular
              system, delts, forearms* — and a trainer building a Push day
              looking for chest or back found neither. A truncated filter row is
              worse than no filter row, because it looks complete. They wrap. */}
          {(meta?.muscleGroups ?? []).map(mg => (
            <button
              key={mg}
              className="chip"
              type="button"
              aria-pressed={muscle === mg}
              onClick={() => {
                const next = muscle === mg ? null : mg;
                setMuscle(next);
                refetch({ muscle: next });
              }}
            >
              {mg}
            </button>
          ))}
        </div>
      </div>

      <div className="pg__panelb pg__panelb--list">
        {pending && rows.length === 0 ? (
          <p className="pg__none">Loading the library…</p>
        ) : rows.length === 0 ? (
          <p className="pg__none">Nothing matches.</p>
        ) : (
          <>
            {rows.map(row => {
              const on = picked.has(row.id);
              return (
                <button
                  key={row.id}
                  className="dayc__opt pg__opt"
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(row.id)}
                >
                  <span className="pg__optmark" aria-hidden="true">
                    {on ? <CheckIcon size={13} /> : null}
                  </span>
                  {row.name}
                  <span>{row.equipment ?? row.muscleGroup ?? ''}</span>
                </button>
              );
            })}
            {total > rows.length && (
              <p className="small pg__none">
                {rows.length} of {total}. Narrow the search to see the rest.
              </p>
            )}
          </>
        )}
      </div>

      <footer className="pg__panelft pg__panelft--stack">
        <div className="fldrow">
          <label className="fld fld--w1">
            <span className="fld__l">Sets</span>
            <input
              className="ctl"
              type="number"
              min={1}
              value={sets}
              onChange={e => setSets(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <label className="fld fld--w1">
            <span className="fld__l">{mode === 'reps' ? 'Reps' : 'Seconds'}</span>
            <input
              className="ctl"
              type="number"
              min={1}
              value={value}
              onChange={e => setValue(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <label className="fld fld--w1">
            <span className="fld__l">Rest, seconds</span>
            <input
              className="ctl"
              type="number"
              min={0}
              step={5}
              value={rest}
              onChange={e => setRest(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
          <div className="fld">
            <span className="fld__l">Measured in</span>
            <div className="tools">
              <button
                className="chip"
                type="button"
                aria-pressed={mode === 'reps'}
                onClick={() => {
                  setMode('reps');
                  setValue(10);
                }}
              >
                Reps
              </button>
              <button
                className="chip"
                type="button"
                aria-pressed={mode === 'time'}
                onClick={() => {
                  setMode('time');
                  setValue(45);
                }}
              >
                Time
              </button>
            </div>
          </div>
        </div>

        <button
          className="btn btn--primary btn--lg pg__wide"
          type="button"
          disabled={picked.size === 0}
          onClick={() => onAdd([...picked], { sets, value, mode, restSeconds: rest })}
        >
          {picked.size === 0
            ? `Pick exercises for ${destination}`
            : `Add ${picked.size} to ${destination}`}
        </button>
        <p className="small">
          They all get {sets} × {mode === 'reps' ? value : `${value}s`} · {rest}s rest. Change any of
          them afterwards from the row.
        </p>
      </footer>
    </aside>
  );
}
