/**
 * The glyph set, copied verbatim from the design set's `gen_rail.py`.
 *
 * Verbatim matters: an icon that shifts by a pixel between two files is a diff
 * nobody can read, and these same paths are drawn 31 times across the set. The
 * stroke attributes are one object rather than repeated per icon, because
 * `stroke-width:1.6` is a design-system value and eleven copies of it is eleven
 * places it can drift.
 *
 * `components/auth/Icons.tsx` holds the auth flow's four. These are the shell's,
 * and they are kept apart on purpose: nothing in sign-in should pull in the
 * navigation rail's icon table.
 */

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function Glyph({
  d,
  size = 18,
  children,
}: {
  d?: string;
  size?: number;
  children?: React.ReactNode;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...STROKE}>
      {children ?? <path d={d} />}
    </svg>
  );
}

/** One `<Glyph>` per destination, so a caller writes `<Home />` and not a path. */
type IconProps = { size?: number };

export const Home = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5.5 9.5V20h13V9.5" />
  </Glyph>
);

export const Calendar = ({ size }: IconProps) => (
  <Glyph size={size}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Glyph>
);

/**
 * One person — the account menu's *Your profile* row.
 *
 * Deliberately not `Users`, which is the roster's icon and means *the people you
 * coach*. This row is the trainer themselves, so it is the same head-and-
 * shoulders with the second figure taken away: the circle and the arc are on the
 * identical geometry, which is what makes the two read as a pair rather than as
 * two unrelated drawings sitting four rows apart.
 */
export const User = ({ size }: IconProps) => (
  <Glyph size={size}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5" />
  </Glyph>
);

export const Users = ({ size }: IconProps) => (
  <Glyph size={size}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    <path d="M16.5 5.6a3.2 3.2 0 0 1 0 5.8" />
    <path d="M18 13.6c2.1.7 3.5 2.5 3.5 5" />
  </Glyph>
);

export const Dumbbell = ({ size }: IconProps) => (
  <Glyph size={size} d="M4 9v6M7 7.5v9M17 7.5v9M20 9v6M7 12h10" />
);

export const Grid = ({ size }: IconProps) => (
  <Glyph size={size}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
    <path d="M8 9h8M8 13h8M8 17h5" />
  </Glyph>
);

export const Dots6 = ({ size }: IconProps) => (
  <Glyph size={size}>
    {[7, 12, 17].flatMap((cy) =>
      [9, 15].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.2" />),
    )}
  </Glyph>
);

export const Rupee = ({ size }: IconProps) => (
  <Glyph size={size} d="M7 4h10M7 8.5h10M15.5 4c0 4-3.4 4.5-6 4.5h-.5l7 11.5" />
);

/**
 * Packages — the price list. **The one glyph in this file that is NOT from the
 * design set**, because the set has no such destination: `webapp-money.html`
 * draws packages as a tab, and this half gave them a route. Drawn in the same
 * 24-box on the same 1.6 stroke as the other ten, so it sits in the rail without
 * announcing that it arrived later.
 */
export const Wallet = ({ size }: IconProps) => (
  <Glyph size={size}>
    <rect x="3" y="6" width="18" height="12.5" rx="2.5" />
    <path d="M3 10.5h18" />
    <circle cx="16.75" cy="14.5" r="1.15" />
  </Glyph>
);

export const Bars = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M4 20V4M4 20h16" />
    <rect x="7.5" y="12" width="3" height="5" />
    <rect x="12.5" y="8.5" width="3" height="8.5" />
    <rect x="17" y="6" width="3" height="11" />
  </Glyph>
);

export const Bell = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z" />
    <path d="M10 19a2.2 2.2 0 0 0 4 0" />
  </Glyph>
);

/**
 * Team is the one glyph that departs from the app deliberately. The phone gives
 * Team the same two-people mark as its roster, which is safe there because the
 * roster is a TAB and never sits beside it. In a rail they are two rows apart, so
 * Team becomes a hub — three nodes, joined.
 */
export const Team = ({ size }: IconProps) => (
  <Glyph size={size}>
    <circle cx="12" cy="5.8" r="2.5" />
    <circle cx="5.6" cy="17.6" r="2.5" />
    <circle cx="18.4" cy="17.6" r="2.5" />
    <path d="M10.3 7.9 7.2 15.4M13.7 7.9l3.1 7.5M8.1 17.6h7.8" />
  </Glyph>
);

export const Search = ({ size }: IconProps) => (
  <Glyph size={size}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21" />
  </Glyph>
);

export const Plus = ({ size }: IconProps) => <Glyph size={size} d="M12 5v14M5 12h14" />;

/**
 * Person silhouette with a + in the top-right corner.
 * Matches `#i-useradd` from inclineyou-clients.html frame 1a — the "Add client"
 * button that sits in the app bar on a phone.
 */
export const UserAdd = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="8.5" cy="7" r="4" />
    <path d="M19 8v6M22 11h-6" />
  </Glyph>
);
export const Check = ({ size }: IconProps) => <Glyph size={size} d="M4.5 12.5l5 5 10-11" />;
export const Chevron = ({ size }: IconProps) => <Glyph size={size} d="M9 6l6 6-6 6" />;
export const ChevronUp = ({ size }: IconProps) => <Glyph size={size} d="M6 15l6-6 6 6" />;
export const Panel = ({ size }: IconProps) => (
  <Glyph size={size}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M9.5 4.5v15" />
  </Glyph>
);

export const Clock = ({ size }: IconProps) => (
  <Glyph size={size}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3.5 2" />
  </Glyph>
);

export const Warn = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M12 3.8 21 19.5H3L12 3.8Z" />
    <path d="M12 10v4" />
    <circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none" />
  </Glyph>
);

export const Play = ({ size }: IconProps) => <Glyph size={size} d="M8 5.5v13l11-6.5-11-6.5Z" />;
export const No = ({ size }: IconProps) => (
  <Glyph size={size}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M7 17 17 7" />
  </Glyph>
);
export const Send = ({ size }: IconProps) => (
  <Glyph size={size} d="M4 12 20 4l-7 16-2.5-6.5L4 12Z" />
);
export const Eye = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </Glyph>
);

/* ── the queue's two, and neither is from the design set ───────────────────
   Same standing as `Wallet` above: the design set draws no way to silence a row,
   because the queue it draws cannot be silenced. Same 24-box, same 1.6 stroke, so
   they sit in the row beside `Check` without reading as borrowed. */

/**
 * Three dots in a row — *more to do with this row*.
 *
 * NOT `Dots6`, which is the six-dot grid the rail uses for a destination. A grid
 * means "a set of things"; a row of three means "the rest of the actions on the
 * thing beside it", and the two are ten pixels apart on the same screen.
 */
export const Ellipsis = ({ size }: IconProps) => (
  <Glyph size={size}>
    <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </Glyph>
);

/** `Bell` with a stroke through it — what a silenced row is, on the nose. */
export const BellOff = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M17.5 11a5.5 5.5 0 0 0-7.9-4.95" />
    <path d="M6.5 9.5V11c0 3.2-1.5 4.6-1.5 4.6h12.6" />
    <path d="M10.2 18.6a2 2 0 0 0 3.6 0" />
    <path d="M4 4l16 16" />
  </Glyph>
);

/** A map pin — the hero's *where is this* chip. */
export const Pin = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M12 21.5s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" />
    <circle cx="12" cy="10.2" r="2.6" />
  </Glyph>
);

/**
 * A page with lines on it — *there is something written here*.
 *
 * Deliberately the plainest possible glyph. Anything more specific would start to
 * say what the note is ABOUT, and this chip's whole design constraint is that it
 * says only that one exists — see `SessionChips` in `components/today/Hero.tsx`.
 */
export const Note = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M6 3.5h8.5L19 8v12.5H6V3.5Z" />
    <path d="M14 3.5V8h5M9 12.5h6M9 16h4" />
  </Glyph>
);

/* ── the account menu's two ────────────────────────────────────────────────
   `gen_rail.py`'s `I_GEAR` and `I_OUT`, verbatim. They arrive with the rail's
   foot menu rather than with a destination, which is why they sit apart from the
   eleven above: nothing in the navigation column draws either one. */

export const Gear = ({ size }: IconProps) => (
  <Glyph size={size}>
    <circle cx="12" cy="12" r="3.1" />
    <path
      d="M12 2.8v2.6M12 18.6v2.6M4.5 12H2M22 12h-2.5M6.2 6.2 4.4 4.4M19.6 19.6l-1.8-1.8M17.8 6.2l1.8-1.8M4.4 19.6l1.8-1.8"
    />
  </Glyph>
);

/** A door with an arrow leaving it. Points OUT — the one detail worth checking
 *  in a glyph that also reads as "sign in" mirrored. */
export const Out = ({ size }: IconProps) => (
  <Glyph size={size}>
    <path d="M14.5 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h8.5" />
    <path d="M17 8.5l3.5 3.5L17 15.5M9.5 12h11" />
  </Glyph>
);

/**
 * The wordmark. A barbell over a figure — the same 100×100 artwork the design set
 * inlines, in `#0A0B0D` because it always sits on the lime `.rail__mark` plate
 * and the mark is a FILL. That is the stylesheet's opening rule and the reason
 * this is not `currentColor`: inheriting ink here would put the mark's own colour
 * on lime and break it in the light theme.
 */
export function Mark({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <rect x="4" y="16" width="92" height="8" rx="3" fill="#0A0B0D" />
      <rect x="4" y="13" width="7" height="14" fill="#0A0B0D" />
      <rect x="89" y="13" width="7" height="14" fill="#0A0B0D" />
      <rect x="16" y="7" width="10" height="26" fill="#0A0B0D" />
      <rect x="74" y="7" width="10" height="26" fill="#0A0B0D" />
      <path d="M28 93 C28 60 72 60 72 93" stroke="#0A0B0D" strokeWidth="11" />
      <circle cx="50" cy="35" r="9" fill="#0A0B0D" />
      <g stroke="#0A0B0D" strokeWidth="11">
        <path d="M50 43 L50 64" />
        <path d="M33 22 C34 56 66 56 67 22" />
      </g>
    </svg>
  );
}
