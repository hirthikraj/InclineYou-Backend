/**
 * WHERE A TRAINER WORKS, AND HOW — the catalogue and caps behind the profile's
 * *Work & hours* tab, V34.
 *
 * ── WHY THIS IS NOT IN `lib/setup/options.ts` ───────────────────────────────
 *
 * That file is a character-for-character copy of the phone's
 * `app/src/setup/options.ts`, and its header says why in bold: an id is what
 * lands in a `trainer` column, the phone reads the same column, and a web build
 * that invented an id the phone does not know would put two spellings of one
 * answer on one profile. Copies stay copies.
 *
 * V34 is **backend + web only**, like V30, V32 and V33 before it. The phone has
 * no training-modes screen, nothing enters sync, and `app/src/setup/options.ts`
 * has no counterpart to mirror. Adding `TRAINING_MODES` there would make that
 * file stop being a copy of anything — the divergence it exists to prevent,
 * arrived at from the other direction. So it lives here, with the rest of what
 * only this half knows, and moves the day the phone grows the screen.
 *
 * `WORK_MODES` is imported from `lib/setup/options.ts` and deliberately NOT
 * re-declared here: that one IS a shared column (`trainer.work_mode`, V23) and
 * the phone writes the same three ids.
 */

import { MAX_ITEM_LENGTH } from './lists';

export interface WorkOption {
  id: string;
  label: string;
  /** The second line. What a client would actually be choosing. */
  note: string;
}

/**
 * How the coaching is delivered, in the order an Indian trainer picks them.
 *
 * ── THIS IS NOT `work_mode`, AND THE DIFFERENCE IS THE POINT ────────────────
 *
 * `work_mode` — *on my own · at a gym · both* — is the money book's defaults
 * hint: which price lists exist, who collects, what heads the gym group on the
 * Money screen. Its own migration says in bold that it must never gate a
 * feature, and nothing here changes that.
 *
 * These four are what a CLIENT is choosing between. The two answers are not
 * derivable from each other in either direction: a trainer on a gym floor may
 * still take home visits on Sundays, and an independent trainer may work out of
 * a studio they do not own. So the tab asks both, and the money book keeps
 * reading only the first.
 *
 * **`hybrid` is not the other three added together**, which is the obvious
 * objection to it and the reason the note spells it out. Picking `gym_floor`
 * and `online` says *some of my clients come to the gym and others are remote*.
 * `hybrid` says something a client cares about far more: *your programme is
 * both* — you come in twice a week and we do the third on a call. One is a mix
 * of clients, the other is a mix inside one client's week, and a trainer who
 * offers the second has to be able to say so.
 */
export const TRAINING_MODES: WorkOption[] = [
  {
    id: 'gym_floor',
    label: 'In-person at a gym',
    note: 'They come to the floor you work on',
  },
  {
    id: 'home_visit',
    label: 'Home visits',
    note: 'You travel to them — say where, below',
  },
  {
    id: 'online',
    label: 'Online coaching',
    note: 'A plan they follow, checked on a call',
  },
  {
    id: 'hybrid',
    label: 'Hybrid',
    note: 'One client, some sessions in person and some online',
  },
];

/** `TrainerService.MAX_MAP_LINK`. Refused over this, not truncated — a cut URL is broken. */
export const MAX_MAP_LINK = 500;

/** `MAX_NAME` on `gym_name` — `VARCHAR(120)` since V11. */
export const MAX_GYM_NAME = 120;

/** One locality. The server's own per-item cap, so the field cannot outrun it. */
export const MAX_AREA_LENGTH = MAX_ITEM_LENGTH;

/**
 * How many localities the tab will take.
 *
 * A PRODUCT cap, like `SPECIALITY_CAP`, and enforced in the same place — the
 * control, never `lib/profile/actions.ts`. The server's own limit is 25 and
 * that stays the only thing applied at the wire; silently dropping an
 * eleventh area on the way out would be this half editing an answer nobody
 * asked it to touch.
 *
 * Ten rather than five, unlike specialities, because the arguments differ. A
 * trainer who claims six specialities is telling a client nothing; a trainer
 * who covers six neighbourhoods is telling them something useful about whether
 * they are in range. The cap here is only about a row of tags staying readable.
 */
export const AREA_CAP = 10;

/**
 * Does this look like a link at all?
 *
 * The mirror of `TrainerService.mapLink` and deliberately just as thin. There
 * is no canonicalising to do — a maps URL is a short `maps.app.goo.gl` redirect
 * from one share sheet, a long `/maps/place/…@lat,lng,z/data=` string from
 * another, and something else again from Apple or OpenStreetMap — so the only
 * thing worth catching before the request is a trainer who pasted their address
 * instead of their link.
 */
export function looksLikeUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

/**
 * An area, as it will be stored.
 *
 * Whitespace collapsed as well as trimmed: these are typed, one at a time, into
 * a field a trainer tabs out of, and `"HSR  Layout"` and `"HSR Layout"` are one
 * answer that the server's de-duplication would otherwise keep as two.
 */
export function cleanArea(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, MAX_AREA_LENGTH);
}

/**
 * The label for a stored mode id — including one this build has never heard of.
 *
 * Unknown ids are rendered as themselves rather than dropped, the same call
 * every picker on this screen now makes. An id the catalogue has lost is
 * something the trainer can see and remove; an id silently hidden is counted,
 * unremovable and re-saved on every press of Save, which is exactly the bug the
 * seeded `fat_loss` speciality turned out to be.
 */
export function modeLabel(id: string): string {
  const known = TRAINING_MODES.find((m) => m.id === id);
  if (known) return known.label;
  return id.startsWith('custom:') ? id.slice('custom:'.length) : id;
}
