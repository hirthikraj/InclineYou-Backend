import { Model } from '@nozbe/watermelondb';
import { text, readonly, date } from '@nozbe/watermelondb/decorators';

/**
 * One coach in the team — and a pending invitation is one of these too.
 *
 * An invite IS a membership that has not been agreed to, which is why it is a
 * `status` on this row rather than a table of its own. The same shape V18 chose
 * for `client.membership_status`, and for the same reason: accepting must not
 * mean deleting one row and writing another, because the invitation date is
 * still the answer to "how long has this coach been with us".
 *
 * `trainerId` is nullable, which is the part worth knowing. An invitation can
 * precede the account: a gym owner invites a number that has never heard of
 * InclineYou, the row is written against `invitedPhone`, and it is bound to a trainer
 * id the first time that number signs in. For those rows the phone number is the
 * only thing the app knows about the person, and the coach list shows exactly
 * that rather than inventing a placeholder name.
 *
 * Server-written, read-only here — see {@link Team}.
 */
export default class TeamMember extends Model {
  static table = 'team_members';

  @text('team_id') teamId!: string;
  /** Null until an invited number signs in and the row is bound to them. */
  @text('trainer_id') trainerId!: string | null;
  /** Kept after binding: it is the evidence of who was actually invited. */
  @text('invited_phone') invitedPhone!: string | null;
  /** 'owner' | 'admin' | 'coach' — see `team/team.ts` for what each may do. */
  @text('role') role!: string;
  /** 'invited' | 'active' | 'declined' | 'removed'. Only `active` holds a seat. */
  @text('status') status!: string;
  @text('invited_by_trainer_id') invitedByTrainerId!: string | null;
  @date('invited_at') invitedAt!: Date | null;
  @date('joined_at') joinedAt!: Date | null;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
