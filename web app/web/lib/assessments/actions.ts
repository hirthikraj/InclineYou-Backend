'use server';

import { revalidatePath } from 'next/cache';

import { api, ApiError } from '@/lib/http/client';
import type { AnswerEntry, AssessmentDetailWire } from './detail';
import type { AssessmentWire, QuestionWire, ScheduleWire, TemplateWire } from './vocab';

/**
 * THE ASSESSMENT WRITE PATH.
 *
 * One verb per route on the 1.1 wire, and one shape of failure. What is worth
 * stating before any of them is the thing the model already says twice: **a
 * template is a blueprint and an assessment is a copy of one.** Nothing here
 * reaches from a template into a check-in already sent — editing a template a
 * client is halfway through answering must not grow them a twelfth question.
 *
 * ── AND NOTHING HERE COLLECTS HEALTH DATA, OR A PHOTOGRAPH ──────────────────
 *
 * The measurement catalogue is twenty-one girths, weights and timed movements,
 * fixed, in `mock/assessment-catalog.ts`, and a trainer cannot add to it. That
 * is not only a protocol argument: **a free-text measurement is the door
 * through which *left knee, no deep squats* becomes a column**, and the
 * standing rule — no injuries, no conditions, no medications — is a legal
 * exclusion rather than a deferral. The question bank is closed for the same
 * reason, and a trainer's own questions are free text the product classifies as
 * nothing, exactly as a client note is.
 *
 * There is no progress-photo block on this path and there must not be one. It
 * was built and removed on 19 Sep 2026: **no progress photos** is the standing
 * rule beside *no BMI category*, a photograph of somebody's body is a consent
 * problem of a different kind from a tape reading, and this product has no
 * image store to put one in. See `AssessmentTemplateRow`.
 */

export interface WriteResult<T = void> {
  ok: boolean;
  message?: string;
  /** The refusal's `code`, for a caller that branches (`PRECONDITION_FAILED`, `NOTHING_ENTERED`). */
  code?: string;
  data?: T;
}

/**
 * A failure, in the trainer's words.
 *
 * The 1.1 backend sends the sentence it means (`detail`, RFC 7807) and a
 * `code`, so a 400 or a 409 now says WHAT was wrong — *readings.hip: this
 * assessment does not ask for it* — instead of the pre-1.1 "was refused".
 * That sentence is shown when there is one; the status-shaped fallbacks below
 * are only for the cases where nothing answered or the body had none.
 */
function fail(error: unknown, subject: string): WriteResult<never> {
  if (!(error instanceof ApiError)) throw error;
  const { status, problem } = error;
  const code = problem.code;
  if (status === null) {
    return { ok: false, code, message: `${subject} could not reach the server. Nothing changed.` };
  }
  if (status === 401) return { ok: false, code, message: 'Your session expired. Sign in again.' };
  if (status === 412 || code === 'PRECONDITION_FAILED') {
    return {
      ok: false,
      code: 'PRECONDITION_FAILED',
      message: 'Changed on another device or tab. Reload to see it — nothing was overwritten.',
    };
  }
  if (status === 404) return { ok: false, code, message: `${subject}: that row is no longer there.` };
  if (problem.detail && status >= 400 && status < 500) return { ok: false, code, message: problem.detail };
  return { ok: false, code, message: `${subject} did not save. Nothing changed.` };
}

/**
 * Both tabs, on every write.
 *
 * The list and the shelf are two routes and one set of facts: renaming a
 * template renames nothing already sent but DOES change the row the other tab
 * draws, and scheduling a check-in changes the count on the tab a trainer is
 * not looking at. Revalidating the page they happened to be on would leave the
 * strip's own badge stale — which is the badge that sent them there.
 */
function refresh(clientId?: string): void {
  revalidatePath('/clients/assessments');
  revalidatePath('/clients/assessments/templates');
  revalidatePath('/clients/assessments/[id]', 'page');
  if (clientId) revalidatePath(`/clients/${clientId}/assessments`);
}

export interface TemplateDraft {
  name: string;
  description: string;
  measurements: { on: boolean; keys: string[] };
  questions: { on: boolean; items: QuestionWire[] };
}

/** `description` is sent as null when blank: the wire stores *none* as null. */
function body(draft: TemplateDraft) {
  return { ...draft, name: draft.name.trim(), description: draft.description.trim() || null };
}

/**
 * The name is the one field with a rule, and it is checked HERE as well as on
 * the server — an empty name is the one refusal the client can word better
 * than a generic 400 and save the round trip for.
 */
function checkName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'An assessment needs a name.';
  if (trimmed.length > 120) return 'That name is too long — keep it under 120 characters.';
  return null;
}

export async function createTemplate(draft: TemplateDraft): Promise<WriteResult<TemplateWire>> {
  const bad = checkName(draft.name);
  if (bad) return { ok: false, message: bad };
  try {
    const row = await api<TemplateWire>('/v1/assessment-templates', { method: 'POST', body: body(draft) });
    refresh();
    return { ok: true, data: row };
  } catch (error) {
    return fail(error, 'That assessment');
  }
}

/**
 * A WHOLE-BODY REPLACE, never a patch of one block, and CONDITIONAL.
 *
 * The editor holds the entire draft in the browser and saves it as a unit —
 * two granularities of write against one jsonb blob is how a half-saved
 * template happens. `version` is the one the editor loaded, sent as `If-Match`:
 * a form edited in another tab since is a 412 the editor can name, not a
 * last-save-wins that quietly drops the other tab's questions.
 */
export async function saveTemplate(
  id: string,
  version: string,
  draft: TemplateDraft,
): Promise<WriteResult<TemplateWire>> {
  const bad = checkName(draft.name);
  if (bad) return { ok: false, message: bad };
  try {
    const row = await api<TemplateWire>(`/v1/assessment-templates/${id}`, {
      method: 'PUT',
      body: body(draft),
      headers: { 'if-match': `"${version}"` },
    });
    refresh();
    return { ok: true, data: row };
  } catch (error) {
    return fail(error, 'That assessment');
  }
}

export async function deleteTemplate(id: string): Promise<WriteResult> {
  try {
    await api(`/v1/assessment-templates/${id}`, { method: 'DELETE' });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error, 'That assessment');
  }
}

/**
 * Give a client one assessment — for a date, or (`dueOn` today) to take now.
 * `dueOn` is a calendar date and is left out for *today in the workspace's
 * zone*, which the server knows and this server's clock does not. Sending to
 * the client is not in v1, so there is no `sendNow`: the backend refuses the
 * key by name.
 */
export async function scheduleAssessment(input: {
  clientId: string;
  templateId: string;
  dueOn?: string;
}): Promise<WriteResult<AssessmentWire>> {
  if (!input.clientId) return { ok: false, message: 'Pick a client first.' };
  if (!input.templateId) return { ok: false, message: 'Pick an assessment first.' };
  try {
    const row = await api<AssessmentWire>('/v1/assessments', {
      method: 'POST',
      body: { id: crypto.randomUUID(), ...input },
    });
    refresh(input.clientId);
    return { ok: true, data: row };
  } catch (error) {
    return fail(error, 'That assessment');
  }
}

/** Put a client on a cycle — every `intervalDays`, the first one booked now. */
export async function startCycle(input: {
  clientId: string;
  templateId: string;
  intervalDays: number;
  firstDueOn?: string;
}): Promise<WriteResult<ScheduleWire>> {
  if (!input.clientId) return { ok: false, message: 'Pick a client first.' };
  if (!input.templateId) return { ok: false, message: 'Pick an assessment first.' };
  try {
    const row = await api<ScheduleWire>('/v1/assessment-schedules', {
      method: 'POST',
      body: { id: crypto.randomUUID(), ...input },
    });
    refresh(input.clientId);
    return { ok: true, data: row };
  } catch (error) {
    return fail(error, 'That cycle');
  }
}

/** `nextDueOn` and/or `intervalDays`. Ending is its own verb. */
export async function updateCycle(
  id: string,
  version: string,
  change: { nextDueOn?: string; intervalDays?: number },
  clientId?: string,
): Promise<WriteResult<ScheduleWire>> {
  try {
    const row = await api<ScheduleWire>(`/v1/assessment-schedules/${id}`, {
      method: 'PATCH',
      body: change,
      headers: { 'if-match': `"${version}"` },
    });
    refresh(clientId);
    return { ok: true, data: row };
  } catch (error) {
    return fail(error, 'That cycle');
  }
}

export async function endCycle(id: string, clientId?: string): Promise<WriteResult<ScheduleWire>> {
  try {
    const row = await api<ScheduleWire>(`/v1/assessment-schedules/${id}/end`, { method: 'POST', body: {} });
    refresh(clientId);
    return { ok: true, data: row };
  } catch (error) {
    return fail(error, 'That cycle');
  }
}

export async function deleteCycle(id: string, clientId?: string): Promise<WriteResult> {
  try {
    await api(`/v1/assessment-schedules/${id}`, { method: 'DELETE' });
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error, 'That cycle');
  }
}

/** Move an assessment's date. A cycle's open one also moves the cycle's next date. */
export async function moveAssessment(
  id: string,
  version: string,
  dueOn: string,
  clientId?: string,
): Promise<WriteResult<AssessmentWire>> {
  try {
    const row = await api<AssessmentWire>(`/v1/assessments/${id}`, {
      method: 'PATCH',
      body: { dueOn },
      headers: { 'if-match': `"${version}"` },
    });
    refresh(clientId);
    return { ok: true, data: row };
  } catch (error) {
    return fail(error, 'That assessment');
  }
}

/**
 * Remove an assessment. On a cycle's open one the server books the next at
 * `dueOn + interval` and sends it back, so the list can show it.
 */
export async function deleteAssessment(
  id: string,
  clientId?: string,
): Promise<WriteResult<{ next: AssessmentWire | null }>> {
  try {
    const res = await api<{ next: AssessmentWire | null }>(`/v1/assessments/${id}`, { method: 'DELETE' });
    refresh(clientId);
    return { ok: true, data: res };
  } catch (error) {
    return fail(error, 'That assessment');
  }
}

/**
 * THE TAKE SCREEN'S ONE WRITE — save for later, finish, or correct.
 *
 * The whole entry is replaced, so `version` (the one the take screen loaded,
 * then the one each save returned) is REQUIRED as `If-Match`: a second tab
 * saving over a newer entry would silently lose real measurements. On
 * success the full detail comes back with its new version, which the caller
 * keeps for the next save.
 */
export async function saveEntry(
  id: string,
  version: string,
  entry: {
    readings: Record<string, number>;
    answers: Record<string, AnswerEntry>;
    complete: boolean;
  },
  clientId?: string,
): Promise<WriteResult<AssessmentDetailWire>> {
  try {
    const row = await api<AssessmentDetailWire>(`/v1/assessments/${id}/entry`, {
      method: 'PUT',
      body: entry,
      headers: { 'if-match': `"${version}"` },
    });
    refresh(clientId);
    return { ok: true, data: row };
  } catch (error) {
    return fail(error, 'That entry');
  }
}
