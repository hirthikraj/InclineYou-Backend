import { Glyph } from '@/components/shell/Icons';

/**
 * The builder's own glyphs.
 *
 * Six, and each is here rather than in `components/shell/Icons.tsx` for the
 * reason that file states: those are the NAVIGATION set, drawn 31 times across
 * the design pages and copied verbatim from `gen_rail.py`. These are local to
 * one dialog. `components/programs/Icons.tsx` is the same split one level down,
 * and `Grip` is the same texture `LibraryDock` keeps privately — a grab texture
 * is not a symbol and does not belong in a 24-box glyph set.
 */

type P = { size?: number };

export const UndoIcon = ({ size = 15 }: P) => (
  <Glyph size={size}>
    <path d="M4 9h11a5 5 0 0 1 0 10h-6" />
    <path d="M8 5 4 9l4 4" />
  </Glyph>
);

export const RedoIcon = ({ size = 15 }: P) => (
  <Glyph size={size}>
    <path d="M20 9H9a5 5 0 0 0 0 10h6" />
    <path d="m16 5 4 4-4 4" />
  </Glyph>
);

/** Three sliders — the workout's own settings, which here is its note. */
export const SlidersIcon = ({ size = 16 }: P) => (
  <Glyph size={size}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Glyph>
);

export const ClockIcon = ({ size = 14 }: P) => (
  <Glyph size={size}>
    <path d="M12 7.5V12l3.5 2" />
    <circle cx="12" cy="12" r="8.5" />
  </Glyph>
);

export const FlameIcon = ({ size = 14 }: P) => (
  <Glyph size={size}>
    <path d="M12 3c3.5 3.2 5.5 5.8 5.5 8.8A5.5 5.5 0 0 1 12 20a5.5 5.5 0 0 1-5.5-8.2C7.6 9.9 9 8.6 9.5 7c.9 1.3 1.6 2 2.5 2.4C12.6 8 12.6 5.6 12 3Z" />
  </Glyph>
);

/** A loaded bar, end on — the count of movements. */
export const DumbbellIcon = ({ size = 14 }: P) => (
  <Glyph size={size}>
    <path d="M4 9v6M7 7.5v9M17 7.5v9M20 9v6M7 12h10" />
  </Glyph>
);

/** A speech bubble — the note a trainer leaves against one set. */
export const NoteIcon = ({ size = 14 }: P) => (
  <Glyph size={size}>
    <path d="M4.5 6.5A2 2 0 0 1 6.5 4.5h11a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-4 3.5V15.5H6.5a2 2 0 0 1-2-2Z" />
  </Glyph>
);

/** A funnel — the filters the library search is narrowed by. Drawn as an
 *  outline and never filled: a filled funnel would read as *filters are on*,
 *  and the count chip beside it is what says that. */
export const FunnelIcon = ({ size = 15 }: P) => (
  <Glyph size={size}>
    <path d="M4 5.5h16l-6.2 7.3V19l-3.6-2v-4.2Z" />
  </Glyph>
);

/** Two rules with a gap — a labelled break in the session. */
export const DividerIcon = ({ size = 14 }: P) => (
  <Glyph size={size}>
    <path d="M4 8h16M4 16h16M9 12h6" />
  </Glyph>
);

/** Stacked cards — one saved session, whole. */
export const StackIcon = ({ size = 14 }: P) => (
  <Glyph size={size}>
    <path d="M5 7.5h14v4H5zM7 14h10M7 17.5h6" />
  </Glyph>
);

/** The grab texture. Local, like `LibraryDock`'s, for the reason above. */
export function Grip() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
      <circle cx="2.2" cy="2.6" r="1.15" />
      <circle cx="7.8" cy="2.6" r="1.15" />
      <circle cx="2.2" cy="7" r="1.15" />
      <circle cx="7.8" cy="7" r="1.15" />
      <circle cx="2.2" cy="11.4" r="1.15" />
      <circle cx="7.8" cy="11.4" r="1.15" />
    </svg>
  );
}
