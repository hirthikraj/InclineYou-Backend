/**
 * THE GYM STATEMENT, ON PAPER (26 Nov 2026).
 *
 * The first version was the Gym page's card through the browser's print dialog:
 * a grey card on white with the browser's own date and title in the margins — a
 * page that looked like a screenshot of a web app, sent to the one reader who has
 * a reason to doubt it. The owner's brief: make it look like the progress report,
 * branded, "Tracked on InclineYou" with the logo.
 *
 * So it is painted by the progress report's own hands (`lib/reports/report-pdf.ts`
 * exports the sheet, the measures, the headings, the prose and the tiles; the
 * mark is `drawMark`; the file is `pdf.ts`'s writer, no dependency) and differs
 * only where the document does:
 *
 *   · the READER is the gym's manager, so it speaks about "the trainer" in the
 *     third person — the WhatsApp message beside it is the trainer's own voice
 *     ("I", "my"), because that one is sent from their number;
 *   · the FOOT is the card's mark, not the report's date range: the logo and
 *     *Tracked on InclineYou* on every sheet, the page count on the right;
 *   · it ends with where the figures come from, the card's caveat: the trainer's
 *     own record, not the gym's.
 *
 * Every figure is one the Gym page draws, from the same `GymMoney`, so the screen,
 * the PDF and the message cannot disagree.
 */

import { rupees } from '@/lib/today/time';
import { signedRupees } from './gym-statement';
import {
  ACCENT,
  INK,
  INK_2,
  INK_3,
  LINE,
  SURFACE,
  drawMark,
  fit,
  font,
  resolveStacks,
  roundRect,
  stacks,
  type Ctx,
} from '@/lib/reports/card-image';
import {
  CW,
  H,
  PAD,
  TOP,
  W,
  figureGrid,
  heading,
  newSheet,
  planPages,
  prose,
  type Item,
} from '@/lib/reports/report-pdf';
import { canvasToJpeg, imagePagesToPdf, type PdfImagePage } from '@/lib/reports/pdf';
import type { Arrangement, GymMoney } from './types';

export interface StatementPdfInput {
  gym: GymMoney;
  gymName: string;
  /** "November 2026", or "the last 3 months". */
  periodLabel: string;
  /** Who it is from. Null when the profile has no name. */
  trainerName: string | null;
  /** The instant it was made, for the "Prepared" line. */
  now: number;
}

/* ------------------------------------------------------------------ chrome */

function chrome(ctx: Ctx, i: StatementPdfInput, page: number, of: number): void {
  drawMark(ctx, PAD, 96, 34);
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = font(700, 24, stacks.brand);
  ctx.fillText('Gym statement', PAD + 50, 120);

  ctx.textAlign = 'right';
  ctx.fillStyle = INK_3;
  ctx.font = font(500, 21);
  ctx.fillText(fit(ctx, `${i.gymName}  ·  ${capital(i.periodLabel)}`, CW - 260), W - PAD, 120);

  ctx.fillStyle = LINE;
  ctx.fillRect(PAD, 150, CW, 1);
  ctx.fillRect(PAD, H - 116, CW, 1);

  /* The card's foot, on every sheet: the mark and *Tracked on InclineYou*. Small
     and at the foot, never over the figures — the card's own rule for it. */
  drawMark(ctx, PAD, H - 98, 26);
  ctx.textAlign = 'left';
  ctx.fillStyle = INK_2;
  ctx.font = font(600, 20);
  ctx.fillText('Tracked on InclineYou', PAD + 40, H - 78);

  ctx.textAlign = 'right';
  ctx.fillStyle = INK_3;
  ctx.font = font(500, 19, stacks.mono);
  ctx.fillText(`${page} / ${of}`, W - PAD, H - 78);
  ctx.textAlign = 'left';
}

/* ------------------------------------------------------------------ pieces */

/** The title block: the gym, large, and who prepared it for which period. */
function title(i: StatementPdfInput): Item {
  return {
    h: 150,
    draw(ctx, y) {
      ctx.textAlign = 'left';
      ctx.fillStyle = INK_3;
      ctx.font = font(500, 18, stacks.mono);
      ctx.letterSpacing = '1.6px';
      ctx.fillText('SETTLEMENT STATEMENT', PAD, y + 26);
      ctx.letterSpacing = '0px';

      ctx.fillStyle = INK;
      ctx.font = font(800, 60, stacks.brand);
      ctx.letterSpacing = '-1.6px';
      ctx.fillText(fit(ctx, i.gymName, CW), PAD, y + 92);
      ctx.letterSpacing = '0px';

      ctx.fillStyle = INK_2;
      ctx.font = font(500, 22);
      const by = i.trainerName ? `Prepared by ${i.trainerName}` : 'Prepared by the trainer';
      ctx.fillText(fit(ctx, `${capital(i.periodLabel)}  ·  ${by}  ·  ${dayWords(i.now)}`, CW), PAD, y + 130);
    },
  };
}

/** A label, its figure on the right, an optional note under the label. Ruled below. */
function factRow(k: string, v: string, note?: string, accent = false): Item {
  return {
    h: note ? 82 : 62,
    draw(ctx, y) {
      ctx.textAlign = 'right';
      ctx.fillStyle = accent ? ACCENT : INK;
      ctx.font = font(700, 26, stacks.mono);
      ctx.fillText(v, W - PAD, y + 36);
      const vw = ctx.measureText(v).width;

      ctx.textAlign = 'left';
      ctx.fillStyle = INK;
      ctx.font = font(600, 22);
      ctx.fillText(fit(ctx, k, CW - vw - 40), PAD, y + 36);
      if (note) {
        ctx.fillStyle = INK_3;
        ctx.font = font(400, 18);
        ctx.fillText(fit(ctx, note, CW - vw - 40), PAD, y + 62);
      }

      ctx.fillStyle = LINE;
      ctx.fillRect(PAD, y + (note ? 81 : 61), CW, 1);
    },
  };
}

interface Col { k: string; w: number; right?: boolean }

/** A table head: small mono capitals on a surface band. */
function tableHead(cols: Col[]): Item {
  return {
    h: 50,
    keepWithNext: true,
    draw(ctx, y) {
      ctx.fillStyle = SURFACE;
      roundRect(ctx, PAD, y, CW, 40, 8);
      ctx.fill();
      ctx.fillStyle = INK_3;
      ctx.font = font(500, 15, stacks.mono);
      ctx.letterSpacing = '1.2px';
      cellsAt(cols).forEach(({ x, w, right }, n) => {
        ctx.textAlign = right ? 'right' : 'left';
        ctx.fillText(fit(ctx, cols[n].k.toUpperCase(), w - 12), right ? x + w - 14 : x + 14, y + 26);
      });
      ctx.letterSpacing = '0px';
      ctx.textAlign = 'left';
    },
  };
}

function tableRow(cols: Col[], values: string[], opts: { strong?: boolean; dim?: boolean } = {}): Item {
  return {
    h: 52,
    draw(ctx, y) {
      cellsAt(cols).forEach(({ x, w, right }, n) => {
        const first = n === 0;
        ctx.textAlign = right ? 'right' : 'left';
        ctx.fillStyle = opts.dim ? INK_3 : first || opts.strong ? INK : INK_2;
        ctx.font = first ? font(600, 20) : font(opts.strong ? 700 : 500, 20, stacks.mono);
        ctx.fillText(fit(ctx, values[n] ?? '', w - 16), right ? x + w - 14 : x + 14, y + 33);
      });
      ctx.textAlign = 'left';
      ctx.fillStyle = LINE;
      ctx.fillRect(PAD, y + 51, CW, 1);
    },
  };
}

function cellsAt(cols: Col[]): Array<{ x: number; w: number; right?: boolean }> {
  const total = cols.reduce((n, c) => n + c.w, 0);
  let x = PAD;
  return cols.map((c) => {
    const w = (c.w / total) * CW;
    const at = { x, w, right: c.right };
    x += w;
    return at;
  });
}

/** Air between sections. */
function gap(h = 28): Item {
  return { h, draw() {} };
}

/** The pay terms in one sentence, the Gym page's own wording, in the third person. */
function termsLine(a: Arrangement): string {
  if (a.baseKind === 'minimum') return `At least ${rupees(a.baseAmount)} a month, or the trainer’s share if that is more`;
  if (a.baseKind === 'basic') return `${rupees(a.baseAmount)} a month plus the trainer’s share`;
  return 'The trainer’s share of each sale';
}

/* ------------------------------------------------------------------- flow */

function buildItems(i: StatementPdfInput): Item[] {
  const { gym, gymName } = i;
  const s = gym.statement!;
  const share = Math.max(0, gym.stats.floorBilled - gym.stats.gymCut);
  const items: Item[] = [title(i), gap(20)];

  items.push(heading(capital(i.periodLabel), 'What the trainer did for the gym, by when each pack was sold'));
  items.push(figureGrid([
    { v: String(s.clientsCoached), k: 'Clients coached' },
    { v: String(s.sessionsDelivered), k: 'Sessions delivered' },
    { v: String(s.newSales + s.renewals), k: `Packs sold · ${s.newSales} new` },
    { v: rupees(s.billedYouBrought + s.billedGymDesk), k: 'Sales driven' },
    // Not the gym's name: a tile is ~340px and a long name cut off mid-word is worse than "Gym".
    { v: rupees(gym.stats.gymCut), k: 'Gym’s share' },
    { v: rupees(share), k: 'Trainer’s share' },
  ]));
  items.push(gap());

  items.push(heading('Money between you'));
  items.push(factRow(`Paid to the trainer by ${gymName}`, rupees(s.received), `In ${i.periodLabel}`));
  if (gym.settlement) {
    const due = gym.settlement.balanceDue;
    items.push(due < 0
      ? factRow('Still owed to the trainer', rupees(0), `${gymName} has paid ${rupees(due)} ahead, as of the last closed month`)
      : factRow('Still owed to the trainer', rupees(due), 'As of the last closed month', due > 0));
    if (gym.settlement.arrangement) {
      items.push(factRow('Pay terms', '', termsLine(gym.settlement.arrangement)));
    }
  }
  items.push(gap());

  /* The months that settle the argument: what was owed against what arrived, the
     last six closed ones (the running month owes nothing yet). */
  const months = (gym.settlement?.months ?? []).filter((m) => !m.soFar).slice(-6);
  if (months.length > 0) {
    const cols: Col[] = [
      { k: 'Month', w: 2.2 }, { k: 'Clients', w: 1, right: true }, { k: 'Trainer’s share', w: 1.6, right: true },
      { k: 'Owed', w: 1.4, right: true }, { k: 'Received', w: 1.4, right: true }, { k: 'Balance', w: 1.4, right: true },
    ];
    items.push(heading('Month by month', 'Closed months, by when money landed · a minus balance is paid ahead'));
    items.push(tableHead(cols));
    for (const m of months) {
      items.push(tableRow(cols, [
        monthWords(m.month), String(m.clients), rupees(m.yourShare), rupees(m.owed), rupees(m.received),
        m.balance === null ? '—' : signedRupees(m.balance),
      ]));
    }
    items.push(gap());
  }

  const sold = gym.shares.filter((r) => r.sold > 0);
  if (sold.length > 0) {
    const cols: Col[] = [
      { k: 'Pack', w: 2.6 }, { k: 'Trainer’s part', w: 1.5, right: true }, { k: 'Sold', w: 0.8, right: true },
      { k: 'Billed', w: 1.4, right: true }, { k: 'Trainer', w: 1.4, right: true }, { k: 'Gym', w: 1.4, right: true },
    ];
    items.push(heading('Pack by pack', `What each ${gymName} pack sold and how it split`));
    items.push(tableHead(cols));
    for (const r of sold) {
      const part = r.trainerSharePercent !== null ? `${r.trainerSharePercent}%`
        : r.trainerShareAmount !== null ? `${rupees(r.trainerShareAmount)} flat` : '—';
      items.push(tableRow(cols, [r.packName, part, String(r.sold), rupees(r.billed), rupees(r.trainerTake), rupees(r.gymCut)]));
    }
    items.push(gap());
  }

  items.push(heading('Where the clients came from'));
  items.push(factRow('Clients the trainer brought', rupees(s.billedYouBrought), 'Sales to them in the period'));
  items.push(factRow(`Sent by ${gymName}’s desk`, rupees(s.billedGymDesk), 'Sales to them in the period'));
  items.push(factRow('Packs sold', `${s.newSales} new · ${s.renewals} renewed`));
  items.push(gap());

  if (gym.lifetime?.since) {
    const l = gym.lifetime;
    items.push(heading(`Since ${monthWords(l.since!)}`));
    items.push(prose(`${l.sales} pack${l.sales === 1 ? '' : 's'} sold for ${gymName} · ${rupees(l.billed)} billed · ${rupees(l.gymCut)} to the gym · ${rupees(l.yours)} to the trainer · ${rupees(l.received)} paid to the trainer.`));
    items.push(gap());
  }

  items.push(heading('How these figures are kept'));
  items.push(prose(
    'From the trainer’s own records in InclineYou: the packs they sold, the sessions they marked done and the payouts they recorded. '
    + 'A client counts as the gym desk’s when that is where the trainer noted they came from. It is the trainer’s record, not the gym’s.',
  ));
  return items;
}

/* ------------------------------------------------------------------- file */

/**
 * The sheets, painted — what the PDF is made of, exported so a preview can draw
 * exactly the pages the file will hold. Await `document.fonts.ready` first.
 */
export function paintGymStatementPages(i: StatementPdfInput): HTMLCanvasElement[] | null {
  if (!i.gym.statement) return null;
  resolveStacks();
  const plan = planPages(buildItems(i));
  const out: HTMLCanvasElement[] = [];
  for (let n = 0; n < plan.length; n += 1) {
    const sheet = newSheet();
    if (!sheet) return null;
    let y = TOP;
    for (const item of plan[n]) {
      item.draw(sheet.ctx, y);
      y += item.h;
    }
    chrome(sheet.ctx, i, n + 1, plan.length);
    out.push(sheet.canvas);
  }
  return out;
}

/** The statement as a PDF blob, or null where the browser would not paint it. */
export async function gymStatementPdfBlob(i: StatementPdfInput): Promise<Blob | null> {
  try {
    await document.fonts?.ready;
  } catch {
    /* Paint with what is loaded. */
  }
  try {
    const sheets = paintGymStatementPages(i);
    if (!sheets) return null;
    const pages: PdfImagePage[] = [];
    for (const canvas of sheets) {
      const jpeg = await canvasToJpeg(canvas);
      if (!jpeg) return null;
      pages.push(jpeg);
    }
    return imagePagesToPdf(pages, {
      title: `${i.gymName} — gym statement, ${i.periodLabel}`,
      author: i.trainerName || 'InclineYou',
      subject: 'Settlement statement',
    });
  } catch {
    return null;
  }
}

/** `iron-temple-fitness-statement-november-2026.pdf`. */
export function gymStatementFilename(i: Pick<StatementPdfInput, 'gymName' | 'periodLabel'>): string {
  const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug(i.gymName)}-statement-${slug(i.periodLabel)}.pdf`;
}

/* ------------------------------------------------------------------ words */

function capital(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "November 2026" from yyyy-MM. */
function monthWords(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** "26 Nov 2026". */
function dayWords(at: number): string {
  return new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
