import { AccountPanel } from '@/components/settings/AccountPanel';
import { getAccount } from '@/lib/account/api';
import { countClients } from '@/lib/account/clients';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Account · InclineYou' };

/**
 * ACCOUNT — Settings' first tab, and its root.
 *
 * `/settings` used to be an INDEX: a card of three rows, every one of them a
 * link to a screen with its own bar and its own header. Two of those rows have
 * gone — *Your profile* is reached from the account menu, and *Your working
 * week* is a section of the profile's *Work & hours* tab — and what is left is a
 * tab strip with this on the front of it. `lib/settings/tabs.ts` carries the
 * argument.
 *
 * ## Two requests, and the second one is only for the confirmation
 *
 * `/v1/trainers/me` is the screen. `/v1/clients` is fetched so that the delete
 * confirmation can name what is going — *"your 22 clients, and every package,
 * payment and session against them"* — rather than gesturing at it. That is the
 * single fact most likely to stop a mis-tap on an irreversible button, and it is
 * worth one read of a list this half already fetches on four other screens.
 *
 * It is deliberately allowed to FAIL without taking the page with it. A roster
 * that will not load is not a reason to be unable to change your own name, and
 * the confirmation has a sentence for the unknown case.
 */
export default async function Page() {
  const [account, clientCount] = await Promise.all([getAccount(), countClients()]);

  return (
    <div className="body">
      <AccountPanel initial={account} clientCount={clientCount} />
    </div>
  );
}
