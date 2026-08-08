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
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
