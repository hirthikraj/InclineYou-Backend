'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';

import { addSet, finishWorkout, libraryAlternatives, savePause, saveSet, swapExercise } from '@/lib/portal/workout-actions';
import type { AltWire, FinishedWire, LogExerciseWire, LogWire, SetWire } from '@/lib/portal/workout-api';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { TextField } from '@/web-components/ui/Field';
import { Message } from '@/web-components/ui/Message';
import { Tag } from '@/web-components/ui/Tag';
import { Textarea } from '@/web-components/ui/Textarea';

import { RestTimer } from './RestTimer';
import { Summary } from './Summary';
import { clock, effortUnit, hasLoad, loadUnit, trim } from './units';

type Draft = { load: string; effort: string };
type Rest = { sxId: string; endsAt: number; seconds: number; label: string | null };

/** What a set starts as: what it already holds, else what was prescribed, else what the client did in the same place last time. */
function seed(e: LogExerciseWire, s: SetWire): Draft {
  const last = e.last?.sets[s.position - 1];
  return {
    load: trim(s.loadValue ?? s.target?.load ?? last?.loadValue ?? null),
    effort: trim(s.effortValue ?? s.target?.effort ?? last?.effortValue ?? null),
  };
}

function num(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * The player: the client's own workout, one tap per set (api-contract 1.2, pw-l2 and pw-a2…a6).
 *
 * Every set arrives pre-filled — from what was prescribed, or from last time — so the common case is one tap on ✓ and the uncommon one
 * is a correction. A tap is a small request the server keeps by target state, so a dropped connection costs a second tap, never a set:
 * the number stays on the screen until the server has it. The rest timer holds an END time, so a locked phone does not lose it. There is
 * no offline queue in this release (D-03) and the screen does not pretend there is one.
 */
export function Player({ log, trainerFirstName }: { log: LogWire; trainerFirstName: string }) {
  const sessionId = log.session.id;
  const [exs, setExs] = useState(log.exercises);
  const [totals, setTotals] = useState(log.totals);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(log.exercises.flatMap((e) => e.sets.map((s) => [s.id, seed(e, s)]))));
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bests, setBests] = useState<Set<string>>(() => new Set());
  const [rest, setRest] = useState<Rest | null>(null);
  const [swapFor, setSwapFor] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [pause, setPause] = useState<{ since: number | null; total: number }>({ since: null, total: log.session.pausedSeconds });
  const [finishing, setFinishing] = useState(false);
  const [effort, setEffort] = useState<'easy' | 'right' | 'hard' | null>(null);
  const [note, setNote] = useState('');
  const [finishError, setFinishError] = useState<string | null>(null);
  const [finished, setFinished] = useState<FinishedWire | null>(null);
  const [pendingFinish, startFinish] = useTransition();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (finished) return <Summary finished={finished} trainerFirstName={trainerFirstName} />;

  const pausedNow = pause.total + (pause.since ? (now - pause.since) / 1000 : 0);
  const elapsed = log.session.startedAt ? (now - log.session.startedAt) / 1000 - pausedNow : 0;

  function patchExercise(next: LogExerciseWire) {
    setExs((all) => all.map((e) => (e.id === next.id ? next : e)));
    setDrafts((d) => {
      const copy = { ...d };
      for (const s of next.sets) if (!copy[s.id]) copy[s.id] = seed(next, s);
      return copy;
    });
  }

  function replaceSet(sxId: string, updated: SetWire) {
    setExs((all) => all.map((e) => (e.id === sxId ? { ...e, sets: e.sets.map((s) => (s.id === updated.id ? updated : s)) } : e)));
  }

  async function markDone(e: LogExerciseWire, s: SetWire) {
    const d = drafts[s.id] ?? { load: '', effort: '' };
    const load = hasLoad(s.loadKind) ? num(d.load) : null;
    const eff = num(d.effort);
    if (Number.isNaN(load) || Number.isNaN(eff)) return setErrors((x) => ({ ...x, [s.id]: 'Enter numbers only.' }));
    setErrors((x) => ({ ...x, [s.id]: '' }));
    setBusy(s.id);
    const res = await saveSet(sessionId, s.id, { done: true, ...(load !== null ? { loadValue: load } : {}), ...(eff !== null ? { effortValue: eff } : {}) });
    setBusy(null);
    if (!res.ok) return setErrors((x) => ({ ...x, [s.id]: res.message }));
    replaceSet(e.id, res.value.set);
    setTotals(res.value.totals);
    setDrafts((x) => ({ ...x, [s.id]: { load: trim(res.value.set.loadValue), effort: trim(res.value.set.effortValue) } }));
    if (res.value.isBest) setBests((b) => new Set(b).add(s.id));
    const seconds = s.target?.restSeconds ?? 0;
    if (log.autoRestTimer && seconds > 0 && !s.doneAt) {
      const next = e.sets.find((o) => o.position > s.position && !o.doneAt);
      setRest({ sxId: e.id, endsAt: Date.now() + seconds * 1000, seconds, label: next ? `Set ${next.position} of ${e.name}` : null });
    }
  }

  async function addExtra(e: LogExerciseWire) {
    const last = e.sets[e.sets.length - 1];
    const d = last ? drafts[last.id] : undefined;
    const load = d && last && hasLoad(last.loadKind) ? num(d.load) : null;
    const eff = d ? num(d.effort) : null;
    if (eff === null && load === null) return setErrors((x) => ({ ...x, [e.id]: 'Enter what you did on the set above first — an extra set starts from it.' }));
    setErrors((x) => ({ ...x, [e.id]: '' }));
    setBusy(e.id);
    const res = await addSet(sessionId, e.id, { ...(load !== null && !Number.isNaN(load) ? { loadValue: load } : {}), ...(eff !== null && !Number.isNaN(eff) ? { effortValue: eff } : {}) });
    setBusy(null);
    if (!res.ok) return setErrors((x) => ({ ...x, [e.id]: res.message }));
    patchExercise({ ...e, sets: [...e.sets, res.value.set] });
    setDrafts((x) => ({ ...x, [res.value.set.id]: { load: trim(res.value.set.loadValue), effort: trim(res.value.set.effortValue) } }));
    setTotals(res.value.totals);
  }

  async function togglePause() {
    if (pause.since) {
      const total = pause.total + (Date.now() - pause.since) / 1000;
      setPause({ since: null, total });
      await savePause(sessionId, Math.round(total));
    } else {
      setPause({ since: Date.now(), total: pause.total });
    }
  }

  function finish() {
    setFinishError(null);
    const total = Math.round(pause.total + (pause.since ? (Date.now() - pause.since) / 1000 : 0));
    startFinish(async () => {
      const res = await finishWorkout(sessionId, { ...(effort ? { effort } : {}), ...(note.trim() ? { note: note.trim() } : {}), pausedSeconds: total });
      if (res.ok) setFinished(res.value);
      else setFinishError(res.message);
    });
  }

  return (
    <div className="pwk">
      <Card className="pwk__hero pwk__bar">
        <Card.Body>
          <div className="pwk__barrow">
            <div>
              <p className="pwk__k">{log.session.workout?.name ?? 'Workout'}</p>
              <p className="pwk__clock" role="timer" aria-label="Time elapsed">{clock(elapsed)}</p>
            </div>
            <div className="pwk__tot">
              <b>{totals.setsDone}</b>
              <span> of {totals.setsPlanned} sets</span>
              {totals.volumeKg > 0 && <span> · {trim(totals.volumeKg)} kg</span>}
            </div>
            <Button variant="secondary" size="sm" onClick={togglePause}>
              {pause.since ? 'Resume' : 'Pause'}
            </Button>
          </div>
          {pause.since && <Message tone="warn" className="mt3">Paused — the clock is stopped. Resume when you’re back at it.</Message>}
        </Card.Body>
      </Card>

      <ol className="pwk__list">
        {exs.map((e, i) => {
          const showSection = e.section && (i === 0 || exs[i - 1].section !== e.section);
          return (
            <li key={e.id}>
              {showSection && <p className="pwk__sect">{e.section}</p>}
              <ExerciseCard
                e={e}
                index={i}
                trainerFirstName={trainerFirstName}
                drafts={drafts}
                setDraft={(id, d) => setDrafts((x) => ({ ...x, [id]: d }))}
                busy={busy}
                errors={errors}
                bests={bests}
                onDone={markDone}
                onExtra={() => addExtra(e)}
                rest={rest?.sxId === e.id ? rest : null}
                onExtendRest={() => setRest((r) => (r ? { ...r, endsAt: r.endsAt + 15000, seconds: r.seconds + 15 } : r))}
                onDismissRest={() => setRest(null)}
                swapOpen={swapFor === e.id}
                onToggleSwap={() => setSwapFor((cur) => (cur === e.id ? null : e.id))}
                sessionId={sessionId}
                onSwapped={(next, t) => {
                  patchExercise(next);
                  setTotals(t);
                  setSwapFor(null);
                }}
              />
            </li>
          );
        })}
      </ol>

      <Card className="pwk__finish">
        <Card.Body>
          {!finishing ? (
            <Button variant="primary" size="lg" disabled={totals.setsDone === 0} onClick={() => setFinishing(true)}>
              Finish workout
            </Button>
          ) : (
            <>
              <h2 className="pwk__name">How did it feel?</h2>
              <div className="pwk__chips" role="group" aria-label="How did it feel">
                {(['easy', 'right', 'hard'] as const).map((v) => (
                  <Button key={v} variant={effort === v ? 'primary' : 'secondary'} size="sm" aria-pressed={effort === v} onClick={() => setEffort(effort === v ? null : v)}>
                    {v === 'right' ? 'Just right' : v === 'easy' ? 'Easy' : 'Hard'}
                  </Button>
                ))}
              </div>
              <Textarea label={`Anything ${trainerFirstName} should know?`} hint="Optional — a knee that was stiff, a day you were short on sleep." value={note} limit={1000} rows={3} onChange={(ev) => setNote(ev.target.value)} />
              <div aria-live="polite">{finishError ? <Message tone="err" className="mt3">{finishError}</Message> : null}</div>
              <div className="pwk__actions">
                <Button variant="primary" size="lg" disabled={pendingFinish} onClick={finish}>
                  {pendingFinish ? 'Finishing…' : 'Finish'}
                </Button>
                <Button variant="ghost" disabled={pendingFinish} onClick={() => setFinishing(false)}>
                  Keep going
                </Button>
              </div>
            </>
          )}
          {totals.setsDone === 0 && <p className="pwk__s" style={{ marginTop: 10 }}>Log a set to finish. <Link href="/me/today">Back to today</Link> leaves it here for later.</p>}
        </Card.Body>
      </Card>
    </div>
  );
}

function ExerciseCard({
  e, index, trainerFirstName, drafts, setDraft, busy, errors, bests, onDone, onExtra, rest, onExtendRest, onDismissRest, swapOpen, onToggleSwap, sessionId, onSwapped,
}: {
  e: LogExerciseWire;
  index: number;
  trainerFirstName: string;
  drafts: Record<string, Draft>;
  setDraft: (id: string, d: Draft) => void;
  busy: string | null;
  errors: Record<string, string>;
  bests: Set<string>;
  onDone: (e: LogExerciseWire, s: SetWire) => void;
  onExtra: () => void;
  rest: Rest | null;
  onExtendRest: () => void;
  onDismissRest: () => void;
  swapOpen: boolean;
  onToggleSwap: () => void;
  sessionId: string;
  onSwapped: (next: LogExerciseWire, totals: { setsDone: number; setsPlanned: number; volumeKg: number }) => void;
}) {
  return (
    <Card>
      <Card.Body>
        <div className="pwk__row">
          <span className="pwk__n" aria-hidden="true">{index + 1}</span>
          <div>
            <h2 className="pwk__name">{e.name}</h2>
            {e.swappedFrom && <p className="pwk__s">Swapped from {e.swappedFrom.name}</p>}
          </div>
          {e.groupId && <Tag>Superset</Tag>}
        </div>

        {e.cue && (
          <p className="pwk__cue">
            <b>{trainerFirstName} says</b> {e.cue}
          </p>
        )}
        {e.steps.length > 0 && (
          <details className="pwk__steps">
            <summary>How to do it</summary>
            <ol>{e.steps.map((s, k) => <li key={k}>{s}</li>)}</ol>
          </details>
        )}

        <ul className="pwk__sets">
          {e.sets.map((s) => {
            const d = drafts[s.id] ?? { load: '', effort: '' };
            const unit = loadUnit(s.loadKind);
            return (
              <li key={s.id} className={s.doneAt ? 'pwk__set pwk__set--done' : 'pwk__set'}>
                <span className="pwk__setn">{s.position}</span>
                {hasLoad(s.loadKind) && (
                  <TextField label={`Set ${s.position} ${unit ?? 'load'}`} hideLabel numeric inputMode="decimal" width={84} value={d.load} placeholder={unit ?? ''} onChange={(ev) => setDraft(s.id, { ...d, load: ev.target.value })} />
                )}
                {hasLoad(s.loadKind) && unit && <span className="pwk__unit">{unit}</span>}
                <TextField label={`Set ${s.position} ${effortUnit(s.effortKind)}`} hideLabel numeric inputMode="decimal" width={72} value={d.effort} placeholder={effortUnit(s.effortKind)} onChange={(ev) => setDraft(s.id, { ...d, effort: ev.target.value })} />
                <span className="pwk__unit">{effortUnit(s.effortKind)}</span>
                <Button variant={s.doneAt ? 'secondary' : 'primary'} size="sm" disabled={busy === s.id} onClick={() => onDone(e, s)} aria-label={s.doneAt ? `Update set ${s.position}` : `Log set ${s.position}`}>
                  {busy === s.id ? '…' : s.doneAt ? 'Update' : '✓'}
                </Button>
                {bests.has(s.id) && <Tag tone="pr">New best</Tag>}
                {!s.planned && <Tag>Extra</Tag>}
                {errors[s.id] ? <span className="pwk__err" role="alert">{errors[s.id]}</span> : null}
              </li>
            );
          })}
        </ul>

        {rest && <RestTimer endsAt={rest.endsAt} seconds={rest.seconds} nextLabel={rest.label} onExtend={onExtendRest} onDismiss={onDismissRest} />}
        {errors[e.id] ? <Message tone="err" className="mt3">{errors[e.id]}</Message> : null}

        <div className="pwk__actions">
          <Button variant="ghost" size="sm" disabled={busy === e.id} onClick={onExtra}>+ Add a set</Button>
          <Button variant="ghost" size="sm" aria-expanded={swapOpen} onClick={onToggleSwap}>Swap exercise</Button>
        </div>

        {swapOpen && <SwapPanel e={e} sessionId={sessionId} onSwapped={onSwapped} />}
      </Card.Body>
    </Card>
  );
}

/** The rack is busy: the trainer's own alternatives first, then the library (read only now, when the sheet opens). */
function SwapPanel({ e, sessionId, onSwapped }: { e: LogExerciseWire; sessionId: string; onSwapped: (next: LogExerciseWire, totals: { setsDone: number; setsPlanned: number; volumeKg: number }) => void }) {
  const [library, setLibrary] = useState<AltWire[] | null>(null);
  const [reason, setReason] = useState<'busy' | 'pain' | 'other'>('busy');
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    libraryAlternatives(e.exerciseId, sessionId).then((r) => {
      if (!live) return;
      if (r.ok) setLibrary(r.value);
      else setFailure(r.message);
    });
    return () => {
      live = false;
    };
  }, [e.exerciseId, sessionId]);

  function pick(a: AltWire) {
    setFailure(null);
    start(async () => {
      const res = await swapExercise(sessionId, e.id, { toExerciseId: a.exerciseId, source: a.source, reason });
      if (res.ok) onSwapped(res.value.exercise, res.value.totals);
      else setFailure(res.message);
    });
  }

  const approved = e.alternatives;
  return (
    <div className="pwk__swap">
      <div className="pwk__chips" role="group" aria-label="Why swap">
        {(['busy', 'pain', 'other'] as const).map((r) => (
          <Button key={r} variant={reason === r ? 'primary' : 'secondary'} size="sm" aria-pressed={reason === r} onClick={() => setReason(r)}>
            {r === 'busy' ? 'It’s busy' : r === 'pain' ? 'It hurts' : 'Something else'}
          </Button>
        ))}
      </div>
      <div aria-live="polite">{failure ? <Message tone="err" className="mt3">{failure}</Message> : null}</div>
      {approved.length > 0 && (
        <>
          <p className="pwk__k">Approved by your trainer</p>
          <ul className="pwk__alts2">
            {approved.map((a) => (
              <li key={a.exerciseId}><Button variant="secondary" size="sm" disabled={pending} onClick={() => pick(a)}>{a.name}</Button></li>
            ))}
          </ul>
        </>
      )}
      <p className="pwk__k">Other options for the same muscle</p>
      {library === null && !failure ? <p className="pwk__s">Looking…</p> : null}
      <ul className="pwk__alts2">
        {(library ?? []).filter((a) => !approved.some((x) => x.exerciseId === a.exerciseId)).map((a) => (
          <li key={a.exerciseId}>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => pick(a)}>
              {a.name}{a.equipment ? ` · ${a.equipment}` : ''}
            </Button>
          </li>
        ))}
      </ul>
      {e.swappedFrom && <p className="pwk__s">Sets already logged stay with {e.name}. Swap back to {e.swappedFrom.name} from the list above.</p>}
    </div>
  );
}
