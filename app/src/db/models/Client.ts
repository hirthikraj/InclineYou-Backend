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
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
