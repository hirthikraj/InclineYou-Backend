import Link from 'next/link';

import type { ProgressWire } from '@/lib/portal/plan-api';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Tag } from '@/web-components/ui/Tag';

import { num } from './format';

const LABEL: Record<number, string> = { 28: '4 weeks', 90: '3 months', 365: 'A year' };

/**
 * The plain-language summary and the numbers under it (api-contract 1.2, pp-l3). The sentence is composed HERE from the response's own
 * fields — every number in it is one of them, so it can be checked against the logs and reworded without an API deploy. It says what
 * happened and never scores it: counts, no streaks, no target, no rate of loss, and nothing about a body — that is measured in an
 * assessment and seen there.
 */
export function ProgressView({ progress, windows, trainerFirstName }: { progress: ProgressWire; windows: number[]; trainerFirstName: string }) {
  const { strength, consistency, milestones } = progress;
  const nothing = consistency.sessionsDone === 0 && strength.tracked === 0;
  const span = LABEL[progress.windowDays] ?? `${progress.windowDays} days`;

  const clauses: string[] = [];
  if (consistency.sessionsDone > 0) {
    clauses.push(`You trained ${consistency.sessionsDone} ${consistency.sessionsDone === 1 ? 'time' : 'times'} — about ${num(consistency.perWeek)} a week`);
  }
  if (strength.tracked > 0) {
    clauses.push(strength.improved > 0 ? `${strength.improved} of ${strength.tracked} lifts ${strength.improved === 1 ? 'is' : 'are'} up` : `${strength.tracked} ${strength.tracked === 1 ? 'lift' : 'lifts'} tracked, holding steady`);
  }

  return (
    <div className="ppg">
      <nav className="ppg__win" aria-label="Time range">
        {windows.map((w) => (
          <Button key={w} variant={w === progress.windowDays ? 'primary' : 'secondary'} size="sm" href={w === 28 ? '/me/progress' : `/me/progress?window=${w}`} aria-current={w === progress.windowDays ? 'true' : undefined}>
            {LABEL[w]}
          </Button>
        ))}
      </nav>

      {nothing ? (
        <EmptyState title={`Nothing logged in the last ${span.toLowerCase()}`} body={`When you and ${trainerFirstName} log sessions, your lifts and your consistency show up here. There’s no rush.`} />
      ) : (
        <>
          <Card className="ppg__hero">
            <Card.Body>
              <p className="ppg__k">Last {span.toLowerCase()}</p>
              <p className="ppg__lead">{clauses.join('. ')}.</p>
              {strength.best && (
                <p className="ppg__s">
                  Biggest jump: <Link href={`/me/progress/exercises/${strength.best.exerciseId}`}>{strength.best.name}</Link> — estimated best set up {num(strength.best.changePct)}%, from {num(strength.best.from.e1rm)} to {num(strength.best.to.e1rm)} kg.
                </p>
              )}
            </Card.Body>
          </Card>

          <div className="ppg__grid">
            <Card>
              <Card.Head title="Strength" level={3} />
              <Card.Body>
                <dl className="pwk__facts">
                  <div><dt>Lifts tracked</dt><dd>{strength.tracked}</dd></div>
                  <div><dt>Up</dt><dd>{strength.improved}</dd></div>
                </dl>
                <Button variant="secondary" size="sm" href="/me/progress/exercises">Every exercise</Button>
              </Card.Body>
            </Card>
            <Card>
              <Card.Head title="Consistency" level={3} />
              <Card.Body>
                <dl className="pwk__facts">
                  <div><dt>Sessions</dt><dd>{consistency.sessionsDone}</dd></div>
                  <div><dt>With {trainerFirstName}</dt><dd>{consistency.trainerLed}</dd></div>
                  <div><dt>On your own</dt><dd>{consistency.selfRun}</dd></div>
                </dl>
                <Button variant="secondary" size="sm" href="/me/progress/history">Every session</Button>
              </Card.Body>
            </Card>
          </div>

          {milestones.length > 0 && (
            <Card>
              <Card.Head title="Milestones" level={3} />
              <Card.Body>
                <ul className="pl__list">
                  {milestones.map((m) => (
                    <li key={`${m.kind}-${m.at}`} className="pl__row">
                      <span>{m.label}</span>
                      <Tag tone="acc">{new Date(m.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}</Tag>
                    </li>
                  ))}
                </ul>
              </Card.Body>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
