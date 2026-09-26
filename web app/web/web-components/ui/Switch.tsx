'use client';

/**
 * Switch — a setting that takes effect the moment it moves.
 *
 * That is the whole boundary with `Checkbox`: a checkbox is a value collected
 * and then saved with everything else on the form; a switch has already saved by
 * the time the thumb lands. If there is a Save button underneath it, it was a
 * checkbox.
 *
 * `<button role="switch">` — which is what the product already does in
 * `components/log/Finish.tsx`. The design file draws a `<span>` with the role,
 * and a span is not focusable and does not fire on Space.
 *
 * `label` is required and is the accessible name. A switch sitting in the right
 * half of a `.kv` row has its words in the left half, and nothing in the DOM
 * connects the two — so a reader announces "switch, on" with no subject.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange?: (next: boolean) => void;
  /** What the switch turns on, as a phrase: "Session reminders to clients". */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={['switch', className].filter(Boolean).join(' ')}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange ? () => onChange(!checked) : undefined}
    />
  );
}

/**
 * The same control with its label INSIDE it — the row is the button.
 *
 * ── WHY THIS IS A PART OF `c-switch` AND NOT A SECOND COMPONENT ─────────────
 *
 * `AGENTS.md`: *a BEM family is ONE component with parts.* `.swrow` draws the
 * same track, in the same two states, with the same meaning; what differs is how
 * much of the screen answers a press. A second component would be a second place
 * for the checked state to be drawn and a second chance for the two to drift.
 *
 * ── AND THE TRACK IS DECORATION HERE, WHICH IS THE WHOLE TRICK ──────────────
 *
 * A `<label for>` cannot wire a caption to this control: that attaches to a form
 * control and a switch is a `<button role="switch">`. So the row is the button,
 * the track is a `<span>` with `pointer-events:none`, and the accessible name is
 * the row's own drawn text — no `aria-label`, because a label naming a string
 * that is already on screen is a second copy to keep in step.
 *
 * MEASURED on `/me/account/settings` at 390px: six switches, each a 46x30 target
 * at the end of a 324px row whose other 278px did nothing. The row form makes the
 * target the card's full width and 46px tall.
 *
 * `example` is the line under the title — what the notification actually is. It
 * is part of the button's name, deliberately: *Session reminders, the evening
 * before, once* is what a client is agreeing to, and the second half is the part
 * that answers *how often*.
 */
export function SwitchRow({
  checked,
  onChange,
  title,
  example,
  disabled,
  className,
}: {
  checked: boolean;
  onChange?: (next: boolean) => void;
  title: string;
  example?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={['swrow', className].filter(Boolean).join(' ')}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange ? () => onChange(!checked) : undefined}
    >
      <span className="swrow__b">
        {/* A `<span>` and not an `<h3>`, which is the one thing this form gives
            up. Flow content inside a `<button>` is repaired by the parser — the
            same rule `.mkp__l` carries — and a heading inside a control is not
            a heading a reader can navigate to anyway: it is the control's name.
            The four stops the old markup gave a screen reader are replaced by
            four switches that announce their own label, which is the better
            trade on a card whose rows are all controls. */}
        <span className="swrow__t">{title}</span>
        {example ? <span className="swrow__x">{example}</span> : null}
      </span>
      {/* `aria-hidden`: the row already carries the name and the state. */}
      <span className="switch" aria-hidden="true" />
    </button>
  );
}
