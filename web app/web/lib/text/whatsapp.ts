import type { Block, Mark, Span } from './markup';

/**
 * WHATSAPP'S OWN FORMATTING, READ INTO THE SAME SHAPE AS `markup.ts` (25 Nov 2026).
 *
 * A nudge is sent as WhatsApp text through a `wa.me` link, and WhatsApp formats with its own markers:
 * `*bold*`, `_italic_`. `markup.ts` writes `**bold**` and `*italic*`, which WhatsApp would show as stray
 * asterisks — or, worse, render a word meant to be italic as bold. So a message is STORED in WhatsApp's
 * syntax and the backend sends the string untouched; this file is the reader that lets `MarkupField` and
 * `Markup` draw it.
 *
 * WhatsApp's rule, followed here: a marker only counts at a word boundary — the opener at the start of a
 * line or after a non-word character, followed by a non-space; the closer before the end or a non-word
 * character, preceded by a non-space. That is what keeps `{pay_by_upi}` a placeholder and a UPI ID such as
 * `meera_k@okaxis` plain. Strike is `~text~`; monospace is not offered and reads as text. WhatsApp has no
 * underline and no heading — a heading is written as a whole line in bold (see `parseWhatsApp`).
 *
 * Client-safe and import-light, like `markup.ts`.
 */
export const WHATSAPP_MARKER: Record<'bold' | 'italic' | 'strike', string> = { bold: '*', italic: '_', strike: '~' };

const PAIRS: [string, Mark][] = [
  ['*', 'bold'],
  ['_', 'italic'],
  ['~', 'strike'],
];

const WORD = /[\p{L}\p{N}]/u;

export function parseWhatsApp(source: string): Block[] {
  return source.split('\n').map(line => {
    const spans = merge(spansOf(line, []));
    /* A HEADING IS A WHOLE LINE IN BOLD. WhatsApp has no heading; a line that is entirely `*…*` is how one
       reads in a chat, so that is what the editor's H writes and what reads back as a heading. */
    if (spans.length === 1 && spans[0].marks.length === 1 && spans[0].marks[0] === 'bold' && spans[0].text.trim()) {
      return { heading: true, spans: [{ text: spans[0].text, marks: [] }] };
    }
    return { heading: false, spans };
  });
}

function spansOf(text: string, marks: Mark[]): Span[] {
  for (let i = 0; i < text.length; i++) {
    const pair = PAIRS.find(([m]) => text[i] === m);
    if (!pair) continue;
    const [m, mark] = pair;
    if (marks.includes(mark)) continue;
    const before = i === 0 ? '' : text[i - 1];
    const after = text[i + 1] ?? '';
    if ((before && WORD.test(before)) || !after || /\s/.test(after) || after === m) continue;
    /* the closer: the next marker of the same kind that ends a word */
    for (let j = i + 2; j < text.length; j++) {
      if (text[j] !== m) continue;
      const prev = text[j - 1];
      const next = text[j + 1] ?? '';
      if (/\s/.test(prev) || (next && WORD.test(next))) continue;
      return [
        ...spansOf(text.slice(0, i), marks),
        ...spansOf(text.slice(i + 1, j), [...marks, mark]),
        ...spansOf(text.slice(j + 1), marks),
      ];
    }
  }
  return text ? [{ text, marks }] : [];
}

/** Adjacent runs under the same marks, joined — so a line reads as few spans as it has styles. */
function merge(spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && last.marks.join() === s.marks.join()) last.text += s.text;
    else out.push({ ...s });
  }
  return out;
}

/** The message as a client reads it in WhatsApp, markers removed — for a one-line summary. */
export function whatsappPlain(source: string): string {
  return parseWhatsApp(source)
    .map(b => b.spans.map(s => s.text).join(''))
    .join('\n');
}
