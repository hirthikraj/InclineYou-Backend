'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { AssignmentWire } from '@/lib/programs/api';
import { pushUpdate } from '@/lib/programs/actions';
import { CloseIcon, SendIcon } from './Icons';

/**
 * WHO IS ON THIS, AND WHOSE COPY HAS FALLEN BEHIND.
 *
 * The brief asks for both halves: *"show which clients are on which program, and
 * let the trainer push an update to an assigned instance explicitly if they want
 * to."*
 *
 * ── BEHIND IS NOT AN ERROR, AND NOTHING REPAIRS ITSELF ───────────────────────
 *
 * A copy that differs from its blueprint is the normal state of a good coaching
 * business — it is what per-client adjustment looks like — so *Behind* is drawn
 * as a fact rather than as a warning, and the only thing that changes it is this
 * button. Anything that propagated on its own would make editing a blueprint
 * with nine people on it the dangerous act the two-table design exists to
 * prevent.
 *
 * ── AND THE PUSH SAYS WHAT IT WILL DO BEFORE IT DOES IT ──────────────────────
 *
 * The row expands into a confirm rather than firing, because it replaces the
 * client's whole prescription. Two things it does not touch are named there: the
 * weekday and time they train on, and every set they have ever logged.
 */
export function AssignedList({
  templateId,
  assignments,
  onDone,
}: {
  templateId: string;
  assignments: AssignmentWire[];
  onDone: () => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ id: string; text: string; bad: boolean } | null>(null);

  async function push(a: AssignmentWire) {
    setBusy(a.programId);
    setMessage(null);
    const result = await pushUpdate(a.programId, templateId);
    setBusy(null);
    setConfirming(null);
    setMessage(
      result.ok
        ? {
            id: a.programId,
            text: `Pushed — ${a.clientName}'s plan is now ${result.value.added} exercise${result.value.added === 1 ? '' : 's'}.`,
            bad: false,
          }
        : { id: a.programId, text: result.message, bad: true },
    );
  }

  const live = assignments.filter(a => a.status === 'active');
  const past = assignments.filter(a => a.status !== 'active');

  return (
    <aside className="pg__panel" aria-label="Clients on this program">
      <header className="pg__panelhd">
        <div>
          <p className="pg__panelt">Who is on this</p>
          <p className="small">
            {live.length} running
            {past.length > 0 ? ` · ${past.length} no longer running` : ''}
          </p>
        </div>
        <button className="btn btn--icon btn--ghost" type="button" aria-label="Close" onClick={onDone}>
          <CloseIcon />
        </button>
      </header>

      <div className="pg__panelb">
        {assignments.length === 0 ? (
          <p className="pg__none">
            Nobody is on this yet. <b>Assign</b> gives a client their own copy.
          </p>
        ) : (
          [...live, ...past].map(a => (
            <section className="card" key={a.programId}>
              <div className="card__b pg__assign">
                <div className="pg__assignm">
                  <Link className="pg__assignn" href={`/clients/${a.clientId}/program`}>
                    {a.clientName}
                  </Link>
                  <span className="small">
                    {statusWord(a.status)}
                    {a.startDate ? ` · from ${a.startDate}` : ''}
                  </span>
                </div>
                {a.behindTemplate && a.status === 'active' && (
                  <span className="tag tag--warn">Behind</span>
                )}
              </div>

              {a.status === 'active' &&
                (confirming === a.programId ? (
                  <div className="card__b pg__confirm">
                    <p className="small">
                      This replaces {a.clientName}&rsquo;s prescription with what the program says
                      now. Their <b>training days and times stay exactly as they are</b>, and every
                      set they have already logged is untouched.
                    </p>
                    <div className="tools pg__gap">
                      <button
                        className="btn btn--sm btn--secondary"
                        type="button"
                        onClick={() => setConfirming(null)}
                        disabled={busy === a.programId}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn btn--sm btn--primary"
                        type="button"
                        onClick={() => void push(a)}
                        disabled={busy === a.programId}
                      >
                        {busy === a.programId ? 'Pushing…' : `Push it to ${a.clientName}`}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="card__b">
                    <button
                      className="btn btn--sm btn--secondary"
                      type="button"
                      onClick={() => setConfirming(a.programId)}
                    >
                      <SendIcon size={13} />
                      Push this program&rsquo;s changes
                    </button>
                  </div>
                ))}

              {message?.id === a.programId && (
                <div className={`card__b ${message.bad ? 'pg__bad' : 'pg__good'}`}>
                  <p className="small">{message.text}</p>
                </div>
              )}
            </section>
          ))
        )}
      </div>
    </aside>
  );
}

/**
 * `program.status` is a raw column value and reaches the wire as one.
 *
 * FOUND BY RENDERING: the active row said *Running* and the two beside it said
 * *paused* and *completed* — three states in one column, one of them written by
 * this file and two by Postgres. `capitalize` in CSS was the other option and it
 * is the trap the client file's ledger already recorded: it title-cases every
 * word, so a two-word status would shout half of itself.
 */
function statusWord(status: string): string {
  switch (status) {
    case 'active':
      return 'Running';
    case 'paused':
      return 'Paused';
    case 'completed':
      return 'Finished';
    case 'archived':
      return 'Archived';
    default:
      // An unknown value is shown as stored rather than hidden or guessed at —
      // a status this build has not met is still a fact about somebody's plan.
      return status;
  }
}
