/**
 * THE SHAREABLE CARD, PAINTED ON A CANVAS.
 *
 * The brief asks for something specific and it is not a web page: *"a progress
 * card posted to Instagram or WhatsApp status."* Both of those take an **image**.
 * A `wa.me` deep link carries text and a link preview needs a public URL this
 * product does not have, so the only artefact that actually travels is a PNG the
 * trainer attaches, posts, or drops into a status.
 *
 * ── WHY IT IS DRAWN AND NOT SCREENSHOTTED ───────────────────────────────────
 *
 * The obvious route is to screenshot the DOM with html2canvas. Three reasons not
 * to, in the order they bite:
 *
 * 1. **It is a dependency, and this project has four.** `package.json` carries
 *    `next`, `react`, `react-dom` and `server-only`. A 200 kB rasteriser shipped
 *    to every trainer so that one screen can save a picture is a bad trade.
 * 2. **A screenshot inherits the app's layout, and the app's layout is a desk.**
 *    The card is 4:5 portrait because that is what Instagram and a WhatsApp
 *    status want; nothing on this screen is that shape.
 * 3. **A screenshot is only as good as the machine it was taken on.** Painting
 *    it means every trainer's card is the same card at the same 1080×1350,
 *    whatever their window, their zoom or their device pixel ratio.
 *
 * ── THE COLOURS ARE THE DARK TOKENS, AND THE ONE RULE HOLDS ─────────────────
 *
 * The card is always dark, whatever theme the trainer is looking at the app in:
 * it is not part of the app, it is an object that leaves it, and a card that
 * changes colour depending on who exported it is a card with no identity. Which
 * means `#C6F24E` is on a `#08090B` ground throughout — the one place the
 * stylesheet's opening rule allows it as text and as a fill both, and it is
 * never put on anything lighter.
 *
 * ── LAYOUT IS A BLOCK LIST, NOT A COORDINATE SYSTEM ─────────────────────────
 *
 * The content is genuinely variable — a client with no measurements and four
 * lifts, a client with three measurements and nothing logged — so the body is a
 * list of blocks each of which knows its own height, laid out top to bottom, and
 * a block that will not fit above the footer is DROPPED rather than drawn over
 * it. Dropping is safe because the blocks are already in priority order and the
 * whole point of the card is that everything on it is true.
 */

import type { ClientReport, Reading } from './build';
import { dateRange, longDate, shortDate, signed, trim } from './build';

const W = 1080;
const H = 1350;

/* The dark tokens, verbatim from webapp.css's `[data-theme="dark"]` block.
 *
 * EXPORTED, since `report-pdf.ts` paints the same report onto A4 sheets and a
 * second copy of these eight hex values is a second card identity waiting to
 * drift — the whole reason `resolveStacks` reads the font stacks off the
 * document rather than writing them down. */
export const CANVAS = '#08090B';
export const SURFACE = '#101216';
export const LINE = '#2A2F39';
export const INK = '#F2F4F6';
export const INK_2 = '#A2A9B4';
export const INK_3 = '#8B939F';
export const ACCENT = '#C6F24E';
export const ACCENT_INK = '#0A0B0D';

/**
 * THE FONT STACKS ARE READ OFF THE DOCUMENT, NOT WRITTEN DOWN.
 *
 * `next/font` self-hosts Inter, Archivo and JetBrains Mono and hands back a
 * GENERATED family name — `__Inter_36bd41` and so on — which is what
 * `--tx-font` resolves to through app.css's three join lines. A canvas asked
 * for `'Inter'` by that name matches nothing and silently paints in Times,
 * which is the kind of bug that only shows up in the exported file.
 *
 * So the stacks come out of the live custom properties, with §01's own literals
 * as the fallback for a paint that somehow happens before the stylesheet is up.
 */
const FALLBACK_SANS =
  "'Inter','SF Pro Text',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const FALLBACK_BRAND = `'Archivo',${FALLBACK_SANS}`;
const FALLBACK_MONO = "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace";

let SANS = FALLBACK_SANS;
let BRAND = FALLBACK_BRAND;
let MONO = FALLBACK_MONO;

export function resolveStacks(): void {
  if (typeof document === 'undefined') return;
  const css = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => {
    const v = css.getPropertyValue(name).trim();
    return v.length > 0 ? v : fallback;
  };
  SANS = read('--tx-font', FALLBACK_SANS);
  BRAND = read('--tx-brand', FALLBACK_BRAND);
  MONO = read('--tx-mono', FALLBACK_MONO);
}

const PAD = 72;
const FOOTER_TOP = H - 132;
/** The minimum air between two body blocks. Anything over is spread — see the
 *  layout note in `paintReportCard`. */
const BASE_GAP = 26;

export type Ctx = CanvasRenderingContext2D;

/** The three resolved stacks, for a painter in another file. Read AFTER
 *  `resolveStacks()` — they are module state, not constants. */
export const stacks = {
  get sans() { return SANS; },
  get brand() { return BRAND; },
  get mono() { return MONO; },
};

/* ------------------------------------------------------------------ helpers */

export function font(weight: number, size: number, family = SANS): string {
  return `${weight} ${size}px ${family}`;
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Truncates to `max` px with a real ellipsis. Names get long and a card that
 *  runs a name off its own edge is a card nobody sends. */
export function fit(ctx: Ctx, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

export function label(ctx: Ctx, text: string, x: number, y: number, color = INK_3): void {
  ctx.fillStyle = color;
  ctx.font = font(500, 20, MONO);
  ctx.letterSpacing = '2.2px';
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.letterSpacing = '0px';
}

export interface Block {
  height: number;
  draw: (ctx: Ctx, y: number) => void;
}

/**
 * THE TRAJECTORY, IN 190 PIXELS.
 *
 * What replaced the proportion bar the lift rows used to carry. That bar was
 * *"a ranking made visible"* — each lift's gain against the biggest gain on the
 * card — and it was honest but nearly content-free: the ordering already says
 * the ranking, and the bar restated it in a second alphabet. What a client
 * cannot get from anywhere else on the card is the SHAPE, and it is the thing
 * they actually want: 40 → 55 in a straight line and 40 → 55 with a month of
 * nothing in the middle are the same pair of numbers and two different stories
 * about how they trained.
 *
 * ── SPACED BY DATE WHERE THE DATES ARE IRREGULAR ────────────────────────────
 *
 * `at` is optional and the difference matters. A lift's series is one point per
 * TRAINING DAY, which is close enough to even that spacing by index draws the
 * truth. A measurement's is one point per time somebody got the tape out, which
 * is not even at all: a client weighed in week 1, week 2 and week 11 plotted at
 * thirds draws a gentle slope where the truth is a plateau and then a drop. So
 * measurements pass their dates and are positioned on them.
 *
 * ── AND A FLAT SERIES IS CENTRED ────────────────────────────────────────────
 *
 * `span` floored at a small positive number, and the flat case handled
 * explicitly rather than falling out of the arithmetic — which is the exact
 * defect `ui/TrendChart.tsx` carries a measured note about: with `hi === lo`
 * the numerator is zero and the line lands on the BOTTOM of the box, reading as
 * *at your minimum* on the one row that means *held steady*.
 */
export function sparkline(
  ctx: Ctx,
  series: Reading[],
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (series.length < 2) return;

  const values = series.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const flat = hi - lo < 1e-6;

  const t0 = series[0].at;
  const tSpan = series[series.length - 1].at - t0;
  /* Falls back to index spacing when every reading shares a date — two sets on
     one day, which `metricChange` deliberately does not merge. */
  const px = (i: number) =>
    tSpan > 0 ? x + ((series[i].at - t0) / tSpan) * w : x + (i * w) / (series.length - 1);
  const py = (v: number) => (flat ? y + h / 2 : y + h - ((v - lo) / (hi - lo)) * h);

  /* The floor rule the bar had, kept: an empty stretch is drawn, not skipped.
     A hairline under the series is what makes a mostly-flat line read as flat
     rather than as a rendering that failed. */
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.stroke();

  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  series.forEach((p, i) => {
    const cx = px(i);
    const cy = py(p.value);
    if (i === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  });
  ctx.stroke();

  /* The last point, marked. It is the number printed beside the line, and
     without it a reader has to guess which end of the line is now. */
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(px(series.length - 1), py(values[values.length - 1]), 5, 0, Math.PI * 2);
  ctx.fill();
}

/* --------------------------------------------------------------- the blocks */

/**
 * ONE ROW'S GEOMETRY, MEASURED RATHER THAN TABULATED.
 *
 * The first version put the name, the spark and the figure on fixed x
 * positions, and it collided: `100.2 → 100.7 cm` at 32px mono is 320px and
 * `25 → 27.5 kg` is 190, so a track wide enough for the first left 130px of
 * air in the second, and a track sized for the second ran the first straight
 * through the sparkline beside it. A canvas has no `1fr`.
 *
 * So the row is laid out from the RIGHT, which is the edge everything on it
 * shares: the delta sits on the margin, the figure is measured and placed
 * against it, the spark takes a FIXED width to the left of that — fixed,
 * because six sparks at six widths cannot be compared with one another, which
 * is the one thing a column of them is for — and the name gets whatever is
 * left and ellipses inside it.
 */
interface RowGeometry {
  nameMax: number;
  sparkX: number;
  sparkW: number;
  figureRight: number;
  deltaRight: number;
}

const SPARK_W = 186;

/** Call with `ctx.font` already set to the FIGURE's face — the measurement is
 *  of the figure, and a stale font makes every position on the row wrong. */
function rowGeometry(ctx: Ctx, figure: string, deltaWidth: number): RowGeometry {
  const deltaRight = W - PAD;
  const figureRight = deltaRight - deltaWidth - 26;
  const sparkX = figureRight - ctx.measureText(figure).width - SPARK_W - 26;
  return {
    deltaRight,
    figureRight,
    sparkX,
    sparkW: SPARK_W,
    /* 150px is the floor at which a movement name is still a name rather than
       two letters and an ellipsis. */
    nameMax: Math.max(150, sparkX - PAD - 24),
  };
}

/** Weight, and any measurement that moved: `Weight ▁▂▃ 73.6 → 73.4 kg −0.2`. */
function measurementBlock(r: ClientReport, cap: number): Block | null {
  const rows = [r.weight, ...r.measurements].filter((m) => m !== null).slice(0, cap);
  if (rows.length === 0) return null;

  const ROW = 70;
  const height = 48 + rows.length * ROW;

  return {
    height,
    draw(ctx, top) {
      label(ctx, 'Measurements', PAD, top + 20);
      let y = top + 46;
      for (const m of rows) {
        const figure = `${trim(m.from)} → ${trim(m.to)} ${m.unit}`.trim();
        ctx.font = font(700, 32, MONO);
        const g = rowGeometry(ctx, figure, ctx.measureText(signed(m.delta)).width);

        ctx.fillStyle = INK_2;
        ctx.font = font(600, 30);
        ctx.textAlign = 'left';
        ctx.fillText(fit(ctx, m.label, g.nameMax), PAD, y + 34);

        /* The shape between the two numbers, and it is the reason this block
           stopped being two columns. `−0.2` over twelve weeks is a client who
           held steady and a client who put on two kilos and took them back
           off, and only one of those is worth the conversation the card exists
           to start. Three readings is the floor — two points draw a slope with
           no shape in it, which invites exactly the trend-reading the series
           was added to prevent. */
        if (m.series.length >= 3) {
          sparkline(ctx, m.series, g.sparkX, y + 8, g.sparkW, 30);
        }

        /* The change is written out rather than encoded. `ProgressTab.tsx`
           states the rule and it is at its sharpest here: the app has NO
           opinion about which way a client's numbers should go, and a green
           arrow on a card the client keeps is the product taking a side in a
           conversation it was not in. So no colour on the pair, and the sign
           is the whole statement. The spark IS accent, because a shape is not
           a verdict — the same call `.trend__l` makes for every series it
           draws, whichever way that series points. */
        ctx.textAlign = 'right';
        ctx.fillStyle = INK;
        ctx.font = font(700, 32, MONO);
        ctx.fillText(figure, g.figureRight, y + 34);

        ctx.fillStyle = INK_3;
        ctx.font = font(600, 29, MONO);
        ctx.fillText(signed(m.delta), g.deltaRight, y + 34);
        ctx.textAlign = 'left';

        y += ROW;
        if (m !== rows[rows.length - 1]) {
          ctx.fillStyle = LINE;
          ctx.fillRect(PAD, y - 20, W - PAD * 2, 1);
        }
      }
    },
  };
}

/**
 * THE LIFTS THAT MOVED, EACH WITH THE SHAPE OF HOW IT MOVED.
 *
 * It was a full-width proportion bar under every row — each lift's gain against
 * the biggest gain on the card. Honest, and nearly content-free: the rows are
 * already sorted by that proportion, so the bar restated the ordering in a
 * second alphabet and spent 36px per row doing it.
 *
 * The series in its place answers the question the pair cannot. *40 → 55* in a
 * straight climb and *40 → 55* with six weeks of 40 and one good Tuesday are
 * the same two numbers and two different accounts of how somebody trained, and
 * the second one is a conversation the trainer wants to be having.
 *
 * The row lost 6px in the trade, which is what buys a fourth lift on a card
 * that used to fit three.
 */
function liftBlock(r: ClientReport, cap: number): Block | null {
  const lifts = r.lifts.slice(0, cap);
  if (lifts.length === 0) return null;

  const ROW = 70;
  const height = 48 + lifts.length * ROW;

  return {
    height,
    draw(ctx, top) {
      label(ctx, 'Getting stronger', PAD, top + 20);
      let y = top + 46;
      for (const l of lifts) {
        const figure = `${trim(l.from)} → ${trim(l.to)} ${l.unit}`;
        const gain = `+${l.percent}%`;
        ctx.font = font(700, 30, MONO);
        const g = rowGeometry(ctx, figure, ctx.measureText(gain).width);

        ctx.fillStyle = INK;
        ctx.font = font(600, 30);
        ctx.textAlign = 'left';
        ctx.fillText(fit(ctx, l.name, g.nameMax), PAD, y + 34);

        if (l.series.length >= 3) {
          sparkline(ctx, l.series, g.sparkX, y + 8, g.sparkW, 30);
        }

        ctx.textAlign = 'right';
        ctx.fillStyle = INK_2;
        ctx.font = font(600, 30, MONO);
        ctx.fillText(figure, g.figureRight, y + 34);

        /* The one accent on the card that is a verdict rather than a shape, and
           it is allowed for the reason `c-change`'s `delta` prop is: a lift
           going up is unambiguous in a way a waist going up is not. */
        ctx.fillStyle = ACCENT;
        ctx.font = font(700, 30, MONO);
        ctx.fillText(gain, g.deltaRight, y + 34);
        ctx.textAlign = 'left';

        y += ROW;
        if (l !== lifts[lifts.length - 1]) {
          ctx.fillStyle = LINE;
          ctx.fillRect(PAD, y - 20, W - PAD * 2, 1);
        }
      }
    },
  };
}

/** One bar per week — the shape of the client's consistency. */
function weeksBlock(r: ClientReport): Block | null {
  if (r.bestWeek === 0) return null;

  const height = 132;
  return {
    height,
    draw(ctx, top) {
      label(ctx, `Week by week · ${r.weeks} weeks`, PAD, top + 20);

      const track = W - PAD * 2;
      const n = r.weekBars.length;
      const gap = n > 16 ? 6 : 10;
      /* A bar is capped at 72px and the SPACING stretches instead. At four
         weeks an evenly divided track gives 230px slabs, which stop reading as
         a week and start reading as a progress bar somebody filled in. The
         first and last still sit on the track's own edges, so the two date
         stamps under them keep meaning what they say. */
      const even = (track - gap * (n - 1)) / n;
      const bw = Math.min(72, even);
      const step = bw < even && n > 1 ? (track - bw) / (n - 1) : bw + gap;
      const floor = top + 104;
      const ceiling = 64;

      r.weekBars.forEach((count, i) => {
        const x = PAD + i * step;
        /* An empty week is drawn as a stub rather than as nothing. A gap in a
           row of bars reads as missing data; a floor reads as a week off, which
           is what it was. */
        const h = count === 0 ? 5 : Math.max(12, (count / r.bestWeek) * ceiling);
        ctx.fillStyle = count === 0 ? LINE : ACCENT;
        roundRect(ctx, x, floor - h, bw, h, Math.min(6, bw / 2));
        ctx.fill();
      });

      ctx.fillStyle = INK_3;
      ctx.font = font(500, 20, MONO);
      ctx.textAlign = 'left';
      ctx.fillText(shortDate(r.from).toUpperCase(), PAD, floor + 28);
      ctx.textAlign = 'right';
      ctx.fillText(shortDate(r.to).toUpperCase(), W - PAD, floor + 28);
      ctx.textAlign = 'left';
    },
  };
}

/**
 * THE BRAND MARK, DRAWN RATHER THAN SET.
 *
 * This used to be the letter `X` in the brand face on a lime tile — the old
 * mark, and not a letter the identity contains. Canvas cannot `<use>` an SVG
 * symbol, so the geometry is transcribed from `identity.html`: the same 48-unit
 * grid, the same 6.5 stroke, the same 24% / 48% / 100% ladder, laid on the tile
 * at 58%, which is what `.ic svg` does for every other app-icon size.
 *
 * Exported because the A4 sheets foot every page with it. Two transcriptions of
 * a logo is the one duplication that is never caught by review, because both
 * look like a logo.
 */
export function drawMark(ctx: Ctx, x: number, y: number, tile: number): void {
  ctx.fillStyle = ACCENT;
  roundRect(ctx, x, y, tile, tile, tile * 0.27);
  ctx.fill();

  const MK = tile * 0.58;
  const k = MK / 48;
  const ox = x + (tile - MK) / 2;
  const oy = y + (tile - MK) / 2;
  ctx.strokeStyle = ACCENT_INK;
  ctx.lineWidth = 6.5 * k;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  for (const [topY, alpha] of [[30, 0.24], [20, 0.48], [10, 1]] as const) {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(ox + 10 * k, oy + (topY + 12) * k);
    ctx.lineTo(ox + 24 * k, oy + topY * k);
    ctx.lineTo(ox + 38 * k, oy + (topY + 12) * k);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/* --------------------------------------------------------------- the canvas */

export function paintReportCard(r: ClientReport): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  resolveStacks();
  ctx.textBaseline = 'alphabetic';

  /* ── ground ──────────────────────────────────────────────────────────────
     The accent as a wash in the top-left corner, gone by two-thirds of the
     diagonal — the same gesture `.card--lead` makes in the app, and it means the
     same thing here: start reading at the top left. */
  ctx.fillStyle = CANVAS;
  ctx.fillRect(0, 0, W, H);

  const wash = ctx.createLinearGradient(0, 0, W * 0.9, H * 0.5);
  wash.addColorStop(0, 'rgba(198,242,78,0.15)');
  wash.addColorStop(1, 'rgba(198,242,78,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  /* ── header ─────────────────────────────────────────────────────────────── */
  ctx.fillStyle = ACCENT;
  roundRect(ctx, PAD, 88, 56, 8, 4);
  ctx.fill();

  label(ctx, `${r.weeks} weeks of training`, PAD + 76, 104, ACCENT);

  /* THE NAME SHRINKS BEFORE IT TRUNCATES.
     `fit()` is the right tool for a plan line and the wrong one for the thing
     the card is ABOUT: "Rajalakshmi Venkatara…" is a card a trainer will not
     send, because it gets the client's name wrong on a card the client keeps.
     So the size steps down to 46px — still the largest thing on the card — and
     only then does it truncate, which now takes a name nobody has. */
  const nameWidth = W - PAD * 2;
  ctx.fillStyle = INK;
  ctx.letterSpacing = '-2px';
  let nameSize = 78;
  ctx.font = font(800, nameSize, BRAND);
  while (nameSize > 46 && ctx.measureText(r.clientName).width > nameWidth) {
    nameSize -= 2;
    ctx.font = font(800, nameSize, BRAND);
  }
  ctx.fillText(fit(ctx, r.clientName, nameWidth), PAD, 196);
  ctx.letterSpacing = '0px';

  /* THE SUB-LINE DROPS PARTS RATHER THAN ELLIPSISING.
     The three facts are not equally important: the window is what the card
     claims to cover, the trainer signs it, and the gym is context. A single
     `fit()` over all three cut the DATE off — the one that cannot be inferred
     from anywhere else on the card. So the gym goes first, then the coach. */
  ctx.fillStyle = INK_3;
  ctx.font = font(500, 26);
  const range = dateRange(r.from, r.to);
  const coachLine = (withGym: boolean, withCoach: boolean) =>
    [withCoach && r.trainerName ? `Coached by ${r.trainerName}` : null, withGym ? r.gymName : null, range]
      .filter(Boolean)
      .join('  ·  ');
  let coach = coachLine(true, true);
  if (ctx.measureText(coach).width > nameWidth) coach = coachLine(false, true);
  if (ctx.measureText(coach).width > nameWidth) coach = coachLine(false, false);
  ctx.fillText(fit(ctx, coach, nameWidth), PAD, 238);

  /* ── the three figures ───────────────────────────────────────────────────
     Sessions first because it is the one a client always believes: they were
     there for every one of them. Adherence second, personal bests third, and
     each tile only exists when its number does — a `—` in a hero slot on a card
     somebody is about to post is worse than a card with two tiles. */
  const tiles: Array<{ value: string; unit?: string; key: string }> = [];
  if (r.sessions.attended > 0) {
    tiles.push({ value: String(r.sessions.attended), key: 'Sessions done' });
  }
  if (r.sessions.adherence !== null) {
    tiles.push({ value: String(r.sessions.adherence), unit: '%', key: 'Of what we booked' });
  }
  if (r.prCount > 0) {
    tiles.push({ value: String(r.prCount), key: r.prCount === 1 ? 'Personal best' : 'Personal bests' });
  }
  if (tiles.length < 3 && r.volumeKg > 0) {
    tiles.push({
      value: r.volumeKg >= 1000 ? `${Math.round(r.volumeKg / 1000)}` : String(r.volumeKg),
      unit: r.volumeKg >= 1000 ? 't' : 'kg',
      key: 'Total moved',
    });
  }

  const TILE_TOP = 282;
  const TILE_H = 158;
  let bodyTop = TILE_TOP;
  if (tiles.length > 0) {
    const gap = 20;
    const tw = (W - PAD * 2 - gap * (tiles.length - 1)) / tiles.length;
    tiles.forEach((t, i) => {
      const x = PAD + i * (tw + gap);
      ctx.fillStyle = SURFACE;
      roundRect(ctx, x, TILE_TOP, tw, TILE_H, 18);
      ctx.fill();
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1;
      roundRect(ctx, x + 0.5, TILE_TOP + 0.5, tw - 1, TILE_H - 1, 18);
      ctx.stroke();

      ctx.fillStyle = ACCENT;
      ctx.font = font(800, 74, BRAND);
      ctx.letterSpacing = '-2px';
      ctx.textAlign = 'center';
      const shown = t.unit ? `${t.value}${t.unit}` : t.value;
      ctx.fillText(fit(ctx, shown, tw - 24), x + tw / 2, TILE_TOP + 90);
      ctx.letterSpacing = '0px';

      ctx.fillStyle = INK_3;
      ctx.font = font(500, 20, MONO);
      ctx.letterSpacing = '1.6px';
      ctx.fillText(fit(ctx, t.key.toUpperCase(), tw - 20), x + tw / 2, TILE_TOP + 132);
      ctx.letterSpacing = '0px';
      ctx.textAlign = 'left';
    });
    bodyTop = TILE_TOP + TILE_H + 38;
  }

  /* ── the body ────────────────────────────────────────────────────────────
     Measurements before lifts because a client sees their waist before they see
     their bench, and the weeks strip last because it is context rather than
     news.

     THE FIRST VERSION DROPPED A BLOCK THAT DID NOT FIT, and rendering it showed
     why that is the wrong rule: on a full card the lifts — the most persuasive
     thing on it — were dropped for being third in the queue, and the space they
     would have used sat empty above the footer, because the strip that fitted
     was 130px and the block that did not was 390. A card with a hole in it and
     no strength on it.

     So the caps SHRINK until the set fits, in the order that costs least: a
     fourth measurement before a fourth lift, and never below two of each while
     there are two to show. The leftover is then spread between the blocks, so
     the card fills to the footer rather than stopping two-thirds down. */
  const room = FOOTER_TOP - 28 - bodyTop;
  const LADDER: Array<[number, number]> = [[4, 4], [4, 3], [3, 3], [3, 2], [2, 2], [2, 1], [1, 1]];

  let blocks: Block[] = [];
  for (const [mCap, lCap] of LADDER) {
    blocks = [measurementBlock(r, mCap), liftBlock(r, lCap), weeksBlock(r)]
      .filter((b): b is Block => b !== null);
    const total = blocks.reduce((sum, b) => sum + b.height, 0) + BASE_GAP * (blocks.length - 1);
    if (total <= room) break;
  }

  const used = blocks.reduce((sum, b) => sum + b.height, 0) + BASE_GAP * (blocks.length - 1);
  /* Spread across the boundaries AND the tail, so a short card is not
     bottom-heavy — a card that stops two-thirds down reads as a rendering
     failure rather than as a client with less to show. Capped at 90: measured
     against the thinnest real card, which is a client with no measurements
     (two blocks, ~190px over), where a smaller cap left a hole above the
     footer that the spread was supposed to close. */
  const spread = blocks.length > 0 ? Math.min(90, Math.max(0, (room - used) / blocks.length)) : 0;

  let y = bodyTop;
  for (const block of blocks) {
    block.draw(ctx, y);
    y += block.height + BASE_GAP + spread;
  }

  /* ── the mark ────────────────────────────────────────────────────────────
     The brief's reason for it, in its own words: a card posted with a small
     "Tracked on InclineYou" mark is *"free acquisition from your most credible
     possible source"*. Which is exactly why it is small, at the foot, and never
     over the client's own numbers — a watermark across somebody's progress is an
     advertisement they will crop out or not post at all. */
  ctx.fillStyle = LINE;
  ctx.fillRect(PAD, FOOTER_TOP, W - PAD * 2, 1);

  drawMark(ctx, PAD, FOOTER_TOP + 40, 30);

  ctx.fillStyle = INK_2;
  ctx.font = font(600, 24);
  ctx.fillText('Tracked on InclineYou', PAD + 46, FOOTER_TOP + 64);

  ctx.fillStyle = INK_3;
  ctx.font = font(500, 21, MONO);
  ctx.textAlign = 'right';
  ctx.fillText(longDate(r.to).toUpperCase(), W - PAD, FOOTER_TOP + 64);
  ctx.textAlign = 'left';

  return canvas;
}

/**
 * The painted card as a PNG blob.
 *
 * `document.fonts.ready` is awaited first, and it is not belt-and-braces: a
 * canvas paints with whatever faces are loaded AT THAT INSTANT, so a card
 * exported in the second before the webfont lands is a card in the fallback
 * face — and unlike the DOM, it never re-renders when the font arrives. The
 * screen's own preview is painted through this same function for that reason.
 *
 * Null where the browser refuses — an old `toBlob`, a context that never
 * initialised — so a caller can fall back to the text share rather than
 * throwing on a button press.
 */
export async function reportCardBlob(r: ClientReport): Promise<Blob | null> {
  try {
    await document.fonts?.ready;
  } catch {
    /* A browser with no font-loading API paints with what it has, which is the
       same thing it would have done anyway. */
  }
  return new Promise((resolve) => {
    try {
      paintReportCard(r).toBlob((blob) => resolve(blob), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

/** `nikhil-r-12-weeks-29-aug-2026.png` — lands in a Downloads folder with others. */
export function reportCardFilename(r: ClientReport): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug(r.clientName)}-${r.weeks}-weeks-${slug(longDate(r.to))}.png`;
}
