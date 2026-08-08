import { Model } from '@nozbe/watermelondb';
import { text, readonly, date } from '@nozbe/watermelondb/decorators';

export default class Template extends Model {
  static table = 'templates';

  @text('trainer_id') trainerId!: string;
  @text('name') name!: string;
  @text('goal') goal!: string;
  @text('description') description!: string;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
