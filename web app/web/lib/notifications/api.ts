import 'server-only';

import { api, ApiError } from '@/lib/http/client';

import type { BellWire } from './types';

/** The bell's two routes (api-contract 1.2, tr-b1): the list, and *I have looked*. */
export class NotificationApiError extends Error {
  constructor(readonly status: number | null) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'NotificationApiError';
  }
}

async function call<T>(path: string, method: 'GET' | 'POST'): Promise<T> {
  try {
    return await api<T>(path, { method });
  } catch (e) {
    if (e instanceof ApiError) throw new NotificationApiError(e.status);
    throw e;
  }
}

export const getBell = (limit = 30) => call<BellWire>(`/v1/notifications?limit=${limit}`, 'GET');

export const postSeen = () => call<void>('/v1/notifications/seen', 'POST');
