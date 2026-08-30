'use client';

import { useEffect, useMemo, useState } from 'react';

import type { ExerciseNameWire } from '@/lib/programs/api';
import { searchExercises } from '@/lib/exercises/actions';
import type { ExerciseWire } from '@/lib/exercises/api';
import { collapseSets, type Entry, type SetDetail } from '@/lib/programs/blueprint';
import { CheckIcon, CloseIcon, LinkIcon, PlusIcon, SearchIcon, TrashIcon } from './Icons';

/**
 * ONE ROW, ONE PANEL.
 *
 * A sheet becomes a panel when the thing behind it matters, and here it does:
 * the numbers on this row are decided by looking at the four rows around it. All
 * three of the new things live in the one place, in the order a trainer thinks
 * about them — what the set is, what to do instead, and what it is paired with.
 *
 * ── SETS IS A LIST, NOT A COUNT ──────────────────────────────────────────────
 *
 * "Four sets, the last two to failure" is an ordinary prescription and an
 * exercise-level mode cannot say it: there is nothing for "the last two" to
 * attach to. So `sets` stops being a count and becomes a list, and the count is
 * just how long the list is — *Add a set* appends a row, the × removes one.
 * **There is no separate Sets field: two controls for one number is how they end
 * up disagreeing.**
 *
 * The fast path is protected by inheritance rather than by a second control: a
 * new set copies the one above it, so a straight 3 × 12 is still one number
 * typed once. That matters, because a nine-exercise day would otherwise be nine
 * columns of repeated typing.
 *
 * ── AND THE LIST COLLAPSES BACK WHEN IT AGREES ───────────────────────────────
 *
 * A list whose sets all agree is written out as the scalar `sets` and `reps`
 * with **no `setDetail` at all**, because that is the shape every build that
 * predates V31 reads correctly. The list is only persisted once the sets
 * genuinely diverge, and then `reps` goes null and `sets` keeps the count — so
 * an old reader says "4 sets", which is incomplete but true, rather than a
 * number that is wrong for half of them.
 */

export interface RowDraft {
  mode: 'reps' | 'time';
  sets: SetDetail[];
  restSeconds: number | null;
  targetLoad: number | null;
  tempo: string;
  notes: string;
  altExerciseId: string | null;
}

export function toDraft(entry: Entry): RowDraft {
  const mode: 'reps' | 'time' =
    entry.durationSeconds != null || entry.setDetail?.some(s => s.durationSeconds != null)
      ? 'time'
      : 'reps';

  const sets: SetDetail[] =
    entry.setDetail && entry.setDetail.length > 0
      ? entry.setDetail.map(s => ({ ...s }))
      : Array.from({ length: Math.max(1, entry.sets ?? 1) }, () => ({
          reps: entry.reps,
          durationSeconds: entry.durationSeconds,
          toFailure: false,
        }));

  return {
    mode,
    sets,
    restSeconds: entry.restSeconds,
    targetLoad: entry.targetLoad,
    tempo: entry.tempo ?? '',
    notes: entry.notes ?? '',
    altExerciseId: entry.altExerciseId,
  };
}

/** The draft, back into the two shapes the wire has — see the note above. */
export function fromDraft(draft: RowDraft): Partial<Entry> {
  const uniform =
    draft.sets.length > 0 &&
    draft.sets.every(
      s =>
        !s.toFailure &&
        s.reps === draft.sets[0].reps &&
        s.durationSeconds === draft.sets[0].durationSeconds,
    );

  return {
    sets: draft.sets.length || null,
    reps: uniform ? (draft.mode === 'reps' ? draft.sets[0].reps : null) : null,
    durationSeconds: uniform ? (draft.mode === 'time' ? draft.sets[0].durationSeconds : null) : null,
    setDetail: uniform ? null : draft.sets.map(s => ({ ...s })),
    restSeconds: draft.restSeconds,
    targetLoad: draft.targetLoad,
    tempo: draft.tempo.trim() || null,
    notes: draft.notes.trim() || null,
    altExerciseId: draft.altExerciseId,
  };
}

export function RowPanel({
  entry,
  name,
  names,
  pairName,
  canLink,
  onClose,
  onSave,
  onLink,
  onUnlink,
}: {
  entry: Entry;
  name: string;
  names: Record<string, ExerciseNameWire>;
  /** The row this one would pair with, named so the offer is understood before
   *  it is taken rather than discovered after. */
  pairName: string | null;
  canLink: boolean;
  onClose: () => void;
  onSave: (patch: Partial<Entry>) => void;
  onLink: () => void;
  onUnlink: () => void;
}) {
  const [draft, setDraft] = useState<RowDraft>(() => toDraft(entry));

  /* No effect syncing `entry` into the draft, deliberately. The caller keys
     this component on the row's uid, so opening another row REMOUNTS it and the
     lazy initialiser above is the only read that is ever needed. An effect here
     would also fight the trainer: saving commits into the draft the panel is
     holding, which changes `entry`, which would then overwrite what they just
     typed on the way back down. */

  const preview = useMemo(() => collapseSets(draft.sets), [draft.sets]);

  function setSet(i: number, patch: Partial<SetDetail>) {
    setDraft(d => ({ ...d, sets: d.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  }

  function addSet() {
    setDraft(d => {
      const last = d.sets[d.sets.length - 1];
      // A new set copies the one above it — the whole reason there is no
      // separate Sets field.
      return { ...d, sets: [...d.sets, last ? { ...last } : { reps: 10, durationSeconds: null, toFailure: false }] };
    });
  }

  function removeSet(i: number) {
    setDraft(d => (d.sets.length <= 1 ? d : { ...d, sets: d.sets.filter((_, j) => j !== i) }));
  }

  const altName = draft.altExerciseId ? names[draft.altExerciseId]?.name ?? null : null;

  return (
    <aside className="pg__panel" aria-label={`Edit ${name}`}>
      <header className="pg__panelhd">
        <div>
          <p className="pg__panelt">{name}</p>
          <p className="small">
            {preview
              .map(r => (r.count > 1 ? `${r.count} × ${r.label}` : r.label))
              .join(preview.some(r => r.count > 1) ? ', ' : ' · ')}
          </p>
        </div>
        <button className="btn btn--icon btn--ghost" type="button" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>

      <div className="pg__panelb">
        {/* ── the numbers ── */}
        <section className="card">
          <div className="card__hd">
            <span className="card__t">The numbers</span>
            <div className="tools">
              <button
                className="chip"
                type="button"
                aria-pressed={draft.mode === 'reps'}
                onClick={() =>
                  setDraft(d => ({
                    ...d,
                    mode: 'reps',
                    sets: d.sets.map(s => ({
                      ...s,
                      reps: s.reps ?? s.durationSeconds ?? 10,
                      durationSeconds: null,
                    })),
                  }))
                }
              >
                Reps
              </button>
              <button
                className="chip"
                type="button"
                aria-pressed={draft.mode === 'time'}
                onClick={() =>
                  setDraft(d => ({
                    ...d,
                    mode: 'time',
                    sets: d.sets.map(s => ({
                      ...s,
                      durationSeconds: s.durationSeconds ?? s.reps ?? 45,
                      reps: null,
                    })),
                  }))
                }
              >
                Time
              </button>
            </div>
          </div>

          <div className="card__b">
            <div className="setlist">
              <span className="setlist__k">Set</span>
              <span className="setlist__k">{draft.mode === 'reps' ? 'Reps' : 'Seconds'}</span>
              <span className="setlist__k setlist__k--c">Failure</span>
              <span className="setlist__k" />

              {draft.sets.map((set, i) => (
                <SetRow
                  key={i}
                  index={i}
                  set={set}
                  mode={draft.mode}
                  removable={draft.sets.length > 1}
                  onChange={patch => setSet(i, patch)}
                  onRemove={() => removeSet(i)}
                />
              ))}
            </div>

            <button className="btn btn--sm btn--secondary pg__wide pg__gap" type="button" onClick={addSet}>
              <PlusIcon size={12} />
              Add a set
            </button>

            <p className="small pg__gap">
              A new set copies the one above it, so a straight 3 × 12 is one number typed once. Tick a
              set to take it to failure and its reps box reads <span className="fail">F</span>.
            </p>

            <div className="pg__fields">
              <label className="fld">
                <span className="fld__l">Rest, seconds</span>
                <input
                  className="ctl"
                  type="number"
                  min={0}
                  step={5}
                  value={draft.restSeconds ?? ''}
                  onChange={e =>
                    setDraft(d => ({
                      ...d,
                      restSeconds: e.target.value === '' ? null : Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label className="fld">
                <span className="fld__l">Tempo</span>
                <input
                  className="ctl"
                  value={draft.tempo}
                  placeholder="3010"
                  onChange={e => setDraft(d => ({ ...d, tempo: e.target.value }))}
                />
              </label>
              <label className="fld">
                <span className="fld__l">Starting load, kg</span>
                <input
                  className="ctl"
                  type="number"
                  min={0}
                  step={0.5}
                  value={draft.targetLoad ?? ''}
                  onChange={e =>
                    setDraft(d => ({
                      ...d,
                      targetLoad: e.target.value === '' ? null : Number(e.target.value),
                    }))
                  }
                />
              </label>
            </div>

            <p className="small">
              {/* The design set refuses a load on a template and says why — "a load
                  is not a field a template has". It is right about the phone's
                  blueprint and wrong about the wire: `targetLoad` reaches
                  `program_exercise` through apply. So it is offered, empty by
                  default, and the sentence says whose number it becomes. */}
              Load is optional here and is only a <b>starting point</b>. Once this is assigned, the
              client&rsquo;s own copy owns it and what they actually lift is logged against it.
            </p>

            <label className="fld pg__gap">
              <span className="fld__l">Note on this exercise</span>
              <input
                className="ctl"
                value={draft.notes}
                placeholder="slow eccentric"
                onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
              />
            </label>
          </div>
        </section>

        {/* ── the alternate ── */}
        <section className="card">
          <div className="card__hd">
            <span className="card__t">Alternate · optional</span>
          </div>
          <div className="card__b">
            {altName ? (
              <>
                <p className="kv">
                  <span className="kv__k">or</span>
                  <span className="kv__v">{altName}</span>
                </p>
                <button
                  className="btn btn--sm btn--ghost pg__gap"
                  type="button"
                  onClick={() => setDraft(d => ({ ...d, altExerciseId: null }))}
                >
                  Remove the alternate
                </button>
              </>
            ) : (
              <AltPicker onPick={id => setDraft(d => ({ ...d, altExerciseId: id }))} />
            )}
            <p className="small pg__gap">
              Runs the <b>same numbers</b>. It is what your client does when the machine is taken —
              the word is <b>or</b>, because that is what a trainer says.
            </p>
          </div>
        </section>

        {/* ── the superset ── */}
        <section className="card">
          <div className="card__hd">
            <span className="card__t">Superset</span>
          </div>
          <div className="card__b">
            {entry.groupId ? (
              <>
                <p className="small">This exercise is part of a superset.</p>
                <button className="btn btn--sm btn--secondary pg__gap" type="button" onClick={onUnlink}>
                  <LinkIcon size={13} />
                  Break the superset
                </button>
                <p className="small pg__gap">Unlinking puts each row&rsquo;s own rest back.</p>
              </>
            ) : canLink && pairName ? (
              <>
                <button className="btn btn--sm btn--secondary pg__wide" type="button" onClick={onLink}>
                  <LinkIcon size={13} />
                  Superset with {pairName}
                </button>
                <p className="small pg__gap">
                  {/* The one consequence nobody predicts, said before it happens. */}
                  Rest moves to the pair: <b>none between the two, {draft.restSeconds ?? 90}s after the
                  round</b>.
                </p>
              </>
            ) : (
              <p className="small">
                Nothing to pair with — a superset joins this exercise to the one below it, and this is
                the last in the day.
              </p>
            )}
          </div>
        </section>
      </div>

      <footer className="pg__panelft">
        <button className="btn btn--secondary" type="button" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn--primary" type="button" onClick={() => onSave(fromDraft(draft))}>
          Save
        </button>
      </footer>
    </aside>
  );
}

/* ────────────────────────────────────────────────────────── a set row ── */

function SetRow({
  index,
  set,
  mode,
  removable,
  onChange,
  onRemove,
}: {
  index: number;
  set: SetDetail;
  mode: 'reps' | 'time';
  removable: boolean;
  onChange: (patch: Partial<SetDetail>) => void;
  onRemove: () => void;
}) {
  const value = mode === 'reps' ? set.reps : set.durationSeconds;

  return (
    <>
      <span className="setlist__n">{index + 1}</span>
      {set.toFailure ? (
        /* A field the mode has taken over — "to failure" is not typed, it is
           chosen, so the box reports the choice instead of pretending to be
           editable. One red character is findable down a column of twenty in a
           way the words "to failure" are not. */
        <input className="ctl ctl--said ctl--fail" value="F" readOnly aria-label={`Set ${index + 1}: to failure`} />
      ) : (
        <input
          className="ctl"
          type="number"
          min={0}
          value={value ?? ''}
          aria-label={`Set ${index + 1} ${mode === 'reps' ? 'reps' : 'seconds'}`}
          onChange={e => {
            const n = e.target.value === '' ? null : Number(e.target.value);
            onChange(mode === 'reps' ? { reps: n } : { durationSeconds: n });
          }}
        />
      )}
      {/* A BUTTON with `role="checkbox"`, not a native input.
          `.check` in §17 is a styled box keyed on `[aria-checked="true"]` and
          holding a tick SVG it reveals; a native `<input type="checkbox">`
          matches `:checked` and not that attribute, so it draws the design's
          empty box with the browser's own widget sitting on top and never
          fills. Found by rendering — the FAILURE column was four empty squares
          that did not respond visually to being ticked. The button also gets
          §17's 32px hit slop, which `.check--static` deliberately removes and
          an interactive control needs. */}
      <button
        type="button"
        className="check"
        role="checkbox"
        aria-checked={set.toFailure}
        aria-label={`Take set ${index + 1} to failure`}
        onClick={() => onChange({ toFailure: !set.toFailure })}
      >
        <CheckIcon size={11} />
      </button>
      <button
        className="btn btn--icon btn--ghost"
        type="button"
        aria-label={`Remove set ${index + 1}`}
        disabled={!removable}
        onClick={onRemove}
      >
        <TrashIcon size={13} />
      </button>
    </>
  );
}

/* ───────────────────────────────────────────────────── the alt picker ── */

function AltPicker({ onPick }: { onPick: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<ExerciseWire[]>([]);
  const [busy, setBusy] = useState(false);

  /* Everything happens inside the timer, including the clear. A `setRows([])`
     in the effect BODY is a synchronous setState in an effect — a cascading
     render on every keystroke, and React's own lint rule rejects it. Two
     characters, because a one-letter search over 1,324 rows returns the library
     and answers nothing. */
  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      const q = query.trim();
      if (q.length < 2) {
        if (live) {
          setRows([]);
          setBusy(false);
        }
        return;
      }
      if (live) setBusy(true);
      const result = await searchExercises({ q, size: 8 });
      if (live) {
        setRows(result?.exercises ?? []);
        setBusy(false);
      }
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <>
      <label className="search">
        <SearchIcon />
        <input
          type="search"
          value={query}
          placeholder="Find the substitute…"
          aria-label="Search for an alternate exercise"
          onChange={e => setQuery(e.target.value)}
        />
      </label>
      {busy && <p className="small pg__gap">Searching…</p>}
      {rows.map(row => (
        <button key={row.id} className="rowpick" type="button" onClick={() => onPick(row.id)}>
          <span>{row.name}</span>
          <span className="small">{row.equipment ?? ''}</span>
        </button>
      ))}
    </>
  );
}
