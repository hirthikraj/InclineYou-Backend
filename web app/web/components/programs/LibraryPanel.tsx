'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import { fetchExerciseMeta, searchExercises } from '@/lib/exercises/actions';
import type { ExerciseWire, ExercisesMeta } from '@/lib/exercises/api';
import { prescribeFor, type Prescribed } from '@/lib/programs/prescribe';
import { ExerciseInfoView, type ProgramContext } from './ExerciseInfo';
import { CheckIcon, CloseIcon, InfoIcon, SearchIcon } from './Icons';
import { Button } from '@/web-components/ui/Button';
import { Chip } from '@/web-components/ui/Chip';
import { DockPanel } from '@/web-components/ui/DockPanel';

/**
 * THE EXERCISE PICKER — a bottom sheet in two steps.
 *
 * There are two ways into a day and they are two different jobs. The add row on
 * the desk's column is a **type-ahead**, because TrueCoach's builder is the
 * quickest in the category for exactly one reason — you type a movement's name
 * and never leave the keyboard — and a trainer adding a ninth exercise already
 * knows what it is called. This is the other job: browsing 1,324 rows on a
 * phone and taking six at once.
 *
 * ── PICKING AND PRESCRIBING ARE TWO STEPS ────────────────────────────────────
 *
 * They were one, and the one was worse at both. Everything the trainer ticked
 * arrived at a single batch-wide 3 × 10 · 60s and had to be corrected one row
 * at a time afterwards, which is not *adding an exercise* — it is adding one and
 * then repairing it. And the numbers had to sit in the footer of the browse
 * step, where they cost the list its height: MEASURED at 390px, the footer was
 * 438px of 844 and the library got a 214px window onto 2,850px of rows, on the
 * screen whose entire job is browsing them.
 *
 * So: `browse` finds the movements, `prescribe` says what each one is actually
 * being added AS. One card per exercise, its numbers filled in and editable
 * before anything is written — four rows cost one extra tap instead of four
 * trips through a row editor.
 *
 * ── AND IT IS A SHEET, WHICH IS THE SECTION'S OWN IDIOM ──────────────────────
 *
 * `.pgsheet` is already the program switcher and the certified filters, so a
 * trainer who has dismissed one of those knows how to dismiss this. The browse
 * step is TALL — everything below the top bar — because a search field, a
 * wrapping chip row and a 1,324-row list do not fit in 70% of a phone and the
 * day behind is not what a trainer is deciding against while they hunt for a
 * movement; the sheet's own header says where it is going. The prescribe step
 * takes the height its cards need and no more, and there the day behind IS
 * worth seeing — 4 × 6 is a decision about what the day already holds.
 *
 * ── WHAT IT DELIBERATELY DOES NOT CARRY ──────────────────────────────────────
 *
 * Tempo, a note, an alternate and per-set *to failure* are `RowPanel`'s, and
 * they stay there. They are refinements OF A ROW: an alternate is "swap this
 * one out", a note is written against a prescription that exists, and both are
 * one tap away the moment the row lands. Offering them per card would double
 * this step's height for every exercise in a batch, to ask four questions about
 * a row the trainer has not seen in place yet. The four numbers are the ones
 * that cannot be defaulted honestly, and load is one of them — a batch-wide
 * prescription could not carry a load at all, because a load is a claim about
 * one movement.
 */

/** What one ticked exercise is being added as. */
export interface Prescription {
  exercise: ExerciseWire;
  sets: number;
  reps: number | null;
  durationSeconds: number | null;
  restSeconds: number;
  targetLoad: number | null;
}

/** The editable half, keyed by exercise id while the sheet is open. */
interface Draft {
  sets: number;
  value: number;
  mode: 'reps' | 'time';
  rest: number;
  load: string;
}

/** The bucket a movement with no pattern and no `logType` falls in, so the
 *  fallback here and the fallback on the desk are the same four numbers. */
const DEFAULT_DRAFT: Draft = draftFromPrescribed(
  prescribeFor({ movementPattern: null, equipment: null } as ExerciseWire),
);

function draftFromPrescribed(p: Prescribed): Draft {
  return {
    sets: p.sets,
    value: p.reps ?? p.durationSeconds ?? 10,
    mode: p.reps != null ? 'reps' : 'time',
    rest: p.restSeconds,
    load: '',
  };
}

/**
 * THE NAME REGEX IS GONE, and it was a workaround for a missing field.
 *
 * It read: *"A held movement is prescribed in seconds, and asking for reps of a
 * plank is how a template ends up saying 3 × 10 plank. Matched on the name
 * because `log_type` is not on `ExerciseResponse`."* The diagnosis was right and
 * the mechanism could not be — of the FIFTEEN timed movements in the catalogue
 * it caught **three** (Plank, Side Plank, Farmer Carry) and missed Treadmill
 * Run, Rowing Machine, Assault Bike, Jump Rope, Battle Ropes, Sled Push,
 * Cat-Cow and five more, while matching any name that happened to contain
 * *carry* or *isometric*.
 *
 * `logType` is on `ExerciseWire` now — it was always on the wire, just absent
 * from the interface — so the question is answered rather than inferred, and
 * both shells seed from the one table in `prescribe.ts`.
 */
function draftFor(exercise: ExerciseWire): Draft {
  return draftFromPrescribed(prescribeFor(exercise));
}

export function LibraryPanel({
  destination,
  onClose,
  onAdd,
  contextFor,
}: {
  /** "Day 1 · Push" — named on the button, not just in the header. */
  destination: string;
  onClose: () => void;
  /** THE ROWS, NOT THEIR IDS. The builder keeps a local overlay of names for
   *  exercises the blueprint did not arrive with, and it can only fill it from
   *  the row it was handed in the click — an id would send it to ask for a name
   *  it had already been given, and until the answer came back the row would
   *  read *Exercise not in your library* and count for nothing in the balance.
   *  `addOne` learned this on the dock; this is the same lesson on the batch. */
  onAdd: (items: Prescription[]) => void;
  /** What this exercise is already doing to the program, for the detail view's
   *  third section. Optional: a panel with no builder behind it draws the other
   *  six sections and simply does not make a claim it cannot support. */
  contextFor?: (exercise: ExerciseWire) => ProgramContext;
}) {
  const [step, setStep] = useState<'browse' | 'prescribe'>('browse');
  const [query, setQuery] = useState('');
  /* The sheet's detail VIEW, not a second surface — see `ExerciseInfoView`. */
  const [info, setInfo] = useState<ExerciseWire | null>(null);
  const [rows, setRows] = useState<ExerciseWire[]>([]);
  const [total, setTotal] = useState(0);
  /* A MAP, AND IT HOLDS THE ROWS RATHER THAN THEIR IDS. `rows` is replaced on
     every search, so a set of ids could not be resolved back: tick a bench
     press, search *squat*, tick another, and the bench press is no longer in
     `rows` to look up — which is exactly the batch step 2 then has to draw. A
     Map also keeps insertion order, so the exercises arrive in the day in the
     order the trainer ticked them. */
  const [picked, setPicked] = useState<Map<string, ExerciseWire>>(new Map());
  /* Keyed by exercise id, so un-ticking and re-ticking a row inside one sitting
     brings its numbers back rather than resetting them. */
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [meta, setMeta] = useState<ExercisesMeta | null>(null);
  const [muscle, setMuscle] = useState<string | null>(null);
  const [noKit, setNoKit] = useState(false);
  const [pending, start] = useTransition();
  const search = useRef<HTMLInputElement>(null);

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
    // Mount only: the sheet is keyed on its destination by the caller, so
    // re-opening it for another day remounts rather than re-running this.
  }, []);

  /* ESCAPE UNWINDS ONE STEP AT A TIME — the detail view, then the prescribe
     step, then the sheet. Closing the whole sheet from inside either would
     throw away the batch and the search the trainer got there with, which is
     exactly what going back exists to protect.

     ── AND THE SHEET DOES NOT CLOSE ITSELF ──────────────────────────────────
     `Builder` owns the outer ladder, and this component used to carry a second
     handler that closed the sheet too. Both fired on one keypress, so opening
     the detail view and pressing Escape spent two rungs at once and the whole
     sheet vanished. FOUND BY RENDERING; two independent handlers on `window`
     look correct in either file on its own.
     So this consumes Escape ONLY when it has an inner step to spend it on, and
     is registered in the CAPTURE phase to do it: a capture listener on `window`
     runs before every bubble listener on `window`. When there is no inner step
     the event is left alone and the ladder closes the sheet, which is the one
     place that decision belongs.

     `PhoneProgram`'s handler is the other capture listener on this window and it
     is registered FIRST, so it would win this argument outright — which is why
     it takes a `covered` prop and stands down while this sheet is open. */
  useEffect(() => {
    if (!info && step === 'browse') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      if (info) setInfo(null);
      else setStep('browse');
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [info, step]);

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

  function toggle(exercise: ExerciseWire) {
    setPicked(prev => {
      const next = new Map(prev);
      if (next.has(exercise.id)) next.delete(exercise.id);
      else next.set(exercise.id, exercise);
      return next;
    });
    setDrafts(prev => (prev[exercise.id] ? prev : { ...prev, [exercise.id]: draftFor(exercise) }));
  }

  function edit(id: string, patch: Partial<Draft>) {
    setDrafts(prev => ({ ...prev, [id]: { ...(prev[id] ?? DEFAULT_DRAFT), ...patch } }));
  }

  const batch = [...picked.values()];
  const draftOf = (id: string) => drafts[id] ?? DEFAULT_DRAFT;

  /** *Use these for all* copies sets, reps and rest — and NEVER the load, which
   *  is a claim about one movement. 60kg is a working bench and a very light
   *  squat, so copying it across a batch writes a number the trainer would have
   *  to go and correct on every row, which is the defect the prescribe step
   *  exists to remove. */
  function applyToAll(from: Draft) {
    setDrafts(prev => {
      const next = { ...prev };
      for (const ex of batch) {
        const own = next[ex.id] ?? draftFor(ex);
        next[ex.id] = { ...own, sets: from.sets, value: from.value, mode: from.mode, rest: from.rest };
      }
      return next;
    });
  }

  function commit() {
    onAdd(
      batch.map(exercise => {
        const d = draftOf(exercise.id);
        const load = d.load.trim() === '' ? null : Number(d.load);
        return {
          exercise,
          sets: d.sets,
          reps: d.mode === 'reps' ? d.value : null,
          durationSeconds: d.mode === 'time' ? d.value : null,
          restSeconds: d.rest,
          targetLoad: load === null || Number.isNaN(load) ? null : load,
        };
      }),
    );
  }

  /* ── the detail view: one renderer, and it is a VIEW rather than a sheet over
        a sheet. `‹ Library` comes back to the same rows, because the search and
        the filters are unmounted and their STATE is not. */
  const detail = info && (
    <DockPanel.Body>
      <ExerciseInfoView
        exercise={info}
        context={(() => {
          const ctx = contextFor?.(info);
          if (!ctx) return undefined;
          /* THE SHEET OWNS THE SEARCH, so it supplies the handler rather than
             making the builder know that a pattern is searchable. It clears the
             muscle and kit filters with it — a trainer asking for every hinge
             does not mean every hinge that is also a cable. */
          return {
            ...ctx,
            onFindPattern: (pattern: string) => {
              setInfo(null);
              setStep('browse');
              setQuery(pattern);
              setMuscle(null);
              setNoKit(false);
              refetch({ q: pattern, muscle: null, noKit: false });
            },
          };
        })()}
        onBack={() => setInfo(null)}
      />
    </DockPanel.Body>
  );

  const browse = (
    <>
      <DockPanel.Filters>
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
          <Chip
            pressed={noKit}
            onClick={() => {
              const next = !noKit;
              setNoKit(next);
              if (next) setMuscle(null);
              refetch({ noKit: next, muscle: next ? null : muscle });
            }}
          >
            No kit
          </Chip>
          {/* All of them, not `.slice(0, 8)`.
              FOUND BY RENDERING: the library came back sorted, so eight chips
              meant *abductors, abs, adductors, biceps, calves, cardiovascular
              system, delts, forearms* — and a trainer building a Push day
              looking for chest or back found neither. A truncated filter row is
              worse than no filter row, because it looks complete. They wrap. */}
          {(meta?.muscleGroups ?? []).map(mg => (
            <Chip
              pressed={muscle === mg}
              key={mg}
              onClick={() => {
                const next = muscle === mg ? null : mg;
                setMuscle(next);
                refetch({ muscle: next });
              }}
            >
              {mg}
            </Chip>
          ))}
        </div>
      </DockPanel.Filters>

      {/* NOT a `DockPanel.Body`, and the modifier without its base is the reason.
         On desktop this element carries `dock__body--list` ALONE — the gutter rule,
         borrowed — and nothing else: `.pgsheet__scroll` is defined only under
         `@media (max-width:900px)`, where the panel is a phone sheet and this is its
         scroller. Rendering the component here would add `flex:1`, `min-height:0`,
         `overflow-y:auto` and a flex column to it at every width above 900px. */}
      <div className="pgsheet__scroll dock__body--list">
        {pending && rows.length === 0 ? (
          <p className="pg__none">Loading the library…</p>
        ) : rows.length === 0 ? (
          <p className="pg__none">Nothing matches.</p>
        ) : (
          <>
            {rows.map(row => {
              const on = picked.has(row.id);
              /* WHAT MAKES TWO ROWS DIFFERENT, in the order a trainer reads it.
                 The target comes first because it is the discriminator: this
                 row said `Barbell` and so did the four above it. */
              const meta = [row.target, row.equipment, row.level].filter(Boolean).join(' · ');
              return (
                <div className="pg__optw" key={row.id}>
                  <button
                    className="dayc__opt pg__opt"
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(row)}
                  >
                    <span className="pg__optmark" aria-hidden="true">
                      {on ? <CheckIcon size={13} /> : null}
                    </span>
                    <span className="pg__optm">
                      <span className="pg__optn">{row.name}</span>
                      {meta && (
                        <span className="pg__optt" title={meta}>
                          {meta}
                        </span>
                      )}
                    </span>
                  </button>
                  <button
                    className="pg__opti"
                    type="button"
                    aria-label={`What ${row.name} is`}
                    onClick={() => setInfo(row)}
                  >
                    <InfoIcon size={13} />
                  </button>
                </div>
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
    </>
  );

  const prescribe = (
    <div className="pgsheet__scroll pglib__set">
      {batch.map((exercise, i) => {
        const d = draftOf(exercise.id);
        const meta = [exercise.target, exercise.equipment].filter(Boolean).join(' · ');
        return (
          <section className="pglib__card" key={exercise.id}>
            <header className="pglib__cardhd">
              {/* The ordinal it will WEAR in the day, so the card and the row it
                  becomes are the same thing in the trainer's head. It is the
                  position within the batch, not the day's index, which the day
                  itself supplies on arrival. */}
              <span className="pglib__ord">{i + 1}</span>
              <span className="pglib__cardnm">
                {exercise.name}
                {meta && <span className="pglib__cardmt">{meta}</span>}
              </span>
              <button
                className="pg__opti"
                type="button"
                aria-label={`Take ${exercise.name} out of this batch`}
                onClick={() => toggle(exercise)}
              >
                <CloseIcon size={13} />
              </button>
            </header>

            <div className="fldrow pg__nums">
              <label className="fld fld--w1">
                <span className="fld__l">Sets</span>
                <input
                  className="ctl"
                  type="number"
                  min={1}
                  value={d.sets}
                  onChange={e => edit(exercise.id, { sets: Math.max(1, Number(e.target.value) || 1) })}
                />
              </label>
              <label className="fld fld--w1">
                <span className="fld__l">{d.mode === 'reps' ? 'Reps' : 'Seconds'}</span>
                <input
                  className="ctl"
                  type="number"
                  min={1}
                  value={d.value}
                  onChange={e => edit(exercise.id, { value: Math.max(1, Number(e.target.value) || 1) })}
                />
              </label>
              <label className="fld fld--w1">
                <span className="fld__l">Rest, s</span>
                <input
                  className="ctl"
                  type="number"
                  min={0}
                  step={5}
                  value={d.rest}
                  onChange={e => edit(exercise.id, { rest: Math.max(0, Number(e.target.value) || 0) })}
                />
              </label>
            </div>

            <div className="fldrow pglib__second">
              <label className="fld">
                <span className="fld__l">Starting load, kg · optional</span>
                <input
                  className="ctl"
                  type="number"
                  min={0}
                  step={2.5}
                  placeholder="—"
                  value={d.load}
                  onChange={e => edit(exercise.id, { load: e.target.value })}
                />
              </label>
              <div className="fld">
                <span className="fld__l">Measured in</span>
                <div className="tools">
                  <Chip
                    pressed={d.mode === 'reps'}
                    onClick={() => edit(exercise.id, { mode: 'reps', value: 10 })}
                  >
                    Reps
                  </Chip>
                  <Chip
                    pressed={d.mode === 'time'}
                    onClick={() => edit(exercise.id, { mode: 'time', value: 45 })}
                  >
                    Time
                  </Chip>
                </div>
              </div>
            </div>

            {/* Only on the first card, and only when there is a second to copy
                to: a control that appears once per card would offer the same act
                four times and read as four different acts. */}
            {i === 0 && batch.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="pglib__all"
                onClick={() => applyToAll(d)}
              >
                Use these sets &amp; reps for all {batch.length}
              </Button>
            )}
          </section>
        );
      })}
      <p className="small pglib__note">
        A tempo, a note and an alternate belong to the row and are one tap away once it lands.
      </p>
    </div>
  );

  const title = step === 'prescribe' ? 'Sets & reps' : 'Add exercises';

  return (
    <>
      {/* A `<div role="presentation">` with an onClick, which is `ProgramSwitcher`'s
          call for this family. Tapping away is the dismissal a thumb reaches for
          and the grab handle is what says so. */}
      <div className="pgsheet__scrim" role="presentation" onClick={onClose} />
      <div
        className={`pgsheet pglib${step === 'browse' ? ' pgsheet--tall' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${title} for ${destination}`}
      >
        <div className="pgsheet__grab" aria-hidden="true" />
        <header className="pgsheet__hd pglib__hd">
          {step === 'prescribe' && (
            <button
              className="btn btn--icon btn--ghost"
              type="button"
              aria-label="Back to the library"
              onClick={() => setStep('browse')}
            >
              <span aria-hidden="true">‹</span>
            </button>
          )}
          <div className="pglib__ttl">
            <p className="pgsheet__t">{title}</p>
            <p className="small">to {destination}</p>
          </div>
          <Button
            variant="ghost"
            iconOnly
            label="Close"
            onClick={onClose}
            title={undefined}
            icon={<CloseIcon />}
          />
        </header>

        {detail ?? (step === 'browse' ? browse : prescribe)}

        {/* THE FOOTER IS THE STEP'S OWN VERB, and it SURVIVES THE DETAIL VIEW.
            That is the one thing this footer must not stand down for: the count
            is how a trainer reading about a ninth movement can still see they
            have eight waiting, and losing it there is losing the batch from the
            screen while the batch is still held. The detail view sits over the
            browse step, so it keeps the browse step's verb — pressing it goes
            on to the numbers, which is where a trainer who has just decided in
            favour of a movement wants to be. */}
        <div className="pgsheet__ft">
          {step === 'browse' || info ? (
            <Button
              variant="primary"
              size="lg"
              wide
              disabled={batch.length === 0}
              onClick={() => {
                setInfo(null);
                setStep('prescribe');
              }}
            >
              {batch.length === 0
                ? `Pick exercises for ${destination}`
                : `Sets & reps · ${batch.length} ›`}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              wide
              disabled={batch.length === 0}
              onClick={commit}
            >
              Add {batch.length} to {destination}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
