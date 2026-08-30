import 'server-only';

import { cookies } from 'next/headers';

import { SETUP_STEPS, isSetupStep, type SetupStep } from './steps';

/**
 * Which steps the trainer explicitly passed on.
 *
 * **Skipping is not answering, and the difference has to be recorded somewhere**
 * — otherwise `Continue` from the pre-flight screen sends a trainer straight
 * back to the step they just declined, and the flow asks twice. The phone keeps
 * it in the setup draft. The web has no draft, and the profile has no column for
 * it: adding one would be a schema change for flow state, and the additive-only
 * law is not a licence to put anything on the wire.
 *
 * So it lives in a cookie, and that is the right home rather than a fallback:
 * *"I passed on that in this sitting"* is a fact about a sitting. It is not a
 * preference (`trainer.metadata.prefs` is the phone's typed shape and belongs to
 * `settings/prefs.ts`), it is not profile data, and it has no business
 * outliving the flow.
 *
 * The consequence is stated rather than hidden: a trainer who skips step 4 on
 * this laptop and opens the flow on their phone is asked step 4 again there.
 * Being asked once more about a skipped OPTIONAL step is the cheap side of that
 * trade — the expensive side would be a permanent server record of a decline.
 */
const SKIPPED_COOKIE = 'xrep_setup_skipped';

/**
 * Long enough to outlast a flow somebody walks away from and comes back to
 * after lunch, short enough that next week's sign-in starts clean.
 */
const SKIPPED_MAX_AGE = 24 * 60 * 60;

const SECURE = process.env.NODE_ENV === 'production';

export async function readSkipped(): Promise<SetupStep[]> {
  const raw = (await cookies()).get(SKIPPED_COOKIE)?.value ?? '';
  const named = raw.split(',').map((s) => s.trim()).filter(isSetupStep);
  // De-duplicated and put back into flow order, so the rail and `nextStep` read
  // it the same way whatever order the cookie accumulated in.
  return SETUP_STEPS.filter((step) => named.includes(step));
}

/** Idempotent — skipping a step twice is one entry, and re-skipping is a no-op. */
export async function markSkipped(step: SetupStep): Promise<void> {
  const current = await readSkipped();
  if (current.includes(step)) return;
  await writeSkipped([...current, step]);
}

/**
 * Answering a step un-skips it.
 *
 * Called on every step write, because the two states are exclusive and a stale
 * `skipped` entry beside a real answer would make `isSettled` right by accident
 * and the rail's "Skipped" label wrong on a row showing a value.
 */
export async function clearSkipped(step: SetupStep): Promise<void> {
  const current = await readSkipped();
  if (!current.includes(step)) return;
  await writeSkipped(current.filter((s) => s !== step));
}

/** The flow is over; the record of what it skipped has no reader left. */
export async function dropSkipped(): Promise<void> {
  (await cookies()).delete(SKIPPED_COOKIE);
}

async function writeSkipped(steps: SetupStep[]): Promise<void> {
  const jar = await cookies();
  if (steps.length === 0) {
    jar.delete(SKIPPED_COOKIE);
    return;
  }
  jar.set(SKIPPED_COOKIE, steps.join(','), {
    // Nothing in the browser reads this — every reader is a server action.
    httpOnly: true,
    secure: SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: SKIPPED_MAX_AGE,
  });
}
