/**
 * The identity caps and the two derivations both halves of this screen need.
 *
 * A module of its own because `lib/profile/api.ts` is `server-only` and the form
 * is a client component: `IdentityForm` needs `MAX_BIO` for its `maxLength` and
 * its counter, and the server action needs it to cut before the request. One
 * copy, imported twice.
 *
 * **These numbers mirror `TrainerService`**, which is the only copy that is
 * enforced — the same relationship `lib/auth/policy.ts` has with `app.otp`.
 * Change one, change both, or a counter lies.
 */

/** `TrainerService.MAX_HEADLINE`. */
export const MAX_HEADLINE = 80;

/**
 * `TrainerService.MAX_BIO`.
 *
 * The ask is 100-200 WORDS and the enforcement is CHARACTERS, deliberately: a
 * word count is the guidance a person writes to, and a character count is the
 * only thing a column and a layout can actually promise. 1200 comfortably fits
 * 200 words at the ~6 characters a word runs to, so the cap never interrupts
 * somebody writing inside the guidance — it only stops the essay.
 */
export const MAX_BIO = 1200;

/** `MAX_NAME` on the setup step. Same field, same limit. */
export const MAX_NAME = 60;

/** The guidance, and the two ends of it the counter reports against. */
export const BIO_WORDS_MIN = 100;
export const BIO_WORDS_MAX = 200;

/**
 * How close to the ceiling the counter stops talking about words and starts
 * talking about the limit. Below this the number is encouragement; above it, it
 * is the only useful thing to say.
 */
export const BIO_CHARS_WARN_FROM = MAX_BIO - 150;

/** When the headline's counter appears — see `NameForm`'s `COUNTER_FROM`. */
export const HEADLINE_COUNTER_FROM = 60;

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * The 11-character id out of a canonical watch URL — the mirror of
 * `YouTubeLink.idOf`.
 *
 * The server sends `introVideoId` down, so this exists only for the LIVE
 * preview, where the field holds a paste that has not been saved yet and there
 * is no server answer to read. It is deliberately strict about the canonical
 * shape and not about the six paste shapes: guessing at those here would be a
 * second parser to disagree with `YouTubeLink.java`, and the preview's honest
 * answer to an unsaved paste is to wait for the save.
 */
export function canonicalVideoId(url: string): string | null {
  const m = /^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})$/.exec(url.trim());
  return m ? m[1] : null;
}

/**
 * Does this look like a YouTube link at all?
 *
 * Used ONLY to say so before the request — the server is the authority and
 * `YouTubeLink.java` is the parser. This is deliberately loose where that one is
 * strict: it catches the trainer who pasted a Vimeo URL or a sentence, and lets
 * everything else through to be judged properly. A stricter copy here would
 * refuse links the server would have accepted, which is the worse failure.
 */
export function looksLikeYouTube(url: string): boolean {
  return /(?:^|\.|\/)(?:youtube\.com|youtu\.be)\//i.test(url.trim());
}
