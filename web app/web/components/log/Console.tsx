'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import type { ConsoleData } from '@/lib/log/api';
import type { LogExerciseView, LogSetRow } from '@/lib/log/log';
import { floorTime, stampDate } from '@/lib/log/log';
import { addExercise, deleteSet, logSet, setRest, swapExercise, updateSet } from '@/lib/log/actions';
import type { SwapScope } from '@/lib/log/result';
import { UNDO_SECONDS } from '@/lib/log/result';
import { TopBar } from '@/components/shell/TopBar';
import { AddPanel } from './AddPanel';
import { ExerciseList } from './ExerciseList';
import { ExerciseTimeline, HistorySheet, RecordCard } from './RecordCard';
import { FinishLog } from './FinishLog';
import { Chart, Dots, Info, Tick, Warn } from './Icons';
import { Keys } from './Keys';
import { SetGrid, draftKey, readDraft, type Draft } from './SetGrid';
import { SetPanel } from './SetPanel';
import { SwapModal } from './SwapModal';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Chip } from '@/web-components/ui/Chip';
import { Strip } from '@/web-components/ui/Strip';
import { PageHeader } from '@/web-components/ui/PageHeader';
import { Why } from '@/web-components/ui/Why';

/**
 * THE WORKOUT CONSOLE — THE DESK HALF OF A FLOOR SCREEN.
 *
 * Nothing here replaces the phone at the squat rack. A trainer is not carrying a
 * laptop to a rack, and the 56px thumb targets in the app exist because the
 * thumb is sweaty, the phone is on a rack and nobody is looking at the screen.
 * What the desk adds is three things the phone cannot do, and this screen is
 * arranged around them:
 *
 *   · **The history beside the entry.** Twelve weeks of top sets while you type
 *     today's load. On a 390px screen that is a different screen.
 *   · **Catching up a session logged on paper.** Four clients between six and
 *     nine, a notebook, and half an hour at nine — a keyboard beats a stepper by
 *     an order of magnitude for twelve sets.
 *   · **Correcting the past.** `/clients/:id/exercises/:exerciseId?edit=` is
 *     where that lives, and it is the reason this console exists.
 *
 * And one thing it must NOT do: become the place logging happens. The five
 * columns, the Previous column, the tick, the per-exercise rest and the four
 * verdicts are all the phone's design, ported.
 *
 * ── A MODE, NOT A TAB ───────────────────────────────────────────────────────
 *
 * On the phone the log takes the whole screen: no tab bar, no drawer, because
 * mid-session there is nowhere else to be. A browser has its own chrome and the
 * rail is how a trainer gets to the next client, so the console keeps the rail
 * and earns the same focus a different way — the strip pins four figures at the
 * top, the accelerator bar pins the shortcuts at the bottom, and nothing in
 * between competes with the grid.
 *
 * ── WHAT IS IN THE URL, AND WHAT IS NOT ─────────────────────────────────────
 *
 * *A place gets a URL, a moment does not.* A session is a place; an open set
 * panel is a moment — but **the exercise in focus is a place**, because a
 * trainer with a half-typed row and an accidental reload should land back on it.
 * So `?ex=` is in the URL and the drafts are not, which is the honest split: a
 * half-typed row survives a scroll and does not survive leaving the session.
 *
 * `?plus=` used to be there too, holding every card added to today's grid that
 * had no set in it yet — not because a card is a place, but because
 * `workout_exercise` had no REST route and the URL was the only thing that could
 * hold one. It is a row on the server now, so it survives a reload on any
 * device rather than in one tab.
 *
 * ── AND THERE IS NO SYNC CHROME ANYWHERE ────────────────────────────────────
 *
 * Frame 6a draws an offline banner, a six-row waiting card and an amber ring on
 * a set this machine wrote. **None of it is built.** The web half is online-only
 * (`AGENTS.md`, 23 Aug 2026): a tick is a `POST` and it either happened or it
 * did not, so a ring meaning "on this computer" could never be true. A failed
 * write is reported in the row that failed, which is a stronger promise than a
 * pill in a corner.
 */

const REST_CHOICES = [30, 45, 60, 90, 120, 180];

/** A slot the trainer asked for that the plan did not. */
function withExtraSlots(view: LogExerciseView, extra: number): LogExerciseView {
  if (extra <= 0) return view;
  const sets = [...view.sets];
  const from = sets.length;
  for (let i = 1; i <= extra; i += 1) {
    const previous = sets[from - 1];
    sets.push({
      number: from + i,
      setId: null,
      previous: previous?.previous ?? null,
      previousLoad: previous?.previousLoad ?? null,
      previousReps: previous?.previousReps ?? null,
      load: '',
      reps: '',
      rpe: null,
      note: null,
      done: false,
      pr: false,
    });
  }
  return { ...view, sets, complete: false };
}

/**
 * A rest that is running.
 *
 * `endsAt` is wall-clock, not a decrementing counter, for the reason the phone
 * keeps it that way (`app/src/screens/main/log/LogScreen.tsx`): a browser
 * throttles `setInterval` in a background tab, and a trainer who switches to
 * WhatsApp for forty seconds must come back to a clock that spent them. A
 * counter would come back owing the time. This one is derived from the clock
 * every tick, so it is right on arrival rather than right eventually.
 */
interface Rest {
  exerciseId: string;
  /** What it started at — the bar's denominator. */
  total: number;
  /** Epoch ms. */
  endsAt: number;
  /**
   * It ran out, and the trainer has not answered it yet.
   *
   * The rest used to vanish at zero, which is what the phone does — and on a
   * phone that is right, because the phone is in your hand and you were
   * watching it. At a desk the trainer is looking at the client, and a clock
   * that deletes itself the moment it matters tells nobody anything. So zero
   * is a STATE, not an ending: the strip says the rest is over and which set
   * is up, and stays saying it until the next tick replaces it or the trainer
   * clears it.
   */
  over: boolean;
}

interface Deleted {
  exerciseId: string;
  setNumber: number;
  loadKg: number | null;
  reps: number | null;
  rpe: number | null;
  notes: string | null;
  at: number;
}

export function Console({ data }: { data: ConsoleData }) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const { view } = data;
  const exercises = view.exercises;

  const current =
    params.get('ex') && exercises.some((e) => e.exerciseId === params.get('ex'))
      ? (params.get('ex') as string)
      : exercises.find((e) => !e.complete)?.exerciseId ?? exercises[0]?.exerciseId ?? null;

  const open = exercises.find((e) => e.exerciseId === current) ?? null;

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<Record<string, number>>({});
  const [deleted, setDeleted] = useState<Deleted | null>(null);
  const [restFor, setRestFor] = useState<string | null>(null);
  const [rest, setRunningRest] = useState<Rest | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [panelMessage, setPanelMessage] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(undoTimer.current), []);

  /* ── the rest clock ─────────────────────────────────────────────────────
     One interval, and only while a rest is actually running — an idle console
     with twelve tabs behind it does not get a heartbeat it has no use for.

     It ticks at 250ms rather than 1000 and reads `Date.now()` each time, which
     is two things: a `+15` shows in the digits at once instead of up to a
     second later, and a tab that was throttled catches up on its first tick
     back rather than counting the missed seconds out one by one. */
  useEffect(() => {
    if (!rest || rest.over) return;
    const tick = () => {
      const left = Math.max(0, Math.round((rest.endsAt - Date.now()) / 1000));
      setRemaining(left);
      // Zero flips the state, which re-runs this effect and lets it return
      // early — so the interval stops the moment there is nothing to count.
      if (left === 0) setRunningRest((r) => (r && !r.over ? { ...r, over: true } : r));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [rest]);

  /**
   * Rest starts on the tick, and only on a tick that logged something new.
   *
   * Editing set 2 at nine in the evening — the catch-up case this console
   * exists for — must not start a 90-second clock for a set that was lifted
   * three hours ago. `commit` calls this only where `logSet` ran, never where
   * `updateSet` did.
   *
   * An exercise with no rest set starts nothing, and the strip goes on saying
   * so. That is the phone's rule (`LogScreen.tsx` · `startRest`) and the honest
   * one: the trainer has not told us how long, and 60 seconds is a guess we
   * would then have to defend.
   */
  const startRest = useCallback((exercise: LogExerciseView | undefined) => {
    if (!exercise?.restSeconds) return;
    setRemaining(exercise.restSeconds);
    setRunningRest({
      exerciseId: exercise.exerciseId,
      total: exercise.restSeconds,
      endsAt: Date.now() + exercise.restSeconds * 1000,
      over: false,
    });
  }, []);

  /**
   * −15 / +15, which is the control the rest clock is actually used with.
   *
   * The seconds move the end, not a counter, so the arithmetic stays in one
   * unit. Taking it below now is a skip and is allowed to be: the trainer
   * pressed −15 twice because the client is already back under the bar.
   */
  const adjustRest = useCallback((delta: number) => {
    setRunningRest((r) => {
      if (!r) return r;
      /* Asking for more once it is over means fifteen seconds from NOW. The
         end is already in the past and going further into it while the note
         sits on screen, so adding to it would buy a few seconds or none
         depending on how long the trainer took to press. */
      const endsAt = (r.over ? Date.now() : r.endsAt) + delta * 1000;
      const left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setRemaining(left);
      return { ...r, endsAt, over: left === 0 };
    });
  }, []);

  /* ── the URL, written in one place ─────────────────────────────────────── */
  const go = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(`/sessions/${data.routeId}/log${query ? `?${query}` : ''}`, { scroll: false });
    },
    [params, router, data.routeId],
  );

  const mark = (key: string, on: boolean) =>
    setBusy((held) => {
      const next = new Set(held);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const say = (key: string, message: string | null) =>
    setErrors((held) => {
      const next = { ...held };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });

  /* ── one set ───────────────────────────────────────────────────────────── */

  const commit = useCallback(
    (exerciseId: string, row: LogSetRow, values: Draft) => {
      const key = draftKey(exerciseId, row.number);
      const exercise = exercises.find((e) => e.exerciseId === exerciseId);
      const { loadKg, reps, rpe } = readDraft(row, values, true);

      // A set with nothing in it is not a set. The row keeps its slot and says
      // so, rather than posting a blank the history would have to explain.
      if (reps == null && loadKg == null) {
        say(key, 'Put a number in the row before ticking it.');
        return;
      }

      say(key, null);
      mark(key, true);
      startTransition(async () => {
        const payload = {
          routeId: data.routeId,
          workoutId: view.workoutId,
          exerciseId,
          setNumber: row.number,
          loadKg: exercise?.logType === 'reps' ? null : loadKg,
          reps,
          rpe,
          notes: row.note,
        };
        const result = row.setId
          ? await updateSet({ ...payload, setId: row.setId, clientId: view.clientId })
          : await logSet(payload);
        mark(key, false);
        if (!result.ok) {
          say(key, result.message);
          return;
        }
        setDrafts((held) => {
          const next = { ...held };
          delete next[key];
          return next;
        });
        /* A new set was logged, so the rest begins — not on an edit to one that
           already existed, which `row.setId` is exactly the test for. */
        if (!row.setId) startRest(exercise);
        router.refresh();
      });
    },
    [exercises, data.routeId, view.workoutId, view.clientId, router, startRest],
  );

  const remove = useCallback(
    (exerciseId: string, row: LogSetRow) => {
      if (!row.setId) return;
      const key = draftKey(exerciseId, row.number);
      mark(key, true);
      startTransition(async () => {
        const result = await deleteSet({
          routeId: data.routeId,
          workoutId: view.workoutId,
          setId: row.setId as string,
        });
        mark(key, false);
        if (!result.ok) {
          say(key, result.message);
          return;
        }
        // Un-ticking takes the rest with it. The set that started the clock
        // no longer exists, so neither does the reason to be counting.
        setRunningRest((r) => (r?.exerciseId === exerciseId ? null : r));
        // Undo after, never confirm before. The row is already gone from the
        // server; Undo writes it back rather than cancelling anything.
        setDeleted({
          exerciseId,
          setNumber: row.number,
          loadKg: row.load ? Number(row.load) : null,
          reps: row.reps ? Number(row.reps) : null,
          rpe: row.rpe,
          notes: row.note,
          at: Date.now(),
        });
        clearTimeout(undoTimer.current);
        undoTimer.current = setTimeout(() => setDeleted(null), UNDO_SECONDS * 1000);
        router.refresh();
      });
    },
    [data.routeId, view.workoutId, router],
  );

  const undo = useCallback(() => {
    if (!deleted) return;
    const held = deleted;
    setDeleted(null);
    clearTimeout(undoTimer.current);
    startTransition(async () => {
      await logSet({
        routeId: data.routeId,
        workoutId: view.workoutId,
        exerciseId: held.exerciseId,
        setNumber: held.setNumber,
        loadKg: held.loadKg,
        reps: held.reps,
        rpe: held.rpe,
        notes: held.notes,
      });
      router.refresh();
    });
  }, [deleted, data.routeId, view.workoutId, router]);

  /* ⌘Z is undo and nothing else — NN/g's do-not-override rule, and the only
     thing on this screen with anything to undo is the delete. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && deleted) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleted, undo]);

  /* ── panels ────────────────────────────────────────────────────────────── */

  const setNumber = Number(params.get('set') ?? '');
  const panelRow =
    open && Number.isFinite(setNumber)
      ? withExtraSlots(open, extra[open.exerciseId] ?? 0).sets.find((s) => s.number === setNumber) ?? null
      : null;

  const addOpen = params.get('add') === '1';
  const swapFor = params.get('swap');
  const swapView = exercises.find((e) => e.exerciseId === swapFor) ?? null;

  /* `?hist=` is the exercise whose history is open as a sheet. In the URL for
     the same reason `?set=`, `?add=` and `?swap=` are: it is one of this
     screen's four panels, and this screen keeps its panels addressable. It
     carries the exercise id rather than a `1` because the sheet names an
     exercise and `?ex=` can change under it. */
  const histFor = params.get('hist');
  const histView = exercises.find((e) => e.exerciseId === histFor) ?? null;

  /**
   * One card, in the shape the write takes.
   *
   * `POST /v1/workouts/{id}/exercises` is an upsert and REPLACES the row's
   * fields, so a call that only meant to change the rest would clear the
   * targets. Every caller here sends the whole card, and this is the one place
   * that builds it — the same rule `updateSet` follows for the same reason.
   */
  const cardOf = useCallback((e: LogExerciseView) => ({
    orderIndex: e.orderIndex,
    source: (e.unplanned ? 'unplanned' : 'planned') as 'planned' | 'unplanned',
    targetSets: e.targetSets,
    targetReps: e.targetReps,
    restSeconds: e.restSeconds,
    /* Carried, not re-derived. Dropping it would erase a swap the first time
       somebody set a rest on the card that recorded it. */
    swappedFromExerciseId: e.swappedFromExerciseId,
  }), []);

  /**
   * Frame 3a's pick — a real row now, not a query parameter.
   *
   * It used to append `?plus=`, because `workout_exercise` had no REST route and
   * a card with no sets in it had nowhere to live. The card existed in one
   * browser tab and nowhere else, so a reload lost it. Now it is written, and
   * `?ex=` still moves focus to it because that is a place and places get URLs.
   *
   * Ordered last, which is where an exercise added mid-session belongs: the
   * trainer reached for it after everything already on the card.
   */
  const pickAdded = useCallback((exerciseId: string) => {
    const orderIndex = exercises.reduce((max, e) => Math.max(max, e.orderIndex), -1) + 1;
    startTransition(async () => {
      await addExercise({
        routeId: data.routeId,
        workoutId: view.workoutId,
        exerciseId,
        orderIndex,
      });
      router.refresh();
    });
    const next = new URLSearchParams(params.toString());
    next.delete('add');
    next.set('ex', exerciseId);
    router.replace(`/sessions/${data.routeId}/log?${next.toString()}`, { scroll: false });
  }, [exercises, data.routeId, view.workoutId, params, router, startTransition]);

  /* ── the strip ─────────────────────────────────────────────────────────── */

  const crumb = `${view.clientName} · ${stampDate(view.sessionDate)}`;

  return (
    <>
      <TopBar
        crumb="Sessions"
        /* Six screens in this flow pass the crumb *Sessions* — it names the
           flow, and it is the wrong thing for a 390px header to say when the
           one fact the trainer needs at the top is whose session this is.
           `screenTitle` would derive *Sessions* from it, so the title is
           stated. The `<h1>` under it keeps the plan head the bar has no room
           for, which is why these screens are not `.ph--named`. */
        title={view.clientName}
      />

      <main className="main" id="main-content">
        <PageHeader
          title={<>{view.clientName}
            {view.planHead ? <> &middot; {view.planHead}</> : null}</>}
          sub={<>{/* The program is the second half of the `h1` directly above.
                Below 620px it stands down, and what is left is the week and
                the state — which nothing else on this screen says. */}
            {view.plan ? <span className="ph__prog">{view.plan} &middot; </span> : null}
            {view.endedAt ? (
              'logged, closed'
            ) : (
              <>
                {/* The tail clause is an explainer and stands down below
                    620px. MEASURED, it wraps the subtitle to two lines at
                    the 360 floor — 19px of a 640px screen, spent on a
                    sentence a trainer reads once, on the state they are in
                    while logging. The state word stays. */}
                logging here<span className="ph__hint">, saved on the server as you go</span>
              </>
            )}</>}
          crumbs={<nav className="crumbs" aria-label="Breadcrumb">
              <Link href="/programs/workouts">Workouts</Link>
              <i aria-hidden="true">/</i>
              <b>{crumb}</b>
            </nav>}
          actions={<>{/* The label is CLIPPED below 620px, not dropped — `.omni`'s rule
                and the bug that taught it: `display:none` takes an element out
                of the accessibility tree too, and this span is the link's only
                text and therefore its accessible name. The sixth control in
                this shell to need clipped-not-dropped. */}
            <Button href={`/clients/${view.clientId}/progress`} variant="secondary" className="ph__hist">
              <Chart /> <span className="ph__histl">Client history</span>
            </Button>
            <Button
              href={`/clients/${view.clientId}`}
              variant="secondary"
              iconOnly
              label="Client file"
              title="Client file"
              icon={<Dots />}
            />
            <FinishLog routeId={data.routeId} workoutId={view.workoutId} /></>}
          className="ph--log"
        />

        <div className="body">
          {deleted ? (
            <div className="bulk bulk--done" style={{ margin: '-20px -24px 12px' }} role="status">
              <Tick />
              Set {deleted.setNumber} deleted.
              <span className="bulk__acts">
                <Button variant="secondary" size="sm" onClick={undo}>
                  Undo
                </Button>
              </span>
            </div>
          ) : null}

          {/* Four figures, and none of them is a streak, a score or a completion
              percentage — Harley's vanity metrics, 2019. Sets, kilos, minutes,
              and a pack that has NOT moved, which is status about something that
              did not happen and the harder kind to remember to show.

              `c-strip` rather than the hand-written `.strip` markup this band
              was: the class had no component and five screens each wrote it
              out, two of them disagreeing about the size of a denominator in
              an inline style. See `ui/Strip.tsx`.

              THE MINUTES ARE `floorTime`'d. A live log is not closed the
              minute the client leaves, so this is routinely in the hundreds —
              it read **349 min** here, which is a figure a reader converts
              rather than glances at. */}
          <Strip className="log-strip">
            <Strip.Cell value={view.setsLogged} of={view.setsPlanned} label="sets logged" />
            <Strip.Cell value={view.volumeKg.toLocaleString('en-IN')} unit="kg" label="moved" />
            {view.minutes === null ? (
              <Strip.Cell value="—" label="left open" />
            ) : (
              <Strip.Cell {...floorTime(view.minutes)} label="on the floor" />
            )}
            {data.pack ? (
              <Strip.Cell
                value={data.pack.remaining}
                of={data.pack.total}
                label="pack, unchanged"
              />
            ) : (
              <Strip.Cell value="—" label="no session pack" />
            )}
          </Strip>

          {view.emptyPlan ? (
            <EmptyPlan data={data} onAdd={() => go({ add: '1' })} />
          ) : (
            /* `.wkcw` exists ONLY to be a container query's container — a grid
               cannot query its own inline size to decide its own tracks, and
               what has to be measured is the width `.wkc` actually gets, which
               the rail's expanded/minimised state moves by 184px at one
               viewport width. `app.css` carries the arithmetic. */
            <div className="wkcw">
            <div className="wkc">
              <ExerciseList
                exercises={exercises}
                planLabel={`${view.planHead ?? 'Today'} · ${exercises.length} exercise${exercises.length === 1 ? '' : 's'}`}
                current={current}
                onOpen={(exerciseId) => go({ ex: exerciseId, set: null })}
                onAdd={() => go({ add: '1' })}
              />

              {open ? (
                <SetGrid
                  view={withExtraSlots(open, extra[open.exerciseId] ?? 0)}
                  drafts={drafts}
                  onDraft={(key, patch) =>
                    setDrafts((held) => ({ ...held, [key]: { ...held[key], ...patch } }))
                  }
                  busy={busy}
                  error={errors}
                  /* Always, now. An off-plan card keeps its rest on its own
                     `workout_exercise` row — V13 put the column there for
                     exactly that — so there is no longer a card the control
                     would not persist for. `actions.setRest` picks which of the
                     two rows the write lands on. */
                  restEditable
                  restScope={data.programId !== null && !open.unplanned ? 'program' : 'today'}
                  /* Only this card's. A rest belongs to the exercise that
                     started it, so opening another one does not inherit its
                     clock — and does not stop it either, because the trainer
                     reading ahead is not the trainer finishing the rest. */
                  rest={
                    rest && rest.exerciseId === open.exerciseId
                      ? { total: rest.total, remaining, over: rest.over }
                      : null
                  }
                  onAdjustRest={adjustRest}
                  onSkipRest={() => setRunningRest(null)}
                  /* The next card with a slot still open, for the thumb dock —
                     and it is `!complete` rather than the one after this in the
                     list, because a trainer who jumped back to fix set 2 of
                     bench does not want *Next · bench* underneath them. Null
                     when this is the last unfinished card, and the dock draws
                     nothing rather than a control that goes nowhere; `Finish
                     the log` is in the header, which is where a session ends. */
                  next={(() => {
                    const after = exercises.find(
                      (e) => !e.complete && e.exerciseId !== open.exerciseId,
                    );
                    return after
                      ? {
                          name: after.name,
                          onOpen: () => go({ ex: after.exerciseId, set: null }),
                        }
                      : null;
                  })()}
                  handlers={{
                    commit,
                    remove,
                    openSet: (exerciseId, n) => go({ ex: exerciseId, set: String(n) }),
                    openSwap: (exerciseId) => go({ ex: exerciseId, swap: exerciseId }),
                    openHistory: (exerciseId) => go({ ex: exerciseId, hist: exerciseId }),
                    addSlot: (exerciseId) =>
                      setExtra((held) => ({ ...held, [exerciseId]: (held[exerciseId] ?? 0) + 1 })),
                    changeRest: (exerciseId) => setRestFor(exerciseId),
                  }}
                />
              ) : (
                <Card>
                  <p className="small">Pick an exercise on the left, or add one.</p>
                </Card>
              )}

              <div>
                {view.records.length ? <RecordCard card={view.records[0]} /> : null}
                {open ? (
                  <ExerciseTimeline
                    name={open.name}
                    clientId={view.clientId}
                    exerciseId={open.exerciseId}
                    sessions={(data.timelines[open.exerciseId] ?? []).filter((s) => !s.today)}
                  />
                ) : null}
                {view.records.length > 1 ? (
                  <p className="small" style={{ marginTop: 10 }}>
                    <Link href={`/sessions/${data.routeId}/bests`}>
                      {view.records.length} records today
                    </Link>{' '}
                    — {view.records.filter((r) => r.announced).length} worth sending.
                  </p>
                ) : null}
              </div>
            </div>
            </div>
          )}
        </div>

        <Keys undoable={deleted !== null} />
      </main>

      {panelRow && open ? (
        <SetPanel
          view={open}
          row={panelRow}
          busy={busy.has(draftKey(open.exerciseId, panelRow.number))}
          message={panelMessage}
          onClose={() => { setPanelMessage(null); go({ set: null }); }}
          onDelete={() => { remove(open.exerciseId, panelRow); go({ set: null }); }}
          onSave={(values) => {
            const key = draftKey(open.exerciseId, panelRow.number);
            setPanelMessage(null);
            mark(key, true);
            startTransition(async () => {
              const payload = {
                routeId: data.routeId,
                workoutId: view.workoutId,
                exerciseId: open.exerciseId,
                setNumber: panelRow.number,
                loadKg: values.loadKg,
                reps: values.reps,
                rpe: values.rpe,
                notes: values.notes,
              };
              const result = panelRow.setId
                ? await updateSet({ ...payload, setId: panelRow.setId, clientId: view.clientId })
                : await logSet(payload);
              mark(key, false);
              if (!result.ok) {
                setPanelMessage(result.message);
                return;
              }
              go({ set: null });
              router.refresh();
            });
          }}
        />
      ) : null}

      {histView ? (
        <HistorySheet
          name={histView.name}
          clientId={view.clientId}
          exerciseId={histView.exerciseId}
          /* `!s.today` for the same reason the third column filters it: today's
             sets are the table behind the sheet, and a session that prints its
             own rows back at itself is an echo rather than a comparison. */
          sessions={(data.timelines[histView.exerciseId] ?? []).filter((s) => !s.today)}
          card={view.records.find((r) => r.exerciseId === histView.exerciseId) ?? null}
          onClose={() => go({ hist: null })}
        />
      ) : null}

      {addOpen ? (
        <AddPanel
          recents={data.recents}
          library={data.library}
          /* Every added card is in `exercises` now that it is a row, so the
             second list `?plus=` used to contribute has nothing left in it. */
          already={new Set(exercises.map((e) => e.exerciseId))}
          onPick={pickAdded}
          onClose={() => go({ add: null })}
        />
      ) : null}

      {swapView ? (
        <SwapModal
          fromName={swapView.name}
          library={data.library}
          hasProgram={data.programId !== null}
          hasTemplate={data.templateId !== null}
          programWeeksLeft={data.programWeeksLeft}
          templateReach={data.templateReach}
          busy={swapping}
          message={errors.swap ?? null}
          onClose={() => { say('swap', null); go({ swap: null }); }}
          onSwap={(toExerciseId, scope: SwapScope) => {
            setSwapping(true);
            startTransition(async () => {
              const result = await swapExercise({
                routeId: data.routeId,
                scope,
                fromExerciseId: swapView.exerciseId,
                toExerciseId,
                programId: data.programId,
                templateId: data.templateId,
                workoutId: view.workoutId,
                /* The replacement inherits the original's place and targets — it
                   is standing in for it, so a swap that reset the card to three
                   sets of nothing would lose what was prescribed. */
                card: cardOf(swapView),
              });
              setSwapping(false);
              if (!result.ok) {
                say('swap', result.message);
                return;
              }
              say('swap', null);
              const next = new URLSearchParams(params.toString());
              next.delete('swap');
              next.set('ex', toExerciseId);
              router.replace(`/sessions/${data.routeId}/log?${next.toString()}`, { scroll: false });
              router.refresh();
            });
          }}
        />
      ) : null}

      {restFor ? (
        <RestModal
          name={exercises.find((e) => e.exerciseId === restFor)?.name ?? 'this exercise'}
          seconds={exercises.find((e) => e.exerciseId === restFor)?.restSeconds ?? null}
          onClose={() => setRestFor(null)}
          onPick={(seconds) => {
            const exerciseId = restFor;
            const card = exercises.find((e) => e.exerciseId === exerciseId);
            setRestFor(null);
            if (!exerciseId || !card) return;
            startTransition(async () => {
              /* On the plan → the plan, and it is still 90 seconds next Tuesday.
                 Off the plan → today's card, which is where V13 put
                 `rest_seconds` precisely so an off-plan exercise could hold one.
                 Two different answers, not a fallback. */
              await setRest({
                routeId: data.routeId,
                programId: data.programId,
                exerciseId,
                restSeconds: seconds,
                workoutId: view.workoutId,
                card: cardOf(card),
                onPlan: !card.unplanned,
              });
              router.refresh();
            });
          }}
        />
      ) : null}
    </>
  );
}

/**
 * FRAME 6b — NOTHING PLANNED, AND NOTHING ADDED.
 *
 * No live program, so nothing to seed from — and **that is a starting point
 * rather than an error**, because logging is allowed to happen before
 * programming exists. The likeliest first screen a new trainer ever sees.
 *
 * The offer is the **last whole session they did**, not a template: the commonest
 * thing a trainer wants on a day with no plan is *last time again*, and every
 * logger in the teardown makes them build it out of a routine instead. And
 * nothing here auto-progresses it — §09: the app never puts a number in a row
 * that nobody lifted. Repeating brings the exercises and the slots; the loads
 * arrive in the Previous column, where they belong.
 */
function EmptyPlan({ data, onAdd }: { data: ConsoleData; onAdd: () => void }) {
  const { view } = data;
  return (
    <div className="wk2 wk2--pick" style={{ marginTop: 12, maxWidth: 1080 }}>
      <div>
        <div
          className="empty"
          style={{ minHeight: 0, padding: '34px 0 26px', alignItems: 'flex-start', textAlign: 'left' }}
        >
          <span className="empty__ic"><Info size={20} /></span>
          <p className="empty__t">Nothing planned, and nothing added</p>
          <p className="empty__b" style={{ maxWidth: '48ch' }}>
            {view.clientName.split(' ')[0]} has no live program, so there is no plan to seed this log
            from. Logging is allowed to happen <b className="ink">before programming exists</b> — so
            this is a starting point, not an error.
          </p>
        </div>

        <div className="lgl">
          {data.repeatHref && view.repeat ? (
            <Link className="lrow" href={data.repeatHref}>
              <span className="lrow__m" style={{ flex: 1 }}>
                <span className="lrow__t">{view.repeat.label}</span>
                <span className="lrow__s">{view.repeat.meta}</span>
              </span>
              <span className="btn btn--primary btn--sm">Open it</span>
            </Link>
          ) : null}
          <button className="lrow" type="button" onClick={onAdd}>
            <span className="lrow__m" style={{ flex: 1 }}>
              <span className="lrow__t">Add an exercise</span>
              <span className="lrow__s">recents first, with what was last lifted</span>
            </span>
          </button>
          <Link className="lrow" href={`/clients/${view.clientId}/programs`}>
            <span className="lrow__m" style={{ flex: 1 }}>
              <span className="lrow__t">Assign a program</span>
              <span className="lrow__s">and this log seeds itself next time</span>
            </span>
          </Link>
        </div>

        {view.quiet ? (
          <div className="msg msg--warn" style={{ marginTop: 14 }}>
            <Warn />
            <span>
              <b>{view.quiet}</b> Stated, not editorialised — the app does not know why, and a
              screen that guesses is a screen a trainer argues with.
            </span>
          </div>
        ) : null}
      </div>

      <div>
        <Why heading="The last whole session, as something to repeat">
          <p>
            Not a template and not a suggestion: the actual session they did, offered whole. The
            commonest thing a trainer wants on a day with no plan is <b>last time again</b>, and
            every logger in the teardown makes them build it from a routine instead.
          </p>
        </Why>
        <p className="small" style={{ marginTop: 12 }}>
          And nothing here auto-progresses it. §09:{' '}
          <b className="ink">the app never puts a number in a row that nobody lifted</b>. Repeating
          the session brings the exercises and the slots; the loads arrive in the Previous column,
          where they belong.
        </p>
      </div>
    </div>
  );
}

/**
 * Rest, changed.
 *
 * A modal rather than a panel because it is a one-field form and `webapp.css`
 * says that is what the centre of the screen is for. Chips rather than a
 * stepper: six numbers cover every rest a trainer actually sets, and the one
 * they do not is a program edit rather than a mid-session one.
 */
function RestModal({
  name,
  seconds,
  onPick,
  onClose,
}: {
  name: string;
  seconds: number | null;
  onPick: (seconds: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="scrim scrim--top" onClick={onClose} aria-hidden="true" />
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Rest after a ${name} set`}>
        <div className="modal__hd">
          <p className="modal__t">Rest after a {name.toLowerCase()} set</p>
        </div>
        <div className="modal__body">
          {/* The second and third sentences went on 21 Sep 2026. *90 seconds
              after a bench set and 20 after a curl is one trainer, not two
              preferences* and *every app that made rest a single global number
              made it a number people turn off* are the argument for building
              it this way, addressed to a reviewer — and this dialog is opened
              mid-session by somebody who wants to press a number. What is left
              is the one line that tells them what they are about to change. */}
          <p style={{ margin: 0 }}>
            Rest is set per exercise, so changing it here changes it for{' '}
            <b className="ink">{name.toLowerCase()}</b> and nothing else.
          </p>
          <div className="wk" style={{ marginTop: 14 }}>
            {REST_CHOICES.map((s) => (
              <Chip
                pressed={seconds === s}
                key={s}
                onClick={() => onPick(s)}
              >
                {s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}
              </Chip>
            ))}
          </div>
          <p className="small" style={{ marginTop: 10 }}>
            It is saved on the program row, so it is there next Tuesday too.
          </p>
        </div>
        <div className="modal__foot">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </>
  );
}
