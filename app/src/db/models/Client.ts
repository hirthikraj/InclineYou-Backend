import { Model } from '@nozbe/watermelondb';
import { text, field, readonly, date, json } from '@nozbe/watermelondb/decorators';

export default class Client extends Model {
  static table = 'clients';

  @text('trainer_id') trainerId!: string;
  @text('name') name!: string;
  @text('phone') phone!: string;
  @text('goal') goal!: string;
  @text('status') status!: string;
  @text('payment_mode') paymentMode!: string;
  @field('trainer_split_percent') trainerSplitPercent!: number;
  @field('height_cm') heightCm!: number;
  @text('activity_level') activityLevel!: string;
  @json('metadata', (v: unknown) => v) metadata!: Record<string, unknown>;
  @field('sessions_per_week') sessionsPerWeek!: number;
  @field('session_duration_minutes') sessionDurationMinutes!: number;
  @text('weekly_schedule') weeklySchedule!: string;
  /** 'floor' | 'remote' | null — see `home/mode.ts`. */
  @text('delivery_mode') deliveryMode!: string;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
