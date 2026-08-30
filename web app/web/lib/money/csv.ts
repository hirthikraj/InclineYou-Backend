/**
 * EXPORT FOR THE CA, AND THE REASON THIS IS THE WHOLE TAX FEATURE.
 *
 * The brief draws a hard line under this screen: *do not build accounting
 * software. No invoicing engine, no tax computation, no GST filing. Offer a CSV
 * export and let their CA handle it.* That is not a scoping compromise, it is the
 * correct product: an Indian personal trainer already has a chartered accountant,
 * that CA already has software, and the one thing they need from the trainer is
 * the book in a form they can open. Anything more is a second opinion about tax
 * law issued by a coaching app.
 *
 * So this file is a string builder and nothing else. It runs in the browser, it
 * touches no server and it invents no figures — every column is a column of the
 * ledger the trainer has been looking at, which is what makes the export
 * argue-with-able against the screen it came from.
 *
 * ── TWO DECISIONS THAT LOOK LIKE FUSSINESS AND ARE NOT ───────────────────────
 *
 * **Amounts are bare numbers, never `₹6,000`.** A rupee sign and a thousands
 * separator make a spreadsheet read the column as text, and a CA who has to
 * clean a column before they can sum it will ask for a PDF next time.
 *
 * **Dates are `YYYY-MM-DD`.** Excel reads Indian `DD/MM/YYYY` as American
 * `MM/DD/YYYY` on a machine set to a US locale, silently, and turns the 6th of
 * August into the 8th of June for every row where the day is twelve or under.
 */

import type { LedgerRow, OwedRow } from './compute';
import { methodLabel } from './compute';

/**
 * RFC 4180 quoting, applied to everything rather than only where it is needed.
 *
 * A client called `Sharma, Rohit` and a note reading `paid 2,000 — rest Tuesday`
 * both break a naive join, and both are ordinary. Quoting unconditionally costs
 * two characters a cell and removes the class of bug entirely.
 */
function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '""';
  return `"${String(v).replace(/"/g, '""')}"`;
}

/** `2026-08-06` — sortable, and unambiguous in every spreadsheet locale. */
export function isoDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  /*
   * A UTF-8 BOM, on purpose. Excel on Windows reads a BOM-less UTF-8 file as
   * the system code page, which mangles every name outside ASCII — and this is
   * an app for Indian trainers whose rosters are full of them.
   */
  const body = [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  return `﻿${body}\r\n`;
}

export function ledgerCsv(rows: LedgerRow[]): string {
  return toCsv(
    ['Date', 'Client', 'Method', 'Collected by', 'Amount', 'Gym share', 'Yours', 'Status', 'Reference', 'Note'],
    rows.map((r) => [
      isoDate(r.date),
      r.clientName,
      methodLabel(r.method),
      r.collectedBy ?? 'trainer',
      r.amount,
      r.gymShareAmount ?? 0,
      r.amount - (r.gymShareAmount ?? 0),
      r.status,
      r.upiReference ?? '',
      r.note ?? '',
    ]),
  );
}

export function owedCsv(rows: OwedRow[]): string {
  return toCsv(
    ['Client', 'For', 'Amount', 'Days overdue', 'Raised on'],
    rows.map((r) => [r.clientName, r.packageName, r.amount, r.daysLate, isoDate(r.raisedAt)]),
  );
}

/**
 * Hand the file to the browser.
 *
 * An object URL and a synthetic click, which is the only way to name a
 * client-built file — and it is revoked on the next frame rather than left for
 * the tab's lifetime, because a ledger for a full book is not a small string.
 */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

/** `xrep-ledger-aug-2026.csv` — lands in a Downloads folder that has others. */
export function csvFilename(kind: string, periodLabel: string): string {
  const slug = periodLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `xrep-${kind}-${slug}.csv`;
}
