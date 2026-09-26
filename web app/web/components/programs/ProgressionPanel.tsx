'use client';

import { useMemo, useState } from 'react';

import {
  entriesFor,
  ladder,
  type Entry,
  type ProgressionStep,
} from '@/lib/programs/blueprint';
import { CloseIcon } from './Icons';
import { Button } from '@/web-components/ui/Button';
import { Chip } from '@/web-components/ui/Chip';
import { Why } from '@/web-components/ui/Why';
import { DockPanel } from '@/web-components/ui/DockPanel';

/**
 * THE PROGRESSION RULE — thirty-six cells, stated once.
 *
 * The brief's own arithmetic: *"week 1: 3×8, week 2: 3×10, week 3: 3×12. Set
 * once instead of typing 36 cells."* Nine exercises across eight weeks is
 * seventy-two edits, and a builder that costs seventy-two edits to express an
 * ordinary block is one a trainer abandons for a spreadsheet — which is the
 * failure mode the whole screen exists to prevent.
 *
 * This is the only feature on `/programs` with **no frame in the design set**.
 * `webapp-programs.html` draws the weeks-across view, which is how you *read* a
 * progression, and stops there. So the shape below is argued rather than
 * copied:
 *
 * ── ONE ROW PER WEEK, BECAUSE THAT IS THE THING BEING WRITTEN ────────────────
 *
 * The same argument the row panel makes for sets. A generator ("+2 reps a week")
 * cannot say "weeks 5 and 6 deload", and nobody's block is a rule all the way to
 * week eight — so the generators are **seeds for the grid**, not the grid's
 * replacement. Press one, then edit week 6.
 *
 * ── IT NAMES WHAT IT IS ABOUT TO OVERWRITE ───────────────────────────────────
 *
 * Materialising week 4 replaces whatever week 4 held, because merging two
 * prescriptions for one exercise has no honest answer. A week that already has
 * content is counted and named in the button before it runs, which is the same
 * promise the library panel's "Add 4 to Day 1 · Push" makes.
 *
 * ── AND IT ONLY WRITES THE WEEKS IT IS GIVEN ─────────────────────────────────
 *
 * Laddering weeks 1–4 of an eight-week block leaves 5–8 repeating week 1, which
 * is the model's own answer for "nothing of its own" rather than a gap. Twelve
 * authored weeks that all say the same thing is the blank grid the phone
 * deliberately refuses, arrived at from the other end.
 */
export function ProgressionPanel({
  entries,
  weeks,
  days,
  dayLabels,
  onClose,
  onApply,
}: {
  entries: Entry[];
  weeks: number;
  /** Every day slot the template lays out. */
  days: number[];
  dayLabels: Record<string, string>;
  onClose: () => void;
  onApply: (plan: ProgressionStep[], days: number[]) => void;
}) {
  const [scope, setScope] = useState<Set<number>>(() => new Set(days));
  const [upto, setUpto] = useState(Math.min(weeks, 4));

  /* Week 1 is what every other week is a version of, so the ladder is seeded
     from the commonest prescription actually in it rather than from a constant.
     A trainer who writes 4 × 6 across Day 1 opens this holding 4 × 6. */
  const base = useMemo(() => seedFrom(entries, days), [entries, days]);

  const [plan, setPlan] = useState<ProgressionStep[]>(() =>
    ladder(Math.min(weeks, 4), base, { repsStep: 2 }),
  );

  const inScope = [...scope].sort((a, b) => a - b);

  /* What this is about to replace. Counted over the weeks the plan names and
     the days in scope, and it is the sentence the button carries. */
  const overwriting = useMemo(() => {
    const touched = new Set(plan.map(p => p.week));
    const weeksHit = new Set<number>();
    for (const e of entries) {
      if (e.week !== 1 && touched.has(e.week) && scope.has(e.day)) weeksHit.add(e.week);
    }
    return [...weeksHit].sort((a, b) => a - b);
  }, [entries, plan, scope]);

  const rowsInScope = entries.filter(e => e.week === 1 && scope.has(e.day)).length;

  function reseed(upToWeek: number, opts: Parameters<typeof ladder>[2]) {
    setUpto(upToWeek);
    setPlan(ladder(upToWeek, base, opts));
  }

  function setStep(week: number, patch: Partial<ProgressionStep>) {
    setPlan(p => p.map(step => (step.week === week ? { ...step, ...patch } : step)));
  }

  const timed = base.durationSeconds != null;

  return (
    <DockPanel label="Set a progression">
      <DockPanel.Head
        title={"Progression"}
        sub={"Write the ladder once instead of every cell"}
        actions={
          <Button variant="ghost" iconOnly label="Close" onClick={onClose} title={undefined} icon={<CloseIcon />} />
        }
      />

      <DockPanel.Body>
        <section className="card">
          <div className="card__hd">
            <span className="card__t">Which days</span>
          </div>
          <div className="card__b">
            <div className="tools">
              {days.map(day => (
                <Chip
                  pressed={scope.has(day)}
                  key={day}
                  onClick={() =>
                    setScope(prev => {
                      const next = new Set(prev);
                      if (next.has(day)) next.delete(day);
                      else next.add(day);
                      return next;
                    })
                  }
                >
                  Day {day}
                  {dayLabels[String(day)] ? ` · ${dayLabels[String(day)]}` : ''}
                </Chip>
              ))}
            </div>
            <p className="small pg__gap">
              Week 1 of {inScope.length === 0 ? 'no days' : `${inScope.length} day${inScope.length === 1 ? '' : 's'}`} is
              the shape every other week takes — {rowsInScope} exercise
              {rowsInScope === 1 ? '' : 's'}. Rows on the days you leave out are not touched, in any
              week.
            </p>
          </div>
        </section>

        <section className="card">
          <div className="card__hd">
            <span className="card__t">The ladder</span>
          </div>
          <div className="card__b">
            <div className="tools">
              <Chip onClick={() => reseed(upto, { repsStep: 2 })}>
                +2 {timed ? 'seconds' : 'reps'} a week
              </Chip>
              <Chip onClick={() => reseed(upto, { repsStep: 1 })}>
                +1 a week
              </Chip>
              <Chip onClick={() => reseed(upto, { setsEvery: 2 })}>
                +1 set every 2 weeks
              </Chip>
              <Chip onClick={() => reseed(upto, {})}>
                Same every week
              </Chip>
            </div>

            <label className="fld pg__gap">
              <span className="fld__l">Ladder through week</span>
              <input
                className="ctl"
                type="number"
                min={1}
                max={weeks}
                value={upto}
                onChange={e => {
                  const n = Math.max(1, Math.min(weeks, Number(e.target.value) || 1));
                  reseed(n, { repsStep: 2 });
                }}
              />
              <span className="fld__h">
                Of {weeks}. Weeks past this one keep repeating week 1, which is what a week with
                nothing of its own means.
              </span>
            </label>

            <div className="pg__ladder">
              <span className="setlist__k">Week</span>
              <span className="setlist__k">Sets</span>
              <span className="setlist__k">{timed ? 'Seconds' : 'Reps'}</span>
              <span className="setlist__k">Load, kg</span>

              {plan.map(step => (
                <div className="pg__ladderrow" key={step.week}>
                  <span className="setlist__n">{step.week}</span>
                  <input
                    className="ctl"
                    type="number"
                    min={1}
                    aria-label={`Week ${step.week} sets`}
                    value={step.sets ?? ''}
                    onChange={e =>
                      setStep(step.week, {
                        sets: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                  <input
                    className="ctl"
                    type="number"
                    min={1}
                    aria-label={`Week ${step.week} ${timed ? 'seconds' : 'reps'}`}
                    value={(timed ? step.durationSeconds : step.reps) ?? ''}
                    onChange={e => {
                      const n = e.target.value === '' ? null : Number(e.target.value);
                      setStep(step.week, timed ? { durationSeconds: n } : { reps: n });
                    }}
                  />
                  <input
                    className="ctl"
                    type="number"
                    min={0}
                    step={2.5}
                    aria-label={`Week ${step.week} load`}
                    placeholder="—"
                    value={step.targetLoad ?? ''}
                    onChange={e =>
                      setStep(step.week, {
                        targetLoad: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {overwriting.length > 0 && (
          <Why heading="Heads up" tone="warn">
            <p>
              Week{overwriting.length === 1 ? '' : 's'} {overwriting.join(', ')} already{' '}
              {overwriting.length === 1 ? 'has' : 'have'} exercises of their own on these days. They
              will be <b>replaced</b> by week 1&rsquo;s, carrying the numbers above.
            </p>
          </Why>
        )}
      </DockPanel.Body>

      <DockPanel.Foot>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={inScope.length === 0 || rowsInScope === 0}
          onClick={() => onApply(plan, inScope)}
        >
          {rowsInScope === 0
            ? 'Week 1 is empty'
            : `Write ${rowsInScope * plan.length} rows`}
        </Button>
      </DockPanel.Foot>
    </DockPanel>
  );
}

/**
 * The prescription the ladder opens holding: the commonest one in week 1 across
 * the days in scope. A mode is the honest seed for a form that is about to
 * overwrite every row with one answer — the mean of 6 and 12 is a number nobody
 * wrote.
 */
function seedFrom(entries: Entry[], days: number[]) {
  const counts = new Map<string, { n: number; sets: number | null; reps: number | null; durationSeconds: number | null }>();
  for (const day of days) {
    for (const e of entriesFor(entries, 1, day)) {
      const key = `${e.sets}:${e.reps}:${e.durationSeconds}`;
      const found = counts.get(key);
      if (found) found.n += 1;
      else counts.set(key, { n: 1, sets: e.sets, reps: e.reps, durationSeconds: e.durationSeconds });
    }
  }
  let best: { n: number; sets: number | null; reps: number | null; durationSeconds: number | null } | null = null;
  for (const value of counts.values()) if (!best || value.n > best.n) best = value;
  return {
    sets: best?.sets ?? 3,
    reps: best?.durationSeconds != null ? null : (best?.reps ?? 10),
    durationSeconds: best?.durationSeconds ?? null,
  };
}
