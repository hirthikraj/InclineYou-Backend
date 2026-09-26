'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import type { ExercisesData } from '@/lib/exercises/guard';
import type { ExerciseCategories, ExerciseSource, ExerciseWire } from '@/lib/exercises/api';
import { createCustomExercise } from '@/lib/exercises/actions';
import {
  EXERCISE_SOURCES,
  exercisesHref,
  exercisesTabs,
  type ExercisesQuery,
  type ExercisesView,
} from '@/lib/exercises/tabs';
import { TopBar } from '@/components/shell/TopBar';
import { PageTabs } from '@/components/shell/PageTabs';
import { Glyph } from '@/components/shell/Icons';
import { useDismiss } from '@/lib/ui/dismiss';
import { Button } from '@/web-components/ui/Button';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { InlineLink } from '@/web-components/ui/InlineLink';
import { Pager } from '@/web-components/ui/Pager';
import { SearchField } from '@/web-components/ui/SearchField';
import { Select } from '@/web-components/ui/Select';
import { Stat, Stats } from '@/web-components/ui/Stat';
import { Row as TableRow, Table } from '@/web-components/ui/Table';
import { Tag } from '@/web-components/ui/Tag';
import { TextField } from '@/web-components/ui/Field';

/* ─────────────────────────────────────────────────── inline icons ── */

function PlusIcon({ size = 14 }: { size?: number }) {
  return <Glyph size={size} d="M12 5v14M5 12h14" />;
}
function XIcon({ size = 14 }: { size?: number }) {
  return <Glyph size={size} d="M18 6 6 18M6 6l12 12" />;
}
function ChevronRightIcon({ size = 12 }: { size?: number }) {
  return <Glyph size={size} d="M9 6l6 6-6 6" />;
}
function ChevronLeftIcon({ size = 13 }: { size?: number }) {
  return <Glyph size={size} d="M15 6l-6 6 6 6" />;
}
function ChevronDownIcon() {
  return <Glyph size={12} d="M6 9l6 6 6-6" />;
}
function CheckIcon() {
  return <Glyph size={13} d="M5 13l4 4L19 7" />;
}

/* ───────────────────────────────────────── custom dropdown ── */

function Dropdown({
  id,
  label,
  value,
  onChange,
  options,
  placeholder = '— optional —',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState(-1);

  const filtered = filter
    ? options.filter(o => o.toLowerCase().includes(filter.toLowerCase()))
    : options;

  /* OPENING resets the field and focuses it, and it is done in the handler
     rather than in an effect keyed on `open`. An effect that calls setState
     synchronously on a state change is a second render pass for something the
     event already knew — React's own lint rule rejects it, and `Today.tsx`
     makes the same argument about the filter chips. The focus stays in a
     `setTimeout` because the input does not exist until this render commits. */
  function openList() {
    setFilter('');
    setCursor(-1);
    setOpen(true);
    setTimeout(() => filterRef.current?.focus(), 0);
  }

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function pick(v: string) {
    onChange(v === value ? '' : v);
    setOpen(false);
  }

  function onFilterKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor(c => Math.min(c + 1, filtered.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor(c => Math.max(c - 1, 0));
    }
    if (e.key === 'Enter' && cursor >= 0 && filtered[cursor]) {
      e.preventDefault();
      pick(filtered[cursor]);
    }
  }

  /* scroll focused item into view */
  useEffect(() => {
    if (cursor < 0 || !listRef.current) return;
    const item = listRef.current.querySelectorAll<HTMLElement>('[data-item]')[cursor];
    item?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <label className="fld__l" htmlFor={id}>{label}</label>
      <button
        id={id}
        type="button"
        onClick={() => (open ? setOpen(false) : openList())}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          width: '100%',
          height: 34,
          padding: '0 10px 0 11px',
          borderRadius: 'var(--tx-r2)',
          background: 'var(--tx-field)',
          border: `1px solid ${open ? 'var(--tx-focus)' : 'var(--tx-field-line)'}`,
          boxShadow: open ? '0 0 0 3px var(--tx-focus-halo)' : 'var(--tx-field-inset)',
          color: value ? 'var(--tx-ink)' : 'var(--tx-ink-3)',
          fontSize: 13.5,
          fontFamily: 'var(--tx-font)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          transition: 'border-color var(--tx-t-fast) var(--tx-ease)',
        } as React.CSSProperties}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value || placeholder}
        </span>
        <span style={{ flexShrink: 0, marginLeft: 6, color: 'var(--tx-ink-3)', rotate: open ? '180deg' : '0deg', transition: 'rotate 120ms' }}>
          <ChevronDownIcon />
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'var(--tx-surface)',
            border: '1px solid var(--tx-line-strong)',
            borderRadius: 'var(--tx-r2)',
            boxShadow: 'var(--tx-e3)',
            zIndex: 60,
            overflow: 'hidden',
          }}
        >
          {/* search filter */}
          <div style={{ padding: '8px 8px 6px', borderBottom: '1px solid var(--tx-line)' }}>
            <input
              ref={filterRef}
              className="ctl"
              type="text"
              placeholder="Filter…"
              value={filter}
              onChange={e => { setFilter(e.target.value); setCursor(-1); }}
              onKeyDown={onFilterKey}
              style={{ height: 28, fontSize: 12.5 }}
            />
          </div>

          {/* option list */}
          <div ref={listRef} style={{ maxHeight: 200, overflowY: 'auto' }}>
            {value && (
              <button
                type="button"
                onClick={() => pick('')}
                style={{
                  width: '100%',
                  padding: '7px 12px',
                  textAlign: 'left',
                  fontSize: 12.5,
                  color: 'var(--tx-ink-3)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--tx-line)',
                }}
              >
                Clear selection
              </button>
            )}
            {filtered.length === 0 ? (
              <p style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--tx-ink-3)', margin: 0 }}>
                No results
              </p>
            ) : (
              filtered.map((opt, i) => {
                const isSelected = opt === value;
                const isCursor = i === cursor;
                return (
                  <button
                    key={opt}
                    data-item
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => pick(opt)}
                    style={{
                      width: '100%',
                      padding: '7px 12px',
                      textAlign: 'left',
                      fontSize: 13,
                      background: isCursor
                        ? 'var(--tx-surface-2)'
                        : isSelected
                          ? 'var(--tx-accent-soft)'
                          : 'none',
                      color: isSelected ? 'var(--tx-accent-text)' : 'var(--tx-ink)',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>{opt}</span>
                    {isSelected && <CheckIcon />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── create exercise form ── */

function CreateForm({
  meta,
  onCreated,
  onClose,
}: {
  meta: { muscleGroups: string[]; targets: string[]; equipment: string[] };
  onCreated: (ex: ExerciseWire) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [muscleGroup, setMuscleGroup] = useState('');
  const [target, setTarget] = useState('');
  const [equipment, setEquipment] = useState('');
  const [steps, setSteps] = useState<string[]>(['']);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);
  const stepRefs = useRef<(HTMLInputElement | null)[]>([]);

  /* The form leaves rather than vanishing — `lib/ui/dismiss.ts`. All three ways
     out (Escape, the header cross, Cancel) go through `dismiss`; `onCreated` is
     the parent's own close and is left alone, because a create that fails has to
     stay open with its error. */
  const { closing, dismiss, ref: panelRef } = useDismiss<HTMLDivElement>(onClose);

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); dismiss(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dismiss]);

  function addStep() {
    setSteps(prev => [...prev, '']);
    /* focus the new input on next render */
    setTimeout(() => {
      stepRefs.current[steps.length]?.focus();
    }, 0);
  }

  function updateStep(i: number, value: string) {
    setSteps(prev => prev.map((s, idx) => (idx === i ? value : s)));
  }

  function removeStep(i: number) {
    setSteps(prev => prev.filter((_, idx) => idx !== i));
  }

  function handleStepKeyDown(e: React.KeyboardEvent, i: number) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addStep();
    }
    if (e.key === 'Backspace' && steps[i] === '' && steps.length > 1) {
      e.preventDefault();
      removeStep(i);
      setTimeout(() => stepRefs.current[i - 1]?.focus(), 0);
    }
  }

  function save(asDraft: boolean) {
    if (!name.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await createCustomExercise(name, muscleGroup, target, equipment, steps, asDraft);
      if (result.ok) {
        onCreated(result.exercise);
      } else {
        setError(result.error);
      }
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    save(false);
  }

  return (
    <>
      <button
        className={`scrim scrim--soft${closing ? ' scrim--out' : ''}`}
        type="button"
        aria-label="Close create exercise"
        onClick={dismiss}
      />
      <div
        ref={panelRef}
        className={`panel${closing ? ' panel--out' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Create a custom exercise"
      >
        <div className="panel__hd">
          <span className="panel__t">Create exercise</span>
          <Button
            variant="ghost"
            iconOnly
            label="Close"
            onClick={dismiss}
            style={{ marginLeft: 'auto' }}
            title={undefined}
            icon={<XIcon />}
          />
        </div>

        <div className="panel__body">
          <form id="create-exercise-form" onSubmit={submit}>

            {/* Name */}
            <TextField
              label="Exercise name"
              id="ex-name"
              style={{ marginBottom: 20 }}
              ref={nameRef}
              type="text"
              placeholder="e.g. Landmine press"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />

            {/* Muscle targets */}
            <p className="micro" style={{ marginBottom: 10 }}>Muscle targets</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              <Dropdown
                id="ex-primary"
                label="Primary"
                value={muscleGroup}
                onChange={setMuscleGroup}
                options={meta.muscleGroups}
              />
              <Dropdown
                id="ex-secondary"
                label="Secondary"
                value={target}
                onChange={setTarget}
                options={meta.targets}
              />
            </div>

            {/* Equipment */}
            <div style={{ marginBottom: 24 }}>
              <Dropdown
                id="ex-equipment"
                label="Equipment"
                value={equipment}
                onChange={setEquipment}
                options={meta.equipment}
              />
            </div>

            {/* How to do it — numbered step list */}
            <div>
              <p className="micro" style={{ marginBottom: 10 }}>How to do it</p>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {steps.map((step, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        flexShrink: 0,
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: 'var(--tx-surface-2)',
                        border: '1px solid var(--tx-line)',
                        fontSize: 11,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--tx-ink-2)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {i + 1}
                    </span>
                    <input
                      ref={el => { stepRefs.current[i] = el; }}
                      className="ctl"
                      type="text"
                      aria-label={`Step ${i + 1}`}
                      placeholder={i === 0 ? 'e.g. Stand with feet shoulder-width apart' : 'Next step…'}
                      value={step}
                      onChange={e => updateStep(i, e.target.value)}
                      onKeyDown={e => handleStepKeyDown(e, i)}
                      style={{ flex: 1 }}
                    />
                    {steps.length > 1 && (
                      <button
                        className="btn btn--icon btn--ghost"
                        type="button"
                        aria-label={`Remove step ${i + 1}`}
                        onClick={() => removeStep(i)}
                        style={{ flexShrink: 0 }}
                      >
                        <XIcon size={12} />
                      </button>
                    )}
                  </li>
                ))}
              </ol>
              <Button
                variant="ghost"
                onClick={addStep}
                style={{ marginTop: 8, fontSize: 12, padding: '4px 8px' }}
              >
                <PlusIcon size={12} />
                Add step
              </Button>
            </div>

            {error && (
              <p style={{ fontSize: 12, color: 'var(--tx-danger)', marginTop: 14, marginBottom: 0 }}>
                {error}
              </p>
            )}
          </form>
        </div>

        <div className="panel__foot">
          <Button
            variant="secondary"
            onClick={dismiss}
            disabled={pending}
          >
            Cancel
          </Button>
          {/*
            SAVE AS DRAFT — the only thing that can make one, and the reason the
            library's *Draft* filter is not dead chrome.

            It needs the NAME and nothing else, which is the whole point: a
            trainer three steps into writing a movement and called away either
            loses the lot or invents something to get past the form. The library
            keeps drafts out of *All exercises*, so saving one cannot put a
            half-written movement in front of a client.

            `type="button"`, deliberately — Enter in the name field submits the
            form, and that has to stay *Create exercise*. A draft is the
            deliberate choice, never the one a keystroke makes for you.
          */}
          <Button
            variant="secondary"
            onClick={() => save(true)}
            disabled={pending || !name.trim()}
            style={{ marginLeft: 'auto' }}
          >
            Save as draft
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="create-exercise-form"
            disabled={pending || !name.trim()}
          >
            {pending ? 'Saving…' : 'Create exercise'}
          </Button>
        </div>
      </div>
    </>
  );
}

/* ──────────────────────────────────────────── exercise detail panel ── */

function ExercisePanel({
  exercise,
  onClose,
}: {
  exercise: ExerciseWire;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const { closing, dismiss, ref: panelRef } = useDismiss<HTMLDivElement>(onClose);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); dismiss(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dismiss]);

  const steps = exercise.description
    ? exercise.description.split('\n\n').filter(Boolean)
    : [];

  /* bodyPart and target are often the same as muscleGroup in this dataset.
     Show bodyPart when it adds something the muscle group tag doesn't already say. */
  const showBodyPart =
    exercise.bodyPart && exercise.bodyPart !== exercise.muscleGroup;

  return (
    <>
      <button
        className={`scrim scrim--soft${closing ? ' scrim--out' : ''}`}
        type="button"
        aria-label="Close exercise detail"
        onClick={dismiss}
      />
      <div
        ref={panelRef}
        className={`panel${closing ? ' panel--out' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={exercise.name}
      >
        <div className="panel__hd">
          <span className="panel__t">{exercise.name}</span>
          <Button
            variant="ghost"
            iconOnly
            label="Close"
            ref={closeRef}
            onClick={dismiss}
            title={undefined}
            icon={<XIcon />}
          />
        </div>

        <div className="panel__body">
          {/* Tags */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
            {exercise.muscleGroup && (
              <Tag>{exercise.muscleGroup}</Tag>
            )}
            {showBodyPart && (
              <Tag>{exercise.bodyPart}</Tag>
            )}
            {exercise.equipment && (
              <Tag>{exercise.equipment}</Tag>
            )}
            {exercise.level && (
              <Tag>{exercise.level}</Tag>
            )}
            {exercise.isCustom && (
              <Tag tone="acc">Yours</Tag>
            )}
          </div>

          {/* TARGETS, and this panel went without them for its whole life.
              `target` was on `ExerciseWire` all along and the panel drew the
              muscle group tag instead — so *Barbell Bench Press* and
              *Close-Grip Bench Press* opened to the same four tags and the same
              word, *Chest*, on the one surface whose entire job is telling one
              exercise from another. */}
          {exercise.target && (
            <div style={{ marginBottom: 18 }}>
              <p className="micro" style={{ marginBottom: 4, marginTop: 0 }}>Targets</p>
              <p style={{ fontSize: 13, margin: 0, fontWeight: 600 }}>{exercise.target}</p>
              {exercise.secondaryTargets?.length > 0 && (
                <p style={{ fontSize: 12, margin: '3px 0 0', color: 'var(--tx-ink-3)' }}>
                  also {exercise.secondaryTargets.join(', ')}
                </p>
              )}
            </div>
          )}

          {/* Movement pattern */}
          {exercise.movementPattern && (
            <div style={{ marginBottom: 18 }}>
              <p className="micro" style={{ marginBottom: 4, marginTop: 0 }}>Movement</p>
              <p style={{ fontSize: 13, margin: 0 }}>{exercise.movementPattern}</p>
            </div>
          )}

          {/* Form cues before the steps, for the reason the builder's panel puts
              them there: a qualified reader wants the four things that go wrong,
              not the five things to do in order. */}
          {exercise.formCues?.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <p className="micro" style={{ marginBottom: 10, marginTop: 0 }}>Form cues</p>
              <ul style={{ paddingLeft: 20, margin: 0, listStyleType: 'disc' }}>
                {exercise.formCues.map((cue, i) => (
                  <li
                    key={i}
                    style={{
                      fontSize: 13,
                      lineHeight: 1.7,
                      marginBottom: 6,
                      color: 'var(--tx-ink)',
                    }}
                  >
                    {cue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Instructions */}
          {steps.length > 0 ? (
            <div>
              <p className="micro" style={{ marginBottom: 10, marginTop: 0 }}>How to do it</p>
              <ol style={{ paddingLeft: 20, margin: 0, listStyleType: 'decimal' }}>
                {steps.map((step, i) => (
                  <li
                    key={i}
                    style={{
                      fontSize: 13,
                      lineHeight: 1.7,
                      marginBottom: 10,
                      color: 'var(--tx-ink)',
                    }}
                  >
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--tx-ink-3)', margin: 0 }}>
              {exercise.isCustom
                ? 'No instructions added yet.'
                : 'No instructions available for this exercise.'}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/* ────────────────────────────────────────────────── main component ── */

/**
 * THE LIBRARY, IN TWO VIEWS.
 *
 * ── WHAT CHANGED AND WHY ─────────────────────────────────────────────────────
 *
 * This screen used to be one flat list that held every decision in React state:
 * the query, the filters and an appended page stack, all client-side, with a
 * *Load more* at the bottom. Three things were wrong with that and all three are
 * the same thing wrongly answered.
 *
 * 1. **A catalogue needs a position.** *Load more* suits a feed read forward
 *    once. A trainer in the library is LOOKING for something, and an appended
 *    list cannot say where they are, cannot be got back to and cannot be sent to
 *    anyone. Pages are links now — `c-pager`.
 * 2. **A filter the pagination does not know about is not a filter.** *Yours*
 *    was `list.filter(ex => ex.isCustom)` over the rows that happened to be
 *    loaded: it hid every custom movement past the first page and still reported
 *    the unfiltered total. It is `?mine=1` to the server now.
 * 3. **The chip row mixed two axes.** Muscle group and equipment are different
 *    questions, and fifteen chips across one line asked them as if they were
 *    one. They are two `Select`s, which is also what makes the second view
 *    possible: *By categories* is the muscle-group axis given a whole screen.
 *
 * ── AND THE STATE MOVED INTO THE URL ─────────────────────────────────────────
 *
 * Every filter is a search parameter, the server reads them, and the first paint
 * is already the right page. `lib/exercises/tabs.ts` owns the addresses and
 * carries the argument. What is left in React state here is exactly the things
 * that are NOT places: the text in the search box between keystrokes, and which
 * of the two overlays is open.
 */

/** The dataset spells "no kit at all" this way, verbatim, in the equipment
 *  column — so it needs no special case any more: it is one option of the
 *  equipment select like every other. */
const BODY_WEIGHT_EQUIPMENT = 'body weight';

export function ExerciseLibrary({
  data,
  view,
}: {
  data: ExercisesData;
  view: ExercisesView;
}) {
  const { initial, meta, categories, query, size } = data;
  const router = useRouter();

  /*
   * `pending` IS THE ONLY LOADING STATE LEFT, and it covers a navigation rather
   * than a fetch. Every filter change is `router.replace` into the same route,
   * so React holds the old rows on screen while the server assembles the new
   * ones; `aria-busy` says so and the table dims. The alternative — blanking the
   * list on every keystroke — is a screen that flashes empty while a trainer
   * types the third letter of "bench".
   */
  const [pending, startNav] = useTransition();

  /* The box's own text, which is not the same thing as the query the server
     ran. They differ for exactly as long as the debounce, and conflating them
     is what makes a debounced search box lose characters. */
  const [draft, setDraft] = useState(query.q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* A back press or a category click changes `query.q` under us. React's
     documented adjust-state-on-prop-change pattern, the same one `?new=1` uses
     below — an effect would paint the stale text for a frame first. */
  const [qSeen, setQSeen] = useState(query.q);
  if (query.q !== qSeen) {
    setQSeen(query.q);
    setDraft(query.q);
  }

  const [showCreate, setShowCreate] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<ExerciseWire | null>(null);

  /*
   * `?new=1` OPENS THE CREATE FORM, and it is the bar's + landing on a form
   * rather than on a list of 1,324 exercises the trainer did not come here to
   * read. `AddSheet`'s *Add an exercise* row is the only caller.
   *
   * Three pieces, and they are `Schedule.tsx`'s three — same parameter name,
   * same shape, and deliberately not a fourth way of doing this:
   *
   * · an INITIALISER, not an effect. An effect paints the un-opened library for
   *   one frame first, and the lint rule that refuses `setState` in an effect is
   *   right about why. It is pure — the parameter is the same on the server and
   *   on the hydrating client — so nothing flickers;
   * · a RENDER-TIME ADJUSTMENT for arriving here from here. The bar's + is on
   *   this screen too, so pressing it is a soft navigation inside the same
   *   segment and this component stays mounted: the initialiser cannot fire
   *   again. Comparing the parameter against the previous value held in state is
   *   React's documented pattern for adjusting state when an input changes;
   * · and then the parameter is STRIPPED. Keeping it would make the + a one-shot
   *   — press it twice and the second navigation is to an identical URL, which
   *   the router correctly treats as nothing at all. Opening a form is a
   *   transient action rather than a view, and this screen's views are its tab.
   */
  const params = useSearchParams();
  const asked = params.get('new') === '1';

  const [askedSeen, setAskedSeen] = useState(asked);
  if (asked !== askedSeen) {
    setAskedSeen(asked);
    if (asked) setShowCreate(true);
  }

  /* Stripped back to the CURRENT view and filters, not to the bare route — the
     old version replaced with `/programs/exercises`, which quietly threw away a
     trainer's filters the moment they pressed the bar's +. */
  useEffect(() => {
    if (asked) router.replace(exercisesHref(view, query), { scroll: false });
  }, [asked, router, view, query]);

  /* ── moving around ──────────────────────────────────────────────────────── */

  /** Every filter change goes through here, so *a filter changed* and *go back
   *  to page one* cannot come apart. `replace`, not `push`: a trainer narrowing
   *  a list is refining one thought, and a back button that walks them out one
   *  select at a time is a back button that never leaves the screen. */
  function go(next: Partial<ExercisesQuery>) {
    startNav(() => {
      router.replace(exercisesHref(view, { ...query, page: 0, ...next }), { scroll: false });
    });
  }

  function search(value: string) {
    setDraft(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => go({ q: value }), 300);
  }

  /** What a created exercise does to the screen: the row is not spliced into
   *  the list any more. `refresh` re-runs the server read, which puts the
   *  movement wherever the current filters and page actually place it and moves
   *  its category count at the same time — a splice did neither, and the count
   *  on the tab strip would have gone stale the moment a trainer added one. */
  function handleCreated(ex: ExerciseWire) {
    setShowCreate(false);
    setSelectedExercise(ex);
    router.refresh();
  }

  const exercises = initial.exercises;
  const total = initial.total;
  const hasFilters = Boolean(
    query.q || query.group || query.equipment || query.source !== 'all',
  );

  /* The library's own size, which is NOT `total` once a filter is on — that is
     the size of the answer. The header says both, and the categories read is
     where the unfiltered figure comes from. */
  const libraryTotal = categories.total;

  const tabs = exercisesTabs(view, query, { categories: categories.categories.length });

  return (
    <>
      <TopBar crumb="Fitness · Exercise library" />

      <main className="main body--flush" id="main-content">

        {/* Page header */}
        {/* No `paddingBottom` any more: the tab strip is the last thing in `.ph`
            now, and `.tab`'s `margin-bottom:-1px` is what lets the active
            underline sit ON the header's bottom border. Sixteen pixels of
            padding under it left that underline floating in mid-air. */}
        {/* `ph--pglist` — see `CertifiedShelf`. The count line stays and the
            headline goes; *Create exercise* stays, because unlike Programs'
            *New program* it is duplicated nowhere else on the screen. */}
        <div className="ph ph--pglist">
          <div className="ph__row" style={{ alignItems: 'center' }}>
            <div>
              <h1 className="ph__t">Exercise library</h1>
              <p className="ph__sub">
                {libraryTotal.toLocaleString()} exercise{libraryTotal !== 1 ? 's' : ''}
                {' · '}
                {categories.categories.length} categor
                {categories.categories.length === 1 ? 'y' : 'ies'}
              </p>
            </div>
            <div className="ph__acts">
              <Button variant="primary" onClick={() => setShowCreate(true)}>
                <PlusIcon />
                Create exercise
              </Button>
            </div>
          </div>

          {/*
            `.pgtabs` — TABS LEFT, SEARCH RIGHT, and this is the third caller of
            a row `/programs` and `/programs/workouts` already draw. Nothing new
            is written for it: the class was measured once, including the two
            alignments that keep the active tab's underline ON the header's rule
            while the 34px field still gets its air, and the 900px rung that
            stacks them rather than pushing the field off the edge.

            Beside the tabs rather than in the filter bar below, because those
            are two different jobs. The selects NARROW the library along an axis
            it already has — group, kit, whose — and they belong with the rows
            they act on. Search is how a trainer who knows the name of the
            movement skips the library entirely, which makes it a way INTO the
            screen, and the strip is where the ways into this screen live.

            Drawn on the exercises view only. On the categories grid it would be
            a box that either does nothing or silently throws the trainer onto
            the other tab, and a control that changes which view you are on is
            not a search box.
          */}
          <div className="pgtabs">
            <PageTabs tabs={tabs} current={view} label="Views of the exercise library" />
            {view === 'exercises' && (
              <SearchField
                className="pgtabs__q"
                label="Search exercises"
                value={draft}
                onChange={e => search(e.target.value)}
                count={{ shown: initial.exercises.length, total, noun: 'exercises' }}
              />
            )}
          </div>
        </div>

        {view === 'categories' ? (
          <CategoriesView
            categories={categories}
            group={query.group}
            exercises={exercises}
            total={total}
            query={query}
            size={size}
            pending={pending}
            onOpen={setSelectedExercise}
            selectedId={selectedExercise?.id ?? null}
          />
        ) : (
          <ExercisesView
            exercises={exercises}
            total={total}
            libraryTotal={libraryTotal}
            meta={meta}
            query={query}
            size={size}
            pending={pending}
            hasFilters={hasFilters}
            onFilter={go}
            onCreate={() => setShowCreate(true)}
            onOpen={setSelectedExercise}
            selectedId={selectedExercise?.id ?? null}
          />
        )}
      </main>

      {/* Create exercise drawer */}
      {showCreate && (
        <CreateForm
          meta={meta}
          onCreated={handleCreated}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Exercise detail panel */}
      {selectedExercise && (
        <ExercisePanel
          exercise={selectedExercise}
          onClose={() => setSelectedExercise(null)}
        />
      )}
    </>
  );
}

/* ──────────────────────────────────────────────── view · by categories ── */

/**
 * THE LIBRARY AS EIGHT DOORS — AND WHAT IS BEHIND ONE.
 *
 * ── WHY A COUNT IS THE WHOLE POINT ──────────────────────────────────────────
 *
 * A grid of eight muscle-group names with no figures is the equipment select
 * laid out flat, and it would deserve the criticism. The counts are what make it
 * a different instrument: *Legs 15 · Cardio 4* tells a trainer where the depth
 * is before they have opened anything, which is the question the flat list
 * cannot answer at all — you would have to filter eight times and read eight
 * subtitles.
 *
 * ── AND WHY THE DRILL-DOWN STAYS ON THIS TAB ────────────────────────────────
 *
 * Opening Chest, looking, going back and opening Back is the motion this view
 * exists for. Sending the trainer to the other tab — which this did at first —
 * made every one of those round trips leave the view, which is a browsing
 * surface you cannot browse from. So `group` is drawn here: the grid is replaced
 * by that category's exercises, with a control back up to the grid, and the tab
 * strip does not move.
 *
 * Deliberately NOT the exercises tab's chrome repeated inside this one. There is
 * no filter bar and no search box down here: the trainer has already said which
 * movements they want by pressing a card, and a muscle-group select underneath a
 * heading that says *Chest* is two controls for one fact. The pager stays,
 * because a category in the real 1,324-row catalogue is longer than a page.
 *
 * ── AND WHY THE TILES ARE `Stat` ────────────────────────────────────────────
 *
 * A figure, large, with a label and a door. That is `c-stat` exactly, including
 * the `href` it grew for the Today screen's three linked tiles, and inventing a
 * `.catcard` here is the defect `AGENTS.md` names in one line: a component
 * invented in a screen is invisible to review and drifts. `Stats up={4}` is the
 * pinned four-up grid, which wraps eight tiles into two clean rows rather than
 * leaving an orphan on its own line the way `auto-fit` did.
 */
function CategoriesView({
  categories,
  group,
  exercises,
  total,
  query,
  size,
  pending,
  onOpen,
  selectedId,
}: {
  categories: ExerciseCategories;
  /** Empty is the grid; a muscle group is the drill-down. */
  group: string;
  exercises: ExerciseWire[];
  total: number;
  query: ExercisesData['query'];
  size: number;
  pending: boolean;
  onOpen: (ex: ExerciseWire) => void;
  selectedId: string | null;
}) {
  const { categories: rows, uncategorised, total: libraryTotal } = categories;

  if (group) {
    return (
      <CategoryDrilldown
        group={group}
        exercises={exercises}
        total={total}
        query={query}
        size={size}
        pending={pending}
        onOpen={onOpen}
        selectedId={selectedId}
      />
    );
  }

  if (rows.length === 0) {
    return (
      <div style={{ flex: 1, overflow: 'auto', padding: '0 24px' }}>
        <EmptyState
          title="Nothing is grouped yet"
          body="Every exercise in this account is missing a muscle group, so there is nothing to sort them into. The By exercises tab lists them all."
        />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '18px 24px 24px' }}>
      <Stats up={4} className="exgrid">
        {rows.map(c => (
          <Stat
            key={c.muscleGroup}
            label={c.muscleGroup}
            value={c.count.toLocaleString()}
            detail={`exercise${c.count === 1 ? '' : 's'}`}
            href={exercisesHref('categories', { group: c.muscleGroup })}
          />
        ))}
      </Stats>

      {/* Uncategorised is a SENTENCE, not a ninth tile — a card called *Other*
          reads as a category a trainer could put something in, and it is not
          one. It is the gap, and the honest thing to do with a gap is name it
          and offer the list that contains it. */}
      {uncategorised > 0 && (
        <p className="micro" style={{ marginTop: 16, color: 'var(--tx-ink-3)' }}>
          {uncategorised.toLocaleString()} of the {libraryTotal.toLocaleString()} exercises here
          have no muscle group and are in none of these.{' '}
          <InlineLink href={exercisesHref('exercises')}>See every exercise</InlineLink>
        </p>
      )}
    </div>
  );
}

/**
 * One category, opened.
 *
 * ── THE BACK CONTROL IS A LINK, AND IT IS NOT THE BROWSER'S ─────────────────
 *
 * `router.back()` would be wrong here for the reason it usually is: it goes to
 * wherever the trainer came FROM, and they can arrive at this URL from the grid,
 * from a bookmark, or from a message someone sent them. A link to the grid
 * always means the grid. It is also then middle-clickable and has a real
 * destination in the status bar, which `back()` never does.
 *
 * ── AND THE HEADING IS AN `h2` UNDER THE PAGE'S `h1` ────────────────────────
 *
 * The screen's `h1` is *Exercise library* and this is a region inside it, so the
 * outline reads library → Chest → the rows. A `<p>` styled to look like a
 * heading, which is what the first draft of most of these is, gives a screen
 * reader nothing to jump to and leaves the table announced as belonging to the
 * page rather than to the category.
 */
function CategoryDrilldown({
  group,
  exercises,
  total,
  query,
  size,
  pending,
  onOpen,
  selectedId,
}: {
  group: string;
  exercises: ExerciseWire[];
  total: number;
  query: ExercisesData['query'];
  size: number;
  pending: boolean;
  onOpen: (ex: ExerciseWire) => void;
  selectedId: string | null;
}) {
  const pages = Math.ceil(total / size);

  return (
    <>
      <div
        className="split__hd"
        style={{
          padding: '12px 24px',
          borderBottom: '1px solid var(--tx-line)',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <Button variant="ghost" href={exercisesHref('categories')} icon={<ChevronLeftIcon />}>
          All categories
        </Button>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-ink)', margin: 0 }}>{group}</h2>
        <span style={{ fontSize: 12.5, color: 'var(--tx-ink-3)' }}>
          {total.toLocaleString()} exercise{total === 1 ? '' : 's'}
        </span>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }} aria-busy={pending || undefined}>
        {exercises.length === 0 ? (
          /* Reachable two ways: a hand-typed group that is not a muscle group,
             and a page number past the end of a real one. Both get the same way
             out, because there is only one place to go from here. */
          <EmptyState
            kind="filtered"
            title={total > 0 ? 'That page is past the end' : `Nothing in ${group}`}
            body={
              total > 0
                ? `${group} is ${pages.toLocaleString()} page${pages === 1 ? '' : 's'} long. The link you followed points past it.`
                : 'No exercise in the library is in this group.'
            }
            action={
              <Button variant="secondary" href={exercisesHref('categories')}>
                Back to the categories
              </Button>
            }
          />
        ) : (
          <div
            style={{
              opacity: pending ? 0.55 : 1,
              transition: 'opacity var(--tx-t-fast) var(--tx-ease)',
            }}
          >
            <Table
              caption={`${total} exercises in ${group}, ${size} to a page`}
              columns={[
                { key: 'name', label: 'Name' },
                { key: 'equipment', label: 'Equipment' },
                { key: 'group', label: 'Muscle group' },
                { key: 'go', label: '', bare: true, className: 'sel' },
              ]}
              className="tbl--exlib"
            >
              {exercises.map(ex => (
                <ExerciseRow
                  key={ex.id}
                  exercise={ex}
                  selected={selectedId === ex.id}
                  onClick={() => onOpen(ex)}
                />
              ))}
            </Table>
          </div>
        )}
      </div>

      <Pager
        page={query.page}
        size={size}
        total={total}
        href={p => exercisesHref('categories', { group, page: p })}
        label={`${group} pages`}
        noun="exercises"
      />
    </>
  );
}

/* ───────────────────────────────────────────────── view · by exercises ── */

/**
 * The flat list: search, two selects, a table, and numbered pages.
 *
 * ── THE FILTER BAR IS TWO SELECTS AND A SWITCH, NOT FIFTEEN CHIPS ───────────
 *
 * The chips read as one row of equals and they were two different questions
 * plus a third — *which muscle group*, *what kit*, and *whose*. Fifteen targets
 * on one line, wrapping to two on a laptop, with no way to see at a glance which
 * axis a pressed chip belonged to. Two `Select`s say the axis in their labels
 * and cost one click each; *Yours* is a `Switch` because it is the one filter
 * that is genuinely binary.
 */
function ExercisesView({
  exercises,
  total,
  libraryTotal,
  meta,
  query,
  size,
  pending,
  hasFilters,
  onFilter,
  onCreate,
  onOpen,
  selectedId,
}: {
  exercises: ExerciseWire[];
  total: number;
  libraryTotal: number;
  meta: ExercisesData['meta'];
  query: ExercisesData['query'];
  size: number;
  pending: boolean;
  hasFilters: boolean;
  onFilter: (next: Partial<ExercisesQuery>) => void;
  onCreate: () => void;
  onOpen: (ex: ExerciseWire) => void;
  selectedId: string | null;
}) {
  return (
    <>
      {/*
        THE FILTER BAR — ONE ROW OF THINGS THAT NARROW THE LIBRARY, and nothing
        else. The search box left it for the tab strip above: it is the way IN
        to this screen for a trainer who already knows the movement's name,
        where these three are what you reach for when you do not.

        It was two rows for a while, the box on its own line above the selects.
        The row it vacated closes up, which is 48px of chrome back to a table
        that is the whole point of the screen.
      */}
      <div
        className="split__hd"
        style={{ padding: '12px 24px', borderBottom: '1px solid var(--tx-line)' }}
      >
        <div className="tools" style={{ gap: 10 }}>
          <Select
            label="Muscle group"
            width={180}
            value={query.group}
            onChange={e => onFilter({ group: e.target.value })}
            options={[
              { value: '', label: `All groups · ${libraryTotal.toLocaleString()}` },
              ...meta.muscleGroups.map(mg => ({ value: mg, label: mg })),
            ]}
          />
          <Select
            label="Equipment"
            width={180}
            value={query.equipment}
            onChange={e => onFilter({ equipment: e.target.value })}
            options={[
              { value: '', label: 'Any equipment' },
              /* "No kit" was a chip of its own and it is this option — the
                 dataset stores the value verbatim, so it needed no special case
                 once equipment stopped being chips. The label is what a trainer
                 would say; the value is what the column holds. */
              { value: BODY_WEIGHT_EQUIPMENT, label: 'No kit (body weight)' },
              ...meta.equipment
                .filter(eq => eq !== BODY_WEIGHT_EQUIPMENT)
                .map(eq => ({ value: eq, label: eq })),
            ]}
          />
          {/*
            WHOSE MOVEMENTS — a select, where this was a *Yours only* switch.
            The switch could only ever ask one yes-or-no question, and there are
            three answers a trainer wants: the InclineYou catalogue on its own
            (what you reach for when building from scratch), their own on its
            own (what they reach for when they have written the gym's kit into
            the library), and everything.

            The fourth is the one the switch could not have held at all. A draft
            is not in *All exercises* and not in *My exercises* — both of those
            are lists of movements that can go into a program tomorrow — so it
            is not a filter over the list you are looking at, it is a different
            list. That is what makes these four options of one control rather
            than a control with a checkbox beside it.
          */}
          <Select
            label="Show"
            width={190}
            value={query.source}
            onChange={e => onFilter({ source: e.target.value as ExerciseSource })}
            options={EXERCISE_SOURCES.map(o => ({ value: o.value, label: o.label }))}
          />

          {hasFilters && (
            <Button
              variant="ghost"
              onClick={() => onFilter({ q: '', group: '', equipment: '', source: 'all' })}
              style={{ alignSelf: 'flex-end', marginBottom: 1 }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }} aria-busy={pending || undefined}>
        {exercises.length === 0 && total > 0 ? (
          /* PAST THE END — `?page=9` on a list three pages long. Reachable by
             hand, and reachable honestly: a link sent last week to page 3 of
             *Yours* is page 3 of nothing once two movements are deleted. The
             API answers an empty slice and `Pager` draws nothing at one page,
             so without this branch the trainer gets a blank pane and no control
             to get out of it. Not clamped silently in the guard, because a URL
             that says page 9 and renders page 1 is a URL that lies. */
          <EmptyState
            kind="filtered"
            title="That page is past the end"
            body={`This list is ${Math.ceil(total / size).toLocaleString()} page${
              Math.ceil(total / size) === 1 ? '' : 's'
            } long. The link you followed points past it.`}
            action={
              <Button variant="secondary" onClick={() => onFilter({ page: 0 })}>
                Back to the first page
              </Button>
            }
          />
        ) : exercises.length === 0 ? (
          <EmptyState
            kind={hasFilters ? 'filtered' : 'first-run'}
            title={hasFilters ? 'No exercises match those filters' : 'No exercises yet'}
            body={
              hasFilters
                ? 'Nothing in the library answers all of those at once. Widen one of them.'
                : 'The library is empty. Write the first movement and it will be here for every program you build.'
            }
            action={
              hasFilters ? (
                <Button
                  variant="secondary"
                  onClick={() => onFilter({ q: '', group: '', equipment: '', source: 'all' })}
                >
                  Clear filters
                </Button>
              ) : (
                <Button variant="primary" onClick={onCreate}>
                  <PlusIcon />
                  Create exercise
                </Button>
              )
            }
          />
        ) : (
          /* The rows fade while the next page is on its way rather than being
             replaced by a spinner: the trainer is comparing a list against what
             they are looking for, and blanking it costs them the comparison. */
          <div style={{ opacity: pending ? 0.55 : 1, transition: 'opacity var(--tx-t-fast) var(--tx-ease)' }}>
            <Table
              caption={`${total} exercises, ${size} to a page`}
              columns={[
                { key: 'name', label: 'Name' },
                { key: 'equipment', label: 'Equipment' },
                { key: 'group', label: 'Muscle group' },
                { key: 'go', label: '', bare: true, className: 'sel' },
              ]}
              className="tbl--exlib"
            >
              {exercises.map(ex => (
                <ExerciseRow
                  key={ex.id}
                  exercise={ex}
                  selected={selectedId === ex.id}
                  onClick={() => onOpen(ex)}
                />
              ))}
            </Table>
          </div>
        )}
      </div>

      <Pager
        page={query.page}
        size={size}
        total={total}
        href={p => exercisesHref('exercises', { ...query, page: p })}
        label="Exercise library pages"
        noun="exercises"
      />
    </>
  );
}

/* ────────────────────────────────────────────── exercise table row ── */

/**
 * One movement, as four cells.
 *
 * It was a hand-written `<tr>` with the selected fill carried inline. It is
 * `c-table`'s own `Row` now, which is what supplies the two things the raw
 * markup did not: the name becomes `<th scope="row">`, so a reader in the
 * Equipment column hears *Barbell Bench Press, Barbell* rather than *Barbell*;
 * and `selected` lands on `.tbl tr[aria-selected]`, the rule §11 already has,
 * instead of an inline `background` that no theme can reach.
 *
 * The row stays a `<tr>` with a click handler rather than becoming a link,
 * because what it opens is a panel over this screen — `c-programrow`'s note
 * draws the same line from the other side.
 */
function ExerciseRow({
  exercise,
  selected,
  onClick,
}: {
  exercise: ExerciseWire;
  selected: boolean;
  onClick: () => void;
}) {
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }

  return (
    <TableRow
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      selected={selected}
      style={{ cursor: 'pointer' }}
      header={
        <>
          <span className="strong">{exercise.name}</span>
          {exercise.isCustom && (
            <>
              {' '}
              <Tag tone="acc">Yours</Tag>
            </>
          )}
          {/* Only ever seen under *Draft*, since no other view lists one — but
              drawn anyway, because the one place a trainer sees these rows is
              the one place they need telling which is which without opening
              the panel. */}
          {exercise.status === 'draft' && (
            <>
              {' '}
              <Tag tone="warn">Draft</Tag>
            </>
          )}
        </>
      }
      cells={[
        {
          key: 'equipment',
          content: exercise.equipment ? (
            <span style={{ color: 'var(--tx-ink-2)', fontSize: 13 }}>{exercise.equipment}</span>
          ) : (
            <span style={{ color: 'var(--tx-ink-3)', fontSize: 12 }}>&mdash;</span>
          ),
        },
        {
          key: 'group',
          content: exercise.muscleGroup ? (
            <Tag>{exercise.muscleGroup}</Tag>
          ) : (
            <span style={{ color: 'var(--tx-ink-3)', fontSize: 12 }}>&mdash;</span>
          ),
        },
        { key: 'go', content: <ChevronRightIcon />, style: { textAlign: 'right' } },
      ]}
    />
  );
}
