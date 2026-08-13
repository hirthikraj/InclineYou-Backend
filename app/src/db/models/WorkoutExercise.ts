import { Model } from '@nozbe/watermelondb';
import { text, field, readonly, date } from '@nozbe/watermelondb/decorators';

/**
 * One exercise in one session's log.
 *
 * The plan is what should happen; this is what is happening. See the note in
 * `schema.ts` for why the three facts it holds cannot be derived.
 */
export default class WorkoutExercise extends Model {
  static table = 'workout_exercises';

  @text('workout_session_id') workoutSessionId!: string;
  @text('exercise_id') exerciseId!: string;
  @field('order_index') orderIndex!: number;
  /** 'planned' | 'unplanned'. A tag, never an adherence signal. */
  @text('source') source!: string;
  /** Set when this replaced a planned exercise. A swap, not a skip. */
  @text('swapped_from_exercise_id') swappedFromExerciseId!: string | null;
  @field('target_sets') targetSets!: number | null;
  @field('target_reps') targetReps!: number | null;
  /** Rest for this exercise only. Null falls back to the plan's. */
  @field('rest_seconds') restSeconds!: number | null;
  /** Taken out of today. Soft, so Undo has something to put back. */
  @date('removed_at') removedAt!: Date | null;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
