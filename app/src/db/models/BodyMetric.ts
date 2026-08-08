import { Model } from '@nozbe/watermelondb';
import { text, field, readonly, date } from '@nozbe/watermelondb/decorators';

export default class BodyMetric extends Model {
  static table = 'body_metrics';

  @text('client_id') clientId!: string;
  @text('metric_type') metricType!: string;
  @field('value') value!: number;
  @text('unit') unit!: string;
  @text('notes') notes!: string;
  @date('recorded_at') recordedAt!: Date;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
