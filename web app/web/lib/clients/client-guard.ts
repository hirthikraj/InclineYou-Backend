import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import {
  ClientDetailApiError,
  getClientFilePayload,
  type ClientFilePayload,
  type ClientTab,
  type TabOptions,
} from './client-api';

export type ClientFileResult =
  | { ok: true; payload: ClientFilePayload; now: number }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

/** The header plus the open tab's own reads (R25). A client that isn't yours is a 404. */
export async function requireClientFile(
  clientId: string,
  tab: ClientTab,
  options: TabOptions = {},
): Promise<ClientFileResult> {
  if (!(await getToken())) redirect('/sign-in');
  try {
    const payload = await getClientFilePayload(clientId, tab, options);
    return { ok: true, payload, now: Date.now() };
  } catch (e) {
    if (e instanceof ClientDetailApiError) {
      if (e.status === 401) redirect('/sign-in');
      if (e.status === 404 || e.status === 400) return { ok: false, kind: 'not_found' };
      if (e.status === null) return { ok: false, kind: 'unreachable' };
      return { ok: false, kind: 'refused', status: e.status };
    }
    throw e;
  }
}
