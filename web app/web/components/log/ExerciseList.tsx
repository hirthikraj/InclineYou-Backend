'use client';

import type { LogExerciseView } from '@/lib/log/log';
import { Plus } from './Icons';

/**
 * ONE EXERCISE IS OPEN AND THE REST ARE ROWS.
 *
 * The one lesson worth taking from Jefit, and it is a negative one: everything
 * Jefit puts in the thumb zone competes with the tick. Here the whole left
 * column competes with nothing, because it is a list of places rather than a
 * list of controls.
 *
 * The spines are the roster's vocabulary, unchanged: 2px at the left edge, ok
 * for every planned slot ticked, warn for started-and-not-finished. Selection
 * wins both, because the state of the row is written IN the row ("3 of 3 sets")
 * and the state of the pointer is not written anywhere else.
 *
 * **A completed exercise never fades.** §09: a done session in the diary is
 * history and dims; a done exercise mid-session is what you scroll back to
 * check. There is no dimmed state in `.exl` at all.
 */
export function ExerciseList({
  exercises,
  planLabel,
  current,
  onOpen,
  onAdd,
}: {
  exercises: LogExerciseView[];
  planLabel: string;
  current: string | null;
  onOpen: (exerciseId: string) => void;
  onAdd: () => void;
}) {
  return (
    <div>
      <p className="micro" style={{ marginBottom: 7 }}>{planLabel}</p>
      <div className="exl">
        {exercises.map((e) => (
          <button
            className={`exr${e.complete ? ' exr--done' : e.started ? ' exr--part' : ''}`}
            type="button"
            key={e.exerciseId}
            aria-current={e.exerciseId === current}
            onClick={() => onOpen(e.exerciseId)}
          >
            <span className="exr__m">
              <span className="exr__h">
                <span className="exr__t">{e.name}</span>
                {e.verdict === 'record' ? (
                  <span className="tag tag--pr">Record</span>
                ) : e.verdict === 'quiet' ? (
                  <span className="tag tag--pr">Record · quiet</span>
                ) : e.verdict === 'matched' ? (
                  <span className="tag">Matched</span>
                ) : e.verdict === 'first' ? (
                  <span className="tag tag--info">First</span>
                ) : null}
              </span>
              <span className="exr__s">{e.summary}</span>
            </span>
            <span className="exr__n">{e.volumeKg > 0 ? `${e.volumeKg.toLocaleString('en-IN')} kg` : '—'}</span>
          </button>
        ))}

        <button
          className="exr"
          type="button"
          onClick={onAdd}
          style={{ color: 'var(--tx-ink-3)' }}
        >
          <Plus size={16} />
          <span className="exr__m">
            <span className="exr__t" style={{ color: 'var(--tx-ink-3)', fontWeight: 500 }}>
              Add an unplanned exercise
            </span>
            <span className="exr__s">the rack was busy</span>
          </span>
        </button>
      </div>
    </div>
  );
}
