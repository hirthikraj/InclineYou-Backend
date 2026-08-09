import { Q } from '@nozbe/watermelondb';
import { database } from './index';
import Template from './models/Template';
import Program from './models/Program';
import ProgramExercise from './models/ProgramExercise';
import Exercise from './models/Exercise';

export const templatesCollection = database.get<Template>('templates');
export const programsCollection = database.get<Program>('programs');
export const programExercisesCollection = database.get<ProgramExercise>('program_exercises');
export const exercisesCollection = database.get<Exercise>('exercises');

export function observeTemplates() {
  return templatesCollection.query(Q.sortBy('created_at', Q.desc)).observe();
}

export function observePrograms(clientId: string) {
  return programsCollection
    .query(Q.where('client_id', clientId), Q.sortBy('created_at', Q.desc))
    .observe();
}

export function observeProgramExercises(programId: string) {
  return programExercisesCollection
    .query(
      Q.where('program_id', programId),
      Q.sortBy('day_of_week', Q.asc),
      Q.sortBy('order_index', Q.asc),
    )
    .observe();
}

export function observeExerciseSearch(query: string) {
  const conditions: Q.Clause[] = [];
  if (query.trim()) {
    conditions.push(
      Q.where('name', Q.like(`%${Q.sanitizeLikeString(query.trim())}%`)),
    );
  }
  return exercisesCollection
    .query(...conditions, Q.sortBy('is_custom', Q.asc), Q.sortBy('name', Q.asc))
    .observeWithColumns(['name', 'muscle_group']);
}

export async function fetchProgramExercisesForDay(
  programId: string,
  dayOfWeek: number,
): Promise<ProgramExercise[]> {
  return programExercisesCollection
    .query(
      Q.where('program_id', programId),
      Q.where('day_of_week', dayOfWeek),
      Q.sortBy('order_index', Q.asc),
    )
    .fetch();
}

export async function findExercisesByIds(ids: string[]): Promise<Record<string, Exercise>> {
  if (!ids.length) return {};
  const rows = await exercisesCollection.query(Q.where('id', Q.oneOf(ids))).fetch();
  const map: Record<string, Exercise> = {};
  rows.forEach((e) => { map[e.id] = e; });
  return map;
}
