'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { CloseOutSession } from '@/lib/today/deck';
import { QUEUE_CAP } from '@/lib/today/deck';
import { clockParts, dayStamp } from '@/lib/today/time';
import { markDone, markNoShow } from '@/lib/schedule/actions';
import { Avatar } from '@/web-components/ui/Avatar';
import { Button } from '@/web-components/ui/Button';
import { Slab } from '@/web-components/ui/Slab';
import { Tag } from '@/web-components/ui/Tag';
import { Check } from '@/components/shell/Icons';

type RowState =
  | { kind: 'rest' }
  | { kind: 'working' }
  | { kind: 'done'; word: string; note?: string }
  | { kind: 'failed'; message: string };

/**
 * CLOSE OUT THE WEEK — past sessions nobody marked, one line each, two answers.
 *
 * A pack only moves on *done* or *no-show*, so every session on this card is a
 * pack figure that is wrong right now, and so is every total built on it
 * (*Training this month*, attendance, the renewal rows). The queue used to carry
 * these as one `unmarked` row per client whose *Mark* marked the whole week DONE
 * — no way to say somebody did not come — at the bottom of the ladder, where on
 * a real Friday it was folded behind *Show 30 more*.
 *
 * Oldest first, because the oldest is the one closest to falling out of the
 * week-long window and becoming a money-book job. *No-show · −1* is the diary's
 * own button and takes a session, as the Schedule's does; a trainer who wants to
 * waive it opens the session (the name links to the client).
 *
 * The writes are the Schedule's (`markDone`, `markNoShow`) — one door per verb.
 * They run one at a time per row by construction (a row is disabled while its
 * write is in flight), which matters for the reason `deck.ts` gives: two charges
 * racing against a pack with one session left both read `1`.
 */
export function CloseOut({ sessions }: { sessions: CloseOutSession[] }) {
  const router = useRouter();
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [expanded, setExpanded] = useState(false);

  if (sessions.length === 0) return null;

  const set = (id: string, state: RowState) => setStates((prev) => ({ ...prev, [id]: state }));

  const answer = async (s: CloseOutSession, came: boolean) => {
    set(s.id, { kind: 'working' });
    const result = came
      ? await markDone(s.id)
      : await markNoShow({ id: s.id, costsASession: true });
    if (!result.ok) {
      set(s.id, { kind: 'failed', message: result.message ?? 'That did not go through.' });
      return;
    }
    const left = result.sessionsRemaining;
    set(s.id, {
      kind: 'done',
      word: came ? 'Done' : 'No-show',
      note: result.message ?? (typeof left === 'number' ? `${left} left on the pack` : undefined),
    });
    router.refresh();
  };

  const open = sessions.filter((s) => states[s.id]?.kind !== 'done').length;
  const visible = expanded ? sessions : sessions.slice(0, QUEUE_CAP);
  const folded = sessions.length - visible.length;

  return (
    <Slab title="Close out the last week" count={open}>
      <p className="cls__lead">
        A pack only moves when a session is marked, so these are pack figures that are wrong
        until you answer them.
      </p>
      <div className="q__scroll">
        <table className="tbl tbl--stack atn">
          <colgroup>
            <col className="atn__c-who" />
            <col className="atn__c-why" />
            <col className="cls__c-act" />
          </colgroup>
          <tbody>
            {visible.map((s) => {
              const state = states[s.id] ?? { kind: 'rest' };
              const clock = clockParts(s.at);
              return (
                <tr key={s.id}>
                  <td className="q__who">
                    <Link className="who" href={`/clients/${s.clientId}/sessions`}>
                      <Avatar name={s.clientName} id={s.clientId} size="sm" />
                      <b>{s.clientName}</b>
                    </Link>
                  </td>
                  <td className="q__why" aria-live="polite">
                    {state.kind === 'failed' ? (
                      <span className="q__why--bad">{state.message}</span>
                    ) : (
                      <>
                        <span className="q__k" aria-hidden="true">Diary</span>
                        <span className="tnum">
                          {dayStamp(s.at)} · {clock.time} {clock.meridiem}
                        </span>
                        {s.dayLabel && <> · {s.dayLabel}</>}
                        {state.kind === 'done' && state.note && <> · {state.note}</>}
                      </>
                    )}
                  </td>
                  <td className="q__act cls__act">
                    {state.kind === 'done' ? (
                      <Tag tone="ok">
                        <Check size={12} />
                        {state.word}
                      </Tag>
                    ) : (
                      <span className="cls__btns">
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={state.kind === 'working'}
                          onClick={() => void answer(s, true)}
                        >
                          {state.kind === 'working' ? '…' : 'Done'}
                        </Button>
                        <Button
                          size="sm"
                          disabled={state.kind === 'working'}
                          onClick={() => void answer(s, false)}
                          aria-label={`No-show for ${s.clientName}, takes one session`}
                        >
                          No-show · −1
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {folded > 0 && (
          <button className="atn__more" type="button" onClick={() => setExpanded(true)}>
            Show {folded} more {folded === 1 ? 'session' : 'sessions'}
          </button>
        )}
        {expanded && sessions.length > QUEUE_CAP && (
          <button className="atn__more" type="button" onClick={() => setExpanded(false)}>
            Show the oldest {QUEUE_CAP} only
          </button>
        )}
      </div>
    </Slab>
  );
}
