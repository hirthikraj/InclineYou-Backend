import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { setGenerator } from '@nozbe/watermelondb/utils/common/randomId';
import { schema } from './schema';
import { migrations } from './migrations';
import Client from './models/Client';
import BodyMetric from './models/BodyMetric';
import Exercise from './models/Exercise';
import Template from './models/Template';
import Program from './models/Program';
import ProgramExercise from './models/ProgramExercise';
import ScheduledSession from './models/ScheduledSession';
import WorkoutSession from './models/WorkoutSession';
import WorkoutExercise from './models/WorkoutExercise';
import SetLog from './models/SetLog';
import Package from './models/Package';
import Payment from './models/Payment';
import NudgeLog from './models/NudgeLog';
import WorkingHours from './models/WorkingHours';
import TimeBlock from './models/TimeBlock';
import Pack from './models/Pack';
import GymSettlement from './models/GymSettlement';
import NudgeRule from './models/NudgeRule';
import ExerciseFavourite from './models/ExerciseFavourite';
import Coach from './models/Coach';
import WeeklyReport from './models/WeeklyReport';
import Batch from './models/Batch';

/**
 * A UUID v4 string, because every id in this app has to be a valid PostgreSQL
 * `uuid` — the sync push casts them (`?::uuid`) and Postgres rejects anything
 * that is not one.
 *
 * Exported, and that is the point. It was previously inlined into
 * `setGenerator`, so anything that needed an id of its own had nothing to reach
 * for and invented its own format — which is exactly how `bookSeries` came to
 * write `series_ab12xy0` into a `uuid` column and wedge sync for the whole
 * device. Use this for any id that will ever reach the server.
 */
export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// WatermelonDB's own record ids, from the same generator for the same reason.
setGenerator(uuid);

const adapter = new SQLiteAdapter({
  schema,
  // Required for the sync engine's migrationsEnabledAtVersion, and the thing that
  // lets a future schema change migrate a trainer's phone instead of wiping it.
  migrations,
  dbName: 'xrep',
  jsi: true,
  onSetUpError: (error) => {
    console.error('WatermelonDB setup error', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [
    Client,
    BodyMetric,
    Exercise,
    Template,
    Program,
    ProgramExercise,
    ScheduledSession,
    WorkoutSession,
    WorkoutExercise,
    SetLog,
    Package,
    Payment,
    NudgeLog,
    WorkingHours,
    TimeBlock,
    Pack,
    GymSettlement,
    NudgeRule,
    ExerciseFavourite,
    Coach,
    WeeklyReport,
    Batch,
  ],
});
