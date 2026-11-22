'use client';

import { useState, useTransition } from 'react';

import { saveFeedback } from '@/lib/portal/workout-actions';
import type { FeedbackWire, LogWire, SetWire } from '@/lib/portal/workout-api';
import { Button } from '@/web-components/ui/Button';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { CoachNote } from '@/web-components/ui/CoachNote';
import { Message } from '@/web-components/ui/Message';
import { Stat, Stats } from '@/web-components/ui/Stat';
import { Tag } from '@/web-components/ui/Tag';
import { Textarea } from '@/web-components/ui/Textarea';

import { setLine, volume } from './units';

/** `35 kg × 10` — with a load beside it a bare count is reps, so the word is said once by the card, not on every pill. */
function figure(s: SetWire): string {
  const line = setLine(s) || 'Done';
  return s.loadValue !== null ? line.replace(/ reps$/, '') : line;
}

const FELT = { easy: 'Easy', right: 'Just right', hard: 'Hard' } as const;

/**
 * A finished workout, read-only — also how a trainer-led session opens (api-contract 1.2, pw-l2 with `readOnly`). What was done, set by
 * set, the trainer's note about it when there is one, and the client's own answer to how it felt, which they may change afterwards.
 *
 * ── 21 Nov 2026 ──────────────────────────────────────────────────────────────
 *
 *   · **The portal column, and the name is the page's `<h1>`** (the route draws a `PageHeader` with crumbs). It was a 720px
 *     left-aligned stack whose `<h1>` sat inside a card, with *Back to today* as the only way out.
 *   · **One card for the exercises, one row each, the sets as a line of figures** — the shape a log is read back in on TrueCoach and
 *     Trainerize. Seven full cards for seven exercises put a one-hour session at four screens on a phone. An exercise with no sets at
 *     all (added, then not done) is left out: an empty row is noise, not a record.
 *   · **A set that was not done says *Not logged*, muted** — a fact about the log, never a verdict (AGENTS.md, *Never shame*).
 *   · **Each tile is a bare figure with its unit underneath** (`54` / minutes, `4.6` / tonnes — Progress's own `t`): `54:00` read as a
 *     clock and `4,612.5 kg` broke the three-up row at 390.
 *   · **The trainer's note is a `CoachNote`**, the same block Home draws it in.
 */
export function Recap({ log, trainerName }: { log: LogWire; trainerName: string }) {
  const { session } = log;
  const first = trainerName.split(' ')[0];
  const [feedback, setFeedback] = useState<FeedbackWire | null>(log.feedback);
  const [editing, setEditing] = useState(false);
  const [effort, setEffort] = useState<'easy' | 'right' | 'hard' | null>(log.feedback?.effort ?? null);
  const [note, setNote] = useState(log.feedback?.note ?? '');
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const done = session.status === 'done';
  const seconds = session.startedAt && session.endedAt ? Math.max(0, (session.endedAt - session.startedAt) / 1000 - session.pausedSeconds) : null;
  const exercises = log.exercises.filter((e) => !e.removedAt && e.sets.length > 0);
  const said = feedback?.effort || feedback?.note;

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
    <div className="portal col gap4">
      {!done && log.readOnly && (
        <Card>
          <CardBody>
            <p className="small ink2">This session isn’t finished yet — {first} logs it with you, so there is nothing for you to do here.</p>
          </CardBody>
        </Card>
      )}

      <Stats up={3} className="pstats">
        <Stat label="Time" value={seconds !== null ? Math.max(1, Math.round(seconds / 60)) : '—'} detail={seconds !== null ? 'minutes' : undefined} />
        <Stat label="Sets" value={log.totals.setsDone} detail={`of ${log.totals.setsPlanned}`} />
        <Stat
          label="Lifted"
          value={log.totals.volumeKg > 0 ? volume(log.totals.volumeKg).split(' ')[0] : '—'}
          detail={log.totals.volumeKg > 0 ? (log.totals.volumeKg < 1000 ? 'kg' : 'tonnes') : undefined}
        />
      </Stats>

      {log.recap && (
        <Card>
          <CardHead title={`From ${first}`} level={3} />
          <CardBody>
            <CoachNote author={trainerName}>{log.recap.body}</CoachNote>
          </CardBody>
        </Card>
      )}

      {exercises.length > 0 && (
        <Card>
          <CardHead
            title="What you did"
            level={3}
            actions={<span className="small ink3">{exercises.length} {exercises.length === 1 ? 'exercise' : 'exercises'}</span>}
          />
          <CardBody flush>
            <ol className="pwk__log">
              {exercises.map((e, i) => (
                <li key={e.id} className="pwk__lx">
                  <span className="pwk__n" aria-hidden="true">{i + 1}</span>
                  <div className="pwk__lxb">
                    <h4 className="pwk__lxn">{e.name}</h4>
                    {e.swappedFrom && <p className="small ink3">In place of {e.swappedFrom.name}</p>}
                    <ul className="pwk__figs" aria-label={`${e.name}, ${e.sets.length} ${e.sets.length === 1 ? 'set' : 'sets'}`}>
                      {e.sets.map((s) => (
                        <li key={s.id} className={s.doneAt ? 'pwk__fig' : 'pwk__fig pwk__fig--off'}>
                          <span className="vh">Set {s.position}: </span>
                          {s.doneAt ? figure(s) : 'Not logged'}
                          {!s.planned && <Tag className="pwk__figt">Extra</Tag>}
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      )}

      {done && (
        <Card>
          <CardHead
            title="How it felt"
            level={3}
            actions={
              !editing ? (
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                  {said ? 'Change' : 'Add'}
                </Button>
              ) : undefined
            }
          />
          <CardBody>
            {!editing ? (
              <p className={said ? 'pwk__q' : 'small ink3'}>
                {feedback?.effort ? FELT[feedback.effort] : said ? '' : `You didn’t say. ${first} reads it if you do.`}
                {feedback?.effort && feedback?.note ? ' — ' : ''}
                {feedback?.note ?? ''}
              </p>
            ) : (
              <>
                <div className="pwk__chips" role="group" aria-label="How did it feel">
                  {(['easy', 'right', 'hard'] as const).map((v) => (
                    <Button key={v} variant={effort === v ? 'primary' : 'secondary'} size="sm" aria-pressed={effort === v} onClick={() => setEffort(effort === v ? null : v)}>
                      {FELT[v]}
                    </Button>
                  ))}
                </div>
                <Textarea label={`A note for ${first}`} value={note} limit={1000} rows={3} onChange={(ev) => setNote(ev.target.value)} />
                <div aria-live="polite">{failure ? <Message tone="err" className="mt3">{failure}</Message> : null}</div>
                <div className="pwk__actions">
                  <Button variant="primary" disabled={pending} onClick={save}>{pending ? 'Saving…' : 'Save'}</Button>
                  <Button variant="ghost" disabled={pending} onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
