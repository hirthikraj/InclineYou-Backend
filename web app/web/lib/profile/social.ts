/**
 * THE TWO SOCIAL PROFILES — the caps and the two "before the request" checks
 * behind the profile's *Social links* tab, V35.
 *
 * A module of its own for the same reason `lib/profile/identity.ts` is one:
 * `lib/profile/api.ts` is `server-only` and the panel is a client component, so
 * a cap the input needs for its `maxLength` and the action needs before it
 * sends cannot live in either of them.
 *
 * ── WHY THERE IS SO LITTLE HERE ─────────────────────────────────────────────
 *
 * There is no catalogue and no normaliser on this half, deliberately.
 * `SocialLink.java` is the parser and the server is the authority: it reduces
 * `instagram.com/ravi.trains?igsh=…`, the desktop URL and a bare `@ravi.trains`
 * to one string, and sends the canonical value back on the PATCH so the field
 * can show what was actually stored. A second parser here would be a second
 * opinion — the `canonicalVideoId` note next door says the same thing about
 * YouTube, and it is the reason `introVideoId` and now `instagramHandle` ride
 * the wire at all.
 *
 * What these two functions do is catch the paste that is obviously not a
 * profile, so the trainer gets a sentence rather than a round trip. They are
 * LOOSE where the server is strict, on purpose: a stricter copy here would
 * refuse links the server would have taken, which is the worse of the two
 * failures.
 */

/** `TrainerService.MAX_SOCIAL_LINK`. The paste, not the stored value. */
export const MAX_SOCIAL_LINK = 500;

/**
 * Is this an Instagram profile, roughly?
 *
 * Accepts a bare handle with or without the `@`, because that is what a trainer
 * types from memory and the server takes it. Rejects the two shapes that are
 * links to a POST rather than an account — the most likely mistake in this
 * field, and the one whose failure would otherwise be invisible until a client
 * tapped through to a single reel.
 */
export function looksLikeInstagram(value: string): boolean {
  const v = value.trim();
  if (v === '') return false;
  if (/^@?[A-Za-z0-9._]{1,30}$/.test(v) && !v.includes('.com')) return true;
  if (!/(?:^|\.|\/)instagram\.com\//i.test(v)) return false;
  return !/instagram\.com\/(p|reel|reels|tv|stories|explore|accounts|direct)\//i.test(v);
}

/** Is this a YouTube CHANNEL, roughly? A bare `@handle` counts; a video does not. */
export function looksLikeYouTubeChannel(value: string): boolean {
  const v = value.trim();
  if (v === '') return false;
  if (/^@[A-Za-z0-9._-]{3,30}$/.test(v)) return true;
  if (!/(?:^|\.|\/)youtube\.com\//i.test(v)) return false;
  return /youtube\.com\/(@|channel\/|c\/|user\/)/i.test(v);
}

/**
 * Is this a link to one video?
 *
 * Only so the refusal can name the mistake, which is the same thing
 * `TrainerService.youtubeChannel` does on the other side. A trainer who pastes
 * a watch URL here has pasted it one tab too far along — the Identity tab's
 * intro video field wants exactly that string — and telling them so is the
 * difference between a fixed field and a re-paste of the same link.
 */
export function looksLikeVideo(value: string): boolean {
  return /(?:youtu\.be\/|youtube\.com\/(watch\?|shorts\/|embed\/|live\/|v\/))/i.test(value.trim());
}
