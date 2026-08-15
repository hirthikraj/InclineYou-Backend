import { Model } from '@nozbe/watermelondb';
import { text, field, readonly, date } from '@nozbe/watermelondb/decorators';

export default class Template extends Model {
  static table = 'templates';

  @text('trainer_id') trainerId!: string;
  @text('name') name!: string;
  @text('goal') goal!: string;
  @text('description') description!: string;
  @text('day_labels') dayLabels!: string; // JSON: {"1":"Push Day","3":"Pull Day"}
  /** Null reads as one week — a shape repeated is how every older template was built. */
  @field('weeks') weeks!: number | null;
  /**
   * The blueprint, as the JSON the server stores. Snake-cased entries:
   * `{exercise_id, sets, reps, rest_seconds, target_load, notes, day_of_week,
   * week, order_index}`. Parse it with `readBlueprint` in `src/db/training.ts`
   * rather than reaching for `JSON.parse` at a call site.
   */
  @field('structure') structure!: string | null;
  /**
   * The weekdays this program trains on, ISO and comma-separated: "1,3,5".
   *
   * Null means the program predates the layout step, and its days are read off
   * the blueprint instead — which is the same answer for every template that
   * was ever filled in, and an empty one for a template that never was.
   */
  @field('training_days') trainingDays!: string | null;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
