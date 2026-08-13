import { Model } from '@nozbe/watermelondb';
import { field, text, readonly, date } from '@nozbe/watermelondb/decorators';

/**
 * A batch — a group session on the floor.
 *
 * Deliberately thin. It holds only what is true of the group: what it is
 * called, what the floor holds, and the number below which it isn't worth
 * running. Everything about a *person* in the batch — their pack, their
 * outcome, whether they turned up — stays on their own scheduled session.
 */
export default class Batch extends Model {
  static table = 'batches';

  @text('trainer_id') trainerId!: string;
  @text('name') name!: string;
  @field('capacity') capacity!: number;
  @field('min_size') minSize!: number;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
