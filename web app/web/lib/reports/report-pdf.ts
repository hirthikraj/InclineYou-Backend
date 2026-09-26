/**
 * THE FULL REPORT, ON PAPER — the PDF's pages, painted.
 *
 * The card is the thing a client posts and the PDF is the thing they keep, and
 * they are different documents rather than two sizes of one. The card drops
 * whatever will not fit above its footer, because everything on a card has to
 * be true and a card with a hole in it is worse than a card with three lifts on
 * it. Paper has no such limit: this carries **every** lift, **every** movement
 * trained whether or not it went up, **every** measurement with its whole
 * series, and — at the end, where the card could never put it — the note
 * saying how each figure was arrived at.
 *
 * ── WHY IT IS PAINTED AND NOT LAID OUT AS PDF TEXT ──────────────────────────
 *
 * `pdf.ts` carries the dependency argument; this is the design one. A page of
 * real PDF text needs font programs, encodings and widths tables, and the faces
 * on this report are `next/font`-hosted Inter, Archivo and JetBrains Mono —
 * three subsetted WOFF2 files a canvas can draw and a PDF writer cannot embed
 * without a font parser. The alternative is Helvetica, which means the PDF a
 * trainer sends is in a different typeface from the card and the screen. A
 * report that looks like three products is worse than one whose text cannot be
 * selected.
 *
 * ── THE PAGINATION IS A FLOW, NOT A SET OF PAGES ────────────────────────────
 *
 * The content is genuinely variable: a client with two measurements and four
 * lifts, a client with nine measurements and thirty-one movements. So nothing
 * here decides that "the lifts are page two". Every section emits a list of
 * ITEMS, each of which knows its own height, and `paginate` fills a sheet until
 * the next item will not fit and then starts another. A section heading is
 * `keepWithNext`, so a page never ends on a title with nothing under it.
 *
 * The one thing that is fixed is page one: the card, on paper, whole. It is
 * what the client opens the attachment expecting to see.
 */

import type { ClientReport, ExerciseWork, LiftGain, MetricChange } from './build';
import { dateRange, longDate, shortDate, signed, trim } from './build';
import {
  ACCENT,
  CANVAS,
  INK,
  INK_2,
  INK_3,
  LINE,
  SURFACE,
  drawMark,
  fit,
  font,
  paintReportCard,
  resolveStacks,
  roundRect,
  sparkline,
  stacks,
  type Ctx,
} from './card-image';
import { A4_PX, canvasToJpeg, imagePagesToPdf, type PdfImagePage } from './pdf';

const W = A4_PX.w;
const H = A4_PX.h;
const PAD = 88;
/** The measure — 1,064px at 150 dpi, which is 180mm. */
const CW = W - PAD * 2;
/** Where a sheet's content starts and stops. The bands above and below are the
 *  running head and foot, and no item may enter them. */
const TOP = 196;
const BOTTOM = 1636;
const ROOM = BOTTOM - TOP;

/* ------------------------------------------------------------------- items */

interface Item {
  h: number;
  draw: (ctx: Ctx, y: number) => void;
  /** A heading. Never the last thing on a sheet. */
  keepWithNext?: boolean;
}

function newSheet(): { canvas: HTMLCanvasElement; ctx: Ctx } | null {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = CANVAS;
  ctx.fillRect(0, 0, W, H);
  return { canvas, ctx };
}

/** The running head and foot. Drawn on every sheet including the card's, so a
 *  page that arrives on its own out of a chat still says who it is about. */
function chrome(ctx: Ctx, r: ClientReport, page: number, of: number): void {
  drawMark(ctx, PAD, 96, 34);

  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = font(700, 24, stacks.brand);
  ctx.fillText('Progress report', PAD + 50, 120);

  ctx.textAlign = 'right';
  ctx.fillStyle = INK_3;
  ctx.font = font(500, 21);
  ctx.fillText(fit(ctx, `${r.clientName}  ·  ${r.weeks} weeks`, CW - 240), W - PAD, 120);

  ctx.fillStyle = LINE;
  ctx.fillRect(PAD, 150, CW, 1);
  ctx.fillRect(PAD, H - 116, CW, 1);

  ctx.textAlign = 'left';
  ctx.fillStyle = INK_3;
  ctx.font = font(500, 19);
  ctx.fillText(
    fit(ctx, `${dateRange(r.from, r.to)}${r.trainerName ? `  ·  ${r.trainerName}` : ''}`, CW - 200),
    PAD,
    H - 84,
  );

  ctx.textAlign = 'right';
  ctx.font = font(500, 19, stacks.mono);
  ctx.fillText(`${page} / ${of}`, W - PAD, H - 84);
  ctx.textAlign = 'left';
}

/* ------------------------------------------------------------- the pieces */

/** A section rule and its title. `keepWithNext`, always. */
function heading(text: string, note?: string): Item {
  return {
    h: note ? 96 : 74,
    keepWithNext: true,
    draw(ctx, y) {
      ctx.fillStyle = ACCENT;
      roundRect(ctx, PAD, y + 8, 40, 5, 2.5);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.fillStyle = INK;
      ctx.font = font(800, 30, stacks.brand);
      ctx.letterSpacing = '-0.6px';
      ctx.fillText(text, PAD, y + 48);
      ctx.letterSpacing = '0px';

      if (note) {
        ctx.fillStyle = INK_3;
        ctx.font = font(500, 20);
        ctx.fillText(fit(ctx, note, CW), PAD, y + 78);
      }
    },
  };
}

/** Wrapped prose, at the report's smallest reading size. */
function prose(text: string): Item {
  const LH = 30;
  /* The lines are measured at draw time and counted at build time, which means
     measuring twice — the height has to be known before the sheet exists. A
     detached context is used for the count, with the same stacks resolved. */
  const lines = wrap(measurer(), text, CW, font(400, 20));
  return {
    h: lines.length * LH + 14,
    draw(ctx, y) {
      ctx.textAlign = 'left';
      ctx.fillStyle = INK_2;
      ctx.font = font(400, 20);
      lines.forEach((line, i) => ctx.fillText(line, PAD, y + 20 + i * LH));
    },
  };
}

let MEASURER: Ctx | null = null;
function measurer(): Ctx {
  if (MEASURER) return MEASURER;
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 8;
  MEASURER = c.getContext('2d')!;
  return MEASURER;
}

function wrap(ctx: Ctx, text: string, max: number, withFont: string): string[] {
  ctx.font = withFont;
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > max && line) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out;
}

/**
 * THE SIX FIGURES, AS A GRID OF TILES.
 *
 * Three across and two down rather than six across: at 1,064px six tiles are
 * 170px each and `OF WHAT WE BOOKED` does not fit on one line at a size worth
 * setting it at — the same arithmetic that put `.strip--wrap` in the design
 * system for the screen's own version of this row.
 */
function figureGrid(cells: Array<{ v: string; k: string }>): Item {
  const COLS = 3;
  const TH = 128;
  const GAP = 16;
  const rows = Math.ceil(cells.length / COLS);
  return {
    h: rows * TH + (rows - 1) * GAP + 14,
    draw(ctx, y) {
      const tw = (CW - GAP * (COLS - 1)) / COLS;
      cells.forEach((cell, i) => {
        const x = PAD + (i % COLS) * (tw + GAP);
        const ty = y + Math.floor(i / COLS) * (TH + GAP);

        ctx.fillStyle = SURFACE;
        roundRect(ctx, x, ty, tw, TH, 14);
        ctx.fill();
        ctx.strokeStyle = LINE;
        ctx.lineWidth = 1;
        roundRect(ctx, x + 0.5, ty + 0.5, tw - 1, TH - 1, 14);
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.fillStyle = ACCENT;
        ctx.font = font(800, 54, stacks.brand);
        ctx.letterSpacing = '-1.4px';
        ctx.fillText(fit(ctx, cell.v, tw - 40), x + 20, ty + 72);
        ctx.letterSpacing = '0px';

        ctx.fillStyle = INK_3;
        ctx.font = font(500, 17, stacks.mono);
        ctx.letterSpacing = '1.4px';
        ctx.fillText(fit(ctx, cell.k.toUpperCase(), tw - 34), x + 20, ty + 104);
        ctx.letterSpacing = '0px';
      });
    },
  };
}

/**
 * ONE BAR PER WEEK, WITH THE WEEK'S OWN COUNT ABOVE IT.
 *
 * The card's version is the same shape with the figures left off, because a
 * card is read at arm's length and twelve two-digit numbers at that size are
 * noise. Paper is read at a desk, and the number above the bar is what turns
 * *"a good stretch in August"* into *"four, four, three, four"*.
 */
function weekChart(r: ClientReport): Item {
  const PLOT = 210;
  return {
    h: PLOT + 72,
    draw(ctx, y) {
      const n = r.weekSeries.length;
      const gap = n > 16 ? 5 : 9;
      const even = (CW - gap * (n - 1)) / n;
      const bw = Math.min(74, even);
      const step = bw < even && n > 1 ? (CW - bw) / (n - 1) : bw + gap;
      const floor = y + PLOT;

      /* Three rules, and the top one is the peak. Without them a column of
         bars has no scale and the tallest is just the tallest. */
      for (const at of [0, 0.5, 1]) {
        ctx.fillStyle = LINE;
        ctx.fillRect(PAD, floor - at * (PLOT - 46), CW, 1);
        /* Ranged RIGHT onto the margin, not left off it. Drawn `textAlign:
           'left'` at `PAD - 4` the labels started 4px OUTSIDE the measure and
           a two-digit peak ran further; ranged right they end on it, and a
           `2` and a `12` share the same edge. */
        ctx.textAlign = 'right';
        ctx.fillStyle = INK_3;
        ctx.font = font(500, 16, stacks.mono);
        ctx.fillText(
          String(Math.round(at * r.bestWeek)),
          PAD - 10,
          floor - at * (PLOT - 46) - 6,
        );
      }

      r.weekSeries.forEach((week, i) => {
        const x = PAD + i * step;
        /* An empty week is a stub and not a gap, which is the card's rule and
           matters more here: on a sheet with a rule behind it, a missing bar
           reads as missing data and a 5px bar reads as a week off. */
        const h = week.count === 0 ? 5 : Math.max(14, (week.count / r.bestWeek) * (PLOT - 46));
        ctx.fillStyle = week.count === 0 ? LINE : ACCENT;
        roundRect(ctx, x, floor - h, bw, h, Math.min(5, bw / 2));
        ctx.fill();

        if (week.count > 0) {
          ctx.textAlign = 'center';
          ctx.fillStyle = INK_2;
          ctx.font = font(700, 19, stacks.mono);
          ctx.fillText(String(week.count), x + bw / 2, floor - h - 12);
        }

        /* Every week is numbered and only some are dated: `w1` under a 40px
           column is legible and `29 Jun` is not, so the date is drawn on the
           first, the last, and every fourth between them. */
        ctx.textAlign = 'center';
        ctx.fillStyle = INK_3;
        ctx.font = font(500, 15, stacks.mono);
        ctx.fillText(`w${week.index}`, x + bw / 2, floor + 26);
        if (i === 0 || i === n - 1 || (i + 1) % 4 === 0) {
          ctx.fillText(shortDate(week.from), x + bw / 2, floor + 48);
        }
      });
      ctx.textAlign = 'left';
    },
  };
}

/**
 * A NAME, A SERIES, A PAIR OF NUMBERS AND A FOOTNOTE — the paper version of
 * `c-progrow`.
 *
 * The same four facts in the same four places as the screen, which is the point
 * of building it this way round: a trainer who reads the report on screen and
 * then sends the PDF has sent what they read.
 */
function detailRow(row: {
  name: string;
  meta: string;
  series: Array<{ at: number; value: number }>;
  figure: string;
  delta: string;
  deltaAccent: boolean;
}): Item {
  return {
    h: 78,
    draw(ctx, y) {
      ctx.font = font(700, 25, stacks.mono);
      const deltaW = ctx.measureText(row.delta).width;
      const deltaRight = W - PAD;
      const figureRight = deltaRight - deltaW - 24;
      const sparkW = 196;
      const sparkX = figureRight - ctx.measureText(row.figure).width - sparkW - 24;

      ctx.textAlign = 'left';
      ctx.fillStyle = INK;
      ctx.font = font(700, 22, stacks.brand);
      ctx.fillText(fit(ctx, row.name, Math.max(160, sparkX - PAD - 20)), PAD, y + 28);

      ctx.fillStyle = INK_3;
      ctx.font = font(400, 18);
      ctx.fillText(fit(ctx, row.meta, Math.max(160, sparkX - PAD - 20)), PAD, y + 54);

      if (row.series.length >= 3) {
        sparkline(ctx, row.series, sparkX, y + 8, sparkW, 42);
      } else {
        ctx.fillStyle = INK_3;
        ctx.font = font(400, 16, stacks.mono);
        ctx.textAlign = 'center';
        ctx.fillText('too few readings', sparkX + sparkW / 2, y + 36);
      }

      ctx.textAlign = 'right';
      ctx.fillStyle = INK;
      ctx.font = font(700, 25, stacks.mono);
      ctx.fillText(row.figure, figureRight, y + 38);

      ctx.fillStyle = row.deltaAccent ? ACCENT : INK_3;
      ctx.font = font(600, 23, stacks.mono);
      ctx.fillText(row.delta, deltaRight, y + 38);

      ctx.textAlign = 'left';
      ctx.fillStyle = LINE;
      ctx.fillRect(PAD, y + 77, CW, 1);
    },
  };
}

/** The census' header row, repeated on every sheet its rows flow onto — a
 *  column of figures with no header on page three is a column of figures. */
const CENSUS_COLS: Array<{ k: string; w: number; right?: boolean }> = [
  { k: 'Movement', w: 0.34 },
  { k: 'Days', w: 0.09, right: true },
  { k: 'Sets', w: 0.09, right: true },
  { k: 'Reps', w: 0.1, right: true },
  { k: 'Load', w: 0.15, right: true },
  { k: 'Top set', w: 0.12, right: true },
  { k: 'Change', w: 0.11, right: true },
];

function censusHead(): Item {
  return {
    h: 44,
    keepWithNext: true,
    draw(ctx, y) {
      let x = PAD;
      ctx.fillStyle = INK_3;
      ctx.font = font(600, 16, stacks.mono);
      ctx.letterSpacing = '1.2px';
      for (const col of CENSUS_COLS) {
        const cw = col.w * CW;
        ctx.textAlign = col.right ? 'right' : 'left';
        ctx.fillText(col.k.toUpperCase(), col.right ? x + cw : x, y + 22);
        x += cw;
      }
      ctx.letterSpacing = '0px';
      ctx.textAlign = 'left';
      ctx.fillStyle = LINE;
      ctx.fillRect(PAD, y + 34, CW, 1);
    },
  };
}

function censusRow(e: ExerciseWork): Item {
  return {
    h: 42,
    draw(ctx, y) {
      const cells = [
        e.name,
        String(e.days),
        String(e.sets),
        e.reps > 0 ? String(e.reps) : '—',
        e.volumeKg > 0 ? `${e.volumeKg.toLocaleString('en-IN')} kg` : '—',
        e.topLoad !== null
          ? `${trim(e.topLoad)} kg`
          : e.topReps !== null
            ? `${e.topReps} reps`
            : '—',
        e.gainPercent !== null ? `+${e.gainPercent}%` : '—',
      ];

      let x = PAD;
      CENSUS_COLS.forEach((col, i) => {
        const cw = col.w * CW;
        ctx.textAlign = col.right ? 'right' : 'left';
        if (i === 0) {
          ctx.fillStyle = INK;
          ctx.font = font(600, 19);
          /* The room for the name is the column minus whatever the NEW tag
             takes, so a long name ellipses rather than running under it. */
          const tagW = e.isNew ? 58 : 0;
          ctx.fillText(fit(ctx, cells[0], cw - 16 - tagW), x, y + 27);
          if (e.isNew) {
            /* The one flag on the census, and it is the row a trainer looks
               for: a movement whose FIRST EVER set is inside this window is a
               movement the client learned, which is progress no figure in the
               table records. */
            const nameW = ctx.measureText(fit(ctx, cells[0], cw - 16 - tagW)).width;
            ctx.fillStyle = 'rgba(198,242,78,0.14)';
            roundRect(ctx, x + nameW + 10, y + 10, 46, 22, 5);
            ctx.fill();
            ctx.fillStyle = ACCENT;
            ctx.font = font(700, 13, stacks.mono);
            ctx.letterSpacing = '0.8px';
            ctx.fillText('NEW', x + nameW + 18, y + 26);
            ctx.letterSpacing = '0px';
          }
        } else {
          ctx.fillStyle = i === 6 && e.gainPercent !== null ? ACCENT : INK_2;
          ctx.font = font(500, 19, stacks.mono);
          ctx.fillText(cells[i], x + cw, y + 27);
        }
        x += cw;
      });

      ctx.textAlign = 'left';
      ctx.fillStyle = LINE;
      ctx.fillRect(PAD, y + 41, CW, 1);
    },
  };
}

/* ---------------------------------------------------------------- sections */

function measurementRow(m: MetricChange): Item {
  return detailRow({
    name: m.label,
    meta: m.baselineIsOlder
      ? `one reading in the window · measured from ${shortDate(m.firstAt)}, before it opened`
      : `${m.readings} readings · ${shortDate(m.firstAt)} to ${shortDate(m.lastAt)}`,
    series: m.series,
    figure: `${trim(m.from)} → ${trim(m.to)} ${m.unit}`.trim(),
    /* No accent, ever. The rule this whole report is built on: a waist going up
       on a client putting on muscle is the plan working, and this product holds
       no field that tells that apart from the same number on a client cutting. */
    delta: signed(m.delta),
    deltaAccent: false,
  });
}

function liftRow(l: LiftGain): Item {
  return detailRow({
    name: l.name,
    /* `· best set on day one against the best in the window` was here and
       MEASURED as an ellipsis in the generated file: the meta line shares the
       name's track, which is what is left after a fixed spark and a measured
       figure, and on every one of six rows it cut at *"the best in the …"*.
       The sentence is on the sheet once, under `How this was measured`, which
       is the whole reason that section exists — a methodology note repeated on
       every row is a methodology note nobody finishes. */
    meta: `${l.days} days · ${l.sets} sets`,
    series: l.series,
    figure: `${trim(l.from)} → ${trim(l.to)} ${l.unit}`,
    delta: `+${l.percent}%`,
    deltaAccent: true,
  });
}

const METHOD = [
  'ADHERENCE is over sessions that settled — done, or a no-show. A booking nobody ever marked is in neither half of it: not counted as done, and not counted against you.',
  'A PERSONAL BEST is measured against every set you have ever logged, not against this window, so a record here is a real record. Working up 40, 45 and 50 in one session is one best, not three.',
  'GETTING STRONGER compares the best set on the FIRST day of the window against the best set anywhere in it — not against the last day, because a block often closes on a deload and a real gain would read as a loss.',
  'A MEASUREMENT is measured from the last reading taken before the window opened, where there is one, so a change is a change against what was true at the start rather than against the first time somebody got the tape out.',
  'NOTHING HERE IS SHADED GOOD OR BAD. Weight, waist and chest are printed with their sign and no colour: up is not bad and down is not good, and which way a number should be going is between you and your trainer.',
];

function buildItems(r: ClientReport): Item[] {
  const items: Item[] = [];
  const s = r.sessions;

  /* ── turning up ─────────────────────────────────────────────────────────── */
  items.push(heading('Turning up', `${dateRange(r.from, r.to)} — ${r.weeks} weeks`));
  items.push(
    figureGrid(
      [
        { v: String(s.attended), k: s.attended === 1 ? 'session done' : 'sessions done' },
        s.adherence !== null ? { v: `${s.adherence}%`, k: 'of what we booked' } : null,
        r.bestStreak > 1 ? { v: `${r.bestStreak}`, k: 'weeks in a row' } : null,
        r.prCount > 0
          ? { v: String(r.prCount), k: r.prCount === 1 ? 'personal best' : 'personal bests' }
          : null,
        r.exerciseCount > 0 ? { v: String(r.exerciseCount), k: 'movements trained' } : null,
        r.volumeKg > 0
          ? {
              v:
                r.volumeKg >= 1000
                  ? `${(r.volumeKg / 1000).toFixed(1)}t`
                  : `${r.volumeKg}kg`,
              k: 'total load moved',
            }
          : null,
      ]
        .filter((c): c is { v: string; k: string } => c !== null)
        /* SIX, and the cap is about the GRID rather than about the figures.
           `sets logged` was a seventh and MEASURED as one tile alone on a
           third row of three — which reads as a tile that failed to load
           rather than as a figure with nothing beside it. Six is two full
           rows, and it is the same six the screen's own `c-strip` carries, so
           the sheet and the screen lead with the same numbers. The set count
           is still on the sheet: it is a column of the census. */
        .slice(0, 6),
    ),
  );
  if (r.bestWeek > 0) items.push(weekChart(r));
  if (s.unmarked > 0) {
    items.push(
      prose(
        `${s.unmarked} past session${s.unmarked === 1 ? '' : 's'} in this window ${
          s.unmarked === 1 ? 'was' : 'were'
        } never marked one way or the other, so ${
          s.unmarked === 1 ? 'it is' : 'they are'
        } in neither figure above.`,
      ),
    );
  }

  /* ── the body ───────────────────────────────────────────────────────────── */
  const metrics = [r.weight, ...r.measurements].filter((m): m is MetricChange => m !== null);
  if (metrics.length > 0) {
    items.push(
      heading(
        'Measurements',
        `${metrics.length} measured, start to latest, with every reading in between`,
      ),
    );
    for (const m of metrics) items.push(measurementRow(m));
  }

  /* ── the lifts ──────────────────────────────────────────────────────────── */
  if (r.lifts.length > 0) {
    items.push(
      heading(
        'Getting stronger',
        `${r.lifts.length} movement${r.lifts.length === 1 ? '' : 's'} went up — biggest proportional gain first`,
      ),
    );
    for (const l of r.lifts) items.push(liftRow(l));
  }

  /* ── the census ─────────────────────────────────────────────────────────── */
  if (r.exercises.length > 0) {
    items.push(
      heading(
        'Every movement trained',
        r.newExerciseCount > 0
          ? `${r.exercises.length} in total, ${r.newExerciseCount} of them for the first time`
          : `${r.exercises.length} in total, most-trained first`,
      ),
    );
    items.push(censusHead());
    for (const e of r.exercises) items.push(censusRow(e));
  }

  /* ── and how ────────────────────────────────────────────────────────────── */
  items.push(heading('How this was measured'));
  for (const paragraph of METHOD) items.push(prose(paragraph));

  return items;
}

/* -------------------------------------------------------------- the sheets */

/**
 * PAGE ONE: THE CARD, ON PAPER.
 *
 * `paintReportCard` unmodified and drawn as an image, which is the whole
 * `CardPreview` argument applied one artefact further along: two renderings of
 * the same figures drift, and the one that drifts is the one nobody looks at.
 * The card a client gets in the PDF is byte-for-byte the card they get in the
 * chat.
 */
function paintCoverSheet(r: ClientReport, page: number, of: number): HTMLCanvasElement | null {
  const sheet = newSheet();
  if (!sheet) return null;
  const { canvas, ctx } = sheet;

  const card = paintReportCard(r);
  /* Fitted to the shorter of the two constraints, so a sheet is never a card
     with its foot in the running footer. */
  const scale = Math.min(CW / card.width, (BOTTOM - TOP - 40) / card.height);
  const cw = card.width * scale;
  const ch = card.height * scale;
  const cx = PAD + (CW - cw) / 2;
  const cy = TOP + (BOTTOM - TOP - ch) / 2;

  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - 0.5, cy - 0.5, cw + 1, ch + 1);
  ctx.drawImage(card, cx, cy, cw, ch);

  chrome(ctx, r, page, of);
  return canvas;
}

/**
 * The flow, onto as many sheets as it takes.
 *
 * Two passes, because the running foot says `2 / 4` and the total is not known
 * until the flow has been laid out. The first pass only measures — it calls no
 * `draw` — so it costs nothing but arithmetic.
 */
function planPages(items: Item[]): Item[][] {
  const pages: Item[][] = [];
  let page: Item[] = [];
  let y = 0;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    /* A heading is measured together with whatever follows it, so a sheet never
       ends on a title. The `?? 0` covers a heading that is genuinely the last
       item, which only a report with no method note could produce. */
    const need = item.h + (item.keepWithNext ? (items[i + 1]?.h ?? 0) : 0);

    if (y + need > ROOM && page.length > 0) {
      pages.push(page);
      page = [];
      y = 0;
    }
    page.push(item);
    y += item.h;
  }

  if (page.length > 0) pages.push(page);
  return pages;
}

/* --------------------------------------------------------------- the file */

/**
 * The whole report as a PDF blob, or null where the browser would not paint it.
 *
 * `document.fonts.ready` first, for `card-image.ts`'s reason: a canvas paints
 * with whatever faces are loaded at that instant and, unlike the DOM, never
 * repaints when the webfont arrives. A PDF in the fallback face is a defect
 * only the client would ever see.
 */
export async function reportPdfBlob(r: ClientReport): Promise<Blob | null> {
  try {
    await document.fonts?.ready;
  } catch {
    /* A browser with no font-loading API paints with what it has. */
  }

  try {
    resolveStacks();
    const plan = planPages(buildItems(r));
    const total = plan.length + 1;

    const pages: PdfImagePage[] = [];

    const cover = paintCoverSheet(r, 1, total);
    if (!cover) return null;
    const coverJpeg = await canvasToJpeg(cover);
    if (!coverJpeg) return null;
    pages.push(coverJpeg);

    for (let i = 0; i < plan.length; i += 1) {
      const sheet = newSheet();
      if (!sheet) return null;
      let y = TOP;
      for (const item of plan[i]) {
        item.draw(sheet.ctx, y);
        y += item.h;
      }
      chrome(sheet.ctx, r, i + 2, total);

      const jpeg = await canvasToJpeg(sheet.canvas);
      if (!jpeg) return null;
      pages.push(jpeg);
    }

    return imagePagesToPdf(pages, {
      title: `${r.clientName} — progress report, ${r.weeks} weeks`,
      author: r.trainerName || 'InclineYou',
      subject: dateRange(r.from, r.to),
    });
  } catch {
    return null;
  }
}

/** `nithya-iyer-12-weeks-21-sep-2026.pdf`. Matches the PNG's name so the two
 *  sit together in a Downloads folder. */
export function reportPdfFilename(r: ClientReport): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug(r.clientName)}-${r.weeks}-weeks-${slug(longDate(r.to))}.pdf`;
}
