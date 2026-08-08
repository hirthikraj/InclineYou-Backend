import { Model } from '@nozbe/watermelondb';
import { text, field, readonly, date } from '@nozbe/watermelondb/decorators';

export default class SetLog extends Model {
  static table = 'set_logs';

  @text('workout_session_id') workoutSessionId!: string;
  @text('exercise_id') exerciseId!: string;
  @field('set_number') setNumber!: number;
  @field('load_kg') loadKg!: number;
  @field('reps') reps!: number;
  @field('rpe') rpe!: number;
  @text('notes') notes!: string;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
