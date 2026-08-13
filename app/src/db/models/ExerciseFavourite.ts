import { Model } from '@nozbe/watermelondb';
import { text, readonly, date } from '@nozbe/watermelondb/decorators';

/**
 * A star on an exercise.
 *
 * Its own row rather than a column on `exercises`, because almost the whole
 * library is shared: those rows belong to no trainer, and one trainer's
 * favourite must never appear in another's list.
 */
export default class ExerciseFavourite extends Model {
  static table = 'exercise_favourites';

  @text('trainer_id') trainerId!: string;
  @text('exercise_id') exerciseId!: string;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
