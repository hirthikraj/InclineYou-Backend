import { Model } from '@nozbe/watermelondb';
import { text, field, readonly, date } from '@nozbe/watermelondb/decorators';

/**
 * A price-list entry — what this trainer sells.
 *
 * Not to be confused with `Package`, which is one of these sold to one client.
 * Retiring a pack sets `status = 'inactive'`; it is never deleted, because
 * every package sold from it still points here.
 */
export default class Pack extends Model {
  static table = 'packs';

  @text('trainer_id') trainerId!: string;
  @text('name') name!: string;
  /** 'session_pack' | 'monthly' | 'single' */
  @text('type') type!: string;
  /** Null on a monthly pack — that one is a duration, not a count. */
  @field('sessions') sessions!: number | null;
  @field('amount') amount!: number;
  @text('currency') currency!: string;
  @field('validity_days') validityDays!: number | null;
  /** 'active' | 'inactive' */
  @text('status') status!: string;
  /**
   * Whose price this is — 'trainer' or 'gym'.
   *
   * Null on anything written before V14, and null means the trainer's own. Read
   * it through `packOwner()` rather than comparing this field directly.
   */
  @text('owner') owner!: string | null;
  @field('order_index') orderIndex!: number;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
