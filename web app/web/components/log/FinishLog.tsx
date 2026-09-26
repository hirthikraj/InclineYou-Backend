'use client';

import { useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { closeLog } from '@/lib/log/actions';
import { Button } from '@/web-components/ui/Button';

/**
 * *FINISH THE LOG* — WHICH IS NOT *MARK THE SESSION DONE*.
 *
 * It stamps `ended_at` and then goes to frame 5b. Both of those, in that order,
 * and it is a button rather than a link for the first one.
 *
 * It used to be a plain `<Link>`, and the button therefore lied. Nothing on the
 * wire could close a log — `PUT /v1/workouts/{id}` wrote `notes` and nothing
 * else until 28 Aug 2026 — so the trainer pressed *Finish the log* and the log
 * stayed open forever. Today went on saying **In session** for a session logged
 * on Tuesday, because `buildRunning` on both halves looks for a scheduled
 * session whose log has not ended, and the finish screen's *06:00 to 06:52* was
 * permanently null because there was no closing time to print.
 *
 * **The navigation does not wait for the write, and must not.** Closing a log is
 * housekeeping — nothing leaves for the client, nobody but the trainer will ever
 * see it — and holding the screen on a spinner to record that fact is how a
 * one-press verb starts feeling broken. `Renew` on Today makes the same call for
 * the same reason. A failure is recoverable from the screen it lands on, which
 * offers this button again; and a log closed twice is closed once, because
 * `endedAt` is conditional and simply restamps a time the trainer is asking for.
 *
 * Shared by the console and frame 2a rather than written twice: two buttons with
 * the same words that did different things is exactly the drift worth spending a
 * file to prevent.
 */
export function FinishLog({ routeId, workoutId }: { routeId: string; workoutId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const finish = useCallback(() => {
    startTransition(async () => {
      await closeLog({ routeId, workoutId });
    });
    router.push(`/sessions/${routeId}/finish`);
  }, [routeId, workoutId, router, startTransition]);

  return (
    <Button variant="primary" onClick={finish}>
      Finish the log
    </Button>
  );
}
