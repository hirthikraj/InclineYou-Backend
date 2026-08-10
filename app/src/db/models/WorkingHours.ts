import { Model } from '@nozbe/watermelondb';
import { field, readonly, date } from '@nozbe/watermelondb/decorators';

/**
 * One window of a working day (V10).
 *
 * A row per window rather than per day, because a personal trainer works a
 * split shift: Monday is 06:00–11:00 *and* 17:00–21:00, and a single range per
 * day would have to claim they are free at lunch.
 *
 * Minutes from midnight, not a clock string — every consumer does interval
 * arithmetic on these, and a free-slot search is subtraction.
 */
export default class WorkingHours extends Model {
  static table = 'working_hours';

  @field('trainer_id') trainerId!: string;
  /** ISO weekday: 0 = Monday … 6 = Sunday, matching the day strip. */
  @field('weekday') weekday!: number;
  @field('start_minute') startMinute!: number;
  @field('end_minute') endMinute!: number;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
