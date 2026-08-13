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
  /**
   * When the log was closed. Null while it is still open.
   *
   * Not "the session counted" — that is `scheduled_session.status`, and §09 of
   * screen 17 forbids collapsing the two: the sets happened, and whether it
   * comes off a pack is the trainer's separate tap.
   */
  @date('ended_at') endedAt!: Date | null;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
