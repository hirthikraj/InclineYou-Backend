'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * DATE FIELD — a date you can TYPE, and a calendar that gets you to 1990.
 *
 * It replaces `<input type="date">` where the browser's own control is the wrong
 * one: that picker is drawn by the OS in a light popup whatever the theme, opens
 * on today (so a birth date is thirty years of Previous-month), and cannot be
 * styled from here. This one is the same field in this system's own voice.
 *
 * ── TWO WAYS IN, AND NEITHER IS THE FALLBACK ────────────────────────────────
 *
 * **Typing** is the fast path at a desk: three segments, `DD / MM / YYYY`, in the
 * mono face `TimeField` uses, that advance on their own (a day that starts 4–9 is
 * already a day; a month that starts 2–9 is already a month), step with ↑ ↓, and
 * take a pasted `12/05/1990` or `1990-05-12` whole. **The calendar** is the way in
 * for a thumb: a day grid, and a title that opens a YEAR grid and then a MONTH
 * grid — two taps to anywhere in a century instead of a hundred and twenty.
 *
 * ── ITS VALUE IS ISO, ALWAYS, AND `''` MEANS *NOT A DATE YET* ──────────────────
 *
 * `value` and `onChange` speak `YYYY-MM-DD` — the shape `<input type="date">`
 * spoke, so swapping one for the other changes no state and no wire. `onChange`
 * says `''` for anything that is not yet a real calendar date (empty, half-typed,
 * 31/02), and `onBlur` says WHICH of those it was, so the screen can say "enter the
 * day, month and year" and "that is not a date" as two different sentences.
 *
 * It does NOT enforce `min` / `max` on what is typed — it greys them out of the
 * calendar. Whether a date is *acceptable* is the form's rule (the Add client flow
 * refuses under 18 and says when they turn 18); a field that silently clamped a
 * typed year would be writing a number nobody typed.
 *
 * ── THE CALENDAR IS A PORTAL, AND THAT IS LOAD-BEARING ──────────────────────
 *
 * It mounts on `document.body` and is placed from the trigger's rect. Inline, it
 * is clipped by the drawer's scroller and — on a phone, where it is a bottom sheet
 * — trapped by the drawer's animating `transform`, which makes a fixed child
 * position against the drawer and not the screen (trap 11). Its root carries
 * `data-popup`, which a surrounding dialog's focus trap and Escape handler read as
 * *this belongs to the dialog's own focus, leave it alone*.
 *
 * ── DAYS START ON MONDAY ───────────────────────────────────────────────────
 *
 * The schedule, the week picker and every weekday number in this product are
 * Monday-first (1 = Monday). A calendar that opened Sunday-first would be the one
 * grid on the screen that disagrees.
 */

export type DateState = 'empty' | 'incomplete' | 'invalid' | 'ok';

export interface DateFieldProps {
  /** `YYYY-MM-DD`, or `''` for none. */
  value: string;
  /** A complete, real date as `YYYY-MM-DD`, or `''` while it is not one yet. */
  onChange: (value: string) => void;
  /** The accessible name of the whole control — "Date of birth". */
  label: string;
  id?: string;
  /** Earliest and latest dates the CALENDAR offers (`YYYY-MM-DD`). Typing is not clamped. */
  min?: string;
  max?: string;
  /** The month the calendar opens on while the field is empty (`YYYY-MM-DD`). A
   *  birth-date field passes the day somebody turns 18, so the first view is the
   *  youngest valid month rather than today. */
  openAt?: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  /** Fill the width of its column instead of hugging its content. */
  block?: boolean;
  /** Called when focus leaves the whole control (segments, button and calendar). */
  onBlur?: (value: string, state: DateState) => void;
  /** Enter pressed in a segment — the form's Continue. */
  onEnter?: () => void;
  /** Ref to the first segment, for a form that has to put the cursor here. */
  inputRef?: Ref<HTMLInputElement>;
}

/* ───────────────────────────────────────────────────────────── date maths ── */

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const iso = (y: number, m: number, d: number) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** 0 = Monday … 6 = Sunday. */
const weekdayOf = (y: number, m: number, d: number) =>
  (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;

function parseIso(v: string): { y: number; m: number; d: number } | null {
  const hit = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!hit) return null;
  const y = Number(hit[1]);
  const m = Number(hit[2]);
  const d = Number(hit[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysIn(y, m)) return null;
  return { y, m, d };
}

/** Add `n` days to an ISO date, through UTC so a daylight-saving week cannot lose one. */
function addDays(v: string, n: number): string {
  const p = parseIso(v)!;
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Add `n` months, clamping the day (31 Jan + 1 month is 28/29 Feb, never 3 Mar). */
function addMonths(v: string, n: number): string {
  const p = parseIso(v)!;
  const total = p.y * 12 + (p.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return iso(y, m, Math.min(p.d, daysIn(y, m)));
}

const longDate = (v: string) => {
  const p = parseIso(v)!;
  return `${WEEKDAYS[weekdayOf(p.y, p.m, p.d)]} ${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
};

/* The three typed segments. Strings, not numbers: `07` and `7` are different
   states of a half-typed day, and `''` is a state of its own. */
interface Segs { d: string; m: string; y: string }

const split = (v: string): Segs => {
  const p = parseIso(v);
  return p ? { d: pad(p.d), m: pad(p.m), y: pad(p.y, 4) } : { d: '', m: '', y: '' };
};

function compose(s: Segs): string {
  if (s.y.length !== 4 || s.m.length === 0 || s.d.length === 0) return '';
  const y = Number(s.y);
  const m = Number(s.m);
  const d = Number(s.d);
  return parseIso(iso(y, m, d)) ? iso(y, m, d) : '';
}

function stateOf(s: Segs): DateState {
  if (!s.d && !s.m && !s.y) return 'empty';
  if (compose(s)) return 'ok';
  return s.y.length === 4 && s.m && s.d ? 'invalid' : 'incomplete';
}

/** A pasted `12/05/1990`, `12-05-1990`, `12.05.1990` or `1990-05-12`, read whole. */
function fromPaste(text: string): Segs | null {
  const t = text.trim();
  const ymd = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t);
  if (ymd) return { y: ymd[1], m: pad(Number(ymd[2])), d: pad(Number(ymd[3])) };
  const dmy = /^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{4})$/.exec(t);
  if (dmy) return { d: pad(Number(dmy[1])), m: pad(Number(dmy[2])), y: dmy[3] };
  return null;
}

/* ──────────────────────────────────────────────────────────────── icons ── */

const Cal = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);
const Prev = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
);
const Next = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
);

/* ──────────────────────────────────────────────────────────────── field ── */

export function DateField({
  value,
  onChange,
  label,
  id,
  min,
  max,
  openAt,
  invalid,
  describedBy,
  disabled,
  block,
  onBlur,
  onEnter,
  inputRef,
}: DateFieldProps) {
  const uid = useId();
  const base = id ?? `df-${uid}`;

  const [segs, setSegs] = useState<Segs>(() => split(value));
  /* The last ISO this field knew about. A `value` that differs AND is not what the
     segments already compose to came from OUTSIDE (a restored draft, a Clear) and
     overwrites them; one that matches is only the parent echoing a keystroke, and
     must not wipe a half-typed segment. Adjusted during render — the documented
     pattern — never in an effect. */
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    if (value !== compose(segs)) setSegs(split(value));
  }

  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);

  const emit = useCallback(
    (next: Segs) => {
      setSegs(next);
      const v = compose(next);
      setSynced(v);
      onChange(v);
    },
    [onChange],
  );

  /* The segments are found by POSITION from whichever one the event came from — no
     ref per segment to keep in step, and nothing read from a ref while rendering. */
  const focusSeg = (from: HTMLElement, i: number) => {
    const all = from.closest('.dfld')?.querySelectorAll<HTMLInputElement>('.dfld__n');
    const el = all?.[Math.max(0, Math.min(2, i))];
    el?.focus();
    el?.select();
  };

  const type = (k: keyof Segs, i: number, from: HTMLElement, raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, k === 'y' ? 4 : 2);
    const next = { ...segs, [k]: digits };
    let advance = false;
    if (k === 'd') {
      if (digits.length === 1 && Number(digits) > 3) { next.d = `0${digits}`; advance = true; }
      else if (digits.length === 2) advance = true;
    } else if (k === 'm') {
      if (digits.length === 1 && Number(digits) > 1) { next.m = `0${digits}`; advance = true; }
      else if (digits.length === 2) advance = true;
    }
    emit(next);
    if (advance) focusSeg(from, i + 1);
  };

  const step = (k: keyof Segs, dir: 1 | -1) => {
    const cur = Number(segs[k]) || 0;
    let n: number;
    if (k === 'd') n = cur + dir < 1 ? 31 : cur + dir > 31 ? 1 : cur + dir;
    else if (k === 'm') n = cur + dir < 1 ? 12 : cur + dir > 12 ? 1 : cur + dir;
    else n = (cur || new Date().getFullYear()) + dir;
    emit({ ...segs, [k]: pad(Math.max(k === 'y' ? 0 : 1, n), k === 'y' ? 4 : 2) });
  };

  const onKey = (k: keyof Segs, i: number) => (e: ReactKeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      step(k, e.key === 'ArrowUp' ? 1 : -1);
    } else if (e.key === 'ArrowLeft' && el.selectionStart === 0 && el.selectionEnd === 0 && i > 0) {
      e.preventDefault();
      focusSeg(el, i - 1);
    } else if (e.key === 'ArrowRight' && el.selectionStart === el.value.length && i < 2) {
      e.preventDefault();
      focusSeg(el, i + 1);
    } else if (e.key === 'Backspace' && el.value === '' && i > 0) {
      e.preventDefault();
      focusSeg(el, i - 1);
    } else if (['/', '.', '-', ' '].includes(e.key) && i < 2) {
      e.preventDefault();
      focusSeg(el, i + 1);
    } else if (e.key === 'Enter') {
      onEnter?.();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const whole = fromPaste(e.clipboardData.getData('text'));
    if (!whole) return;
    e.preventDefault();
    emit(whole);
  };

  /* Focus leaving the WHOLE control — a Tab from the year segment to the calendar
     button is not a blur, and neither is a click inside the calendar. */
  const onGroupBlur = (e: React.FocusEvent) => {
    const to = e.relatedTarget as Node | null;
    if (to && (wrap.current?.contains(to) || pop.current?.contains(to))) return;
    if (open) return;
    onBlur?.(compose(segs), stateOf(segs));
  };

  const pick = (v: string) => {
    emit(split(v));
    setOpen(false);
    trigger.current?.focus();
  };

  const closeCalendar = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  const shared = {
    inputMode: 'numeric' as const,
    autoComplete: 'off',
    disabled,
    'aria-invalid': invalid ? true : undefined,
    'aria-describedby': describedBy,
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select(),
    onPaste,
  };

  return (
    <div
      ref={wrap}
      className={`dfld${block ? ' dfld--block' : ''}`}
      role="group"
      aria-label={label}
      data-invalid={invalid ? '' : undefined}
      data-off={disabled ? '' : undefined}
      onBlur={onGroupBlur}
    >
      <input
        {...shared}
        id={base}
        ref={inputRef}
        className="dfld__n"
        value={segs.d}
        placeholder="DD"
        aria-label={`${label}, day`}
        onChange={(e) => type('d', 0, e.currentTarget, e.target.value)}
        onKeyDown={onKey('d', 0)}
      />
      <span className="dfld__s" aria-hidden="true">/</span>
      <input
        {...shared}
        className="dfld__n"
        value={segs.m}
        placeholder="MM"
        aria-label={`${label}, month`}
        onChange={(e) => type('m', 1, e.currentTarget, e.target.value)}
        onKeyDown={onKey('m', 1)}
      />
      <span className="dfld__s" aria-hidden="true">/</span>
      <input
        {...shared}
        className="dfld__n dfld__n--y"
        value={segs.y}
        placeholder="YYYY"
        aria-label={`${label}, year`}
        onChange={(e) => type('y', 2, e.currentTarget, e.target.value)}
        onKeyDown={onKey('y', 2)}
      />
      <button
        ref={trigger}
        type="button"
        className="dfld__b"
        disabled={disabled}
        aria-label={`Choose ${label.toLowerCase()} from a calendar`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Cal />
      </button>

      {open && (
        <Calendar
          anchor={trigger}
          popRef={pop}
          value={compose(segs)}
          min={min}
          max={max}
          openAt={openAt}
          onPick={pick}
          onClose={closeCalendar}
          onDismiss={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── calendar ── */

type View = 'days' | 'months' | 'years';

function Calendar({
  anchor,
  popRef,
  value,
  min,
  max,
  openAt,
  onPick,
  onClose,
  onDismiss,
}: {
  anchor: React.RefObject<HTMLButtonElement | null>;
  popRef: React.RefObject<HTMLDivElement | null>;
  value: string;
  min?: string;
  max?: string;
  openAt?: string;
  onPick: (v: string) => void;
  onClose: () => void;
  onDismiss: () => void;
}) {
  /* Where it opens: the field's own date, else the form's suggestion, else today —
     read once, lazily, so a render never calls the clock. */
  const [cursor, setCursor] = useState<string>(() => {
    if (parseIso(value)) return value;
    if (openAt && parseIso(openAt)) return openAt;
    const t = new Date();
    return iso(t.getFullYear(), t.getMonth() + 1, t.getDate());
  });
  const [today] = useState(() => {
    const t = new Date();
    return iso(t.getFullYear(), t.getMonth() + 1, t.getDate());
  });
  const [view, setView] = useState<View>('days');
  const [pos, setPos] = useState<{ x: number; y: number; up: boolean } | null>(null);
  const root = popRef;
  const heading = useId();

  const cur = parseIso(cursor)!;
  const inRange = useCallback(
    (v: string) => (!min || v >= min) && (!max || v <= max),
    [min, max],
  );
  /* A month or a year is offered if ANY day in it is. */
  const monthOk = (y: number, m: number) =>
    inRange(iso(y, m, 1)) || inRange(iso(y, m, daysIn(y, m))) ||
    ((!min || iso(y, m, daysIn(y, m)) >= min) && (!max || iso(y, m, 1) <= max));
  const yearOk = (y: number) =>
    (!min || iso(y, 12, 31) >= min) && (!max || iso(y, 1, 1) <= max);

  /* Placement on a desk: under the button, flipped above when there is no room, and
     kept inside the window. On a phone CSS takes it over as a bottom sheet and these
     custom properties are simply not read. */
  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      if (!a) return;
      const w = 296;
      const h = root.current?.offsetHeight ?? 340;
      const x = Math.max(12, Math.min(a.right - w, window.innerWidth - w - 12));
      const below = a.bottom + 8;
      const up = below + h > window.innerHeight - 12 && a.top - 8 - h > 12;
      setPos({ x, y: up ? a.top - 8 - h : below, up });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, root, view]);

  /* Focus lands on the day to act on, and a press outside closes without stealing it
     back — somebody who clicked into the next field meant to be there. */
  /* Once, and only AFTER it has been placed: until then it is `visibility:hidden`,
     and a hidden element cannot take focus — so the first attempt, on mount, landed
     nowhere and left focus in the field behind it. */
  const placed = pos !== null;
  useEffect(() => {
    if (!placed) return;
    root.current?.querySelector<HTMLElement>('[data-roving="1"]')?.focus();
  }, [placed, root]);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (root.current?.contains(t) || anchor.current?.contains(t)) return;
      onDismiss();
    };
    document.addEventListener('pointerdown', down);
    return () => document.removeEventListener('pointerdown', down);
  }, [anchor, onDismiss, root]);

  /* The roving target moves when the view or the cursor does. A keyboard move can
     land on a day that was not in the old grid (a year back, say), so the button that
     HAD focus unmounts and focus falls to <body> — after which Escape and the arrows
     have nowhere to go. `byKey` says the move was ours, so focus follows it. */
  const byKey = useRef(false);
  useEffect(() => {
    const el = root.current?.querySelector<HTMLElement>('[data-roving="1"]');
    if (!el) return;
    if (byKey.current || root.current?.contains(document.activeElement)) {
      el.focus();
      byKey.current = false;
    }
  }, [view, cursor, root]);

  const go = (v: string) => setCursor(v);

  const onKeyDays = (e: ReactKeyboardEvent) => {
    const k = e.key;
    let next: string | null = null;
    if (k === 'ArrowLeft') next = addDays(cursor, -1);
    else if (k === 'ArrowRight') next = addDays(cursor, 1);
    else if (k === 'ArrowUp') next = addDays(cursor, -7);
    else if (k === 'ArrowDown') next = addDays(cursor, 7);
    else if (k === 'PageUp') next = addMonths(cursor, e.shiftKey ? -12 : -1);
    else if (k === 'PageDown') next = addMonths(cursor, e.shiftKey ? 12 : 1);
    else if (k === 'Home') next = addDays(cursor, -weekdayOf(cur.y, cur.m, cur.d));
    else if (k === 'End') next = addDays(cursor, 6 - weekdayOf(cur.y, cur.m, cur.d));
    if (next) {
      e.preventDefault();
      byKey.current = true;
      go(next);
    } else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      if (inRange(cursor)) onPick(cursor);
    }
  };

  const gridKeys = (cols: number, count: number, idx: number, to: (i: number) => void) =>
    (e: ReactKeyboardEvent) => {
      const k = e.key;
      const d = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : k === 'ArrowUp' ? -cols : k === 'ArrowDown' ? cols : 0;
      if (!d) return;
      e.preventDefault();
      const n = idx + d;
      if (n >= 0 && n < count) {
        byKey.current = true;
        to(n);
      }
    };

  /* A dialog keeps Tab inside itself, and Escape closes only THIS — never the form
     dialog it was opened from (`stopPropagation` ends it at React's root, below the
     `document` listener the Add client drawer uses). */
  const onRootKey = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !root.current) return;
    const items = [...root.current.querySelectorAll<HTMLElement>('button:not([disabled])')].filter(
      (el) => el.tabIndex !== -1 || el.dataset.roving === '1',
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  /* ── the three bodies ── */

  const monthDays = useMemo(() => {
    const lead = weekdayOf(cur.y, cur.m, 1);
    const start = addDays(iso(cur.y, cur.m, 1), -lead);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [cur.y, cur.m]);

  const pageStart = Math.floor(cur.y / 12) * 12;

  const title =
    view === 'days' ? `${MONTHS[cur.m - 1]} ${cur.y}`
    : view === 'months' ? String(cur.y)
    : `${pageStart}–${pageStart + 11}`;

  const prevLabel = view === 'days' ? 'Previous month' : view === 'months' ? 'Previous year' : 'Previous 12 years';
  const nextLabel = view === 'days' ? 'Next month' : view === 'months' ? 'Next year' : 'Next 12 years';
  const shift = (dir: 1 | -1) => {
    if (view === 'days') go(addMonths(cursor, dir));
    else if (view === 'months') go(addMonths(cursor, dir * 12));
    else go(addMonths(cursor, dir * 144));
  };
  const prevOff = view === 'days' ? !monthOk(...(prevMonth(cur.y, cur.m)))
    : view === 'months' ? !yearOk(cur.y - 1) : !yearOk(pageStart - 1);
  const nextOff = view === 'days' ? !monthOk(...(nextMonth(cur.y, cur.m)))
    : view === 'months' ? !yearOk(cur.y + 1) : !yearOk(pageStart + 12);

  return createPortal(
    <>
      <div className="dpop__scrim" aria-hidden="true" onPointerDown={onDismiss} />
      <div
        ref={root}
        className="dpop"
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
        data-popup=""
        data-up={pos?.up ? '' : undefined}
        style={pos ? ({ '--dpop-x': `${pos.x}px`, '--dpop-y': `${pos.y}px` } as React.CSSProperties) : { visibility: 'hidden' }}
        onKeyDown={onRootKey}
      >
        <div className="dpop__hd">
          <button type="button" className="dpop__nav" aria-label={prevLabel} disabled={prevOff} onClick={() => shift(-1)}>
            <Prev />
          </button>
          <button
            type="button"
            id={heading}
            className="dpop__t"
            aria-live="polite"
            aria-label={`${title}. ${view === 'days' ? 'Choose a year or month' : view === 'months' ? 'Choose a year' : 'Choose a year'}`}
            onClick={() => setView((v) => (v === 'days' ? 'years' : v === 'months' ? 'years' : 'days'))}
          >
            {title}
          </button>
          <button type="button" className="dpop__nav" aria-label={nextLabel} disabled={nextOff} onClick={() => shift(1)}>
            <Next />
          </button>
        </div>

        {view === 'days' && (
          <div role="grid" aria-label={`${MONTHS[cur.m - 1]} ${cur.y}`} onKeyDown={onKeyDays}>
            <div className="dpop__wk" role="row">
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d, i) => (
                <span key={d} role="columnheader" aria-label={WEEKDAYS[i]}>{d}</span>
              ))}
            </div>
            <div className="dpop__g">
              {monthDays.map((v) => {
                const p = parseIso(v)!;
                const out = p.m !== cur.m;
                const ok = inRange(v);
                const sel = v === value;
                return (
                  <button
                    key={v}
                    type="button"
                    role="gridcell"
                    className="dpop__d"
                    tabIndex={v === cursor ? 0 : -1}
                    data-roving={v === cursor ? '1' : undefined}
                    data-out={out ? '' : undefined}
                    data-today={v === today ? '' : undefined}
                    aria-selected={sel}
                    aria-disabled={!ok || undefined}
                    aria-label={longDate(v)}
                    onClick={() => { if (ok) onPick(v); else go(v); }}
                    onFocus={() => { if (v !== cursor) go(v); }}
                  >
                    {p.d}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {view === 'months' && (
          <div className="dpop__p" role="grid" aria-label={`Months of ${cur.y}`}>
            {MONTHS_SHORT.map((m, i) => {
              const ok = monthOk(cur.y, i + 1);
              return (
                <button
                  key={m}
                  type="button"
                  className="dpop__c"
                  role="gridcell"
                  tabIndex={i + 1 === cur.m ? 0 : -1}
                  data-roving={i + 1 === cur.m ? '1' : undefined}
                  aria-selected={value ? parseIso(value)!.y === cur.y && parseIso(value)!.m === i + 1 : false}
                  aria-disabled={!ok || undefined}
                  aria-label={`${MONTHS[i]} ${cur.y}`}
                  onKeyDown={gridKeys(4, 12, i, (n) => go(iso(cur.y, n + 1, Math.min(cur.d, daysIn(cur.y, n + 1)))))}
                  onClick={() => { if (!ok) return; go(iso(cur.y, i + 1, Math.min(cur.d, daysIn(cur.y, i + 1)))); setView('days'); }}
                >
                  {m}
                </button>
              );
            })}
          </div>
        )}

        {view === 'years' && (
          <div className="dpop__p" role="grid" aria-label={`Years ${pageStart} to ${pageStart + 11}`}>
            {Array.from({ length: 12 }, (_, i) => pageStart + i).map((y, i) => {
              const ok = yearOk(y);
              return (
                <button
                  key={y}
                  type="button"
                  className="dpop__c"
                  role="gridcell"
                  tabIndex={y === cur.y ? 0 : -1}
                  data-roving={y === cur.y ? '1' : undefined}
                  data-today={y === Number(today.slice(0, 4)) ? '' : undefined}
                  aria-selected={value ? parseIso(value)!.y === y : false}
                  aria-disabled={!ok || undefined}
                  onKeyDown={gridKeys(4, 12, i, (n) => go(iso(pageStart + n, cur.m, Math.min(cur.d, daysIn(pageStart + n, cur.m)))))}
                  onClick={() => { if (!ok) return; go(iso(y, cur.m, Math.min(cur.d, daysIn(y, cur.m)))); setView('months'); }}
                >
                  {y}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}

function prevMonth(y: number, m: number): [number, number] {
  return m === 1 ? [y - 1, 12] : [y, m - 1];
}
function nextMonth(y: number, m: number): [number, number] {
  return m === 12 ? [y + 1, 1] : [y, m + 1];
}
