/**
 * §5's fourth right — **grievance redressal**, and it is the one on the list
 * that is not a design choice.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS AT ALL
 *
 * The spec opens §5's privacy block with *"Clients are data principals with real
 * rights. Build these once, properly."* The screen built three of the five the
 * DPDP Act 2023 gives them:
 *
 *   | Right                                  | §   | Where              |
 *   | -------------------------------------- | --- | ------------------ |
 *   | Access — a summary of what is held     | 11  | the download       |
 *   | Correction and erasure                 | 12  | the form, the delete |
 *   | **Grievance redressal**                | 13  | **this file**      |
 *   | **Nomination**                         | 14  | `client_prefs.nominee` |
 *
 * §13 is not a policy paragraph and it is not optional. Rule 9 of the DPDP
 * Rules 2025 requires a data fiduciary to appoint a grievance officer, to
 * **publish** their contact details, and to operate a stated procedure with
 * stated timelines. A data principal must exhaust that route before they may
 * approach the Data Protection Board.
 *
 * Before this, a client who believed their record was wrong had exactly one
 * route on the screen: WhatsApp, to the person the complaint might be about.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚠ THE CONTACT BELOW IS A PLACEHOLDER AND THE SCREEN CANNOT SHIP ON IT
 *
 * Rule 9 is a *publication* obligation, so a card printing an address nobody
 * reads is worse than no card: it is a promise of a route, made to somebody who
 * has been told they must exhaust it. **Replace all three fields with the real
 * officer before launch.** This file is the only place they are written down,
 * which is the whole reason it is a file and not three strings in a component.
 *
 * It is deliberately NOT an environment variable. A published contact is not
 * configuration that may differ per deployment — it is a fact about the
 * fiduciary, it belongs in the repository where a reviewer can see it, and a
 * missing env var would render the card blank rather than fail the build.
 *
 * ── WHO THE FIDUCIARY IS, AND WHY IT IS NOT THE TRAINER ─────────────────────
 *
 * The trainer decides what to coach; InclineYou decides what is stored, for how
 * long, and who can read it — `mock/portal.ts` and `lib/portal/visibility.ts`
 * are that decision written down. So the officer is ours, and the card says in
 * one sentence that this is a different route from messaging your trainer,
 * because a client will otherwise assume the WhatsApp button covers it.
 */

export const GRIEVANCE_OFFICER = {
  /** A role and an organisation, not a bare personal name — the role outlives the post-holder. */
  name: 'Grievance Officer, InclineYou',
  email: 'grievance@inclineyou.in',
  /** Ten digits, the way every number in this product is stored. */
  phone: '9840000000',
} as const;

/**
 * The two periods the card prints, in days.
 *
 * From Rule 9 of the DPDP Rules 2025 as read for `ACCOUNT-VIEW-UX-HANDOFF.md`
 * §5.3. **Check both against the notified text before launch** — they are
 * printed as a commitment to a person who is being told to rely on them, and a
 * number that is wrong in the client's favour is a promise we would then have
 * to keep, while one wrong the other way is a route we have misdescribed.
 */
export const GRIEVANCE_RESPONSE_DAYS = 30;
export const GRIEVANCE_REDRESSAL_DAYS = 90;

/** `+91 98400 00000` — the shape `formatPhone` produces, for a `tel:` href. */
export const GRIEVANCE_TEL = `tel:+91${GRIEVANCE_OFFICER.phone}`;
