'use client';

import { useEffect, useRef } from 'react';

import type { LogExerciseView } from '@/lib/log/log';
import { Plus } from './Icons';
import { Tag } from '@/web-components/ui/Tag';

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
  /* ── THE OPEN CHIP HAS TO BE ON THE SCREEN ─────────────────────────────
     Below 980px this list is a horizontal rail, and the rail does not scroll
     itself. MEASURED at 390 on the seeded session: 1024px of chips in a 351px
     window, so an exercise five along is opened from the dock's *Next* or from
     `?ex=` and the chip that is now current is 400px off the right edge —
     the one part of the screen that says WHERE IN THE SESSION YOU ARE, showing
     somewhere you are not.

     `block:'nearest'` and `inline:'center'`, which is the split `SetGrid`'s own
     scroll-into-view makes for the same reason: the page must not move
     vertically (the trainer is looking at the grid), and the rail must, so the
     chips on either side are visible and the rail reads as a place in a
     sequence rather than a single chip. */
  const rail = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!rail.current || !current) return;
    rail.current
      .querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [current]);

  return (
    <div>
      <p className="micro" style={{ marginBottom: 7 }}>{planLabel}</p>
      <div className="exl" ref={rail}>
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
                {/* ── WHAT THE CHIP RAIL GAVE UP, PUT BACK AS A FIGURE ──────
                    Below 980px `.exr__s`, `.exr__n` and the verdict tag are all
                    `display:none`, so a chip is a NAME and nothing else and the
                    rail answers *which exercises are on today* while saying
                    nothing about how far through any of them the session is.
                    The spine under the chip is two states (started, done) and
                    cannot count.

                    `2/4` is the part of `.exr__s` that is a fact rather than a
                    sentence — the summary in full is *2 of 4 sets · top 37.5 kg
                    × 6*, which is a 190px line and is why the rail dropped it.
                    Drawn only where the chips are chips: on the desk the list
                    column states it in words, and two spellings of one count in
                    one component is the duplication `.setg__sum` was written to
                    avoid. */}
                <span className="exr__c" aria-hidden="true">
                  {e.sets.filter((s) => s.done).length}/{e.sets.length}
                </span>
                {e.verdict === 'record' ? (
                  <Tag tone="pr">Record</Tag>
                ) : e.verdict === 'quiet' ? (
                  <Tag tone="pr">Record · quiet</Tag>
                ) : e.verdict === 'matched' ? (
                  <Tag>Matched</Tag>
                ) : e.verdict === 'first' ? (
                  <Tag tone="info">First</Tag>
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
