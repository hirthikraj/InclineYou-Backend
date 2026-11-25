/**
 * TILE ART — the exercise library's category pictures (body parts and muscles).
 *
 * ── A REAL MUSCLE MAP, NOT A DIAGRAM WITH A PATCH ON IT ──────────────────────
 *
 * The first drawing here was a mannequin with hand-written muscle outlines laid
 * over it, and it read as exactly that. The body is now `bodyModel.ts`: one
 * polygon per muscle region, tiling the whole figure front and back, so the
 * proportions are a human's and every muscle sits where it does on one. A tile
 * fills the regions its category is about and leaves the rest as the quiet body.
 *
 * A group that lives on both sides of the body (shoulders, arms, legs) is drawn
 * as a front and a back figure together: showing only the front of *upper legs*
 * would light the quads and silently leave out the hamstrings and glutes the
 * category also holds.
 *
 * Colour is two token classes: `ta__m` the body, `ta__h` the lit muscle — the
 * lime FILL (lime is a fill, never a stroke on light) with `--tx-accent-text`
 * as its outline, the stroke form of the accent on both themes.
 */
import Link from 'next/link';

import { BACK, FRONT } from '@/lib/exercises/bodyModel';

/** One figure, front or back, cropped to `crop`, with the `lit` regions filled. */
function Figure({ view, lit, crop }: { view: 'front' | 'back'; lit: string[]; crop: string }) {
  const regions = view === 'front' ? FRONT : BACK;
  return (
    <span className="ta-v">
      <svg viewBox={crop} className="ta ta--fig" role="img" aria-hidden="true">
        {regions.map((r) =>
          r.points.map((pts, i) => (
            <polygon key={`${r.muscle}-${i}`} points={pts} className={lit.includes(r.muscle) ? 'ta__h' : 'ta__m'} />
          )),
        )}
      </svg>
      <i className="ta-v__l">{view === 'front' ? 'Front' : 'Back'}</i>
    </span>
  );
}

export type BodyPartId =
  | 'chest' | 'back' | 'shoulders' | 'upper arms' | 'lower arms'
  | 'upper legs' | 'lower legs' | 'waist' | 'neck' | 'cardio';

interface Plan { front?: { lit: string[]; crop: string }; back?: { lit: string[]; crop: string } }

/* WHICH REGIONS EACH CATEGORY LIGHTS, per the library's own body-part → muscle
   vocabulary: chest = pectorals + serratus; back = lats, spine, traps, upper
   back; shoulders = delts; upper arms = biceps + triceps; lower arms =
   forearms; upper legs = abductors, adductors, glutes, hamstrings, quads;
   lower legs = calves; waist = abs; neck = levator scapulae. */
/* ONE SCALE FOR EVERY TILE. The crops used to differ in width, so the same body
   was drawn at a different zoom in each tile — lean in one, heavy in the next.
   Every crop is now 100 units tall, and 100 wide for a single figure or 72 wide
   for one of a pair, so a unit is the same number of pixels everywhere. Only
   `y` moves, to bring the tile's own region to the middle. */
const one = (y: number) => `0 ${y} 100 100`;
const pair = (y: number) => `14 ${y} 72 100`;

const PLANS: Record<Exclude<BodyPartId, 'cardio'>, Plan> = {
  chest: { front: { lit: ['chest', 'serratus'], crop: one(6) } },
  back: { back: { lit: ['trapezius', 'upper-back', 'lower-back'], crop: one(22) } },
  shoulders: {
    front: { lit: ['front-deltoids'], crop: pair(8) },
    back: { lit: ['back-deltoids'], crop: pair(8) },
  },
  'upper arms': {
    front: { lit: ['biceps'], crop: pair(26) },
    back: { lit: ['triceps'], crop: pair(26) },
  },
  'lower arms': { front: { lit: ['forearm'], crop: one(34) } },
  'upper legs': {
    front: { lit: ['quadriceps', 'abductors'], crop: pair(92) },
    back: { lit: ['gluteal', 'hamstring', 'abductor'], crop: pair(92) },
  },
  'lower legs': {
    front: { lit: ['calves'], crop: pair(100) },
    back: { lit: ['calves', 'left-soleus', 'right-soleus'], crop: pair(100) },
  },
  waist: { front: { lit: ['abs', 'obliques', 'serratus'], crop: one(40) } },
  neck: { front: { lit: ['neck'], crop: one(0) } },
};

/* ── ONE MUSCLE, LIT ALONE ───────────────────────────────────────────────────
   The level below a body part: *Upper legs* opens onto Quads, Hamstrings, Glutes, Adductors,
   Abductors, each drawn with only that muscle filled and on the side of the body it is seen
   from. The map has no region for every muscle the library names (the serratus anterior had
   none until it was carved out of the obliques), so a body part with ANY muscle undrawn opens as text
   tiles throughout rather than drawing one tile in a style its neighbours lack. Where the map
   cannot separate two muscles (lats and the rest of the upper back share one region) the
   second lights its neighbour too, so no two tiles are the same picture. */
const MUSCLE_PLANS: Record<string, { view: 'front' | 'back'; lit: string[]; y: number }> = {
  pectorals: { view: 'front', lit: ['chest'], y: 6 },
  'serratus anterior': { view: 'front', lit: ['serratus'], y: 20 },
  lats: { view: 'back', lit: ['upper-back'], y: 22 },
  spine: { view: 'back', lit: ['lower-back'], y: 40 },
  traps: { view: 'back', lit: ['trapezius'], y: 8 },
  'upper back': { view: 'back', lit: ['upper-back', 'trapezius'], y: 14 },
  biceps: { view: 'front', lit: ['biceps'], y: 30 },
  triceps: { view: 'back', lit: ['triceps'], y: 30 },
  quads: { view: 'front', lit: ['quadriceps'], y: 94 },
  adductors: { view: 'front', lit: ['abductors'], y: 94 },
  glutes: { view: 'back', lit: ['gluteal'], y: 92 },
  hamstrings: { view: 'back', lit: ['hamstring'], y: 96 },
  abductors: { view: 'back', lit: ['abductor'], y: 92 },
};

export const hasMuscleArt = (target: string): boolean => target in MUSCLE_PLANS;

/* NO CALLER SINCE 25 Nov 2026. It drew the muscle tiles a body part opened onto; a body part now lists at once
   with its muscles as pills (see `CategoriesView`). Kept, per the catalogue's rule for built work whose only
   consumer left — it is the art a muscle filter or an exercise panel would reach for next. */
export function MuscleArt({ target }: { target: string }) {
  const plan = MUSCLE_PLANS[target];
  if (!plan) return null;
  return (
    <span className="ta-row">
      <Figure view={plan.view} lit={plan.lit} crop={one(plan.y)} />
    </span>
  );
}

export function BodyArt({ part }: { part: BodyPartId }) {
  if (part === 'cardio') return <HeartArt />;
  const plan = PLANS[part];
  /* A body part the library grows that has no drawing yet draws nothing rather than crash the grid. */
  if (!plan) return null;
  return (
    <span className="ta-row">
      {plan.front && <Figure view="front" lit={plan.front.lit} crop={plan.front.crop} />}
      {plan.back && <Figure view="back" lit={plan.back.lit} crop={plan.back.crop} />}
    </span>
  );
}

/** Cardio is not a muscle on a body: a heart with its pulse. Smaller than the figures, and the line runs OUT of the heart
 *  on both sides in the quiet ink and through it in the dark accent ink — lime on lime would vanish. */
function HeartArt() {
  return (
    <svg viewBox="0 0 140 90" className="ta ta--heart" role="img" aria-hidden="true">
      <path className="ta__pulse-out" d="M10 46 H42 M98 46 H130" />
      <path
        className="ta__h"
        transform="translate(14 9) scale(0.8)"
        d="M70 80 C20 50 18 16 42 12 C56 10 66 20 70 28 C74 20 84 10 98 12 C122 16 120 50 70 80 Z"
      />
      <path className="ta__pulse-in" d="M42 46 H52 L58 33 L68 60 L77 40 L83 46 H98" />
    </svg>
  );
}

export function LibraryTile({
  title,
  count,
  art,
  note,
  href,
  current,
}: {
  title: string;
  count: number;
  /** Omitted when there is no drawing: the tile is then text only, never another thing's picture. */
  art?: React.ReactNode;
  note?: string;
  /** A tile is a door: with `href` it is a link, without it a plain button (the sample page). */
  href?: string;
  current?: boolean;
}) {
  const body = (
    <>
      {art && <span className="lt__art">{art}</span>}
      <span className="lt__t">{title}</span>
      <span className="lt__n">
        {count.toLocaleString()} exercise{count === 1 ? '' : 's'}{note ? ` · ${note}` : ''}
      </span>
    </>
  );
  return href ? (
    <Link href={href} className={`lt${art ? '' : ' lt--plain'}`} aria-current={current ? 'true' : undefined} scroll={false}>{body}</Link>
  ) : (
    <button type="button" className="lt">{body}</button>
  );
}
