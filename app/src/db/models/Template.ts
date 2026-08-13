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
   * order_index}`. Parse it with `readBlueprint` in `src/db/training.ts` rather
   * than reaching for `JSON.parse` at a call site.
   */
  @field('structure') structure!: string | null;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
