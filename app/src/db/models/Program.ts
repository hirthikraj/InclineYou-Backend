import { Model } from '@nozbe/watermelondb';
import { text, readonly, date } from '@nozbe/watermelondb/decorators';

export default class Program extends Model {
  static table = 'programs';

  @text('trainer_id') trainerId!: string;
  @text('client_id') clientId!: string;
  @text('template_id') templateId!: string;
  @text('name') name!: string;
  @text('goal') goal!: string;
  @text('start_date') startDate!: string;
  @text('end_date') endDate!: string;
  @text('status') status!: string;
  /** [{"day":1,"weekday":2,"time":"06:30"}, …] — written by the server at apply time. */
  @text('schedule') schedule!: string | null;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
