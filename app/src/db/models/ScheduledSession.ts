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
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
