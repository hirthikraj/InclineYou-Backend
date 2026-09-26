'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { PortalWorkoutWire } from '@/lib/portal/api';
import { finishWorkout } from '@/lib/portal/actions';
import { Button } from '@/web-components/ui/Button';
import { ButtonGroup } from '@/web-components/ui/ButtonGroup';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { HeroCard } from '@/web-components/ui/HeroCard';
import { Message } from '@/web-components/ui/Message';
import { Stat, Stats } from '@/web-components/ui/Stat';
import { Tag } from '@/web-components/ui/Tag';
import { Textarea } from '@/web-components/ui/Textarea';

type Effort = 'easy' | 'right' | 'hard';

/**
 * §2's finish, in the order §2 lists it:
 *
 *   1. *"A real moment of celebration — brief, not obnoxious"*
 *   2. *"Summary: total volume, time, anything beaten from last time"*
 *   3. *"One simple feedback question: how did that feel? Easy / Just right /
 *      Hard. Three taps maximum."*
 *
 * ── THE THIRD ONE IS THE MOST VALUABLE THING ON THE SCREEN ──────────────────
 *
 * §2 says so outright: *"That last answer is quietly the most valuable data you
 * collect. It flows to the trainer and informs next week's programming — and
 * when the client sees the program adjust because of what they reported, they
 * understand the loop is real."*
 *
 * So it is a `ButtonGroup` — one control, one answer, three taps — and it is
 * ASKED AFTER THE SUMMARY rather than instead of it. A client has to see what
 * they did before they can say how it felt, and a question asked over a blank
 * screen gets the middle option every time.
 *
 * ── AND IT IS SKIPPABLE, WHICH IS NOT AN OVERSIGHT ──────────────────────────
 *
 * The workout is already closed by the time this screen renders — `Flow`
 * finishes without an answer, and `finishWorkout` takes the feedback as an
 * optional second call. Making the answer mandatory would mean a log that
 * cannot be closed without it, and an unclosed log is the `log-open` band on
 * the TRAINER's attention queue: a nag for the trainer, produced by a question
 * the client ignored.
 *
 * ── THE CELEBRATION IS BRIEF, AND IT DOES NOT MOVE ──────────────────────────
 *
 * *"Brief, not obnoxious"* is a real constraint and this codebase has a harder
 * version of it: the keyframe vocabulary is closed at seven and none of them is
 * a confetti burst. What the celebration IS, then, is the one thing a client
 * cannot get anywhere else — a figure that beat a figure. `beaten` below is
 * that, and where nothing was beaten the hero says something true instead
 * rather than inventing an achievement.
 */
export function Done({ workout }: { workout: PortalWorkoutWire }) {
  const router = useRouter();
  const [effort, setEffort] = useState<Effort | null>(workout.feedback?.effort ?? null);
  const [note, setNote] = useState(workout.feedback?.note ?? '');
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, start] = useTransition();

  const answered = workout.feedback !== null;

  const volume = workout.exercises.reduce(
    (n, e) => n + e.sets.reduce((m, s) => m + (s.loadKg ?? 0) * (s.reps ?? 0), 0),
    0,
  );
  const sets = workout.exercises.reduce((n, e) => n + e.sets.length, 0);
  const minutes =
    workout.endedAt !== null
      ? Math.max(1, Math.round((workout.endedAt - workout.startedAt) / 60_000))
      : null;

  /* §2's *"anything beaten from last time"*.
     A movement counts as beaten when today's top set is above the best on
     record for it — `lastTime.bestLoadKg` is the all-time best rather than last
     session's, deliberately: telling somebody they beat last Tuesday when they
     are still under their June best is a congratulation they will notice is
     hollow, and the credibility of every other figure on this screen goes with
     it. */
  const beaten = workout.exercises
    .map((e) => {
      const top = Math.max(0, ...e.sets.map((s) => s.loadKg ?? 0));
      const best = e.lastTime?.bestLoadKg ?? 0;
      return top > best && best > 0 && e.exercise
        ? { name: e.exercise.name, from: best, to: top }
        : null;
    })
    .filter((x): x is { name: string; from: number; to: number } => x !== null);

  function save(next: Effort) {
    setEffort(next);
    setFailure(null);
    start(async () => {
      const res = await finishWorkout(workout.id, next, note);
      if (!res.ok) {
        setFailure(res.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="portal col gap4">
      <HeroCard
        lead
        kicker="Workout done"
        figure={sets === 1 ? '1 set' : `${sets} sets`}
        label={`Workout finished. ${sets} sets logged.`}
        detail={
          minutes !== null
            ? `${workout.dayLabel ?? 'Today'} · ${minutes} minutes`
            : (workout.dayLabel ?? 'Today')
        }
        chips={
          beaten.length > 0 ? (
            <Tag tone="pr">
              {beaten.length === 1 ? 'New best' : `${beaten.length} new bests`}
            </Tag>
          ) : undefined
        }
      />

      {/* ── the summary · §2's three figures ──────────────────────────────── */}
      <Card>
        <CardHead title="What you did" />
        <CardBody>
          <Stats up={3}>
            <Stat label="Sets" value={String(sets)} detail="logged" />
            <Stat
              label="Total lifted"
              /* Volume as `load × reps`, summed. The one figure on this screen
                 that is impressive precisely because it is large — a client who
                 has never seen it does not know they moved four tonnes. */
              value={volume >= 1000 ? `${(volume / 1000).toFixed(1)} t` : `${volume} kg`}
              detail="across the session"
            />
            <Stat
              label="Took"
              value={minutes !== null ? `${minutes} min` : '—'}
              detail={minutes !== null ? 'start to finish' : 'not recorded'}
            />
          </Stats>
        </CardBody>

        {beaten.length > 0 && (
          <CardBody divided>
            <p className="h5">Beaten today</p>
            <div className="col gap2 mt2">
              {beaten.map((b) => (
                <p key={b.name} className="small">
                  <b className="ink">{b.name}</b> — {b.from} kg{' '}
                  <span className="acc">&rarr; {b.to} kg</span>
                </p>
              ))}
            </div>
          </CardBody>
        )}
      </Card>

      {/* ── the question · §2's three taps ────────────────────────────────── */}
      <Card level={2}>
        <CardHead title="How did that feel?">
          {answered && <Tag tone="ok">Sent</Tag>}
        </CardHead>
        <CardBody>
          <ButtonGroup
            label="How did that workout feel"
            value={effort ?? ('' as Effort)}
            options={[
              { value: 'easy', label: 'Easy' },
              { value: 'right', label: 'Just right' },
              { value: 'hard', label: 'Hard' },
            ]}
            onChange={(v) => save(v)}
          />
          <p className="small mt3">
            {/* WHY it is being asked, in one line. §2's own argument is that
                the loop has to be visible — *"when the client sees the program
                adjust because of what they reported, they understand the loop
                is real"* — and a three-option control with no explanation reads
                as a satisfaction survey. */}
            This goes straight to your trainer and it is what they use to set
            next week. There is no wrong answer.
          </p>

          {effort !== null && (
            <div className="mt4">
              <Textarea
                label="Anything else? (optional)"
                name="note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.currentTarget.value)}
                hint="A word about a niggle, or a set that felt off."
              />
              {note.trim() !== '' && note.trim() !== (workout.feedback?.note ?? '') && (
                <div className="mt3">
                  <Button
                    variant="secondary"
                    disabled={saving}
                    loading={saving}
                    onClick={() => save(effort)}
                  >
                    Send it
                  </Button>
                </div>
              )}
            </div>
          )}

          {failure && (
            <Message tone="err" alert className="mt3">
              {failure}
            </Message>
          )}
        </CardBody>
      </Card>

      <div className="row gap3" style={{ flexWrap: 'wrap' }}>
        <Button variant="primary" href="/me/today">
          Done
        </Button>
        <Button variant="ghost" href="/me/progress">
          See your progress
        </Button>
      </div>
    </div>
  );
}
