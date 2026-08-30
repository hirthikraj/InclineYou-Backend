'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import type { HistoryView } from '@/lib/log/log';
import { PLATE_STEP_KG, trim1, walkForward } from '@/lib/log/log';
import { updateSet } from '@/lib/log/actions';
import { TopBar } from '@/components/shell/TopBar';
import { Back, Chart, Note, Tick, Warn } from './Icons';

/**
 * FRAME 4a — ONE EXERCISE, EVERY SESSION. AND 7a, WHICH IS WHY THE DESK EXISTS.
 *
 * ── 4a · JUDGED AT THE TIME, NOT TAGGED ─────────────────────────────────────
 *
 * The history is walked **forward** and each session judged against everything
 * before it, by the same function the floor screen uses. Four of five sessions
 * carry a tag and the oldest does not, because there was nothing before it.
 * **There is no stored flag to disagree with.**
 *
 * Two things the layout keeps. **The same five columns as the log** — a trainer
 * should never have to learn a second layout for their own data, so the Previous
 * column is simply repurposed and carries the RPE, which is the one thing worth
 * keeping from a set that already happened. And **sets stay in the order they
 * happened**: sessions run newest first, but set 3 only means something after
 * set 2, and the tag is on the set, not on the day.
 *
 * ── 7a · A SET TYPED WRONG IN NOVEMBER ──────────────────────────────────────
 *
 * 95 kg in a month she was benching 40. On a phone you would never find it. Here
 * it is two clicks — and because **a record is computed on read**, correcting it
 * strips the gold from November *and re-judges every session after it in the
 * same frame*. There is no `savePr` anywhere in this codebase; a stored PR would
 * be a second copy of the truth, and second copies drift.
 *
 * The panel on the right is not a description of that, it is a computation of
 * it: `walkForward` re-runs over a patched copy of the rows as the trainer
 * types, so the list of what moves is the same function that will produce the
 * answer after the save. Strava is the only platform in the teardown that got
 * this right, and every other logger stores the badge and then cannot explain
 * why a corrected set still has one.
 */
export function ExerciseHistory({ data }: { data: HistoryView }) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const editId = params.get('edit');
  const editing = editId
    ? data.sessions
        .flatMap((s) => s.sets.map((set) => ({ session: s, set })))
        .find((row) => row.set.setId === editId) ?? null
    : null;

  const original = editing ? data.raw.sets.find((s) => s.id === editing.set.setId) ?? null : null;

  const [load, setLoad] = useState(editing?.set.load === '—' ? '' : editing?.set.load ?? '');
  const [reps, setReps] = useState(editing?.set.reps === '—' ? '' : editing?.set.reps ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  /* Today comes from the SERVER's answer, not from this browser's clock. It only
     picks which row is labelled "Today", and reading `Date.now()` during a
     render is a value that can change between two renders of the same data —
     which is exactly the instability the preview below must not have. */
  const todayIso = data.sessions.find((s) => s.today)?.date ?? '';

  const number = (raw: string) => {
    const value = Number.parseFloat(raw.replace(',', '.'));
    return Number.isFinite(value) ? value : null;
  };

  /* What moves when 95 becomes 40 — computed, not asserted. */
  const preview = useMemo(() => {
    if (!editing || !original) return null;
    const nextLoad = number(load);
    const nextReps = number(reps);
    if (nextLoad === original.loadKg && nextReps === original.reps) return null;

    const patched = data.raw.sets.map((s) =>
      s.id === original.id ? { ...s, loadKg: nextLoad, reps: nextReps } : s,
    );
    const after = walkForward(
      patched,
      data.raw.dateOf,
      data.logType,
      PLATE_STEP_KG,
      todayIso,
    );

    const before = new Map(data.sessions.map((s) => [s.workoutId, s.verdict] as const));
    const moved = after.sessions.filter((s) => before.get(s.workoutId) !== s.verdict);

    const gained = moved.filter((s) => s.verdict === 'record' || s.verdict === 'quiet');
    const lost = moved.filter((s) => {
      const was = before.get(s.workoutId);
      return was === 'record' || was === 'quiet';
    });

    return { moved, gained, lost, sequence: after.sequence };
  }, [editing, original, load, reps, data, todayIso]);

  const save = () => {
    if (!editing || !original) return;
    setBusy(true);
    setMessage(null);
    startTransition(async () => {
      const result = await updateSet({
        routeId: editing.session.workoutId,
        workoutId: editing.session.workoutId,
        setId: original.id,
        clientId: data.clientId,
        exerciseId: data.exerciseId,
        setNumber: original.setNumber,
        loadKg: data.logType === 'reps' ? null : number(load),
        reps: number(reps),
        rpe: original.rpe ?? null,
        notes: original.notes ?? null,
      });
      setBusy(false);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      router.replace(`/clients/${data.clientId}/exercises/${data.exerciseId}`);
      router.refresh();
    });
  };

  const goEdit = (setId: string | null) => {
    const row = setId
      ? data.sessions.flatMap((s) => s.sets).find((s) => s.setId === setId)
      : null;
    setLoad(row && row.load !== '—' ? row.load : '');
    setReps(row && row.reps !== '—' ? row.reps : '');
    setMessage(null);
    router.replace(
      setId
        ? `/clients/${data.clientId}/exercises/${data.exerciseId}?edit=${setId}`
        : `/clients/${data.clientId}/exercises/${data.exerciseId}`,
      { scroll: false },
    );
  };

  return (
    <>
      <TopBar crumb="Clients" onSearch={() => {}} />
      <main className="main" id="main-content">
        <div className="ph">
          <div className="ph__row">
            <div>
              <nav className="crumbs" aria-label="Breadcrumb">
                <Link href="/clients">Clients</Link>
                <i aria-hidden="true">/</i>
                <Link href={`/clients/${data.clientId}`}>{data.clientName}</Link>
                <i aria-hidden="true">/</i>
                <b>{data.exerciseName}</b>
              </nav>
              <h1 className="ph__t">
                {editing ? `Correcting a set from ${editing.session.label.replace('Today · ', '')}` : `${data.exerciseName} · every session`}
              </h1>
              <p className="ph__sub">
                {editing
                  ? `${data.clientName} · the reason this console exists`
                  : `${data.clientName} · read-only · every record re-judged on open`}
              </p>
            </div>
            <div className="ph__acts">
              {editing ? (
                <>
                  <button className="btn btn--ghost" type="button" onClick={() => goEdit(null)}>
                    Cancel
                  </button>
                  <button className="btn btn--primary" type="button" disabled={busy} onClick={save}>
                    {busy ? 'Saving…' : 'Save the correction'}
                  </button>
                </>
              ) : (
                <>
                  <Link className="btn btn--secondary" href={`/clients/${data.clientId}/progress`}>
                    <Chart /> Progress
                  </Link>
                  <Link className="btn btn--secondary" href={`/clients/${data.clientId}`}>
                    <Back /> Her file
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="body">
          {data.sessions.length === 0 ? (
            <div className="empty">
              <p className="empty__t">She has never logged {data.exerciseName.toLowerCase()}</p>
              <p className="empty__b">
                Nothing to walk forward, so nothing to judge. The first log is never a record: it is
                the number to beat.
              </p>
            </div>
          ) : (
            <div className="wk2 wk2--form" style={{ maxWidth: 1140 }}>
              <div className="card">
                <div className="card__hd">
                  <h2 className="card__t">
                    {data.exerciseName}
                    {editing ? ` · ${editing.session.label.replace('Today · ', '')}` : ''}
                  </h2>
                  {editing ? <span className="tag tag--warn">Correcting</span> : null}
                  <span className="small mono" style={{ marginLeft: 'auto' }}>
                    {data.clientName} · {data.sessions.length} session
                    {data.sessions.length === 1 ? '' : 's'} shown
                  </span>
                </div>

                <div className="card__b card__b--flush">
                  <table className="sets" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th className="n"><span className="vh">Set</span></th>
                        <th className="prev">RPE</th>
                        <th className="num">{data.logType === 'reps' ? 'Load' : 'Load kg'}</th>
                        <th className="num">Reps</th>
                        <th className="slack" colSpan={2}><span className="vh">Correct</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sessions.map((session) => [
                        <tr className="grph" key={`${session.workoutId}-h`}>
                          <th colSpan={6}>
                            {session.label}{' '}
                            <span className="ink3">{session.volumeKg.toLocaleString('en-IN')} kg</span>
                            <em>
                              {session.verdict === 'record' ? (
                                <span className="tag tag--pr">Record</span>
                              ) : session.verdict === 'quiet' ? (
                                <span className="tag tag--pr">Record · quiet</span>
                              ) : session.verdict === 'matched' ? (
                                <span className="tag">Matched</span>
                              ) : session.verdict === 'first' ? (
                                <span className="tag tag--info">Her first</span>
                              ) : null}
                            </em>
                          </th>
                        </tr>,

                        ...session.sets.flatMap((set) => {
                          const isEdited = editing?.set.setId === set.setId;
                          return [
                            <tr
                              key={set.setId}
                              data-state={isEdited ? 'active' : 'done'}
                              className={set.pr ? 'pr' : undefined}
                            >
                              <td className="n">{set.number}</td>
                              <td className="prev">{set.rpe != null ? `RPE ${set.rpe}` : <em>—</em>}</td>
                              <td className="num">
                                {isEdited && data.logType !== 'reps' ? (
                                  <input
                                    className="ctl"
                                    inputMode="decimal"
                                    autoFocus
                                    value={load}
                                    onChange={(e) => setLoad(e.target.value)}
                                    style={{ borderColor: 'var(--tx-warn)' }}
                                    aria-label={`Load, set ${set.number}`}
                                  />
                                ) : (
                                  <span className="mono">{set.load}</span>
                                )}
                              </td>
                              <td className="num">
                                {isEdited ? (
                                  <input
                                    className="ctl"
                                    inputMode="numeric"
                                    value={reps}
                                    onChange={(e) => setReps(e.target.value)}
                                    aria-label={`Reps, set ${set.number}`}
                                  />
                                ) : (
                                  <span className="mono">{set.reps}</span>
                                )}
                              </td>
                              <td />
                              <td className="tick">
                                {isEdited ? (
                                  <span className="tk tk--on" aria-hidden="true"><Tick /></span>
                                ) : (
                                  <button
                                    className="btn btn--ghost btn--sm"
                                    type="button"
                                    onClick={() => goEdit(set.setId)}
                                  >
                                    Correct
                                  </button>
                                )}
                              </td>
                            </tr>,

                            set.note ? (
                              <tr className="note" key={`${set.setId}-n`}>
                                <td />
                                <td colSpan={5}>
                                  <p><Note /> {set.note}</p>
                                </td>
                              </tr>
                            ) : null,
                          ];
                        }),
                      ])}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                {editing ? (
                  <>
                    <div className="why">
                      <p className="why__k">Change it, and every session after it fixes itself</p>
                      <p>
                        There is <b>no stored record anywhere in this codebase</b>. A record is
                        computed on read, every read — so correcting this one set removes the gold
                        from {editing.session.label.replace('Today · ', '')} <i>and</i> re-judges
                        every session after it in the same frame. A stored PR would be a second copy
                        of the truth, and second copies drift.
                      </p>
                    </div>

                    <p className="micro" style={{ margin: '16px 0 8px' }}>
                      {preview ? 'What moves when you save' : 'Type a different number to see what moves'}
                    </p>

                    {preview ? (
                      <div className="card">
                        <div className="card__b card__b--flush">
                          {preview.lost.map((s) => (
                            <div className="q" key={`lost-${s.workoutId}`}>
                              <span className="q__ic"><Warn size={14} /></span>
                              <span className="q__m">
                                <span className="q__t">
                                  {s.label.replace('Today · ', '')} loses its record
                                </span>
                                <span className="q__s">it was not a best after all</span>
                              </span>
                            </div>
                          ))}
                          {preview.gained.length ? (
                            <div className="q">
                              <span className="q__ic q__ic--ok"><Tick size={14} /></span>
                              <span className="q__m">
                                <span className="q__t">
                                  {preview.gained.length} session
                                  {preview.gained.length === 1 ? '' : 's'} gain a record
                                </span>
                                <span className="q__s">
                                  {preview.gained
                                    .slice(0, 3)
                                    .map((s) => s.label.replace('Today · ', ''))
                                    .join(', ')}
                                </span>
                              </span>
                            </div>
                          ) : null}
                          <div className="q">
                            <span className="q__ic q__ic--ok"><Chart size={14} /></span>
                            <span className="q__m">
                              <span className="q__t">Her top-set line redraws</span>
                              <span className="q__s">
                                {preview.sequence.slice(-5).map((p) => p.value).join(' → ')}
                                {data.logType === 'reps' ? ' reps' : ' kg'}
                              </span>
                            </span>
                          </div>
                          <div className="q">
                            <span className="q__ic"><Note size={14} /></span>
                            <span className="q__m">
                              <span className="q__t">Nothing is sent to her</span>
                              <span className="q__s">a record un-made is not news</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="small ink3">
                        Nothing changes until the number does. The list here is computed by the same
                        function that will judge it after the save, not a description of one.
                      </p>
                    )}

                    {message ? (
                      <p className="msg msg--err" role="alert" style={{ marginTop: 12 }}>{message}</p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="why">
                      <p className="why__k">Judged at the time, not tagged</p>
                      <p>
                        The history is walked <b>forward</b> and each session judged against
                        everything before it, by the same function the floor screen uses.{' '}
                        {data.sessions.filter((s) => s.verdict !== 'none').length} of{' '}
                        {data.sessions.length} carry a tag and the oldest does not, because there
                        was nothing before it. <b>There is no stored flag to disagree with.</b>
                      </p>
                    </div>

                    <div className="card" style={{ marginTop: 12 }}>
                      <div className="card__hd">
                        <h2 className="card__t">Her top set, written out</h2>
                      </div>
                      <div className="card__b">
                        <p className="seq">
                          {data.sequence.slice(-6).map((p, i, all) => (
                            <span key={`${p.value}-${i}`}>
                              {i > 0 ? ' → ' : ''}
                              {i === all.length - 1 ? <b>{p.value}</b> : p.value}
                            </span>
                          ))}{' '}
                          {data.logType === 'reps' ? 'reps' : 'kg'}
                        </p>
                        <p className="small" style={{ marginTop: 10 }}>
                          Written out, never charted. From a zero baseline a{' '}
                          {trim1(PLATE_STEP_KG)} kg week is two pixels; from a 50 kg baseline it is
                          everything. This is also what a coach says out loud.
                        </p>
                      </div>
                    </div>

                    <div className="card" style={{ marginTop: 12 }}>
                      <div className="card__hd">
                        <h2 className="card__t">Two things this layout keeps</h2>
                      </div>
                      <div className="card__b">
                        <p className="small">
                          <b className="ink">The same five columns as the log.</b> A trainer should
                          never have to learn a second layout for their own data, so the Previous
                          column is simply repurposed — here it carries the RPE, which is the one
                          thing worth keeping from a set that already happened.
                        </p>
                        <p className="small" style={{ marginTop: 9 }}>
                          <b className="ink">Sets stay in the order they happened.</b> Sessions run
                          newest first, but set 3 only means something after set 2 — and the tag is
                          on the set, not on the day.
                        </p>
                      </div>
                    </div>

                    <p className="small" style={{ marginTop: 12 }}>
                      A number typed wrong is two clicks from here. On a phone you would never find
                      it — which is the third thing this console is for.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
