/**
 * §3 · Progress, as four routes.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS REPLACED ONE LONG PAGE, AND WHY IT REPLACED THE JUMP NAV TOO
 *
 * Progress was **one screen five desktop screens tall**: a summary, milestones,
 * three charts, the consistency tiles, a history, the tape and a weight chart,
 * in one column. The first fix was a sticky in-page jump list — every section a
 * tap away, the first item doubling as back-to-top — and it was the wrong
 * instrument, which is worth writing down because the reasoning generalises:
 *
 *   **A jump list says "this is one long answer, here are its parts."**
 *   **Tabs say "these are four different questions."**
 *
 * And they ARE four different questions. *How am I doing overall* is not *which
 * lifts have stalled* is not *what did I do on the 14th* is not *what has the
 * tape done since March*. A client opens this screen holding exactly one of
 * them, and a jump list still makes them carry the other three past their eyes
 * on the way. It also inherited the original defect: 3,000px of page whichever
 * question you came with, so the scroll position, the range chips and the
 * browser's own back button all still belonged to one enormous document.
 *
 * ── AND THE PRODUCT ALREADY HAD THE PATTERN ─────────────────────────────────
 *
 * `lib/profile/tabs.ts` and `lib/settings/tabs.ts` are this file's shape, and
 * `components/shell/PageTabs.tsx` is the strip. Three rules come with them and
 * all three hold here:
 *
 *   1. **Every tab is a real route.** The back button works between them, a tab
 *      is linkable — a client can send their trainer *this exercise has not
 *      moved* — and each page loads only its own panel, which on this screen is
 *      a real saving: the Exercises tab is the only one that needs every set
 *      ever logged, and the History tab is the only one that needs every
 *      workout.
 *   2. **The first tab is the bare route.** `/me/progress` IS the summary, never
 *      a redirect to it — the four destinations in `nav.tsx` point here and a
 *      redirect on the way would cost a round trip on every visit.
 *   3. **Nothing unbuilt goes in the list.** `lib/profile/tabs.ts` states it:
 *      a tab that opens nothing is a destination that lies, and the client pays
 *      a page load to find out.
 *
 * ── IT WAS FIVE, AND IT IS FOUR AGAIN — 23 Sep 2026 ─────────────────────────
 *
 * The strip read *Summary · Exercises · History · Measurements · Check-ins*, and
 * the last two are one subject drawn twice. This is the portal taking the split
 * the TRAINER's half had already settled, asked for in those words: *"in the
 * trainer's view we show the body measurements via assessments and we show
 * exercise progress alone as progress — the same behaviour should be applied
 * for the client portal."*
 *
 * On the trainer's half that is `components/clients/file/shared.tsx`: `Progress`
 * is what the client LIFTED — volume, records, the top-set sequence, every
 * movement — and `Assessments` beside it is the body, because a check-in is a
 * date, a tape and a handful of answers. `ProgressTab`'s own header records the
 * measurement that forced it: a `Bodyweight` card drawing a figure the
 * measurements table restated 400px lower, and a four-column tape table in a
 * 1,407px card whose ink ended at 507px.
 *
 * **The client's half had the identical shape and one more copy of it.** The
 * Summary tab led with a lift, then printed the biggest tape mover as a
 * supporting row, then drew a weight chart at the bottom — and two whole tabs
 * further along drew the same tape and the same scale again. Three surfaces,
 * one subject, and a Progress tab that answered two questions and therefore
 * neither first.
 *
 * ── SO: THREE TABS OF TRAINING, ONE OF THE BODY ─────────────────────────────
 *
 *   · **Summary** — what the training was, as figures: sessions, sets, records,
 *     the week's volume, the volume chart, the top-set sequence. The trainer's
 *     own arrangement, in the portal's voice.
 *   · **Exercises** — every movement, grouped by what it is doing.
 *   · **History** — every session.
 *   · **Assessments** — the check-ins and the tape, which are the same event
 *     seen from two sides: a check-in is when the readings were taken, and the
 *     tape is what they say across all of them. `MeasurePanel` on the trainer's
 *     half is exactly that pairing, one level in.
 *
 * ── WHAT WAS TURNED DOWN, AND IT STILL IS ───────────────────────────────────
 *
 *   · **Records / personal bests** as a tab — a PB is a fact about an exercise,
 *     so it belongs on that exercise's row. Summary counts them, `Exercises`
 *     names which movement set them.
 *   · **Photos** — there is no image store in this product at all, on either
 *     half. Not deferred: absent.
 *   · **Messages from the trainer** — real (`client_message`), and it belongs on
 *     Home, where `CoachNote` already draws it. Progress is about the work, not
 *     the correspondence.
 *
 * ── AND ASSESSMENTS IS LAST, WHICH IS A STATEMENT ABOUT FREQUENCY ───────────
 *
 * A check-in happens every eight weeks and the tape comes out with it; the other
 * three answer questions a client has every week. The strip reads left to right
 * in descending order of how often somebody arrives holding that question.
 */
export type ProgressTab = 'summary' | 'exercises' | 'history' | 'assessments';

export const PROGRESS_TABS: { key: ProgressTab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'exercises', label: 'Exercises' },
  { key: 'history', label: 'History' },
  /* THE LABEL IS THE TRAINER'S WORD AND THE PROSE IS THE PRODUCT'S, which is
     the split `ChecksTab` states one half of the product over: the destination
     is called *Assessments*, and every sentence inside it says *check-in* and
     *measurement*. One is what somebody clicks; the other is what the thing is
     called out loud. */
  { key: 'assessments', label: 'Assessments' },
];

/**
 * The href for a tab. Just the path.
 *
 * ── IT CARRIED A RANGE, AND NO LONGER DOES ──────────────────────────────────
 *
 * While the chips lived in the shared header they had to survive a tab change,
 * so every tab link carried `?range=`. They belong to Summary now — see the
 * layout — and the other three tabs do not read the parameter at all, so
 * carrying it would be a query string that changes nothing: the dead-control
 * rule applied to a URL rather than to a button.
 *
 * The stated cost: choose *8 weeks*, wander to History, come back, and Summary
 * is on *since you started* again. That is honest rather than lossy — the chips
 * are on that tab, visibly showing which one is live, so nothing claims a window
 * the screen is not using.
 */
export function progressTabHref(tab: ProgressTab): string {
  return tab === 'summary' ? '/me/progress' : `/me/progress/${tab}`;
}

/**
 * One movement's own screen, under the Exercises tab.
 *
 * ── WHY A ROUTE AND NOT AN EXPANDING ROW ────────────────────────────────────
 *
 * A chart needs looking at, one movement at a time, and that is a different act
 * from scanning a list — see `ProgressExercises`' header for the measurement
 * that forced the split. Three things follow from making it a place rather than
 * a disclosure:
 *
 *   · **it is linkable.** A client who wants to say *this one has not moved in
 *     a month* can send their trainer the screen rather than describe it;
 *   · **the back button works**, where an expanded row leaves the browser's own
 *     control pointing at the tab before this one;
 *   · **the overview stays short.** Seventeen collapsed rows that can each grow
 *     a 300px chart is the same eight-screen page one interaction away.
 *
 * `ProgressTabs` matches on `startsWith('/me/progress/exercises')`, so the
 * Exercises tab stays lit on a detail screen — which is correct: it is where
 * you are, one level in.
 *
 * No range, for `progressTabHref`'s reason one function up: this tab and its
 * detail screens read every set on record rather than a window.
 */
export function exerciseHref(exerciseId: string): string {
  return `/me/progress/exercises/${encodeURIComponent(exerciseId)}`;
}
