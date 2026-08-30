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

import type { ClientReport } from './build';
import { dateRange, longDate, shortDate, signed, trim } from './build';

const W = 1080;
const H = 1350;

/* The dark tokens, verbatim from webapp.css's `[data-theme="dark"]` block. */
const CANVAS = '#08090B';
const SURFACE = '#101216';
const LINE = '#2A2F39';
const INK = '#F2F4F6';
const INK_2 = '#A2A9B4';
const INK_3 = '#8B939F';
const ACCENT = '#C6F24E';
const ACCENT_INK = '#0A0B0D';

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

function resolveStacks(): void {
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

type Ctx = CanvasRenderingContext2D;

/* ------------------------------------------------------------------ helpers */

function font(weight: number, size: number, family = SANS): string {
  return `${weight} ${size}px ${family}`;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
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
function fit(ctx: Ctx, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

function label(ctx: Ctx, text: string, x: number, y: number, color = INK_3): void {
  ctx.fillStyle = color;
  ctx.font = font(500, 20, MONO);
  ctx.letterSpacing = '2.2px';
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.letterSpacing = '0px';
}

interface Block {
  height: number;
  draw: (ctx: Ctx, y: number) => void;
}

/* --------------------------------------------------------------- the blocks */

/** Weight, and any measurement that moved. One row each: `72.4 → 68.9 kg`. */
function measurementBlock(r: ClientReport, cap: number): Block | null {
  const rows = [r.weight, ...r.measurements].filter((m) => m !== null).slice(0, cap);
  if (rows.length === 0) return null;

  const ROW = 66;
  const height = 48 + rows.length * ROW;

  return {
    height,
    draw(ctx, top) {
      label(ctx, 'Measurements', PAD, top + 20);
      let y = top + 46;
      for (const m of rows) {
        ctx.fillStyle = INK_2;
        ctx.font = font(600, 30);
        ctx.textAlign = 'left';
        ctx.fillText(fit(ctx, m.label, 300), PAD, y + 34);

        /* The change is written out rather than encoded. `ProgressTab.tsx`
           states the rule and it is at its sharpest here: the app has NO
           opinion about which way a client's numbers should go, and a green
           arrow on a card the client keeps is the product taking a side in a
           conversation it was not in. So no colour, and no arrow — the sign is
           the whole statement. */
        ctx.textAlign = 'right';
        ctx.fillStyle = INK;
        ctx.font = font(700, 34, MONO);
        const value = `${trim(m.from)} → ${trim(m.to)} ${m.unit}`.trim();
        ctx.fillText(value, W - PAD - 150, y + 34);

        ctx.fillStyle = INK_3;
        ctx.font = font(600, 30, MONO);
        ctx.fillText(signed(m.delta), W - PAD, y + 34);
        ctx.textAlign = 'left';

        y += ROW;
        if (m !== rows[rows.length - 1]) {
          ctx.fillStyle = LINE;
          ctx.fillRect(PAD, y - 18, W - PAD * 2, 1);
        }
      }
    },
  };
}

/** The lifts that moved, with a bar showing the proportion gained. */
function liftBlock(r: ClientReport, cap: number): Block | null {
  const lifts = r.lifts.slice(0, cap);
  if (lifts.length === 0) return null;

  const ROW = 76;
  const height = 48 + lifts.length * ROW;
  const best = Math.max(...lifts.map((l) => l.percent), 1);

  return {
    height,
    draw(ctx, top) {
      label(ctx, 'Getting stronger', PAD, top + 20);
      let y = top + 50;
      for (const l of lifts) {
        ctx.fillStyle = INK;
        ctx.font = font(600, 30);
        ctx.textAlign = 'left';
        ctx.fillText(fit(ctx, l.name, 480), PAD, y + 22);

        ctx.textAlign = 'right';
        ctx.fillStyle = INK_2;
        ctx.font = font(600, 30, MONO);
        ctx.fillText(`${trim(l.from)} → ${trim(l.to)} ${l.unit}`, W - PAD - 128, y + 22);

        ctx.fillStyle = ACCENT;
        ctx.font = font(700, 30, MONO);
        ctx.fillText(`+${l.percent}%`, W - PAD, y + 22);
        ctx.textAlign = 'left';

        /* The bar is relative to the biggest gain on the card, not to an
           absolute scale — there isn't one. It is a ranking made visible, which
           is all a client needs from it. */
        const track = W - PAD * 2;
        ctx.fillStyle = SURFACE;
        roundRect(ctx, PAD, y + 40, track, 10, 5);
        ctx.fill();
        ctx.fillStyle = ACCENT;
        roundRect(ctx, PAD, y + 40, Math.max(12, (l.percent / best) * track), 10, 5);
        ctx.fill();

        y += ROW;
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
     "Tracked on XRep" mark is *"free acquisition from your most credible
     possible source"*. Which is exactly why it is small, at the foot, and never
     over the client's own numbers — a watermark across somebody's progress is an
     advertisement they will crop out or not post at all. */
  ctx.fillStyle = LINE;
  ctx.fillRect(PAD, FOOTER_TOP, W - PAD * 2, 1);

  ctx.fillStyle = ACCENT;
  roundRect(ctx, PAD, FOOTER_TOP + 40, 30, 30, 8);
  ctx.fill();
  ctx.fillStyle = ACCENT_INK;
  ctx.font = font(800, 20, BRAND);
  ctx.textAlign = 'center';
  ctx.fillText('X', PAD + 15, FOOTER_TOP + 62);
  ctx.textAlign = 'left';

  ctx.fillStyle = INK_2;
  ctx.font = font(600, 24);
  ctx.fillText('Tracked on X REP', PAD + 46, FOOTER_TOP + 64);

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
