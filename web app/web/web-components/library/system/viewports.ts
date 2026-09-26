import 'server-only';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * What the product does at other widths, read out of the stylesheets.
 *
 * ── WHY THIS IS PARSED AND NOT TYPED ────────────────────────────────────────
 *
 * The same argument `tokens.ts` makes, and it bites harder here. A breakpoint
 * table is a list of numbers that already exist in 216 places; typed by hand it
 * is 216 chances to be out of date, and every one of them fails silently — the
 * page still renders, still looks authoritative, and is simply wrong about what
 * the product does at 620px.
 *
 * That figure is itself the argument. A `grep -c '@media'` over the two
 * stylesheets answers 228, and twelve of those are comments quoting a media
 * query while explaining one; `@container` greps 24 against 18 real ones, and
 * one comment even cites a `(max-width:185px)` that is not a breakpoint the
 * product has. Stripping comments first is the difference between a census and
 * a plausible number.
 *
 * Part 8's breakpoint block used to be prose with no numbers in it at all
 * ("three things that give way in order, each at the width where it stops being
 * useful"). That is a true sentence and it is not a specification: a reader
 * could not tell from it whether a table stacks at 560 or 620, and neither
 * could the next person to write a screen.
 *
 * ── WHY BOTH STYLESHEETS ────────────────────────────────────────────────────
 *
 * `webapp.css` is the design system's, synced from the design file. `app.css`
 * is the application's own. The responsive story is split across them and the
 * split is not tidy: `--w-top` is declared `56px` on `:root` in the design
 * system and dropped to `46px` inside a `@media (max-width:900px)` in the
 * application's file, and `--w-tabs` — the bottom tab bar's whole height — is
 * declared ONLY there, inside that media block, so on desktop it does not
 * exist.
 *
 * A viewport page that read only the design system's file would report
 * `--w-top: 56px` and say nothing about the 46px every phone actually paints.
 * That is the exact failure this module exists to prevent, so it reads what the
 * browser is given: both files, labelled by which one a value came from.
 */

const DIR = join(process.cwd(), 'app', 'styles');

/** The two stylesheets the application actually loads, in cascade order. */
const FILES = [
  { key: 'webapp.css', label: 'Design system', path: join(DIR, 'webapp.css') },
  { key: 'app.css', label: 'Application', path: join(DIR, 'app.css') },
] as const;

export type Source = (typeof FILES)[number]['key'];

function source(path: string): string {
  /* Comments out first, for the same reason `tokens.ts` strips them: this
     codebase's comments are long, they quote CSS, and several of them contain
     the word `@media` followed by a width. Counted, those would be breakpoints
     the product does not have. */
  return readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

/* ── the walker ──────────────────────────────────────────────────────────── */

export type Rule = {
  source: Source;
  /** The `@media`/`@container` conditions enclosing this rule, outermost first. */
  at: string[];
  selector: string;
  /** Custom properties declared in this block. */
  decls: { name: string; value: string }[];
};

/**
 * Every rule in one stylesheet, with the at-rules it is nested inside.
 *
 * A hand-rolled walker rather than a CSS parser dependency, because the thing
 * being parsed is two known files in one repository, and the alternative is a
 * package on the critical path of a documentation page. It tracks three things
 * — brace depth, quotes, and parenthesis depth — which is enough for this
 * stylesheet and is the same shape `tokens.ts` already uses to split
 * declarations.
 */
function rules(key: Source, css: string): Rule[] {
  const out: Rule[] = [];
  const stack: string[] = [];
  let buf = '';
  let quote: string | null = null;
  let paren = 0;

  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];

    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === '(') paren += 1;
    if (ch === ')') paren -= 1;

    if (ch === '{' && paren === 0) {
      const head = buf.trim().replace(/\s+/g, ' ');
      buf = '';

      if (head.startsWith('@')) {
        /* An at-rule that wraps other rules — @media, @container, @supports.
           Pushed onto the stack; its own closing brace pops it. */
        stack.push(head);
        out.push({ source: key, at: [...stack], selector: '', decls: [] });
        continue;
      }

      /* A plain rule. Read to its matching close, which for this stylesheet is
         the next `}` at paren depth 0 — no rule here nests another. */
      const end = css.indexOf('}', i);
      const body = css.slice(i + 1, end === -1 ? undefined : end);
      out.push({ source: key, at: [...stack], selector: head, decls: customProps(body) });
      i = end === -1 ? css.length : end;
      continue;
    }

    if (ch === '}' && paren === 0) {
      /* Only an at-rule's close reaches here — a plain rule's close was
         consumed above — so this pops the stack. */
      stack.pop();
      buf = '';
      continue;
    }

    buf += ch;
  }

  return out;
}

/** The `--*` declarations in one rule body. */
function customProps(body: string): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  let depth = 0;
  let quote: string | null = null;
  let decl = '';

  const push = () => {
    const i = decl.indexOf(':');
    if (i === -1) return;
    const name = decl.slice(0, i).trim();
    /* `--` only. A media block that changes `padding` is a layout fact, but it
       is not a TOKEN fact, and this module's job on the tokens page is the
       second one. */
    if (name.startsWith('--')) out.push({ name, value: decl.slice(i + 1).trim().replace(/\s+/g, ' ') });
  };

  for (const ch of body) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ';' && depth === 0) {
      push();
      decl = '';
      continue;
    }
    decl += ch;
  }
  push();
  return out;
}

let cache: Rule[] | null = null;

/** Every rule in both stylesheets. Parsed once per build. */
export function allRules(): Rule[] {
  if (!cache) cache = FILES.flatMap((f) => rules(f.key, source(f.path)));
  return cache;
}

/**
 * How many at-rule blocks of each kind the product's CSS opens.
 *
 * The figure behind the iframe argument, and it has to be counted rather than
 * remembered: `@container` rules resolve correctly inside a narrow div and
 * `@media` rules do not, so the ratio is exactly how much of this product a
 * container-based preview would get wrong. Comments are stripped before the
 * count — several of them quote a `@media` line while explaining one, and a
 * `grep` reads those as rules.
 */
export function atRuleCounts(): { media: number; container: number } {
  let media = 0;
  let container = 0;
  for (const r of allRules()) {
    if (r.selector) continue;
    const cond = r.at[r.at.length - 1] ?? '';
    if (cond.startsWith('@media')) media += 1;
    else if (cond.startsWith('@container')) container += 1;
  }
  return { media, container };
}

/* ── the census ──────────────────────────────────────────────────────────── */

export type Breakpoint = {
  /** `max-width` or `min-width`. */
  feature: string;
  px: number;
  /** How many at-rule blocks in the product's CSS use exactly this condition. */
  uses: number;
};

/**
 * Every width the product changes its mind at, and how often.
 *
 * Counts at-rule BLOCKS, not the rules inside them: `@media (max-width:900px)`
 * opened fifty-nine times is fifty-nine separate decisions to treat 900 as a
 * boundary, which is the figure that says whether a number is load-bearing or a
 * one-off somebody reached for.
 */
export function census(feature?: 'max-width' | 'min-width'): Breakpoint[] {
  const seen = new Map<string, Breakpoint>();

  for (const r of allRules()) {
    if (r.selector) continue;
    const cond = r.at[r.at.length - 1];
    if (!cond?.startsWith('@media')) continue;

    for (const m of cond.matchAll(/\((max|min)-(width|height):\s*(\d+)px\)/g)) {
      if (m[2] !== 'width') continue;
      const f = `${m[1]}-width`;
      if (feature && f !== feature) continue;
      const k = `${f}:${m[3]}`;
      const hit = seen.get(k);
      if (hit) hit.uses += 1;
      else seen.set(k, { feature: f, px: Number(m[3]), uses: 1 });
    }
  }

  return [...seen.values()].sort((a, b) => b.uses - a.uses || a.px - b.px);
}

/** The widths carrying the system: everything used `min` times or more. */
export function loadBearing(min = 8): Breakpoint[] {
  return census().filter((b) => b.uses >= min).sort((a, b) => b.px - a.px);
}

/* ── what one component does across them ─────────────────────────────────── */

/**
 * A selector matching one class as a WHOLE class name.
 *
 * `.btn` must not match `.btngroup`, and a naive `includes('.btn')` matches
 * both — which reports the button as responsive because its group is. BEM's
 * `__` and `--` are continuations of a class name, so `.ph` does not match
 * `.ph__tabs` either: a family's parts are documented as their own rows.
 */
function familyRe(cls: string): RegExp {
  const bare = cls.replace(/^\./, '');
  return new RegExp(`\\.${bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`);
}

/**
 * The breakpoints at which a class family is restyled.
 *
 * Deliverable of the component library's responsive column: given `.btn`, which
 * widths have a rule that touches it. Matched on the class as a WORD — `.btn`
 * must not match `.btngroup`, and a naive `includes('.btn')` matches both and
 * reports the button as responsive because its group is.
 */
export function crossings(cls: string): Breakpoint[] {
  const re = familyRe(cls);
  const seen = new Map<string, Breakpoint>();

  for (const r of allRules()) {
    if (!r.selector || !re.test(r.selector)) continue;
    for (const cond of r.at) {
      /* `@media` ONLY, and this was a real defect rather than a refinement.
         Counting every at-rule reported the button as restyled at 1059px — the
         width of `@container schtools`, which is the schedule toolbar's own box
         and not a viewport at all. A page whose argument is that these two are
         different things cannot add them together in its own table. Container
         widths are counted separately, by `containerCrossings`. */
      if (!cond.startsWith('@media')) continue;
      for (const m of cond.matchAll(/\((max|min)-width:\s*(\d+)px\)/g)) {
        const k = `${m[1]}-width:${m[2]}`;
        if (!seen.has(k)) seen.set(k, { feature: `${m[1]}-width`, px: Number(m[2]), uses: 0 });
        seen.get(k)!.uses += 1;
      }
    }
  }

  return [...seen.values()].sort((a, b) => b.px - a.px);
}

/**
 * Whether a class family is styled anywhere, and where it is restyled.
 *
 * `crossings` alone cannot be trusted at a call-site, and the reason is the one
 * that makes documentation dangerous: an empty list means BOTH "this component
 * looks the same at every width" and "the class I was given does not exist".
 * Printed without the distinction, a typo renders as a confident claim that a
 * component is viewport-independent.
 *
 * So `found` is reported separately. The component pages derive a class from the
 * catalogue id (`c-button` → `.button`), which is right for most entries and
 * wrong for several, and a page that cannot find its class says so rather than
 * reporting a clean bill of health it did not earn.
 */
export function familyReport(cls: string): {
  found: boolean;
  crossings: Breakpoint[];
  /** How many `@container` blocks restyle it — its box, not the viewport. */
  container: number;
} {
  const re = familyRe(cls);
  const found = allRules().some((r) => r.selector && re.test(r.selector));
  if (!found) return { found, crossings: [], container: 0 };

  const container = new Set(
    allRules()
      .filter((r) => r.selector && re.test(r.selector))
      .flatMap((r) => r.at.filter((a) => a.startsWith('@container'))),
  ).size;

  return { found, crossings: crossings(cls), container };
}

/* ── one token, at every width ───────────────────────────────────────────── */

export type Declared = {
  source: Source;
  /** `''` when declared unconditionally. */
  media: string;
  selector: string;
  value: string;
};

/**
 * Every place a token is given a value, base case first.
 *
 * This is the whole of "map the tokens across viewports": a token's row on the
 * tokens page is not one value, it is this list. `--w-top` has three entries and
 * `--w-tabs` has one, and the one is inside a media block — which is the fact
 * that a desktop reader of that page could not otherwise learn.
 */
export function declared(name: string): Declared[] {
  const out: Declared[] = [];

  for (const r of allRules()) {
    if (!r.selector) continue;
    for (const d of r.decls) {
      if (d.name !== name) continue;
      const media = r.at.filter((a) => a.startsWith('@media')).join(' and ').replace(/@media\s*/g, '');
      out.push({ source: r.source, media, selector: r.selector, value: d.value });
    }
  }

  /* Unconditional first, then narrowing. A reader scanning the row wants the
     base case then what overrides it, which is cascade order for these two
     files and is NOT source order — the base lives in the first file and the
     overrides in the second, but a token overridden twice in one file must
     still read widest-first. */
  return out.sort((a, b) => {
    const w = (d: Declared) => {
      const m = d.media.match(/max-width:\s*(\d+)px/);
      return m ? Number(m[1]) : Infinity;
    };
    return w(b) - w(a);
  });
}

/**
 * Every token whose value depends on the viewport, with all of its values.
 *
 * The answer to "map the tokens across viewports", and it is a SEARCH rather
 * than a list: any token the stylesheets redeclare inside a width query is
 * here, so a token given a phone value tomorrow appears on the page without
 * anybody adding it. A hand-kept list would have had exactly the same problem
 * the tokens page was built to avoid.
 */
export function responsiveTokens(): { name: string; at: Declared[] }[] {
  const names = new Set<string>();
  for (const r of allRules()) {
    /* Declared inside a WIDTH query — a `prefers-reduced-motion` block is a
       token that changes with a preference, which is a real thing and not this
       page's subject. */
    if (!r.at.some((a) => a.startsWith('@media') && /-width:/.test(a))) continue;
    for (const d of r.decls) names.add(d.name);
  }

  return [...names]
    .map((name) => ({ name, at: declared(name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The tokens that only exist below some width. */
export function phoneOnly(): string[] {
  const names = new Set<string>();
  for (const r of allRules()) for (const d of r.decls) names.add(d.name);

  return [...names]
    .filter((n) => {
      const all = declared(n);
      return all.length > 0 && all.every((d) => /max-width/.test(d.media));
    })
    .sort();
}
