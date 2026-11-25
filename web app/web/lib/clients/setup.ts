/**
 * WHAT A CLIENT STILL NEEDS BEFORE THEY ARE SET UP — one rule, two readers.
 *
 * Decided 22 Nov 2026 with the product owner. Once a pack is sold, three things
 * have to happen before the trainer can coach to it, in this order:
 *
 *   1. **Days a week** — the programming answer. A 3-day and a 4-day client get
 *      different splits, so nothing below can be chosen without it.
 *   2. **A plan** — a program that fits that many days.
 *   3. **A session booked** — anything on the diary ahead of now. Standing
 *      weekly slots count, because the slot top-up books them 28 days ahead.
 *
 * It is a SOFT block: the client file pins a checklist that cannot be dismissed
 * and Today raises one row per client, but nothing is refused — a trainer can
 * still log a session (picking exercises as they go when there is no plan),
 * take money, or book by hand. A hard block would stop a trainer on the gym
 * floor with the client standing in front of them.
 *
 * A prospect gets its own short list: book the demo, run it, sell a pack.
 *
 * CONSENT COMES FIRST, FOR EVERYBODY (22 Nov 2026). The client accepting their invite — the privacy notice plus the
 * "fit to train" tick — is step one on both lists and is raised for every active or prospect client who has not
 * given it, pack or no pack. The server lets a trainer deliver two sessions without it and refuses the third
 * (`ConsentGate`, `CONSENT_REQUIRED`), and refuses health data, the profile and notes outright; nothing else here
 * waits on it, because a pack, a week and a booking are the business record.
 *
 * Who is in: an ACTIVE, unpaused client with a live pack that still has
 * something on it — never a single-session sale (`sessionId` set; one paid
 * session asks for no weekly rhythm), and never a pack with nothing left
 * (that client needs a renewal, which is a different row).
 *
 * Pure and `server-only`-free (trap 18): the client file is `'use client'` and
 * Today's deck is built on the server, and both import this.
 */

export type SetupStepKey = 'consent' | 'rhythm' | 'plan' | 'book' | 'demo-book' | 'demo-run' | 'sell';

export interface SetupStep {
  key: SetupStepKey;
  done: boolean;
  /** Blocked by an earlier step that is not done — drawn, but its verb waits. */
  waiting: boolean;
  /** The step it waits on, when it waits — so the screen names the right one. */
  after?: SetupStepKey;
}

export interface SetupFacts {
  status: string;
  pausedAt?: number | null;
  sessionsPerWeek: number | null;
  hasPlan: boolean;
  /** `stats.nextSessionAt` — the next booked session at any distance, or null. */
  nextSessionAt: number | null;
  /** A live, non-single pack with sessions (or days) left on it. */
  packLive: boolean;
  /** Prospects only: has a demo (a trial, or any session) ever been booked, and did one happen. */
  demoBooked?: boolean;
  demoDone?: boolean;
  /** `client.membershipStatus` — accepted (or a paused portal) is consent; anything else is not. */
  membership?: string | null;
}

/** Accepted, or a portal paused after accepting — `ConsentGate.consented` on the server. */
export function hasConsent(membership: string | null | undefined): boolean {
  const m = (membership ?? '').toLowerCase();
  return m === 'accepted' || m === 'paused';
}

/** Sessions a trainer may deliver before consent — `ConsentGate.FREE_SESSIONS`. Change both. */
export const FREE_SESSIONS = 2;

export interface SetupView {
  kind: 'active' | 'prospect';
  steps: SetupStep[];
  /** The first step not done, or null when everything is. */
  next: SetupStep | null;
}

/** A pack counts once it is live, not a single session's sale, and not empty. */
export function packCountsForSetup(p: {
  status: string;
  sessionId?: string | null;
  basis?: string;
  sessionsRemaining: number | null;
}): boolean {
  const dead = new Set(['cancelled', 'canceled', 'completed', 'expired', 'refunded']);
  if (dead.has((p.status ?? '').toLowerCase())) return false;
  if (p.sessionId) return false;
  if (p.basis === 'period') return true;
  return p.sessionsRemaining === null || p.sessionsRemaining > 0;
}

function chain(keys: SetupStepKey[], done: Record<string, boolean>, gated: Partial<Record<SetupStepKey, SetupStepKey>>): SetupStep[] {
  return keys.map((key) => {
    const gate = gated[key];
    const waiting = !done[key] && gate !== undefined && !done[gate];
    return waiting ? { key, done: done[key], waiting, after: gate } : { key, done: done[key], waiting };
  });
}

/** Null when this client has nothing to set up — not in scope, or finished. */
export function setupFor(f: SetupFacts): SetupView | null {
  const status = (f.status ?? '').toLowerCase();
  if (f.pausedAt) return null;

  const consent = hasConsent(f.membership);

  if (status === 'prospect') {
    const done = { consent, 'demo-book': !!f.demoBooked || !!f.demoDone, 'demo-run': !!f.demoDone, sell: false };
    const steps = chain(['consent', 'demo-book', 'demo-run', 'sell'], done, { 'demo-run': 'demo-book' });
    return { kind: 'prospect', steps, next: steps.find((s) => !s.done) ?? null };
  }

  if (status !== 'active') return null;
  /* No live pack: consent is the only thing owed, and only while it is owed. */
  if (!f.packLive) {
    if (consent) return null;
    const steps = chain(['consent'], { consent }, {});
    return { kind: 'active', steps, next: steps[0] };
  }
  const done = {
    consent,
    rhythm: f.sessionsPerWeek !== null && f.sessionsPerWeek > 0,
    plan: f.hasPlan,
    book: f.nextSessionAt !== null,
  };
  if (done.consent && done.rhythm && done.plan && done.book) return null;
  /* Only the plan waits on the rhythm: which plan fits is the question days a
     week answers. Booking does not — a session can go on the diary today. */
  const steps = chain(['consent', 'rhythm', 'plan', 'book'], done, { plan: 'rhythm' });
  return { kind: 'active', steps, next: steps.find((s) => !s.done) ?? null };
}

/** The words for a step, shared by the file's checklist and Today's row. */
/** `doneWhy` is the line a FINISHED step shows. Without it a ticked step fell back to
 *  `why`, its to-do line, so *Plan assigned ✓* read "No plan yet?" (24 Nov 2026). */
export const SETUP_COPY: Record<SetupStepKey, { title: string; doneTitle: string; verb: string; why: string; doneWhy?: string }> = {
  consent: {
    title: 'Get their consent',
    doneTitle: 'Consent given',
    doneWhy: 'Health details, profile and notes are open.',
    verb: 'Send invite',
    why: `They accept the invite on their phone. Until then you can run ${FREE_SESSIONS} sessions and record no health details or notes.`,
  },
  rhythm: {
    title: 'Set how many days a week',
    doneTitle: 'Days a week set',
    verb: 'Set week',
    why: 'Decides which plans fit. Days and times are optional.',
  },
  plan: {
    title: 'Assign a plan',
    doneTitle: 'Plan assigned',
    doneWhy: 'Change it any time from Plan.',
    verb: 'Assign',
    why: 'No plan yet? You can still pick exercises as you go when you log.',
  },
  book: {
    title: 'Book a session',
    doneTitle: 'Session booked',
    doneWhy: 'Something is on the calendar.',
    verb: 'Book',
    why: 'Their pack is paid for and nothing is on the calendar.',
  },
  'demo-book': {
    title: 'Book the demo',
    doneTitle: 'Demo booked',
    doneWhy: 'The trial session is on the calendar.',
    verb: 'Book demo',
    why: 'A free trial session, booked like any other.',
  },
  'demo-run': {
    title: 'Run the demo',
    doneTitle: 'Demo done',
    doneWhy: 'The trial session happened.',
    verb: 'Open it',
    why: 'Mark it done once it has happened.',
  },
  sell: {
    title: 'Sell a pack',
    doneTitle: 'Pack sold',
    doneWhy: 'They are an active client now.',
    verb: 'Sell a pack',
    why: 'Selling a pack makes them an active client.',
  },
};

/** Today's one-line reason for the row, by the step that is next. */
export function setupLine(next: SetupStepKey, perWeek: number | null): string {
  switch (next) {
    case 'consent':
      return 'Invite not accepted · no consent yet';
    case 'rhythm':
      return 'Pack sold · how many days a week?';
    case 'plan':
      return perWeek ? `No plan yet · ${perWeek} days a week` : 'No plan yet';
    case 'book':
      return 'Pack paid for · nothing booked';
    default:
      return SETUP_COPY[next].title;
  }
}
