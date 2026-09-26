import 'server-only';

import { daysBetween, monthName, rupees } from '@/lib/today/time';

import type { MeWire, PortalPackageWire } from './api';

/**
 * §5's derived figures — the header's one line, the arrangement, and the pack.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THERE IS A FILE FOR THIS
 *
 * `buildPlan` sets the pattern one screen over and its reason is the defect it
 * was written after: *"deriving it a second time in this file is how a header
 * and a card end up disagreeing about which week it is."* The account screen is
 * now three routes under one layout, so the header is derived in a place none of
 * the three panels can see — which is exactly the shape that produces two
 * answers to one question.
 */

/**
 * `.ph__sub` — and this REPLACES a description of the screen.
 *
 * It read `Training with ${me.trainer.name}`, directly above a card whose first
 * line is that trainer's name. `PageHeader`'s own docstring forbids it in as
 * many words:
 *
 *   > `sub` is the screen's state in one line — "22 active · 3 owe you ₹31,000".
 *   > It is **not** a description of the screen.
 *
 * ── WHAT IT SAYS INSTEAD, AND WHAT IT DELIBERATELY DOES NOT ─────────────────
 *
 * Two facts, and each had to survive a duplication test against all three tabs,
 * because the strip means this line frames every one of them:
 *
 *   · **how long this has been going.** §9 of the review asked for it and the
 *     page never stated it: the relationship is what this destination is about.
 *     `me.client.startedAt`, as a month and a year — not as weeks, because
 *     *"61 weeks with Arun"* is `/me/progress`' own `.ph__sub` and the two
 *     screens are one tap apart.
 *   · **whether anything is owing.** The one fact on this destination a client
 *     might need to act on, and the only figure that is true on all three tabs.
 *
 * **Sessions left is NOT here**, and that is the `.ph--today` rule holding: the
 * package card draws a `Meter` captioned *8 of 12 sessions left* about 130px
 * below this line, and a header repeating its own card is what that rule calls
 * "the most expensive 60px on the page". The card's head also gave up the
 * `₹ owing` tag it used to carry, for the same reason and in the same direction:
 * the duplicated string goes to the header once.
 */
export function buildAccountLead(
  me: MeWire,
  packages: PortalPackageWire[],
): string {
  const started = new Date(me.client.startedAt);
  const since = `Since ${monthName(me.client.startedAt).slice(0, 3)} ${started.getFullYear()}`;

  const live = packages.find((p) => p.status === 'active') ?? null;
  /* Three states and not two. "Nothing owing" is a claim about a pack, so a
     client with no pack running must not be told it — they would read it as a
     statement about the arrangement rather than about a package that has
     ended. */
  const money = !live
    ? 'no package running'
    : live.amountDue > 0
      ? `${rupees(live.amountDue)} owing`
      : 'nothing owing';

  return `${since} · ${money}`;
}

export interface ArrangementRow {
  k: string;
  v: string;
}

/**
 * §9's *Your arrangement* — four facts that were on the wire and on no screen.
 *
 * `goal`, `sessionsPerWeek`, `sessionDurationMinutes` and `deliveryMode` all
 * reach `MeWire` and were read by nothing. They are the terms of the coaching
 * agreement, and a client who cannot see them cannot check them.
 *
 * ── IT IS READ-ONLY, AND THAT IS THE INTERESTING PART ───────────────────────
 *
 * `MyDetails` may edit a phone number and a health note and may not edit these.
 * `mock/portal.ts` refuses them at the wire and says why — *"that is the
 * coaching arrangement, agreed between two people, and a screen letting one side
 * rewrite it silently would be a support ticket rather than a right"* — and
 * until now that refusal was invisible: the fields simply were not drawn, so a
 * client had no way to know whether they were missing or forbidden.
 *
 * Drawing them with one sentence saying whose they are answers *"why can't I
 * edit this?"* before it is asked, which is the whole reason this card is on the
 * screen rather than the four figures being useful in themselves.
 *
 * A row is omitted where the field is null rather than drawn as an em dash: an
 * arrangement with no stated session length is one the trainer has not written
 * down, and *Session length —* is the screen inventing a gap.
 */
export function buildArrangement(me: MeWire): ArrangementRow[] {
  const c = me.client;
  const rows: ArrangementRow[] = [];

  if (c.goal) rows.push({ k: 'What you are working on', v: c.goal });
  if (c.sessionsPerWeek !== null) {
    rows.push({
      k: 'Sessions a week',
      v: c.sessionsPerWeek === 1 ? '1' : String(c.sessionsPerWeek),
    });
  }
  if (c.sessionDurationMinutes !== null) {
    rows.push({ k: 'Session length', v: `${c.sessionDurationMinutes} minutes` });
  }
  if (c.deliveryMode) {
    /* The wire's own words are `floor` and `remote`, which are the TRAINER's
       vocabulary — `readMode` on the other half maps them for a desk. A client
       does not call a gym "the floor". */
    rows.push({
      k: 'Where',
      v:
        c.deliveryMode === 'remote'
          ? 'Online'
          : c.deliveryMode === 'floor'
            ? 'At the gym'
            : c.deliveryMode,
    });
  }

  return rows;
}

/**
 * How many days a live pack has left to run, or `null`.
 *
 * `null` where there is no end date, and where the date has passed — a pack
 * that expired last week is a state the trainer resolves, and *−6 days* is a
 * figure with no reading. `endDate` is a date string at midnight, so the count
 * is measured from the start of today: a pack ending tomorrow reads *1 day* all
 * day rather than flipping to *0* at some hour of the afternoon.
 */
export function daysLeftOn(pack: PortalPackageWire, now: number): number | null {
  if (!pack.endDate) return null;
  const end = new Date(`${pack.endDate}T00:00:00`).getTime();
  const days = daysBetween(now, end);
  return days > 0 ? days : null;
}
