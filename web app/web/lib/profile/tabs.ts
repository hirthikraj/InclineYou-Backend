/**
 * THE PROFILE'S SECTIONS, AND THE ORDER THEY ARE DRAWN IN.
 *
 * The profile was one scrolling page with two headings on it. It is now a tab
 * strip, because the brief for this screen is seven sections — identity,
 * certifications, experience, specialities, languages, training modes and
 * locations, social links — and seven `<h2>`s stacked in a column is a page
 * whose seventh section nobody has ever seen. A trainer who wants to change
 * their bio should not scroll past their certificates to reach it. All seven
 * are built.
 *
 * **Every tab is a real route**, the same call `components/clients/file/shared.
 * tsx` makes for the client file's six: the back button works between them, a
 * tab can be linked to, and each one loads only its own panel. `PageTabs` draws
 * the strip — links with `aria-current`, never a `tablist`, because a `tablist`
 * promises arrow-key movement between panels that are already in the document
 * and these are page loads.
 *
 * ## Adding the next one
 *
 * A row here, a folder under `app/(main)/settings/profile/`, and a panel. The
 * five that exist are all done: the four V8 columns the setup flow already
 * collects — certifications, experience, specialities, languages — each had
 * their setup step's body extracted into `components/profile/` and are now
 * rendered by both, so a trainer editing an answer later meets the same control
 * that collected it rather than a second, subtly different version of it.
 *
 * **Training modes and locations arrived as V34** and is the sixth tab, under
 * the name *Work & hours* — because the working week went into it. The
 * migration came first, as this note used to say it would have to: `work_mode`
 * and `gym_name` are the money book's defaults hint and could not be made to
 * stand for a client-facing fact, so `map_link`, `training_modes` and
 * `service_areas` are new columns beside them rather than a reinterpretation of
 * them. Backend and web only, like V30, V32 and V33 — nothing enters sync and
 * the phone's flow is untouched.
 *
 * That tab is the one place in the profile that is not only `trainer` columns:
 * the working week is rows in `working_hours`, read from `GET /v1/working-hours`
 * and written through `PATCH /v1/working-hours`. It is still ONE form with ONE Save, which
 * calls only the endpoints whose answers actually changed — see `WorkPanel` on
 * why two buttons was the wrong reading of that. It is also the reason
 * `/settings/hours` is now a redirect rather than a *Soon* row: the week had
 * been editable exactly once, inside a flow that redirects anybody who has
 * finished it.
 *
 * **Social links arrived as V35** and is the seventh, completing the strip.
 * The migration came first here too, as this note used to say it would have to:
 * `instagram_url` and `youtube_url` are two named columns rather than one
 * `social_links` list, because a column should be as specific as its question —
 * a generic list could not be validated per platform, and rendering it would
 * need a platform catalogue to draw an icon by. A third platform is a
 * migration, and that is the honest price. Backend and web only, like V30, V32,
 * V33 and V34.
 *
 * Both values are CANONICALISED on write, which puts that tab with the intro
 * video and NOT with V34's map link one tab to its left. The seam is worth
 * remembering when the next link-shaped field turns up: a profile reduces to a
 * handle and a video reduces to an id — both are the whole fact — while a place
 * reduces to nothing, so `map_link` is stored exactly as pasted.
 *
 * **Nothing unbuilt goes in this list.** The settings index can afford a row
 * tagged *Soon*, because a list of what settings exist is useful even where one
 * is not ready. A tab strip is navigation: a tab that opens nothing is a
 * destination that lies, and the trainer pays a page load to find out.
 */

export type ProfileTab =
  | 'identity'
  | 'certifications'
  | 'experience'
  | 'specialities'
  | 'languages'
  | 'work'
  | 'social';

/**
 * The order is the setup flow's, with identity first.
 *
 * Not alphabetical and not by how much work each tab is: a trainer who has just
 * been through setup has already answered these in roughly this sequence, so
 * the strip reads as the flow they remember rather than a fresh taxonomy to
 * learn. `Specialities` keeps the spelling the column, the catalogue and the
 * phone all use — `specialisations` in the strip and `specialities` in the URL
 * would be one answer with two names.
 */
export const PROFILE_TABS: { key: ProfileTab; label: string }[] = [
  { key: 'identity', label: 'Identity' },
  { key: 'certifications', label: 'Certifications' },
  { key: 'experience', label: 'Experience' },
  { key: 'specialities', label: 'Specialities' },
  { key: 'languages', label: 'Languages' },
  // Last, and still in flow order: the working week is setup's step 6 and the
  // work mode is asked on step 7, so everything on this tab comes after the
  // four above it in the sequence a trainer has just been through.
  { key: 'work', label: 'Work & hours' },
  // Last, and last on purpose rather than by arrival: the six before it are what
  // a trainer says about themselves, and this is where a client goes to check.
  // It is also the only section setup never asks for, so a trainer arriving from
  // that flow meets the six they recognise before the one they do not.
  { key: 'social', label: 'Social links' },
];

/** Identity is the profile's root, so `/settings/profile` is never a redirect. */
export function profileTabHref(tab: ProfileTab): string {
  return tab === 'identity' ? '/settings/profile' : `/settings/profile/${tab}`;
}
