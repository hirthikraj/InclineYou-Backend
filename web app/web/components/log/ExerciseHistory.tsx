'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import type { HistoryView } from '@/lib/log/log';
import { PLATE_STEP_KG, trim1, walkForward } from '@/lib/log/log';
import { updateSet } from '@/lib/sessionlog/actions';
import { TopBar } from '@/components/shell/TopBar';
import { Back, Chart, Note, Tick, Warn } from './Icons';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Tag } from '@/web-components/ui/Tag';
import { PageHeader } from '@/web-components/ui/PageHeader';
import { Why } from '@/web-components/ui/Why';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { ActionBar } from '@/web-components/ui/ActionBar';

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
 * 95 kg in a month they were benching 40. On a phone you would never find it. Here
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
/**
 * Whether this is the PHONE layout — `max-width:760px`, which is where the
 * design system reflows the set table and where a bar pinned to the bottom of
 * the window is still near the work rather than a long way from it.
 *
 * It is NOT "is the panel under the table": `.wk2--form` stacks at 1180, so
 * between the two the panel is below a long table and there is deliberately no
 * bar — `ui/ActionBar` is a touch component and its own note rules out a
 * 900px window. What this gates is the phone: the top-set band at the head of
 * the card, and the bar that carries the correction.
 *
 * Read in JS rather than drawn twice and hidden with CSS, which is what
 * `ui/ActionBar`'s own note asks for: a `role="group"` bar rendered in a
 * `display:none` subtree is a landmark announced twice, and the copy a reader
 * lands on is the one that is not there.
 *
 * `false` until mounted, which is also the right answer to render on the
 * server — the desk layout is the one that needs no bar.
 */
function usePhoneView(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width:760px)');
    const read = () => setPhone(mq.matches);
    read();
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  }, []);
  return phone;
}

export function ExerciseHistory({ data }: { data: HistoryView }) {
  const phoneView = usePhoneView();
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

  /**
   * WHAT MOVES, IN ONE LINE — the bar's sentence on a phone.
   *
   * It is a READING of `preview`, never a second computation of it: the panel
   * below the table and this sentence are the same object, so the bar cannot
   * say something the list disagrees with. When the number has not changed
   * there is nothing to say and the bar says so, which is the state the panel
   * spends a paragraph on.
   */
  const consequence = !preview
    ? 'Type a different number to see what moves'
    : preview.lost.length
      ? `${preview.lost[0].label.replace('Today · ', '')} loses its record`
      : preview.gained.length
        ? `${preview.gained.length} session${preview.gained.length === 1 ? '' : 's'} gain${preview.gained.length === 1 ? 's' : ''} a record`
        : 'The top-set line redraws';

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
      {/* The crumb is the section; the screen is one movement's whole history. */}
      <TopBar crumb="Clients" title={data.exerciseName} />
      <main className="main" id="main-content">
        <PageHeader
          /* `.ph--named` only when NOT correcting: `.top__title` says
             "Standing Calf Raise" and the resting `<h1>` says the same name
             plus "· every session", so at 390px it is 29px spent saying it
             twice. The editing headline is "Correcting a set from Fri 11 Sep",
             which the bar does NOT say and which is the only thing on the
             screen announcing the mode — so it keeps its heading. */
          className={editing ? 'ph--exh ph--exh-edit' : 'ph--exh ph--named'}
          title={editing ? `Correcting a set from ${editing.session.label.replace('Today · ', '')}` : `${data.exerciseName} · every session`}
          sub={editing
            ? `${data.clientName} · the reason this console exists`
            : `${data.clientName} · read-only · every record re-judged on open`}
          crumbs={<nav className="crumbs" aria-label="Breadcrumb">
              <Link href="/clients">Clients</Link>
              <i aria-hidden="true">/</i>
              <Link href={`/clients/${data.clientId}`}>{data.clientName}</Link>
              <i aria-hidden="true">/</i>
              <b>{data.exerciseName}</b>
            </nav>}
          actions={editing ? (
              <>
                <Button variant="ghost" onClick={() => goEdit(null)}>
                  Cancel
                </Button>
                <Button variant="primary" disabled={busy} onClick={save}>
                  {busy ? 'Saving…' : 'Save the correction'}
                </Button>
              </>
            ) : (
              <>
                <Button href={`/clients/${data.clientId}/progress`} variant="secondary">
                  <Chart /> Progress
                </Button>
                {/* Hidden below 900px by `.ph--exh .exh__file`: the
                    `.crumbs` directly above this row already links the client
                    file, and two doors to one room is 34px of a 390px header. */}
                <Button
                  href={`/clients/${data.clientId}`}
                  variant="secondary"
                  className="exh__file"
                >
                  <Back /> Client file
                </Button>
              </>
            )}
        />

        <div className="body">
          {data.sessions.length === 0 ? (
            <EmptyState
              title={<>{data.clientName.split(" ")[0]} has never logged {data.exerciseName.toLowerCase()}</>}
              body="Nothing to walk forward, so nothing to judge. The first log is never a record: it is the number to beat."
            />
          ) : (
            <div
              className={['wk2', 'wk2--form', editing ? 'wk2--editing' : null]
                .filter(Boolean)
                .join(' ')}
              style={{ maxWidth: 1140 }}
            >
              <Card
                title={<>{data.exerciseName}
                    {editing ? ` · ${editing.session.label.replace('Today · ', '')}` : ''}</>}
                aside={<>{editing ? <Tag tone="warn">Correcting</Tag> : null}
                  <span className="small mono" style={{ marginLeft: 'auto' }}>
                    {data.clientName} · {data.sessions.length} session
                    {data.sessions.length === 1 ? '' : 's'} shown
                  </span></>}
                flush
              >
                {/* THE SEQUENCE, ABOVE THE TABLE, ON THE PHONE ONLY.
                    "The top set, written out" is the one line on this screen
                    that answers *how is this movement going* — and it lives in
                    the argument column, which below 760px lands after 2,629px
                    of table. A trainer opening this on a phone scrolled eight
                    sessions to reach the summary of the eight sessions.

                    Rendered here INSTEAD of there rather than as well as: the
                    same `.seq` markup in the same `Card`, one copy per view,
                    so neither layout repeats itself and the desk is untouched.
                    `Card.Band` and not a second `Card.Head` — the table below
                    is the body and this owes the card the same left edge,
                    which is what the band is for. */}
                {phoneView ? (
                  <Card.Band className="exh__top">
                    <span className="micro">Top set, written out</span>
                    <p className="seq">
                      {data.sequence.slice(-6).map((point, i, all) => (
                        <span key={`${point.value}-${i}`}>
                          {i > 0 ? ' → ' : ''}
                          {i === all.length - 1 ? <b>{point.value}</b> : point.value}
                        </span>
                      ))}{' '}
                      {data.logType === 'reps' ? 'reps' : 'kg'}
                    </p>
                  </Card.Band>
                ) : null}

                <table className="sets sets--entry sets--hist" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th className="n"><span className="vh">Set</span></th>
                      <th className="prev">RPE</th>
                      <th className="num">{data.logType === 'reps' ? 'Load' : 'Load kg'}</th>
                      <th className="num">Reps</th>
                      {/* TWO HEADS, NOT ONE WITH colSpan={2}. The span covered
                          the slack AND the verb, so neither column could be
                          given a width — every cap landed on the pair and the
                          auto algorithm went on handing the surplus to the
                          numbers. Split, they are addressable, and the file
                          already records what a colSpan wider than the tracks
                          a row can pay for does to this table. */}
                      <th className="slack" />
                      <th className="tick"><span className="vh">Correct</span></th>
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
                              <Tag tone="pr">Record</Tag>
                            ) : session.verdict === 'quiet' ? (
                              <Tag tone="pr">Record · quiet</Tag>
                            ) : session.verdict === 'matched' ? (
                              <Tag>Matched</Tag>
                            ) : session.verdict === 'first' ? (
                              <Tag tone="info">First time</Tag>
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
                            {/* `data-empty` and not a class, because it is a
                                fact about the cell rather than a style: below
                                620px the phone sets the load and the reps as
                                one figure — `72.5 × 15` — and a duration or
                                bodyweight set has no load, so "— × 15" would
                                read as a number that failed to load. The DS
                                drops the cell and the × with it, per ROW. */}
                            <td className="num" data-empty={set.load === '—' || undefined}>
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
                                <span className="tnum">{set.load}</span>
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
                                <span className="tnum">{set.reps}</span>
                              )}
                            </td>
                            <td />
                            <td className="tick">
                              {isEdited ? (
                                <span className="tk tk--on" aria-hidden="true"><Tick /></span>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => goEdit(set.setId)}
                                >
                                  Correct
                                </Button>
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
              </Card>

              <div>
                {editing ? (
                  <>
                    <Why heading="Change it, and every session after it fixes itself">
                      <p>
                        There is <b>no stored record anywhere in this codebase</b>. A record is
                        computed on read, every read — so correcting this one set removes the gold
                        from {editing.session.label.replace('Today · ', '')} <i>and</i> re-judges
                        every session after it in the same frame. A stored PR would be a second copy
                        of the truth, and second copies drift.
                      </p>
                    </Why>

                    <p className="micro" style={{ margin: '16px 0 8px' }}>
                      {preview ? 'What moves when you save' : 'Type a different number to see what moves'}
                    </p>

                    {preview ? (
                      <Card flush>
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
                                {preview.gained.length === 1 ? '' : 's'} gain
                                {preview.gained.length === 1 ? 's' : ''} a record
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
                            <span className="q__t">The top-set line redraws</span>
                            <span className="q__s">
                              {preview.sequence.slice(-5).map((p) => p.value).join(' → ')}
                              {data.logType === 'reps' ? ' reps' : ' kg'}
                            </span>
                          </span>
                        </div>
                        <div className="q">
                          <span className="q__ic"><Note size={14} /></span>
                          <span className="q__m">
                            <span className="q__t">Nothing is sent to the client</span>
                            <span className="q__s">a record un-made is not news</span>
                          </span>
                        </div>
                      </Card>
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
                    <Why heading="Judged at the time, not tagged">
                      <p>
                        The history is walked <b>forward</b> and each session judged against
                        everything before it, by the same function the floor screen uses.{' '}
                        {data.sessions.filter((s) => s.verdict !== 'none').length} of{' '}
                        {data.sessions.length} carry a tag and the oldest does not, because there
                        was nothing before it. <b>There is no stored flag to disagree with.</b>
                      </p>
                    </Why>

                    {/* The phone drew this as a `Card.Band` at the head of the
                        table above, where it is read rather than scrolled past.
                        One copy per view. */}
                    <Card
                      title="The top set, written out"
                      style={{ marginTop: 12, display: phoneView ? 'none' : undefined }}
                    >
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
                    </Card>

                    <Card
                      title="Two things this layout keeps"
                      style={{ marginTop: 12 }}
                    >
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
                    </Card>

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

        {/* ── THE VERB, IN THE THUMB'S ARC ─────────────────────────────────
            MEASURED at 390x844 while correcting: *Save the correction* sits in
            `.ph__acts` at the top of the screen, the field it commits is in a
            row 600px down, and the panel that says what the save DOES is at
            y=2,958 — 2,780px below the fold, behind the whole table. So the
            frame this route exists for was, on a phone, a button you scroll
            away from, a field you cannot see it from, and a consequence you
            never reach.

            The bar carries both halves: the sentence is the same `preview`
            object the panel below renders, and the two verbs clear 44px
            because `.abar__acts>.btn` makes them. The panel stays where it is
            for the detail — this is the summary, not a replacement.

            Rendered only when the phone layout is live, per `ActionBar`'s own
            note: two copies of a `role="group"` landmark, one of them in a
            hidden subtree, is a bar announced twice. */}
        {editing && phoneView ? (
          <ActionBar
            tone={preview ? 'accent' : undefined}
            label="Correcting a set"
          >
            <ActionBar.Text>{consequence}</ActionBar.Text>
            <ActionBar.Acts>
              <Button variant="ghost" onClick={() => goEdit(null)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={busy} onClick={save}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </ActionBar.Acts>
          </ActionBar>
        ) : null}
      </main>
    </>
  );
}
