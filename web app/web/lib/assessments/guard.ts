import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import type { Query } from './address';
import type { AssessmentDetailWire } from './detail';
import type { AssessmentWire } from './vocab';
import {
  AssessmentsApiError,
  getAssessment,
  getClientAssessments,
  getAssessments,
  getAssessmentTemplates,
  type AssessmentsData,
  type TemplatesData,
} from './api';

export type AssessmentsResult =
  | { ok: true; data: AssessmentsData }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

export type TemplatesResult =
  | { ok: true; data: TemplatesData }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

export async function requireAssessments(q: Query): Promise<AssessmentsResult> {
  if (!(await getToken())) redirect('/sign-in');

  try {
    return { ok: true, data: await getAssessments(q) };
  } catch (error) {
    if (error instanceof AssessmentsApiError) {
      if (error.status === 401 || error.status === 403) redirect('/sign-in');
      return error.status === null
        ? { ok: false, kind: 'unreachable' }
        : { ok: false, kind: 'refused', status: error.status };
    }
    throw error;
  }
}

export async function requireAssessmentTemplates(): Promise<TemplatesResult> {
  if (!(await getToken())) redirect('/sign-in');

  try {
    return { ok: true, data: await getAssessmentTemplates() };
  } catch (error) {
    if (error instanceof AssessmentsApiError) {
      if (error.status === 401 || error.status === 403) redirect('/sign-in');
      return error.status === null
        ? { ok: false, kind: 'unreachable' }
        : { ok: false, kind: 'refused', status: error.status };
    }
    throw error;
  }
}

export type AssessmentResult =
  | { ok: true; data: AssessmentDetailWire; now: number }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

/**
 * `/clients/assessments/:id`, guarded the way its two siblings are.
 *
 * A 404 is REFUSED rather than special-cased, and that is deliberate: this
 * screen is reached from a list and from a link somebody may have kept, and a
 * check-in deleted since is exactly the second case. `Unavailable` already
 * draws a refusal with its status and a way back to the list, which is the
 * whole of what a *no such check-in* screen would say.
 */
export async function requireAssessment(id: string): Promise<AssessmentResult> {
  if (!(await getToken())) redirect('/sign-in');

  try {
    return { ok: true, data: await getAssessment(id), now: Date.now() };
  } catch (error) {
    if (error instanceof AssessmentsApiError) {
      if (error.status === 401 || error.status === 403) redirect('/sign-in');
      return error.status === null
        ? { ok: false, kind: 'unreachable' }
        : { ok: false, kind: 'refused', status: error.status };
    }
    throw error;
  }
}

/**
 * The client file's check-ins tab.
 *
 * `null` ON FAILURE RATHER THAN AN EMPTY LIST, and the tab draws the
 * difference. `/clients/:id/progress` establishes that a second read must not
 * take a tab down with it — but an empty array where the read failed is the
 * page saying *this client has never been asked for a measurement*, which is
 * the one sentence a screen must not invent. So the failure is a value.
 */
export async function loadClientAssessments(clientId: string): Promise<AssessmentWire[] | null> {
  if (!(await getToken())) redirect('/sign-in');
  try {
    return await getClientAssessments(clientId);
  } catch (error) {
    if (error instanceof AssessmentsApiError) {
      if (error.status === 401 || error.status === 403) redirect('/sign-in');
      return null;
    }
    throw error;
  }
}
