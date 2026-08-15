import { Q } from '@nozbe/watermelondb';
import { combineLatest, map, type Observable } from 'rxjs';
import { database } from './index';
import type ClientModel from './models/Client';
import type PackageModel from './models/Package';
import type PaymentModel from './models/Payment';
import type ProgramModel from './models/Program';
import { deriveClientStatus, type ClientStatus } from './clientStatusRules';

export {
  deriveClientStatus,
  PACK_LOW_THRESHOLD,
  EXPIRING_WITHIN_DAYS,
} from './clientStatusRules';
export type { ChipTone, StatusChip, ClientFlags, ClientStatus } from './clientStatusRules';

export interface RosterEntry {
  client: ClientModel;
  status: ClientStatus;
}

const clientsCollection = database.get<ClientModel>('clients');
const packagesCollection = database.get<PackageModel>('packages');
const paymentsCollection = database.get<PaymentModel>('payments');
const programsCollection = database.get<ProgramModel>('programs');

function groupBy<T extends { clientId: string }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const list = out.get(row.clientId);
    if (list) list.push(row);
    else out.set(row.clientId, [row]);
  }
  return out;
}

/**
 * Clients plus their derived chips, recomputed whenever any contributing table
 * changes. One query per table rather than per client — a trainer's whole book
 * is small, and it keeps the roster to four subscriptions instead of 4×N.
 */
export function observeRoster(): Observable<RosterEntry[]> {
  return combineLatest([
    clientsCollection.query(Q.sortBy('created_at', Q.desc)).observe(),
    packagesCollection.query().observe(),
    paymentsCollection.query().observe(),
    programsCollection.query().observe(),
  ]).pipe(
    map(([clients, packages, payments, programs]) => {
      const now = Date.now();
      const byPackage = groupBy(packages);
      const byPayment = groupBy(payments);
      const byProgram = groupBy(programs);

      return clients.map((client) => ({
        client,
        status: deriveClientStatus(
          client,
          byPackage.get(client.id) ?? [],
          byPayment.get(client.id) ?? [],
          byProgram.get(client.id) ?? [],
          now,
        ),
      }));
    }),
  );
}

/** Same derivation, scoped to one client — for the detail screen. */
export function observeClientStatus(clientId: string): Observable<ClientStatus | null> {
  return combineLatest([
    clientsCollection.query(Q.where('id', clientId)).observe(),
    packagesCollection.query(Q.where('client_id', clientId)).observe(),
    paymentsCollection.query(Q.where('client_id', clientId)).observe(),
    programsCollection.query(Q.where('client_id', clientId)).observe(),
  ]).pipe(
    map(([clients, packages, payments, programs]) => {
      const client = clients[0];
      if (!client) return null;
      return deriveClientStatus(client, packages, payments, programs, Date.now());
    }),
  );
}
