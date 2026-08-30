import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import {
  ClientDetailApiError,
  getClientDetail,
  getTrainerDetail,
  getClientFilePayload,
  type ClientFilePayload,
} from './client-api';

export type ClientFileResult =
  | { ok: true; payload: ClientFilePayload; now: number }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

export async function requireClientFile(clientId: string): Promise<ClientFileResult> {
  const token = await getToken();
  if (!token) redirect('/sign-in');

  try {
    // Quick auth check before loading the full payload
    const trainer = await getTrainerDetail();
    if (!trainer.setupComplete) redirect('/setup');

    // Verify the client exists and belongs to this trainer (404 if not)
    await getClientDetail(clientId);

    const payload = await getClientFilePayload(clientId);
    return { ok: true, payload, now: Date.now() };
  } catch (e) {
    if (e instanceof ClientDetailApiError) {
      if (e.status === 401) redirect('/sign-in');
      if (e.status === 404) return { ok: false, kind: 'not_found' };
      if (e.status === null) return { ok: false, kind: 'unreachable' };
      return { ok: false, kind: 'refused', status: e.status };
    }
    throw e;
  }
}
