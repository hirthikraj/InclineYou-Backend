'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { startWorkout } from '@/lib/portal/workout-actions';
import { Button } from '@/web-components/ui/Button';
import { Message } from '@/web-components/ui/Message';

/**
 * Home's one primary action for a self-run day. A button and not a link, because starting is a write (a link in view would be
 * prefetched and a client scrolling past would start a workout by looking at it). Resuming is a navigation: the log already exists.
 */
export function StartRun({ workoutId, resumeSessionId }: { workoutId: string; resumeSessionId?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);

  function go() {
    if (resumeSessionId) return router.push(`/me/session/${resumeSessionId}`);
    setFailure(null);
    start(async () => {
      const res = await startWorkout(workoutId);
      if (res.ok) router.push(`/me/session/${res.value.sessionId}`);
      else setFailure(res.message);
    });
  }

  return (
    <>
      <div aria-live="polite">{failure ? <Message tone="err" className="mt3">{failure}</Message> : null}</div>
      <div className="pwk__actions">
        <Button variant="primary" size="lg" disabled={pending} onClick={go}>
          {pending ? 'Opening…' : resumeSessionId ? 'Resume workout' : 'Start workout'}
        </Button>
        <Button variant="ghost" href={`/me/workout/${workoutId}`}>See what’s in it</Button>
      </div>
    </>
  );
}
