import type React from 'react';

import { Calendar, Gear, Grid, Home, Team, User, Users, Wallet } from './Icons';

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
 * | Team | Settings and the account menu — it is a permissions surface, not a daily one |
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
  | 'profile' | 'settings' | 'team';

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
}

export const PRIMARY: Destination[] = [
  {
    key: 'today', icon: <Home />, label: 'Today', href: '/today', accel: 'T',
    purpose: 'What needs doing right now',
  },
  {
    key: 'clients', icon: <Users />, label: 'Clients', href: '/clients', accel: 'C',
    purpose: "Who they train, and each person's full picture",
  },
  {
    key: 'sched', icon: <Calendar />, label: 'Schedule', href: '/schedule', accel: 'S',
    purpose: 'When',
  },
  {
    key: 'prog', icon: <Grid />, label: 'Programs', href: '/programs', accel: 'P',
    purpose: 'What the clients do',
  },
  {
    key: 'biz', icon: <Wallet />, label: 'Business', href: '/business', accel: 'B',
    purpose: 'Money, packages, reports',
  },
];

/**
 * NOT DESTINATIONS. The account's own three, drawn in the rail's foot menu and
 * in the sheet's account group — never in the five.
 *
 * *Team* is here rather than in `PRIMARY` because of what it is: a permissions
 * surface. V26's law is that "a team widens reads; it never moves ownership", so
 * nothing on this screen changes a trainer's day — it changes who else can see
 * it. That is the same shelf *Settings* sits on, and it is read about as often.
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
  {
    key: 'team', icon: <Team size={17} />, label: 'Team', href: '/team', accel: '',
    purpose: 'Who coaches alongside you, and what they can see',
  },
];

/**
 * THE BOTTOM BAR'S THREE, and why it is three where the rail has five.
 *
 * The bar draws `Today · Clients · (+) · Schedule · More`. The + took the centre
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

export const BAR: Destination[] = PRIMARY.filter(
  (d) => !HIDDEN_FROM_BAR.includes(d.key),
);

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
 * own tabs (`Business`'s *Owed* badge, the client file's *Notes*), which is
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
  const behind = [counts.prog, counts.biz, counts.team].filter(
    (b): b is RailBadge => b !== undefined,
  );
  if (behind.length === 0) return undefined;
  return {
    text: '',
    tone: behind.some((b) => b.tone === 'alert') ? 'alert' : 'acc',
    label: behind.map((b) => b.label).join('. '),
  };
}
