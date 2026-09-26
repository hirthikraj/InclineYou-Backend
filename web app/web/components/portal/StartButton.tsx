'use client';

import { useState, useTransition } from 'react';

import { startWorkout } from '@/lib/portal/actions';
import { Button } from '@/web-components/ui/Button';
import { Message } from '@/web-components/ui/Message';

/**
 * The one primary action on Home. §1: *"Opens to the workout in under two
 * seconds. This is the screen's only real performance requirement."*
 *
 * ── IT IS A BUTTON AND NOT A LINK, BECAUSE STARTING IS A WRITE ───────────────
 *
 * `POST /v1/me/workouts` creates the log and seeds it from the program's day.
 * A `<Link>` to `/me/workout/new` would need a page whose whole job is to write
 * and redirect, which is a route that must never be prefetched — and the router
 * prefetches links in view. A client scrolling past this card would start a
 * workout by looking at it.
 *
 * ── AND IT IS SAFE TO PRESS TWICE ────────────────────────────────────────────
 *
 * The handler resolves *start* and *resume* to one response — its own comment
 * says why: a client who backgrounded the app mid-session and came back must
 * land in the SAME workout, because a second log against one session splits a
 * morning's sets across two and makes every *last time* wrong from then on. So
 * a double tap is idempotent at the server, and the disable below is about the
 * spinner rather than about correctness.
 */
export function StartButton({ sessionId }: { sessionId: string | null }) {
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="col gap2">
      <Button
        variant="primary"
        disabled={pending}
        loading={pending}
        onClick={() =>
          start(async () => {
            setFailure(null);
            const res = await startWorkout(sessionId);
            /* Only a FAILURE returns. On success the action redirects into the
               flow, and `redirect()` throws to unwind — so there is no success
               branch to write here, and a `finally` that cleared the pending
               state would flash the button back to *Start* on top of the
               navigation. */
            if (!res.ok) setFailure(res.message);
          })
        }
      >
        Start
      </Button>
      {failure && (
        <Message tone="err" alert>
          {failure}
        </Message>
      )}
    </div>
  );
}
