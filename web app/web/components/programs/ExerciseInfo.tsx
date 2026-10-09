'use client';

import { useEffect, useState, useTransition } from 'react';

import { searchExercises } from '@/lib/exercises/actions';
import { readExercise } from '@/lib/exercises/read';
import type { ExerciseWire } from '@/lib/exercises/api';
import { MEV, MAV } from '@/lib/programs/balance';
import { ChevronLeft, ChevronRight, CloseIcon } from './Icons';
import { Button } from '@/web-components/ui/Button';
import { Tag } from '@/web-components/ui/Tag';
import { DockPanel } from '@/web-components/ui/DockPanel';

/**
 * WHAT AN EXERCISE IS — one body, reached from more than one place.
 *
 * Opened from a library row's ⓘ and from the row menu's *What this exercise is*,
 * so the panel a trainer reads while BROWSING and the one they read about a row
 * already in the program are the same component. That is the discipline
 * `prescribe` and `blocksOf` already enforce one level down, and the reason a
 * second detail view cannot quietly disagree with the first.
 *
 * ── ORDERED FOR CHOOSING, NOT FOR TEACHING ──────────────────────────────────
 *
 * The reader is a qualified trainer deciding whether this movement belongs in
 * this slot, not somebody learning to bench. So the sections run: what it
 * targets (the thing that separates *Incline Barbell Press* from *Barbell Bench
 * Press*), what it would do to THIS program, what else could go here instead —
 * and only then the cues and the how-to.
 *
 * **The third section is the one worth arguing for.** Any exercise database can
 * give you cues and a how-to; only the builder can say *"On Day 1 — 4 sets.
 * Chest is 7 sets this week, under the 10-set floor."* It is fed from the same
 * `balance()` the panel beside it reads, so the two cannot disagree.
 *
 * ── AN EMPTY SECTION DRAWS NOTHING ──────────────────────────────────────────
 *
 * Never an empty heading. An isolation movement has no secondary target and
 * simply has no *also* line; a custom exercise a trainer typed has no cues and
 * no steps and gets neither heading. The existing panel's copy is the precedent.
 */

/** What this exercise is doing to the program in front of the trainer. */
export interface ProgramContext {
  week: number;
  /** "Day 1 · Push", from the builder's own labels. */
  dayName: (day: number) => string;
  /** Which days this week carry it, and for how many sets. */
  onDays: number[];
  ownSets: number;
  /** The whole muscle group's sets this week, and this pattern's. */
  muscleSets: number;
  patternSets: number;
  /** Sets the library's search to the pattern. Absent where there is no search
   *  to set — the panel then states the count and offers no button. */
  onFindPattern?: (pattern: string) => void;
  /** The trainer's own note on THIS row. Only ever passed from a program row. */
  note?: string | null;
  noteDay?: number;
}

export function ExerciseInfo({
  exercise,
  context,
  alternatives,
}: {
  exercise: ExerciseWire;
  context?: ProgramContext;
  /** How many others share the movement pattern. `null` while it is still being
   *  counted, or where nothing counted it — the section then draws nothing
   *  rather than claiming zero, which would be a different and wrong statement. */
  alternatives?: number | null;
}) {
  const secondary = exercise.secondaryTargets ?? [];
  const cues = exercise.formCues ?? [];
  const steps = exercise.description
    ? exercise.description.split('\n\n').map(s => s.trim()).filter(Boolean)
    : [];

  const tags = [
    exercise.muscleGroup,
    exercise.bodyPart !== exercise.muscleGroup ? exercise.bodyPart : null,
    exercise.equipment,
    exercise.level,
  ].filter(Boolean) as string[];

  return (
    <div className="xi">
      {tags.length > 0 && (
        <div className="xi__tags">
          {tags.map(t => (
            <Tag key={t}>
              {t}
            </Tag>
          ))}
        </div>
      )}

      {exercise.target && (
        <Section label="Targets">
          <p className="xi__p">
            <b>{exercise.target}</b>
          </p>
          {secondary.length > 0 && <p className="xi__sub">also {secondary.join(', ')}</p>}
        </Section>
      )}

      {exercise.movementPattern && (
        <Section label="Movement">
          <p className="xi__p">{exercise.movementPattern}</p>
        </Section>
      )}

      {context && (
        <InProgram exercise={exercise} context={context} alternatives={alternatives ?? null} />
      )}

      {cues.length > 0 && (
        <Section label="Form cues">
          <ul className="xi__ul">
            {cues.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </Section>
      )}

      {steps.length > 0 && (
        <Section label="How to do it">
          <ol className="xi__ol">
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </Section>
      )}

      {cues.length === 0 && steps.length === 0 && (
        <p className="xi__none">
          No cues or instructions for this one yet. {exercise.isCustom
            ? 'It is a movement you added, so nothing was written for it.'
            : 'Everything else on this panel is still true.'}
        </p>
      )}

      {/* TWO OWNERS FOR ONE WORD, kept apart.
          `notes` is on the blueprint wire, belongs to THIS program, and the
          trainer wrote it — "two-second pause on the chest, they rush the
          bottom when it gets heavy". A form cue belongs to the movement and is
          identical in every program there is. Same word, two owners, so they are
          labelled apart and the second one says whose it is. */}
      {context?.note && (
        <Section label="Your note on this row">
          <p className="xi__note">{context.note}</p>
          <p className="xi__sub">
            Yours, on {context.noteDay != null ? context.dayName(context.noteDay) : 'this row'} of
            this program — not part of the library entry.
          </p>
        </Section>
      )}
    </div>
  );
}

/**
 * THE SECTION NO EXERCISE DATABASE CAN GIVE YOU.
 *
 * A band figure is only actionable while you are choosing; read after the fact
 * it is a report.
 */
function InProgram({
  exercise,
  context,
  alternatives,
}: {
  exercise: ExerciseWire;
  context: ProgramContext;
  alternatives: number | null;
}) {
  const { week, onDays, ownSets, muscleSets, patternSets, onFindPattern } = context;
  const band =
    muscleSets <= 0 ? null : muscleSets < MEV ? 'under' : muscleSets > MAV ? 'over' : 'in';

  return (
    <>
      <Section label={`In this program · week ${week}`}>
        <p className="xi__p">
          {onDays.length === 0 ? (
            'Not on any day this week.'
          ) : (
            <>
              On{' '}
              {onDays.map((d, i) => (
                <span key={d}>
                  {i > 0 && (i === onDays.length - 1 ? ' and ' : ', ')}
                  <b>{context.dayName(d)}</b>
                </span>
              ))}
              {' — '}
              {ownSets} set{ownSets === 1 ? '' : 's'}.
            </>
          )}
        </p>
        {exercise.muscleGroup && (
          <p className="xi__sub">
            {exercise.muscleGroup} is <b>{muscleSets}</b> set{muscleSets === 1 ? '' : 's'} this week
            {band === 'under'
              ? ` — under the ${MEV}-set floor`
              : band === 'over'
                ? ` — above the ${MAV}-set ceiling`
                : band === 'in'
                  ? ` — inside the ${MEV}–${MAV} band`
                  : ''}
            .{exercise.movementPattern ? ` ${exercise.movementPattern} is ${patternSets}.` : ''}
          </p>
        )}
      </Section>

      {/* INFO THAT LEADS TO AN ACTION rather than a dead-end read. The library's
          search already matches on the pattern, so "show the other 41" is the
          search box doing what it can already do. */}
      {exercise.movementPattern && alternatives != null && alternatives > 0 && (
        <Section label="Instead of this">
          <p className="xi__p">
            {alternatives} other{alternatives === 1 ? '' : 's'} in the library share the{' '}
            {exercise.movementPattern.toLowerCase()} pattern.
          </p>
          {onFindPattern && (
            <button
              className="xi__act"
              type="button"
              onClick={() => onFindPattern(exercise.movementPattern!)}
            >
              Show them
              <ChevronRight />
            </button>
          )}
        </Section>
      )}
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="xi__s">
      <p className="xi__k">{label}</p>
      {children}
    </div>
  );
}

/* ──────────────────────────────────────────── the panel around the body ── */

/**
 * The detail VIEW of the library panel — it replaces the list in place rather
 * than opening a second surface over it.
 *
 * **Not the design system's `.panel`**: that is 420px, `aria-modal`, and carries
 * a scrim, so it would cover the column the trainer is filling AND be a second
 * library surface beside the docked one. What a trainer needs while choosing is
 * the day still visible.
 *
 * `exercise` is passed when the caller has a library row (the panel's own search
 * results); `exerciseId` when it has only an id (a row in a column, which carries
 * `ExerciseNameWire` and no prose at all). A search result is NOT the whole row
 * either: the server drops the steps and cues from every list, so a row without
 * `description` is completed from the single-exercise read.
 */
export function ExerciseInfoView({
  exercise,
  exerciseId,
  fallbackName,
  context,
  onBack,
  backLabel = 'Library',
}: {
  exercise?: ExerciseWire | null;
  exerciseId?: string;
  fallbackName?: string;
  context?: ProgramContext;
  onBack: () => void;
  backLabel?: string;
}) {
  const [fetched, setFetched] = useState<ExerciseWire | null>(exercise ?? null);
  const wantedId = exercise?.id ?? exerciseId;
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const [counted, setCounted] = useState<{ pattern: string; others: number } | null>(null);

  useEffect(() => {
    if (!wantedId) return;
    if (exercise && exercise.description != null) return;   // already whole
    start(async () => {
      const row = await readExercise(wantedId);
      if (row) setFetched(row);
      else if (!exercise) setFailed(true);                  // a row we already have stays on screen
    });
  }, [exercise, wantedId]);

  const row = fetched && fetched.id === wantedId ? fetched : (exercise ?? null);
  const pattern = row?.movementPattern ?? null;

  /* THE PANEL COUNTS ITS OWN ALTERNATIVES, so no caller has to know that the
     library's search matches on the pattern. One request, only once the panel is
     open, asking for a single row and reading `total` off the envelope — the
     count is the answer, and the rows are the button's job afterwards.

     Counted, never assumed: `total` includes this exercise, so the figure the
     trainer reads is one less than the search will show them. */
  useEffect(() => {
    if (!pattern) return;
    let live = true;
    void searchExercises({ q: pattern, size: 1 }).then(page => {
      if (live && page) setCounted({ pattern, others: Math.max(0, page.total - 1) });
    });
    return () => {
      live = false;
    };
  }, [pattern]);

  /* THE COUNT IS KEYED TO ITS PATTERN and read during render, rather than being
     cleared by a second effect when the pattern changes. Clearing it in the
     effect body is a cascading render the linter refuses, and it is the weaker
     version anyway: between the clear and the answer there is a frame where a
     hinge count could sit under a horizontal push. Keyed, that frame cannot
     exist — a count for another pattern simply is not this pattern's. */
  const alternatives = counted && counted.pattern === pattern ? counted.others : null;

  return (
    <div className="xiview">
      <button className="xiview__back" type="button" onClick={onBack}>
        <ChevronLeft />
        {backLabel}
      </button>
      <p className="xiview__nm">{row?.name ?? fallbackName ?? 'This exercise'}</p>
      {row ? (
        <ExerciseInfo exercise={row} context={context} alternatives={alternatives} />
      ) : failed ? (
        <p className="xi__none">
          Could not load this one. It is still in the program — a row whose exercise the library
          cannot answer for keeps its prescription.
        </p>
      ) : pending ? (
        <p className="xi__none">Loading…</p>
      ) : null}
    </div>
  );
}

/**
 * The panel a ROW opens, as opposed to the view a library row flips to.
 *
 * Same body, same sections, and the only differences are the chrome and where
 * the third section's figures come from — which is the point of there being one
 * body. A row already in the program knows its day and its note; a library row
 * knows neither and passes neither.
 *
 * It is a `DockPanel` rather than a `Panel` for the reason `ExerciseInfoView`
 * gives: the builder's whole argument is that the column stays visible while you
 * decide, and a 420px modal with a scrim is exactly the thing that takes it away.
 * That distinction used to live only in this comment; it is now the difference
 * between two components in the catalogue.
 */
export function ExerciseInfoPanel({
  exerciseId,
  fallbackName,
  context,
  onClose,
}: {
  exerciseId: string;
  fallbackName?: string;
  context?: ProgramContext;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <DockPanel label={`About ${fallbackName ?? 'this exercise'}`}>
      <DockPanel.Head
        title={"What this exercise is"}
        sub={"from your library"}
        actions={
          <Button variant="ghost" iconOnly label="Close" onClick={onClose} title={undefined} icon={<CloseIcon />} />
        }
      />
      <DockPanel.Body>
        <ExerciseInfoView
          exerciseId={exerciseId}
          fallbackName={fallbackName}
          context={context}
          onBack={onClose}
          backLabel="Close"
        />
      </DockPanel.Body>
    </DockPanel>
  );
}
