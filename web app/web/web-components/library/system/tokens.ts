import 'server-only';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The tokens, read out of the stylesheet that defines them.
 *
 * ── WHY THIS IS PARSED AND NOT TYPED ────────────────────────────────────────
 *
 * A tokens page is the one page in a design system that is guaranteed to go
 * wrong if it is written by hand. It is a list of values that already exist
 * somewhere else, so every entry is a copy, and a copy of a value is a value
 * with two spellings the moment somebody changes one of them. The failure is
 * quiet in exactly the wrong way: the page still renders, still looks
 * authoritative, and is simply wrong about what the product does.
 *
 * So nothing here is retyped. The page reads `app/styles/webapp.css` — the file
 * `sync-design.mjs` generates from the design system — at build time, and a
 * swatch on the tokens page is the value the application will actually paint.
 * Change `--tx-accent` in the design system, run the sync, and this page moves
 * with the product because it has no opinion of its own.
 *
 * ── WHY THE GENERATED COPY AND NOT THE DESIGN SYSTEM ────────────────────────
 *
 * `design-system/…/webapp.css` is the file a person edits, and it would be the
 * obvious source. It is the wrong one: it sits outside `web/`, so it is not on
 * the Next build's file graph and a token change there would not invalidate
 * this page's cache. `app/styles/webapp.css` is imported by the application, is
 * byte-identical for every §01 line, and is what the browser is actually
 * given — which makes it the honest thing for this page to report.
 *
 * ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
 *
 * It does not resolve `var()`. A token whose value is another token is
 * reported as written, because that IS the fact worth showing: `--tx-brand` is
 * `'Archivo',var(--tx-font)`, and flattening it would hide that the brand face
 * falls back to the body stack rather than to a system default.
 */

export type Token = { name: string; value: string };

const CSS = join(process.cwd(), 'app', 'styles', 'webapp.css');

/** The stylesheet, comments removed. Read once per build. */
function source(): string {
  return readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Every declaration inside the blocks whose selector matches `selector`.
 *
 * Declarations are split on top-level semicolons only: `--tx-chevron` carries a
 * data URI, and a naive `split(';')` cuts one of those in half and reports a
 * token whose value is a fragment of an SVG.
 */
function block(selector: string): Token[] {
  const css = source();
  const out: Token[] = [];
  /* Anchored to the start of a LINE (`m`), not to the end of the previous rule.
     The obvious anchor does not survive comment stripping: the file opens with
     a banner comment, so once it is gone the character before `:root` is a
     newline and nothing matched at all. Every block selector in this stylesheet
     begins its own line, which is the property worth depending on. */
  const re = new RegExp(`^\\s*${selector}\\s*\\{`, 'gm');

  for (let m = re.exec(css); m; m = re.exec(css)) {
    const start = m.index + m[0].length;
    const end = css.indexOf('}', start);
    if (end === -1) break;

    const body = css.slice(start, end);
    let depth = 0;
    let quote: string | null = null;
    let decl = '';

    const push = () => {
      const i = decl.indexOf(':');
      const name = decl.slice(0, i).trim();
      if (name.startsWith('--')) out.push({ name, value: decl.slice(i + 1).trim().replace(/\s+/g, ' ') });
      decl = '';
    };

    for (const ch of body) {
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      else if (ch === ';' && depth === 0) {
        if (decl.includes(':')) push();
        decl = '';
        continue;
      }
      decl += ch;
    }
    if (decl.includes(':')) push();
  }

  return out;
}

/** Everything declared on a bare `:root`, in file order, later wins. */
export function root(): Token[] {
  const seen = new Map<string, string>();
  for (const t of block(':root')) seen.set(t.name, t.value);
  return [...seen].map(([name, value]) => ({ name, value }));
}

/** One theme's palette. Both are complete — neither falls back to the other. */
export function theme(which: 'dark' | 'light'): Token[] {
  return block(`\\[data-theme="${which}"\\]`);
}

/** One token's value, or `undefined` if the stylesheet does not define it. */
export function value(name: string, from: Token[] = root()): string | undefined {
  return from.find((t) => t.name === name)?.value;
}

/**
 * The tokens whose names start with one of `prefixes`, in the order given.
 *
 * Prefix, not a hand-kept list of names: a token added to the stylesheet in a
 * family this page already shows should appear here without anybody editing
 * this file. That is the difference between a page that documents the system
 * and a page that documents what somebody remembered about it.
 */
export function group(prefixes: string[], from: Token[] = root()): Token[] {
  return prefixes.flatMap((p) => from.filter((t) => t.name.startsWith(p)));
}

/** Both themes' values for one token name, for a side-by-side table. */
export function pair(name: string): { name: string; dark?: string; light?: string } {
  return { name, dark: value(name, theme('dark')), light: value(name, theme('light')) };
}

/** Every token name either theme defines, in the dark theme's order. */
export function paletteNames(): string[] {
  const dark = theme('dark').map((t) => t.name);
  const light = theme('light').map((t) => t.name);
  return [...dark, ...light.filter((n) => !dark.includes(n))];
}
