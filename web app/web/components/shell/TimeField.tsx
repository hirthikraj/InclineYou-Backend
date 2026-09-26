'use client';

import { useState } from 'react';

/**
 * A TIME OF DAY, IN THE TWELVE-HOUR CLOCK THE REST OF THE APP NOW SPEAKS.
 *
 * ── WHY THIS EXISTS, WHEN `<input type="time">` ALREADY DID ─────────────────
 *
 * It did, and the comment this file replaces made the right argument for it: a
 * browser already has a time control that handles the keyboard, raises a wheel
 * on a phone, and cannot produce `25:70`. Reimplementing it is reimplementing
 * something every trainer already knows.
 *
 * One clause of that argument turned out to be false. It said the native
 * control "speaks the platform's own locale" — it does, and the platform is not
 * the audience. `formatMinute` and every label on the schedule now read
 * `7:00 AM`; the native field beside them rendered `07:00`, because Chrome
 * formats a time input from its own UI language and nothing on the page can
 * reach it. MEASURED: `lang="en-IN"` on the input, and again on the document,
 * changed nothing — the setting is the browser's, not the document's.
 *
 * So the field that could not be made to agree with the app is the one thing
 * replaced. Everything the native control was carrying is kept below, on
 * purpose and by name.
 *
 * ── WHAT IT KEEPS, AND HOW ──────────────────────────────────────────────────
 *
 * THREE REAL FORM CONTROLS, not three `<span role="spinbutton">`s. This is the
 * decision the whole component turns on. A styled span cannot raise a soft
 * keyboard, so a spinbutton field is a field a phone can focus and not type
 * into — and the phone is where the native control was strongest. Two
 * `<input inputMode="numeric">` and a `<select>` get the numeric keypad, the
 * iOS/Android select wheel, and the platform's own focus behaviour for free.
 *
 * TAB MOVES BETWEEN SEGMENTS, which is exactly what Chrome's own time input
 * does — hour, minute, meridiem, three stops. A roving tabindex would make the
 * field one stop and read better in a tab count, and it would also mean
 * hijacking ArrowLeft/ArrowRight from three controls where those keys already
 * move a caret the user can see. The composite-widget pattern is for widgets
 * that are not already made of focusable controls.
 *
 * THE MERIDIEM IS A `<select>` and not a two-state toggle button. It is a
 * choice between two values, which is what a select is; it announces as one,
 * takes `a` and `p` as type-ahead without a line of code here, and opens as a
 * native wheel on a phone. A button would have to invent all three.
 *
 * ── AND WHAT IT ADDS, WHICH IS THE TYPING ───────────────────────────────────
 *
 * Entry auto-advances the moment a segment cannot mean anything else — `7`
 * jumps to the minute because no hour starts with 7, `1` waits because 1, 10,
 * 11 and 12 are all still open. Type `645a` and the field is set: four
 * keystrokes, no Tab.
 */

/** 12-hour parts of a minutes-since-midnight value. */
function parts(minute: number): { h12: number; min: number; pm: boolean } {
  const m = Math.max(0, Math.min(1439, Math.round(minute)));
  const h24 = Math.floor(m / 60);
  return { h12: h24 % 12 === 0 ? 12 : h24 % 12, min: m % 60, pm: h24 >= 12 };
}

/** …and back. `12 AM` is hour 0, `12 PM` is hour 12 — the only two that move. */
function toMinute(h12: number, min: number, pm: boolean): number {
  const h = (h12 % 12) + (pm ? 12 : 0);
  return h * 60 + min;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Which segment is being typed into, and which one holds focus. */
export type Seg = 'h' | 'm' | 'mer';

/**
 * Everything typing can change, as plain data.
 *
 * `pending` is the digits typed so far that do not yet make a value — the `1`
 * of a `12` that has not had its second digit yet. `at` is where focus sits.
 */
export interface Typing {
  h12: number;
  min: number;
  at: Seg;
  pending: string;
}

/**
 * ONE DIGIT, AS A PURE FUNCTION — AND THAT IS A BUG FIX, NOT A TIDY-UP.
 *
 * FOUND BY INSTRUMENTING THE HANDLER. This logic used to live in a closure that
 * read the buffer from React state and called `setBuf` per character, and the
 * input handler ran it in a loop:
 *
 *     for (const ch of ev.data) digit(which, ch);
 *
 * Every iteration reads the SAME captured buffer, because state does not update
 * until the next render. So two digits arriving in one event — a paste, an IME
 * commit, an autofill, or simply two keystrokes the browser delivered as one
 * insertion — each saw an empty buffer and overwrote the one before it. `45`
 * came out as `04`, `4` or `5` depending on how the keystrokes happened to be
 * grouped, which is exactly the kind of bug that looks intermittent and is not.
 *
 * Made pure and folded over the whole string, it cannot happen: each digit sees
 * the state the digit before it produced, and React is told once at the end. It
 * is also now testable without a browser, which is how the boundaries below
 * were checked rather than argued about.
 *
 * THE BOUNDARIES. An hour auto-advances the moment it can only mean one thing:
 * `2`–`9` immediately, while `0` and `1` wait, because `1` is both a legal hour
 * and the start of 10, 11 and 12. A pair that is not an hour at all — `13`,
 * `00` — is not rejected with a beep; the second digit starts a new number,
 * which is what someone typing a correction means by it. The minute is the same
 * shape with the boundary at 6, and a second digit always completes it.
 */
export function feedDigit(st: Typing, d: string): Typing {
  const next = st.pending + d;
  const n = Number(next);

  if (st.at === 'h') {
    if (next.length === 1) {
      return n >= 2
        ? { ...st, h12: n, pending: '', at: 'm' }
        : { ...st, pending: next };
    }
    if (n >= 1 && n <= 12) return { ...st, h12: n, pending: '', at: 'm' };
    // Not an hour. Start again from the digit just typed.
    return Number(d) >= 2
      ? { ...st, h12: Number(d), pending: '', at: 'm' }
      : { ...st, pending: d };
  }

  if (st.at === 'm') {
    if (next.length === 1) {
      return n >= 6
        ? { ...st, min: n, pending: '', at: 'mer' }
        : { ...st, pending: next };
    }
    return { ...st, min: Math.min(59, n), pending: '', at: 'mer' };
  }

  return st;
}

export interface TimeFieldProps {
  /**
   * What this time IS — `Starts`, `Window 2 ends`. It names the GROUP when
   * there is no visible label to point at, and it always prefixes the three
   * segment names, so a screen reader says "Starts, hour" rather than the
   * "Time, hour" that a caller supplying only `labelledBy` used to get.
   */
  label?: string;
  /**
   * id of a visible label to name the group with instead. Pass `label` as well
   * — this one only reaches the group, and the segments inside it still need
   * to say which time they belong to.
   */
  labelledBy?: string;
  /** Minutes since midnight. */
  value: number;
  onChange: (minute: number) => void;
  disabled?: boolean;
  /**
   * What ArrowUp/ArrowDown moves the minute by. The schedule passes
   * `SNAP_MINUTES`, so the arrows land on the same quarter-hours the grid snaps
   * a drag to. Typing is never restricted to it: `result.ts` reasons in whole
   * minutes and a trainer who books at 07:23 means 07:23.
   */
  step?: number;
  className?: string;
}

export function TimeField({
  label, labelledBy, value, onChange, disabled, step = 5, className,
}: TimeFieldProps) {
  const { h12, min, pm } = parts(value);

  /*
   * The digits typed so far, tagged with the segment they belong to.
   *
   * Tagged, and not a bare string, because this renders into `value` twice — an
   * untagged buffer would show a half-typed `4` from the minute in the HOUR box
   * as well, since both would read the same state.
   *
   * ── AND IT IS NOT READ OFF THE INPUT, WHICH WAS THE FIRST BUG ────────────
   *
   * FOUND BY TYPING `45` INTO THE MINUTE AND GETTING `04`. The first version
   * read `e.target.value` and took its last two digits, which is correct only
   * if the caret is where you think it is. It is not: focusing the next segment
   * selects it, React then re-renders the controlled input and puts the caret
   * back at the END of the text, and the selection is gone before the digit
   * lands. So `4` typed into a segment showing `00` appended instead of
   * replacing — `004`, last two digits `04`, four minutes past.
   *
   * The DOM value is a function of caret state, selection state and React's
   * reconciliation, and this field should have an opinion about none of the
   * three. So it stops asking: `onBeforeInput` reports the characters about to
   * be inserted, the insertion is cancelled, and this is the only record of
   * what was typed — identical whether the caret sat at the start, the end, or
   * over a selection.
   *
   * `beforeinput` and not `keydown` because of the phone: an Android soft
   * keyboard reports `key` as `Unidentified` on a great many builds, and this
   * field exists to be typed into on a phone as much as at a desk. It is also
   * what makes a paste and an IME commit arrive down the same path as a
   * keypress rather than each needing their own.
   */
  const [buf, setBuf] = useState<{ seg: 'h' | 'm'; text: string } | null>(null);

  /** What a segment shows: its own pending digits, else the committed value. */
  const shown = (seg: 'h' | 'm', committed: number) =>
    (buf && buf.seg === seg ? buf.text : pad(committed));

  const set = (h: number, mm: number, p: boolean) => onChange(toMinute(h, mm, p));

  /*
   * Move focus to another segment.
   *
   * FOUND BY TYPING `645a` AND GETTING `6:04 AM`: the advance was `select()` on
   * its own, on the assumption that selecting an input's text focuses it. It
   * does not — `select()` sets the selection and nothing else — so the hour
   * committed, focus fell back to the panel behind the field, and the `45` went
   * nowhere. Typing the hour made the two segments after it unreachable.
   *
   * ── FOUND BY `data-seg`, NOT HELD IN A REF ───────────────────────────────
   *
   * Two `useRef`s read cleanly here and `react-hooks/refs` could not tell:
   * `onBeforeInput` is curried and the analyser loses the thread between the
   * handler and the ref, reporting a ref read during render. It is wrong about
   * the render and right that the refs were not earning their keep — these are
   * siblings in a fixed order inside a root this component owns, which is what
   * a DOM query is for.
   *
   * `select()` after the `focus()` is cosmetic now that the buffer no longer
   * depends on it: a segment you have just been sent to should look like it is
   * about to be overwritten.
   */
  const focusSeg = (from: HTMLElement, seg: Seg) => {
    const el = from.closest('.tfld')?.querySelector<HTMLElement>(`[data-seg="${seg}"]`);
    if (!el) return;
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
  };

  /** Arrow stepping. Wraps within the segment and never carries into its
   *  neighbour — 59 + 5 is 04, not the next hour. That is the native control's
   *  behaviour and the useful one: a trainer nudging minutes has already chosen
   *  the hour. */
  const bump = (which: 'h' | 'm', delta: number) => {
    setBuf(null);
    if (which === 'h') set(((h12 - 1 + delta + 12) % 12) + 1, min, pm);
    else set(h12, (((min + delta * step) % 60) + 60) % 60, pm);
  };

  const onKey = (which: 'h' | 'm') => (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); bump(which, 1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); bump(which, -1); }
    else if (e.key === 'Home') {
      e.preventDefault(); setBuf(null);
      if (which === 'h') set(12, min, pm); else set(h12, 0, pm);
    } else if (e.key === 'End') {
      e.preventDefault(); setBuf(null);
      if (which === 'h') set(11, min, pm); else set(h12, 59, pm);
    }
  };

  /*
   * Every typed character, folded in ONE pass.
   *
   * The insertion is always cancelled — what the box shows is the buffer or the
   * committed value, never something the browser put there behind this
   * component's back — and React is told once, after the whole string has been
   * consumed. See `feedDigit` for why the loop must not read state as it goes.
   */
  const onInput = (which: 'h' | 'm') => (e: React.FormEvent<HTMLInputElement>) => {
    e.preventDefault();
    const from = e.currentTarget;
    const ev = e.nativeEvent as InputEvent;
    /* MEASURED: React polyfills `onBeforeInput` from the legacy `textInput`
       event in Chrome, and `textInput` fires only for INSERTIONS — so this
       guard does not run today and a Backspace never reaches here. Deleting is
       handled instead by `onChange` below, which drops the buffer and puts the
       committed value back, and that is the behaviour a cleared segment wants
       anyway. The guard stays because it costs a line and is the correct
       reading wherever a real `beforeinput` is delivered. */
    if (ev.inputType?.startsWith('delete')) { setBuf(null); return; }

    const digits = (ev.data ?? '').replace(/[^0-9]/g, '');
    if (!digits) return;

    let st: Typing = {
      h12, min, at: which, pending: buf && buf.seg === which ? buf.text : '',
    };
    for (const d of digits) st = feedDigit(st, d);

    if (st.h12 !== h12 || st.min !== min) set(st.h12, st.min, pm);
    setBuf(st.pending && st.at !== 'mer' ? { seg: st.at as 'h' | 'm', text: st.pending } : null);
    if (st.at !== which) focusSeg(from, st.at);
  };

  /*
   * Leaving a segment settles it. A buffer holding a legal value is committed —
   * typing `1` and tabbing away means one o'clock — and anything else is
   * dropped, which puts the committed value back on screen rather than leaving
   * a box that looks like an answer and is not one.
   */
  const settle = (which: 'h' | 'm') => () => {
    const d = buf && buf.seg === which ? buf.text : '';
    setBuf(null);
    if (d === '') return;
    const n = Number(d);
    if (which === 'h') { if (n >= 1 && n <= 12) set(n, min, pm); }
    else set(h12, Math.min(59, n), pm);
  };

  /* The buffer belongs to whichever segment has focus, so arriving at one
     starts it empty — otherwise a `1` left behind in the hour would combine
     with the first digit typed in the minute. */
  const onSegFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setBuf(null);
    e.target.select();
  };

  return (
    /*
     * `role="group"` and not a bare div: three controls that together answer ONE
     * question need a name for the question, or a screen reader announces
     * "hour, edit" with nothing saying which time on the screen is being edited.
     */
    <div
      className={`tfld${disabled ? ' tfld--off' : ''}${className ? ` ${className}` : ''}`}
      role="group"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
    >
      <input
        className="tfld__n"
        // `text` with a numeric keypad, not `number`: a number input brings its
        // own spinner, its own scroll-wheel-changes-the-value surprise, and
        // strips the leading zero this field pads with.
        type="text"
        inputMode="numeric"
        autoComplete="off"
        data-seg="h"
        disabled={disabled}
        aria-label={`${label ?? 'Time'}, hour`}
        value={shown('h', h12)}
        onBeforeInput={onInput('h')}
        // Every insertion is cancelled above, so this runs for the edits
        // `beforeinput` does NOT deliver — a Backspace above all, since React's
        // `textInput` polyfill is insert-only. Dropping the buffer restores the
        // committed value, which is what clearing a segment should show: the
        // time that is still set, not an empty box that looks like an answer.
        onChange={() => setBuf(null)}
        onKeyDown={onKey('h')}
        onFocus={onSegFocus}
        onBlur={settle('h')}
      />
      <b className="tfld__c" aria-hidden="true">:</b>
      <input
        className="tfld__n"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        data-seg="m"
        disabled={disabled}
        aria-label={`${label ?? 'Time'}, minute`}
        value={shown('m', min)}
        onBeforeInput={onInput('m')}
        onChange={() => setBuf(null)}
        onKeyDown={onKey('m')}
        onFocus={onSegFocus}
        onBlur={settle('m')}
      />
      <select
        className="tfld__m"
        data-seg="mer"
        disabled={disabled}
        aria-label={`${label ?? 'Time'}, morning or afternoon`}
        value={pm ? 'PM' : 'AM'}
        onChange={(e) => set(h12, min, e.target.value === 'PM')}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
