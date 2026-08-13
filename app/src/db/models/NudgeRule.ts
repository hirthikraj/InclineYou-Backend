import { Model } from '@nozbe/watermelondb';
import { text, field, readonly, date } from '@nozbe/watermelondb/decorators';

/**
 * One if / then rule.
 *
 * A synced record rather than a stored preference, because a trainer edits these
 * on a gym floor with no signal — and because a blob holding all five would make
 * the whole set one conflict.
 *
 * What is deliberately NOT here: the 9am–8pm send window and the once-per-client
 * -per-seven-days cap. Both are fixed in code and stated on the editor. Some
 * limits protect the trainer from themselves, and a limit with a text field
 * beside it is not a limit.
 */
export default class NudgeRule extends Model {
  static table = 'nudge_rules';

  @text('trainer_id') trainerId!: string;
  /** 'quiet' | 'pack_low' | 'overdue' | 'well_done' | 'birthday' */
  @text('kind') kind!: string;
  /**
   * Days without a workout, sessions left, or days past due — which one depends
   * on the kind. Null for the two that have no threshold at all.
   */
  @field('threshold') threshold!: number | null;
  /** 'ask' — draft it and queue it. Always the default. 'auto' — send it. */
  @text('action') action!: string;
  /** Null falls back to the built-in wording for this kind. */
  @field('message') message!: string | null;
  @field('enabled') enabled!: boolean;
  @field('order_index') orderIndex!: number;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
