import { Model } from '@nozbe/watermelondb';
import { text, readonly, date } from '@nozbe/watermelondb/decorators';

export default class NudgeLog extends Model {
  static table = 'nudge_logs';

  @text('trainer_id') trainerId!: string;
  @text('client_id') clientId!: string;
  @text('channel') channel!: string;
  @text('template_name') templateName!: string;
  @text('status') status!: string;
  @date('sent_at') sentAt!: Date;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
