'use client';

import { useMemo, useState } from 'react';

import {
  authoredWeeks,
  duplicateTargets,
  weekRanges,
  type DuplicateConflict,
  type DuplicateSpread,
  type DuplicateStep,
  type Entry,
} from '@/lib/programs/blueprint';
import { CloseIcon } from './Icons';
import { Button } from '@/web-components/ui/Button';
import { Chip } from '@/web-components/ui/Chip';
import { Why } from '@/web-components/ui/Why';
import { DockPanel } from '@/web-components/ui/DockPanel';

/**
 * DUPLICATE WEEK — the action that replaced *Set a rule* in the strip.
 *
 * ── WHY IT TOOK THE PROGRESSION CHIP'S SLOT ─────────────────────────────────
 *
 * *Set a rule* opened `ProgressionPanel`, which writes a ladder from week 1
 * across a span of weeks — the right tool for "3×8, 3×10, 3×12" and the wrong
 * one for the thing a trainer does far more often, which is *this week again,
 * for the rest of the block*. Copying was reachable only from a day menu, one
 * destination week at a time; laddering was a chip in the toolbar. The common
 * action was the buried one.
 *
 * So the strip now carries the copy, and the ladder rides along inside it: the
 * four seeds from `ProgressionPanel`'s own generator row — *+2 reps a week*,
 * *+1 a week*, *+1 set every 2 weeks*, *Same every week* — are a third question
 * on this form rather than a second panel. `ProgressionPanel` is untouched and
 * still reachable (the phone's week menu, `/clients/[id]/plan`) for the case it
 * is actually better at: editing week 6 of the ladder by hand.
 *
 * ── THE THREE QUESTIONS, IN THE ORDER THEY ARE ANSWERED ─────────────────────
 *
 * 1. **Which weeks** — the next one, every second one, all of them.
 * 2. **What about weeks that already have something** — replace, keep both, or
 *    leave them alone. The panel counts and NAMES those weeks before it runs,
 *    the same promise `ProgressionPanel`'s heads-up makes.
 * 3. **Whether the copies climb.** Default *Same every week*: a duplicate that
 *    silently added reps would be a rule nobody asked for.
 *
 * The model is `duplicateWeek`; every sentence on this panel is computed from
 * the same `duplicateTargets` it writes through, so the button cannot promise
 * weeks the write does not touch.
 */

const SPREADS: { key: DuplicateSpread; title: string; sub: (targets: number[]) => string }[] = [
  {
    key: 'next',
    title: 'The following week',
    sub: t => (t.length ? `Copy to week ${t[0]}` : 'No week after this one'),
  },
  {
    key: 'alternate',
    title: 'Every 2 weeks thereafter',
    sub: t => (t.length ? `Copy to weeks ${weekRanges(t)}` : 'No week after this one'),
  },
  {
    key: 'all',
    title: 'All coming weeks',
    sub: t => (t.length ? `Copy to weeks ${weekRanges(t)}` : 'No week after this one'),
  },
];

const CONFLICTS: { key: DuplicateConflict; title: string; sub: string }[] = [
  { key: 'replace', title: 'Replace', sub: 'Delete existing content and replace with copied content' },
  { key: 'keep', title: 'Keep both', sub: 'Keep existing workouts and add copied workouts' },
  { key: 'skip', title: 'Do not duplicate', sub: 'Skip weeks that already have workouts' },
];

/** The generator row, word for word from `ProgressionPanel` — two screens
 *  offering the same four ladders under two sets of words would be two
 *  features as far as a trainer is concerned. */
const STEPS: { key: DuplicateStep; label: (timed: boolean) => string }[] = [
  { key: 'reps2', label: timed => `+2 ${timed ? 'seconds' : 'reps'} a week` },
  { key: 'reps1', label: () => '+1 a week' },
  { key: 'sets2', label: () => '+1 set every 2 weeks' },
  { key: 'same', label: () => 'Same every week' },
];

export function DuplicateWeekPanel({
  entries,
  week,
  sourceWeek,
  weeks,
  onClose,
  onApply,
}: {
  entries: Entry[];
  /** The week the strip is on — the number in the title. */
  week: number;
  /** Where the rows actually live. On a repeating week that is week 1, and the
   *  sentence is still true: a repeat and its source hold the same program. */
  sourceWeek: number;
  weeks: number;
  onClose: () => void;
  onApply: (opts: { spread: DuplicateSpread; conflict: DuplicateConflict; step: DuplicateStep }) => void;
}) {
  const [spread, setSpread] = useState<DuplicateSpread>('next');
  const [conflict, setConflict] = useState<DuplicateConflict>('replace');
  const [step, setStep] = useState<DuplicateStep>('same');

  const source = useMemo(() => entries.filter(e => e.week === sourceWeek), [entries, sourceWeek]);
  /* Reps or seconds, read off the week being copied. A conditioning block's
     ladder is +2 SECONDS, and offering it +2 reps names a field its rows do
     not have. */
  const timed = source.length > 0 && source.every(e => e.durationSeconds != null);

  const targetsFor = (s: DuplicateSpread) => duplicateTargets(sourceWeek, weeks, s);
  const targets = targetsFor(spread);

  const authored = useMemo(() => authoredWeeks(entries), [entries]);
  /** The weeks the second question is actually about. */
  const clashes = targets.filter(w => authored.has(w));
  const written = conflict === 'skip' ? targets.filter(w => !authored.has(w)) : targets;

  return (
    <DockPanel label={`Duplicate week ${week}`}>
      <DockPanel.Head
        title={`Duplicate week ${week}`}
        sub={
          source.length === 0
            ? 'This week is empty'
            : `${source.length} exercise${source.length === 1 ? '' : 's'}${
                sourceWeek !== week ? ` · from week ${sourceWeek}, which this week repeats` : ''
              }`
        }
        actions={
          <Button variant="ghost" iconOnly label="Close" onClick={onClose} title={undefined} icon={<CloseIcon />} />
        }
      />

      <DockPanel.Body>
        <section className="card">
          <div className="card__hd">
            <span className="card__t">Which week(s) to duplicate?</span>
          </div>
          <div className="card__b">
            <div className="lgl pg__opts" role="group" aria-label="Which weeks to duplicate">
              {SPREADS.map(option => {
                const active = spread === option.key;
                const none = targetsFor(option.key).length === 0;
                return (
                  <button
                    key={option.key}
                    className="lrow"
                    type="button"
                    /* `aria-pressed` and not `role="radio"` — §04 paints
                       `.lgl .lrow[aria-pressed]` and has no rule for
                       `aria-checked`, the same call `AddClientFlow` made for
                       this exact list shape. */
                    aria-pressed={active}
                    disabled={none}
                    onClick={() => setSpread(option.key)}
                  >
                    <span className={`rad${active ? ' rad--on' : ''}`} />
                    <span className="lrow__m">
                      <span className="lrow__t">{option.title}</span>
                      <span className="lrow__s">{option.sub(targetsFor(option.key))}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card__hd">
            <span className="card__t">
              What if one or more workout are already included in the destination week?
            </span>
          </div>
          <div className="card__b">
            <div className="lgl pg__opts" role="group" aria-label="What happens to weeks that already have workouts">
              {CONFLICTS.map(option => {
                const active = conflict === option.key;
                return (
                  <button
                    key={option.key}
                    className="lrow"
                    type="button"
                    aria-pressed={active}
                    onClick={() => setConflict(option.key)}
                  >
                    <span className={`rad${active ? ' rad--on' : ''}`} />
                    <span className="lrow__m">
                      <span className="lrow__t">{option.title}</span>
                      <span className="lrow__s">{option.sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card__hd">
            <span className="card__t">Do the copies climb?</span>
          </div>
          <div className="card__b">
            <div className="tools" role="group" aria-label="Progression across the copied weeks">
              {STEPS.map(option => (
                <Chip
                  key={option.key}
                  pressed={step === option.key}
                  onClick={() => setStep(option.key)}
                >
                  {option.label(timed)}
                </Chip>
              ))}
            </div>
            <p className="small pg__gap">
              {/* The ladder is by DISTANCE from this week, not by copy number —
                  so week 5 reads the same whether or not week 3 was written. */}
              {step === 'same'
                ? 'Every copy carries exactly what this week says.'
                : step === 'sets2'
                  ? 'Each copy adds a set for every two weeks it sits after this one.'
                  : `Each copy adds ${step === 'reps2' ? 2 : 1} ${
                      timed ? 'second' : 'rep'
                    }${step === 'reps2' ? 's' : ''} for every week it sits after this one.`}
              {step !== 'same' && <> Per-set lists are replaced by the week&rsquo;s own numbers.</>}
            </p>
          </div>
        </section>

        {clashes.length > 0 && (
          <Why heading="Heads up" tone="warn">
            <p>
              Week{clashes.length === 1 ? '' : 's'} {weekRanges(clashes)} already{' '}
              {clashes.length === 1 ? 'has' : 'have'} exercises of{' '}
              {clashes.length === 1 ? 'its' : 'their'} own.{' '}
              {conflict === 'replace' && <>They will be <b>replaced</b> by this week&rsquo;s.</>}
              {conflict === 'keep' && <>This week&rsquo;s exercises are <b>added underneath</b> what is already there.</>}
              {conflict === 'skip' && <>They are <b>left alone</b>.</>}
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
          disabled={source.length === 0 || written.length === 0}
          onClick={() => onApply({ spread, conflict, step })}
        >
          {source.length === 0
            ? 'Nothing to copy'
            : written.length === 0
              ? 'No week to write'
              : `Duplicate into ${written.length} week${written.length === 1 ? '' : 's'}`}
        </Button>
      </DockPanel.Foot>
    </DockPanel>
  );
}
