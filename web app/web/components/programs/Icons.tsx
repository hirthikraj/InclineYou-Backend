import { Glyph } from '@/components/shell/Icons';

/**
 * The builder's own glyphs, in the shell's 24-box at the shell's 1.6 stroke.
 *
 * They live here rather than in `components/shell/Icons.tsx` because none of
 * them is a destination — that file is the rail's vocabulary and a link icon is
 * not a place. Same box and same stroke, so a row that mixes one of these with a
 * shell glyph does not look like two icon sets.
 */
type P = { size?: number };

export const SearchIcon = ({ size = 14 }: P) => (
  <Glyph size={size}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21" />
  </Glyph>
);

export const PlusIcon = ({ size = 14 }: P) => <Glyph size={size} d="M12 5v14M5 12h14" />;

export const CopyIcon = ({ size = 15 }: P) => (
  <Glyph size={size}>
    <rect x="8.5" y="8.5" width="12" height="12" rx="2.2" />
    <path d="M15.5 5.5H5.5a1 1 0 0 0-1 1v10" />
  </Glyph>
);

export const UsersIcon = ({ size = 15 }: P) => (
  <Glyph size={size}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    <path d="M16.5 5.6a3.2 3.2 0 0 1 0 5.8" />
    <path d="M18 13.6c2.1.7 3.5 2.5 3.5 5" />
  </Glyph>
);

export const DotsIcon = ({ size = 18 }: P) => (
  <Glyph size={size}>
    <circle cx="12" cy="5.5" r="1.4" />
    <circle cx="12" cy="12" r="1.4" />
    <circle cx="12" cy="18.5" r="1.4" />
  </Glyph>
);

export const ChevronDown = ({ size = 13 }: P) => <Glyph size={size} d="M6 9l6 6 6-6" />;
export const ChevronRight = ({ size = 12 }: P) => <Glyph size={size} d="M9 6l6 6-6 6" />;
export const CheckIcon = ({ size = 14 }: P) => <Glyph size={size} d="M4 12l6 6L20 6" />;
export const CloseIcon = ({ size = 14 }: P) => <Glyph size={size} d="M6 6l12 12M18 6L6 18" />;

/** The alternate's marker — a fork, because "or" is a branch. */
export const AltIcon = ({ size = 12 }: P) => (
  <Glyph size={size}>
    <path d="M6 3v6a4 4 0 0 0 4 4h8" />
    <path d="M15 10l3 3-3 3" />
  </Glyph>
);

/** The link that makes a superset. TrueCoach's icon, in this system's box. */
export const LinkIcon = ({ size = 11 }: P) => (
  <Glyph size={size}>
    <path d="M10 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.3 1.3" />
    <path d="M14 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.3-1.3" />
  </Glyph>
);

export const TrashIcon = ({ size = 14 }: P) => (
  <Glyph size={size}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M6.5 7l.8 12a1 1 0 0 0 1 1h7.4a1 1 0 0 0 1-1l.8-12" />
  </Glyph>
);

export const ArrowUp = ({ size = 14 }: P) => <Glyph size={size} d="M12 19V5M6 11l6-6 6 6" />;
export const ArrowDown = ({ size = 14 }: P) => <Glyph size={size} d="M12 5v14M6 13l6 6 6-6" />;

/** The ladder — the progression panel's own mark. Three rising rungs. */
export const LadderIcon = ({ size = 15 }: P) => (
  <Glyph size={size}>
    <path d="M4 19h4v-4H4zM10 19h4v-8h-4zM16 19h4v-12h-4z" />
  </Glyph>
);

export const SendIcon = ({ size = 14 }: P) => (
  <Glyph size={size}>
    <path d="M4 12h13" />
    <path d="M13 7l5 5-5 5" />
  </Glyph>
);
