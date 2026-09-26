/**
 * The ten parts of the design system.
 *
 * ── WHY THIS LIST EXISTS AT ALL ─────────────────────────────────────────────
 *
 * For most of this library's life `/library` was a component catalogue and
 * nothing else — part 3 of ten, presented as if it were the whole system. That
 * is the common failure and it is not cosmetic: a team with a component list
 * and no principles, no tokens page and no written patterns re-answers the same
 * question at every call-site, and the catalogue grows a second spelling of
 * everything it already had.
 *
 * The taxonomy is the public one published by the UXDT division's UI/UX
 * guidelines (Design System Overview → Components of the Design System), kept
 * in its order and with its own four headings — Definition, Purpose, Key
 * elements, Example. Keeping somebody else's order is deliberate: a house
 * taxonomy invented here would have to be explained before it could be used,
 * and this one arrives already understood.
 *
 * ── WHAT IS DATA HERE AND WHAT IS NOT ───────────────────────────────────────
 *
 * The frame is data — number, slug, name, definition, purpose. The CONTENT of
 * each part is its page, because a part's content is drawings, specimens and
 * measured tables, not strings. What lives here is only what more than one
 * surface needs: the hub renders all ten, the sidebar lists all ten, and each
 * page reads its own row for its header. One list, three readers.
 *
 * `count` is a function rather than a number for the same reason `/library`
 * counts its own entries — a hand-kept figure is a figure that goes stale.
 */

import { ENTRIES } from '../../registry';

export type Part = {
  /** 1–10, the reference's own numbering. Rendered, not merely ordering. */
  n: number;
  /** Route segment under `/library`. */
  slug: string;
  name: string;
  /** What the part IS, in one sentence. */
  definition: string;
  /** What it is FOR. Never a restatement of the definition. */
  purpose: string;
  /** The part's own contents, as the hub's card lists them. */
  keys: string[];
  /** One concrete thing from this product, never a generic illustration. */
  example: string;
  /** A live figure for the card: what this part currently holds. */
  count?: () => string;
};

export const PARTS: Part[] = [
  {
    n: 1,
    slug: 'principles',
    name: 'Design principles',
    definition:
      'The foundational guidelines that decide what this product optimises for when two good options disagree.',
    purpose:
      'Settles arguments before they reach a component. A principle nobody can lose an argument to is decoration.',
    keys: ['The one-line version', 'Ten heuristics, applied', 'The component quality gate'],
    example:
      'A trainer on a gym floor, mid-session, one hand busy — every rule in the system is that person’s side of the argument.',
  },
  {
    n: 2,
    slug: 'style-guide',
    name: 'Style guide',
    definition:
      'The product’s visual identity written down: the type scale, the palette and the spacing ramp, each with its rule attached.',
    purpose: 'Makes two screens drawn by two people two months apart look like one product.',
    keys: ['Typography', 'Colour palette', 'Spacing and radius'],
    example:
      'Archivo sets the brand line and Inter sets everything read at length; lime #C6F24E is a fill, and never text on light.',
  },
  {
    n: 3,
    slug: 'components',
    name: 'Component library',
    definition:
      'The reusable elements the application is built from, rendered here from the application’s own imports.',
    purpose: 'Removes the second spelling. A component that exists is a decision nobody has to take twice.',
    keys: ['Actions', 'Forms', 'Status & identity', 'Data', 'Containers', 'Navigation', 'Domain'],
    example:
      'Editing web-components/ui/Button.tsx changes this page and every screen in the product on the same save.',
    count: () => `${ENTRIES.length} components`,
  },
  {
    n: 4,
    slug: 'patterns',
    name: 'Interaction patterns',
    definition:
      'The standard ways a person acts on this product and the product answers — saving, failing, navigating, waiting.',
    purpose:
      'Makes the next screen predictable from the last. Components answer “what is it”; patterns answer “what happens”.',
    keys: ['Error handling', 'Navigation', 'Feedback', 'Destructive actions'],
    example:
      'A field error is drawn under the field it belongs to. A toast never carries one — it can be gone before it is read.',
  },
  {
    n: 5,
    slug: 'accessibility',
    name: 'Accessibility guidelines',
    definition: 'The standards every component passes before it ships, stated as numbers rather than intentions.',
    purpose: 'Keeps the product usable by everyone who has to use it, including the trainer with one hand busy.',
    keys: ['Contrast', 'Targets', 'Keyboard', 'Announcement', 'Reduced motion'],
    example:
      'The quiet ink step was #A9AFB8, which measured 2.21:1. It is #8B939F now, and the eleven places using it as words moved up a step.',
  },
  {
    n: 6,
    slug: 'iconography',
    name: 'Iconography',
    definition: 'One stroked 24px set, drawn from one table, carried by one component.',
    purpose: 'Lets a glyph mean the same thing on every screen, and lets its weight change in one place.',
    keys: ['The set', 'Geometry', 'Rules of use'],
    example: 'stroke-width 1.6 is a design-system value; eleven copies of it would be eleven places it can drift.',
  },
  {
    n: 7,
    slug: 'motion',
    name: 'Motion and animation',
    definition: 'Four durations, four curves, and the rule for which one a given movement gets.',
    purpose: 'Motion that explains a change rather than decorating it — and that disappears when it is not wanted.',
    keys: ['Durations', 'Curves', 'What gets which', 'Reduced motion'],
    example:
      'The toast deck is the one place a real spring is spent, because four cards resettling on a bezier read as four things sliding.',
  },
  {
    n: 8,
    slug: 'grid',
    name: 'Grid system and layout',
    definition: 'The fixed frame of the application shell, and the rules for the fluid content inside it.',
    purpose: 'Puts the same thing in the same place on every screen, so navigation becomes muscle memory.',
    keys: ['The shell', 'Content widths', 'Density', 'Breakpoints'],
    example: '--w-row is the density dial for the whole application: change it and every list re-tunes together.',
  },
  {
    n: 9,
    slug: 'documentation',
    name: 'Documentation',
    definition: 'How to use the system, how to add to it, and what the build checks so the two halves cannot drift.',
    purpose: 'A system nobody can find their way into is a system that gets re-invented at the call-site.',
    keys: ['Using a component', 'Adding one', 'The checks', 'Where things live'],
    example: 'check-components is a ratchet: a file’s hand-written count can fall and stay down, never rise.',
  },
  {
    n: 10,
    slug: 'tokens',
    name: 'Tokens',
    definition: 'The named values every other part is written in terms of, read here out of the stylesheet itself.',
    purpose: 'One edit moves the whole product. A value typed at a call-site is a value the system cannot move.',
    keys: ['Colour', 'Type', 'Spacing and radius', 'Motion', 'Layout'],
    example: 'Changing --tx-accent re-tints every fill, focus ring, selected row and chart accent in both themes.',
  },
];

export const bySlug = (slug: string) => PARTS.find((p) => p.slug === slug);

/** The benefits the reference closes on, in this product's terms. */
export const BENEFITS: { k: string; v: string }[] = [
  {
    k: 'Consistency',
    v: 'One spelling of every control. The library renders the same import the application does, so a divergence is a compile error rather than a design-review finding.',
  },
  {
    k: 'Efficiency',
    v: 'A screen is assembled, not drawn. What remains is the domain question the screen exists to answer.',
  },
  {
    k: 'Scalability',
    v: 'A new screen inherits the whole system — density, focus rings, both themes, reduced motion — without asking for any of it.',
  },
  {
    k: 'Collaboration',
    v: 'One vocabulary. “A slab with a figure row” names a layout precisely enough to build from, in a sentence.',
  },
  {
    k: 'Accessibility',
    v: 'Contrast, targets and keyboard behaviour live inside the components, so a screen gets them by using the system rather than by remembering.',
  },
];
