/**
 * TILE ART — the exercise library's category and equipment pictures.
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
import { KEY_ART, hasOwnArt, type ArtKey } from '@/lib/exercises/kitArt';

export { hasOwnArt };

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
  chest: { front: { lit: ['chest'], crop: one(6) } },
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
  waist: { front: { lit: ['abs', 'obliques'], crop: one(40) } },
  neck: { front: { lit: ['neck'], crop: one(0) } },
};

/* ── ONE MUSCLE, LIT ALONE ───────────────────────────────────────────────────
   The level below a body part: *Upper legs* opens onto Quads, Hamstrings, Glutes, Adductors,
   Abductors, each drawn with only that muscle filled and on the side of the body it is seen
   from. The map has no region for every muscle the library names (the serratus anterior sits
   on the ribs where the map has none), so a body part with ANY muscle undrawn opens as text
   tiles throughout rather than drawing one tile in a style its neighbours lack. Where the map
   cannot separate two muscles (lats and the rest of the upper back share one region) the
   second lights its neighbour too, so no two tiles are the same picture. */
const MUSCLE_PLANS: Record<string, { view: 'front' | 'back'; lit: string[]; y: number }> = {
  pectorals: { view: 'front', lit: ['chest'], y: 6 },
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

/* ══ EQUIPMENT ═══════════════════════════════════════════════════════════════
   One picture per piece of kit the library has an exercise for, drawn on a 140 × 90
   sheet in the same two token classes as the body (`ta__b` neutral, `ta__h` lit)
   plus two thin ones for lines. A kit with no picture of its own — the twenty-odd
   selectorised machines, say — draws its CATEGORY's, which says what family it is
   without pretending to be a drawing of that exact machine. */




const CATEGORY_ART: Record<string, ArtKey> = {
  'free weights': 'free_weights', bodyweight: 'bodyweight_family', cable: 'cable_family', machine: 'machine',
  'cardio machine': 'cardio_machines', bands: 'bands_family', 'small tools': 'tools_family', traditional: 'traditional_family', other: 'band',
};

/** The picture for a piece of kit, by key; a family picture when it has none of its own. */
export function EquipmentArt({ equipmentKey, category }: { equipmentKey?: string; category?: string }) {
  const key = (equipmentKey && KEY_ART[equipmentKey]) || (category && CATEGORY_ART[category]) || 'machine';
  return <EquipArt kind={key} />;
}

/** Back-compat for the sample page. */
export function EquipArt({ kind }: { kind: ArtKey }) {
  if (kind === 'body_weight') {
    return (
      <span className="ta-row">
        {[FRONT, BACK].map((view, v) => (
          <span className="ta-v" key={v}>
            <svg viewBox="12 4 76 192" className="ta ta--fig ta--whole" role="img" aria-hidden="true">
              {view.map((r) => r.points.map((pts, i) => <polygon key={`${r.muscle}-${i}`} points={pts} className="ta__h" />))}
            </svg>
            <i className="ta-v__l">{v === 0 ? 'Front' : 'Back'}</i>
          </span>
        ))}
      </span>
    );
  }
  return (
    <svg viewBox="0 0 140 90" className="ta" role="img" aria-hidden="true">
      {ART[kind]}
    </svg>
  );
}

const ART: Record<Exclude<ArtKey, 'body_weight'>, React.ReactNode> = {
  /* The FAMILY picture for bodyweight work: one athlete at the top of a push-up, side on — the move everybody means
     by "no equipment". Replaces the pair of fully lit front/back figures, which lit every muscle and so said nothing. */
  bodyweight_family: (
    <>
      <rect className="ta__b" x="6" y="78" width="128" height="4" rx="2" />
      <g transform="translate(20 72) rotate(-21.5)">
        <rect className="ta__h" x="0" y="-6" width="82" height="12" rx="6" />
        <path className="ta__s ta__s--abs" d="M24 -4 V4 M54 -5 V5" />
      </g>
      <g transform="translate(94 44) rotate(84)">
        <rect className="ta__h" x="-4" y="-4" width="34" height="8" rx="4" />
      </g>
      <rect className="ta__b" x="91" y="75" width="14" height="3.5" rx="1.5" />
      <circle className="ta__b" cx="105" cy="36" r="7.5" />
    </>
  ),
  /* The FAMILY picture: one hex dumbbell, the shape everybody means by "free weights". Chamfered heads and a
     knurled grip keep it apart from the plain Dumbbell kit tile, which is a different level of the same library. */
  free_weights: (
    <g transform="rotate(-14 70 45)">
      <rect className="ta__b" x="40" y="39" width="60" height="12" rx="3" />
      <path className="ta__s ta__s--abs" d="M56 41 V49 M62 41 V49 M68 41 V49 M74 41 V49 M80 41 V49 M86 41 V49" />
      <rect className="ta__b" x="40" y="32" width="6" height="26" rx="2" />
      <rect className="ta__b" x="94" y="32" width="6" height="26" rx="2" />
      <polygon className="ta__h" points="14,36 21,27 40,27 40,63 21,63 14,54" />
      <polygon className="ta__h" points="126,36 119,27 100,27 100,63 119,63 126,54" />
      <path className="ta__s ta__s--abs" d="M24 31 H36 M24 59 H36 M104 31 H116 M104 59 H116" />
    </g>
  ),
  /* An Olympic bar, long: most of its length is bare steel with a knurled grip, and the plates are thin and pushed to
     the ends, stepping down to a collar. The short grip and fat plates of the first drawing read as a dumbbell. */
  barbell: (
    <>
      <rect className="ta__b" x="2" y="42.5" width="136" height="5" rx="2.5" />
      <rect className="ta__b" x="2" y="41" width="30" height="8" rx="3" />
      <rect className="ta__b" x="108" y="41" width="30" height="8" rx="3" />
      <path className="ta__s ta__s--abs" d="M46 43.6 V46.4 M50 43.6 V46.4 M54 43.6 V46.4 M58 43.6 V46.4 M62 43.6 V46.4 M66 43.6 V46.4 M70 43.6 V46.4 M74 43.6 V46.4 M78 43.6 V46.4 M82 43.6 V46.4 M86 43.6 V46.4 M90 43.6 V46.4 M94 43.6 V46.4" />
      <rect className="ta__b" x="7" y="39" width="4" height="12" rx="1.5" />
      <rect className="ta__b" x="12" y="33" width="4" height="24" rx="2" />
      <rect className="ta__b" x="17" y="27" width="5" height="36" rx="2.5" />
      <rect className="ta__h" x="23" y="21" width="7" height="48" rx="3" />
      <rect className="ta__b" x="129" y="39" width="4" height="12" rx="1.5" />
      <rect className="ta__b" x="124" y="33" width="4" height="24" rx="2" />
      <rect className="ta__b" x="118" y="27" width="5" height="36" rx="2.5" />
      <rect className="ta__h" x="110" y="21" width="7" height="48" rx="3" />
    </>
  ),
  /* A round-head dumbbell: short knurled handle, fat lit heads, a smaller plate and a cap at each end. The opposite
     proportions to the Barbell above (short grip, big heads), and round where the Free weights tile is hex. */
  dumbbell: (
    <g transform="rotate(-12 70 45)">
      <rect className="ta__b" x="44" y="40" width="52" height="10" rx="3" />
      <path className="ta__s ta__s--abs" d="M56 41.5 V48.5 M60 41.5 V48.5 M64 41.5 V48.5 M68 41.5 V48.5 M72 41.5 V48.5 M76 41.5 V48.5 M80 41.5 V48.5" />
      <rect className="ta__b" x="40" y="35" width="5" height="20" rx="2" />
      <rect className="ta__b" x="95" y="35" width="5" height="20" rx="2" />
      <rect className="ta__h" x="22" y="18" width="18" height="54" rx="7" />
      <rect className="ta__h" x="100" y="18" width="18" height="54" rx="7" />
      <path className="ta__s ta__s--abs" d="M27 26 V64 M113 26 V64" />
      <rect className="ta__b" x="14" y="29" width="7" height="32" rx="3" />
      <rect className="ta__b" x="119" y="29" width="7" height="32" rx="3" />
      <rect className="ta__b" x="8" y="38" width="5" height="14" rx="2" />
      <rect className="ta__b" x="127" y="38" width="5" height="14" rx="2" />
    </g>
  ),
  /* A cast-iron kettlebell: a thick squared handle with its window, the round bell on a flat base, and the weight
     badge every real one carries. The handle is drawn first so the bell sits over its feet. */
  kettlebell: (
    <>
      <ellipse className="ta__b" cx="70" cy="86" rx="28" ry="2.5" />
      <path className="ta__b" fillRule="evenodd" d="M40 52 V14 Q40 4 50 4 H90 Q100 4 100 14 V52 H88 V19 Q88 16 85 16 H55 Q52 16 52 19 V52 Z" />
      <path className="ta__h" d="M70 36 C100 36 108 52 103 65 C99 77 91 85 82 85 H58 C49 85 41 77 37 65 C32 52 40 36 70 36 Z" />
      <path className="ta__s ta__s--abs" d="M47 66 H93 M51 74 H89" />
      <path className="ta__s ta__s--abs" d="M44 58 Q46 49 56 44" />
    </>
  ),
  /* A curl bar: straight ends to load, and the cranked middle that is the whole reason it exists, so it cannot be
     mistaken for the Barbell. Plates are thin and step down toward the tip, big ones inside, as on the straight bar. */
  ez_bar: (
    <>
      <path className="ta__line ta__line--thin" strokeLinejoin="round" d="M8 45 H36 L48 34 L60 56 L80 56 L92 34 L104 45 H132" />
      <rect className="ta__b" x="13" y="37" width="4" height="16" rx="1.5" />
      <rect className="ta__b" x="18" y="31" width="5" height="28" rx="2" />
      <rect className="ta__h" x="24" y="24" width="7" height="42" rx="3" />
      <rect className="ta__b" x="123" y="37" width="4" height="16" rx="1.5" />
      <rect className="ta__b" x="117" y="31" width="5" height="28" rx="2" />
      <rect className="ta__h" x="109" y="24" width="7" height="42" rx="3" />
    </>
  ),
  /* A hex bar from above: the hexagon frame you stand inside, its two flat sides the knurled handles — running the same
     way as the plates, front to back, because that is where your hands are — and a loadable sleeve out of each
     side with thin plates stepping down, big ones inside. */
  trap_bar: (
    <>
      <rect className="ta__b" x="6" y="42.5" width="40" height="5" rx="2.5" />
      <rect className="ta__b" x="94" y="42.5" width="40" height="5" rx="2.5" />
      <polygon className="ta__line" points="70,9 96,26 96,64 70,81 44,64 44,26" />
      <rect className="ta__b" x="41" y="26" width="5.5" height="38" rx="2.7" />
      <rect className="ta__b" x="93.5" y="26" width="5.5" height="38" rx="2.7" />
      <path className="ta__s ta__s--abs" d="M42.2 33 H45.2 M42.2 37 H45.2 M42.2 41 H45.2 M42.2 45 H45.2 M42.2 49 H45.2 M42.2 53 H45.2 M42.2 57 H45.2 M94.7 33 H97.7 M94.7 37 H97.7 M94.7 41 H97.7 M94.7 45 H97.7 M94.7 49 H97.7 M94.7 53 H97.7 M94.7 57 H97.7" />
      <rect className="ta__b" x="11" y="38" width="4" height="14" rx="1.5" />
      <rect className="ta__b" x="16" y="32" width="5" height="26" rx="2" />
      <rect className="ta__h" x="22" y="25" width="7" height="40" rx="3" />
      <rect className="ta__b" x="125" y="38" width="4" height="14" rx="1.5" />
      <rect className="ta__b" x="119" y="32" width="5" height="26" rx="2" />
      <rect className="ta__h" x="111" y="25" width="7" height="40" rx="3" />
    </>
  ),
  /* A plate stood on its edge and turned a little, so you see its face and its thickness: raised rim, three hand
     slots, hub and bar hole on the face, and the plate's edge showing behind it. */
  weight_plate: (
    <>
      <circle className="ta__b" cx="73" cy="45" r="40" />
      <circle className="ta__h" cx="66" cy="45" r="40" />
      <circle className="ta__s ta__s--abs" cx="66" cy="45" r="33" />
      <ellipse className="ta__b" cx="66" cy="21" rx="8" ry="3.8" />
      <ellipse className="ta__b" cx="86.8" cy="57" rx="8" ry="3.8" transform="rotate(120 86.8 57)" />
      <ellipse className="ta__b" cx="45.2" cy="57" rx="8" ry="3.8" transform="rotate(60 45.2 57)" />
      <circle className="ta__s ta__s--abs" cx="66" cy="45" r="14" />
      <circle className="ta__b" cx="66" cy="45" r="8" />
    </>
  ),
  /* The FAMILY picture for cable work: a dual-pulley crossover — two stacks, two high pulleys, two handles drawn in on
     their cables — kept apart from the Cable kit tile, which is one stack and one cable. */
  cable_family: (
    <>
      <rect className="ta__b" x="6" y="82" width="128" height="4" rx="2" />
      <rect className="ta__b" x="8" y="4" width="124" height="6" rx="3" />
      <rect className="ta__b" x="10" y="8" width="18" height="74" rx="3" />
      <rect className="ta__b" x="112" y="8" width="18" height="74" rx="3" />
      <path className="ta__line ta__line--thin" d="M19 17 V28 M121 17 V28" />
      <rect className="ta__b" x="13" y="30" width="12" height="7" rx="1.5" />
      <rect className="ta__b" x="13" y="40" width="12" height="7" rx="1.5" />
      <rect className="ta__h" x="13" y="50" width="12" height="7" rx="1.5" />
      <rect className="ta__b" x="13" y="60" width="12" height="7" rx="1.5" />
      <rect className="ta__b" x="13" y="70" width="12" height="7" rx="1.5" />
      <rect className="ta__b" x="115" y="30" width="12" height="7" rx="1.5" />
      <rect className="ta__b" x="115" y="40" width="12" height="7" rx="1.5" />
      <rect className="ta__h" x="115" y="50" width="12" height="7" rx="1.5" />
      <rect className="ta__b" x="115" y="60" width="12" height="7" rx="1.5" />
      <rect className="ta__b" x="115" y="70" width="12" height="7" rx="1.5" />
      <path className="ta__s ta__s--abs" d="M16 53.5 H22 M118 53.5 H124" />
      <path className="ta__line ta__line--thin" d="M25 19 Q54 24 63 50 M115 19 Q86 24 77 50" />
      <circle className="ta__h" cx="22" cy="17" r="6.5" />
      <circle className="ta__b" cx="22" cy="17" r="2" />
      <circle className="ta__h" cx="118" cy="17" r="6.5" />
      <circle className="ta__b" cx="118" cy="17" r="2" />
      <circle className="ta__b" cx="63" cy="51" r="2.6" />
      <circle className="ta__b" cx="77" cy="51" r="2.6" />
      <g transform="translate(0 -2.5) rotate(-14 59 62)">
        <rect className="ta__h" x="50" y="57" width="18" height="10" rx="5" />
        <path className="ta__s ta__s--abs" d="M55 62 H63" />
      </g>
      <g transform="translate(0 -2.5) rotate(14 81 62)">
        <rect className="ta__h" x="72" y="57" width="18" height="10" rx="5" />
        <path className="ta__s ta__s--abs" d="M77 62 H85" />
      </g>
    </>
  ),
  cable: (
    <>
      <rect className="ta__b" x="18" y="6" width="16" height="80" rx="3" />
      <path className="ta__s ta__s--abs" d="M20 28 H32 M20 40 H32 M20 52 H32 M20 64 H32" />
      <circle className="ta__h" cx="26" cy="16" r="8" />
      <path className="ta__line ta__line--thin" d="M34 16 Q74 22 98 54" />
      <rect className="ta__h" x="92" y="52" width="26" height="7" rx="3" transform="rotate(32 105 55)" />
    </>
  ),
  smith: (
    <>
      <rect className="ta__b" x="28" y="8" width="6" height="74" rx="2" />
      <rect className="ta__b" x="106" y="8" width="6" height="74" rx="2" />
      <rect className="ta__b" x="16" y="80" width="108" height="6" rx="3" />
      <rect className="ta__h" x="24" y="36" width="92" height="8" rx="3" />
      <rect className="ta__h" x="42" y="28" width="8" height="24" rx="2" />
      <rect className="ta__h" x="90" y="28" width="8" height="24" rx="2" />
    </>
  ),
  /* The FAMILY picture for selectorised kit: a weight stack with its pin lit, a padded seat and back, and the handle
     the stack is lifted through — the parts every plate-loaded-by-pin machine shares. */
  machine: (
    <>
      <rect className="ta__b" x="8" y="80" width="124" height="5" rx="2.5" />
      <rect className="ta__b" x="92" y="10" width="4" height="70" rx="1.5" />
      <rect className="ta__b" x="124" y="10" width="4" height="70" rx="1.5" />
      <rect className="ta__b" x="89" y="5" width="42" height="7" rx="3" />
      <rect className="ta__b" x="97" y="16" width="26" height="8" rx="2" />
      <rect className="ta__b" x="97" y="27" width="26" height="8" rx="2" />
      <rect className="ta__h" x="97" y="38" width="26" height="8" rx="2" />
      <rect className="ta__b" x="97" y="49" width="26" height="8" rx="2" />
      <rect className="ta__b" x="97" y="60" width="26" height="8" rx="2" />
      <path className="ta__s ta__s--abs" d="M102 42 H118" />
      <rect className="ta__b" x="16" y="20" width="10" height="38" rx="5" />
      <rect className="ta__b" x="22" y="58" width="38" height="9" rx="4" />
      <rect className="ta__b" x="38" y="67" width="8" height="13" rx="2" />
      <path className="ta__line ta__line--thin" d="M52 32 L94 19" />
      <rect className="ta__h" x="44" y="26" width="20" height="9" rx="4" transform="rotate(-8 54 30)" />
    </>
  ),
  /* The FAMILY picture for cardio kit: a treadmill with its console lit as a heart-rate screen — the one thing every
     cardio machine shares — so the tile says "cardio" rather than "this exact treadmill". */
  cardio_machines: (
    <>
      <rect className="ta__b" x="6" y="80" width="112" height="4" rx="2" />
      <rect className="ta__b" x="10" y="66" width="104" height="11" rx="5.5" />
      <polygon className="ta__h" points="22,60 100,60 108,66 14,66" />
      <path className="ta__line ta__line--thin" d="M98 64 L88 28 M88 30 L48 44 M48 44 V60" />
      <rect className="ta__b" x="76" y="8" width="42" height="26" rx="5" />
      <rect className="ta__h" x="81" y="13" width="32" height="16" rx="3" />
      <path className="ta__s ta__s--abs" d="M85 22 H92 L95 16 L100 27 L104 21 H109" />
    </>
  ),
  /* A treadmill side on: the belt (lit, with its running direction), the frame and motor housing under it, the console
     on its uprights and the side rail you hold. The family picture draws the console as a heart-rate screen; this is the
     machine itself. */
  treadmill: (
    <>
      <rect className="ta__b" x="6" y="82" width="128" height="3" rx="1.5" />
      <g transform="rotate(-4 66 70)">
        <rect className="ta__b" x="12" y="71" width="100" height="7" rx="3.5" />
        <rect className="ta__h" x="16" y="63" width="92" height="9" rx="4.5" />
        <path className="ta__s ta__s--abs" d="M32 67.5 l3 -2 v4 z M52 67.5 l3 -2 v4 z M72 67.5 l3 -2 v4 z M92 67.5 l3 -2 v4 z" />
      </g>
      <rect className="ta__b" x="104" y="60" width="22" height="22" rx="4" />
      <path className="ta__line ta__line--thin" strokeLinejoin="round" d="M110 60 L100 22 M120 60 L116 24 M96 28 L42 38 L38 66" />
      <rect className="ta__b" x="88" y="6" width="38" height="20" rx="4" transform="rotate(-6 107 16)" />
      <rect className="ta__h" x="93" y="10" width="28" height="10" rx="2.5" transform="rotate(-6 107 16)" />
    </>
  ),
  /* An elliptical side on, as the real machine is built: a long floor frame, the flywheel cover low at the rear (a wheel, never a seat: you stand on this machine),
     the pedal arm running forward from its crank with the foot platform riding on it, a mast leaning back toward the
     user with the console on top, and the long moving handle rising from the front of the pedal arm. */
  elliptical: (
    <>
      <rect className="ta__b" x="6" y="76" width="116" height="7" rx="3.5" />
      <circle className="ta__b" cx="26" cy="62" r="15" />
      <circle className="ta__s ta__s--abs" cx="26" cy="62" r="10" />
      <rect className="ta__b" x="26" y="60" width="76" height="6" rx="3" transform="rotate(-1.5 65 63)" />
      <rect className="ta__h" x="50" y="52" width="38" height="9" rx="4.5" transform="rotate(-1.5 69 56)" />
      <path className="ta__line" strokeLinejoin="round" d="M112 74 L104 14" />
      <g transform="translate(100 62) rotate(-114)">
        <rect className="ta__h" x="0" y="-3.5" width="54" height="7" rx="3.5" />
      </g>
      <circle className="ta__h" cx="26" cy="62" r="5.5" />
      <circle className="ta__b" cx="26" cy="62" r="2" />
      <rect className="ta__b" x="88" y="2" width="32" height="17" rx="4" transform="rotate(-8 104 10)" />
      <rect className="ta__h" x="93" y="6" width="22" height="8" rx="2.5" transform="rotate(-8 104 10)" />
    </>
  ),
  /* A rowing machine side on: the small flywheel cage at the front with its foot plate, the long monorail running
     away from it, the seat riding that rail, and the handle on its visible rope — the three things a row is made of. */
  rower: (
    <g transform="translate(0 -9)">
      <rect className="ta__b" x="12" y="82" width="34" height="3" rx="1.5" />
      <rect className="ta__b" x="104" y="82" width="28" height="3" rx="1.5" />
      <rect className="ta__b" x="116" y="70" width="7" height="12" rx="2" />
      <rect className="ta__b" x="22" y="64" width="9" height="18" rx="2" />
      <rect className="ta__b" x="26" y="64" width="104" height="7" rx="3.5" transform="rotate(2 26 67)" />
      <circle className="ta__b" cx="32" cy="51" r="15" />
      <circle className="ta__h" cx="32" cy="51" r="11" />
      <path className="ta__s ta__s--abs" d="M32 51 V40 M32 51 L41.5 45.5 M32 51 L41.5 56.5 M32 51 V62 M32 51 L22.5 56.5 M32 51 L22.5 45.5" />
      <circle className="ta__b" cx="32" cy="51" r="3.5" />
      <rect className="ta__h" x="50" y="46" width="6" height="20" rx="3" transform="rotate(18 53 56)" />
      <path className="ta__line ta__line--thin" strokeLinejoin="round" d="M42 46 Q62 56 80 46" />
      <rect className="ta__h" x="79" y="38" width="6" height="18" rx="3" />
      <rect className="ta__h" x="88" y="58" width="22" height="7" rx="3.5" transform="rotate(2 99 62)" />
      <rect className="ta__b" x="92" y="64" width="14" height="4" rx="2" transform="rotate(2 99 66)" />
    </g>
  ),
  /* A stair climber side on: the revolving staircase read as what it is, a flight of steps rising toward the
     console (lit treads on quiet risers), the handrail held clear of the steps, and the console on its mast. */
  stairs: (
    <>
      <rect className="ta__b" x="6" y="82" width="128" height="3" rx="1.5" />
      <rect className="ta__b" x="12" y="78" width="24" height="4" rx="1.5" />
      <rect className="ta__b" x="28" y="67" width="24" height="15" rx="1.5" />
      <rect className="ta__b" x="44" y="56" width="24" height="26" rx="1.5" />
      <rect className="ta__b" x="60" y="45" width="24" height="37" rx="1.5" />
      <rect className="ta__b" x="76" y="34" width="24" height="48" rx="1.5" />
      <rect className="ta__h" x="12" y="72" width="24" height="6" rx="2.5" />
      <rect className="ta__h" x="28" y="61" width="24" height="6" rx="2.5" />
      <rect className="ta__h" x="44" y="50" width="24" height="6" rx="2.5" />
      <rect className="ta__h" x="60" y="39" width="24" height="6" rx="2.5" />
      <rect className="ta__h" x="76" y="28" width="24" height="6" rx="2.5" />
      <path className="ta__line" strokeLinejoin="round" d="M110 82 L108 24" />
      <path className="ta__line ta__line--thin" strokeLinejoin="round" d="M100 22 L52 28 L50 42" />
      <rect className="ta__b" x="92" y="4" width="32" height="18" rx="4" />
      <rect className="ta__h" x="97" y="8" width="22" height="9" rx="2.5" />
    </>
  ),
  /* An air bike side on: the big fan cage at the front (the whole point of the machine), a low frame to the rear feet,
     the saddle on its post, the moving handle swinging down to the pedals, and the console on the fan housing. */
  airbike: (
    <>
      <rect className="ta__b" x="8" y="82" width="26" height="3" rx="1.5" />
      <rect className="ta__b" x="92" y="84" width="40" height="2.5" rx="1.2" />
      <path className="ta__line ta__line--thin" strokeLinejoin="round" d="M22 82 L68 66 L98 58 M44 74 L40 42" />
      <rect className="ta__b" x="26" y="34" width="26" height="8" rx="4" />
      <circle className="ta__b" cx="102" cy="56" r="27" />
      <circle className="ta__h" cx="102" cy="56" r="21" />
      <path className="ta__s ta__s--abs" d="M102 56 V37 M102 56 L118.5 46.5 M102 56 L118.5 65.5 M102 56 V75 M102 56 L85.5 65.5 M102 56 L85.5 46.5" />
      <circle className="ta__b" cx="102" cy="56" r="5" />
      <path className="ta__line ta__line--thin" strokeLinejoin="round" d="M74 33 L68 62" />
      <g transform="translate(92 20) rotate(153)">
        <rect className="ta__h" x="-4" y="-3.5" width="40" height="7" rx="3.5" />
      </g>
      <circle className="ta__b" cx="68" cy="66" r="6" />
      <rect className="ta__h" x="58" y="68" width="20" height="5" rx="2.5" />
      <rect className="ta__b" x="92" y="3" width="28" height="13" rx="4" />
    </>
  ),
  /* An upright exercise bike side on: a shrouded solid flywheel at the front (no spokes — that is the air bike), the
     frame down to two floor feet, the saddle on its post, the crank with its pedal, and the handlebar stem with a
     console. Nothing here is a road bike's wheel. */
  bike: (
    <>
      <rect className="ta__b" x="12" y="82" width="32" height="3" rx="1.5" />
      <rect className="ta__b" x="86" y="82" width="42" height="3" rx="1.5" />
      <path className="ta__line ta__line--thin" strokeLinejoin="round" d="M28 82 L62 68 L92 68 M100 76 L104 24 M54 72 L42 36" />
      <circle className="ta__b" cx="98" cy="62" r="18" />
      <circle className="ta__h" cx="98" cy="62" r="13" />
      <circle className="ta__s ta__s--abs" cx="98" cy="62" r="7" />
      <circle className="ta__b" cx="98" cy="62" r="3" />
      <rect className="ta__h" x="26" y="30" width="26" height="8" rx="4" />
      <rect className="ta__b" x="98" y="12" width="24" height="7" rx="3.5" transform="rotate(6 110 15)" />
      <rect className="ta__b" x="96" y="20" width="16" height="9" rx="3" />
      <path className="ta__line ta__line--thin" d="M62 68 L74 76" />
      <circle className="ta__b" cx="62" cy="68" r="5" />
      <rect className="ta__h" x="66" y="74" width="20" height="5" rx="2.5" />
    </>
  ),
  /* The FAMILY picture for bands: a tube band stretched between two handles — the shape of the whole category — kept
     apart from the Resistance band kit tile, which is the closed loop. */
  bands_family: (
    <>
      <path className="ta__h" d="M16 60 C30 4 110 4 124 60 L108 60 C98 20 42 20 32 60 Z" />
      <path className="ta__s ta__s--abs" d="M40 30 Q70 14 100 30" />
      <rect className="ta__b" x="8" y="54" width="32" height="26" rx="9" />
      <rect className="ta__b" x="100" y="54" width="32" height="26" rx="9" />
      <path className="ta__s ta__s--abs" d="M16 62 V72 M22 62 V72 M28 62 V72 M34 62 V72 M106 62 V72 M112 62 V72 M118 62 V72 M124 62 V72" />
    </>
  ),
  /* A resistance band, long: rolled up at one end the way it comes out of a gym bag, with the tail run out straight
     across the tile to a loop handle. The roll says "band" and the tail says how long. Not the Bands tile's
     tube-and-handles, and not the Mini band's short oval. */
  band: (
    <>
      <path className="ta__h" d="M38 64 H92 Q118 64 132 52 V64 Q118 76 92 76 H38 Z" />
      <rect className="ta__b" x="124" y="46" width="12" height="30" rx="6" />
      <circle className="ta__h" cx="38" cy="42" r="32" />
      <path className="ta__s ta__s--abs" d="M38 42 m-24 0 a24 24 0 1 1 24 24 M38 42 m-16 0 a16 16 0 1 1 16 16 M38 42 m-8 0 a8 8 0 1 1 8 8" />
    </>
  ),
  /* A mini band on its own: the short, wide loop seen a little from above so its width shows as well as its ring — a
     band is a few centimetres of flat latex, and a bare ring reads as a hair tie. The lit ring is the top edge; the
     quiet body under it is the band's depth. An oval, as a mini band lies when it is not being worn, and shorter than the Resistance band's long stadium. */
  mini_band: (
    <>
      <path className="ta__b" d="M12 38 V50 a58 24 0 0 0 116 0 V38 a58 24 0 0 0 -116 0 Z" />
      <path className="ta__b" d="M24 50 a46 12 0 1 0 92 0 a46 12 0 1 0 -92 0 Z" />
      <path className="ta__h" fillRule="evenodd" d="M12 38 a58 24 0 1 0 116 0 a58 24 0 1 0 -116 0 Z M24 38 a46 12 0 1 0 92 0 a46 12 0 1 0 -92 0 Z" />
    </>
  ),
  /* A suspension trainer hung up: one anchor strap from the carabiner, the junction where it splits, then two long
     straps each with its length buckle, ending in the lit grips that double as foot cradles. Straps are the flat
     webbing, so they are drawn as bands, not cords. */
  suspension: (
    <>
      <path className="ta__line" strokeLinejoin="round" d="M70 14 V28 M66 34 L44 68 M74 34 L96 68" />
      <circle className="ta__b" cx="70" cy="9" r="6" />
      <circle className="ta__b" cx="70" cy="9" r="2" />
      <rect className="ta__b" x="63" y="26" width="14" height="9" rx="3" />
      <rect className="ta__b" x="52" y="42" width="10" height="14" rx="3" transform="rotate(33 57 49)" />
      <rect className="ta__b" x="78" y="42" width="10" height="14" rx="3" transform="rotate(-33 83 49)" />
      <rect className="ta__h" x="30" y="66" width="28" height="9" rx="4.5" transform="rotate(-18 44 70)" />
      <rect className="ta__h" x="82" y="66" width="28" height="9" rx="4.5" transform="rotate(18 96 70)" />
    </>
  ),
  /* A stability ball: big, smooth and seamless — the seams are the medicine ball's — with the inflation plug low on one
     side, a sheen where the light catches it, and the floor shadow that shows how large it is. */
  stability_ball: (
    <>
      <ellipse className="ta__b" cx="70" cy="85" rx="32" ry="3" />
      <circle className="ta__h" cx="70" cy="45" r="39" />
      <path className="ta__s ta__s--abs" d="M40 30 Q46 18 60 13" />
      <circle className="ta__b" cx="92" cy="68" r="4" />
      <circle className="ta__b" cx="92" cy="68" r="1.4" />
    </>
  ),
  /* The FAMILY picture for small tools: a skipping rope hanging from its two handles — the most recognisable small
     kit there is. Drawn as the rope falls (handles up), where the Skipping rope kit tile draws it mid-swing. */
  tools_family: (
    <>
      <path className="ta__line ta__line--thin" d="M32 36 C24 96 116 96 108 36" />
      <g transform="rotate(10 32 22)">
        <rect className="ta__h" x="24" y="6" width="16" height="32" rx="7" />
        <path className="ta__s ta__s--abs" d="M28 14 H36 M28 20 H36 M28 26 H36" />
      </g>
      <g transform="rotate(-10 108 22)">
        <rect className="ta__h" x="100" y="6" width="16" height="32" rx="7" />
        <path className="ta__s ta__s--abs" d="M104 14 H112 M104 20 H112 M104 26 H112" />
      </g>
    </>
  ),
  /* A medicine ball: a smaller, heavier ball than the stability ball, with a grip band round its middle — two seams and
     a field of dimples between them. A band, not meridians, so it cannot be read as a globe. */
  medicine_ball: (
    <>
      <ellipse className="ta__b" cx="70" cy="82" rx="26" ry="3" />
      <circle className="ta__h" cx="70" cy="46" r="33" />
      <path className="ta__s ta__s--abs" d="M38 38 Q70 50 102 38 M40.5 58 Q70 70 99.5 58" />
      <path className="ta__s ta__s--abs" d="M48 46.7 h.1 M58 48.7 h.1 M68 49.6 h.1 M78 49.2 h.1 M88 47.6 h.1 M53 52.2 h.1 M63 53.7 h.1 M73 53.9 h.1 M83 52.9 h.1 M48 55.3 h.1 M58 57.5 h.1 M68 58.4 h.1 M78 58.0 h.1 M88 56.3 h.1" />
    </>
  ),
  /* A battle rope mid-wave: two thick ropes pinned at one anchor and thrown a quarter-wave apart, the near one lit with
     its twist marked along it, each ending in a rounded grip. The waves are what the exercise is, so they carry the
     picture. */
  battle_rope: (
    <>
      <path className="ta__b" d="M21.8 49.6 L22.9 49.6 L24.0 49.7 L25.2 49.9 L26.5 50.0 L28.0 50.1 L29.7 50.1 L31.4 49.9 L33.2 49.4 L35.0 48.7 L36.7 47.8 L38.3 46.6 L39.8 45.4 L41.2 44.0 L42.6 42.5 L43.9 41.0 L45.1 39.6 L46.3 38.2 L47.4 37.0 L48.4 35.9 L49.3 35.1 L50.0 34.6 L50.4 34.4 L50.6 34.4 L50.5 34.4 L50.7 34.5 L51.1 34.7 L51.8 35.4 L52.8 36.4 L53.8 37.8 L55.0 39.4 L56.1 41.1 L57.3 43.0 L58.5 45.0 L59.7 47.0 L60.9 49.0 L62.2 51.1 L63.4 53.1 L64.7 55.1 L66.0 57.0 L67.4 58.8 L68.8 60.4 L70.2 62.0 L71.8 63.4 L73.4 64.6 L75.3 65.6 L77.2 66.3 L79.3 66.6 L81.5 66.5 L83.5 66.0 L85.4 65.1 L87.2 64.0 L88.8 62.7 L90.3 61.3 L91.7 59.6 L93.1 57.9 L94.4 56.1 L95.7 54.1 L97.0 52.1 L98.2 50.1 L99.4 48.0 L100.7 46.0 L101.9 44.0 L103.1 42.1 L104.2 40.3 L105.4 38.6 L106.5 37.1 L107.6 35.8 L108.6 34.7 L109.5 33.8 L110.3 33.2 L110.9 32.9 L111.4 32.7 L111.8 32.6 L112.1 32.6 L112.5 32.7 L113.0 32.9 L113.7 33.4 L114.5 34.0 L115.5 34.9 L116.6 36.2 L123.4 30.0 L122.1 28.6 L120.6 27.1 L119.0 25.8 L117.2 24.8 L115.3 23.9 L113.2 23.5 L111.1 23.4 L109.0 23.8 L107.0 24.5 L105.2 25.5 L103.6 26.8 L102.0 28.2 L100.6 29.8 L99.2 31.4 L97.9 33.3 L96.6 35.2 L95.3 37.1 L94.0 39.2 L92.8 41.2 L91.6 43.3 L90.3 45.3 L89.1 47.2 L88.0 49.1 L86.8 50.8 L85.7 52.4 L84.6 53.8 L83.6 54.9 L82.6 55.9 L81.8 56.6 L81.1 57.0 L80.5 57.3 L80.1 57.4 L79.8 57.4 L79.5 57.3 L79.0 57.2 L78.4 56.8 L77.6 56.3 L76.7 55.4 L75.7 54.4 L74.6 53.1 L73.5 51.6 L72.4 50.0 L71.2 48.2 L70.0 46.3 L68.8 44.3 L67.6 42.2 L66.4 40.2 L65.1 38.1 L63.8 36.1 L62.5 34.2 L61.2 32.3 L59.8 30.5 L58.3 28.8 L56.6 27.3 L54.6 26.1 L52.3 25.4 L49.8 25.2 L47.5 25.7 L45.4 26.7 L43.7 27.9 L42.1 29.2 L40.7 30.6 L39.4 32.1 L38.1 33.6 L36.9 35.0 L35.7 36.4 L34.6 37.6 L33.6 38.6 L32.7 39.4 L31.8 40.0 L31.0 40.4 L30.4 40.7 L29.7 40.8 L29.0 40.9 L28.2 40.9 L27.3 40.9 L26.2 40.7 L24.9 40.6 L23.5 40.5 L22.2 40.4 Z" />
      <path className="ta__h" d="M22.0 49.6 L23.1 49.6 L24.1 49.6 L25.0 49.7 L25.8 49.9 L26.6 50.1 L27.4 50.5 L28.2 50.9 L29.2 51.6 L30.2 52.3 L31.4 53.2 L32.6 54.2 L33.8 55.2 L35.2 56.3 L36.7 57.3 L38.3 58.3 L40.2 59.0 L42.2 59.5 L44.5 59.6 L46.7 59.1 L48.8 58.1 L50.7 56.8 L52.3 55.3 L53.8 53.6 L55.2 51.7 L56.5 49.7 L57.8 47.6 L59.0 45.6 L60.2 43.6 L61.4 41.7 L62.6 39.9 L63.7 38.3 L64.8 36.8 L65.9 35.5 L66.9 34.5 L67.8 33.7 L68.5 33.1 L69.2 32.8 L69.6 32.6 L69.9 32.6 L70.3 32.6 L70.7 32.7 L71.2 33.0 L71.9 33.5 L72.8 34.2 L73.8 35.1 L74.8 36.3 L75.9 37.7 L77.0 39.3 L78.2 41.0 L79.3 42.9 L80.5 44.9 L81.8 46.9 L83.0 48.9 L84.2 51.0 L85.5 53.0 L86.8 55.0 L88.1 56.9 L89.4 58.7 L90.8 60.4 L92.3 61.9 L93.8 63.3 L95.5 64.5 L97.3 65.5 L99.2 66.2 L101.3 66.6 L103.5 66.5 L105.5 66.0 L107.5 65.2 L109.2 64.1 L110.8 62.8 L112.3 61.3 L113.7 59.7 L115.1 58.0 L116.4 56.1 L117.7 54.2 L119.0 52.2 L120.3 50.2 L121.5 48.1 L122.7 46.1 L123.9 44.1 L116.1 39.3 L114.8 41.3 L113.6 43.4 L112.4 45.4 L111.2 47.3 L110.0 49.2 L108.9 50.9 L107.7 52.5 L106.7 53.8 L105.6 55.0 L104.7 55.9 L103.8 56.6 L103.1 57.1 L102.6 57.3 L102.2 57.4 L101.9 57.4 L101.6 57.3 L101.1 57.2 L100.4 56.8 L99.7 56.2 L98.7 55.4 L97.7 54.3 L96.7 53.0 L95.6 51.5 L94.4 49.9 L93.3 48.1 L92.1 46.2 L90.9 44.2 L89.6 42.1 L88.4 40.1 L87.2 38.0 L85.9 36.0 L84.6 34.1 L83.3 32.2 L81.9 30.5 L80.5 28.9 L79.0 27.4 L77.4 26.1 L75.7 24.9 L73.8 24.1 L71.7 23.5 L69.6 23.4 L67.5 23.7 L65.5 24.4 L63.7 25.3 L62.0 26.5 L60.4 27.9 L59.0 29.4 L57.6 31.1 L56.2 32.9 L54.9 34.8 L53.6 36.8 L52.4 38.8 L51.1 40.8 L49.9 42.8 L48.8 44.7 L47.6 46.4 L46.6 47.8 L45.6 49.0 L44.8 49.7 L44.2 50.2 L43.8 50.4 L43.6 50.4 L43.4 50.4 L43.0 50.3 L42.4 50.0 L41.6 49.6 L40.7 48.9 L39.6 48.0 L38.4 47.1 L37.1 46.0 L35.8 45.0 L34.4 44.0 L32.9 43.0 L31.3 42.2 L29.7 41.5 L28.0 41.0 L26.4 40.6 L24.8 40.5 L23.3 40.4 L22.0 40.4 Z" />
      <path className="ta__s ta__s--abs" d="M32.1 44.3 L26.6 48.3 M39.8 50.3 L33.6 53.0 M45.3 51.8 L42.8 58.1 M49.9 46.0 L52.9 52.1 M57.2 34.4 L60.3 40.4 M65.9 25.8 L66.3 32.6 M76.3 27.1 L70.6 30.8 M84.2 36.3 L77.4 37.1 M91.5 48.4 L84.8 48.8 M98.7 57.7 L92.3 59.7 M104.0 58.7 L101.7 65.1 M108.9 53.6 L111.5 59.9 M115.8 42.8 L119.3 48.7" />
      <circle className="ta__b" cx="120.0" cy="33.1" r="5.5" />
      <circle className="ta__h" cx="120.0" cy="41.7" r="5.5" />
      <circle className="ta__b" cx="17" cy="45" r="9" />
      <circle className="ta__h" cx="17" cy="45" r="4.5" />
    </>
  ),
  /* A skipping rope mid-swing: the cord thrown over in one loop with its two tails crossing just above the handles,
     which are held together low and ridged. The crossing is what stops it reading as headphones, which a plain arch
     over two capsules did. The Small tools tile draws the same rope hanging at rest. */
  skipping_rope: (
    <>
      <path className="ta__line ta__line--thin" strokeLinejoin="round" d="M54 66 L92 28 C112 -8 28 -8 48 28 L86 66" />
      <circle className="ta__b" cx="54" cy="66" r="3.2" />
      <circle className="ta__b" cx="86" cy="66" r="3.2" />
      <rect className="ta__h" x="47" y="66" width="12" height="22" rx="6" />
      <path className="ta__s ta__s--abs" d="M50.5 74 H55.5 M50.5 79 H55.5 M50.5 84 H55.5" />
      <rect className="ta__h" x="81" y="66" width="12" height="22" rx="6" />
      <path className="ta__s ta__s--abs" d="M84.5 74 H89.5 M84.5 79 H89.5 M84.5 84 H89.5" />
    </>
  ),
  /* A push sled side on: the ski runner with its upturned toe, the low deck, the weight horn carrying a stack of lit
     plates, and the tall push post with its grip leaning back toward the athlete. The plates are the load, so they
     are the lit part; everything that holds them is quiet. */
  sled: (
    <>
      <path className="ta__line ta__line--thin" strokeLinejoin="round" d="M12 82 H104 Q120 82 128 68" />
      <rect className="ta__b" x="34" y="76" width="6" height="6" />
      <rect className="ta__b" x="94" y="76" width="6" height="6" />
      <rect className="ta__b" x="22" y="70" width="92" height="7" rx="3" />
      <rect className="ta__b" x="62" y="20" width="7" height="52" rx="3" />
      <rect className="ta__h" x="41" y="60" width="50" height="10" rx="3" />
      <rect className="ta__h" x="41" y="49" width="50" height="10" rx="3" />
      <rect className="ta__h" x="41" y="38" width="50" height="10" rx="3" />
      <path className="ta__line ta__line--thin" strokeLinejoin="round" d="M32 70 L20 26" />
      <rect className="ta__b" x="6" y="18" width="24" height="8" rx="4" transform="rotate(-12 18 22)" />
      <circle className="ta__b" cx="118" cy="68" r="4" />
      <circle className="ta__b" cx="118" cy="68" r="1.4" />
    </>
  ),
  /* An ab wheel turned a little toward you so it reads as a wheel and not a barbell: a fat tyre with its edge showing
     behind the lit face, a hub, and the single axle running through it to a ridged grip on each side. */
  ab_wheel: (
    <>
      <path className="ta__line ta__line--thin" d="M26 45 H114" />
      <ellipse className="ta__b" cx="76" cy="45" rx="24" ry="35" />
      <ellipse className="ta__h" cx="64" cy="45" rx="24" ry="35" />
      <ellipse className="ta__s ta__s--abs" cx="64" cy="45" rx="17" ry="27" />
      <ellipse className="ta__b" cx="64" cy="45" rx="7" ry="9" />
      <circle className="ta__s ta__s--abs" cx="64" cy="45" r="2" />
      <rect className="ta__h" x="4" y="38" width="26" height="14" rx="7" />
      <path className="ta__s ta__s--abs" d="M11 41 V49 M16 41 V49 M21 41 V49" />
      <rect className="ta__h" x="110" y="38" width="26" height="14" rx="7" />
      <path className="ta__s ta__s--abs" d="M119 41 V49 M124 41 V49 M129 41 V49" />
    </>
  ),
  /* A foam roller lying on its side, turned so you see down the open end: the long lit cylinder with rings of raised
     grid round it, and the hollow core in the cap. Rings curve the way a cylinder's edge does, bowing toward the cap. */
  roller: (
    <>
      <path className="ta__h" d="M26 22 H110 V68 H26 A12 23 0 0 1 26 22 Z" />
      <path className="ta__s ta__s--abs" d="M38 22 Q45 45 38 68 M52 22 Q59 45 52 68 M66 22 Q73 45 66 68 M80 22 Q87 45 80 68 M94 22 Q101 45 94 68" />
      <path className="ta__s ta__s--abs" d="M48.0 30 h.1 M48.5 45 h.1 M48.0 60 h.1 M62.0 37.5 h.1 M62.0 52.5 h.1 M76.0 30 h.1 M76.5 45 h.1 M76.0 60 h.1 M90.0 37.5 h.1 M90.0 52.5 h.1" />
      <ellipse className="ta__b" cx="110" cy="45" rx="12" ry="23" />
      <ellipse className="ta__s ta__s--abs" cx="110" cy="45" rx="7" ry="14" />
      <ellipse className="ta__b" cx="110" cy="45" rx="3.5" ry="7" />
    </>
  ),
  /* A fitness sandbag lying down: the fat lit duffel, its zip along the front with the pull at one end, a seam near
     each end where the bag is gathered, the carry strap over the top and a D-handle at each end. Straps are the
     quiet part; the bag is what carries the weight. */
  sandbag: (
    <>
      <path className="ta__line ta__line--thin" strokeLinejoin="round" d="M42 30 V18 Q42 10 50 10 H90 Q98 10 98 18 V30" />
      <path className="ta__line ta__line--thin" strokeLinejoin="round" d="M16 42 H8 Q3 42 3 48 Q3 54 8 54 H16 M124 42 H132 Q137 42 137 48 Q137 54 132 54 H124" />
      <rect className="ta__h" x="14" y="26" width="112" height="48" rx="20" />
      <path className="ta__s ta__s--abs" d="M32 28 Q27 50 32 72 M108 28 Q113 50 108 72" />
      <path className="ta__s ta__s--abs" d="M38 49 H102 M36 49 v5 M42 49 v5 M48 49 v5 M54 49 v5 M60 49 v5 M66 49 v5 M72 49 v5 M78 49 v5 M84 49 v5 M90 49 v5 M96 49 v5" />
      <rect className="ta__b" x="96" y="44" width="12" height="9" rx="3" />
    </>
  ),
  /* The FAMILY picture for traditional kit: a crossed pair of gadas, the emblem of the akhara — heads apart at the top
     where they read as two maces, shafts crossing low. Crossing the shafts and not the heads is what keeps two round
     shapes from overlapping into a blob. */
  traditional_family: (
    <>
      <g transform="rotate(-26 70 64)">
        <rect className="ta__b" x="66.5" y="36" width="7" height="48" rx="3" />
        <path className="ta__s ta__s--abs" d="M66.5 66 H73.5 M66.5 71 H73.5 M66.5 76 H73.5" />
        <circle className="ta__b" cx="70" cy="86" r="4.5" />
        <path className="ta__b" d="M60 40 L64 31 H76 L80 40 Z" />
        <circle className="ta__h" cx="70" cy="17" r="16" />
        <path className="ta__s ta__s--abs" d="M56 12 Q70 18 84 12 M55 20 Q70 26 85 20" />
      </g>
      <g transform="rotate(26 70 64)">
        <rect className="ta__b" x="66.5" y="36" width="7" height="48" rx="3" />
        <path className="ta__s ta__s--abs" d="M66.5 66 H73.5 M66.5 71 H73.5 M66.5 76 H73.5" />
        <circle className="ta__b" cx="70" cy="86" r="4.5" />
        <path className="ta__b" d="M60 40 L64 31 H76 L80 40 Z" />
        <circle className="ta__h" cx="70" cy="17" r="16" />
        <path className="ta__s ta__s--abs" d="M56 12 Q70 18 84 12 M55 20 Q70 26 85 20" />
      </g>
    </>
  ),
  /* A gada, the Indian training mace, drawn whole and tilted: the great ball head banded across, a flared collar
     where it meets the shaft, a spike on top, and a long shaft ringed for grip ending in a pommel. The spike and the
     flared collar are what stop the head reading as a lollipop. */
  gada: (
    <g transform="rotate(-38 70 45)">
      <rect className="ta__b" x="66" y="48" width="8" height="34" rx="3" />
      <path className="ta__s ta__s--abs" d="M66 60 H74 M66 66 H74 M66 72 H74 M66 78 H74" />
      <circle className="ta__b" cx="70" cy="85" r="5" />
      <path className="ta__b" d="M58 54 L63 45 H77 L82 54 Z" />
      <circle className="ta__h" cx="70" cy="27" r="21" />
      <path className="ta__s ta__s--abs" d="M50 19 Q70 26 90 19 M49 28 Q70 35 91 28 M52 37 Q70 44 88 37" />
      <path className="ta__b" d="M65 8 L70 -3 L75 8 Z" />
    </g>
  ),
  /* An Indian club as the library means it, the mugdar: a heavy banded wooden barrel of a head on a short straight handle, grip rings on the shaft and a flared end to stop it leaving the hand. Smooth and unspiked,
     which is what keeps it from the Gada mace beside it. The Traditional tile draws a pair of the pin-shaped meels. */
  club: (
    <g transform="translate(0 1) rotate(36 70 44)">
      <rect className="ta__b" x="66" y="70" width="8" height="12" rx="3" />
      <path className="ta__s ta__s--abs" d="M66 75 H74 M66 79 H74" />
      <rect className="ta__b" x="62" y="81" width="16" height="5" rx="2.5" />
      <rect className="ta__b" x="64" y="62" width="12" height="9" rx="3" />
      <path className="ta__h" d="M70 2 C84 2 87 22 85 36 C84 50 79 65 70 65 C61 65 56 50 55 36 C53 22 56 2 70 2 Z" />
      <path className="ta__s ta__s--abs" d="M58 17 Q70 22 82 17 M57 47 Q70 52 83 47" />
    </g>
  ),
  /* A tractor tyre for flipping, stood up and turned a little so its width shows: the fat lit tread face with a ring of
     lugs round the edge, the sidewall line, the rim and hub, and the tyre's own thickness behind it. A tyre is thick,
     which is the point of the exercise, so the depth is drawn rather than implied. */
  tire: (
    <>
      <ellipse className="ta__b" cx="76" cy="45" rx="36" ry="38" />
      <ellipse className="ta__h" cx="64" cy="45" rx="36" ry="38" />
      <path className="ta__s ta__s--abs" d="M94.2 45.0 L98.6 45.0 M92.8 54.9 L96.9 56.3 M88.5 63.8 L92.0 66.4 M81.8 70.8 L84.3 74.5 M73.3 75.4 L74.7 79.7 M64.0 76.9 L64.0 81.5 M54.7 75.4 L53.3 79.7 M46.2 70.8 L43.7 74.5 M39.5 63.8 L36.0 66.4 M35.2 54.9 L31.1 56.3 M33.8 45.0 L29.4 45.0 M35.2 35.1 L31.1 33.7 M39.5 26.2 L36.0 23.6 M46.2 19.2 L43.7 15.5 M54.7 14.6 L53.3 10.3 M64.0 13.1 L64.0 8.5 M73.3 14.6 L74.7 10.3 M81.8 19.2 L84.3 15.5 M88.5 26.2 L92.0 23.6 M92.8 35.1 L96.9 33.7" />
      <ellipse className="ta__s ta__s--abs" cx="64" cy="45" rx="25" ry="27" />
      <ellipse className="ta__b" cx="64" cy="45" rx="15" ry="17" />
      <ellipse className="ta__s ta__s--abs" cx="64" cy="45" rx="6" ry="7" />
    </>
  ),
};

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
  /** Omitted for kit with no drawing of its own: the tile is then text only, never another thing's picture. */
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
