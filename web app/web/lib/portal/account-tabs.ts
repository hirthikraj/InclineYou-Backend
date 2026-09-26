/**
 * §5 · Me, as three routes.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS REPLACED ONE LONG PAGE — AND WHY THE OLD PAGE WAS RIGHT TO REFUSE IT
 *
 * `page.tsx` used to open with a docstring headed *"IT IS ONE SCREEN, NOT A TAB
 * STRIP"*, and its argument had two halves. The first is still true and this
 * file keeps it:
 *
 *   > *"A client opens this screen to look their trainer up — §5: the most-used
 *   > element on this screen by a wide margin."*
 *
 * So the trainer card is the first thing on the **default** tab, above the fold,
 * carrying the only primary button on the destination. Tabs do not move it. What
 * they move is the four things underneath it that a client reads once.
 *
 * The second half was:
 *
 *   > *"§Navigation's rule caps the whole portal at four destinations, so a tab
 *   > strip here would be a fifth navigation the spec explicitly refuses."*
 *
 * **That was true when it was written and is not true now.** `/me/progress` grew
 * four tabs and `/me/plan` grew three, both with `PageTabs` **inside a single
 * destination**, and neither added a fifth. The objection this screen was still
 * honouring has been answered twice in the same folder, and `app.css`'s deletion
 * of `.pgsec`/`.secnav` records the sentence that answered it:
 *
 *   **A jump list says "this is one long answer, here are its parts."**
 *   **Tabs say "these are three different questions."**
 *
 * ── AND THE NUMBERS SAY WHICH QUESTION WAS LOSING ───────────────────────────
 *
 * Measured at 390×844 before the split — `.body` `scrollHeight` **4,075px**
 * against a 680px window, seven cards and **26 `.card__b` bodies**, twelve of
 * them inside one card:
 *
 *   | Card | Top | Height | Screen |
 *   | --- | --- | --- | --- |
 *   | the trainer | 12 | 160 | 1 |
 *   | your package | 188 | 422 | 1–2 |
 *   | notes | 626 | 488 | 2 |
 *   | your details | 1,131 | 625 | 2–3 |
 *   | notifications | 1,772 | 427 | 3 |
 *   | **what Arun can see** | **2,215** | **1,264** | **4–5** |
 *   | **your data + delete** | **3,495** | **545** | **6** |
 *
 * So the card the spec calls *"the one most products skip, and the one that
 * builds trust fastest"* began on the **fourth screen**, and the flow that
 * cannot be undone began on the sixth.
 *
 * ── NN/g DOES NOT SAY "TABS" REFLEXIVELY, AND THE TESTS IT SETS ARE PASSED ──
 *
 * Tabs suit *a few long sections of unequal importance* with concise labels, and
 * are wrong when somebody must compare across them. Nobody compares their
 * notification switches against their payment history. NN/g also warns that
 * people DO scroll when content is relevant, and that a page whose groupings
 * cannot be named cleanly should stay one column with subheadings — these three
 * name cleanly, which is the test.
 *
 * ── THREE, AND WHY NOT TWO ──────────────────────────────────────────────────
 *
 * *Settings* and *Privacy* could be one tab called *Your data*, which would match
 * `PLAN_TABS`' count. It puts the notification switches in the same place as the
 * delete flow — which is the pairing the single page was being criticised for,
 * one level down. So three.
 *
 * ── AND THE THREE RULES COME WITH THE PATTERN ───────────────────────────────
 *
 *   1. **Every tab is a real route.** The back button works between them, and a
 *      tab is linkable — a client can send their trainer *this is the number you
 *      have for me*. Each page also loads only its own panel, which here is a
 *      real saving: only *Me* reads the packages, the payments and the notes.
 *   2. **The first tab is the bare route.** `/me/account` IS the trainer card,
 *      never a redirect to it — `CLIENT_PRIMARY` in `nav.tsx` points here and a
 *      redirect on the way would cost a round trip on every visit.
 *   3. **Nothing unbuilt goes in the list.** All three are built.
 */
export type AccountTab = 'me' | 'settings' | 'privacy';

export const ACCOUNT_TABS: { key: AccountTab; label: string }[] = [
  { key: 'me', label: 'Me' },
  { key: 'settings', label: 'Settings' },
  { key: 'privacy', label: 'Privacy' },
];

/** The href for a tab. Just the path — nothing on this screen is windowed. */
export function accountTabHref(tab: AccountTab): string {
  return tab === 'me' ? '/me/account' : `/me/account/${tab}`;
}
