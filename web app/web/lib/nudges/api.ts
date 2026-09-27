import 'server-only';

import { getToken } from '@/lib/auth/session';
import { listAll } from '@/lib/http/client';

import type { NudgeLogEntry, NudgeTemplate } from './types';
import { TEMPLATE_ORDER } from './types';

/**
 * THE NUDGE DATA LAYER — the only place on this half that talks to
 * `/v1/nudge-templates` and `/v1/nudges`.
 *
 * `server-only`, like every other `api.ts` here: the JWT is in an httpOnly
 * cookie and never reaches browser JS, so a client component fetching this
 * directly would break the moment it left localhost and the fix would be a
 * backend CORS change.
 *
 * ── THREE READS, AND ONLY ONE OF THEM IS ON A HOT PATH ───────────────────────
 *
 * `listRecentNudges` is the tenth request `/today` makes and the only one this
 * feature adds to it. That is a deliberate cost and a small one: the response is
 * a week of nudge rows for one trainer — tens, not thousands — against a screen
 * whose existing budget argument is nine scoped requests rather than one
 * `/v1/sync/pull`. What it buys is the queue not raising a row about somebody
 * the trainer messaged yesterday, which is the difference between a list they
 * clear and a list they stop reading.
 *
 * `listClientNudges` is the client file's, one client, a year. `listTemplates`
 * is the settings screen's and is read on no other screen — a button does not
 * need the template to send it, because the server renders it.
 */

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';
const TIMEOUT_MS = 8_000;

export class NudgeApiError extends Error {
  constructor(
    readonly status: number | null,
    /** The server's own sentence, where it wrote one. See `detailOf`. */
    readonly detail?: string,
    readonly code?: string,
  ) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'NudgeApiError';
  }
}

/**
 * `ProblemDetail`'s `detail` and `code`, when the refusal carries them.
 *
 * Every 4xx from `NudgeRuleException` does — an unknown template, an empty body,
 * a client with no number on file — and each one is a sentence written for the
 * trainer. `lib/packs/api.ts` learned this the hard way: the server's reason
 * reached the log and never the screen, and a component that answers a specific
 * refusal with "that did not go through" has thrown away the useful half of the
 * response.
 */
async function refusal(res: Response): Promise<NudgeApiError> {
  try {
    const body = (await res.json()) as { detail?: string; code?: string };
    return new NudgeApiError(res.status, body?.detail, body?.code);
  } catch {
    return new NudgeApiError(res.status);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  if (!token) throw new NudgeApiError(401);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new NudgeApiError(null);
  }
  if (!res.ok) throw await refusal(res);

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/* ────────────────────────────────────────────────────────── the library ──── */

/**
 * All eight templates, the trainer's wording where they have saved one.
 *
 * Sorted against `TEMPLATE_ORDER` and then by whatever the server sent, so a
 * ninth template the backend adds lands at the bottom of the library rather than
 * vanishing — the list is the response's, and the order is only a preference
 * applied on top of it.
 */
export async function listTemplates(): Promise<NudgeTemplate[]> {
  const rows = await request<NudgeTemplate[]>('/v1/nudge-templates');
  const rank = (name: string) => {
    const i = TEMPLATE_ORDER.indexOf(name as (typeof TEMPLATE_ORDER)[number]);
    return i === -1 ? TEMPLATE_ORDER.length : i;
  };
  return [...(rows ?? [])].sort((a, b) => rank(a.name) - rank(b.name));
}

export async function saveTemplate(name: string, body: string): Promise<NudgeTemplate> {
  return request<NudgeTemplate>(`/v1/nudge-templates/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: JSON.stringify({ body }),
  });
}

export async function resetTemplate(name: string): Promise<NudgeTemplate> {
  return request<NudgeTemplate>(`/v1/nudge-templates/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

/* ────────────────────────────────────────────────────────── the history ──── */

/**
 * Everything sent across the roster in the last `days`.
 *
 * Defaulted to the cooldown window because that is what the caller that matters
 * is asking: Today wants to know who has already been contacted, not what was
 * said to them in March.
 *
 * ── IT NEVER THROWS ──────────────────────────────────────────────────────────
 *
 * A dashboard must not fail to render because a supporting read did. Nine
 * requests answer the day; this tenth answers "who did I already message", and
 * losing it degrades the queue's ranking rather than the screen. So an
 * unreachable server or a backend that predates V32 — where these routes 404 —
 * returns an empty list, and the queue behaves exactly as it did before this
 * feature existed. Every other read on `/today` still throws, which is correct:
 * none of them is optional.
 */
export async function listRecentNudges(days = 7): Promise<NudgeLogEntry[]> {
  try {
    // 1.1 (api-contract Today L9): `from` is a DATE in the workspace's
    // timezone — no query parameter carries an instant — and the list is a
    // paged `{items}` envelope. The row carries no body or client name; callers
    // here only need who and when. A day of slack on the Next server's clock is
    // harmless: the window only ranks the queue.
    const from = new Date(Date.now() - (days + 1) * 86_400_000).toISOString().slice(0, 10);
    // Through the common client (`listAll` → `api()`), so this read is logged like the rest of Today's.
    const rows = await listAll<RecentNudgeWire>(`/v1/nudges?from=${from}`);
    return rows.map((n) => ({
      id: n.id,
      clientId: n.clientId,
      clientName: '',
      templateName: n.template,
      templateLabel: n.template,
      channel: 'whatsapp_manual',
      status: n.reason,
      message: null,
      sentAt: n.sentAt,
    }));
  } catch {
    return [];
  }
}

/** `NudgeService.NudgeSummary` — one row of `GET /v1/nudges?from=`. */
interface RecentNudgeWire {
  id: string;
  clientId: string;
  template: string;
  reason: string;
  sentAt: number;
}

/**
 * One client's follow-up history, newest first. A year, because the client file
 * is where a trainer goes to ask "when did I last chase this" and the answer is
 * often months old.
 *
 * Same non-throwing contract as above and for the same reason: the file's six
 * tabs must render without it.
 */
export async function listClientNudges(clientId: string, days = 365): Promise<NudgeLogEntry[]> {
  try {
    return (
      (await request<NudgeLogEntry[]>(
        `/v1/clients/${encodeURIComponent(clientId)}/nudges?days=${days}`,
      )) ?? []
    );
  } catch {
    return [];
  }
}

/* ───────────────────────────────────────────────────────────── the send ──── */

export interface NudgeWire {
  nudgeId: string;
  whatsappUrl: string;
  message: string;
  sentAt: number;
}

/**
 * Draft a message and log it. The server renders from the trainer's template and
 * the client's live figures; nothing is sent, here or there.
 *
 * The rendered text is NOT passed in — see `NudgeController.SendNudgeRequest`.
 * A caller that could supply the sentence could put a number in it that
 * disagrees with the money book, and the caller most likely to is the screen
 * that has just done some arithmetic of its own.
 */
export async function postNudge(clientId: string, templateName: string): Promise<NudgeWire> {
  return request<NudgeWire>(`/v1/clients/${encodeURIComponent(clientId)}/nudge`, {
    method: 'POST',
    body: JSON.stringify({ templateName }),
  });
}
