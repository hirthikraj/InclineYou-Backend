import { Model } from '@nozbe/watermelondb';
import { text, field, readonly, date } from '@nozbe/watermelondb/decorators';

export default class Exercise extends Model {
  static table = 'exercises';

  @text('name') name!: string;
  @text('muscle_group') muscleGroup!: string;
  @text('equipment') equipment!: string;
  @text('movement_pattern') movementPattern!: string;
  @text('description') description!: string;
  /** A still for the row's tile. Empty throughout the library — see `schema.ts`. */
  @text('image_url') imageUrl!: string;
  /** Held the demo loop until the media was retired. Empty; nothing reads it. */
  @text('video_url') videoUrl!: string;
  @field('is_custom') isCustom!: boolean;
  @text('trainer_id') trainerId!: string;
  @text('source_id') sourceId!: string;
  /**
   * 'weight_reps' | 'reps'. Null across the whole shared library and read as
   * 'weight_reps'.
   *
   * Written once, when a custom exercise is created, and never again — every set
   * already recorded against it would stop making sense. The sheet greys the
   * control out after saving and the server refuses to update the column, so
   * neither a stale device nor a later edit can move it.
   */
  @field('log_type') logType!: string | null;
  /**
   * The library's taxonomy, in two grains — "chest" and "pectorals". Both null on
   * a trainer's own exercises, which the list groups under "Yours" regardless.
   */
  @text('body_part') bodyPart!: string | null;
  @text('target') target!: string | null;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
