'use server';

import { revalidatePath } from 'next/cache';

import { saveWorkingHours } from '@/lib/setup/api';
import { SetupApiError } from '@/lib/setup/errors';
import { mergeWindows, sameWindows, type HourWindow } from '@/lib/setup/hours';
import { EXPERIENCE_BANDS, asWorkMode } from '@/lib/setup/options';
import {
  getIdentity,
  getWorkingWeek,
  patchIdentity,
  ProfileApiError,
  type Identity,
} from './api';
import { cleanCertifications } from './certifications';
import { MAX_BIO, MAX_HEADLINE, MAX_NAME, looksLikeYouTube } from './identity';
import { cleanList } from './lists';
import {
  MAX_SOCIAL_LINK,
  looksLikeInstagram,
  looksLikeVideo,
  looksLikeYouTubeChannel,
} from './social';
import { MAX_GYM_NAME, cleanArea, looksLikeUrl } from './work';

/**
 * The writes behind `/settings/profile` — **one per tab, and each sends only
 * its own fields.**
 *
 * That is the whole reason there are seven functions rather than one. Every field
 * on `UpdateRequest` is nullable and means *leave it alone*, so a tab that
 * PATCHes four keys cannot disturb a fifth it never drew. If both tabs sent the
 * whole profile, the Identity tab would be writing back a certification list it
 * read on page load — and a trainer with two tabs open, or a phone that edited
 * drawer 2a in between, would have the older of the two silently win. That is
 * not a hypothetical for four of the five tabs: certifications, experience,
 * specialities and languages are V8 columns the phone edits over this same
 * endpoint.
 *
 * **Within a tab it is still one button, never autosave.** A bio that saved as
 * it was typed would store a half-written sentence a few times a minute, and
 * chips that wrote on toggle would fire a request per click. One button, one
 * request, one message.
 *
 * Both return the saved `Identity` rather than `void`: the server canonicalises
 * the video URL and de-duplicates the list, so what the trainer typed and what
 * is now stored are different strings, and a form that kept showing the paste
 * would be showing something that is no longer the record.
 */
export type SaveResult =
  | { ok: true; identity: Identity }
  | { ok: false; message: string };

export interface IdentityInput {
  name: string;
  headline: string;
  bio: string;
  introVideoUrl: string;
}

export async function saveIdentity(input: IdentityInput): Promise<SaveResult> {
  const name = input.name.trim().slice(0, MAX_NAME);
  // A client cannot accept an invite from a blank name, and the server IGNORES a
  // blank `name` rather than clearing it — so an empty value would report a
  // successful save and change nothing. Said here rather than let through.
  if (name.length === 0) {
    return { ok: false, message: 'Your name is the one thing we can’t skip.' };
  }

  const video = input.introVideoUrl.trim();
  // Answered before the request, because "that isn't a YouTube link" is a
  // sentence this half can write correctly and a round trip cannot improve on.
  // The server is still the authority — this only catches the obvious case.
  if (video.length > 0 && !looksLikeYouTube(video)) {
    return {
      ok: false,
      message: 'That doesn’t look like a YouTube link. Paste the link from the video’s Share button.',
    };
  }

  try {
    const identity = await patchIdentity({
      name,
      /*
       * Sent even when empty — `''` CLEARS the column, which is the correct
       * meaning of emptying a field and pressing Save, and the same rule the
       * setup list steps follow. Omitting them would make this screen able to
       * add a bio and never able to remove one.
       *
       * Cut to the caps rather than sent long: the server refuses an over-long
       * bio for the whole PATCH, which here would take the trainer's NAME down
       * with it. The textarea caps at the same number, so this is the belt to
       * its braces.
       */
      headline: input.headline.trim().slice(0, MAX_HEADLINE),
      bio: input.bio.trim().slice(0, MAX_BIO),
      introVideoUrl: video,
    });
    // The account menu and every screen that greets the trainer by name read
    // `/v1/trainers/me`. Without this a renamed trainer keeps the old name in
    // the shell until a hard reload.
    revalidatePath('/', 'layout');
    return { ok: true, identity };
  } catch (error) {
    return { ok: false, message: messageFor(error) };
  }
}

/**
 * The Certifications tab's save.
 *
 * `cleanCertifications` runs here and not only in the picker, because this is
 * the last point before the column and the toggle is not the only way a list
 * can arrive — a stale tab, a replayed action, a future importer. It also does
 * the thing the caps argument turns on: over `MAX_CERTIFICATIONS` the server
 * refuses the PATCH outright rather than truncating, and a refusal is a whole
 * lost save rather than a shortened one.
 *
 * An empty list is sent, not skipped. Clearing every chip and pressing Save is
 * a real instruction — the server reads `[]` as *clear it* — and a version that
 * quietly declined to write an empty list could add a certification and never
 * remove the last one.
 */
export async function saveCertifications(ids: string[]): Promise<SaveResult> {
  try {
    const identity = await patchIdentity({ certifications: cleanCertifications(ids) });
    // The preview on the Identity tab draws these, and the phone's drawer 2a
    // reads the same column.
    revalidatePath('/', 'layout');
    return { ok: true, identity };
  } catch (error) {
    return { ok: false, message: messageFor(error) };
  }
}

/**
 * The Experience tab's save.
 *
 * The band is checked against the catalogue rather than sent as typed, because
 * the column is a free 20-character string on the server and nothing downstream
 * would notice a value that is not one of the five until `labelFor` rendered it
 * raw beside a trainer's name — which is precisely the bug the missing
 * `acsm_cpt` label caused, arrived at from the other direction.
 */
export async function saveExperienceBand(band: string): Promise<SaveResult> {
  if (!EXPERIENCE_BANDS.some((b) => b.id === band)) {
    return { ok: false, message: 'Pick one of the five bands.' };
  }
  try {
    const identity = await patchIdentity({ experienceBand: band });
    revalidatePath('/', 'layout');
    return { ok: true, identity };
  } catch (error) {
    return { ok: false, message: messageFor(error) };
  }
}

/**
 * The Specialities tab's save.
 *
 * The cap of five is the picker's to enforce and is deliberately not re-applied
 * here — `lib/profile/lists.ts` gives the reason: it is a rule about what a
 * trainer should say, and silently dropping the sixth would be this file
 * editing an answer nobody asked it to touch. What IS re-applied is the
 * server's own limit, over which the PATCH is refused whole.
 *
 * An empty list is sent, not skipped. Setup refuses to leave this answer blank
 * because it is the first thing a client reads; clearing it afterwards is a
 * real instruction, and Settings is where the flow's own comment says clearing
 * an answer belongs.
 */
export async function saveSpecialities(ids: string[]): Promise<SaveResult> {
  try {
    const identity = await patchIdentity({ specialities: cleanList(ids) });
    revalidatePath('/', 'layout');
    return { ok: true, identity };
  } catch (error) {
    return { ok: false, message: messageFor(error) };
  }
}

/** The Languages tab's save. No cap of its own — see `LanguagePicker`. */
export async function saveLanguages(ids: string[]): Promise<SaveResult> {
  try {
    const identity = await patchIdentity({ languages: cleanList(ids) });
    revalidatePath('/', 'layout');
    return { ok: true, identity };
  } catch (error) {
    return { ok: false, message: messageFor(error) };
  }
}

export interface WorkPlaceInput {
  /** `'independent' | 'gym' | 'both'`, or `''` to un-answer it. */
  workMode: string;
  gymName: string;
  mapLink: string;
  trainingModes: string[];
  serviceAreas: string[];
}

/**
 * The Work & hours tab's first save — where you work, and how.
 *
 * ── IT CAN CLEAR THE GYM, AND THAT IS NOT A SIDE EFFECT ─────────────────────
 *
 * Sending `gymName: ''` makes the server clear `gymSharePercent` too, in the
 * same statement — `TrainerService.update` does it deliberately, because a
 * percentage with nothing to take it is an arrangement with no counterparty.
 * So a trainer moving from *at a gym* to *on my own* loses the share figure the
 * Money screen splits by, and that is the correct outcome rather than a bug to
 * work around: the alternative is a settlement line for a gym they have left.
 *
 * The panel says so above the button before it happens. What must never happen
 * is the quiet version — keeping a hidden gym name because the fields are no
 * longer on screen, so a client reads a gym the trainer does not work at.
 *
 * The other three are pure profile: nothing in InclineYou branches on `mapLink`,
 * `trainingModes` or `serviceAreas`, exactly like V33's identity block.
 */
export async function saveWorkPlace(input: WorkPlaceInput): Promise<SaveResult> {
  const mode = input.workMode.trim();
  // Checked against the catalogue rather than sent as typed, the same call
  // `saveExperienceBand` makes: the column is a free VARCHAR(20) and the server
  // would take a fourth value, after which `WORK_MODES.find` renders nothing at
  // all on the packs step and the Money screen.
  if (mode !== '' && asWorkMode(mode) === null) {
    return { ok: false, message: 'Pick one of the three, or clear the answer.' };
  }

  const independent = mode === 'independent';
  // The gym fields are not on screen for an independent trainer, so what is in
  // their state is whatever was loaded. Cleared explicitly rather than sent
  // back: see the note above.
  const gymName = independent ? '' : input.gymName.trim().slice(0, MAX_GYM_NAME);
  const mapLink = independent ? '' : input.mapLink.trim();

  // Answered here because "that isn't a link" is a sentence this half can write
  // correctly and a round trip cannot improve on. The server is still the
  // authority — this only catches the trainer who pasted their address.
  if (mapLink.length > 0 && !looksLikeUrl(mapLink)) {
    return {
      ok: false,
      message:
        'That doesn’t look like a link. Paste the one from the map’s Share button — it starts with https://',
    };
  }

  try {
    const identity = await patchIdentity({
      /*
       * All five sent whole, empty values included. `''` and `[]` CLEAR, which
       * is the correct meaning of un-answering, and a version that skipped them
       * could add a map link and never remove one.
       */
      workMode: mode,
      gymName,
      mapLink,
      trainingModes: cleanList(input.trainingModes),
      // Free text rather than ids, so each one is normalised before the server
      // de-duplicates — "HSR  Layout" and "HSR Layout" are one area.
      serviceAreas: cleanList(input.serviceAreas.map(cleanArea)),
    });
    // `workMode` is read by the packs step and by add-client, and `gymName`
    // heads the gym group on the Money screen.
    revalidatePath('/', 'layout');
    return { ok: true, identity };
  } catch (error) {
    return { ok: false, message: messageFor(error) };
  }
}

export interface SocialInput {
  instagramUrl: string;
  youtubeUrl: string;
}

/**
 * The Social links tab's save — V35, and the only fields on this profile that
 * point OFF this product.
 *
 * ── BOTH SENT WHOLE, EMPTY INCLUDED ─────────────────────────────────────────
 *
 * `''` CLEARS, the same contract every other tab here relies on. A trainer who
 * has changed handles has to be able to remove the old one, and a version that
 * skipped blanks could add a link and never take one away — the failure mode
 * that would leave a client tapping through to a dead account.
 *
 * ── AND WHY THE TWO CHECKS BELOW ARE HERE AND NOT ONLY ON THE SERVER ────────
 *
 * `SocialLink.java` is the parser and stays the authority. These two catch the
 * pastes whose refusal this half can word better than a round trip can: a link
 * to one reel instead of an account, and — the likely one — the intro VIDEO
 * pasted into the channel field, which is a real string the trainer has, one
 * tab away from the field that wants it.
 */
export async function saveSocialLinks(input: SocialInput): Promise<SaveResult> {
  const instagram = input.instagramUrl.trim();
  const youtube = input.youtubeUrl.trim();

  if (instagram.length > 0 && !looksLikeInstagram(instagram)) {
    return {
      ok: false,
      message:
        'That doesn’t look like an Instagram profile. Your handle on its own works — @yourname.',
    };
  }
  if (youtube.length > 0 && !looksLikeYouTubeChannel(youtube)) {
    return {
      ok: false,
      message: looksLikeVideo(youtube)
        ? 'That is a link to one video. This field wants your channel — the Identity tab has a place for a video.'
        : 'That doesn’t look like a YouTube channel. Your handle on its own works — @yourname.',
    };
  }

  try {
    const identity = await patchIdentity({
      // Cut to the cap rather than sent long, the same belt-and-braces as the
      // bio: the server refuses an over-long value for the WHOLE patch, which
      // here would take the other link down with it.
      instagramUrl: instagram.slice(0, MAX_SOCIAL_LINK),
      youtubeUrl: youtube.slice(0, MAX_SOCIAL_LINK),
    });
    // The Identity tab's preview card draws both handles.
    revalidatePath('/', 'layout');
    return { ok: true, identity };
  } catch (error) {
    return { ok: false, message: messageFor(error) };
  }
}

export type WeekResult = { ok: true } | { ok: false; message: string };

/**
 * The Work & hours tab's second save — the working week.
 *
 * ── IT IS A SEPARATE ACTION, NOT A SEPARATE BUTTON ──────────────────────────
 *
 * This and `saveWorkPlace` are two records, in two tables, over two protocols,
 * with two failure modes — which is why they are two functions. It is NOT why
 * they were briefly two buttons: `WorkPanel` has one Save, calls whichever of
 * these two the trainer's edits actually require, and writes the partial
 * failure out properly instead of designing around it. A trainer does not know
 * that their gym's name and their Tuesday morning live in different tables.
 *
 * **`WorkPanel` only calls this when the week half is dirty, and that is a
 * correctness rule rather than an optimisation.** `WeekPicker` shows one set of
 * windows standing for every day, so writing the week back untouched would
 * flatten a Saturday that genuinely differs. The guard below is the second
 * line of that defence, not the first.
 *
 * ── AND WHY IT WRITES THROUGH THE SYNC ROUTE ────────────────────────────────
 *
 * `/v1/working-hours` is **read only, deliberately** — `WorkingHoursService`'s
 * own header explains that a permission-shaped table the phone also writes
 * offline is not one to give a second write path to. `/v1/sync/push` is the one
 * path that has ever written this table, from the phone and from setup, and it
 * is trainer-scoped and idempotent on the row id, which is all a single online
 * write needs. Reusing `lib/setup/api.ts`'s `saveWorkingHours` rather than
 * copying it: the pull that file's header warns about is a different function,
 * and this one is a push with nothing to drag down.
 *
 * Wholesale per weekday, not diffed — a day's hours are one idea, and the same
 * call the phone's `saveWorkingHours` makes. Days that did not change are
 * skipped entirely, so pressing Save on an untouched week is zero writes.
 */
export async function saveWorkingWeek(
  days: number[],
  windows: HourWindow[],
): Promise<WeekResult> {
  const merged = mergeWindows(windows);
  /*
   * Refused rather than written. In setup this shape means "I did not answer",
   * and Skip for now is there to say so; here there is no Skip, and writing it would
   * close all seven days — which is a much louder claim than an unanswered
   * question, and the one that leaves add-client with no slots to offer and the
   * day ribbon with no ground to draw on.
   */
  if (days.length === 0 || merged.length === 0) {
    return {
      ok: false,
      message:
        'A week needs at least one day and one window — clients’ sessions are booked out of these.',
    };
  }

  try {
    const stored = await getWorkingWeek();
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const before = mergeWindows(stored.filter((h) => h.weekday === weekday));
      const after = days.includes(weekday) ? merged : [];
      if (sameWindows(before, after)) continue;
      await saveWorkingHours(
        weekday,
        after,
        stored.filter((h) => h.weekday === weekday).map((h) => h.id),
      );
    }
    // Every screen drawn on the working windows: the day ribbon, the schedule's
    // ground, and add-client's slot list.
    revalidatePath('/today');
    revalidatePath('/schedule');
    revalidatePath('/settings/profile/work');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: messageFor(error) };
  }
}

/** Re-read after a failed save, so the form can offer the stored value back. */
export async function reloadIdentity(): Promise<Identity | null> {
  try {
    return await getIdentity();
  } catch {
    return null;
  }
}

/**
 * A refusal, as a sentence.
 *
 * The server's own `detail` wins wherever it wrote one — `lib/packs/api.ts`
 * records what happens when it is not read: *"A pack needs a price"* reaching
 * the log and never the trainer. The cases below are the ones with no detail.
 */
function messageFor(error: unknown): string {
  /*
   * TWO ERROR CLASSES, ONE SENTENCE WRITER.
   *
   * The working-week save writes through `lib/setup/api.ts`, which throws
   * `SetupApiError`, while everything else on this screen throws
   * `ProfileApiError`. They carry the same two fields for the same two reasons
   * and neither is a subclass of the other, so this reads the shape rather than
   * the name. Without it a rejected push would fall through to *"That didn't
   * save"* and drop the server's own reason — the exact defect `lib/packs/api.ts`
   * records, where *"A pack needs a price"* reached the log and never the
   * trainer.
   */
  if (error instanceof ProfileApiError || error instanceof SetupApiError) {
    if (error.detail) return error.detail;
    if (error.status === null) {
      return 'Couldn’t reach the server. Nothing was saved — your changes are still here.';
    }
    if (error.status === 401 || error.status === 403) {
      return 'Your session expired. Sign in again.';
    }
    if (error.status === 429) {
      return 'Too many saves in a minute. Wait a moment and try again.';
    }
  }
  return 'That didn’t save. Try again in a moment.';
}
