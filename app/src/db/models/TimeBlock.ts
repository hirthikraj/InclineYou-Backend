import { Model } from '@nozbe/watermelondb';
import { text, field, readonly, date } from '@nozbe/watermelondb/decorators';

/**
 * A dated hole in the diary (V10).
 *
 * Stops new bookings and nothing else. Sessions already inside a block stay
 * exactly where they are — what happens to them is the trainer's decision in
 * the sheet, never a side effect of creating the block.
 */
export default class TimeBlock extends Model {
  static table = 'time_blocks';

  @field('trainer_id') trainerId!: string;
  @date('starts_at') startsAt!: Date;
  @date('ends_at') endsAt!: Date;
  /** True for whole days, so nothing has to infer it from 00:00–23:59. */
  @field('all_day') allDay!: boolean;
  @text('reason') reason!: string;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
