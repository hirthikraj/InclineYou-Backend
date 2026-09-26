import { DAY_MS, startOfDay } from '@/lib/today/time';
import type { ProgressRange } from '@/lib/log/log';

/**
 * §3's range — how far back Progress is looking.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS ITS OWN MODULE AND NOT PART OF `progress.ts`
 *
 * `lib/portal/progress.ts` opens with `import 'server-only'`, and the range's
 * labels are read by the CHIPS, which are a client component. So the first
 * version put them there and the whole screen rendered blank:
 *
 *     ./lib/portal/progress.ts
 *     Error: You're importing a module that depends on server-only
 *
 * Found by rendering, and worth the note because the failure is the one this
 * codebase is most careful about: a **blank screen**, with a green `tsc`, a
 * green `eslint` and a green build — the same class as the `/settings` subtree
 * that "rendered blank for a week" over `.body` having no grid area. Only
 * opening the page catches it.
 *
 * The fix is not a `'use client'` shim, it is the right home: a range is a
 * VOCABULARY, and a vocabulary both sides of the boundary read belongs in a
 * module that is neither. Nothing here reads a request, a cookie, a database or
 * the clock — `now` is passed in, the way `lib/today/time.ts` and
 * `lib/log/log.ts` are both written.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * AND THE THREE KEYS ARE THE TRAINER'S, IMPORTED RATHER THAN RESTATED
 *
 * `ProgressRange` is `lib/log/log.ts`'s — `'8w' | '6m' | 'all'`.
 * `/clients/:id/progress` is the trainer looking at the same client's progress
 * with the same three chips, and two halves offering different windows onto one
 * client's lifts is the failure `lib/setup/options.ts` opens by describing: one
 * answer set, two spellings, and no way to compare the two screens.
 *
 * A type import erases at runtime and couples nothing, which is the line
 * `lib/portal/api.ts` draws for the FETCHERS — *"the two must not share a
 * fetcher"* — and deliberately does not draw for a shared word.
 */

/** Days in each range. `null` is *since you started*, which has no length. */
export const RANGE_DAYS: Record<ProgressRange, number | null> = {
  '8w': 56,
  '6m': 183,
  all: null,
};

/** What a range is called on the chip. */
export const RANGE_LABEL: Record<ProgressRange, string> = {
  '8w': '8 weeks',
  '6m': '6 months',
  all: 'Since you started',
};

/**
 * The range as a NOUN — *the last 8 weeks*, *since you started*.
 *
 * Right after a preposition the caller supplies (*"Nothing weighed **in** the
 * last 8 weeks"*) and wrong after one it does not, which is the trap below.
 */
export const RANGE_PROSE: Record<ProgressRange, string> = {
  '8w': 'the last 8 weeks',
  '6m': 'the last 6 months',
  all: 'since you started',
};

/**
 * The range as a PHRASE, preposition included — for a sentence that needs one.
 *
 * ── A MEASURED COPY BUG, AND IT WAS LIVE BEFORE THIS PASS ───────────────────
 *
 * Every caption on this screen was written as `in {RANGE_PROSE[range]}`, which
 * reads correctly on two of the three values and produces
 *
 *     "Your biggest gain in since you started."
 *     "21 workouts in since you started."
 *     "This is your average over since you started."
 *
 * on the third — **which is the DEFAULT**, so the broken form is the one almost
 * every client sees and the two correct ones are the exceptions. It survived
 * because `all`'s prose is the only value of the three that already carries its
 * own preposition, and nothing that reads a `Record` can notice that.
 *
 * So the preposition belongs to the phrase rather than to the sentence, and a
 * caller writes `{RANGE_IN[range]}` with none of its own.
 */
export const RANGE_IN: Record<ProgressRange, string> = {
  '8w': 'in the last 8 weeks',
  '6m': 'in the last 6 months',
  all: 'since you started',
};

/** The same again after *over* — *over the last 8 weeks*, *since you started*. */
export const RANGE_OVER: Record<ProgressRange, string> = {
  '8w': 'over the last 8 weeks',
  '6m': 'over the last 6 months',
  all: 'since you started',
};

/**
 * `all`, and it is `buildStrength` that decides it.
 *
 * `AGENTS.md` states the rule twice: *"a personal best is a claim about the
 * whole history, so a window is what produced the wrong answer"*, and §3's
 * headline is *Squat 40kg → 62.5kg*, which "is a statement about a beginning,
 * and the beginning is older than any window a screen would pick." A narrower
 * range makes that a DIFFERENT claim — *what has moved in eight weeks* — which
 * is a fair question and the one this control is for. What would be wrong is
 * that being what the screen opens on.
 */
export const DEFAULT_RANGE: ProgressRange = 'all';

/** `?range=6m` → a `ProgressRange`, or the default for anything else. */
export function readRange(raw: string | undefined): ProgressRange {
  return raw === '8w' || raw === '6m' || raw === 'all' ? raw : DEFAULT_RANGE;
}

/**
 * The instant a range starts at, or `null` for *since you started*.
 *
 * ── IT NEVER REACHES BACK PAST THE FIRST DAY ────────────────────────────────
 *
 * Clamped to `startedAt`, so *8 weeks* on a client who started three weeks ago
 * is three weeks and not eight. Without the clamp the denominators lie in the
 * one direction that matters: `buildConsistency` would divide attendance by
 * eight weeks of which five did not exist, and print a client's first fortnight
 * as a third of the sessions a week they are actually doing.
 */
export function rangeFrom(
  range: ProgressRange,
  startedAt: number,
  now: number,
): number | null {
  const days = RANGE_DAYS[range];
  if (days === null) return null;
  return Math.max(startOfDay(now) - days * DAY_MS, startOfDay(startedAt));
}

/**
 * Which ranges are worth offering, given how long this client has been going.
 *
 * A chip for *6 months* on somebody eight weeks in is a control that redraws
 * the screen identically to *Since you started* — the dead control this
 * codebase keeps deleting, wearing a filter's clothes. So a bounded range is
 * offered only once the client has been training longer than it, and `all` is
 * always there because it is the default and the only one that always means
 * something.
 *
 * This is `lengthChoices`' rule on the session panel, for its reason: the set
 * of options is a fact about the data and not a constant.
 */
export function rangeChoices(startedAt: number, now: number): ProgressRange[] {
  const weeksIn = (now - startedAt) / (7 * DAY_MS);
  const out: ProgressRange[] = [];
  if (weeksIn > 9) out.push('8w');
  if (weeksIn > 27) out.push('6m');
  out.push('all');
  return out;
}
