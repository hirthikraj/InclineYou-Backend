'use server';

import { revalidatePath } from 'next/cache';

import { getToken } from '@/lib/auth/session';
import type { QuestionWire, TemplateWire } from './vocab';

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';
const TIMEOUT_MS = 8_000;

/**
 * THE ASSESSMENT WRITE PATH.
 *
 * Five verbs against three routes, and one shape of failure. What is worth
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
  data?: T;
}

class WriteError extends Error {
  constructor(readonly status: number | null) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
  }
}

async function send<T>(path: string, method: string, body?: unknown): Promise<T | null> {
  const token = await getToken();
  if (!token) throw new WriteError(401);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new WriteError(null);
  }
  if (!res.ok) throw new WriteError(res.status);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T | null;
}

function fail(error: unknown, subject: string): WriteResult<never> {
  if (error instanceof WriteError) {
    if (error.status === null) {
      return { ok: false, message: `${subject} could not reach the server. Nothing changed.` };
    }
    if (error.status === 401 || error.status === 403) {
      return { ok: false, message: 'Your session expired. Sign in again.' };
    }
    if (error.status === 404) {
      return { ok: false, message: `${subject}: that row is no longer there.` };
    }
    /* Trap 31 — this backend answers a `ResponseStatusException` with no
       `detail`, so the service's own sentence never arrives. What is said here
       is what the CLIENT knew before it sent, which is the only honest thing
       available until the endpoint grows a typed exception. */
    if (error.status === 400) {
      return { ok: false, message: `${subject} was refused. Check the name and try again.` };
    }
  }
  return { ok: false, message: `${subject} did not save. Nothing changed.` };
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
function refresh(): void {
  revalidatePath('/clients/assessments');
  revalidatePath('/clients/assessments/templates');
}

export interface TemplateDraft {
  name: string;
  description: string;
  measurements: { on: boolean; keys: string[] };
  questions: { on: boolean; items: QuestionWire[] };
}

/**
 * The name is the one field with a rule, and it is checked HERE as well as on
 * the server.
 *
 * Not because the server cannot be trusted — because of trap 31 again: an empty
 * name refused over the wire comes back as *was refused*, and refused over a
 * name is the one case where the caller can say something better.
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
    const row = await send<TemplateWire>('/v1/assessment-templates', 'POST', {
      ...draft,
      name: draft.name.trim(),
    });
    refresh();
    return { ok: true, data: row ?? undefined };
  } catch (error) {
    return fail(error, 'That assessment');
  }
}

/**
 * A WHOLE-BODY REPLACE, never a patch of one block.
 *
 * The editor holds the entire draft in the browser and saves it as a unit —
 * `WorkoutBuilder`'s rule, and the mock's own note says why: two granularities
 * of write against one jsonb blob is how a half-saved template happens. The
 * cost is the ordinary one: two trainers editing one template, last save wins.
 */
export async function saveTemplate(
  id: string,
  draft: TemplateDraft,
): Promise<WriteResult<TemplateWire>> {
  const bad = checkName(draft.name);
  if (bad) return { ok: false, message: bad };
  try {
    const row = await send<TemplateWire>(`/v1/assessment-templates/${id}`, 'PUT', {
      ...draft,
      name: draft.name.trim(),
    });
    refresh();
    return { ok: true, data: row ?? undefined };
  } catch (error) {
    return fail(error, 'That assessment');
  }
}

export async function deleteTemplate(id: string): Promise<WriteResult> {
  try {
    await send(`/v1/assessment-templates/${id}`, 'DELETE');
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error, 'That assessment');
  }
}

/**
 * Put a check-in on the board.
 *
 * `sendNow` is the trainer's call and not a consequence of the date — the
 * mock's own POST handler carries the argument: a check-in dated three weeks
 * out that goes out today is a client who has three weeks to find twenty
 * minutes for it, which is the whole point of scheduling one.
 */
export async function scheduleAssessment(input: {
  clientId: string;
  templateId: string;
  dueAt: string;
  sendNow: boolean;
}): Promise<WriteResult> {
  if (!input.clientId) return { ok: false, message: 'Pick a client first.' };
  if (!input.templateId) return { ok: false, message: 'Pick an assessment first.' };
  try {
    await send('/v1/assessments', 'POST', input);
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error, 'That check-in');
  }
}

/**
 * Mark a returned check-in read, or park it unread again.
 *
 * Both directions are real. The bell's panel already works this way, and for
 * the same reason: a state that can only be entered is a state a trainer stops
 * using the moment they open one row by accident.
 */
export async function setRead(id: string, read: boolean): Promise<WriteResult> {
  try {
    await send(`/v1/assessments/${id}`, 'PATCH', { read });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error, 'That check-in');
  }
}

export async function deleteAssessment(id: string): Promise<WriteResult> {
  try {
    await send(`/v1/assessments/${id}`, 'DELETE');
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error, 'That check-in');
  }
}
