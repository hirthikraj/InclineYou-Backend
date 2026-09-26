import type { CSSProperties, ReactNode } from 'react';

/**
 * A ROW OF FIGURES UNDER ONE BORDER — three to five, hairline between them.
 *
 * `.strip` has been in `webapp.css` since the design set was drawn and had **no
 * component at all**. Five screens hand-wrote its markup — the roster's focus
 * tiles, the client file's header, the session view (twice), the console's Top
 * sets and the console itself — which is the exact drift the catalogue exists
 * to stop, and it had already happened: the same `8/20` figure was written
 * `<span className="ink3" style={{ fontSize: 14 }}>` on two screens and
 * `<span className="ink3">` on a third, so one denominator rendered at two
 * sizes in one product with no stylesheet able to catch it.
 *
 * ── AND IT IS NOT `Stat`, `Figures` OR `KeyValue` ───────────────────────────
 *
 * Checked before writing, which is the order `registry.ts` asks for.
 * `c-stat` is one figure on its own ground and a row of them is a dashboard —
 * four independent questions, four boxes. `c-figures` is three numbers on the
 * canvas with no container at all, deliberately, and its own docstring says
 * so: it is what a page ENDS with. This is the band directly under a page
 * header or above a table, bounded, saying four facts about **one** object —
 * one session, one client, one roster view — and the border is what makes it
 * read as one statement rather than four.
 *
 * ── THE DENOMINATOR AND THE UNIT ARE DIFFERENT THINGS ───────────────────────
 *
 * `of` is the other half of a ratio (`8/20`) and `unit` is what the figure is
 * measured in (`349 min`). They were the same grey span at the call-sites and
 * they are not the same fact: a denominator is a second number and takes the
 * figure's own face a step down, a unit is a word. Both are classes now, so
 * neither can arrive at a sixth call-site a third size.
 */
export function Strip({
  /**
   * MORE THAN FOUR TILES, WHICH THE BASE ROW CANNOT HOLD — `.strip--wrap`.
   *
   * `.strip>div{flex:1}` and no wrap is right for the three or four every
   * existing call-site has. The progress report has SIX, and the stylesheet's
   * entry carries what that measured: at six tiles in a 600px column each gets
   * 100px, `OF WHAT WE BOOKED` is 118px, and the labels ran to three lines
   * while the row grew to 78px tall to hold a caption nobody reads twice.
   *
   * Wrapped, a tile either holds its label on one line or moves to the next
   * row. Set it at five tiles and above.
   */
  wrap,
  className,
  style,
  children,
}: {
  wrap?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div
      className={['strip', wrap ? 'strip--wrap' : null, className].filter(Boolean).join(' ')}
      style={style}
    >
      {children}
    </div>
  );
}

/** The tones `.strip` already carried, as a prop rather than a bare class. */
export type StripTone = 'warn' | 'ok' | 'danger';

export function StripCell({
  value,
  of,
  unit,
  label,
  tone,
  className,
}: {
  /** A node: the session view puts a mode glyph beside the word. */
  value: ReactNode;
  /** The other half of a ratio — `8`**`/20`**. */
  of?: ReactNode;
  /** What the figure is measured in — `349`**` min`**. */
  unit?: ReactNode;
  label: ReactNode;
  tone?: StripTone;
  className?: string;
}) {
  return (
    <div className={[tone, className].filter(Boolean).join(' ') || undefined}>
      <b>
        {value}
        {of != null ? <span className="strip__of">/{of}</span> : null}
        {unit != null ? <span className="strip__u">{unit}</span> : null}
      </b>
      <i>{label}</i>
    </div>
  );
}

/**
 * The same cell as a FILTER — `.strip--pick` on the strip, and every cell a
 * `<button>`. The roster's focus tiles are the call-site: a figure that is
 * also the control that narrows the list to the rows it counts.
 *
 * `aria-pressed` and not `aria-current`: these are toggles over one list, not
 * places, and a disabled zero is a count that is true and has nothing behind
 * it.
 */
export function StripChoice({
  value,
  of,
  unit,
  label,
  tone,
  /* Defaulted to `false` rather than left undefined, which React drops
     entirely: an unpressed toggle with no `aria-pressed` at all is announced
     as a plain button, so a screen reader user hears that one tile is a
     toggle and the three beside it are not. */
  pressed = false,
  disabled,
  onClick,
}: {
  value: ReactNode;
  of?: ReactNode;
  unit?: ReactNode;
  label: ReactNode;
  tone?: StripTone;
  pressed?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={tone}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      <b>
        {value}
        {of != null ? <span className="strip__of">/{of}</span> : null}
        {unit != null ? <span className="strip__u">{unit}</span> : null}
      </b>
      <i>{label}</i>
    </button>
  );
}

Strip.Cell = StripCell;
Strip.Choice = StripChoice;
