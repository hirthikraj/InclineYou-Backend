'use client';

import { useEffect, useRef, useState } from 'react';

import type { ExerciseWire } from '@/lib/exercises/api';
import { readExercise } from '@/lib/exercises/read';
import { Glyph } from '@/components/shell/Icons';
import { useDismiss } from '@/lib/ui/dismiss';
import { Button } from '@/web-components/ui/Button';
import { Tag } from '@/web-components/ui/Tag';

/* ─────────────────────────────────────────────────── inline icons ── */

export function PlusIcon({ size = 14 }: { size?: number }) {
  return <Glyph size={size} d="M12 5v14M5 12h14" />;
}
export function XIcon({ size = 14 }: { size?: number }) {
  return <Glyph size={size} d="M18 6 6 18M6 6l12 12" />;
}
/** The funnel the roster uses for Filter: three bars, narrowing. */
export function FilterIcon({ size = 15 }: { size?: number }) {
  return <Glyph size={size} d="M4 6h16M7 12h10M10 18h4" />;
}
export function ChevronRightIcon({ size = 12 }: { size?: number }) {
  return <Glyph size={size} d="M9 6l6 6-6 6" />;
}
export function ChevronLeftIcon({ size = 13 }: { size?: number }) {
  return <Glyph size={size} d="M15 6l-6 6 6 6" />;
}
export function ChevronDownIcon() {
  return <Glyph size={12} d="M6 9l6 6 6-6" />;
}
export function CheckIcon() {
  return <Glyph size={13} d="M5 13l4 4L19 7" />;
}

/* ───────────────────────────────────────── custom dropdown ── */

export function Dropdown({
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

/** Keys the panel does not draw under *About this entry*: five have sections of their own, and three are the library's internal bookkeeping. */
const DRAWN_ELSEWHERE = new Set(['aliases', 'commonMistakes', 'safety', 'equipmentNeeded', 'category']);
const INTERNAL = new Set(['source', 'review', 'reviewNote']);

function plain(v: unknown): string {
  if (Array.isArray(v)) return v.map(plain).join(', ');
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * ANY OTHER KEY THE LIBRARY HOLDS ABOUT AN ENTRY.
 *
 * The named fields have sections above. What is left of `metadata` is drawn
 * generically, so a key added to the library reaches the panel the day it exists.
 * `source`, `review` and `reviewNote` are left out on purpose: where an entry came
 * from and what a reviewer was asked are the library's bookkeeping, not facts a
 * trainer choosing a movement acts on. With nothing left, no section is drawn.
 */
function AboutEntry({ metadata }: { metadata?: Record<string, unknown> | null }) {
  if (!metadata) return null;
  const rows: { k: string; v: string }[] = [];
  for (const [k, v] of Object.entries(metadata)) {
    if (DRAWN_ELSEWHERE.has(k) || INTERNAL.has(k)) continue;
    if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    rows.push({ k: k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), v: plain(v) });
  }
  if (rows.length === 0) return null;
  return (
    <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--tx-line)' }}>
      <p className="micro" style={{ marginBottom: 10, marginTop: 0 }}>About this entry</p>
      <dl className="exl__about">
        {rows.map(r => (
          <div key={r.k}>
            <dt>{r.k}</dt>
            <dd>{r.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** What a log type means to a trainer, in the words they would say it. */
export const LOG_TYPE_WORDS: Record<string, string> = {
  weight_reps: 'Weight and reps',
  reps: 'Reps, bodyweight',
  time: 'Time, bodyweight',
  distance: 'Distance, bodyweight',
  weight_time: 'Weight and time',
  weight_distance: 'Weight and distance',
};

export function ExercisePanel({
  exercise: row,
  onClose,
}: {
  exercise: ExerciseWire;
  onClose: () => void;
}) {
  /* A LIST ROW CARRIES NO PROSE. The server drops `description` and `formCues` from
     every list and search read and sends them only on the single-exercise read, so the
     row this panel is opened with has none — the steps have to be fetched. The row
     draws at once and the detail fills in; a failed read leaves the row as it was. */
  const [full, setFull] = useState<ExerciseWire | null>(null);
  useEffect(() => {
    if (row.description != null) return;
    let live = true;
    void readExercise(row.id).then(found => {
      if (live && found) setFull(found);
    });
    return () => {
      live = false;
    };
  }, [row.id, row.description]);
  const exercise = full && full.id === row.id ? full : row;

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
        className={`panel xl-panel${closing ? ' panel--out' : ''}`}
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
          {(exercise.target && exercise.target.toLowerCase() !== (exercise.muscleGroup ?? '').toLowerCase()) ||
          exercise.secondaryTargets?.length > 0 ? (
            <div style={{ marginBottom: 18 }}>
              <p className="micro" style={{ marginBottom: 4, marginTop: 0 }}>Targets</p>
              {exercise.target && (
                <p style={{ fontSize: 13, margin: 0, fontWeight: 600 }}>{exercise.target}</p>
              )}
              {exercise.secondaryTargets?.length > 0 && (
                <p style={{ fontSize: 12, margin: '3px 0 0', color: 'var(--tx-ink-3)' }}>
                  also {exercise.secondaryTargets.join(', ')}
                </p>
              )}
            </div>
          ) : null}

          {/* Movement pattern, and the rest of what the library knows about HOW it is done and counted. */}
          {exercise.movementPattern && (
            <div style={{ marginBottom: 18 }}>
              <p className="micro" style={{ marginBottom: 4, marginTop: 0 }}>Movement</p>
              <p style={{ fontSize: 13, margin: 0 }}>{exercise.movementPattern}</p>
            </div>
          )}

          {(exercise.aliases?.length ?? 0) > 0 && (
            <div style={{ marginBottom: 18 }}>
              <p className="micro" style={{ marginBottom: 4, marginTop: 0 }}>Also called</p>
              <p style={{ fontSize: 13, margin: 0, color: 'var(--tx-ink-2)' }}>{exercise.aliases?.join(' · ')}</p>
            </div>
          )}

          <div style={{ marginBottom: 18 }}>
            <p className="micro" style={{ marginBottom: 4, marginTop: 0 }}>Counted in</p>
            <p style={{ fontSize: 13, margin: 0 }}>{LOG_TYPE_WORDS[exercise.logType ?? 'weight_reps'] ?? exercise.logType}</p>
            {exercise.category && (
              <p style={{ fontSize: 12, margin: '3px 0 0', color: 'var(--tx-ink-3)' }}>
                A {exercise.category}, not a strength movement
              </p>
            )}
          </div>

          {(exercise.equipmentNeeded?.length ?? 0) > 0 && (
            <div style={{ marginBottom: 18 }}>
              <p className="micro" style={{ marginBottom: 4, marginTop: 0 }}>Also needs</p>
              <p style={{ fontSize: 13, margin: 0 }}>{exercise.equipmentNeeded?.join(', ')}</p>
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

          {(exercise.commonMistakes?.length ?? 0) > 0 && (
            <div style={{ marginTop: 22 }}>
              <p className="micro" style={{ marginBottom: 10, marginTop: 0 }}>Common mistakes</p>
              <ul style={{ paddingLeft: 20, margin: 0, listStyleType: 'disc' }}>
                {exercise.commonMistakes?.map((m, i) => (
                  <li key={i} style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 4 }}>{m}</li>
                ))}
              </ul>
            </div>
          )}

          {(exercise.safety?.length ?? 0) > 0 && (
            <div style={{ marginTop: 22 }}>
              <p className="micro" style={{ marginBottom: 10, marginTop: 0 }}>Safety</p>
              <ul style={{ paddingLeft: 20, margin: 0, listStyleType: 'disc' }}>
                {exercise.safety?.map((m, i) => (
                  <li key={i} style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 4 }}>{m}</li>
                ))}
              </ul>
            </div>
          )}

          <AboutEntry metadata={exercise.metadata} />
        </div>
      </div>
    </>
  );
}

