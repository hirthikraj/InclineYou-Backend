import { Model } from '@nozbe/watermelondb';
import { text, field, readonly, date } from '@nozbe/watermelondb/decorators';

/**
 * The gym's cut for one month, and whether it has been handed over.
 *
 * These are the trainer's own figures, worked out from their own book. XRep
 * does not talk to any gym's system — if the gym's number differs, this is the
 * one the trainer can show them.
 */
export default class GymSettlement extends Model {
  static table = 'gym_settlements';

  @text('trainer_id') trainerId!: string;
  /** 'YYYY-MM'. The unit every gym in India settles on. */
  @text('period') period!: string;
  @field('amount') amount!: number;
  @field('sessions_counted') sessionsCounted!: number | null;
  /** Copied at creation: changing gyms must not rewrite what was owed before. */
  @text('gym_name') gymName!: string;
  /** 'due' | 'settled' */
  @text('status') status!: string;
  @date('due_at') dueAt!: Date | null;
  @date('settled_at') settledAt!: Date | null;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
