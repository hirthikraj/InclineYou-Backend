/**
 * The glyphs these screens use, copied verbatim from `gen_rail.py` and the
 * local set at the head of `gen_auth.py`.
 *
 * Copied rather than redrawn: an icon that shifts by a pixel between two files
 * is a diff nobody can read. The wrapper reproduces `ic()` — 24×24, no fill,
 * 1.6 stroke, round caps and joins — and every one is `aria-hidden`, because
 * each sits beside the sentence that already says what it means.
 */
interface IconProps {
  size?: number;
  className?: string;
}

function Glyph({ size = 18, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function IconWarn(p: IconProps) {
  return (
    <Glyph {...p}>
      <path d="M12 3.8 21 19.5H3L12 3.8Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

export function IconLock(p: IconProps) {
  return (
    <Glyph {...p}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </Glyph>
  );
}

export function IconClock(p: IconProps) {
  return (
    <Glyph {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.5 2" />
    </Glyph>
  );
}

export function IconCheck(p: IconProps) {
  return (
    <Glyph {...p}>
      <path d="M4.5 12.5l5 5 10-11" />
    </Glyph>
  );
}

export function IconChevronDown(p: IconProps) {
  return (
    <Glyph {...p}>
      <path d="M6 9l6 6 6-6" />
    </Glyph>
  );
}

export function IconWhatsApp(p: IconProps) {
  return (
    <Glyph {...p}>
      <path d="M20 11.6a8 8 0 0 1-11.9 7L4 20l1.5-4A8 8 0 1 1 20 11.6Z" />
    </Glyph>
  );
}

export function IconCall(p: IconProps) {
  return (
    <Glyph {...p}>
      <path d="M5.5 3.5h3l1.5 4-2 1.5a10 10 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 3.5 5.7 2 2 0 0 1 5.5 3.5Z" />
    </Glyph>
  );
}

/* ── the setup flow's glyphs ───────────────────────────────────────────────
   §09–§11 of the same document, so the same file. Copied verbatim from the
   generators that draw them — `I_PLUS`, `I_SEARCH` and `I_CHECK` from
   `gen_rail.py`, `I_TRASH`, `I_SHIELD` and `I_WALLET` from `gen_money.py`,
   `I_RUPEE` from `gen_rail.py`, `I_USER` from `gen_rail.py` — rather than
   redrawn, for the reason at the head of this file. */

export function IconPlus(p: IconProps) {
  return (
    <Glyph {...p}>
      <path d="M12 5v14M5 12h14" />
    </Glyph>
  );
}

export function IconSearch(p: IconProps) {
  return (
    <Glyph {...p}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21" />
    </Glyph>
  );
}

export function IconTrash(p: IconProps) {
  return (
    <Glyph {...p}>
      <path d="M4.5 7h15M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />
    </Glyph>
  );
}

export function IconShield(p: IconProps) {
  return (
    <Glyph {...p}>
      <path d="M12 3l7.5 3v6c0 4.5-3.2 7.6-7.5 9-4.3-1.4-7.5-4.5-7.5-9V6Z" />
    </Glyph>
  );
}

export function IconWallet(p: IconProps) {
  return (
    <Glyph {...p}>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18" />
    </Glyph>
  );
}

/** The rupee mark, as a glyph. Not the character — this sits beside a button label. */
export function IconRupee(p: IconProps) {
  return (
    <Glyph {...p}>
      <path d="M7 4h10M7 8.5h10M15.5 4c0 4-3.4 4.5-6 4.5h-.5l7 11.5" />
    </Glyph>
  );
}

export function IconUser(p: IconProps) {
  return (
    <Glyph {...p}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5" />
    </Glyph>
  );
}

export function IconRefresh(p: IconProps) {
  return (
    <Glyph {...p}>
      <path d="M20 11.5a8 8 0 1 0-2.4 5.7" />
      <path d="M20 5.5v6h-6" />
    </Glyph>
  );
}

/**
 * The two glyphs frame 3a labels its exits with — `I_DUMB` and `I_USERS` from
 * `gen_rail.py`, the same paths the navigation rail draws, so the trainer's
 * option wears the mark it will wear on every screen after it.
 */
export function IconDumbbell(p: IconProps) {
  return (
    <Glyph {...p}>
      <path d="M4 9v6M7 7.5v9M17 7.5v9M20 9v6M7 12h10" />
    </Glyph>
  );
}

export function IconUsers(p: IconProps) {
  return (
    <Glyph {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M16.5 5.6a3.2 3.2 0 0 1 0 5.8" />
      <path d="M18 13.6c2.1.7 3.5 2.5 3.5 5" />
    </Glyph>
  );
}

/** `I_CHEV`. Points at the exit it sits on the end of. */
export function IconChevronRight(p: IconProps) {
  return (
    <Glyph {...p}>
      <path d="M9 6l6 6-6 6" />
    </Glyph>
  );
}

export function IconChevronLeft(p: IconProps) {
  return (
    <Glyph {...p}>
      <path d="M15 6l-6 6 6 6" />
    </Glyph>
  );
}

/** The mark. A different viewBox from the rest — it is a logo, not a glyph. */
export function BrandMark({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <path
        d="M18 18 82 82M82 18 18 82"
        stroke="currentColor"
        strokeWidth="13"
        strokeLinecap="round"
      />
    </svg>
  );
}
