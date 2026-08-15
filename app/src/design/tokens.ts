/**
 * XRep — "Command Deck" design tokens.
 *
 * Ported verbatim from `agent/design system/xrepdesignsystem.html` (v1.0 · 9 Aug 2026),
 * which is the single source of truth. Every value below is a token; no component
 * may hard-code a colour, size or radius. Swap the palette and the app reskins.
 *
 * Two deliberate translations from the CSS:
 *   · em-based letter-spacing is resolved to absolute px against the size it ships
 *     at, because React Native has no em unit.
 *   · `box-shadow: inset 0 0 0 1px X` becomes `borderWidth: 1 / borderColor: X`.
 *     RN borders are inside the box, so heights are unchanged.
 */

import type { TextStyle } from 'react-native';

/* ------------------------------------------------------------------ palette */

export const dark = {
  /* surface ladder — depth comes from lightness, not shadow */
  canvas: '#08090B',
  surface: '#101216',
  surface2: '#171A20',
  surface3: '#1F232B',
  line: '#1E222A',
  lineStrong: '#2A2F39',
  scrim: 'rgba(0,0,0,0.66)',

  /* ink */
  ink: '#F2F4F6', //  17.0 : 1 on surface
  ink2: '#A2A9B4', //   7.9 : 1
  ink3: '#8B939F', //   6.1 : 1 — the floor for anything a user must read
  inkOff: '#4A505A', // disabled only, never information
  inkInverse: '#0A0B0D',

  /* brand */
  accent: '#C6F24E', // FILL colour — see accentText
  accentPress: '#B2DE3A',
  accentInk: '#0A0B0D', // 15.2 : 1 on the fill
  accentText: '#C6F24E', // links, active tab, small icons
  accentSoft: 'rgba(198,242,78,0.12)',
  accentLine: 'rgba(198,242,78,0.34)',
  /**
   * `accentSoft` split into hue and alpha. An SVG gradient stop needs the two
   * apart: `extractGradient` throws away whatever alpha is inside `stopColor`
   * and takes it from `stopOpacity` alone, so an `rgba()` string handed to a
   * stop renders fully opaque. Only `Card`'s live tint needs the split — every
   * other surface uses `accentSoft` flat.
   */
  accentSoftHue: '#C6F24E',
  accentSoftAlpha: 0.12,

  /* semantic */
  ok: '#3DDC84',
  okSoft: 'rgba(61,220,132,0.13)',
  warn: '#FFB020',
  warnSoft: 'rgba(255,176,32,0.13)',
  danger: '#FF5A5A',
  dangerSoft: 'rgba(255,90,90,0.13)',
  info: '#6FB6FF',
  infoSoft: 'rgba(111,182,255,0.13)',
  dangerFill: '#D93036',
  dangerFillInk: '#FFFFFF',
  okFill: '#3DDC84',
  okFillInk: '#052912',

  /* domain */
  floor: '#9FD3FF',
  floorSoft: 'rgba(159,211,255,0.12)',
  remote: '#C9A8FF',
  remoteSoft: 'rgba(201,168,255,0.12)',
  pr: '#FFC861',
  prSoft: 'rgba(255,200,97,0.14)',

  /* form fields — alpha, so one token works on canvas, card and sheet */
  field: 'rgba(255,255,255,0.035)',
  fieldHover: 'rgba(255,255,255,0.06)',
  fieldLine: 'rgba(255,255,255,0.10)',
  fieldLineHover: 'rgba(255,255,255,0.17)',
  focus: '#C6F24E',
  focusHalo: 'rgba(198,242,78,0.17)',
};

export type Palette = typeof dark;

export const light: Palette = {
  canvas: '#F4F5F3',
  surface: '#FFFFFF',
  surface2: '#EDEFEC',
  surface3: '#E4E7E2',
  line: '#DFE2DC',
  lineStrong: '#C7CCC3',
  scrim: 'rgba(16,19,26,0.42)',

  ink: '#10131A',
  ink2: '#4E5560',
  ink3: '#5A626D',
  inkOff: '#A9AFB8',
  inkInverse: '#FFFFFF',

  accent: '#C6F24E', // the fill stays identical in both themes — this is the brand
  accentPress: '#B2DE3A',
  accentInk: '#0A0B0D',
  accentText: '#4F6B0A', // 6.1 : 1 — lime is unreadable as text on white
  accentSoft: '#EDF6D6',
  accentLine: '#CFE39A',
  // Light's soft tint is already opaque — accent blended onto white — so the
  // hue is the token itself and the alpha is 1.
  accentSoftHue: '#EDF6D6',
  accentSoftAlpha: 1,

  ok: '#0E7034',
  okSoft: '#E4F4EA',
  warn: '#8F5100',
  warnSoft: '#FBEEDC',
  danger: '#C0281E',
  dangerSoft: '#FBE7E5',
  info: '#1B5FA8',
  infoSoft: '#E5EFF9',
  dangerFill: '#C0281E',
  dangerFillInk: '#FFFFFF',
  okFill: '#0E7034',
  okFillInk: '#FFFFFF',

  floor: '#1B5FA8',
  floorSoft: '#E5EFF9',
  remote: '#6B3FC4',
  remoteSoft: '#EFE9FB',
  pr: '#8A6000',
  prSoft: '#FBF0D9',

  field: '#FFFFFF',
  fieldHover: '#FFFFFF',
  fieldLine: 'rgba(16,19,26,0.14)',
  fieldLineHover: 'rgba(16,19,26,0.24)',
  focus: '#4F6B0A',
  focusHalo: 'rgba(79,107,10,0.15)',
};

/**
 * Dark is the default theme; light is a complete pair, not an afterthought.
 * Until a theme provider lands, components read this binding directly.
 */
export const colors = dark;

/* ------------------------------------------------------- spacing · 4pt base */

export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s7: 32,
  s8: 40,
  s9: 48,
  s10: 64,
  inset: 20, // screen side padding
  cardPad: 16,
  cardGap: 8,
  sectionGap: 28,
};

/* ---------------------------------------------------------- radius · 8pt */

export const radius = {
  r1: 4, // bars, micro tags
  r2: 8, // DEFAULT — buttons, inputs, chips, cards
  r3: 12, // large surfaces, FAB, dialogs
  r4: 18, // bottom sheets
  full: 999, // avatars only
};

/* ------------------------------------------------------------------- type */

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

export const type = {
  display: { fontSize: 62, fontWeight: '800', letterSpacing: -2.79, lineHeight: 58, ...tabular },
  h1: { fontSize: 27, fontWeight: '800', letterSpacing: -0.4, lineHeight: 30 },
  h2: { fontSize: 21, fontWeight: '700', letterSpacing: -0.42, lineHeight: 25 },
  h3: { fontSize: 17, fontWeight: '700', letterSpacing: -0.26, lineHeight: 22 },
  bodyLg: { fontSize: 16, fontWeight: '400', lineHeight: 24 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 22 },
  bodySm: { fontSize: 13.5, fontWeight: '400', lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '500', lineHeight: 17 },
  micro: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.37,
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  numXl: { fontSize: 30, fontWeight: '800', letterSpacing: -1.05, ...tabular },
  numLg: { fontSize: 23, fontWeight: '800', letterSpacing: -0.69, ...tabular },
  numMd: { fontSize: 17, fontWeight: '700', letterSpacing: -0.26, ...tabular },
} satisfies Record<string, TextStyle>;

export const tnum = tabular;

/* ----------------------------------------------------------------- avatars
 * `--tx-av-1 … 8`. White initials on every one of them clears 5.9:1, which is
 * why the list is fixed rather than generated — a hashed hue would eventually
 * land on something unreadable.
 * -------------------------------------------------------------------------- */

export const avatarPalette = [
  '#4A5568',
  '#4B44C4',
  '#0E6E62',
  '#2F6B33',
  '#8A5A12',
  '#96421F',
  '#7A3A73',
  '#1F5A9E',
] as const;

/** Same name, same colour, on every device and every reinstall. */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 100_000;
  return avatarPalette[hash % avatarPalette.length];
}

/** "Ravi Kannan" → "RK". One letter is fine; three is a logo, not initials. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const first = words[0][0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/* ----------------------------------------------------------------- motion */

export const motion = {
  instant: 120, // press / state
  fast: 180, // chip, toggle, tooltip
  base: 240, // sheet, nav, expand
  slow: 320, // page transition
  /**
   * Content arriving in place of a skeleton.
   *
   * Longer than a page transition on purpose. A transition is a move the user
   * asked for and is waiting on; this one they did not ask for, and its whole
   * job is to be unhurried enough that a screenful of data appearing does not
   * read as a jolt.
   */
  reveal: 420,
};

/**
 * Bezier control points, as `Easing.bezier(...curve.x)`.
 *
 * `standard` is the CSS `--tx-ease` every small transition in the design file
 * uses. The two emphasized curves are for surfaces that travel a long way —
 * a drawer crossing 312px, a sheet crossing the screen. They are asymmetric on
 * purpose: something arriving should decelerate into place so the eye can
 * follow it, and something leaving should get out of the way, because nobody
 * watches an exit they asked for.
 */
export type Curve = readonly [number, number, number, number];

export const curve = {
  standard: [0.2, 0.8, 0.2, 1],
  emphasizedDecelerate: [0.05, 0.7, 0.1, 1],
  emphasizedAccelerate: [0.3, 0, 0.8, 0.15],
  /**
   * For a fade, not a journey.
   *
   * The emphasized curves above are savagely front-loaded — `emphasizedDecelerate`
   * puts the output at 0.7 by a twentieth of the duration. On a surface crossing
   * 300px that still reads as travel, because the remaining distance is large.
   * On an opacity it reads as a snap followed by a long invisible tail: measured
   * on device, a 320ms fade reached 94% in four milliseconds.
   *
   * This is ease-out-quad — a fifth of the way through, a fifth of the way
   * there. Slow enough to be seen the whole way, and still settling rather than
   * stopping.
   */
  reveal: [0.25, 0.46, 0.45, 0.94],
} satisfies Record<string, Curve> as Record<
  'standard' | 'emphasizedDecelerate' | 'emphasizedAccelerate' | 'reveal',
  // Widened deliberately: picking one of two curves with a ternary yields a
  // union of literal tuples, and a union cannot be spread into `Easing.bezier`.
  Curve
>;

/* ------------------------------------------------------------- font scaling
 * Ceilings for the system's fixed-metric chrome.
 *
 * Everything that reads as content — a client's name, a session detail, an
 * amount — scales without limit, because that is the whole point of the OS
 * setting. These two caps apply only to the small, boxed labels: at Android's
 * 200% a 9.5px uppercase tag becomes 19px, which is larger than the 15px name
 * it is annotating, and the row stops making sense before it stops fitting.
 *
 * A cap is not a substitute for a box that grows. Both are needed: the box
 * grows so nothing is ever clipped, and the cap keeps the hierarchy intact.
 * -------------------------------------------------------------------------- */

export const maxFontScale = {
  /** Buttons and chips — controls with a label someone acts on. */
  control: 1.8,
  /** Tags, counts, badges — labels that annotate content rather than being it. */
  micro: 1.5,
};

/* ------------------------------------------------------------------ touch */

export const tap = {
  min: 48, // absolute floor, everywhere
  gym: 56, // anything used mid-session
};
