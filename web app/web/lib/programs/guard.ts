import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import {
  getBuilder,
  getShelf,
  ProgramsApiError,
  type BuilderData,
  type ShelfData,
} from './api';

export type Guarded<T> =
  | { ok: true; data: T }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number }
  | { ok: false; kind: 'missing' };

/**
 * The same shape `/today` and `/schedule` use, plus one member.
 *
 * `missing` exists because this route has an id in it: a template deleted in
 * another tab, or a link somebody kept, has to draw as *this program is gone*
 * rather than as *the server said no*. A 404 from the template read is the only
 * thing that produces it — every other refusal keeps its status, and anything
 * that is not a refusal or an unreachable server is rethrown, which is
 * `isApiFailure`'s line in `lib/auth/api.ts` and the lesson `/sign-in/role`
 * learned the expensive way.
 */
async function guard<T>(read: () => Promise<T>): Promise<Guarded<T>> {
  if (!(await getToken())) redirect('/sign-in');

  try {
    return { ok: true, data: await read() };
  } catch (error) {
    if (error instanceof ProgramsApiError) {
      if (error.status === 401 || error.status === 403) redirect('/sign-in');
      if (error.status === 404) return { ok: false, kind: 'missing' };
      return error.status === null
        ? { ok: false, kind: 'unreachable' }
        : { ok: false, kind: 'refused', status: error.status };
    }
    throw error;
  }
}

export function requireShelf(): Promise<Guarded<ShelfData>> {
  return guard(getShelf);
}

export function requireBuilder(templateId: string): Promise<Guarded<BuilderData>> {
  return guard(() => getBuilder(templateId));
}
