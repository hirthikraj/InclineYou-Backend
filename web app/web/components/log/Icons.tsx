import { Glyph } from '@/components/shell/Icons';

/**
 * The console's own glyphs.
 *
 * Kept out of `components/shell/Icons.tsx` for the reason that file states about
 * the auth set: nothing in the navigation rail should pull in a trophy, and
 * nothing mid-session should pay for the rail's table. Same `Glyph`, so the
 * 1.6px stroke stays one value in one place.
 */

type P = { size?: number };

export const Tick = ({ size = 15 }: P) => <Glyph size={size} d="M4.5 12.5l5 5 10-11" />;

export const Trophy = ({ size = 15 }: P) => (
  <Glyph size={size}>
    <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
    <path d="M7 5H4.5v1.5A3.5 3.5 0 0 0 7.6 10M17 5h2.5v1.5A3.5 3.5 0 0 1 16.4 10" />
    <path d="M12 13v3M9 20h6M10 16h4l.5 4h-5l.5-4Z" />
  </Glyph>
);

export const Note = ({ size = 13 }: P) => (
  <Glyph size={size}>
    <path d="M5 4h11l3 3v13H5V4Z" />
    <path d="M8 10h8M8 14h5" />
  </Glyph>
);

export const Swap = ({ size = 14 }: P) => (
  <Glyph size={size}>
    <path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" />
  </Glyph>
);

export const Timer = ({ size = 15 }: P) => (
  <Glyph size={size}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2M9.5 2.5h5" />
  </Glyph>
);

export const Back = ({ size = 16 }: P) => <Glyph size={size} d="M19 12H5M5 12l6-6M5 12l6 6" />;

export const Chart = ({ size = 15 }: P) => (
  <Glyph size={size}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Glyph>
);

export const Dots = ({ size = 16 }: P) => (
  <Glyph size={size}>
    <circle cx="5" cy="12" r="1.2" />
    <circle cx="12" cy="12" r="1.2" />
    <circle cx="19" cy="12" r="1.2" />
  </Glyph>
);

export const Trash = ({ size = 15 }: P) => (
  <Glyph size={size}>
    <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />
  </Glyph>
);

export const Warn = ({ size = 15 }: P) => (
  <Glyph size={size}>
    <path d="M12 3.5 1.8 20.5h20.4L12 3.5Z" />
    <path d="M12 10v4M12 17.2h.01" />
  </Glyph>
);

export const Info = ({ size = 15 }: P) => (
  <Glyph size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.8h.01" />
  </Glyph>
);

export const Plus = ({ size = 15 }: P) => <Glyph size={size} d="M12 5v14M5 12h14" />;

export const Send = ({ size = 15 }: P) => (
  <Glyph size={size}>
    <path d="M21 3 11 14M21 3l-6.5 18-3.5-7-7-3.5L21 3Z" />
  </Glyph>
);

export const NoShow = ({ size = 15 }: P) => (
  <Glyph size={size}>
    <path d="M12 9v4M12 17h.01" />
    <path d="M5.07 18.93A9 9 0 1 1 18.93 5.07M2 2l20 20" />
  </Glyph>
);
