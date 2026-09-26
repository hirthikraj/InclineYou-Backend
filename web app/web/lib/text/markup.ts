/**
 * THE ONE MARKUP THIS PRODUCT UNDERSTANDS, and it is deliberately tiny.
 *
 * A trainer writing a cue against a set wants three things — a word made
 * heavier, a word made lighter, and a line that says what the block is. So the
 * subset is three inline pairs and one line prefix, and **nothing else in
 * CommonMark is supported**: no links, no images, no code, no blockquotes, no
 * lists, no HTML. That is not a stage on the way to a full renderer. A cue is
 * read on a phone, mid-set, at 12px; every construct beyond emphasis is one a
 * trainer would have to be taught and a client would have to scroll.
 *
 *   **bold**        → strong
 *   *italic*        → em
 *   __underline__   → u
 *   # a heading     → the line, as a heading
 *
 * ── TWO DEVIATIONS, BOTH NAMED ──────────────────────────────────────────────
 *
 * CommonMark reads `__x__` as STRONG, exactly like `**x**`. Underline has no
 * markdown spelling at all — it never had one, because underlined text on the
 * web means a link — and the design draws a **U** in the toolbar. So the choice
 * was to drop the button or to spell underline something, and `__x__` is the
 * spelling the widest-used chat client already teaches. The cost is that a
 * trainer who pastes CommonMark written elsewhere gets an underline where they
 * meant a bold, which is a difference in weight and never in meaning; the cost
 * of the other answer is `<u>` in a plain text column.
 *
 * The second is that **a marker cannot open inside a word.** CommonMark lets
 * `*` do exactly that — `a*b*c` is `a<em>b</em>c` — and this format will not,
 * because `3*4 sets` is written in a gym every day: measured on `3*4 sets,
 * **not** four`, standard pairing let the multiplication sign open an emphasis
 * that ran to the first asterisk of the bold and ate the sentence between them.
 * A marker still CLOSES inside a word, which is why `**bold**s` is still bold.
 * The price is `**a**b**c**`, where the middle run cannot reopen: the second
 * bold stays literal. Closing inside a word is common; opening inside one is
 * only ever arithmetic.
 *
 * ── WHY A PARSER AND NOT A LIBRARY ──────────────────────────────────────────
 *
 * `marked` and friends produce an HTML STRING, and an HTML string has exactly
 * one way into React — `dangerouslySetInnerHTML` — which puts a sanitiser
 * between a trainer's keyboard and a client's screen for a feature whose whole
 * vocabulary is three pairs of asterisks. This returns NODES; the renderer
 * builds `<strong>` and `<em>` as elements, so there is no HTML anywhere on the
 * path and nothing to sanitise. It is also a page of code against a dependency
 * whose feature list is the part this format spends its time refusing.
 *
 * ── AND WHY IT IS NOT `server-only` ─────────────────────────────────────────
 *
 * Trap 18, and the same reason `lib/workouts/estimate.ts` is not: the editor
 * strips markers for an `aria-label` in the browser and any server-rendered
 * reader strips them for a summary line. One module, so the two cannot
 * disagree about what `**` means.
 */

export type Mark = 'bold' | 'italic' | 'underline';

/** A run of text under zero or more marks. `marks` is outermost-first. */
export interface Span {
  text: string;
  marks: Mark[];
}

/** One line. Blocks are lines — there are no paragraphs in a cue. */
export interface Block {
  heading: boolean;
  spans: Span[];
}

/** The three pairs, longest first — `**` has to be tried before `*`. */
const PAIRS: [string, Mark][] = [
  ['**', 'bold'],
  ['__', 'underline'],
  ['*', 'italic'],
];

const HEADING = /^#\s+/;

/* A letter, a digit — or another marker. The third is what stops the second
   half of a `**` that could not open from opening on its own as an italic. */
const GLUE = /[\p{L}\p{N}*_]/u;

/** One run of identical markers, and what it is allowed to be. */
interface Run {
  ch: '*' | '_';
  /** How many of this run's characters are still unspent. */
  left: number;
  open: boolean;
  close: boolean;
}

type Token = { text: string } | { run: Run };

/** A pair, once both halves have agreed. `mark` follows from the run's
 *  character and how many of it the pair took. */
interface Pair {
  open: number;
  close: number;
  mark: Mark;
}

/**
 * ── WHY THIS IS A DELIMITER STACK AND NOT A SPLIT-AND-RECURSE ───────────────
 *
 * The first version resolved `**` everywhere, then `__`, then `*`, splitting
 * the string at each pair and recursing into the three parts. It is shorter and
 * it is wrong for exactly one shape, which the toolbar makes trivial to
 * produce: an italic run WRAPPING a bold one. Bolding two words and then
 * italicising the sentence around them writes
 *
 *     *keep it smooth — **no bounce** at the bottom*
 *
 * and splitting on the bold first puts the opening `*` in one fragment and its
 * partner in another, where neither can ever find the other. Both asterisks
 * then printed, in the client's cue. So the markers are TOKENISED once and
 * matched against a stack — CommonMark's own shape, minus the parts a cue has
 * no use for (no links, so no bracket stack; no "rule of three", which exists
 * for `***` triples this format does not define).
 *
 * ── AND WHY A RUN CAN BE PARTLY SPENT ───────────────────────────────────────
 *
 * `left` is the run's unspent characters, taken from its END when it opens and
 * from its START when it closes. That is what makes `**a**b**c**` read as two
 * bold runs with a literal `b` between them rather than one bold run with the
 * middle markers inside it.
 */
function tokenise(source: string): Token[] {
  const tokens: Token[] = [];
  let text = '';
  for (let i = 0; i < source.length; ) {
    const ch = source[i];
    if (ch !== '*' && ch !== '_') {
      text += ch;
      i += 1;
      continue;
    }
    let n = 1;
    while (source[i + n] === ch) n += 1;
    if (text) {
      tokens.push({ text });
      text = '';
    }
    const before = source[i - 1];
    const after = source[i + n];
    tokens.push({
      run: {
        ch,
        left: n,
        /* Opening: what follows is not a space, and what precedes is not glue.
           The second half is this format's deviation — see the header. */
        open: after !== undefined && !/\s/.test(after) && (before === undefined || !GLUE.test(before)),
        /* Closing: what precedes is not a space. That is the whole rule —
           refusing a closer followed by a letter was measured wrong on
           `**bold**s` and on `**a**b**c**`, where it bolded the lot. */
        close: before !== undefined && !/\s/.test(before),
      },
    });
    i += n;
  }
  if (text) tokens.push({ text });
  return tokens;
}

/** `**`/`__` take two characters; `*` takes one. A lone `_` is not a marker in
 *  this subset at all — `snake_case` is a word, not an emphasis. */
function markFor(ch: '*' | '_', used: number): Mark | null {
  if (ch === '_') return used === 2 ? 'underline' : null;
  return used === 2 ? 'bold' : 'italic';
}

function match(tokens: Token[]): Pair[] {
  const pairs: Pair[] = [];
  const openers: number[] = [];

  tokens.forEach((token, index) => {
    if (!('run' in token)) return;
    const run = token.run;

    while (run.close && run.left > 0) {
      /* The NEAREST opener of the same character, which is what makes the
         nesting come out in the order it was written. */
      let at = -1;
      for (let k = openers.length - 1; k >= 0; k -= 1) {
        const candidate = tokens[openers[k]];
        if ('run' in candidate && candidate.run.ch === run.ch && candidate.run.left > 0) {
          at = k;
          break;
        }
      }
      if (at < 0) break;

      const opener = tokens[openers[at]] as { run: Run };
      const used = opener.run.left >= 2 && run.left >= 2 ? 2 : 1;
      const mark = markFor(run.ch, used);
      /* A single `_` cannot mark anything, and leaving the opener on the stack
         would spin here forever — the run is spent as text instead. */
      if (!mark) break;

      pairs.push({ open: openers[at], close: index, mark });
      opener.run.left -= used;
      run.left -= used;
      /* Everything opened INSIDE the run we just closed is unmatchable now. */
      openers.length = at + (opener.run.left > 0 ? 1 : 0);
    }

    if (run.open && run.left > 0) openers.push(index);
  });

  return pairs;
}

/**
 * The tokens, the pairs and the leftovers, walked into flat spans.
 *
 * A run's unspent characters are TEXT, and where they go is decided by which
 * end was eaten: an opener spends from its right, so its leftovers sit before
 * the mark begins; a closer spends from its left, so its leftovers sit after
 * the mark ends. That is the difference between `a ***b*** c` printing its
 * spare asterisks in the right places and printing them in the wrong ones.
 */
function spansOf(source: string): Span[] {
  const tokens = tokenise(source);
  const pairs = match(tokens);
  const spans: Span[] = [];
  const marks: Mark[] = [];

  const push = (text: string) => {
    if (!text) return;
    const last = spans[spans.length - 1];
    const now = [...marks];
    if (last && last.marks.length === now.length && last.marks.every((m, i) => m === now[i])) {
      last.text += text;
      return;
    }
    spans.push({ text, marks: now });
  };

  tokens.forEach((token, index) => {
    if ('text' in token) {
      push(token.text);
      return;
    }
    const run = token.run;
    const closing = pairs.filter(p => p.close === index);
    const opening = pairs.filter(p => p.open === index);

    /* Close innermost first — the last pair matched is the one nearest this
       run, because `match` always took the nearest opener available. */
    for (const pair of [...closing].reverse()) {
      const at = marks.lastIndexOf(pair.mark);
      if (at >= 0) marks.splice(at, 1);
    }
    if (closing.length) push(run.ch.repeat(run.left));
    if (opening.length) push(run.ch.repeat(run.left));
    if (!closing.length && !opening.length) push(run.ch.repeat(run.left));
    for (const pair of opening) marks.push(pair.mark);
  });

  return spans;
}

/** The written text, as blocks the renderer can draw. */
export function parseMarkup(source: string): Block[] {
  return source.split('\n').map(line => {
    const heading = HEADING.test(line);
    return { heading, spans: spansOf(heading ? line.replace(HEADING, '') : line) };
  });
}

/**
 * The same text with every marker removed.
 *
 * For the places that cannot draw an element and must not show punctuation
 * nobody typed on purpose: an `aria-label`, a `title`, a one-line summary in a
 * table cell. Never for display where `Markup` can be rendered instead.
 */
export function plainText(source: string): string {
  return parseMarkup(source)
    .map(block => block.spans.map(s => s.text).join(''))
    .join('\n');
}

/* ────────────────────────────────────────────────────────── the editing ── */

/** A field's text and where the caret is, in and out of every edit below. */
export interface Selection {
  value: string;
  start: number;
  end: number;
}

/**
 * Wrap the selection in a pair, or take that pair back off.
 *
 * ── IT UNWRAPS FROM EITHER SIDE OF THE MARKERS ──────────────────────────────
 *
 * A trainer who selects `strict` inside `**strict**` and presses B means *stop
 * being bold*, and so does one who selects `**strict**` markers and all. Both
 * are checked, because a selection restored after a click lands on one or the
 * other depending on how it was made, and a toggle that only recognised one of
 * them would double the markers on every second press.
 *
 * With nothing selected it writes the empty pair and puts the caret between the
 * halves, which is what a trainer who pressed B before typing the word meant.
 */
export function toggleMark(sel: Selection, mark: Mark): Selection {
  const delim = PAIRS.find(([, m]) => m === mark)![0];
  const { value, start, end } = sel;
  const n = delim.length;

  if (start === end) {
    return {
      value: value.slice(0, start) + delim + delim + value.slice(start),
      start: start + n,
      end: start + n,
    };
  }

  const inside = value.slice(start, end);

  /* The markers are inside the selection. */
  if (inside.length >= n * 2 && inside.startsWith(delim) && inside.endsWith(delim)) {
    const bare = inside.slice(n, -n);
    return { value: value.slice(0, start) + bare + value.slice(end), start, end: start + bare.length };
  }

  /* The markers are just outside it. */
  if (value.slice(start - n, start) === delim && value.slice(end, end + n) === delim) {
    return {
      value: value.slice(0, start - n) + inside + value.slice(end + n),
      start: start - n,
      end: end - n,
    };
  }

  return {
    value: value.slice(0, start) + delim + inside + delim + value.slice(end),
    start: start + n,
    end: end + n,
  };
}

/**
 * Make the caret's line a heading, or take it back to text.
 *
 * A LINE, not a selection — `#` is a line prefix in markdown and pretending
 * otherwise would let a trainer heading half a sentence. The caret keeps the
 * character it was next to rather than the offset it was at, which is the
 * difference between a caret that stays put and one that jumps two characters
 * every time the button is pressed.
 */
export function toggleHeading(sel: Selection): Selection {
  const { value, start, end } = sel;
  const from = value.lastIndexOf('\n', start - 1) + 1;
  const to = value.indexOf('\n', end) === -1 ? value.length : value.indexOf('\n', end);
  const line = value.slice(from, to);
  const match = line.match(HEADING);
  const next = match ? line.replace(HEADING, '') : `# ${line}`;
  const shift = next.length - line.length;
  return {
    value: value.slice(0, from) + next + value.slice(to),
    start: Math.max(from, start + shift),
    end: Math.max(from, end + shift),
  };
}

/** Drop text in at the caret, replacing whatever was selected. */
export function insertText(sel: Selection, text: string): Selection {
  const at = sel.start + text.length;
  return { value: sel.value.slice(0, sel.start) + text + sel.value.slice(sel.end), start: at, end: at };
}
