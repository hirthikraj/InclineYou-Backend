import Link from 'next/link';

import type { PlanDayWire, PlanWire } from '@/lib/portal/plan-api';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Tag } from '@/web-components/ui/Tag';

import { day, when } from './format';

const STATE: Record<string, { label: string; tone: 'ok' | 'acc' | 'info' | 'neutral' }> = {
  done: { label: 'Done', tone: 'ok' },
  booked: { label: 'Booked', tone: 'info' },
  next: { label: 'Up next', tone: 'acc' },
  todo: { label: 'To do', tone: 'neutral' },
};

/**
 * What is coming (api-contract 1.2, pp-l1). The trainer's sessions first — a client does not book, so each carries a WhatsApp draft that
 * names the session — then the arc of the plan, week by week, each day saying where it stands. Done opens what was done; booked opens what
 * is planned; a day with nothing booked opens the preview, from which it is started. Nothing here is a score.
 */
export function PlanView({ plan, zone, trainerFirstName }: { plan: PlanWire; zone: string; trainerFirstName: string }) {
  const prog = plan.program;
  const weeks = new Map<number, PlanDayWire[]>();
  for (const d of prog?.days ?? []) {
    const w = d.week ?? 0;
    weeks.set(w, [...(weeks.get(w) ?? []), d]);
  }

  return (
    <div className="pl">
      <Card>
        <Card.Head title="Coming up" level={3} />
        <Card.Body>
          {plan.upcoming.length === 0 ? (
            <p className="pl__s">Nothing booked in the next two weeks. {trainerFirstName} books your sessions; you can still do your own days below.</p>
          ) : (
            <ul className="pl__list">
              {plan.upcoming.map((s) => {
                const w = when(s.scheduledAt, zone);
                return (
                  <li key={s.id} className="pl__row">
                    <div>
                      <p className="pl__t">{w.day} · {w.time}</p>
                      <p className="pl__s">{s.workoutName ? `${s.workoutName} · ` : ''}{s.durationMinutes} min{s.place ? ` · ${s.place}` : s.mode === 'online' ? ' · Online' : ''}</p>
                    </div>
                    {s.rescheduleUrl && (
                      <Button variant="ghost" size="sm" href={s.rescheduleUrl} target="_blank" rel="noopener noreferrer">Ask to move it</Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card.Body>
      </Card>

      {!prog ? (
        <EmptyState title="No plan yet" body={`When ${trainerFirstName} builds your program it appears here, week by week.`} />
      ) : (
        <>
          <Card>
            <Card.Body>
              <p className="pl__k">{prog.status === 'paused' ? 'Paused' : 'Your plan'}</p>
              <h2 className="pl__h">{prog.name}</h2>
              <p className="pl__s">
                Week {prog.currentWeek} of {prog.weeks}
                {prog.startDate ? ` · started ${day(prog.startDate)}` : ''}
                {prog.endDate ? ` · to ${day(prog.endDate)}` : ''}
              </p>
            </Card.Body>
          </Card>

          {[...weeks.entries()].map(([w, days]) => (
            <Card key={w}>
              <Card.Head title={w ? `Week ${w}` : 'Days'} level={3} actions={w === prog.currentWeek ? <Tag tone="acc">This week</Tag> : undefined} />
              <Card.Body>
                <ul className="pl__list">
                  {days.map((d) => {
                    const st = STATE[d.state];
                    const href = d.state === 'done' && d.sessionId ? `/me/session/${d.sessionId}` : `/me/workout/${d.workoutId}`;
                    return (
                      <li key={d.workoutId} className="pl__row">
                        <div>
                          <p className="pl__t"><Link href={href}>{d.name}</Link></p>
                          <p className="pl__s">{d.day ? `Day ${d.day}` : ''}</p>
                        </div>
                        <Tag tone={st.tone}>{st.label}</Tag>
                      </li>
                    );
                  })}
                </ul>
              </Card.Body>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
