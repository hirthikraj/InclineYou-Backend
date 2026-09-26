'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import type { AssignmentWire } from '@/lib/programs/api';
import { diffSummary, kindLabel } from '@/lib/programs/diff';
import { pushUpdate } from '@/lib/programs/actions';
import { CloseIcon, SendIcon } from './Icons';
import { Button } from '@/web-components/ui/Button';
import { Checkbox } from '@/web-components/ui/Checkbox';
import { Tag } from '@/web-components/ui/Tag';
import { DockPanel } from '@/web-components/ui/DockPanel';
import { Card } from '@/web-components/ui/Card';

/**
 * WHO IS ON THIS, AND WHOSE COPY THIS WOULD OVERWRITE.
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
 * panel. Anything that propagated on its own would make editing a blueprint with
 * nine people on it the dangerous act the two-table design exists to prevent.
 *
 * ── AND THE PUSH NOW SAYS WHOSE WORK IT WOULD DELETE ─────────────────────────
 *
 * This panel used to offer one button per row and a *Push to all N* above them,
 * where N was every copy whose `syncedAt` was older than the blueprint's stamp.
 * That is a CLOCK comparison, and it cannot tell a copy nobody has touched from
 * one a trainer rewrote three weeks ago for a shoulder injury — while the write
 * behind the button replaces the whole prescription either way. So the bulk push
 * was, in the ordinary case, an offer to delete per-client work without
 * mentioning it.
 *
 * `AssignmentWire.divergence` is the fact that was missing: what each copy says
 * that the blueprint does not, computed server-side by `lib/programs/diff.ts`.
 * With it the panel can do the thing a trainer actually wants —
 *
 *   [x] Meera R.     level with this plan   · takes it cleanly
 *   [x] Karthik S.   behind
 *   [ ] Anjali P.    TUNED · 3 changes      · what they are, listed
 *
 * — tick who receives it, with the customised copies UNTICKED by default,
 * because the safe default for an irreversible overwrite is not to do it. A
 * trainer who does want to reset somebody ticks them and reads, in the confirm,
 * how many tuned copies are in the count.
 *
 * ── IN SERIES, AND A FAILURE NAMES ITS CLIENT ────────────────────────────────
 *
 * Each call is a whole prescription rewrite; the panel reports *4 of 13* as it
 * goes, the ones already done are not rolled back, and a refusal names the
 * person it belongs to — which is why the result is a list and not a sentence.
 */
export function AssignedList({
  templateId,
  assignments,
  weeks,
  onDone,
}: {
  templateId: string;
  assignments: AssignmentWire[];
  /** How long the block runs, so a row can say WHICH week of it a client is
   *  in. `null` on a template that never had one written. */
  weeks: number | null;
  onDone: () => void;
}) {
  const live = useMemo(() => assignments.filter(a => a.status === 'active'), [assignments]);
  const past = useMemo(() => assignments.filter(a => a.status !== 'active'), [assignments]);

  /** A copy this push has something to say to. One that is level with the
   *  blueprint AND unchanged would receive a rewrite identical to what it
   *  already holds — a confirm paid for a no-op, and a number that overstates
   *  what the button does. */
  const sendable = useMemo(
    () => live.filter(a => a.behindTemplate || tuned(a) > 0),
    [live],
  );

  /* THE SAFE DEFAULT IS NOT TO OVERWRITE. Ticked: every copy that takes the
     blueprint cleanly. Unticked: every copy with work in it, which the trainer
     has to choose deliberately having read what is in it. */
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(sendable.filter(a => tuned(a) === 0).map(a => a.programId)),
  );
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<
    | { kind: 'pick' }
    | { kind: 'confirm' }
    | { kind: 'running'; done: number; total: number }
    | { kind: 'done'; pushed: number; failed: string[] }
  >({ kind: 'pick' });

  const chosen = sendable.filter(a => picked.has(a.programId));
  const chosenTuned = chosen.filter(a => tuned(a) > 0);

  function toggle(programId: string) {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(programId)) next.delete(programId);
      else next.add(programId);
      return next;
    });
  }

  function toggleOpen(programId: string) {
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(programId)) next.delete(programId);
      else next.add(programId);
      return next;
    });
  }

  async function run() {
    const queue = chosen;
    setPhase({ kind: 'running', done: 0, total: queue.length });
    const failed: string[] = [];
    let pushed = 0;
    /* IN SERIES AND WITHOUT AN EARLY RETURN. Each is an independent write, so
       one refusal must not strand the rest — and the trainer needs to know
       WHICH client did not move, not that something did not. */
    for (const [i, a] of queue.entries()) {
      const result = await pushUpdate(a.programId, templateId, a.clientId);
      if (result.ok) pushed += 1;
      else failed.push(a.clientName);
      setPhase({ kind: 'running', done: i + 1, total: queue.length });
    }
    setPhase({ kind: 'done', pushed, failed });
  }

  const tunedCount = live.filter(a => tuned(a) > 0).length;
  const behindCount = live.filter(a => a.behindTemplate).length;
  /* THE WARM TAG IS DRAWN ONLY WHEN IT TELLS THEM APART — this panel's own
     rule, which it already applied to *Behind* and which the tuned count needed
     more: on the seed EVERY live copy carries the trainer's per-client cues, so
     thirteen amber tags discriminated nothing and read as thirteen warnings
     about the normal state of a coaching business. The summary says it once at
     the top; the row's own checkbox sentence names what would go. */
  const mixedTuned = tunedCount > 0 && tunedCount < live.length;

  return (
    <DockPanel label="Clients on this program">
      <DockPanel.Head
        title="Who is on this"
        sub={
          <>
            {live.length} running
            {past.length > 0 ? ` · ${past.length} no longer running` : ''}
          </>
        }
        actions={
          <Button variant="ghost" iconOnly label="Close" onClick={onDone} title={undefined} icon={<CloseIcon />} />
        }
      />

      {/* ONE SENTENCE FOR THIRTEEN TAGS. Outside the scroller on purpose: the
          fact is about the whole list, and a summary that scrolls away with the
          rows it summarises is a summary a trainer reads once and then cannot
          find again. */}
      {sendable.length > 0 && phase.kind === 'pick' && (
        <div className="pg__behind">
          <p className="small">
            <b>
              {behindCount === live.length ? `All ${behindCount}` : `${behindCount} of ${live.length}`}
            </b>{' '}
            {behindCount === 1 ? 'is' : 'are'} on an older version of this plan
            {tunedCount > 0 ? (
              <>
                , and <b>{tunedCount}</b> {tunedCount === 1 ? 'copy has' : 'copies have'} been tuned
                for the client
              </>
            ) : null}
            .{' '}
            {/* NOT A WARNING, and the sentence has to keep saying so — a copy
                that differs from its blueprint is what per-client adjustment
                looks like. */}
            <span className="pg__behindq">
              That is normal: a copy only changes when you send it.
            </span>
          </p>
          <div className="tools pg__gap">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPicked(new Set(sendable.map(a => a.programId)))}
            >
              Select all {sendable.length}
            </Button>
            {picked.size > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())}>
                Clear
              </Button>
            )}
          </div>
        </div>
      )}

      <DockPanel.Body>
        {assignments.length === 0 ? (
          <p className="pg__none">
            Nobody is on this yet. <b>Assign</b> gives a client their own copy.
          </p>
        ) : (
          [...live, ...past].map(a => {
            const changes = tuned(a);
            const can = a.status === 'active' && (a.behindTemplate || changes > 0);
            const lines = a.divergence?.lines ?? [];
            return (
              <Card as="section" key={a.programId}>
                <Card.Body className="pg__assign">
                  <div className="pg__assignm">
                    {/* THE COPY, not the tab. This row is about one program —
                        the one this panel is offering to overwrite — and the tab
                        above it lists every plan the client has ever had. */}
                    <Link
                      className="pg__assignn"
                      href={`/clients/${a.clientId}/program/${a.programId}`}
                    >
                      {a.clientName}
                    </Link>
                    <span className="small">
                      {statusWord(a.status)}
                      {a.startDate ? ` · from ${onDate(a.startDate)}` : ''}
                    </span>
                    {/* WHICH WEEK OF THE BLOCK, which is the question the start
                        date was standing in for. Both facts, because the week is
                        DERIVED and the date is what it is derived from. */}
                    {a.status === 'active' && weekLine(a.startDate, weeks) && (
                      <span className="pg__assignw">{weekLine(a.startDate, weeks)}</span>
                    )}
                  </div>
                  {a.status === 'active' && (
                    <Tag
                      tone={
                        changes > 0 ? (mixedTuned ? 'warn' : 'neutral') : a.behindTemplate ? 'neutral' : 'acc'
                      }
                    >
                      {changes > 0
                        ? `Tuned · ${changes}`
                        : a.behindTemplate
                          ? 'Behind'
                          : 'Level'}
                    </Tag>
                  )}
                </Card.Body>

                {can && phase.kind === 'pick' && (
                  <Card.Body divided>
                    <Checkbox
                      align="start"
                      checked={picked.has(a.programId)}
                      onChange={() => toggle(a.programId)}
                      label={
                        <span className="small">
                          {changes > 0 ? (
                            <>
                              Send it &mdash; <b>{diffSummary(a.divergence!)}</b> made for{' '}
                              {a.clientName} would go.
                            </>
                          ) : a.behindTemplate ? (
                            <>Send it &mdash; nothing of theirs is lost.</>
                          ) : (
                            <>Send it again.</>
                          )}
                        </span>
                      }
                    />
                    {/* THE LIST IS BEHIND A DISCLOSURE AND THE COUNT IS NOT.
                        Thirteen expanded diffs is a panel nobody reads; a count
                        with no way to see what it counts is a number a trainer
                        cannot act on. */}
                    {changes > 0 && (
                      <div className="pg__gap">
                        <Button variant="ghost" size="sm" onClick={() => toggleOpen(a.programId)}>
                          {open.has(a.programId) ? 'Hide what is different' : 'What is different'}
                        </Button>
                        {open.has(a.programId) && (
                          <ul className="cplan__diff">
                            {lines.slice(0, 6).map((line, i) => (
                              <li key={i}>
                                <Tag tone={line.kind === 'removed' ? 'warn' : 'neutral'}>
                                  {kindLabel(line.kind)}
                                </Tag>
                                <span>{line.text}</span>
                              </li>
                            ))}
                            {lines.length > 6 && (
                              <li>
                                <span className="small">
                                  and {lines.length - 6} more &mdash; open{' '}
                                  {a.clientName}&rsquo;s plan to read them all.
                                </span>
                              </li>
                            )}
                          </ul>
                        )}
                      </div>
                    )}
                  </Card.Body>
                )}
              </Card>
            );
          })
        )}

        {/* SAID ONCE, and it has to be said. The week is CALENDAR weeks since
            the start date — it is not a count of sessions logged, and a trainer
            reading *week 5 of 8* off a client who has trained twice would be
            reading a claim this panel cannot make. */}
        {live.some(a => weekLine(a.startDate, weeks)) && (
          <DockPanel.Fine>
            The week is counted from the start date, not from sessions logged.
          </DockPanel.Fine>
        )}
      </DockPanel.Body>

      {/* THE PUSH, AT THE FOOT AND OUTSIDE THE SCROLLER. It is the one act this
          panel performs, and a control that scrolls away with thirteen rows is
          one a trainer hunts for. */}
      {sendable.length > 0 && (
        <DockPanel.Foot stack>
          {phase.kind === 'pick' && (
            <>
              <p className="small">
                {picked.size === 0
                  ? 'Nobody picked. Tick the clients who should get this version.'
                  : `${picked.size} of ${sendable.length} picked.`}
              </p>
              {/* NO BUTTON AT ALL WITH NOBODY PICKED, rather than a disabled
                  one. `Send to 0` is a lime primary describing an act that
                  cannot happen, drawn at the loudest weight the panel has —
                  and the line above it already says what to do instead. The
                  profile's Save row made the same call: nothing to do is better
                  said by there being nothing to press. */}
              {picked.size > 0 && (
                <Button variant="primary" size="sm" onClick={() => setPhase({ kind: 'confirm' })}>
                  <SendIcon size={13} />
                  Send to {picked.size === live.length ? `all ${picked.size}` : picked.size}
                </Button>
              )}
            </>
          )}

          {phase.kind === 'confirm' && (
            <>
              <p className="small">
                {/* FOUND BY RENDERING: `{n} client{s}&rsquo;` gives *1 client’*
                    on the commonest count of all. One client is named; two or
                    more are counted. */}
                This replaces the prescription on{' '}
                {chosen.length === 1 ? (
                  <>
                    <b>{chosen[0].clientName}&rsquo;s</b> copy
                  </>
                ) : (
                  <>
                    <b>{chosen.length} clients&rsquo;</b> copies
                  </>
                )}{' '}
                with what this plan says now.
                {chosenTuned.length > 0 && (
                  <>
                    {' '}
                    <b>
                      {chosenTuned.length} of them {chosenTuned.length === 1 ? 'has' : 'have'} been
                      tuned
                    </b>{' '}
                    &mdash; {chosenTuned.map(a => a.clientName).join(', ')} &mdash; and those
                    changes go.
                  </>
                )}{' '}
                Their <b>training days and times stay exactly as they are</b>, and every set they
                have already logged is untouched.
              </p>
              <div className="tools pg__gap">
                <Button variant="secondary" size="sm" onClick={() => setPhase({ kind: 'pick' })}>
                  Back
                </Button>
                <Button
                  variant={chosenTuned.length > 0 ? 'danger' : 'primary'}
                  size="sm"
                  onClick={() => void run()}
                >
                  Send to {chosen.length}
                </Button>
              </div>
            </>
          )}

          {phase.kind === 'running' && (
            <p className="small">
              Sending&hellip; <b>{phase.done} of {phase.total}</b>
            </p>
          )}

          {phase.kind === 'done' && (
            <>
              <p className="small">
                Sent to <b>{phase.pushed}</b> of {phase.pushed + phase.failed.length}.
              </p>
              {/* THE ONES THAT DID NOT MOVE, BY NAME. A count of failures is a
                  count of clients a trainer then has to find by elimination. */}
              {phase.failed.length > 0 && (
                <p className="small pg__behindbad">Not sent: {phase.failed.join(', ')}.</p>
              )}
              <Button variant="secondary" size="sm" onClick={onDone}>
                Done
              </Button>
            </>
          )}
        </DockPanel.Foot>
      )}
    </DockPanel>
  );
}

/** How much of this copy is the trainer's own work. `0` on a build whose wire
 *  predates `divergence`, which every reader must treat as *unknown* and never
 *  as *nothing* — which is why the count is only ever used to ADD a warning,
 *  never to remove one. */
function tuned(a: AssignmentWire): number {
  return a.divergence?.total ?? 0;
}

/** The app's date shape, and there are three other copies of these options. */
function onDate(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso; // a value this build has not met
  return at.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * WHICH WEEK OF THE BLOCK THIS COPY IS IN.
 *
 * Derived, and only from what is on the wire: `startDate` and the template's
 * `weeks`. Three answers rather than one, because the interesting cases are the
 * edges — a block that has not begun, and one that has run past its own end
 * while nobody closed it, which is the state a trainer most wants to catch.
 */
function weekLine(startDate: string | null, weeks: number | null): string | null {
  if (!startDate || !weeks || weeks < 1) return null;
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return null;
  const days = Math.floor((Date.now() - start.getTime()) / 86_400_000);
  if (days < 0) return `Starts ${onDate(startDate)}`;
  const week = Math.floor(days / 7) + 1;
  // Past the end is not "week 9 of 8" — that reads as a bug. It IS the news.
  if (week > weeks) return `Past the ${weeks}-week block · week ${week}`;
  return `Week ${week} of ${weeks}`;
}

/**
 * `program.status` is a raw column value and reaches the wire as one.
 *
 * FOUND BY RENDERING: the active row said *Running* and the two beside it said
 * *paused* and *completed* — three states in one column, one of them written by
 * this file and two by Postgres. `capitalize` in CSS was the other option and it
 * is the trap the client file's payments list already recorded: it title-cases every
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
