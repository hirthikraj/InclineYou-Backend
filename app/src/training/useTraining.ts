/**
 * Subscribes the exercise library and the program shelf to local storage.
 *
 * The exercises query is the one to be careful with: the seeded library is 873
 * rows, and this is the only subscription in the app that reads a table that
 * size. It watches five columns rather than the whole row, so a set logged
 * against an exercise does not re-emit 873 objects into a `useMemo` chain.
 *
 * `sets` is unwindowed, which is the deliberate cost. An exercise's records are
 * "heaviest ever", not "heaviest this month", and a bounded query would make the
 * number quietly wrong every time a personal record aged out of the window.
 *
 * ── Why the subscription waits ────────────────────────────────────────────
 *
 * It is deferred past the running interaction, like every other hook in this app.
 * Without it, opening Exercises from the drawer read 873 exercises and 1,134 set
 * logs on the same frames the drawer was using to slide shut — and the drawer
 * lost: measured on a device, it sat open for **over a second** after the tap
 * while the screen underneath did its work. The screen was never slow to load. It
 * was loud, and the drawer could not get a frame to leave on.
 *
 * The skeleton fills that gap and is cheap enough to draw while a panel is
 * animating. Nobody is reading the library mid-slide.
 */

import { useEffect, useMemo, useState } from 'react';
import { InteractionManager } from 'react-native';
import { combineLatest, map } from 'rxjs';
import { Q } from '@nozbe/watermelondb';
import { database } from '../db';
import type ExerciseModel from '../db/models/Exercise';
import type ExerciseFavouriteModel from '../db/models/ExerciseFavourite';
import type SetLogModel from '../db/models/SetLog';
import type WorkoutSessionModel from '../db/models/WorkoutSession';
import type TemplateModel from '../db/models/Template';
import type ProgramModel from '../db/models/Program';
import type ClientModel from '../db/models/Client';
import { liveCache } from '../db/live';
import { EMPTY_TRAINING_INPUT, type TrainingInput } from './training';

const exercises = database.get<ExerciseModel>('exercises');
const favourites = database.get<ExerciseFavouriteModel>('exercise_favourites');
const setLogs = database.get<SetLogModel>('set_logs');
const workouts = database.get<WorkoutSessionModel>('workout_sessions');
const templates = database.get<TemplateModel>('templates');
const programs = database.get<ProgramModel>('programs');
const clients = database.get<ClientModel>('clients');

const cache = liveCache<TrainingInput>(EMPTY_TRAINING_INPUT);

/** The seven subscriptions, as one stream. */
function observeTraining() {
  return combineLatest([
    exercises
      .query(Q.sortBy('name', Q.asc))
      .observeWithColumns(['name', 'muscle_group', 'equipment', 'is_custom', 'log_type']),
    favourites.query().observe(),
    setLogs.query().observeWithColumns(['load_kg', 'reps', 'rpe', 'set_number']),
    workouts.query().observeWithColumns(['session_date', 'client_id']),
    templates
      .query(Q.sortBy('created_at', Q.desc))
      .observeWithColumns(['name', 'goal', 'weeks', 'structure', 'day_labels']),
    programs.query().observeWithColumns(['status', 'template_id', 'client_id']),
    clients.query().observeWithColumns(['name']),
  ]).pipe(
    map(([ex, fav, sets, wk, tpl, prog, cl]) => ({
      exercises: ex,
      // A list of ids rather than the rows: everything downstream asks
      // "is this one starred", and a Set of ids is what that question wants.
      favourites: fav.map((f) => f.exerciseId),
      sets,
      workouts: wk,
      templates: tpl,
      programs: prog,
      clients: cl,
    })),
  );
}

export interface Training {
  input: TrainingInput;
  /** False only until the first emission of the app's life. */
  ready: boolean;
}

export function useTraining(): Training {
  const [input, setInput] = useState(cache.value);
  const [ready, setReady] = useState(cache.ready);

  useEffect(() => {
    let sub: { unsubscribe: () => void } | null = null;

    const task = InteractionManager.runAfterInteractions(() => {
      sub = observeTraining().subscribe((next) => {
        cache.set(next);
        setInput(next);
        setReady(true);
      });
    });

    return () => {
      task.cancel();
      // Null when the screen was left before the interaction finished — a fast
      // back-out. Nothing was ever subscribed, and nothing has to be torn down.
      sub?.unsubscribe();
    };
  }, []);

  return useMemo(() => ({ input, ready }), [input, ready]);
}
