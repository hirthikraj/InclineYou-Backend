import { Model } from '@nozbe/watermelondb';
import { text, readonly, date } from '@nozbe/watermelondb/decorators';

/**
 * The client's trainer — one row, on the client's phone.
 *
 * Not `Trainer`: that name would imply a directory, and a client can see exactly
 * one. The server derives this from the trainer record and sends only what a
 * client is allowed to know.
 *
 * `upiVpa` is held and never rendered. The rule is that the client app never
 * SHOWS it — the deep link carries it, and the client's own UPI app confirms his
 * name before they authorise. Holding it here is what lets the payment screen
 * build that link with no signal.
 */
export default class Coach extends Model {
  static table = 'coaches';

  @text('name') name!: string;
  @text('gym_name') gymName!: string | null;
  @text('phone') phone!: string | null;
  @text('upi_vpa') upiVpa!: string | null;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
