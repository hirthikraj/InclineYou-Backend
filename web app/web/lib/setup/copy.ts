/**
 * The sentences the setup flow says, where more than one screen says them or
 * where the web has to say something different from the frame it is built from.
 *
 * The second case is the interesting one. Frames 4a and 4b were drawn
 * offline-first — *"nothing here needs a connection, it saves on this browser
 * and syncs when you are back on"*, *"your answers live on this browser, not on
 * the server, until the flow finishes"*, *"clearing site data loses them"* — and
 * on this half every one of those is false. `AGENTS.md` already records the same
 * defect for the dashboard's offline banner and for frame 1a's *"everything
 * after it works offline"*: the design set was authored before the online-only
 * decision of 23 Aug 2026.
 *
 * What replaces them is not a softer version of the same promise. It is the
 * opposite promise, and it happens to be the stronger one: the answers are on
 * the account from the moment they are given, so leaving is safe, the browser is
 * not load-bearing, and the phone and the laptop are looking at one flow rather
 * than two drafts racing each other.
 */

import type { Message } from '@/lib/auth/copy';
import { SetupApiError } from './errors';

/**
 * The rail's foot, on every step. Where the frame says "nothing here needs a
 * connection", this says where the answers actually are.
 */
export const RAIL_FOOT =
  'You can change all of this later in Settings. Nothing here is permanent, and every answer is saved to your account the moment you give it.';

/** Frame 4a's trust line. */
export const PREFLIGHT_TRUST_LEAD = 'You can leave at any point.';
export const PREFLIGHT_TRUST_REST =
  'Each answer is saved to your account as you give it, not held here until the end — so a closed tab costs you nothing, and step 1 is the only one we cannot skip.';

/**
 * Frame 4b's trust line — the one the frame gets most wrong, and the one whose
 * correction closes a §16 open item on this half. *Two drafts, one flow* is a
 * problem created by keeping answers locally on both halves. There is one record
 * here, so there is nothing to race.
 */
export const RESUME_TRUST_LEAD = 'This is the same half-finished flow your phone would show you.';
export const RESUME_TRUST_REST =
  'Your answers are on your account, not in this browser — so finishing here finishes it there, and nothing is lost by switching.';

/**
 * A failed write, as a sentence, in the four-tone slot the auth screens use.
 *
 * The distinction that matters is whether the answer landed. Every one of these
 * fires on a step whose write was refused, so the honest lead is that this
 * particular answer did not save — never a generic "something went wrong", which
 * leaves a trainer unable to tell whether pressing Continue again would
 * duplicate it.
 */
export function writeMessage(error: unknown): Message {
  if (error instanceof SetupApiError) {
    if (error.unreachable) {
      return {
        tone: 'err',
        icon: 'warn',
        lead: 'We couldn’t reach the server, so that didn’t save.',
        rest: 'Check your connection and press Continue again — nothing was written.',
      };
    }
    if (error.status === 401 || error.status === 403) {
      return {
        tone: 'err',
        icon: 'lock',
        lead: 'You have been signed out.',
        rest: 'Sign in again — everything you answered before this is already on your account.',
      };
    }
    if (error.detail) {
      return { tone: 'err', icon: 'warn', lead: 'The server refused that.', rest: error.detail };
    }
  }
  return {
    tone: 'err',
    icon: 'warn',
    lead: 'That didn’t save.',
    rest: 'Try Continue again in a moment — nothing was written.',
  };
}
