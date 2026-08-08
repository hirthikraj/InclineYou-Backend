import { Model } from '@nozbe/watermelondb';
import { text, readonly, date } from '@nozbe/watermelondb/decorators';

export default class WorkoutSession extends Model {
  static table = 'workout_sessions';

  @text('trainer_id') trainerId!: string;
  @text('client_id') clientId!: string;
  @text('program_id') programId!: string;
  @text('scheduled_session_id') scheduledSessionId!: string;
  @text('logged_by') loggedBy!: string;
  @text('session_date') sessionDate!: string;
  @text('notes') notes!: string;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
