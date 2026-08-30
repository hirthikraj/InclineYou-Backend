import { Glyph } from '@/components/shell/Icons';

/**
 * The five glyphs this screen needs that the shell's set does not carry, copied
 * verbatim from `gen_schedule.py`'s own constants.
 *
 * Verbatim for the reason `components/shell/Icons.tsx` opens with: an icon that
 * shifts by a pixel between two files is a diff nobody can read. They live here
 * rather than in the shell's file because nothing in the navigation rail needs a
 * fold arrow or a screen, and the shell's set is loaded on every screen there is.
 */

type IconProps = { size?: number };

/** `I_CHEVL` — the toolbar's *previous*. The shell has only the right-facing one. */
export const ChevronLeft = ({ size }: IconProps) => (
  <Glyph size={size} d="M15 6l-6 6 6 6" />
);

/** `I_REMOTE` — a screen with a stand. The delivery axis's second value. */
export const Remote = ({ size }: IconProps) => (
  <Glyph size={size}>
    <rect x="2.5" y="4.5" width="19" height="12" rx="2" />
    <path d="M8 20h8" />
  </Glyph>
);

/** `I_UNFOLD` — two arrows apart: this band will open. */
export const Unfold = ({ size }: IconProps) => (
  <Glyph size={size} d="M8 7l4-4 4 4M8 17l4 4 4-4" />
);

/** `I_FOLD` — two arrows together: this band will close. */
export const Fold = ({ size }: IconProps) => (
  <Glyph size={size} d="M4 9l8-5 8 5M4 15l8 5 8-5" />
);

/** `I_DOTSH` — the row's overflow. */
export const Dots = ({ size }: IconProps) => (
  <Glyph size={size}>
    <circle cx="12" cy="5.5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="18.5" r="1.4" fill="currentColor" stroke="none" />
  </Glyph>
);

/**
 * `I_WARN` — the clash, the no-show and the held-open band.
 *
 * The shell exports a `Warn` already, and this is deliberately NOT it: the
 * shell's is a circle-and-bar, and the design set's schedule glyph is a TRIANGLE.
 * The two are used on the same screen — the shell's inside the rail, this one on
 * a block — and a triangle is the shape the set spends on "the one state that
 * must be noticed".
 */
export const WarnTriangle = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M12 3.8 21 19.5H3L12 3.8Z" />
    <path d="M12 10v4" />
    <circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none" />
  </Glyph>
);

/** A cross, for the no-show block and the panel's verb. */
export const Cross = ({ size }: IconProps) => (
  <Glyph size={size} d="M6 6l12 12M18 6L6 18" />
);
