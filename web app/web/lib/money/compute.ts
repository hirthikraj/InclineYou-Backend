/**
 * Pure business logic for the money screen.
 *
 * No imports from api.ts — this file holds the arithmetic, api.ts holds the
 * wire, and a component can import either without pulling the other.
 */

import type { MoneyClient, MoneyPackage, MoneyPayment, MoneyTrainer } from './api';

export type { MoneyClient, MoneyPackage, MoneyPayment, MoneyTrainer };

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ------------------------------------------------------------------ helpers */

export function isCollected(p: MoneyPayment): boolean {
  return p.status === 'paid' || p.status === 'confirmed';
}

export function isPending(p: MoneyPayment): boolean {
  return p.status === 'pending';
}

/** Start of the Nth day of the month in epoch ms (1-based). */
export function monthBounds(year: number, month: number): { from: number; to: number } {
  const from = new Date(year, month - 1, 1).getTime();
  const to = new Date(year, month, 1).getTime();
  return { from, to };
}

/* `parseMonthSlug` and `monthSlug` lived here to serve `/business/[month]`. That
   segment is gone — the period is client state now, see `lib/money/period.ts` —
   and a slug nothing reads or writes is a slug that will drift. */

/** `Aug 2026` — for the page subtitle. */
export function monthLabel(year: number, month: number): string {
  return `${MONTHS_SHORT[month - 1]} ${year}`;
}

/** `August 2026` — for card headings. */
export function monthLong(year: number, month: number): string {
  const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${LONG[month - 1]} ${year}`;
}

/**
 * Short name for a payment method as stored.
 *
 * `method` is free text in the column (V1, `VARCHAR(30)`), which is what let
 * *bank* be added without a migration — the brief's third mode is a bank
 * transfer, and Indian trainers are paid by all three plus the gym's counter.
 * The two `upi_intent` / `gym_front_office` spellings are V1's, still written by
 * the sync path's defaults, and are mapped here rather than migrated: the
 * schema law forbids repurposing a column, and a display name is not worth one.
 */
export function methodLabel(method: string | null): string {
  if (!method) return '—';
  if (method === 'upi' || method === 'upi_intent') return 'UPI';
  if (method === 'cash') return 'Cash';
  if (method === 'bank') return 'Bank transfer';
  if (method === 'gym' || method === 'gym_front_office') return 'Gym front office';
  return method;
}

/** Days since a payment was created. */
export function daysLate(payment: MoneyPayment, now: number): number {
  return Math.floor((now - payment.createdAt) / (86_400_000));
}

/* ------------------------------------------------------------ monthly trend */

/**
 * SIX BARS, AND NOTHING MORE.
 *
 * The brief is explicit about the ceiling — "a simple bar chart of the last 6
 * months. Nothing more" — and the ceiling is the point. A trainer wants to know
 * whether this month is better or worse than the last few; they do not want a
 * date-range picker, a second series or a trend line, and every one of those
 * turns a glance into a reading.
 *
 * ── IT DATES BY WHEN THE MONEY ARRIVED, WHICH IS THE OPPOSITE OF PAYMENTS ──
 *
 * `computeLedger` windows on `createdAt`, deliberately, and `GET /v1/payments`
 * does the same: a month's BILLING is what was raised that month, and dating by
 * settlement would move an invoice into whichever month it was paid in and drop
 * every unpaid one — which is the figure *still pending* is made of.
 *
 * This chart asks the other question. "Is my income going up" is about money
 * that ARRIVED, so a bar is `paidAt`, falling back to `createdAt` for the rows
 * that carry no settlement date — every payment the phone has ever pushed, and
 * every one this API wrote before `paidAt` became a field on the record route.
 * Without that fallback the chart would read as six empty months on any book
 * that predates it.
 *
 * The figure is the trainer's OWN share, gym cut already subtracted, for the
 * reason the GST tab uses the same one: half of ₹6,000 collected on a gym floor
 * is not income, and a bar chart that says it is will be believed.
 */
export interface TrendBar {
  year: number;
  month: number;
  /** `Aug` — the axis label. */
  label: string;
  /** The trainer's share of everything collected that month. */
  amount: number;
  /** True for the month `now` falls in — the one bar drawn in the accent. */
  isCurrent: boolean;
}

