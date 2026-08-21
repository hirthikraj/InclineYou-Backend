import { Model } from '@nozbe/watermelondb';
import { text, field, readonly, date } from '@nozbe/watermelondb/decorators';

/**
 * The coaching team this trainer belongs to — one row, or none.
 *
 * Not `Teams`: a trainer is in exactly one team at a time, enforced by a partial
 * unique index on the server for the same reason `app_user.role` is exclusive. A
 * coach in two teams makes three questions unanswerable — whose library do they
 * see, whose admins can read their clients, whose seat are they in.
 *
 * Written by the server and only ever read here, like {@link WeeklyReport} and
 * {@link Coach}. Every write to a team is a permission change, and the one thing
 * that must never be authored offline is a permission change: it would be
 * replayed at an unknown later time, possibly after the grant was revoked. The
 * Team screen writes through `/v1/team/**` while online, or not at all.
 *
 * `seatLimit` null means unlimited. It is checked when an invitation is
 * *accepted* rather than when it is sent, because seats are consumed by people
 * and not by intentions.
 */
export default class Team extends Model {
  static table = 'teams';

  @text('owner_trainer_id') ownerTrainerId!: string;
  @text('name') name!: string;
  /** Nullable and unused in v1 — there is no upload anywhere in this product. */
  @text('logo_url') logoUrl!: string | null;
  @field('seat_limit') seatLimit!: number | null;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
