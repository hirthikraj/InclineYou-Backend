import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import {
  getBuilder,
  getClientPlan,
  getClientPrograms,
  getCertifiedPreview,
  getCertifiedShelf,
  getShelf,
  ProgramsApiError,
  type BuilderData,
  type ClientPlanData,
  type ClientProgramsData,
  type CertifiedPreviewData,
  type CertifiedShelfData,
  type ShelfData,
} from './api';

export type Guarded<T> =
  /**
   * `now` COMES WITH THE DATA, which is `lib/clients/guard.ts`'s own shape.
   *
   * The shelf prints *edited today* / *3d ago*, so something has to read a
   * clock — and the two places that look obvious are both wrong. In the page's
   * JSX it is `Date.now()` during render, which the React compiler refuses
   * outright ("Cannot call impure function during render") and is right to: a
   * re-render would move the answer. Inside `Shelf` it is worse — that
   * component is server-rendered, so the value lands in the HTML and again at
   * hydration, and the two can fall either side of a day boundary.
   *
   * A guard is an async function and not a render, so the clock is read here,
   * once, at the same moment as the rows it is going to be compared against.
   */
  | { ok: true; data: T; now: number }
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
    return { ok: true, data: await read(), now: Date.now() };
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

/**
 * Every client's copy, for `/programs`.
 *
 * A sibling of `requireShelf` and not a branch of it: the two answer different
 * questions off different tables — *what have I written* against *who is
 * training on what* — and the shelf's read fetches a name for every exercise on
 * it to draw a builder this screen does not have.
 */
export function requireClientPrograms(): Promise<Guarded<ClientProgramsData>> {
  return guard(getClientPrograms);
}

export function requireBuilder(templateId: string): Promise<Guarded<BuilderData>> {
  return guard(() => getBuilder(templateId));
}

/**
 * The certified catalogue, and one certified program.
 *
 * Siblings rather than branches of `requireShelf`, and the `missing` member is
 * why `requireCertifiedTemplate` needs its own: this route has an id in it, so
 * a program we retired — or a link somebody kept — has to draw as *this program
 * is gone* rather than as *the server said no*.
 */
export function requireCertifiedShelf(): Promise<Guarded<CertifiedShelfData>> {
  return guard(getCertifiedShelf);
}

export function requireCertifiedTemplate(id: string): Promise<Guarded<CertifiedPreviewData>> {
  return guard(() => getCertifiedPreview(id));
}

/**
 * One client's own copy of a programme, for the builder at
 * `/clients/:clientId/program/:programId`.
 *
 * `missing` earns its keep twice over here: a programme that was cancelled and
 * cleaned up, and a programme reached through the WRONG client's URL — which
 * `getClientPlan` refuses with a 404 of its own rather than drawing one
 * person's prescription under another person's name.
 */
export function requireClientPlan(
  clientId: string,
  programId: string,
): Promise<Guarded<ClientPlanData>> {
  return guard(() => getClientPlan(clientId, programId));
}
