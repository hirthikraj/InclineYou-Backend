'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';

/**
 * THE FILTERS ON A LIST.
 *
 * What it replaces: `.seg` holding three `ui/Chip`s, every one of which drew
 * itself as a filled lime pill when pressed. Two problems, and the second is
 * the expensive one.
 *
 * 1 · The default state had all three pressed, so the screen opened with three
 *     lime plates in a row directly above the day. Lime is this product's
 *     action colour. Spending it on a filter that takes no action leaves
 *     nothing louder for the verb that does, and the primary button four
 *     inches up the page is the same lime.
 * 2 · "Done 7" was one of them. A count of work already finished is the least
 *     urgent number on the screen and it was rendered in the loudest colour
 *     the system has.
 *
 * So selected is an INK plate here (`--tx-ink` ground, `--tx-surface` label),
 * which is unambiguous, passes AA in both themes by construction because the
 * two tokens are each other's opposite, and leaves the lime to the verbs.
 *
 * ── TWO GRAMMARS, ONE CONTROL ───────────────────────────────────────────────
 *
 * `mode="toggle"` is what this was: `aria-pressed` on each pill, more than one
 * on at once, and the group is a `role="group"`. `/today`'s agenda filters.
 *
 * `mode="single"` was added on 19 Sep 2026 for the client file's session
 * history, where the choice is **one of five**. That screen had already been
 * through this argument in the other direction: it drew six filter chips, they
 * were replaced by a `<select>`, and the stated reason was right — *a row of
 * toggles that behaves as a radio group is a radio group drawn wrong*.
 *
 * What brought the row back is the COUNTS. The question a trainer opens that
 * tab with is "has this one been missing sessions", and the answer is a number
 * per outcome. A `<select>` cannot show five numbers at once: you have to open
 * it to find out that *Missed* would yield three, which is the whole answer,
 * and a native `<option>` is a bad place to set a figure anyway. On the face of
 * five pills the counts are read without touching the control at all.
 *
 * So the objection is answered rather than re-committed. In `single` the group
 * is a `role="radiogroup"`, each pill is a `role="radio"` with `aria-checked`,
 * and the keyboard behaves the way a radio group must — which is the part that
 * makes this a real fix and not the same mistake with a different attribute.
 *
 * ── THE ARROW KEYS ARE NOT OPTIONAL ─────────────────────────────────────────
 *
 * A radio group is ONE tab stop. Tab enters it at the checked option, the
 * arrows move between options and check as they go, Home and End reach the
 * ends. Five separate tab stops with `aria-checked` on them is a radio group
 * drawn wrong in the opposite direction from the one this replaced, so the
 * roving `tabindex` and the key handler live here rather than at the call-site:
 * every screen that reaches for `single` gets the behaviour with the role.
 *
 * The handler drives the buttons through `.click()` rather than through a
 * callback, so the group needs to know nothing about what its children do —
 * whatever `onClick` a `SegmentButton` was given is what runs, exactly as if
 * it had been pressed.
 */
export type SegmentMode = 'toggle' | 'single';

export function Segment({
  label,
  mode = 'toggle',
  children,
}: {
  label: string;
  /** `toggle` — several on at once. `single` — one of a set. See above. */
  mode?: SegmentMode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (mode !== 'single' || !ref.current) return;
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const options = [...ref.current.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    if (options.length === 0) return;
    const from = options.indexOf(document.activeElement as HTMLButtonElement);
    /* A group entered with nothing focused starts at the checked option, which
       is where Tab would have put the caret. */
    const here = from === -1 ? options.findIndex((o) => o.getAttribute('aria-checked') === 'true') : from;
    const last = options.length - 1;
    let next: number;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = here >= last ? 0 : here + 1;
    else next = here <= 0 ? last : here - 1;
    e.preventDefault();
    options[next].focus();
    options[next].click();
  }

  return (
    <div
      ref={ref}
      className="seg"
      role={mode === 'single' ? 'radiogroup' : 'group'}
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}

export function SegmentButton({
  pressed,
  onClick,
  mode = 'toggle',
  count,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  /** Must match the `Segment` it is in. See the two-grammar note above. */
  mode?: SegmentMode;
  /** Set tabular so the pills do not change width as the day is delivered and
      the counts roll over from one digit to two. */
  count?: number;
  children: ReactNode;
}) {
  const single = mode === 'single';
  return (
    <button
      className="seg__b"
      type="button"
      /* One attribute or the other, never both: a node carrying `aria-pressed`
         and `aria-checked` at once is announced twice and the two can disagree
         the moment a call-site sets only one of them. */
      role={single ? 'radio' : undefined}
      aria-checked={single ? pressed : undefined}
      aria-pressed={single ? undefined : pressed}
      /* The roving tab stop. Only the checked option is reachable by Tab; the
         arrows reach the rest. */
      tabIndex={single ? (pressed ? 0 : -1) : undefined}
      onClick={onClick}
    >
      {children}
      {count !== undefined && <span className="seg__n">{count}</span>}
    </button>
  );
}
