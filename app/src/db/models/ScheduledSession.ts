import { Model } from '@nozbe/watermelondb';
import { text, field, readonly, date } from '@nozbe/watermelondb/decorators';

export default class ScheduledSession extends Model {
  static table = 'scheduled_sessions';

  @text('trainer_id') trainerId!: string;
  @text('client_id') clientId!: string;
  @text('program_id') programId!: string;
  @date('scheduled_at') scheduledAt!: Date;
  @field('duration_minutes') durationMinutes!: number;
  @text('status') status!: string;
  @text('notes') notes!: string;
  @text('day_label') dayLabel!: string;           // e.g. "Push Day"
  @field('template_day') templateDay!: number;   // template day number (1, 2, 3…)
  @text('delivery_mode') deliveryMode!: string;  // 'floor' | 'remote' | null — overrides the client's
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
