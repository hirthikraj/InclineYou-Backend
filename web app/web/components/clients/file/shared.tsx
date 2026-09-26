import { Glyph } from '@/components/shell/Icons';
import { formatMinute, minuteOfDay } from '@/lib/today/time';

/**
 * What the six tabs share: the tab vocabulary, the date helpers, the two
 * classifiers, and the icons this screen draws that the shell's set does not.
 *
 * It exists because the file used to be one 1,100-line component and the
 * duplication was starting to disagree with itself — three different renderings
 * of a short date, two of a session's status. One copy each, here.
 */

/* ──────────────────────────────────────────────────────────────── tabs ── */

/**
 * The eight, in the order they are drawn.
 *
 * `progress` and `payments` were not tabs before this pass: progress was a route
 * of its own off the workout console and body metrics was a ghost button beside
 * the tab strip, while payments was called *Package* and only ever showed the
 * live one. Both are folded in, which is what makes the strip the whole file
 * rather than most of it.
 */
export type Tab =
  | 'overview'
  | 'calendar'
  | 'progress'
  | 'assessments'
  | 'sessions'
  | 'program'
  | 'payments'
  | 'notes';

export const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  /* SEVENTH, AND IT SITS SECOND. Asked for on 14 Sep 2026 and placed beside
     Overview rather than beside Sessions, which is where the same rows already
     live: the two are ordered by what a trainer opens the file TO DO. Overview
     is *how is this going*, the calendar is *when are they in*, and the history
     — with what each session did to the pack — is the one you go to when a
     figure on one of the first two needs explaining. */
  { key: 'calendar', label: 'Calendar' },
  { key: 'progress', label: 'Progress' },
  /* EIGHTH, AND IT SITS BESIDE PROGRESS because the two are the same subject
     read two ways: Progress is what the TRAINER recorded — their own tape,
     their own set logs — and an assessment is what the CLIENT sent back, on a
     date, against questions somebody wrote in advance. Half of one of them is
     not a number at all, which is also why it is not folded into the other.
     `ChecksTab` carries the rest of that argument.

     THE LABEL IS THE DESTINATION'S NAME AND THE PROSE IS THE PRODUCT'S WORD,
     which is the split `/clients/assessments` already runs on: that screen is
     titled *Assessments*, its own column head reads *Assessment*, and every
     sentence on it says *check-in*. One is what a trainer clicks and the other
     is what the thing is called out loud, and this tab follows both.

     The component and its class family stay `Checks` / `.cfchk` for the reason
     the `notes` key two rows down stays `notes`: an internal name is not worth
     a rename, and *check-in* is still exactly what the rows are. */
  { key: 'assessments', label: 'Assessments' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'program', label: 'Plan' },
  { key: 'payments', label: 'Payments' },
  /* THE KEY IS STILL `notes` AND THE ROUTE IS STILL `/notes`. The tab grew a
     contact form on 14 Sep 2026 and took the name of the thing it now is, but a
     trainer with `/clients/abc/notes` open in a second window — or bookmarked —
     should not meet a 404 over a rename, and nothing about the label is worth
     that. */
  { key: 'notes', label: 'Personal information' },
];

/** Every tab is a real route, so the strip works with the back button. */
export function tabHref(clientId: string, tab: Tab): string {
  return tab === 'overview' ? `/clients/${clientId}` : `/clients/${clientId}/${tab}`;
}

/* ────────────────────────────────────────────────────────────── numbers ── */

/** Coerce Spring's BigDecimal fields, which Jackson can serialise as a string. */
export function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* ───────────────────────────────────────────────────────── date & time ── */

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_UPPER = MONTHS_SHORT.map((m) => m.toUpperCase());

/** `14 AUG` — the table column, where the caps are the point. */
export function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS_UPPER[d.getMonth()]}`;
}

export function shortTime(ms: number): string {
  return formatMinute(minuteOfDay(ms));
}

/** `14 Aug` — everywhere the date sits inside a sentence. */
export function dateStr(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** The same, for the ISO date strings packages and programs carry. */
export function isoDateStr(iso: string): string {
  return dateStr(new Date(iso).getTime());
}

/**
 * `14 Aug 2026` — used only where a year genuinely changes the meaning: an old
 * pack, and a note somebody wrote a long time ago. Everywhere else the year is
 * noise, because everywhere else the reader is looking at this season.
 */
export function longDateStr(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * `12 Jul – 23 Aug`, and `19 Aug 2025 – 17 May 2026` when it has to be.
 *
 * ── A RANGE THAT CROSSED A YEAR READ BACKWARDS ──────────────────────────────
 *
 * The plan tab's history ends on the stretch between the day a client joined
 * and the day they were first given a program, and on `cli_008` — joined
 * 19 Aug 2025, first block 17 May 2026 — that row printed **19 Aug – 17 May**.
 * Nine months, drawn as a range running three months backwards. The rule above
 * is right about the ordinary case (*everywhere else the reader is looking at
 * this season*) and this is the case it does not cover: **a year is noise only
 * while both ends are in the same one.**
 *
 * Decided per RANGE and not per date, so the two ends always match — `19 Aug
 * 2025 – 17 May` is a fix that leaves the reader doing the same arithmetic.
 */
export function rangeStr(fromMs: number, toMs: number | null, openLabel = 'now'): string {
  const from = new Date(fromMs);
  if (toMs === null) return `${dateStr(fromMs)} – ${openLabel}`;
  const to = new Date(toMs);
  const withYear = from.getFullYear() !== to.getFullYear();
  const one = withYear ? longDateStr : dateStr;
  return `${one(fromMs)} – ${one(toMs)}`;
}

/* ────────────────────────────────────────────── session classification ── */

export type SessionFilter = 'all' | 'done' | 'no_show' | 'cancelled' | 'booked' | 'not_marked';

export function classifySession(
  s: { status: string; scheduledAt: number },
  now: number,
): SessionFilter {
  if (s.status === 'done') return 'done';
  if (s.status === 'no_show') return 'no_show';
  if (s.status === 'cancelled') return 'cancelled';
  if (s.status === 'scheduled') return s.scheduledAt > now ? 'booked' : 'not_marked';
  return 'booked';
}

/* ───────────────────────────────────────────────────────── sub-components ── */

export function Meter({ pct, danger }: { pct: number; danger?: boolean }) {
  const w = Math.min(100, Math.max(0, Math.round(pct)));
  return (
    <div className="meter meter--lg" style={{ marginTop: 12 }}>
      <i style={{ width: `${w}%`, background: danger ? 'var(--tx-danger)' : undefined }} />
      <i className="dim" style={{ width: `${100 - w}%` }} />
    </div>
  );
}

/** The empty state every tab reaches for, so all six phrase it the same way. */
export function Blank({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="small"
      style={{ padding: '32px 0', textAlign: 'center', color: 'var(--tx-ink-3)' }}
    >
      {children}
    </p>
  );
}

/* ────────────────────────────────────────────────────────────── icons ── */

export const MessageIcon = ({ size = 15 }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M20 12a8 8 0 0 1-11.9 7L4 20l1.5-4A8 8 0 1 1 20 12Z" />
  </Glyph>
);

export const PhoneIcon = ({ size = 15 }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5Z" />
  </Glyph>
);

export const DumbbellIcon = ({ size = 15 }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M4 9v6M7 7.5v9M17 7.5v9M20 9v6M7 12h10" />
  </Glyph>
);

export const CalendarIcon = ({ size = 15 }: { size?: number }) => (
  <Glyph size={size}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Glyph>
);

export const ListIcon = ({ size = 15 }: { size?: number }) => (
  <Glyph size={size}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
    <path d="M8 9h8M8 12.5h8M8 16h5" />
  </Glyph>
);

export const BodyIcon = ({ size = 15 }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M4 8h16l-2 12H6L4 8Z" />
    <path d="M9 8a3 3 0 0 1 6 0" />
    <path d="M12 12v4" />
  </Glyph>
);

export const TrashIcon = ({ size = 15 }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5 7.5 20h9l1-13.5M10.5 10v6M13.5 10v6" />
  </Glyph>
);
