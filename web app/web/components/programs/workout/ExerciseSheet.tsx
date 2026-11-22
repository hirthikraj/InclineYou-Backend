'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { effortTakesNumber, setsSummary, type DraftExercise, type DraftSet } from '@/lib/workouts/draft';
import { restLabel } from '@/lib/workouts/estimate';
import { Button } from '@/web-components/ui/Button';
import { useEscapeGuard } from '@/web-components/ui/Modal';
import { AltIcon, ArrowDown, ArrowUp, ChevronDown, LinkIcon, TrashIcon } from '../Icons';
import { SetLine, type CardActions } from './ExerciseCard';

/**
 * ONE MOVEMENT, EDITED ON A PHONE — the sheet a card opens instead of unfolding in place.
 *
 * ── WHY IT IS A SHEET AND NOT THE CARD'S OWN PANEL ──────────────────────────
 *
 * The desk card unfolds a table of set lines inside the canvas. On a phone that table is two lines per set with its
 * right edge off the screen, and opening it pushes every card below it down the page. A sheet gives the movement the whole
 * width and leaves the workout where it was.
 *
 * ── THE ORDER IS THE FREQUENCY OF THE JOB ───────────────────────────────────
 *
 * Almost every set in a real session is *the same as the one before*, so the first thing on the sheet is the answer to
 * that: sets, reps and weight as three steppers that write EVERY set, and the rest as a row of chips. The per-set list —
 * a pyramid, a drop set, a different tempo on the last one — is one press deeper, and opens by itself when the sets
 * already differ, so nothing a trainer wrote is hidden from them. Row verbs (move, alternatives, remove) are labelled
 * rows, not a ⋮ they have to know to press.
 *
 * Every write goes through the same `CardActions` the desk card uses, so there is one set of rules for what a set is
 * and the two layouts cannot disagree about it.
 */

const REST_CHOICES = [30, 45, 60, 90, 120, 180];

/** What the builder knows about where a movement sits — decided there, because it needs the neighbours. */
export interface SheetPosition {
  canUp: boolean;
  canDown: boolean;
  /** The movement after this one, when it can be joined to it as a superset. */
  nextName: string | null;
}

export function ExerciseSheet({
  entry,
  position,
  chained,
  actions,
  onClose,
}: {
  entry: DraftExercise;
  position: SheetPosition;
  chained: boolean;
  actions: CardActions;
  onClose: () => void;
}) {
  const sets = entry.sets;
  const first = sets[0];
  const same = <T,>(pick: (s: DraftSet) => T) => sets.every(s => pick(s) === pick(first));

  const repsUniform = same(s => s.effortKind) && first.effortKind === 'reps' && same(s => s.effortValue);
  const loadUniform = same(s => s.loadKind) && same(s => s.loadValue);
  const restUniform = same(s => s.restSeconds);
  const everyoneAgrees =
    repsUniform || (same(s => s.effortKind) && same(s => s.effortValue))
      ? loadUniform && restUniform && same(s => s.tempo) && same(s => s.notes)
      : false;

  /* OPENS BY ITSELF WHEN THE SETS DIFFER — a pyramid hidden behind a button is a pyramid the steppers would flatten. */
  const [showSets, setShowSets] = useState(!everyoneAgrees);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  /* A DIALOG OPENED FROM THIS SHEET (a set's note, the alternatives) owns Escape and Tab while it is up. This sheet holds Escape
     from the builder only while nothing sits above it, and stands its own keys down for the same stretch — otherwise one press
     closed this sheet and left the dialog on screen. */
  const [ask, setAsk] = useState(false);
  const askRef = useRef(false);
  useEffect(() => {
    const seen = () => {
      const on = Boolean(document.querySelector('.wkb__ask'));
      askRef.current = on;
      setAsk(on);
    };
    const mo = new MutationObserver(seen);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  useEscapeGuard(!ask);
  /* `onClose` is a new function every render of the card, so it is read through a ref: an effect keyed on it re-ran on every
     keystroke, snapping focus back to *Done* and re-applying `inert` in the middle of an edit. */
  const closeFn = useRef(onClose);
  useEffect(() => {
    closeFn.current = onClose;
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !askRef.current) closeFn.current();
    };
    window.addEventListener('keydown', key);
    const previous = document.activeElement as HTMLElement | null;
    /* THE DIALOG BEHIND IS INERT while this is up: this sheet is drawn on the page body, outside it, so without that Tab
       walks out the end of the sheet into the page, and a screen reader reads the workout beneath as live. */
    const behind = document.querySelector('.wkb');
    behind?.setAttribute('inert', '');
    closeRef.current?.focus({ preventScroll: true });
    /* Tab wraps inside the sheet. Everything that is not displayed (a collapsed section) is skipped. */
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !sheetRef.current || askRef.current) return;
      const items = [
        ...sheetRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter(el => el.checkVisibility?.({ checkVisibilityCSS: true }) ?? el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !sheetRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !sheetRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', trap, true);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('keydown', trap, true);
      behind?.removeAttribute('inert');
      previous?.focus?.({ preventScroll: true });
    };
  }, []);

  const patchAll = (patch: Partial<Omit<DraftSet, 'uid'>>) => {
    for (const s of sets) actions.onPatchSet(entry.uid, s.uid, patch);
  };

  const { canUp, canDown, nextName } = position;

  return createPortal(
    <>
      <button className="exs__scrim" type="button" aria-label="Close" onClick={onClose} />
      <div className="exs" role="dialog" aria-modal="true" aria-label={`Edit ${entry.name}`} ref={sheetRef}>
        <div className="exs__hd">
          {/* BOTH LINES (21 Nov 2026). It printed the meta OR the sets, so on any movement with a meta the
              live *4 × 12 · 7.5 kg* — the receipt for every stepper press below — was nowhere on screen. */}
          <div className="exs__t">
            <b>{entry.name}</b>
            {entry.meta && <span>{entry.meta}</span>}
            <span className="exs__sum" aria-live="polite">{setsSummary(sets)}</span>
          </div>
          <Button variant="primary" size="sm" onClick={onClose} ref={closeRef}>
            Done
          </Button>
        </div>

        <div className="exs__b">
          <section className="exs__s" aria-label="All sets">
            <Stepper
              label="Sets"
              value={sets.length}
              shown={String(sets.length)}
              integer
              min={1}
              max={20}
              onChange={n => actions.onSetCount(entry.uid, n)}
            />
            {repsUniform && (
              <Stepper
                label="Reps"
                value={first.effortValue ?? 0}
                shown={first.effortValue === null ? '—' : String(first.effortValue)}
                integer
                min={1}
                max={100}
                onChange={n => patchAll({ effortValue: n })}
              />
            )}
            {same(s => s.loadKind) && first.loadKind === 'weight' && loadUniform && (
              <Stepper
                label="Weight"
                value={first.loadValue ?? 0}
                shown={first.loadValue === null ? '—' : String(first.loadValue)}
                unit="kg"
                step={2.5}
                min={0}
                max={500}
                onChange={n => patchAll({ loadValue: n })}
              />
            )}
            {same(s => s.loadKind) && first.loadKind === 'bodyweight' && (
              <p className="exs__note">Bodyweight — no load to set.</p>
            )}
            {!repsUniform && same(s => s.effortKind) && effortTakesNumber(first.effortKind) && (
              <p className="exs__note">Counted by something other than reps. Set the figures below.</p>
            )}
            {!same(s => s.loadKind) && <p className="exs__note">Sets are loaded differently. Edit them below.</p>}

            <div className="exs__rest" role="group" aria-label="Rest after each set">
              <span className="exs__rl">Rest</span>
              <div className="exs__chips">
                {REST_CHOICES.map(sec => (
                  <button
                    key={sec}
                    className="exs__chip"
                    type="button"
                    aria-pressed={restUniform && first.restSeconds === sec}
                    onClick={() => patchAll({ restSeconds: sec })}
                  >
                    {restLabel(sec)}
                  </button>
                ))}
                {restUniform && first.restSeconds !== null && !REST_CHOICES.includes(first.restSeconds) && (
                  <button className="exs__chip" type="button" aria-pressed="true">
                    {restLabel(first.restSeconds)}
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="exs__s" aria-label="Each set">
            <button
              className="exs__row"
              type="button"
              aria-expanded={showSets}
              onClick={() => setShowSets(v => !v)}
            >
              <span>Edit individual sets</span>
              <span className="exs__rr">
                <span className="exs__rn">{sets.length}</span>
                <span className="exs__chev" aria-hidden="true"><ChevronDown size={16} /></span>
              </span>
            </button>
            {showSets && (
              <div className="exs__sets">
                {sets.map((set, i) => (
                  <SetLine
                    key={set.uid}
                    n={i + 1}
                    set={set}
                    name={entry.name}
                    onRemove={sets.length > 1 ? () => actions.onRemoveSet(entry.uid, set.uid) : null}
                    onPatch={patch => actions.onPatchSet(entry.uid, set.uid, patch)}
                    onNote={() => actions.onNote(entry.uid, set.uid)}
                  />
                ))}
                <button className="wke__add" type="button" onClick={() => actions.onAddSet(entry.uid)}>
                  <span aria-hidden="true">+</span> Add a new set
                </button>
              </div>
            )}
          </section>

          <section className="exs__s" aria-label="This exercise">
            {/* ONE ROW, TWO BUTTONS (21 Nov 2026): *Move up* and *Move down* were two full-width rows for one
                decision. The arrows keep their words as accessible names, and both stay 44px targets. */}
            <div className="exs__row exs__row--pair" role="group" aria-label="Order in the workout">
              <span>Order</span>
              <span className="exs__mv">
                <button type="button" disabled={!canUp} aria-label="Move up" onClick={() => actions.onMove(entry.uid, -1)}>
                  <ArrowUp size={16} />
                </button>
                <button type="button" disabled={!canDown} aria-label="Move down" onClick={() => actions.onMove(entry.uid, 1)}>
                  <ArrowDown size={16} />
                </button>
              </span>
            </div>
            {chained && (!canUp || !canDown) && (
              <p className="exs__note">In a circuit, a movement moves within it. Take it out of the circuit to move it further.</p>
            )}
            {nextName && (
              <button className="exs__row" type="button" onClick={() => {
                  /* The card moves into the circuit's wrapper and remounts, which would close this sheet anyway; closing it on
                     purpose keeps the state honest. Reopen the card to keep editing it. */
                  onClose();
                  actions.onChainNext(entry.uid);
                }}>
                <span>
                  <LinkIcon size={13} /> Superset with {nextName}
                </span>
              </button>
            )}
            <button
              className="exs__row"
              type="button"
              onClick={() => {
                onClose();
                actions.onHeading(entry.uid);
              }}
            >
              <span>Add a heading above</span>
            </button>
            <button
              className="exs__row"
              type="button"
              onClick={() => {
                onClose();
                actions.onAlternates(entry.uid);
              }}
            >
              <span>
                <AltIcon size={14} /> Alternative exercises
              </span>
              {entry.alternatives.length > 0 && <span className="exs__rn">{entry.alternatives.length}</span>}
            </button>
            {chained && (
              <button
                className="exs__row"
                type="button"
                onClick={() => {
                  actions.onUnchain(entry.uid);
                }}
              >
                <span>
                  <LinkIcon size={13} /> Take it out of the circuit
                </span>
              </button>
            )}
            <button
              className="exs__row exs__row--danger"
              type="button"
              onClick={() => {
                onClose();
                actions.onRemove(entry.uid);
              }}
            >
              <span>
                <TrashIcon size={14} /> Remove from this workout
              </span>
            </button>
          </section>
        </div>
      </div>
    </>,
    document.body,
  );
}

/**
 * A FIGURE YOU CAN STEP OR TYPE (21 Nov 2026). The value between − and + was a
 * label, so the only way to 60 kg was twenty-four presses of a 2.5 kg step. It is
 * a field now: tap it, the number is selected and the phone's number pad comes
 * up, and the figure is committed on blur or Enter, clamped to the range. The
 * buttons still step, for the one-plate change that is most edits. A field being
 * typed into keeps its own text (`draft`) until it commits, so a half-typed
 * `6` is not written back as the whole answer.
 */
function Stepper({
  label,
  value,
  shown,
  step = 1,
  min,
  max,
  unit,
  integer = false,
  onChange,
}: {
  label: string;
  value: number;
  shown: string;
  step?: number;
  min: number;
  max: number;
  /** Drawn after the figure, outside the field: `kg`. */
  unit?: string;
  /** A count, typed without a decimal point. */
  integer?: boolean;
  onChange: (next: number) => void;
}) {
  const round = (n: number) => Math.round(n * 100) / 100;
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const n = Number(draft.replace(',', '.'));
    setDraft(null);
    if (draft.trim() === '' || !Number.isFinite(n)) return;
    const v = Math.min(max, Math.max(min, integer ? Math.round(n) : round(n)));
    if (v !== value) onChange(v);
  };

  return (
    <div className="wsmx__f exs__f">
      <span className="wsmx__fl">{label}</span>
      <span className="wsmx__st">
        <button
          className="wsmx__sb"
          type="button"
          disabled={value <= min}
          aria-label={`Less ${label.toLowerCase()}`}
          onClick={() => onChange(Math.max(min, round(value - step)))}
        >
          −
        </button>
        <span className="wsmx__v exs__v">
          <input
            className="exs__in"
            type="text"
            inputMode={integer ? 'numeric' : 'decimal'}
            aria-label={unit ? `${label}, ${unit}` : label}
            value={draft ?? (shown === '—' ? '' : shown)}
            placeholder="—"
            onFocus={(e) => { setDraft(shown === '—' ? '' : shown); e.currentTarget.select(); }}
            onChange={(e) => setDraft(e.target.value.replace(integer ? /[^0-9]/g : /[^0-9.,]/g, ''))}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
          {unit && <span className="exs__u" aria-hidden="true">{unit}</span>}
        </span>
        <button
          className="wsmx__sb"
          type="button"
          disabled={value >= max}
          aria-label={`More ${label.toLowerCase()}`}
          onClick={() => onChange(Math.min(max, round(value + step)))}
        >
          +
        </button>
      </span>
    </div>
  );
}
