'use client';

import type { NewClientData } from '@/lib/clients/new-api';

import { AddClientFlow } from './AddClientFlow';

/**
 * The roster's *Add client* button, as a right-hand dialog.
 *
 * Everything this used to hold — the four steps, the ascent band, the phone
 * check, the three writes — is `AddClientFlow`, which `/clients/new` renders
 * too. This file is the dialog SHELL and nothing else; see that component's
 * header for why there is one implementation and two shells rather than the
 * two ~800-line copies that were here before.
 *
 * `now` is still taken and still unused. `Clients.tsx` passes it and the flow
 * has never read it — the drawer has no clock — so it stays on the prop type
 * rather than being removed from a caller this pass did not open.
 */
export function AddClientDrawer({
  data,
  onClose,
}: {
  data: NewClientData;
  now: number;
  onClose: () => void;
}) {
  return <AddClientFlow data={data} shell="drawer" onClose={onClose} />;
}
