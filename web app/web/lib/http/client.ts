import 'server-only';

/**
 * The one thing every `lib/**\/api.ts` module's fetch wrapper duplicates:
 * send the request, time it out, log both sides, hand back the raw text.
 * Each module keeps its own error typing (a `TodayApiError`, a `MoneyApiError`
 * with refusal parsing, `auth/api.ts`'s problem-detail reader) on top of this —
 * that part is real behavior per screen, not boilerplate, so it stays put.
 */

const DEFAULT_TIMEOUT_MS = 8_000;

export interface ApiFetchOptions extends RequestInit {
  timeoutMs?: number;
}

export interface ApiFetchResult {
  res: Response;
  text: string;
}

/** Throws the *original* fetch error (abort, DNS, connection refused) — the
 *  caller decides what that means for its own error type. */
export async function apiFetch(url: string, options: ApiFetchOptions = {}): Promise<ApiFetchResult> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options;
  const method = init.method ?? 'GET';

  console.log(`[api] → ${method} ${url}`);

  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    console.log(`[api] ✗ ${method} ${url} — no response`, err);
    throw err;
  }

  const text = await res.text();
  console.log(`[api] ← ${res.status} ${method} ${url}`, text);

  return { res, text };
}
