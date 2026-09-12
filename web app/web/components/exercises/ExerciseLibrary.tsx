'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import type { ExercisesData } from '@/lib/exercises/guard';
import type { ExerciseWire } from '@/lib/exercises/api';
import { searchExercises, createCustomExercise } from '@/lib/exercises/actions';
import { TopBar } from '@/components/shell/TopBar';
import { ProgramsTabs } from '@/components/programs/tabs';
import { Glyph } from '@/components/shell/Icons';

/* ─────────────────────────────────────────────────── inline icons ── */

function SearchIcon() {
  return (
    <Glyph size={14}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21" />
    </Glyph>
  );
}
function PlusIcon({ size = 14 }: { size?: number }) {
  return <Glyph size={size} d="M12 5v14M5 12h14" />;
}
function XIcon({ size = 14 }: { size?: number }) {
  return <Glyph size={size} d="M18 6 6 18M6 6l12 12" />;
}
function ChevronRightIcon({ size = 12 }: { size?: number }) {
  return <Glyph size={size} d="M9 6l6 6-6 6" />;
}
function ChevronDownIcon() {
  return <Glyph size={12} d="M6 9l6 6 6-6" />;
}
function CheckIcon() {
  return <Glyph size={13} d="M5 13l4 4L19 7" />;
}

/* ────────────────────────────────── chip active style helper ── */

const CHIP_ACTIVE: React.CSSProperties = {
  background: 'var(--tx-accent-soft)',
  borderColor: 'var(--tx-accent-line)',
  color: 'var(--tx-accent-text)',
};

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

  /* Opening is what clears the filter, so the CLEAR belongs to the control that
     opens — see `toggle` below. What is left here is the one part that is a real
     side effect: moving focus into a field that does not exist until this render
     is committed. No `setTimeout(0)` either; an effect already runs after commit,
     so the input is in the DOM by the time this reads the ref. */
  useEffect(() => {
    if (open) filterRef.current?.focus();
  }, [open]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    /* A fresh open starts on the whole list with nothing selected. Doing it here
       rather than in an effect keeps it one render: an effect would paint the
       previous sitting's filter for a frame before clearing it. */
    if (next) {
      setFilter('');
      setCursor(-1);
    }
  }

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
        onClick={toggle}
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

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await createCustomExercise(name, muscleGroup, target, equipment, steps);
      if (result.ok) {
        onCreated(result.exercise);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <button
        className="scrim scrim--soft"
        type="button"
        aria-label="Close create exercise"
        onClick={onClose}
      />
      <div
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-label="Create a custom exercise"
      >
        <div className="panel__hd">
          <span className="panel__t">Create exercise</span>
          <button
            className="btn btn--icon btn--ghost"
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{ marginLeft: 'auto' }}
          >
            <XIcon />
          </button>
        </div>

        <div className="panel__body">
          <form id="create-exercise-form" onSubmit={submit}>

            {/* Name */}
            <div className="fld" style={{ marginBottom: 20 }}>
              <label className="fld__l" htmlFor="ex-name">Exercise name</label>
              <input
                ref={nameRef}
                id="ex-name"
                className="ctl"
                type="text"
                placeholder="e.g. Landmine press"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>

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
              <button
                className="btn btn--ghost"
                type="button"
                onClick={addStep}
                style={{ marginTop: 8, fontSize: 12, padding: '4px 8px' }}
              >
                <PlusIcon size={12} />
                Add step
              </button>
            </div>

            {error && (
              <p style={{ fontSize: 12, color: 'var(--tx-danger)', marginTop: 14, marginBottom: 0 }}>
                {error}
              </p>
            )}
          </form>
        </div>

        <div className="panel__foot">
          <button
            className="btn btn--secondary"
            type="button"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            className="btn btn--primary"
            type="submit"
            form="create-exercise-form"
            disabled={pending || !name.trim()}
          >
            {pending ? 'Saving…' : 'Create exercise'}
          </button>
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

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

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
        className="scrim scrim--soft"
        type="button"
        aria-label="Close exercise detail"
        onClick={onClose}
      />
      <div
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-label={exercise.name}
      >
        <div className="panel__hd">
          <span className="panel__t">{exercise.name}</span>
          <button
            ref={closeRef}
            className="btn btn--icon btn--ghost"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            <XIcon />
          </button>
        </div>

        <div className="panel__body">
          {/* Tags */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
            {exercise.muscleGroup && (
              <span className="tag">{exercise.muscleGroup}</span>
            )}
            {showBodyPart && (
              <span className="tag">{exercise.bodyPart}</span>
            )}
            {exercise.equipment && (
              <span className="tag">{exercise.equipment}</span>
            )}
            {exercise.level && (
              <span className="tag">{exercise.level}</span>
            )}
            {exercise.isCustom && (
              <span className="tag tag--acc">Yours</span>
            )}
          </div>

          {/* Movement pattern */}
          {exercise.movementPattern && (
            <div style={{ marginBottom: 18 }}>
              <p className="micro" style={{ marginBottom: 4, marginTop: 0 }}>Movement</p>
              <p style={{ fontSize: 13, margin: 0 }}>{exercise.movementPattern}</p>
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

const PAGE_SIZE = 40;

/* The exercises-dataset uses 'body weight' for exercises that need no kit.
   The backend stores this value as-is, so filtering by it gives the right set. */
const BODY_WEIGHT_EQUIPMENT = 'body weight';

export function ExerciseLibrary({ data }: { data: ExercisesData }) {
  const { initial, meta } = data;

  const [exercises, setExercises] = useState<ExerciseWire[]>(initial.exercises);
  const [total, setTotal] = useState(initial.total);
  const [q, setQ] = useState('');
  const [muscleGroup, setMuscleGroup] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [onlyCustom, setOnlyCustom] = useState(false);
  const [noKit, setNoKit] = useState(false);
  const [page, setPage] = useState(0);
  const [loading, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<ExerciseWire | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalCount = total;

  function applyFilters(
    nextQ: string,
    nextMg: string | null,
    nextEq: string | null,
    nextCustom: boolean,
    nextNoKit: boolean,
    nextPage: number,
    append: boolean,
  ) {
    startTransition(async () => {
      const params: Parameters<typeof searchExercises>[0] = {
        size: PAGE_SIZE,
        page: nextPage,
      };
      if (nextQ) params.q = nextQ;
      if (nextMg) params.muscleGroup = nextMg;
      if (nextEq) params.equipment = nextEq;
      /* "No kit" maps to body-weight exercises. The dataset stores this value
         verbatim as 'body weight', so this is an exact-match filter. */
      if (nextNoKit) params.equipment = BODY_WEIGHT_EQUIPMENT;

      const result = await searchExercises(params);
      if (!result) return;

      let list = result.exercises;
      if (nextCustom) list = list.filter(ex => ex.isCustom);

      if (append) {
        setExercises(prev => [...prev, ...list]);
      } else {
        setExercises(list);
      }
      setTotal(result.total);
    });
  }

  function search(value: string) {
    setQ(value);
    setPage(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      applyFilters(value, muscleGroup, equipment, onlyCustom, noKit, 0, false);
    }, 300);
  }

  function toggleMuscleGroup(mg: string) {
    const next = muscleGroup === mg ? null : mg;
    setMuscleGroup(next);
    setPage(0);
    applyFilters(q, next, equipment, onlyCustom, noKit, 0, false);
  }

  function toggleEquipment(eq: string) {
    const next = equipment === eq ? null : eq;
    setEquipment(next);
    setPage(0);
    applyFilters(q, muscleGroup, next, onlyCustom, noKit, 0, false);
  }

  function toggleCustom() {
    const next = !onlyCustom;
    setOnlyCustom(next);
    setPage(0);
    applyFilters(q, muscleGroup, equipment, next, noKit, 0, false);
  }

  function toggleNoKit() {
    const next = !noKit;
    setNoKit(next);
    /* noKit and a specific equipment chip are mutually exclusive.
       Turning noKit on clears the equipment chip; the API receives
       equipment=body weight from the noKit branch instead. */
    if (next) setEquipment(null);
    setPage(0);
    applyFilters(q, muscleGroup, null, onlyCustom, next, 0, false);
  }

  function loadMore() {
    const next = page + 1;
    setPage(next);
    applyFilters(q, muscleGroup, equipment, onlyCustom, noKit, next, true);
  }

  function handleCreated(ex: ExerciseWire) {
    setExercises(prev => [ex, ...prev]);
    setTotal(t => t + 1);
    setShowCreate(false);
  }

  function clearFilters() {
    setQ('');
    setMuscleGroup(null);
    setEquipment(null);
    setOnlyCustom(false);
    setNoKit(false);
    setPage(0);
    applyFilters('', null, null, false, false, 0, false);
  }

  const hasFilters = q || muscleGroup || equipment || onlyCustom || noKit;
  const hasMore = exercises.length < total && !loading;
  const customCount = exercises.filter(ex => ex.isCustom).length;

  return (
    <>
      <TopBar crumb="Programs / Exercises" onSearch={() => {}} />

      <main className="main body--flush" id="main-content">

        {/* Page header */}
        {/* No `paddingBottom` any more: the tab strip is the last thing in `.ph`
            now, and `.tab`'s `margin-bottom:-1px` is what lets the active
            underline sit ON the header's bottom border. Sixteen pixels of
            padding under it left that underline floating in mid-air. */}
        <div className="ph">
          <div className="ph__row" style={{ alignItems: 'center' }}>
            <div>
              <h1 className="ph__t">Exercise library</h1>
              <p className="ph__sub">
                {totalCount.toLocaleString()} exercise{totalCount !== 1 ? 's' : ''}
                {customCount > 0 ? ` · ${customCount} yours` : ''}
              </p>
            </div>
            <div className="ph__acts">
              <button
                className="btn btn--primary"
                type="button"
                onClick={() => setShowCreate(true)}
              >
                <PlusIcon />
                Create exercise
              </button>
            </div>
          </div>

          {/* The same strip Programs draws, from the same file — this screen is
              its second tab, and a tab that cannot get back to its sibling is a
              dead end with a different name. */}
          <ProgramsTabs current="exercises" exerciseCount={totalCount} />
        </div>

        {/* Search + filter bar */}
        <div
          className="split__hd"
          style={{
            padding: '12px 24px',
            borderBottom: '1px solid var(--tx-line)',
          }}
        >
          <label className="search" style={{ maxWidth: 360 }}>
            <SearchIcon />
            <input
              type="search"
              placeholder="Search exercises…"
              aria-label="Search exercises"
              value={q}
              onChange={e => search(e.target.value)}
            />
          </label>

          <div className="tools" style={{ flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {/* All */}
            <button
              className="chip"
              type="button"
              aria-pressed={!hasFilters}
              onClick={clearFilters}
              style={!hasFilters ? CHIP_ACTIVE : undefined}
            >
              All {totalCount.toLocaleString()}
            </button>

            {/* Yours */}
            <button
              className="chip"
              type="button"
              aria-pressed={onlyCustom}
              onClick={toggleCustom}
              style={onlyCustom ? CHIP_ACTIVE : undefined}
            >
              Yours
            </button>

            {/* No kit */}
            <button
              className="chip"
              type="button"
              aria-pressed={noKit}
              onClick={toggleNoKit}
              style={noKit ? CHIP_ACTIVE : undefined}
            >
              No kit
            </button>

            {/* Muscle group chips (top ones) */}
            {meta.muscleGroups.slice(0, 8).map(mg => (
              <button
                key={mg}
                className="chip"
                type="button"
                aria-pressed={muscleGroup === mg}
                onClick={() => toggleMuscleGroup(mg)}
                style={muscleGroup === mg ? CHIP_ACTIVE : undefined}
              >
                {mg}
              </button>
            ))}

            {/* Equipment chips (top ones, excluding body weight since No kit covers it) */}
            {meta.equipment
              .filter(eq => eq !== BODY_WEIGHT_EQUIPMENT)
              .slice(0, 5)
              .map(eq => (
                <button
                  key={eq}
                  className="chip"
                  type="button"
                  aria-pressed={equipment === eq}
                  onClick={() => toggleEquipment(eq)}
                  style={equipment === eq ? CHIP_ACTIVE : undefined}
                >
                  {eq}
                </button>
              ))}
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {exercises.length === 0 && !loading ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 14,
                padding: '60px 24px',
                color: 'var(--tx-ink-3)',
              }}
            >
              <p style={{ fontSize: 14 }}>
                {hasFilters ? 'No exercises match those filters.' : 'No exercises yet.'}
              </p>
              {hasFilters && (
                <button className="btn btn--secondary" type="button" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
              {!hasFilters && (
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={() => setShowCreate(true)}
                >
                  <PlusIcon />
                  Create exercise
                </button>
              )}
            </div>
          ) : (
            <table
              className="tbl"
              style={{ width: '100%', tableLayout: 'fixed' }}
            >
              <colgroup>
                <col style={{ width: '42%' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Equipment</th>
                  <th>Muscle group</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {exercises.map(ex => (
                  <ExerciseRow
                    key={ex.id}
                    exercise={ex}
                    selected={selectedExercise?.id === ex.id}
                    onClick={() => setSelectedExercise(ex)}
                  />
                ))}
              </tbody>
            </table>
          )}

          {/* Load more */}
          {hasMore && (
            <div
              style={{
                padding: '12px 24px',
                borderTop: '1px solid var(--tx-line)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <button
                className="btn btn--secondary"
                type="button"
                onClick={loadMore}
                disabled={loading}
              >
                {loading ? 'Loading…' : `Load more · ${total - exercises.length} remaining`}
              </button>
            </div>
          )}

          {loading && exercises.length > 0 && (
            <div
              style={{
                padding: '12px 24px',
                color: 'var(--tx-ink-3)',
                fontSize: 13,
              }}
            >
              Loading…
            </div>
          )}
        </div>
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

/* ────────────────────────────────────────────── exercise table row ── */

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
    <tr
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-selected={selected}
      style={{
        cursor: 'pointer',
        background: selected ? 'var(--tx-accent-soft)' : undefined,
      }}
    >
      <td>
        <span className="strong">{exercise.name}</span>
        {exercise.isCustom && (
          <>
            {' '}
            <span className="tag tag--acc">Yours</span>
          </>
        )}
      </td>
      <td>
        {exercise.equipment ? (
          <span style={{ color: 'var(--tx-ink-2)', fontSize: 13 }}>{exercise.equipment}</span>
        ) : (
          <span style={{ color: 'var(--tx-ink-3)', fontSize: 12 }}>—</span>
        )}
      </td>
      <td>
        {exercise.muscleGroup ? (
          <span className="tag">{exercise.muscleGroup}</span>
        ) : (
          <span style={{ color: 'var(--tx-ink-3)', fontSize: 12 }}>—</span>
        )}
      </td>
      <td style={{ textAlign: 'right' }}>
        <ChevronRightIcon />
      </td>
    </tr>
  );
}
