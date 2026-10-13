'use client';

import { useState, useTransition } from 'react';

import { saveFeedback } from '@/lib/portal/workout-actions';
import type { FeedbackWire, LogWire } from '@/lib/portal/workout-api';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Message } from '@/web-components/ui/Message';
import { Tag } from '@/web-components/ui/Tag';
import { Textarea } from '@/web-components/ui/Textarea';

import { clock, setLine, trim } from './units';

/**
 * A finished workout, read-only — also how a trainer-led session opens (api-contract 1.2, pw-l2 with `readOnly`). What was done, set by
 * set, the trainer's note about it when there is one, and the client's own answer to how it felt, which they may change afterwards.
 */
export function Recap({ log, trainerFirstName }: { log: LogWire; trainerFirstName: string }) {
  const { session } = log;
  const [feedback, setFeedback] = useState<FeedbackWire | null>(log.feedback);
  const [editing, setEditing] = useState(false);
  const [effort, setEffort] = useState<'easy' | 'right' | 'hard' | null>(log.feedback?.effort ?? null);
  const [note, setNote] = useState(log.feedback?.note ?? '');
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const done = session.status === 'done';
  const seconds = session.startedAt && session.endedAt ? Math.max(0, (session.endedAt - session.startedAt) / 1000 - session.pausedSeconds) : null;

  function save() {
    setFailure(null);
    start(async () => {
      const res = await saveFeedback(session.id, { effort, note: note.trim() || null });
      if (res.ok) {
        setFeedback(res.value);
        setEditing(false);
      } else setFailure(res.message);
    });
  }

  return (
    <div className="pwk">
      <Card className="pwk__hero">
        <Card.Body>
          <p className="pwk__k">{log.readOnly ? `${trainerFirstName} logged this one` : 'Your workout'}{session.startedAt ? ` · ${new Date(session.startedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}` : ''}</p>
          <h1 className="pwk__h">{session.workout?.name ?? 'Workout'}</h1>
          <dl className="pwk__facts">
            {seconds !== null && <div><dt>Time</dt><dd>{clock(seconds)}</dd></div>}
            <div><dt>Sets</dt><dd>{log.totals.setsDone}<span> of {log.totals.setsPlanned}</span></dd></div>
            {log.totals.volumeKg > 0 && <div><dt>Lifted</dt><dd>{trim(log.totals.volumeKg)}<span> kg</span></dd></div>}
          </dl>
          {!done && log.readOnly && <p className="pwk__s">This session isn’t finished yet. {trainerFirstName} logs it with you.</p>}
        </Card.Body>
      </Card>

      {log.recap && (
        <Card>
          <Card.Head title={`From ${trainerFirstName}`} level={3} />
          <Card.Body><p className="pwk__q">{log.recap.body}</p></Card.Body>
        </Card>
      )}

      <ol className="pwk__list">
        {log.exercises.filter((e) => !e.removedAt).map((e, i) => (
          <li key={e.id}>
            <Card>
              <Card.Body>
                <div className="pwk__row"><span className="pwk__n" aria-hidden="true">{i + 1}</span><h2 className="pwk__name">{e.name}</h2></div>
                {e.swappedFrom && <p className="pwk__s">Swapped from {e.swappedFrom.name}</p>}
                <ul className="pwk__sets pwk__sets--read">
                  {e.sets.map((s) => (
                    <li key={s.id} className={s.doneAt ? 'pwk__set pwk__set--done' : 'pwk__set'}>
                      <span className="pwk__setn">{s.position}</span>
                      <span>{s.doneAt ? setLine(s) || 'Done' : 'Not done'}</span>
                      {!s.planned && <Tag>Extra</Tag>}
                    </li>
                  ))}
                </ul>
              </Card.Body>
            </Card>
          </li>
        ))}
      </ol>

      {done && (
        <Card>
          <Card.Head title="How it felt" level={3} />
          <Card.Body>
            {!editing ? (
              <>
                <p className="pwk__q">{feedback?.effort ? { easy: 'Easy', right: 'Just right', hard: 'Hard' }[feedback.effort] : 'You didn’t say.'}{feedback?.note ? ` — ${feedback.note}` : ''}</p>
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>{feedback?.effort || feedback?.note ? 'Change' : 'Add how it felt'}</Button>
              </>
            ) : (
              <>
                <div className="pwk__chips" role="group" aria-label="How did it feel">
                  {(['easy', 'right', 'hard'] as const).map((v) => (
                    <Button key={v} variant={effort === v ? 'primary' : 'secondary'} size="sm" aria-pressed={effort === v} onClick={() => setEffort(effort === v ? null : v)}>
                      {v === 'right' ? 'Just right' : v === 'easy' ? 'Easy' : 'Hard'}
                    </Button>
                  ))}
                </div>
                <Textarea label="A note for your trainer" value={note} limit={1000} rows={3} onChange={(ev) => setNote(ev.target.value)} />
                <div aria-live="polite">{failure ? <Message tone="err" className="mt3">{failure}</Message> : null}</div>
                <div className="pwk__actions">
                  <Button variant="primary" disabled={pending} onClick={save}>{pending ? 'Saving…' : 'Save'}</Button>
                  <Button variant="ghost" disabled={pending} onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </>
            )}
          </Card.Body>
        </Card>
      )}

      <div className="pwk__actions"><Button variant="secondary" href="/me/today">Back to today</Button></div>
    </div>
  );
}
