'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { startWorkout } from '@/lib/portal/workout-actions';
import type { PreviewWire } from '@/lib/portal/workout-api';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Message } from '@/web-components/ui/Message';
import { Tag } from '@/web-components/ui/Tag';

import { prescription, setLine } from './units';

/**
 * What am I in for? (api-contract 1.2, pw-l1). The day's movements with the trainer's cue first — that line is where the trainer is in the
 * room — then what to do, what was done last time, and the movements the trainer approved as swaps. One primary button: Start, Resume,
 * or nothing at all when the trainer has this day booked (then it says why, and who logs it).
 */
export function WorkoutPreview({ preview, trainerFirstName }: { preview: PreviewWire; trainerFirstName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  const { workout, program, exercises } = preview;

  function go() {
    if (preview.inProgress) return router.push(`/me/session/${preview.inProgress.sessionId}`);
    setFailure(null);
    start(async () => {
      const res = await startWorkout(workout.id);
      if (res.ok) router.push(`/me/session/${res.value.sessionId}`);
      else setFailure(res.message);
    });
  }

  return (
    <div className="pwk">
      <Card className="pwk__hero">
        <Card.Body>
          <p className="pwk__k">{program.name}{workout.week ? ` · Week ${workout.week}` : ''}{workout.day ? ` · Day ${workout.day}` : ''}</p>
          <h1 className="pwk__h">{workout.name}</h1>
          <p className="pwk__s">{exercises.length} {exercises.length === 1 ? 'exercise' : 'exercises'} · about {workout.estimatedMinutes} min</p>

          <div aria-live="polite">{failure ? <Message tone="err" className="mt3">{failure}</Message> : null}</div>

          {preview.startable || preview.inProgress ? (
            <Button variant="primary" size="lg" disabled={pending} onClick={go} style={{ marginTop: 14 }}>
              {pending ? 'Opening…' : preview.inProgress ? 'Resume workout' : 'Start workout'}
            </Button>
          ) : (
            <Message tone="warn" className="mt3">
              {trainerFirstName} has this day booked, so they’ll log it with you — there’s nothing for you to start. You can still read what’s planned.
            </Message>
          )}
        </Card.Body>
      </Card>

      <ol className="pwk__list">
        {exercises.map((e, i) => (
          <li key={e.id}>
            <Card>
              <Card.Body>
                <div className="pwk__row">
                  <span className="pwk__n" aria-hidden="true">{i + 1}</span>
                  <div>
                    <h2 className="pwk__name">{e.name}</h2>
                    <p className="pwk__s">
                      {prescription(e.sets)}
                      {e.target ? ` · ${e.target}` : ''}
                    </p>
                  </div>
                </div>

                {e.cue && (
                  <p className="pwk__cue">
                    <b>{trainerFirstName} says</b> {e.cue}
                  </p>
                )}

                {e.last && (
                  <p className="pwk__last">
                    Last time ({new Date(`${e.last.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}):{' '}
                    {e.last.sets.map((s) => setLine({ loadValue: s.loadValue, effortValue: s.effortValue, loadKind: s.loadKind, effortKind: s.effortKind } as never)).filter(Boolean).join(' · ')}
                  </p>
                )}

                {e.steps.length > 0 && (
                  <details className="pwk__steps">
                    <summary>How to do it</summary>
                    <ol>
                      {e.steps.map((s, k) => (
                        <li key={k}>{s}</li>
                      ))}
                    </ol>
                  </details>
                )}

                {e.alternatives.length > 0 && (
                  <p className="pwk__alts">
                    <Tag>Swap if busy</Tag> {e.alternatives.map((a) => a.name).join(' · ')}
                  </p>
                )}
              </Card.Body>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
