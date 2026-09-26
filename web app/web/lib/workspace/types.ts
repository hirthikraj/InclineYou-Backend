/**
 * WORKSPACES — the tenant a trainer is currently working inside.
 *
 * ── WHY THIS EXISTS, AND WHY IT IS NOT "THE TEAM SCREEN" ─────────────────────
 *
 * A team is not a feature of a trainer's book; it is a DIFFERENT BOOK. The same
 * person can coach three ways at once:
 *
 *   solo — their own clients, their own money, nobody else reads it
 *   team — a roster shared with other coaches, under a team's name
 *   gym  — the floor they work on, whose book the gym owns a share of
 *
 * Those are three tenants, not three screens, and the thing a trainer does with
 * them is SWITCH. That is why the door moved: *Team* was a row on the account
 * menu, filed beside Settings as a permissions surface you read once a month.
 * It is not — it is the answer to "whose clients am I looking at", which is a
 * question every screen in the product is silently answering all the time. A
 * question that scopes the whole app belongs in the chrome that is on every
 * screen, not three clicks inside a menu about the account.
 *
 * ── WHAT IS AND IS NOT BUILT YET ─────────────────────────────────────────────
 *
 * The SWITCH is built. What each tenant contains is not: every workspace draws
 * the same five destinations and the same data, because the tenanted reads are
 * a backend change and this half cannot invent them. So the switcher changes
 * which book you are *in* and says so honestly; it does not yet change what the
 * book says. The screens inside a team workspace come next.
 *
 * That ordering is deliberate rather than lazy. The navigation model is the part
 * a trainer has to learn, it is the part a design review can judge, and it is
 * the part that decides what every tenanted screen has to look like afterwards.
 */

export type WorkspaceKind = 'solo' | 'team' | 'gym';

export interface Workspace {
  /** Stable across reloads — this is what the cookie stores. */
  id: string;
  kind: WorkspaceKind;
  /** The tenant's own name: the trainer, the team, or the gym. */
  name: string;
  /**
   * One line under the name, in the trigger and in every menu row.
   *
   * It says what KIND of book this is and the one fact that distinguishes it —
   * "3 coaches", "just you". Three rows reading *Iron Yard Coaching*, *Iron
   * Yard, Anna Nagar* and *Arun Prakash* with nothing under them is a list a
   * trainer has to decode; the second line is what makes it a list they can
   * read.
   */
  role: string;
}

/**
 * The solo workspace's id, and the floor of the whole model.
 *
 * Every trainer has one — it is their own account — so the list is never empty
 * and the fallback for an unknown cookie is never a guess. A trainer removed
 * from a team lands back here rather than nowhere.
 */
export const SOLO_ID = 'solo';

/**
 * Where the choice lives — and it is TWO cookies, for two different questions.
 *
 * Both are cookies rather than `localStorage`, because the server has to know:
 * the layout renders the switcher's state, and a workspace read on the client
 * after paint would flash the wrong book's name on every navigation. Neither is
 * `httpOnly` — nothing here is a credential — and both are written through a
 * server action so the write and the re-render land in the same response.
 *
 * ── WHY THE ACTIVE ONE IS A SESSION COOKIE ───────────────────────────────────
 *
 * It has no `maxAge`, deliberately, and that is what makes the default a real
 * control rather than a decoration.
 *
 * There is only one *open the app* moment, and only one setting can own it. The
 * first version of this had a single year-long cookie holding the last book
 * opened, which answered "open where I left off" — and once a trainer can NAME
 * the book the app should open in, the two settings are in direct competition.
 * Whichever loses does nothing: a default that yields to last-used is a control
 * that only ever fires on a browser that has never been used, and a last-used
 * that yields to a default is a cookie written on every switch and read on none.
 *
 * So they are split by LIFETIME rather than ranked. The default owns the launch;
 * the active choice owns the sitting and expires with the browser. A trainer who
 * spends Tuesday afternoon in the team's book still opens Wednesday in their own
 * — which is what "make this my default" has to mean for the sentence to be
 * true.
 */
export const WORKSPACE_COOKIE = 'inclineyou_workspace';

/**
 * The book the app opens in. A year, because it is a preference a trainer sets
 * by hand and then expects to hold.
 *
 * ── EXACTLY ONE WORKSPACE IS DEFAULT, ALWAYS ─────────────────────────────────
 *
 * There is no *no default* state and the control must never offer one: with
 * nothing stored the answer is the first row, which is the solo book — every
 * trainer has one, so the floor is real rather than a fallback. That is why the
 * control is a set of exclusive per-row toggles and not one switch: a switch is
 * binary about one thing, and this is one-of-N. Turning the default OFF is not
 * an act a trainer can perform, so nothing on screen may look like it.
 */
export const WORKSPACE_DEFAULT_COOKIE = 'inclineyou_workspace_default';

export const WORKSPACE_MAX_AGE = 365 * 24 * 60 * 60;
