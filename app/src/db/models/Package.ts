import { Model } from '@nozbe/watermelondb';
import { text, field, readonly, date } from '@nozbe/watermelondb/decorators';

export default class Package extends Model {
  static table = 'packages';

  @text('trainer_id') trainerId!: string;
  @text('client_id') clientId!: string;
  @text('type') type!: string;
  @field('sessions_total') sessionsTotal!: number;
  @field('sessions_remaining') sessionsRemaining!: number;
  @field('amount') amount!: number;
  @text('currency') currency!: string;
  @text('start_date') startDate!: string;
  @text('end_date') endDate!: string;
  @text('status') status!: string;
  /* --- V7 · money. The debt side of the book. --- */
  /** The price-list entry this was sold from. Null for anything sold before V7. */
  @text('pack_id') packId!: string;
  /** 'YYYY-MM-DD'. Null means never agreed, which reads as due but not late. */
  @text('due_date') dueDate!: string;
  /** A write-off keeps the row and the history. It is not a delete. */
  @date('written_off_at') writtenOffAt!: Date | null;
  @field('written_off_amount') writtenOffAmount!: number | null;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
