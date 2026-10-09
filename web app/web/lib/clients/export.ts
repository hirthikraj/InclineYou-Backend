import { csvFilename, downloadCsv, isoDate } from '@/lib/money/csv';
import { TAG_LABEL, type RosterRow } from './roster';

/**
 * THE ROSTER AS A SPREADSHEET — the rows on screen, in the order on screen.
 *
 * `webapp-settings.html` promises *everything is exportable* and only the money
 * book was. This is the roster's half, and it follows the money book's two rules
 * for the same reasons (`lib/money/csv.ts`): amounts are bare numbers and dates
 * are `YYYY-MM-DD`, because a ₹ sign makes a column text and Excel reads
 * `DD/MM/YYYY` as American on a US-locale machine.
 *
 * It exports what the trainer is LOOKING AT — filtered, searched and sorted — so
 * it is argue-with-able against the screen it came from, exactly as the
 * transactions export is. Runs in the browser; nothing is sent anywhere. The
 * columns are facts the roster already prints; there is no health data in it
 * (the roster holds none) and no free-text notes.
 */
const HEAD = [
  'Name',
  'Phone',
  'Delivery',
  'Status',
  'What’s up',
  'Sessions left',
  'Pack size',
  'Pending (INR)',
  'Last attended',
];

/** RFC 4180: quote anything holding a comma, quote or line break; double the quotes. */
function cell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rosterCsv(rows: RosterRow[]): string {
  const lines = rows.map((r) =>
    [
      r.name,
      r.phone ?? '',
      r.mode === 'floor' ? 'In person' : 'Online',
      TAG_LABEL[r.tag],
      r.line,
      r.pack?.remaining ?? '',
      r.pack?.total ?? '',
      r.owed > 0 ? r.owed : '',
      r.lastAttendedAt ? isoDate(r.lastAttendedAt) : '',
    ]
      .map(cell)
      .join(','),
  );
  return [HEAD.map(cell).join(','), ...lines].join('\r\n') + '\r\n';
}

/** `inclineyou-clients-2026-10-04.csv` */
export function exportRoster(rows: RosterRow[], now: number): void {
  downloadCsv(csvFilename('clients', isoDate(now)), rosterCsv(rows));
}
