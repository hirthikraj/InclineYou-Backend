/**
 * The library's preview, and the one thing it must never be mistaken for.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THIS IS A SAMPLE. IT IS NOT THE RENDERER.
 *
 * The real substitution happens in `NudgeService` on the backend, against the
 * client's live figures — the amount comes off the same rows the money book
 * reads, so the sentence and the ledger cannot disagree. Nothing on this half
 * renders a message that gets sent, and if a second renderer ever appears here
 * the first symptom will be a WhatsApp quoting a figure the trainer cannot find
 * anywhere in the app.
 *
 * What this is for is the editor: a trainer typing `{count}` into a box needs to
 * see what the sentence will look like with a number in it, before they save it
 * and find out by sending it to somebody. So the values below are obviously
 * fictional — a name nobody on the roster has, round figures — and the preview is
 * labelled as an example on screen.
 *
 * An unknown token is LEFT AS ITSELF rather than blanked, which is the same rule
 * the server applies for the same reason: a trainer who typed `{nmae}` should see
 * `{nmae}` sitting in their preview, not a gap where a name was silently dropped.
 */

/** Fictional on purpose. See above. */
const SAMPLE: Record<string, string> = {
  '{name}': 'Meera',
  '{trainer}': 'Anbu',
  '{count}': '3',
  '{nth}': '100th',
  '{amount}': '₹6,000',
  '{package}': '12-session pack',
  '{days}': '11',
};

export function previewOf(body: string): string {
  let out = body;
  for (const [token, value] of Object.entries(SAMPLE)) {
    out = out.split(token).join(value);
  }
  return out;
}

/**
 * Every `{token}` in a body that the catalogue does not declare for it.
 *
 * Not an error and not blocked on save — a trainer may want a literal brace, and
 * a template that drops a variable is a legitimate edit. It is drawn as a warning
 * beside the box, because the alternative is finding out in a client's chat.
 */
export function unknownTokens(body: string, allowed: string[]): string[] {
  const found = body.match(/\{[a-z_]+\}/gi) ?? [];
  const ok = new Set(allowed);
  return Array.from(new Set(found.filter((t) => !ok.has(t))));
}
