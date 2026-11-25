import 'server-only';

import { api, ApiError } from '@/lib/http/client';
import type { BusinessWire } from './types';

/** bz-a1. `null` when it could not be read — the screens say so rather than draw an empty business. */
export async function getBusiness(): Promise<BusinessWire | null> {
  try {
    return await api<BusinessWire>('/v1/business');
  } catch (error) {
    if (error instanceof ApiError) return null;
    throw error;
  }
}
