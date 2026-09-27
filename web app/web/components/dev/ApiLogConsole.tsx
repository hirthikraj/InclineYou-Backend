'use client';

import { useEffect } from 'react';

import type { ApiLogEntry } from '@/lib/http/client';

/**
 * Prints the backend calls the server made for this page into the BROWSER
 * console — the requests the Network tab cannot show, because only the Next
 * server talks to the API. One collapsed group per call: request body, response
 * body, status and duration.
 *
 * Development only: `apiLogEntries()` answers an empty list in production, and
 * this renders nothing either way.
 */
export function ApiLogConsole({ entries, page }: { entries: ApiLogEntry[]; page: string }) {
  useEffect(() => {
    if (entries.length === 0) return;
    console.groupCollapsed(`[api] ${page} · ${entries.length} backend call${entries.length === 1 ? '' : 's'}`);
    for (const e of entries) {
      const outcome = e.status === null ? `✗ no response` : String(e.status);
      const style = e.status !== null && e.status < 400 ? 'color:#2e7d32' : 'color:#c62828';
      console.groupCollapsed(`%c${outcome}%c ${e.method} ${e.url} · ${e.ms} ms`, style, '');
      if (e.requestBody !== undefined) console.log('request', e.requestBody);
      console.log('response', e.responseBody);
      if (e.error) console.log('error', e.error);
      console.groupEnd();
    }
    console.groupEnd();
  }, [entries, page]);

  return null;
}
