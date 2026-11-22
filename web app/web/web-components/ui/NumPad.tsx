'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Number pad — numbers typed with a thumb, without the phone's keyboard.
 * `.npad`, catalogue entry `c-numpad`.
 *
 * ── WHY NOT THE SYSTEM KEYBOARD ─────────────────────────────────────────────
 *
 * `inputMode="decimal"` still raises the OS keyboard: about half the screen,
 * covering the row being typed into, with a Done key in a different place on
 * every phone and no way to say *one plate more*. Strong and Hevy both draw their
 * own pad for exactly this, and so does this: large keys, the steps a trainer
 * actually makes (`+2.5`, `+1`) as one-tap chips, and the screen's own verb
 * (*Log set 3*) on the pad itself, so a whole exercise is typed and logged
 * without the pad closing once.
 *
 * ── SEVERAL FIELDS, ONE PAD ─────────────────────────────────────────────────
 *
 * A set is a load AND a count, so the pad holds a row of `fields` and edits the
 * `active` one; tapping another field switches without closing. The first key
 * pressed in a field just made active REPLACES its value (the selected-text
 * behaviour of a desk field); keys after that append. The pad says nothing
 * about what a value means — it hands the caller strings, and the caller parses
 * them in its own kinds, as the field it replaces did.
 *
 * ── NOT A DIALOG ────────────────────────────────────────────────────────────
 *
 * It is a docked surface, not a modal: the rows above it stay readable and
 * scrollable, and tapping another row's field moves the pad to it. Portalled to
 * the body like `ActionBar`, because a size-contained ancestor would otherwise
 * be its containing block. `inline` draws it in place, for the catalogue.
 *
 * ── IT LEAVES AS SMOOTHLY AS IT ARRIVES (21 Nov 2026) ───────────────────────
 *
 * A tap anywhere outside the pad closes it — except on an element marked
 * `data-numpad-field`, which is another field the pad can serve: the caller moves
 * the pad there instead. Closing is two steps, because a surface cannot slide away
 * after it has been unmounted: the caller sets `closing`, the pad slides down, and
 * when its transitions have actually finished (read from the element, never a timer
 * that would have to match the stylesheet) it calls `onExited`, where the caller
 * lets it go. Opening again mid-slide just reverses it.
 */
export interface NumPadField {
  key: string;
  label: string;
  value: string;
  unit?: string;
  /** Takes a decimal point (load); whole numbers otherwise (reps). */
  decimal?: boolean;
  /** One-tap steps for this field: `{ label: '+2.5', delta: 2.5 }`. */
  chips?: { label: string; delta: number }[];
  /** The floor a chip may step down to. */
  min?: number;
}

const trim = (n: number) => String(Math.round(n * 100) / 100);

export function NumPad({
  title,
  aside,
  fields,
  active,
  onActive,
  onChange,
  onClose,
  action,
  inline = false,
  closing = false,
  onExited,
}: {
  title: ReactNode;
  /** Beside the title — a running rest, say. */
  aside?: ReactNode;
  fields: NumPadField[];
  active: string;
  onActive: (key: string) => void;
  onChange: (key: string, value: string) => void;
  onClose: () => void;
  /** The pad's one verb, full width under the keys. */
  action?: { label: ReactNode; onPress: () => void; disabled?: boolean };
  inline?: boolean;
  /** Leaving: plays the exit, then calls `onExited`. */
  closing?: boolean;
  /** The exit has finished — unmount the pad now. */
  onExited?: () => void;
}) {
  const root = useRef<HTMLDivElement | null>(null);
  /* The latest callbacks, so the two effects below key on `closing` alone: the console
     re-renders four times a second while a rest runs, and a fresh `onClose` / `onExited`
     each time would re-attach the listeners and restart the exit's wait mid-slide. */
  const closeRef = useRef(onClose);
  const exitedRef = useRef(onExited);
  useEffect(() => {
    closeRef.current = onClose;
    exitedRef.current = onExited;
  });
  const field = fields.find((f) => f.key === active) ?? fields[0];

  /* FRESH: the next key replaces rather than appends. Reset whenever the active field
     changes — a render-time adjustment, not an effect (AGENTS.md trap 21). */
  const [fresh, setFresh] = useState(true);
  const [seen, setSeen] = useState(active);
  if (seen !== active) {
    setSeen(active);
    setFresh(true);
  }

  useEffect(() => {
    if (inline || closing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    /* OUTSIDE CLOSES; another field the pad serves does not (the caller moves the pad). */
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || root.current?.contains(target)) return;
      if (target.closest?.('[data-numpad-field]')) return;
      closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [inline, closing]);

  /* THE EXIT: wait for what is actually moving on the pad, then let it go. A forced
     style read first, or the closing class and the open state can be coalesced into one
     recalculation and no transition is created at all (`lib/ui/dismiss.ts` measured it). */
  useEffect(() => {
    if (!closing) return;
    const el = root.current;
    if (el) void el.getBoundingClientRect();
    const moving = el ? el.getAnimations().filter((a) => 'transitionProperty' in a) : [];
    if (moving.length === 0) {
      exitedRef.current?.();
      return;
    }
    let live = true;
    void Promise.allSettled(moving.map((a) => a.finished)).then(() => {
      if (live) exitedRef.current?.();
    });
    return () => {
      live = false;
    };
  }, [closing]);

  if (!field) return null;

  const press = (k: string) => {
    let v = fresh ? '' : field.value;
    if (k === 'back') {
      v = fresh ? '' : v.slice(0, -1);
    } else if (k === '.') {
      if (!field.decimal || v.includes('.')) return;
      v = `${v || '0'}.`;
    } else {
      const [, frac] = v.split('.');
      if (frac !== undefined && frac.length >= 2) return;
      if (!v.includes('.') && v.replace(/^0+/, '').length >= (field.decimal ? 4 : 3)) return;
      v = v === '0' ? k : v + k;
    }
    navigator.vibrate?.(5);
    setFresh(false);
    onChange(field.key, v);
  };

  const step = (delta: number) => {
    const base = Number(field.value) || 0;
    const next = Math.max(field.min ?? 0, base + delta);
    navigator.vibrate?.(5);
    setFresh(false);
    onChange(field.key, trim(next));
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', field.decimal ? '.' : '', '0', 'back'];

  const pad = (
    <div
      ref={root}
      className={`npad${inline ? ' npad--inline' : ''}${closing ? ' npad--out' : ''}`}
      role="group" aria-label={typeof title === 'string' ? title : 'Number pad'} data-popup="">
      <div className="npad__hd">
        <span className="npad__t">{title}</span>
        {aside ? <span className="npad__aside">{aside}</span> : null}
        <button type="button" className="npad__x" onClick={onClose} aria-label="Close the number pad">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      <div className="npad__fields">
        {fields.map((f) => (
          <button
            key={f.key}
            type="button"
            className="npad__f"
            aria-pressed={f.key === field.key}
            onClick={() => onActive(f.key)}
          >
            <span className="npad__fl">{f.label}</span>
            <span className="npad__fv">
              <b>{f.value || '—'}</b>
              {f.unit && f.value ? <i>{f.unit}</i> : null}
            </span>
          </button>
        ))}
      </div>

      {field.chips && field.chips.length > 0 ? (
        <div className="npad__chips">
          {field.chips.map((c) => (
            <button key={c.label} type="button" className="npad__chip" onClick={() => step(c.delta)}>
              {c.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="npad__keys">
        {keys.map((k, i) =>
          k === '' ? (
            <span key={`gap-${i}`} aria-hidden="true" />
          ) : (
            <button
              key={k}
              type="button"
              className={`npad__k${k === 'back' ? ' npad__k--back' : ''}`}
              onClick={() => press(k)}
              aria-label={k === 'back' ? 'Delete the last digit' : k === '.' ? 'Decimal point' : k}
            >
              {k === 'back' ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 6h11v12H9l-6-6 6-6Z" />
                  <path d="m13 10 4 4m0-4-4 4" />
                </svg>
              ) : (
                k
              )}
            </button>
          ),
        )}
      </div>

      {action ? (
        <button type="button" className="npad__go" onClick={action.onPress} disabled={action.disabled}>
          {action.label}
        </button>
      ) : null}
    </div>
  );

  if (inline || typeof document === 'undefined') return pad;
  return createPortal(pad, document.body);
}
