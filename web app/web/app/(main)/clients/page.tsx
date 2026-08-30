import { Clients } from '@/components/clients/Clients';
import { Unavailable } from '@/components/today/Unavailable';
import { requireClients } from '@/lib/clients/guard';
import { getNewClientData, type NewClientData } from '@/lib/clients/new-api';
import { listRecentNudges } from '@/lib/nudges/api';
import { COOLDOWN_DAYS, lastContactMap } from '@/lib/nudges/cooldown';

export const metadata = { title: 'Clients · X REP' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  /*
   * The nudge read is the third request and the only optional one — see
   * `listRecentNudges`, which answers `[]` rather than throwing. What it buys
   * is the roster's action column saying *Messaged yesterday* under a verb that
   * would otherwise look like nobody had done anything about this client.
   *
   * The cooldown window, not a year: this screen asks "have I already dealt
   * with them", and the history proper is on the client's own file.
   */
  const [result, newClientData, nudges] = await Promise.all([
    requireClients(),
    (getNewClientData() as Promise<NewClientData>).catch((): null => null),
    listRecentNudges(COOLDOWN_DAYS),
  ]);

  if (!result.ok) {
    return (
      <Unavailable
        kind={result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }
  return (
    <Clients
      data={result.data}
      now={result.now}
      newClientData={newClientData}
      lastContact={Object.fromEntries(lastContactMap(nudges))}
    />
  );
}
