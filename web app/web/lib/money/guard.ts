import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import { getMoney, MoneyApiError, type MoneyData } from './api';

export type MoneyResult =
  | { ok: true; data: MoneyData }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

export async function requireMoney(): Promise<MoneyResult> {
  if (!(await getToken())) redirect('/sign-in');

  let data: MoneyData;
  try {
    data = await getMoney();
  } catch (error) {
    if (error instanceof MoneyApiError) {
      if (error.status === 401 || error.status === 403) redirect('/sign-in');
      return error.status === null
        ? { ok: false, kind: 'unreachable' }
        : { ok: false, kind: 'refused', status: error.status };
    }
    throw error;
  }

  if (!data.trainer.setupComplete) redirect('/setup');

  return { ok: true, data };
}
