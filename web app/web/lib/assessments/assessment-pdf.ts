/**
 * ONE ASSESSMENT, ON ONE PAGE, FOR THE CLIENT (26 Nov 2026, review P2 "Nothing to
 * hand the client").
 *
 * The piece that sells the renewal: a client who reads *Waist −4 cm since August*
 * on paper with their name on it is a client who can see what the last block did.
 * Built like the progress card — painted by the progress report's own pieces
 * (`lib/reports/report-pdf.ts`: the sheet, the measures, headings, tiles and the
 * measurement row with its sparkline; `drawMark`; `pdf.ts`'s writer) — and footed
 * with the card's mark, *Tracked on InclineYou*.
 *
 * Rules it keeps, each from the screen it comes off:
 *
 *   · NO TONE ON A CHANGE. `lib/assessments/detail.ts` and the report card both
 *     refuse green and red: a waist going up is the plan working on a client
 *     building muscle. The headline is chosen by SIZE of move, never by direction,
 *     and every delta is drawn in ink, not the accent.
 *   · NO HEALTH READINGS. `HEALTH_MEASUREMENT_KEYS` (visceral fat, resting heart
 *     rate, blood pressure) never leave the screen — the client report's rule.
 *   · NO ANSWERS. The progress report keeps ratings in the trainer's column only;
 *     a sheet handed across the gym floor is not where a client's own sentences
 *     about their sleep go.
 *   · THE PAGE'S OWN ARITHMETIC. Every change is `measureStats` — the figure the
 *     Measurements tab prints — so paper and screen cannot disagree. "Since" is the
 *     FIRST reading on record, which is the renewal's question.
 *   · ONE PAGE. Rows that would run past the foot are counted, not dropped quietly.
 */

import { measureStats, signed, trim, type AssessmentDetailWire, type ReadingWire } from './detail';
import { HEALTH_MEASUREMENT_KEYS } from './vocab';
import { ACCENT, INK, INK_2, INK_3, LINE, drawMark, fit, font, resolveStacks, stacks, type Ctx } from '@/lib/reports/card-image';
import {
  CW,
  H,
  PAD,
  TOP,
  BOTTOM,
  W,
  detailRow,
  figureGrid,
  heading,
  newSheet,
  prose,
  type Item,
} from '@/lib/reports/report-pdf';
import { canvasToJpeg, imagePagesToPdf } from '@/lib/reports/pdf';

export interface AssessmentPdfInput {
  data: AssessmentDetailWire;
  trainerName: string | null;
}

interface Row {
  r: ReadingWire;
  value: number;
  sinceFirst: number | null;
  firstAt: number | null;
  firstValue: number | null;
  series: { at: number; value: number }[];
}

/** The readings this check-in came back with, minus health, with their record. */
function rowsOf(data: AssessmentDetailWire): Row[] {
  return data.readings
    .filter((r) => !HEALTH_MEASUREMENT_KEYS.has(r.key))
    .map((r) => {
      const points = data.history.find((h) => h.key === r.key)?.points ?? [];
      const st = measureStats(points, data.id);
      const upTo = st.current ? st.points.filter((p) => p.at <= st.current!.at) : st.points;
      return {
        r,
        value: st.current?.value ?? r.value,
        sinceFirst: st.sinceFirst,
        firstAt: st.sinceFirst !== null ? st.first?.at ?? null : null,
        firstValue: st.sinceFirst !== null ? st.first?.value ?? null : null,
        series: upTo.map((p) => ({ at: p.at, value: p.value })),
      };
    });
}

/**
 * The measurement that moved most, by size relative to where it started — never
 * by direction (no tone). Null on a first assessment, where nothing has moved yet.
 *
 * THE BODY FIRST. Ranked across everything, a plank that went 45 → 90 s (+100%)
 * always beats a waist that went 92 → 88 cm (−4%), so the sheet led with the
 * plank — and the review's whole example is the waist. A fitness test leads only
 * when no body measurement moved. `group === 'Movement'` is the tests, the same
 * test `lib/reports/build.ts` uses.
 */
function headline(rows: Row[]): Row | null {
  const pick = (from: Row[]) => {
    let best: Row | null = null;
    let score = 0;
    for (const row of from) {
      if (row.sinceFirst === null || row.sinceFirst === 0 || !row.firstValue) continue;
      const s = Math.abs(row.sinceFirst / row.firstValue);
      if (s > score) { score = s; best = row; }
    }
    return best;
  };
  return pick(rows.filter((r) => r.r.group !== 'Movement')) ?? pick(rows);
}

function figure(value: number, unit: string): string {
  return unit ? `${trim(value)} ${unit}` : trim(value);
}

/** "Waist −4 cm since August". */
export function headlineText(row: Row, at: number): string {
  return `${row.r.label} ${signed(row.sinceFirst!)}${row.r.unit ? ` ${row.r.unit}` : ''} since ${monthOf(row.firstAt!, at)}`;
}

/* ------------------------------------------------------------------ chrome */

function chrome(ctx: Ctx, clientName: string, when: number): void {
  drawMark(ctx, PAD, 96, 34);
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = font(700, 24, stacks.brand);
  ctx.fillText('Assessment', PAD + 50, 120);

  ctx.textAlign = 'right';
  ctx.fillStyle = INK_3;
  ctx.font = font(500, 21);
  ctx.fillText(fit(ctx, `${clientName}  ·  ${dayWords(when)}`, CW - 240), W - PAD, 120);

  ctx.fillStyle = LINE;
  ctx.fillRect(PAD, 150, CW, 1);
  ctx.fillRect(PAD, H - 116, CW, 1);

  drawMark(ctx, PAD, H - 98, 26);
  ctx.textAlign = 'left';
  ctx.fillStyle = INK_2;
  ctx.font = font(600, 20);
  ctx.fillText('Tracked on InclineYou', PAD + 40, H - 78);

  ctx.textAlign = 'right';
  ctx.fillStyle = INK_3;
  ctx.font = font(500, 19, stacks.mono);
  ctx.fillText(dayWords(when).toUpperCase(), W - PAD, H - 78);
  ctx.textAlign = 'left';
}

/** The client, large; the assessment and who coached them under it. */
function title(name: string, sub: string): Item {
  return {
    h: 150,
    draw(ctx, y) {
      ctx.textAlign = 'left';
      ctx.fillStyle = INK_3;
      ctx.font = font(500, 18, stacks.mono);
      ctx.letterSpacing = '1.6px';
      ctx.fillText('YOUR ASSESSMENT', PAD, y + 26);
      ctx.letterSpacing = '0px';

      ctx.fillStyle = INK;
      ctx.font = font(800, 60, stacks.brand);
      ctx.letterSpacing = '-1.6px';
      ctx.fillText(fit(ctx, name, CW), PAD, y + 92);
      ctx.letterSpacing = '0px';

      ctx.fillStyle = INK_2;
      ctx.font = font(500, 22);
      ctx.fillText(fit(ctx, sub, CW), PAD, y + 130);
    },
  };
}

/** The one sentence the sheet is for, in the brand's figure face. */
function hero(text: string, note: string): Item {
  return {
    h: 136,
    draw(ctx, y) {
      ctx.fillStyle = ACCENT;
      ctx.fillRect(PAD, y + 6, 6, 92);
      ctx.textAlign = 'left';
      ctx.fillStyle = ACCENT;
      ctx.font = font(800, 54, stacks.brand);
      ctx.letterSpacing = '-1.4px';
      ctx.fillText(fit(ctx, text, CW - 30), PAD + 28, y + 60);
      ctx.letterSpacing = '0px';
      ctx.fillStyle = INK_3;
      ctx.font = font(500, 20);
      ctx.fillText(fit(ctx, note, CW - 30), PAD + 28, y + 94);
    },
  };
}

function gap(h = 24): Item {
  return { h, draw() {} };
}

/* ------------------------------------------------------------------- page */

function buildItems(i: AssessmentPdfInput): { items: Item[]; left: number } {
  const { data } = i;
  const when = data.completedAt ?? Date.parse(`${data.dueOn}T00:00:00`);
  const name = data.client?.name?.trim() || 'Client';
  const rows = rowsOf(data);
  const top = headline(rows);

  const sub = [data.name, dayWords(when), i.trainerName ? `Coached by ${i.trainerName}` : null].filter(Boolean).join('  ·  ');
  const items: Item[] = [title(name, sub), gap(16)];

  items.push(top
    ? hero(headlineText(top, when), `${figure(top.firstValue!, top.r.unit)} then · ${figure(top.value, top.r.unit)} now`)
    : hero('Your starting point', 'Every assessment from here is measured against these numbers.'));
  items.push(gap(16));

  /* The tiles: what this assessment read, up to six, each with its move. */
  items.push(figureGrid(rows.slice(0, 6).map((row) => ({
    v: figure(row.value, row.r.unit),
    k: row.sinceFirst !== null
      ? `${row.r.label} · ${signed(row.sinceFirst)} since ${monthOf(row.firstAt!, when, true)}`
      : row.r.label,
  }))));
  items.push(gap(28));

  /* Every measurement, with its record — as many as the page holds. */
  const head = heading('Every measurement', 'Against your first reading on record');
  const tail = prose('Measured by your trainer and recorded in InclineYou. A change is the distance from your first reading, not a verdict on it.');
  const used = items.reduce((n, it) => n + it.h, 0) + head.h + tail.h + 16;
  const room = BOTTOM - TOP - used;
  const ROW_H = 78;
  const fits = Math.max(0, Math.floor(room / ROW_H));
  const shown = rows.slice(0, fits);
  const left = rows.length - shown.length;

  items.push(head);
  for (const row of shown) {
    items.push(detailRow({
      name: row.r.label,
      meta: row.sinceFirst !== null
        ? `First ${dayWords(row.firstAt!)}: ${figure(row.firstValue!, row.r.unit)}`
        : 'First reading',
      series: row.series,
      figure: figure(row.value, row.r.unit),
      delta: row.sinceFirst !== null ? signed(row.sinceFirst) : '—',
      deltaAccent: false,
    }));
  }
  items.push(gap(16));
  items.push(left > 0
    ? prose(`${left} more measurement${left === 1 ? '' : 's'} on your portal. ` + 'Measured by your trainer and recorded in InclineYou.')
    : tail);
  return { items, left };
}

/** The sheet, painted — exported so a preview draws exactly the page the file holds. */
export function paintAssessmentPage(i: AssessmentPdfInput): HTMLCanvasElement | null {
  if (i.data.state !== 'done' || rowsOf(i.data).length === 0) return null;
  resolveStacks();
  const sheet = newSheet();
  if (!sheet) return null;
  const { items } = buildItems(i);
  let y = TOP;
  for (const item of items) {
    item.draw(sheet.ctx, y);
    y += item.h;
  }
  const when = i.data.completedAt ?? Date.parse(`${i.data.dueOn}T00:00:00`);
  chrome(sheet.ctx, i.data.client?.name?.trim() || 'Client', when);
  return sheet.canvas;
}

/** Whether there is anything to put on paper: a done assessment with a non-health reading. */
export function hasAssessmentPdf(data: AssessmentDetailWire): boolean {
  return data.state === 'done' && rowsOf(data).length > 0;
}

export async function assessmentPdfBlob(i: AssessmentPdfInput): Promise<Blob | null> {
  try {
    await document.fonts?.ready;
  } catch {
    /* Paint with what is loaded. */
  }
  try {
    const canvas = paintAssessmentPage(i);
    if (!canvas) return null;
    const jpeg = await canvasToJpeg(canvas);
    if (!jpeg) return null;
    const name = i.data.client?.name?.trim() || 'Client';
    return imagePagesToPdf([jpeg], {
      title: `${name} — ${i.data.name}`,
      author: i.trainerName || 'InclineYou',
      subject: 'Assessment',
    });
  } catch {
    return null;
  }
}

/** `nithya-iyer-assessment-21-nov-2026.pdf`. */
export function assessmentPdfFilename(data: AssessmentDetailWire): string {
  const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const when = data.completedAt ?? Date.parse(`${data.dueOn}T00:00:00`);
  return `${slug(data.client?.name ?? 'client')}-assessment-${slug(dayWords(when))}.pdf`;
}

/* ------------------------------------------------------------------ words */

/** "August", or "Aug 2025" / "August 2025" when the year differs from `at`'s. */
function monthOf(first: number, at: number, short = false): string {
  const a = new Date(first);
  const b = new Date(at);
  const month = a.toLocaleDateString('en-IN', { month: short ? 'short' : 'long' });
  return a.getFullYear() === b.getFullYear() ? month : `${month} ${a.getFullYear()}`;
}

/** "21 Nov 2026". */
function dayWords(at: number): string {
  return new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
