/**
 * §4 · Plan, as three routes.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS REPLACED ONE LONG PAGE
 *
 * Plan was four blocks in one column, and the last of the four was **one card
 * per training day with every movement in it expanded** — three or four cards of
 * six or seven rows each, so a client who opened the screen to find out when
 * their next session was scrolled past ~25 exercise rows they had not asked for.
 * On the screen §4 calls *"a reference screen, not a working one."*
 *
 * `lib/portal/progress-tabs.ts` answered the identical shape one screen over and
 * its sentence is the whole argument:
 *
 *   **A jump list says "this is one long answer, here are its parts."**
 *   **Tabs say "these are three different questions."**
 *
 * And they are three. *When do I next see my trainer* is not *what is in Upper A*
 * is not *what was I doing in the spring*. A client arrives holding exactly one,
 * and the old page made them carry the other two past their eyes on the way.
 *
 * `registry.ts` records a `c-secnav` jump-nav added and removed the same day for
 * this reason, so the pattern is settled rather than chosen here.
 *
 * ── THREE, AND NOT FOUR ─────────────────────────────────────────────────────
 *
 * The portal's own discipline is *"four things"* and Progress took all four one
 * level down. Plan needs three, and the candidate for a fourth was answered by an
 * existing block rather than a new tab:
 *
 *   · **Your week** — the typical training week — belongs beside *Coming up*,
 *     because *what is booked* and *what my week normally looks like* are two
 *     readings of one question and a client compares them. Splitting them would
 *     put two seven-row lists on two tabs and make the comparison a navigation.
 *
 * ── AND THE THREE RULES COME WITH THE PATTERN ───────────────────────────────
 *
 *   1. **Every tab is a real route.** The back button works between them, a tab
 *      is linkable — a client can send their trainer *this is what I have on
 *      Thursday* — and each page loads only its own panel, which here is a real
 *      saving: only *Past plans* reads the program history, and only a day route
 *      reads that day's cues and steps.
 *   2. **The first tab is the bare route.** `/me/plan` IS the schedule, never a
 *      redirect to it — `CLIENT_PRIMARY` in `nav.tsx` points here and a redirect
 *      on the way would cost a round trip on every visit.
 *   3. **Nothing unbuilt goes in the list.** All three are built. *Past plans* is
 *      in the strip even for a client with no history, because a tab with an
 *      honest empty state is built and a tab that opens nothing is a destination
 *      that lies.
 *
 * ── THE FIRST TAB IS "SCHEDULE" AND NOT "THIS WEEK" ─────────────────────────
 *
 * It holds §4's *"next 2–4 weeks"* — a 28-day window, `PLAN_WINDOW_DAYS` — so a
 * tab named for one week would be wrong about the thing it is a tab for. It also
 * holds the typical week, which is not a fact about THIS week at all.
 */
export type PlanTab = 'schedule' | 'workouts' | 'history';

export const PLAN_TABS: { key: PlanTab; label: string }[] = [
  { key: 'schedule', label: 'Schedule' },
  { key: 'workouts', label: 'Workouts' },
  { key: 'history', label: 'Past plans' },
];

/** The href for a tab. Just the path — nothing on this screen is windowed. */
export function planTabHref(tab: PlanTab): string {
  return tab === 'schedule' ? '/me/plan' : `/me/plan/${tab}`;
}

/**
 * One training day's own screen, under the Workouts tab.
 *
 * ── WHY A ROUTE AND NOT AN EXPANDING ROW ────────────────────────────────────
 *
 * `exerciseHref`'s argument one file over, and it lands harder here because of
 * what a day holds. The old rows deliberately omitted **the trainer's cue** —
 * `.lrow__s` ellipsises, and a truncated instruction is worse than none — so the
 * one piece of content §"Make the trainer present" calls the differentiator was
 * not reachable from this screen at all. A cue is a sentence and sometimes two;
 * it needs a page, not a second line.
 *
 * Three things follow from making it a place rather than a disclosure:
 *
 *   · **it is linkable.** A client standing at a rack can have the day open on
 *     its own URL rather than scrolled to inside a longer one;
 *   · **the back button works**, where an expanded row leaves the browser's own
 *     control pointing at whatever came before this tab;
 *   · **the list stays short.** Four collapsed days that can each grow seven
 *     rows with a paragraph on each is the same long page one tap away.
 *
 * There is also no Accordion in this design system, and adding one to defer
 * content that wants a page would be building the weaker of the two answers.
 *
 * `PlanTabs` matches on `startsWith(planTabHref('workouts'))`, so the Workouts
 * tab stays lit on a day screen — which is correct: it is where you are, one
 * level in.
 *
 * The parameter is the **ordinal program day** (`program_exercise.day_of_week`,
 * which V24's law says is a slot and not a weekday), so it is a small integer
 * and needs no encoding. It is still validated against `program.trainingDays`
 * rather than trusted — `historyMonths`' rule for a hand-typed `?month=`.
 */
export function planDayHref(templateDay: number): string {
  return `/me/plan/workouts/${templateDay}`;
}

/**
 * One earlier plan.
 *
 * **No per-day route under here, deliberately.** A day gets its own screen
 * because a client is about to DO it and needs the cues in full on a phone; an
 * earlier plan is browsed, so its days are drawn as sections on one page and the
 * third level of nesting is not spent.
 */
export function pastPlanHref(programId: string): string {
  return `/me/plan/history/${encodeURIComponent(programId)}`;
}
