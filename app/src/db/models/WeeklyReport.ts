import { Model } from '@nozbe/watermelondb';
import { text, field, readonly, date } from '@nozbe/watermelondb/decorators';

/**
 * Sunday's report, as it was sent — FR-10.2.
 *
 * The one record in this app that is not derived from the others. Everything
 * else is computed on read, so correcting a set from November fixes every number
 * that depended on it; this is stored because it was SENT, and a report whose
 * figures move after both people have read them is not a report.
 *
 * Written by the server and only ever read here. `bestLine` and `bestPrevious`
 * are stored as the sentences they were, rather than rebuilt from live data, for
 * the same reason.
 */
export default class WeeklyReport extends Model {
  static table = 'weekly_reports';

  @text('trainer_id') trainerId!: string;
  @text('client_id') clientId!: string;
  /** ISO dates, Monday and Sunday. A week is a week, not an instant. */
  @text('week_start') weekStart!: string;
  @text('week_end') weekEnd!: string;
  @field('sessions_kept') sessionsKept!: number;
  @field('sessions_planned') sessionsPlanned!: number;
  /** ISO weekday numbers with a logged set, e.g. "2,7". */
  @text('trained_days') trainedDays!: string | null;
  @field('volume_kg') volumeKg!: number;
  @field('sets_done') setsDone!: number;
  @field('new_bests') newBests!: number;
  @text('best_line') bestLine!: string | null;
  @text('best_previous') bestPrevious!: string | null;
  @date('sent_at') sentAt!: Date | null;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
