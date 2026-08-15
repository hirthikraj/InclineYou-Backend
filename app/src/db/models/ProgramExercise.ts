import { Model } from '@nozbe/watermelondb';
import { text, field, readonly, date } from '@nozbe/watermelondb/decorators';

export default class ProgramExercise extends Model {
  static table = 'program_exercises';

  @text('program_id') programId!: string;
  @text('exercise_id') exerciseId!: string;
  @field('sets') sets!: number;
  @field('reps') reps!: number;
  @field('rest_seconds') restSeconds!: number;
  @field('target_load') targetLoad!: number;
  @text('notes') notes!: string;
  @field('day_of_week') dayOfWeek!: number;
  /** Which week of the program. Null on anything written before V15 — read it as 1. */
  @field('week') week!: number | null;
  @field('order_index') orderIndex!: number;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
