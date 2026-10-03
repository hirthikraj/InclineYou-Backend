import type React from 'react';

import {
  Calendar, Chart, Dots6, Dumbbell, Gear, Grid, Home, Ruler,
  Rupee, Stack, User, Users, Wallet,
} from './Icons';

/**
 * THE FIVE DESTINATIONS, WRITTEN DOWN ONCE.
 *
 * ── WHAT CHANGED, AND WHY IT IS A DELETION RATHER THAN A RESHUFFLE ───────────
 *
 * This file used to carry ELEVEN destinations in three groups — PRIMARY, BUILD,
 * GROW — and the groups were the tell. A navigation column that needs headings
 * is a column that has stopped being a list of places and started being a
 * taxonomy of them; `BUILD` and `GROW` were labels for "the six you do not open
 * daily", which is a fact about frequency and not a fact about the product.
 *
 * Six of the eleven were not destinations at all. They were **tabs that had
 * escaped**:
 *
 * | Was a rail row | Is now |
 * | --- | --- |
 * | Exercises | a tab inside **Programs** — only ever opened while building one |
 * | Packages | a tab inside **Business**, plus *Assign a package* on the client |
 * | Sessions | not a destination. A FLOW, launched from Today or Schedule; the history lives on the client's timeline |
 * | Reports | a tab inside **Business** |
 * | Nudges | buttons where the nudge is sent; the template library in Settings |
 * | Team | the top bar's workspace switcher — a team is a different TENANT, not a screen |
 * | Money | renamed **Business** and widened to hold packages and reports |
 *
 * Nothing is lost and nothing moved further away: every one of those six is now
 * one level closer to the screen that actually wants it. *Exercises* was three
 * clicks from the template you were editing and is now a tab above it; *Packages*
 * was a rail row you had to leave the client to reach and is now a button on
 * their file.
 *
 * ── THE FIVE, AND WHAT EACH ONE IS FOR ───────────────────────────────────────
 *
 * Today — what needs doing right now.
 * Clients — who they train, and each person's full picture.
 * Schedule — when.
 * Programs — what the clients do.
 * Business — money, packages, reports.
 *
 * They are five questions, not five features, and that is the test a sixth row
 * has to pass before it is added here.
 *
 * ── THE ORDER IS THE PRODUCT OWNER'S AND IT IS NOT THE OLD ONE ───────────────
 *
 * This file previously drew *Today · Schedule · Clients · Money*, and argued for
 * it: "`/today` and `/schedule` are the two a trainer at a desk opens in
 * sequence — read the day, then plan the week." The new order puts **Clients
 * second**, ahead of Schedule, and the reason is the restructure rather than a
 * change of mind about the desk. *Clients* absorbed the session history and the
 * package assignment in this pass, so it is no longer only the roster — it is
 * the one destination that answers a question about a PERSON, and the other four
 * answer questions about a DAY, a WEEK, a PLAN and a BOOK. Second is where the
 * one that is different belongs.
 *
 * The phone's tab bar draws *Home · Clients · Diary · Money*, so the two halves
 * now agree on the first two slots, which they did not before.
 *
 * ── AND THE ACCELERATORS ARE LABELS ──────────────────────────────────────────
 *
 * `G` then a letter is drawn in the rail and is not wired to a handler anywhere
 * — grep for `accel` and the only readers are `Rail.tsx`'s `<kbd>` and the
 * palette's. They are kept because they document the intended map and because
 * the palette prints the same letters; T·C·S·P·B is now a clean mnemonic set,
 * where the old one had *H* for a screen called Today. The bar does not draw
 * them at all: a phone has no keyboard to hold them.
 */

/**
 * Five primary keys, plus two that no primary row claims.
 *
 * `settings` and `team` exist so `currentFor` can name where the trainer is
 * without lighting a tab that does not lead there — a bar with *Business*
 * highlighted on the Team screen is a lie about where you are. Everything that is
 * not in `BAR` lights *More* instead, which is the honest answer on a phone.
 */
export type RailKey =
  | 'today' | 'clients' | 'sched' | 'prog' | 'biz'
  | 'profile' | 'settings' | 'team'
  /* The CLIENT portal's four. Prefixed, and the prefix is not decoration: this
     union is what stops a surface naming a place the rail does not have, and a
     bare `progress` beside the trainer's `prog` is the pair somebody eventually
     types the wrong one of. See `CLIENT_PRIMARY`. */
  | 'me-home' | 'me-progress' | 'me-plan' | 'me-account';

export interface Destination {
  key: RailKey;
  icon: React.ReactNode;
  label: string;
  href: string;
  /** The `G`-prefixed accelerator. Hidden until hover or focus — see above. */
  accel: string;
  /** One line, in the rail's title attribute and the sheet. The question this
   *  destination answers, in the product owner's own words. */
  purpose: string;
  /**
   * The screens INSIDE this destination, drawn in the pane beside the rail.
   *
   * Absent — not an empty array — on a destination that is one screen. The two
   * are different claims and `AppShell` reads the difference: `undefined` means
   * *this is a single screen and there is no pane*, where `[]` would mean *this
   * section has no pages yet*, which is a section nobody can open. `Today` and
   * `Schedule` are the first kind and are deliberately left without the field.
   *
   * The FIRST page is where the destination's own `href` points, so clicking the
   * rail row and clicking the top row of the pane it opens are the same
   * navigation rather than two answers to one press.
   */
  pages?: SectionPage[];
}

/**
 * A SUB-PAGE OF A DESTINATION, drawn in the pane beside the rail.
 *
 * ── WHY THIS IS A LIST AND NOT A TAB STRIP ───────────────────────────────────
 *
 * The five-destination pass folded six escaped rail rows into horizontal tab
 * strips, and `components/programs/tabs.tsx` — deleted in this pass — carried
 * the argument: nobody opens the exercise library except while building, so it
 * belongs one level under the thing being built rather than one level beside it.
 * That reasoning was about DEPTH and it still holds. What it got wrong was the
 * SURFACE.
 *
 * A strip of tabs above a page is read as *views of this page* — `Completed ·
 * Scheduled · Missed` on Workouts, `Pending` on Business, the client file's six.
 * Sub-pages are not views of one page; they are different pages that happen to
 * answer the same question. Spending the same control on both meant a trainer on
 * `/programs/exercises` saw one strip that mixed *which screen am I on* with
 * *which slice of it am I reading*, and the two strips could not be told apart
 * because they were the same strip.
 *
 * So the section's pages move into a column beside the rail, where a list of
 * places belongs, and the strip above the page goes back to being what it says:
 * views of the page under it. Nothing moved further away — every page here is
 * still one click from every other, which is what the fold-in bought.
 *
 * ── AND THE PANE IS DERIVED FROM THE ROUTE, NOT FROM A CLICK ─────────────────
 *
 * There is no *open* state anywhere in this file or in `SectionPane`. The pane
 * is drawn when the current route belongs to a destination that has `pages`, and
 * that is the whole rule — so a deep link, a back button and a click on the rail
 * all produce the same chrome, and there is no state to get out of step with the
 * URL. `Today` and `Schedule` have no `pages` and therefore never draw one: they
 * are single screens, and a pane holding one row that is the screen you are
 * already on is a column spent saying nothing.
 */
export interface SectionPage {
  key: string;
  icon: React.ReactNode;
  label: string;
  href: string;
  /** Drawn only when the trainer's profile has it — see `NavFlags.tsx`. */
  needs?: 'gym';
}

export const PRIMARY: Destination[] = [
  {
    key: 'today', icon: <Home />, label: 'Today', href: '/today', accel: 'T',
    purpose: 'What needs doing right now',
  },
  {
    key: 'clients', icon: <Users />, label: 'Clients', href: '/clients', accel: 'C',
    purpose: "Who they train, and each person's full picture",
    /* THE SECOND ROW ARRIVED, AND THE COLUMN DID NOT MOVE.
       This block used to argue for drawing a one-row pane: *the pages under
       Clients are not finalised, and a section that grows its second row later
       would otherwise grow a whole COLUMN at the same moment — the roster would
       shift 212px sideways on a release that was supposed to add a link.* That
       release is this one, and the cost of adding *Assessments* was one row.
       The argument is kept rather than deleted because it is the reason the
       rest of the chrome held still.

       ── AND IT IS A PAGE OF CLIENTS, NOT A DESTINATION OF ITS OWN ───────────

       The test the five-destination pass set is whether a row is a PLACE a
       trainer goes or a VIEW of somewhere they already are. A check-in is
       neither a screen about the whole practice nor a tab of the roster: it is
       a second list of the same people, asked a different question — *who owes
       me twenty minutes and a tape*. That is a page of this section, exactly as
       *Workouts* is a page of Fitness rather than a tab of Programs. Adding a
       sixth rail row for it would take the five back to six, which is the count
       that made the column a taxonomy the last time. */
    pages: [
      { key: 'roster', icon: <Users size={17} />, label: 'All clients', href: '/clients' },
      { key: 'assessments', icon: <Ruler size={17} />, label: 'Assessments', href: '/clients/assessments' },
    ],
  },
  {
    key: 'sched', icon: <Calendar />, label: 'Schedule', href: '/schedule', accel: 'S',
    purpose: 'When',
  },
  {
    /* *Workout plans* until 13 Sep 2026, and the rename is the section arriving
       rather than a change of wording. The row named one of the four screens
       under it, which was accurate while it led to a shelf of plans and became a
       lie the moment it also led to a workout history and a library of 1,324
       exercises. **Fitness** is the question all four answer, which is the test
       every other row in this list already passes: *Business* is not called
       *Invoices*, and *Clients* is not called *The roster*.
       The key stays `prog` and the routes stay under `/programs` — the label is
       what a trainer reads and the key is what four surfaces index on, and
       renaming both at once would be two migrations for one decision. */
    key: 'prog', icon: <Dumbbell />, label: 'Fitness', href: '/programs', accel: 'P',
    purpose: 'What the clients do — plans, workouts and the exercises under them',
    /* THE ORDER IS A RANKING AND NOT AN ALPHABET: *Programs* is what a trainer
       came for; *Workouts* is what came of it; *Exercise library* is the
       vocabulary underneath both. Reading down the column is reading from the
       thing you author to the words you author it in.

       ── *TEMPLATES* LEFT THIS COLUMN AND IS A TAB OF PROGRAMS ───────────────

       It was the third row. It is the second half of the strip above the shelf
       now — `lib/programs/tabs.ts`, which carries the argument: the two answer
       one question of two shelves, which is the definition of a view rather
       than of a place. The route is untouched (`/programs/certified`), so a
       bookmark, `FirstRun`'s *See all N templates* and every deep link still
       land; what is gone is the permanent slot it held in the section's
       navigation, which it was holding against two screens a trainer opens
       daily to answer a question they ask when a shelf is empty.

       `activePageKey` needs nothing for this: `/programs/certified` starts with
       `/programs/`, so it lights *Programs* — which is now the true answer. */
    pages: [
      { key: 'programs', icon: <Grid size={17} />, label: 'Programs', href: '/programs' },
      { key: 'workouts', icon: <Dumbbell size={17} />, label: 'Workouts', href: '/programs/workouts' },
      { key: 'exercises', icon: <Dots6 size={17} />, label: 'Exercise library', href: '/programs/exercises' },
    ],
  },
  {
    key: 'biz', icon: <Wallet />, label: 'Business', href: '/business', accel: 'B',
    purpose: 'Money, packages, reports',
    /* SIX ROWS, AND IT WAS SEVEN TABS.
       This block held one row and argued for it: *"the book's seven existing
       tabs are VIEWS of one screen and stay a strip above it; which of them
       eventually earn a page of their own is not settled."* It is settled now,
       and the answer is six — not seven, because two of the seven were never
       pages at all.

       ── WHAT BECAME A ROW, AND WHAT BECAME A FILTER ────────────────────────

       *Pending* and *Write-offs* are gone from this navigation, and nothing was
       deleted to do it: both were already spelled as chips on the ledger card
       — `LedgerFilter` had `collected | owed | gymshare` before this pass — so
       the product was drawing the same slice of the same rows in two controls
       at two altitudes, and a trainer who pressed the *Pending* chip and a
       trainer who opened the *Pending* tab saw two different screens of the
       same fact. They are one control now, on Transactions, beside the rows
       they narrow.

       That is the test this column applies and the strip never did: a row here
       has to be a PLACE, and a slice of the rows on a place is a view of it.
       *Gym share* was kept as a page on the argument that the floor's split is
       a different reading of the money, and it has since gone the same way: the
       *Gym share* chip narrows the rows and the *Yours* tile states the cut and
       the floor/online split, which was everything the page added.

       ── AND *OVERVIEW* IS NEW, WHICH IS WHY THE FOLD-IN PAID ───────────────

       The section opened on a ledger table, which answers *what came in* and
       nothing else — a trainer wanting to know who to chase, whose pack runs
       out this week or where the income actually comes from had to know which
       of seven tabs to try. Overview is those questions, and it holds no rows
       of its own: every list on it is a summary that links into the page that
       owns the detail. See `components/business/Overview.tsx`.

       The order is a ranking. *Overview* and *Transactions* are read at the end
       of a shift; *Packages* is third rather than last because adding a client
       asks which pack applies, so the price list is read far more often than a
       price list is edited; the last three are read monthly, quarterly and
       yearly in that order. */
    pages: [
      { key: 'overview', icon: <Grid size={17} />, label: 'Overview', href: '/business' },
      { key: 'transactions', icon: <Rupee size={17} />, label: 'Transactions', href: '/business/transactions' },
      { key: 'packages', icon: <Stack size={17} />, label: 'Packages', href: '/business/packages' },
      /* Only for a trainer with a gym: the split on the gym's money and what the gym
         owes them. `NavFlags.tsx` hides the row; the route stays reachable. */
      { key: 'gym', icon: <Wallet size={17} />, label: 'Gym share', href: '/business/gym', needs: 'gym' },
      { key: 'reports', icon: <Chart size={17} />, label: 'Reports', href: '/business/reports' },
    ],
  },
];

/**
 * NOT DESTINATIONS. The account's own two, drawn in the rail's foot menu and in
 * the sheet's account group — never in the five.
 *
 * ── IT WAS THREE, AND *TEAM* DID NOT LEAVE THE PRODUCT ───────────────────────
 *
 * This list carried *Team* on the argument that it is a permissions surface —
 * V26's "a team widens reads; it never moves ownership", so nothing on that
 * screen changes a trainer's day and it sits on the shelf a trainer reads once a
 * month, beside Settings.
 *
 * The premise held and the conclusion did not. A team is not a setting: it is a
 * DIFFERENT TENANT, with its own clients, its own money book and its own roster,
 * and a trainer can work in three of them — their own, a team's, a gym's. Which
 * one is open is the scope of every figure on every screen, so it belongs in the
 * chrome that is on every screen. It is the top bar's workspace switcher now
 * (`components/shell/WorkspaceMenu.tsx`), and `/team` is reached from that
 * menu's foot rather than from here.
 *
 * The row leaving THIS list is what takes it off both surfaces at once — the
 * rail's foot menu and the phone's sheet — which is the reason the list is here
 * rather than written out twice.
 *
 * *Your profile* leads, which is §2b's own order. It was withheld while
 * `/settings/profile` did not exist — a row that 404s is worse than a row that is
 * missing — and arrived with the screen. It is not a duplicate of Settings: the
 * four things a CLIENT reads about a trainer are not "the things every screen
 * reads", and Settings' `purpose` line used to promise "your profile" while
 * leading nowhere near one.
 *
 * That distinction is now the whole shape of both screens rather than a
 * difference in wording: `/settings/profile` is seven tabs of what a client
 * reads, and `/settings` is a strip of what only the trainer reads — their
 * login, their email, and the way out. Neither links to the other, because the
 * two rows here are how you get to each.
 */
export const ACCOUNT: Destination[] = [
  {
    key: 'profile', icon: <User size={17} />, label: 'Your profile', href: '/settings/profile',
    accel: '',
    purpose: 'Your name, headline, bio and intro video — what a client sees',
  },
  {
    key: 'settings', icon: <Gear size={17} />, label: 'Settings', href: '/settings', accel: '',
    // No longer "your profile, hours, …" — that promise now has its own row, and
    // leaving it here would have two rows claiming the same thing. Nor "your
    // working week": that went into the profile's *Work & hours* tab, and
    // `/settings` stopped being an index of other screens when it became a tab
    // strip of its own — Account first, then the nudge wording. See
    // `lib/settings/tabs.ts`.
    purpose: 'Your number, your email, and the wording InclineYou sends',
  },
];

/**
 * THE CLIENT PORTAL'S FOUR, and the whole point is that there are four.
 *
 * ── THE SPEC'S OWN HEADING IS "FOUR TABS, NO MORE" ───────────────────────────
 *
 * `InclineYou-Client-Portal-Spec.md` §"Navigation": *"The client app should be
 * simpler than the trainer app, not equivalent. Every feature you add reduces
 * the odds they use the core one."* And the design set's own portal frame says
 * the same thing from the other side — *"A client's web app could show
 * everything the trainer sees. It shows four things."*
 *
 * So the test a fifth row has to pass is not "is this useful" but "is this one
 * of the four questions a client opens the app to answer". It is not the same
 * test as the trainer's five, and it is stricter.
 *
 * ── WHERE THESE DIFFER FROM THE DRAWN FRAME, AND WHY ─────────────────────────
 *
 * `webapp-client-portal.html` draws *Today · My progress · Sessions ·
 * Payments*. The product spec, which is newer, asks for *Home · Progress ·
 * Plan · Me*, and it is followed:
 *
 * | the frame | here | because |
 * | --- | --- | --- |
 * | Today | **Home** | the route is still `/me/today`, so the trainer half's `destinationFor` and `app/page.tsx` are untouched. The LABEL is the client's word |
 * | My progress | **Progress** | *my* is redundant on a screen that only ever draws one person's |
 * | Sessions | **Plan** | the frame's Sessions is a history; §4 asks for what is COMING, which is a different question and the anxious one |
 * | Payments | folded into **Me** | §5 lists *My package* as one of five rows on that screen. A whole destination for a balance a client checks monthly is the fifth row the spec's own test refuses |
 *
 * Nothing is lost: the session history is on Progress, where it is evidence,
 * and the pack is on Me, where §5 puts it.
 *
 * ── AND THERE IS NO `+` AND NO *MORE* ────────────────────────────────────────
 *
 * The trainer's bar has a raised centre + because a trainer CREATES things —
 * clients, sessions, exercises, payments. A client creates exactly one thing,
 * a workout, and it is started from the one button on Home that the whole
 * screen is arranged around. A second door to it in the tab bar would be a
 * control competing with the hero. `NavBar.tsx` on the phone already reached
 * this conclusion — it draws no + for the client role at all.
 *
 * Four destinations fit a 320px bar with no *More*, which is what makes the
 * "four, no more" rule pay for itself twice.
 */
export const CLIENT_PRIMARY: Destination[] = [
  {
    key: 'me-home', icon: <Home />, label: 'Home', href: '/me/today', accel: '',
    purpose: 'What do I do today',
  },
  {
    key: 'me-progress', icon: <Chart />, label: 'Progress', href: '/me/progress', accel: '',
    purpose: 'Am I actually getting anywhere',
  },
  {
    key: 'me-plan', icon: <Calendar />, label: 'Plan', href: '/me/plan', accel: '',
    purpose: "What's coming up",
  },
  {
    key: 'me-account', icon: <User size={17} />, label: 'Me', href: '/me/account', accel: '',
    purpose: 'My trainer, my package, my settings',
  },
];

/**
 * The client's account shelf, and it is EMPTY.
 *
 * `ACCOUNT` splits *Your profile* from *Settings* because a trainer has an
 * outward-facing identity — seven tabs of what a client reads about them — and
 * a separate pile of machinery. A client has neither: §5's *Me* is one screen
 * holding their trainer, their package, their details and their data rights,
 * and it is already a destination in `CLIENT_PRIMARY` — the fourth row of the
 * rail this menu hangs off, and the fourth tab of the bar on a phone.
 *
 * It carried a *My details* row for one pass, on the argument that the
 * duplication bought something: "the foot is where *sign out* lives, and a menu
 * whose only item is *Sign out* gives a keyboard user nothing to arrow
 * between." **That was paying for an arrow key with a second door.** The row
 * sat three inches under a rail entry going to the identical route, with a
 * different label for the same place — which is worse than a short menu, because
 * a client who reads *Me* and *My details* has to decide whether they differ.
 *
 * So the shelf is empty and the menu is what only it can be: whose account this
 * is, the theme, and the way out. One `menuitem` is a short menu, not a broken
 * one — the panel still takes Escape, still takes the arrow keys, and Enter on
 * the row it lands on opens the confirm rather than signing anybody out.
 *
 * Kept as an exported empty array rather than deleted so the client's shelf is
 * still declared in this file: `PortalShell` passes it explicitly, and an
 * omitted prop would fall back to `ACCOUNT` and put the trainer's two rows on a
 * client's menu.
 *
 * The accelerators are empty strings throughout this file's client half. The
 * trainer's `G`-letters are drawn as hints for keys nothing binds; repeating
 * that on a surface built for a phone would be printing a promise about a
 * keyboard most of these people do not have.
 */
export const CLIENT_ACCOUNT: Destination[] = [];

/**
 * THE BOTTOM BAR'S THREE, and why it is three where the rail has five.
 *
 * The bar draws `Today · Schedule · (+) · Clients · More` — see `BAR_ORDER`
 * below for why that is not `PRIMARY`'s order. The + took the centre
 * slot, and a raised action between two pairs of tabs only reads as centred if
 * the pairs are equal — five labelled slots around it is six targets on a 390px
 * screen and the + no longer looks like the middle of anything.
 *
 * So two destinations had to come off, and **Programs and Business are the two
 * that could**: *Today* is the screen, *Schedule* is the other half of the day,
 * and *Clients* is the roster every row on both of them points into. Programs is
 * authored at a desk in a sitting — the tab strip it now carries is a builder's
 * strip, and nobody builds a twelve-week block with a thumb. The money book is
 * read at the end of a shift, which is a visit rather than a glance.
 *
 * **The cost is real and it is paid in `moreBadge`.** Business carries the only
 * `alert`-toned count in the shell — clients who owe — and a hidden alert is the
 * one thing a queue-shaped product cannot afford. It is why `moreBadge` sums the
 * counts behind *More* into a single dot: the number is gone from the bar, the
 * fact that there IS one is not.
 *
 * Derived from `PRIMARY` rather than retyped, so a destination cannot be in one
 * list and missing from the other — which is the whole reason these lists live in
 * this file. `HIDDEN_FROM_BAR` names what is dropped, in one place, and the sheet
 * reads the same constant to know what it has to hold.
 */
export const HIDDEN_FROM_BAR: RailKey[] = ['prog', 'biz'];

/**
 * AND THE BAR'S ORDER IS NOT THE RAIL'S, WHICH REVERSES A LINE ABOVE.
 *
 * `PRIMARY` puts *Clients* second and argues for it — "it is the one destination
 * that answers a question about a PERSON, and the other four answer questions
 * about a DAY, a WEEK, a PLAN and a BOOK. Second is where the one that is
 * different belongs." That is an argument about a COLUMN of five labelled rows a
 * trainer reads top to bottom at a desk.
 *
 * The bar is three slots around a raised +, and the product owner asked for
 * *Today · Schedule · (+) · Clients · More*. The two orders can differ because
 * the surfaces differ in the one way that matters: the rail is read, and the bar
 * is aimed at. *Today* and *Schedule* are the two halves of the same question —
 * what is happening now, and what is happening next — so they belong on the same
 * side of the +, and the pair a thumb travels between most is the pair that
 * should not have an action between them.
 *
 * `Clients` therefore takes the slot to the right of the +, which is where
 * `SPLIT` puts the second group, and it loses nothing: it is still one tap, and
 * it is the destination every row on the two screens to its left points into.
 *
 * Written as a list of KEYS rather than a re-typed list of destinations, so the
 * bar still cannot name a place the rail does not: `BAR` is built by looking each
 * key up in `PRIMARY`, and a key that is not there — or one that is in
 * `HIDDEN_FROM_BAR` — is a type error or a missing row rather than a second,
 * quietly diverging copy of the five.
 */
const BAR_ORDER: RailKey[] = ['today', 'sched', 'clients'];

export const BAR: Destination[] = BAR_ORDER.map((key) => {
  const dest = PRIMARY.find((d) => d.key === key);
  /* Not a silent `.filter(Boolean)`: a key in this list that is no longer in
     `PRIMARY` means somebody deleted a destination and the bar is now drawing
     two tabs around a centre +, which is the asymmetry the whole five-slot
     argument exists to avoid. Better to fail where the list is written. */
  if (!dest) throw new Error(`BAR_ORDER names ${key}, which is not in PRIMARY`);
  if (HIDDEN_FROM_BAR.includes(key)) {
    throw new Error(`BAR_ORDER names ${key}, which HIDDEN_FROM_BAR drops`);
  }
  return dest;
});

/** A count beside a destination. Three tones, three meanings. */
export interface RailBadge {
  text: string;
  tone?: 'alert' | 'acc';
  /** What a screen reader says instead of a bare number. Required, not optional. */
  label: string;
}

/**
 * Counts, one per destination that can carry one.
 *
 * Four of the old eleven counted things that are no longer rows — the exercise
 * library's 1,324, the nudge queue, the sessions list — and those counts did not
 * survive the fold-in as smaller numbers on a parent row. A tab strip counts its
 * own tabs (`Business`'s *Pending* badge, the client file's *Notes*), which is
 * where a count belongs: next to the thing it is counting.
 */
export interface RailCounts {
  today?: RailBadge;
  clients?: RailBadge;
  sched?: RailBadge;
  prog?: RailBadge;
  biz?: RailBadge;
  team?: RailBadge;
}

/**
 * The badge *More* carries on the bar.
 *
 * The rail can show a count on every row because it draws every row. The bar
 * draws three destinations, the + and *More*, so every count belonging to
 * something behind that slot has nowhere to sit — and a hidden alert is the one
 * thing a queue-shaped product cannot afford. They are summed into one dot, which
 * is a "there is something in here" mark rather than a figure: adding unrelated
 * counts together would produce a number that means nothing.
 *
 * `biz` is the one that matters — it is the only count in the shell that is ever
 * `alert`, so in practice this dot is red exactly when somebody owes the trainer
 * money, which is the one fact the demotion could have cost.
 *
 * `alert` wins over `acc` because the tones are ranked, not mixed — the same rule
 * `AttentionItem.severity` follows in the queue.
 */
export function moreBadge(counts: RailCounts): RailBadge | undefined {
  /* `team` is deliberately NOT in this sum any more. It was here while *Team*
     was a row in the sheet behind *More*; it is the top bar's workspace switcher
     now, which is drawn at every width — so a team count summed into this dot
     would be marking a slot the thing it counts no longer lives behind.
     `RailCounts.team` is kept as a field because the switcher is where a team
     count would eventually be drawn, and nothing sets it today. */
  const behind = [counts.prog, counts.biz].filter(
    (b): b is RailBadge => b !== undefined,
  );
  if (behind.length === 0) return undefined;
  return {
    text: '',
    tone: behind.some((b) => b.tone === 'alert') ? 'alert' : 'acc',
    label: behind.map((b) => b.label).join('. '),
  };
}

/**
 * WHICH PAGE OF A SECTION A PATHNAME IS ON — the longest match, not the first.
 *
 * Every href in a section shares a prefix with the section's first one, because
 * the first one is the section's own route: `/programs/exercises` starts with
 * `/programs`, and a first-match scan would light *Programs* on every screen in
 * Fitness. So the longest matching href wins, which is the same rule
 * `currentFor` follows when it tests `/settings/profile` before `/settings` —
 * written as a comparison here rather than as an order, because a list of four
 * that has to stay sorted by length is a list somebody re-orders for a reason
 * that has nothing to do with matching.
 *
 * The match is on a SEGMENT boundary, so `/programsomething` is not inside
 * `/programs`, and a deeper route falls back to its parent page: the builder at
 * `/programs/:id` lights *Programs*, and so does `/programs/certified` now that
 * the catalogue is a TAB of the shelf rather than a row of its own — which is
 * where the trainer came from in both cases.
 *
 * `undefined` where nothing matches — a section whose pane is drawn on a route
 * none of its rows owns lights none of them, which is the honest answer.
 */
export function activePageKey(
  pages: SectionPage[],
  pathname: string,
): string | undefined {
  let best: SectionPage | undefined;
  for (const page of pages) {
    const inside = pathname === page.href || pathname.startsWith(`${page.href}/`);
    if (inside && (!best || page.href.length > best.href.length)) best = page;
  }
  return best?.key;
}

/**
 * The destination a pathname is inside, if that destination has pages.
 *
 * `AppShell` could do this with a `.find` on `current`, and did for one draft.
 * It lives here because `TabBar`'s sheet has the same question to answer at
 * phone width — the rail and its pane are both `display:none` under 900px, so
 * the sheet behind *More* is the only surface a section's pages can be reached
 * from, and two surfaces reading two copies of "which destination has pages" is
 * the drift `nav.tsx` exists to prevent.
 */
export function sectionFor(
  current: RailKey,
  destinations: Destination[] = PRIMARY,
): Destination | undefined {
  const dest = destinations.find((d) => d.key === current);
  return dest?.pages && dest.pages.length > 0 ? dest : undefined;
}
