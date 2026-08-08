import { Model } from '@nozbe/watermelondb';
import { text, field, readonly, date } from '@nozbe/watermelondb/decorators';

export default class Exercise extends Model {
  static table = 'exercises';

  @text('name') name!: string;
  @text('muscle_group') muscleGroup!: string;
  @text('equipment') equipment!: string;
  @text('movement_pattern') movementPattern!: string;
  @text('description') description!: string;
  @text('image_url') imageUrl!: string;
  @text('video_url') videoUrl!: string;
  @field('is_custom') isCustom!: boolean;
  @text('trainer_id') trainerId!: string;
  @text('source_id') sourceId!: string;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
