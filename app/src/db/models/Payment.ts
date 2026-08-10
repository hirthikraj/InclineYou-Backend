import { Model } from '@nozbe/watermelondb';
import { text, field, readonly, date } from '@nozbe/watermelondb/decorators';

export default class Payment extends Model {
  static table = 'payments';

  @text('trainer_id') trainerId!: string;
  @text('client_id') clientId!: string;
  @text('package_id') packageId!: string;
  @field('amount') amount!: number;
  @text('currency') currency!: string;
  @text('method') method!: string;
  @text('collected_by') collectedBy!: string;
  @text('status') status!: string;
  @text('upi_reference') upiReference!: string;
  @date('paid_at') paidAt!: Date;
  /* --- V7 · money --- */
  /** The gym's cut on this entry, worked out at record time and frozen here. */
  @field('gym_share_amount') gymShareAmount!: number | null;
  @field('share_percent') sharePercent!: number | null;
  /** Issued on this device, from a device-scoped range. Never server-assigned. */
  @text('receipt_no') receiptNo!: string;
  @text('note') note!: string;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
