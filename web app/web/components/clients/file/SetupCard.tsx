'use client';

import { useState } from 'react';

import type { ClientFilePayload } from '@/lib/clients/client-api';
import { FREE_SESSIONS, packCountsForSetup, setupFor, SETUP_COPY, type SetupStep } from '@/lib/clients/setup';
import { InviteButton } from '../InviteButton';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Tag } from '@/web-components/ui/Tag';
import { WeekEditor } from './WeekEditor';

/**
 * FINISH SETTING UP — pinned at the top of Overview until it is done (22 Nov 2026).
 *
 * The checklist `lib/clients/setup.ts` defines, drawn where the trainer lands
 * on the client: days a week → a plan → a session booked for a sold pack, or
 * book the demo → run it → sell a pack for a prospect. Every tick is read off
 * real data, so nothing is stored and nothing can drift; the card leaves by
 * itself when the last step is done.
 *
 * It has no dismiss, on purpose — that is what makes it the soft block the
 * product owner asked for. It refuses nothing either: logging, money and
 * booking by hand all still work, and the plan step says so, because a trainer
 * may run today's session on exercises picked as they go.
 */
export function SetupCard({ payload, onEditWeek }: { payload: ClientFilePayload; onEditWeek?: () => void }) {
  const { client, packages, sessions } = payload;
  const [editing, setEditing] = useState(false);
  const openWeek = onEditWeek ?? (() => setEditing(true));

  const live = sessions.filter((s) => s.status !== 'cancelled');
  const view = setupFor({
    status: client.status,
    pausedAt: client.pausedAt,
    sessionsPerWeek: client.schedule.sessionsPerWeek,
    hasPlan: client.program !== null,
    nextSessionAt: client.stats.nextSessionAt,
    packLive: packages.some(packCountsForSetup),
    demoBooked: client.stats.nextSessionAt !== null || live.length > 0,
    demoDone: client.stats.sessionsDone > 0 || live.some((s) => s.status === 'done'),
    membership: client.membershipStatus,
  });
  if (!view) return null;

  const id = client.id;
  const first = client.name.split(' ')[0];
  const demo = live
    .filter((s) => s.status === 'scheduled')
    .sort((a, b) => a.scheduledAt - b.scheduledAt)[0] ?? null;
  const doneCount = view.steps.filter((s) => s.done).length;

  const verb = (step: SetupStep) => {
    const copy = SETUP_COPY[step.key];
    const primary = view.next?.key === step.key;
    const variant = primary ? 'primary' : 'secondary';
    /* A WAITING STEP HAS NO BUTTON (23 Nov 2026). It was a disabled one, which on a phone is a grey box
       nobody can press, at the same size as the ones they can, and its hint named the wrong step for the
       demo. The step's own line says what it waits on (`why`). */
    if (step.waiting) return null;
    switch (step.key) {
      case 'consent':
        return (
          <InviteButton
            clientId={id}
            clientName={client.name}
            phone={client.phone}
            label={client.membershipStatus === 'invited' ? 'Send again' : copy.verb}
            variant={variant}
          />
        );
      case 'rhythm':
        return <Button variant={variant} size="sm" onClick={openWeek}>{copy.verb}</Button>;
      case 'plan':
        return <Button variant={variant} size="sm" href={`/programs/templates?client=${id}`}>{copy.verb}</Button>;
      case 'book':
      case 'demo-book':
        return <Button variant={variant} size="sm" href={`/schedule?new=1&client=${id}`}>{copy.verb}</Button>;
      case 'demo-run':
        return demo
          ? <Button variant={variant} size="sm" href={`/sessions/${demo.id}`}>{copy.verb}</Button>
          : <Button variant={variant} size="sm" href={`/clients/${id}/sessions`}>{copy.verb}</Button>;
      case 'sell':
        return <Button variant={variant} size="sm" href={`/clients/${id}/payments`}>{copy.verb}</Button>;
    }
  };

  /* Sessions delivered so far: done, plus a log open now — what the server counts. */
  const delivered = client.stats.sessionsDone + live.filter((s) => s.status === 'scheduled' && s.startedAt !== null).length;
  const why = (step: SetupStep): string => {
    if (step.key === 'consent' && !step.done) {
      const left = Math.max(0, FREE_SESSIONS - delivered);
      const waiting = client.membershipStatus === 'invited'
        ? 'Invite sent, not accepted yet. '
        : client.membershipStatus === 'declined' ? 'They declined the last invite. ' : '';
      return left > 0
        ? `${waiting}${left} of ${FREE_SESSIONS} sessions left before they must accept. Health details, profile and notes wait for it.`
        : `${waiting}No sessions left without consent: the next one can't be logged until they accept.`;
    }
    if (step.key === 'rhythm' && step.done) {
      const n = client.schedule.sessionsPerWeek;
      return `${n} day${n === 1 ? '' : 's'} a week. Change it any time from This week.`;
    }
    if (step.key === 'plan' && step.waiting) return 'Which plan fits depends on days a week. Set that first.';
    if (step.key === 'demo-run' && step.waiting) return 'Once the demo is booked, mark it done here after it happens.';
    if (step.key === 'plan' && !step.done && client.schedule.sessionsPerWeek) {
      return `Plans with ${client.schedule.sessionsPerWeek} days fit. No plan yet? You can still pick exercises as you go when you log.`;
    }
    if (step.key === 'demo-run' && demo && !step.done) {
      return `Booked for ${new Date(demo.scheduledAt).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}. Mark it done once it has happened.`;
    }
    if (step.done) return SETUP_COPY[step.key].doneWhy ?? SETUP_COPY[step.key].why;
    return SETUP_COPY[step.key].why;
  };

  return (
    <>
      <Card
        className="cfsetup"
        title={view.kind === 'prospect' ? `Turn ${first} into a client` : `Finish setting up ${first}`}
        aside={<Tag tone={doneCount === 0 ? 'warn' : 'acc'}>{doneCount} of {view.steps.length} done</Tag>}
      >
        <ol className="cfsetup__list">
          {view.steps.map((step, i) => (
            <li
              key={step.key}
              className="cfsetup__row"
              data-state={step.done ? 'done' : step.waiting ? 'waiting' : 'todo'}
            >
              <span className="cfsetup__mk" aria-hidden="true">
                {step.done ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg>
                ) : i + 1}
              </span>
              <span className="cfsetup__txt">
                <b>
                  {step.done ? SETUP_COPY[step.key].doneTitle : SETUP_COPY[step.key].title}
                  <span className="vh">
                    {step.done
                      ? ' (done)'
                      : step.waiting && step.after
                        ? ` (waiting on step ${view.steps.findIndex((s) => s.key === step.after) + 1})`
                        : ' (to do)'}
                  </span>
                </b>
                <span className="small">{why(step)}</span>
              </span>
              {!step.done && !step.waiting && <span className="cfsetup__go">{verb(step)}</span>}
            </li>
          ))}
        </ol>
      </Card>
      {editing && <WeekEditor client={client} onClose={() => setEditing(false)} />}
    </>
  );
}
