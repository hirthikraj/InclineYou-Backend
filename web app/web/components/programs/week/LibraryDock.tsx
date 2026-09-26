'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import { fetchExerciseMeta, searchExercises } from '@/lib/exercises/actions';
import type { ExerciseWire, ExercisesMeta } from '@/lib/exercises/api';
import { ordinalDayWord } from '@/lib/programs/blueprint';
import { ExerciseInfoView, type ProgramContext } from '../ExerciseInfo';
import { CloseIcon, InfoIcon, SearchIcon } from '../Icons';
import { EXERCISE_MIME } from './dnd';
import { DockPanel } from '@/web-components/ui/DockPanel';

const CAP = 40;

/**
 * THE LIBRARY, DOCKED — not a modal, and that is still the whole argument.
 *
 * On a phone the day is not on screen while you pick, so the picker is
 * full-screen and the trainer reviews a batch before it lands. On a desk the day
 * IS on screen, and a 420px `aria-modal` panel with a scrim is what takes it
 * away. So the desktop library sits BESIDE the board: **one click adds, and the
 * day is the review**.
 *
 * ── AND "BESIDE" IS THE SHELL'S COLUMN NOW, NOT THE PLANE'S RAIL ─────────────
 *
 * This used to render into `.ws__side`, above the balance panel, in a 280px
 * track the board already had. Everything above stayed true and the surface
 * still failed, for a reason none of it covers: it opened without anything
 * moving. MEASURED at 1536 — the *+ Add exercise* pressed on Day 1 is at x=320,
 * the dock arrived at x=1218, and between them nothing reflowed, nothing dimmed
 * and nothing at the click site changed. A `tx-rise` on a 280px card 900px away
 * is not an event a trainer sees. Reported as the library not opening.
 *
 * So it is a `DockPanel` — the same 380px third track *Assign* opens, which is
 * the one surface on this screen trainers DID report as unmistakable, and the
 * reason is that the board narrows by 380px to let it in. The movement is the
 * message. `wslib--drawer` in `app.css` carries the geometry and the widths.
 *
 * WHAT IT GIVES UP is the balance panel sitting directly under it — *chest is 6
 * sets, under the band* while adding. That reading survives: the balance is
 * still on the same screen, and under ~1572px it is the strip ABOVE the board,
 * which is if anything closer to the eye than the rail was. What it buys is a
 * library the trainer can tell is open.
 *
 * NOT `aria-modal`, and no scrim, deliberately — *drag by the grip to land on
 * any day* has to cross from this surface to the board, and a scrim is exactly
 * the thing a drop cannot cross.
 */
export function LibraryDock({
  day,
  dayWord = ordinalDayWord,
  dayLabel,
  onClose,
  onAdd,
  onCarry,
  countFor,
  contextFor,
}: {
  day: number;
  /** What the day is CALLED in the dock's header — the board's own vocabulary,
   *  so *ADDING TO TUE · PUSH* on a client's copy and *ADDING TO DAY 1* on a
   *  blueprint cannot disagree with the card the row lands in. */
  dayWord?: (day: number) => string;
  dayLabel: string;
  onClose: () => void;
  /** One click. No batch, no confirm — the column beside it is the receipt. */
  onAdd: (exercise: ExerciseWire) => void;
  /** The movement a pointer has picked up, or null when it has let go. Held by
   *  the board rather than here, because a drag that starts in the dock is a
   *  drop in Day 4 and the day is the half that needs the record. */
  onCarry?: (exercise: ExerciseWire | null) => void;
  /** How many of this exercise the target day already carries. */
  countFor: (exerciseId: string) => number;
  contextFor?: (exercise: ExerciseWire) => ProgramContext;
}) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<ExerciseWire[]>([]);
  const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState<ExercisesMeta | null>(null);
  const [muscle, setMuscle] = useState('');
  const [equipment, setEquipment] = useState('');
  const [info, setInfo] = useState<ExerciseWire | null>(null);
  const [, start] = useTransition();
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    search.current?.focus();
    start(async () => {
      const [page, m] = await Promise.all([searchExercises({ size: CAP }), fetchExerciseMeta()]);
      if (page) {
        setRows(page.exercises);
        setTotal(page.total);
      }
      if (m) setMeta(m);
    });
  }, []);

  /* Consumed in CAPTURE and only when there is an inner step — the board owns
     the outer Escape, so a handler here that also closed the dock would spend
     two rungs on one keypress. */
  useEffect(() => {
    if (!info) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      setInfo(null);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [info]);

  function refetch(next: { q?: string; muscle?: string; equipment?: string }) {
    const q = next.q ?? query;
    const mg = next.muscle ?? muscle;
    const eq = next.equipment ?? equipment;
    start(async () => {
      const page = await searchExercises({
        size: CAP,
        ...(q ? { q } : {}),
        ...(mg ? { muscleGroup: mg } : {}),
        ...(eq ? { equipment: eq } : {}),
      });
      if (page) {
        setRows(page.exercises);
        setTotal(page.total);
      }
    });
  }

  return (
    /* `DockPanel` FIRST, `wslib` SECOND, and both are load-bearing. The
       component emits `.dock`, which is what `.split:has(> .dock)` matches on to
       open the track and what gives the column its flex shell; `className`
       carries every rule this dock's own internals are written against.
       `wslib--drawer` is the delta between the two — see the block beside
       `.wslib` in `app.css`. */
    <DockPanel className="wslib wslib--drawer" label="The exercise library">
      <div className="wslib__hd">
        <span className="wslib__k">Library</span>
        <button className="wslib__x" type="button" aria-label="Close the library" onClick={onClose}>
          <CloseIcon size={13} />
        </button>
      </div>

      {/* WHERE IT IS GOING, said where the adding happens. A dock that stays
          open while the trainer clicks around the board is a dock that can add
          to the wrong day, and the tokens are the answer. */}
      <div className="wslib__to">
        <span className="wslib__tok">ADDING TO</span>
        <span className="wslib__tok wslib__tok--on">
          {dayWord(day)}
          {dayLabel ? ` · ${dayLabel.toUpperCase()}` : ''}
        </span>
      </div>

      {/* THE TWO GESTURES, SAID ONCE. The grip is the only thing on the row
          that does not add to the day above it, so it is the only thing that
          needs a sentence. */}
      <p className="wslib__drag">
        A click adds to the day above. Drag by the grip to land on any day.
      </p>

      {info ? (
        <div className="wslib__b">
          <ExerciseInfoView
            exercise={info}
            context={(() => {
              const ctx = contextFor?.(info);
              if (!ctx) return undefined;
              return {
                ...ctx,
                onFindPattern: (pattern: string) => {
                  setInfo(null);
                  setQuery(pattern);
                  setMuscle('');
                  setEquipment('');
                  refetch({ q: pattern, muscle: '', equipment: '' });
                },
              };
            })()}
            onBack={() => setInfo(null)}
          />
        </div>
      ) : (
        <>
          <div className="wslib__q">
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
          </div>

          <div className="wslib__f">
            <select
              className="ctl"
              value={muscle}
              aria-label="Filter by muscle group"
              onChange={e => {
                setMuscle(e.target.value);
                refetch({ muscle: e.target.value });
              }}
            >
              <option value="">All muscles</option>
              {(meta?.muscleGroups ?? []).map(m => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              className="ctl"
              value={equipment}
              aria-label="Filter by equipment"
              onChange={e => {
                setEquipment(e.target.value);
                refetch({ equipment: e.target.value });
              }}
            >
              <option value="">All kit</option>
              {(meta?.equipment ?? []).map(eq => (
                <option key={eq} value={eq}>
                  {eq}
                </option>
              ))}
            </select>
          </div>

          <div className="wslib__b">
            {rows.length === 0 ? (
              <p className="wslib__none">Nothing matches.</p>
            ) : (
              <>
                {rows.map(row => (
                  <DockRow
                    key={row.id}
                    row={row}
                    day={day}
                    on={countFor(row.id)}
                    onAdd={() => onAdd(row)}
                    onInfo={() => setInfo(row)}
                    onCarry={onCarry}
                  />
                ))}
                {total > rows.length && (
                  <p className="wslib__cut">
                    Showing {rows.length} of {total}. Narrow the search to see the rest.
                  </p>
                )}
              </>
            )}
          </div>
        </>
      )}
    </DockPanel>
  );
}

/**
 * ONE MOVEMENT IN THE LIST — a click that adds, a grip that carries.
 *
 * DRAGGABLE ONLY WHILE THE GRIP IS HELD, the arming `DayColumn` uses for its
 * rows. A row that is permanently draggable turns a click that wandered three
 * pixels into a drag that adds nothing, and the click is still the primary
 * gesture here: the dock exists to fill the day it is pinned to.
 */
function DockRow({
  row,
  day,
  on,
  onAdd,
  onInfo,
  onCarry,
}: {
  row: ExerciseWire;
  day: number;
  /** How many of this movement the pinned day already carries. */
  on: number;
  onAdd: () => void;
  onInfo: () => void;
  onCarry?: (exercise: ExerciseWire | null) => void;
}) {
  const [armed, setArmed] = useState(false);
  /* A grip pressed and released without a drag leaves the row armed, and a row
     that stays draggable after the pointer has gone is the next accidental
     move. Disarmed on the button coming up anywhere. */
  useEffect(() => {
    if (!armed) return;
    const up = () => setArmed(false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [armed]);

  const meta = [row.target, row.equipment, row.level].filter(Boolean).join(' · ');

  return (
    <div
      className="wslib__w"
      draggable={armed || undefined}
      onDragStart={e => {
        /* COPY, NOT MOVE. The library is not emptied by being drawn from, and
           the cursor is the only place a trainer is told which of the two this
           is before they let go. */
        e.dataTransfer.effectAllowed = 'copy';
        // The private type is what every day tests a drop against; the plain
        // one is there because Firefox starts no drag without it.
        e.dataTransfer.setData(EXERCISE_MIME, row.id);
        e.dataTransfer.setData('text/plain', row.name);
        onCarry?.(row);
      }}
      onDragEnd={() => {
        setArmed(false);
        onCarry?.(null);
      }}
    >
      <span
        className="wslib__g"
        aria-hidden="true"
        title={`Drag ${row.name} onto any day`}
        onMouseDown={() => setArmed(true)}
      >
        <Grip />
      </span>
      <button
        className="wslib__r"
        type="button"
        onClick={onAdd}
        title={`Add ${row.name} to Day ${day}`}
      >
        <span className="wslib__nm">
          {row.name}
          {meta && <span className="wslib__mt">{meta}</span>}
        </span>
        {/* THE BADGE AND THE `+` ARE ONE CLUSTER, and they have to be.
            `.wslib__r` is a TWO-column grid; these were two separate children
            of it, so a row that rendered the badge had THREE grid items and the
            `+` auto-placed onto a second row at the left edge — under the meta
            line, in the middle of the list. Visible only on rows the pinned day
            already carries, which is why it looked intermittent.

            A wrapper and not a third track: one column is the content and one
            is the controls, which is what the row actually is, and it keeps the
            `+` flush right whether or not the badge is there. */}
        <span className="wslib__rr">
          {/* ALREADY ON THIS DAY, stated rather than prevented — a second set
              of curls later in the day is a real prescription, so this informs
              and never refuses. */}
          {on > 0 && <span className="wslib__on">on · {on}</span>}
          <span className="wslib__plus" aria-hidden="true">
            +
          </span>
        </span>
      </button>
      <button
        className="wslib__i"
        type="button"
        aria-label={`What ${row.name} is`}
        onClick={onInfo}
      >
        <InfoIcon size={13} />
      </button>
    </div>
  );
}

/** The grab texture. Local, like the column's, because it is a texture rather
 *  than a symbol and does not belong in the shell's 24-box glyph set. */
function Grip() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
      <circle cx="2.2" cy="2.6" r="1.15" />
      <circle cx="7.8" cy="2.6" r="1.15" />
      <circle cx="2.2" cy="7" r="1.15" />
      <circle cx="7.8" cy="7" r="1.15" />
      <circle cx="2.2" cy="11.4" r="1.15" />
      <circle cx="7.8" cy="11.4" r="1.15" />
    </svg>
  );
}
