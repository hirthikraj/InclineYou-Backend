'use client';

import { Fragment } from 'react';
import Link from 'next/link';

import type {
  SessionDetailData,
  ExerciseGroup,
  PlannedRow,
  PlanView,
} from '@/lib/sessions/api';
import type { ClientNoteWire } from '@/lib/clients/client-api';
import { clockParts, dayStamp, dayLong, formatSpan, avatarToken, initials } from '@/lib/today/time';
import { TopBar } from '@/components/shell/TopBar';
import { Glyph } from '@/components/shell/Icons';
import { NudgeButton } from '@/components/nudge/NudgeButton';

/**
 * ONE SESSION, READ RATHER THAN WRITTEN.
 *
 * `/sessions/:id/log` is where a session is *entered* — a grid, a keyboard model
 * and four verdicts. This is where one is *read*, and the two are different
 * screens because the questions are different. The console asks "what is the
 * next number"; this page asks "what happened here", weeks later, with the
 * client's file open in the next tab.
 *
 * ── THE SAME PAGE ON BOTH SIDES OF NOW ──────────────────────────────────────
 *
 * A session before it happens and a session after it happens are the same
 * object, so they are the same route and the same layout — the prescription, the
 * client, the notes. What changes is which half carries the weight:
 *
 *   · **Upcoming** — the plan IS the screen. Every exercise the program asks
 *     for, with its sets, reps, rest and target load, so a trainer walking in
 *     knows the session before they open the console.
 *   · **Past** — the log is the screen, and the plan sits beside it saying what
 *     was asked for. That is what turns "four exercises" into "four of the five
 *     planned, and the fifth was skipped".
 *
 * ── WHAT THE PLAN IS NOT ────────────────────────────────────────────────────
 *
 * It is not an authority over what happened. A trainer who swapped a movement on
 * the floor did the right thing, and a log that reads *unplanned* against it is
 * describing the swap, not complaining about it.
 */

const DONE = new Set(['done', 'completed']);
const NO_SHOW = new Set(['no_show', 'noshow']);

/* ─────────────────────────────────────────────────── inline icons ── */

function BackIcon() {
  return <Glyph size={16} d="M19 12H5M5 12l6-6M5 12l6 6" />;
}

function FloorIcon({ size = 14 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M4 9v6M7 7.5v9M17 7.5v9M20 9v6M7 12h10" />
    </Glyph>
  );
}

function RemoteIcon({ size = 14 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </Glyph>
  );
}

function NoteIcon({ size = 13 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M5 4h11l3 3v13H5V4Z" />
      <path d="M8 10h8M8 14h5" />
    </Glyph>
  );
}

function PinIcon({ size = 12 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z" />
      <path d="M12 14v7" />
    </Glyph>
  );
}

function CheckIcon({ size = 14 }: { size?: number }) {
  return <Glyph size={size} d="M4.5 12.5l5 5 10-11" />;
}

function NoShowIcon({ size = 14 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M5.07 18.93A9 9 0 1 1 18.93 5.07M2 2l20 20" />
    </Glyph>
  );
}

function PlanIcon({ size = 15 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </Glyph>
  );
}

/* ────────────────────────────────────────────────────────── the words ── */

/** "3 × 10", "3 sets", "10 reps", or null when the program named neither. */
function prescription(sets: number | null, reps: number | null): string | null {
  if (sets != null && reps != null) return `${sets} × ${reps}`;
  if (sets != null) return `${sets} set${sets === 1 ? '' : 's'}`;
  if (reps != null) return `${reps} rep${reps === 1 ? '' : 's'}`;
  return null;
}

/** "90s", "2 min", "2 min 30s". Rest is read at a glance or not at all. */
function restLabel(seconds: number | null): string | null {
  if (seconds == null || seconds <= 0) return null;
  if (seconds < 120) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${min} min ${rest}s` : `${min} min`;
}

function kg(value: number): string {
  return value.toLocaleString('en-IN');
}

/* ───────────────────────────────────────────── the trainer's own notes ── */

/**
 * "Left knee — no deep squats" is worth as much reading a session back as it is
 * standing in front of one, which is why it is on this page at all.
 *
 * Pinned notes come first and keep the pinned strip's own treatment, so the
 * trainer recognises them from the client file. The rest are capped: this is a
 * session page, and a client with forty notes has a notes tab for them.
 */
const LOOSE_NOTES_SHOWN = 4;

function ClientNotes({ clientId, notes }: { clientId: string; notes: ClientNoteWire[] }) {
  if (notes.length === 0) return null;

  const pinned = notes.filter((n) => n.pinned);
  const loose = notes.filter((n) => !n.pinned);
  const shown = loose.slice(0, LOOSE_NOTES_SHOWN);

  return (
    <div className="card" style={{ maxWidth: 640, marginTop: 12 }}>
      <div className="card__hd">
        <NoteIcon size={15} />
        <p className="card__t" style={{ marginLeft: 8 }}>On this client</p>
        <Link className="small" href={`/clients/${clientId}/notes`} style={{ marginLeft: 'auto' }}>
          All notes
        </Link>
      </div>
      <div className="card__b">
        {pinned.length > 0 && (
          <div className="cfpin" style={{ marginBottom: shown.length ? 12 : 0 }}>
            <p className="cfpin__k">
              <PinIcon size={12} />
              Before every session
            </p>
            <div className="cfpin__l">
              {pinned.map((note) => (
                <p key={note.id} className="cfpin__i">
                  <span style={{ flex: 1, minWidth: 0 }}>{note.body}</span>
                </p>
              ))}
            </div>
          </div>
        )}

        {shown.map((note) => (
          <p key={note.id} className="small" style={{ marginBottom: 8, whiteSpace: 'pre-wrap' }}>
            {note.body}
          </p>
        ))}

        {loose.length > shown.length && (
          <p className="small ink3">
            {loose.length - shown.length} more in{' '}
            <Link href={`/clients/${clientId}/notes`}>her notes</Link>.
          </p>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────── the prescription ── */

/**
 * What the program asked for, one row per movement.
 *
 * `done` turns the same table into the after-the-fact version: a tick against
 * every movement the log covered and a plain marker against the one it did not.
 * Two renderings of one table rather than two tables, because a trainer
 * comparing them across the day should not have to re-read a different layout.
 */
function PlanTable({
  plan,
  clientId,
  done,
}: {
  plan: PlanView;
  clientId: string;
  done: boolean;
}) {
  const skipped = done ? plan.exercises.filter((e) => e.loggedSets === 0).length : 0;

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card__hd">
        <PlanIcon size={15} />
        <p className="card__t" style={{ marginLeft: 8 }}>
          {plan.dayLabel ?? plan.programName}
        </p>
        <span className="small ink3" style={{ marginLeft: 'auto' }}>
          {plan.dayLabel ? `${plan.programName}` : 'Program'}
          {plan.week != null ? ` · Week ${plan.week}` : ''}
          {plan.templateDay != null ? ` · Day ${plan.templateDay}` : ''}
        </span>
      </div>
      <div className="card__b">
        {plan.exercises.length === 0 ? (
          <p className="small ink3">
            This program has no exercises against{' '}
            {plan.templateDay != null ? `day ${plan.templateDay}` : 'it'} yet.{' '}
            <Link href={`/clients/${clientId}/program`}>Open the program</Link> to add them.
          </p>
        ) : (
          <>
            <table className="sets" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th className="n"></th>
                  <th style={{ textAlign: 'left' }}>Exercise</th>
                  <th className="num">Sets × reps</th>
                  <th className="num">Target</th>
                  <th className="num">Rest</th>
                  {done && <th className="num">Logged</th>}
                </tr>
              </thead>
              <tbody>
                {plan.exercises.map((row, i) => (
                  <PlanRow key={row.exerciseId} row={row} index={i + 1} done={done} />
                ))}
              </tbody>
            </table>

            {done && skipped > 0 && (
              <p className="small ink3" style={{ marginTop: 10 }}>
                {skipped} of {plan.exercises.length} planned{' '}
                {skipped === 1 ? 'movement was' : 'movements were'} not logged. A skipped exercise
                is a decision the trainer made on the floor, and this page records it rather than
                grading it.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PlanRow({ row, index, done }: { row: PlannedRow; index: number; done: boolean }) {
  const target = prescription(row.targetSets, row.targetReps);
  const rest = restLabel(row.restSeconds);
  const missed = done && row.loggedSets === 0;

  return (
    <tr style={missed ? { opacity: 0.55 } : undefined}>
      <td className="n">{index}</td>
      <td>
        {row.exerciseName}
        {row.muscleGroup && (
          <span className="small ink3" style={{ marginLeft: 8 }}>{row.muscleGroup}</span>
        )}
      </td>
      <td className="num">
        {target ? <span className="mono">{target}</span> : <span className="ink3">—</span>}
      </td>
      <td className="num">
        {row.targetLoad != null ? (
          <span className="mono">{kg(row.targetLoad)} kg</span>
        ) : (
          <span className="ink3">—</span>
        )}
      </td>
      <td className="num">
        {rest ? <span className="mono">{rest}</span> : <span className="ink3">—</span>}
      </td>
      {done && (
        <td className="num">
          {row.loggedSets > 0 ? (
            <span className="tag tag--ok">
              <CheckIcon size={11} /> {row.loggedSets}
            </span>
          ) : (
            <span className="ink3">not logged</span>
          )}
        </td>
      )}
    </tr>
  );
}

/* ──────────────────────────────────────────── exercise set table ── */

function ExerciseCard({ group }: { group: ExerciseGroup }) {
  const hasWeights = group.sets.some((s) => s.loadKg !== null);
  const hasReps = group.sets.some((s) => s.reps !== null);
  const hasRpe = group.sets.some((s) => s.rpe !== null);
  const target = group.target ? prescription(group.target.sets, group.target.reps) : null;
  const rest = group.target ? restLabel(group.target.restSeconds) : null;

  /* One number of columns, computed once. The note row spans the rest of them,
     and a note row that spans the wrong count is how a table gets a ragged
     edge on exactly the sessions that have the most to say. */
  const dataColumns = (hasWeights ? 1 : 0) + (hasReps ? 1 : 0) + (hasRpe ? 1 : 0) + 1;

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card__hd">
        <p className="card__t">{group.exerciseName}</p>
        {group.unplanned && (
          <span className="tag" style={{ marginLeft: 8 }}>Unplanned</span>
        )}
        {group.muscleGroup && (
          <span className="small ink3" style={{ marginLeft: 'auto' }}>
            {group.muscleGroup}
          </span>
        )}
        <span className="small mono" style={{ marginLeft: group.muscleGroup ? 12 : 'auto' }}>
          {group.volumeKg > 0
            ? `${kg(group.volumeKg)} kg`
            : `${group.sets.length} set${group.sets.length !== 1 ? 's' : ''}`}
        </span>
      </div>
      <div className="card__b">
        {/* The prescription, above the thing it prescribed. A trainer reading
            "3 × 10" over four logged sets of eight can see the session in one
            glance, which is the whole reason the plan is on this page. */}
        {(target || rest || group.target?.load != null) && (
          <p className="small ink3" style={{ marginBottom: 8 }}>
            Planned{target ? <> <b className="ink mono">{target}</b></> : null}
            {group.target?.load != null ? <> at <b className="ink mono">{kg(group.target.load)} kg</b></> : null}
            {rest ? <> · <b className="ink mono">{rest}</b> rest</> : null}
            {group.sets.length !== (group.target?.sets ?? group.sets.length) && (
              <> · <b className="ink">{group.sets.length} logged</b></>
            )}
          </p>
        )}
        {group.unplanned && (
          <p className="small ink3" style={{ marginBottom: 8 }}>
            Added on the floor — the program did not ask for this one.
          </p>
        )}

        <table className="sets" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th className="n"></th>
              {hasWeights && <th className="num">Load kg</th>}
              {hasReps && <th className="num">Reps</th>}
              {hasRpe && <th className="num">RPE</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {group.sets.map((set) => (
              <Fragment key={set.id}>
                <tr data-state="done">
                  <td className="n">{set.setNumber}</td>
                  {hasWeights && (
                    <td className="num">
                      {set.loadKg !== null ? (
                        <span className="mono">{set.loadKg}</span>
                      ) : (
                        <span className="ink3">—</span>
                      )}
                    </td>
                  )}
                  {hasReps && (
                    <td className="num">
                      {set.reps !== null ? (
                        <span className="mono">{set.reps}</span>
                      ) : (
                        <span className="ink3">—</span>
                      )}
                    </td>
                  )}
                  {hasRpe && (
                    <td className="num">
                      {set.rpe !== null ? (
                        <span className="mono">{set.rpe}</span>
                      ) : (
                        <span className="ink3">—</span>
                      )}
                    </td>
                  )}
                  <td className="num">
                    {set.bestEver && (
                      <span className="tag tag--pr" title="Still their heaviest ever on this movement">
                        Best ever
                      </span>
                    )}
                  </td>
                </tr>
                {set.notes && (
                  <tr className="note">
                    <td></td>
                    <td colSpan={dataColumns}>
                      <p>
                        <NoteIcon /> {set.notes}
                      </p>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────── shared blocks ── */

function DetailsCard({ data }: { data: SessionDetailData }) {
  const { session } = data;
  const { time, meridiem } = clockParts(session.scheduledAt);
  const token = avatarToken(session.clientId);
  const booked = session.bookingId !== null;

  return (
    <div className="card" style={{ maxWidth: 540, marginTop: 12 }}>
      <div className="card__hd">
        <span className="av av--sm" style={{ background: `var(--tx-av-${token})` }}>
          {initials(session.clientName)}
        </span>
        <Link className="card__t" href={`/clients/${session.clientId}`} style={{ marginLeft: 10 }}>
          {session.clientName}
        </Link>
      </div>
      <div className="card__b">
        <div className="kv">
          <span className="kv__k">Date</span>
          <span className="kv__v">{dayLong(session.scheduledAt)}</span>
        </div>
        {booked ? (
          <>
            <div className="kv">
              <span className="kv__k">Time</span>
              <span className="kv__v">{time} {meridiem}</span>
            </div>
            <div className="kv">
              <span className="kv__k">Duration</span>
              <span className="kv__v">{formatSpan(session.minutes)}</span>
            </div>
            <div className="kv">
              <span className="kv__k">Type</span>
              <span className="kv__v" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {session.mode === 'remote' ? <RemoteIcon size={14} /> : <FloorIcon size={14} />}
                {session.mode === 'remote' ? 'Remote' : 'Floor'}
              </span>
            </div>
          </>
        ) : (
          <div className="kv">
            <span className="kv__k">Booking</span>
            <span className="kv__v ink3">None — logged without one</span>
          </div>
        )}
        {data.plan && (
          <div className="kv">
            <span className="kv__k">Program</span>
            <span className="kv__v">
              {data.plan.dayLabel ?? data.plan.programName}
              {data.plan.week != null ? ` · Week ${data.plan.week}` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function NotesCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="card" style={{ maxWidth: 640, marginTop: 12 }}>
      <div className="card__hd">
        <NoteIcon size={15} />
        <p className="card__t" style={{ marginLeft: 8 }}>{title}</p>
      </div>
      <div className="card__b">
        <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{body}</p>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────── upcoming session view ── */

function UpcomingView({ data }: { data: SessionDetailData }) {
  const { session, plan } = data;

  return (
    <div className="body">
      {plan && (
        <div className="strip" style={{ marginBottom: 12 }}>
          <div>
            <b>{plan.exercises.length}</b>
            <i>exercise{plan.exercises.length !== 1 ? 's' : ''}</i>
          </div>
          <div>
            <b>{plan.totalSets || '—'}</b>
            <i>sets planned</i>
          </div>
          <div>
            <b>{formatSpan(session.minutes)}</b>
            <i>booked</i>
          </div>
          <div>
            <b style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {session.mode === 'remote' ? <RemoteIcon size={16} /> : <FloorIcon size={16} />}
              {session.mode === 'remote' ? 'Remote' : 'Floor'}
            </b>
            <i>where</i>
          </div>
        </div>
      )}

      {plan ? (
        <PlanTable plan={plan} clientId={session.clientId} done={false} />
      ) : (
        <div className="card" style={{ maxWidth: 640, marginBottom: 12 }}>
          <div className="card__b">
            <p className="small">
              No program is attached to this session, so there is nothing prescribed to show.
              The console will still log it — an unplanned session is a session.{' '}
              <Link href={`/clients/${session.clientId}/programs`}>Her programs</Link>.
            </p>
          </div>
        </div>
      )}

      <ClientNotes clientId={session.clientId} notes={data.notes} />

      {session.notes && <NotesCard title="Session notes" body={session.notes} />}

      <DetailsCard data={data} />

      <p className="small ink3" style={{ marginTop: 16, maxWidth: 640 }}>
        This session hasn&rsquo;t been logged yet. <b className="ink">Log this session</b> opens the
        console — and starting a log does not move her pack, because a pack moves on done or
        no-show, never on booked.
      </p>
    </div>
  );
}

/* ────────────────────────────────────────── workout log view ── */

function WorkoutLogView({ data }: { data: SessionDetailData }) {
  const { session, workout, plan } = data;
  const isDone = DONE.has(session.status);
  const isNoShow = NO_SHOW.has(session.status);
  /* A booking whose time has passed and which nobody closed. The log may be
     full; the money side is not settled until somebody says so. */
  const unmarked = session.bookingId !== null && !isDone && !isNoShow;

  return (
    <div className="body">
      {workout && (
        <div className="strip">
          <div>
            <b>{workout.totalSets}</b>
            <i>{plan?.totalSets ? `of ${plan.totalSets} planned` : 'sets'}</i>
          </div>
          {workout.totalVolumeKg > 0 && (
            <div>
              <b>{kg(workout.totalVolumeKg)}</b>
              <i>kg moved</i>
            </div>
          )}
          <div>
            <b>{workout.exercises.length}</b>
            <i>exercise{workout.exercises.length !== 1 ? 's' : ''}</i>
          </div>
          <div>
            <b style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {isDone ? (
                <><CheckIcon size={16} /> Done</>
              ) : isNoShow ? (
                <><NoShowIcon size={16} /> No-show</>
              ) : (
                'Not marked'
              )}
            </b>
            <i>outcome</i>
          </div>
        </div>
      )}

      {/* ── THE SESSION IS LOGGED AND THE MONEY IS NOT SETTLED ──────────────
          The one state this page exists to make impossible to miss. A log full
          of sets says nothing about whether the session came off her pack, and
          a trainer scanning history has no other way to tell. */}
      {unmarked && (
        <div className="why why--warn" style={{ marginTop: 12, maxWidth: 760 }}>
          <p className="why__k">Not marked</p>
          <p>
            This session has passed and nobody said what happened, so it has not touched{' '}
            {session.clientName.split(' ')[0]}&rsquo;s pack. A pack moves on <i>done</i> or{' '}
            <i>no-show</i>, never on <i>booked</i> — and a log full of sets is not either of them.{' '}
            {/* Frame 5b is built on the log: `getFinish` goes through `getConsole`
                and there is nothing to finish without one. A session nobody
                logged goes to the console instead, which offers to start one. */}
            <Link href={`/sessions/${data.routeId}/${workout ? 'finish' : 'log'}`}>
              <b>{workout ? 'Close it out' : 'Open the console'}</b>
            </Link>
            .
          </p>
        </div>
      )}

      {/* ── THE NO-SHOW, AND THE ONE THING WORTH DOING ABOUT IT ────────────
          This card used to state the fact and stop: *marked as a no-show, no
          workout was logged.* True, and a dead end — a trainer reading it has
          exactly one useful next move, which is to ask the client what happened,
          and until now that meant leaving the page to find their number.

          `missed_session`, not `check_in`: the difference is the whole reason
          there are two templates. `check_in` asks how the week is going, which
          is a question; this one names what happened and offers to move things
          around, without a reproach in it — because the commonest reason
          somebody misses a session is that their week went wrong, and a message
          that reads as a telling-off is how a recoverable client becomes a lost
          one. */}
      {isNoShow && !workout && (
        <div className="card" style={{ maxWidth: 540, marginTop: 12 }}>
          <div className="card__b">
            <p className="small">
              This session was marked as a no-show. No workout was logged.
            </p>
            <div style={{ marginTop: 10 }}>
              <NudgeButton
                clientId={session.clientId}
                clientName={session.clientName}
                template="missed_session"
                className="btn btn--sm btn--secondary"
              />
            </div>
          </div>
        </div>
      )}

      {workout && workout.exercises.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {workout.exercises.map((group) => (
            <ExerciseCard key={group.exerciseId} group={group} />
          ))}
        </div>
      )}

      {/* The prescription, after the fact. Only worth a table of its own once
          something was actually planned — and it is the only thing on the page
          that can say a movement was skipped, since a skipped movement has no
          set log to appear in above. */}
      {plan && plan.exercises.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <PlanTable plan={plan} clientId={session.clientId} done={workout !== null} />
        </div>
      )}

      {workout?.notes && <NotesCard title="Trainer notes" body={workout.notes} />}

      <ClientNotes clientId={session.clientId} notes={data.notes} />

      {session.notes && <NotesCard title="Session notes" body={session.notes} />}

      {isDone && !workout && (
        <div className="card" style={{ maxWidth: 540, marginTop: 12 }}>
          <div className="card__b">
            <p className="small">Session marked done — no workout log was created.</p>
          </div>
        </div>
      )}

      <DetailsCard data={data} />
    </div>
  );
}

/* ─────────────────────────────────────────────────── main component ── */

export function SessionDetail({ data }: { data: SessionDetailData }) {
  const { session } = data;
  const { time, meridiem } = clockParts(session.scheduledAt);
  const stamp = dayStamp(session.scheduledAt);
  const isDone = DONE.has(session.status);
  const isNoShow = NO_SHOW.has(session.status);
  /* Upcoming is about the clock, not the status: a `scheduled` booking whose
     time has passed is a session that happened and was never closed, and
     showing it the *plan* screen would hide the log sitting behind it. */
  const isUpcoming = !isDone && !isNoShow && !session.hasLog && session.scheduledAt >= data.now;

  const crumbLabel = `${session.clientName} · ${stamp}`;
  const head = data.plan?.dayLabel ?? data.plan?.programName ?? null;

  return (
    <>
      <TopBar crumb="Sessions" onSearch={() => {}} />
      <main className="main">
        <div className="ph">
          <div className="ph__row">
            <div>
              <nav className="crumbs" aria-label="Breadcrumb">
                <Link href="/sessions">Sessions</Link>
                <i aria-hidden="true">/</i>
                <b>{crumbLabel}</b>
              </nav>

              <h1 className="ph__t">
                {session.clientName}
                {head && (
                  <span className="ink3" style={{ fontWeight: 600 }}>
                    {' '}&middot; {head}
                  </span>
                )}
              </h1>
              <p className="ph__sub">
                {stamp}
                {session.bookingId ? ` · ${time} ${meridiem}` : ''}
                {isUpcoming && ' · Upcoming'}
                {isDone && ' · Done'}
                {isNoShow && ' · No-show'}
                {!isUpcoming && !isDone && !isNoShow && session.bookingId && ' · Not marked'}
              </p>
            </div>

            <div className="ph__acts">
              <Link className="btn btn--secondary btn--sm" href="/sessions">
                <BackIcon />
                All sessions
              </Link>
              <Link
                className="btn btn--secondary btn--sm"
                href={`/clients/${session.clientId}`}
              >
                Client file
              </Link>
              {/* This page READS a session; the console WRITES one. Two screens
                  and not one, because the read is a record of what happened and
                  the write is a grid with a keyboard model — and the same id
                  addresses both, which is why `/sessions/:id/log` keys off the
                  booking wherever there is one. */}
              <Link className="btn btn--primary btn--sm" href={`/sessions/${data.routeId}/log`}>
                {session.hasLog ? 'Open the log' : 'Log this session'}
              </Link>
            </div>
          </div>
        </div>

        {isUpcoming ? <UpcomingView data={data} /> : <WorkoutLogView data={data} />}
      </main>
    </>
  );
}
