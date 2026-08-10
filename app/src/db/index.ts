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
import SetLog from './models/SetLog';
import Package from './models/Package';
import Payment from './models/Payment';
import NudgeLog from './models/NudgeLog';
import WorkingHours from './models/WorkingHours';
import TimeBlock from './models/TimeBlock';
import Pack from './models/Pack';
import GymSettlement from './models/GymSettlement';

// Use UUID v4 strings for IDs so they match PostgreSQL UUIDs
setGenerator(() =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  })
);

const adapter = new SQLiteAdapter({
  schema,
  // Required for the sync engine's migrationsEnabledAtVersion, and the thing that
  // lets a future schema change migrate a trainer's phone instead of wiping it.
  migrations,
  dbName: 'trainx',
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
    SetLog,
    Package,
    Payment,
    NudgeLog,
    WorkingHours,
    TimeBlock,
    Pack,
    GymSettlement,
  ],
});
