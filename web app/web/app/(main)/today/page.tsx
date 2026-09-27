import { ApiLogConsole } from '@/components/dev/ApiLogConsole';
import { Today } from '@/components/today/Today';
import { apiLogEntries } from '@/lib/http/client';
import { Unavailable } from '@/components/today/Unavailable';
import { requireToday } from '@/lib/today/guard';

export const metadata = { title: 'Today · InclineYou' };

/**
 * Frames 1a–1d of `webapp-dashboard.html`, which are four STATES of one route
 * rather than four screens — a session running, a session started and never
 * opened, the day closed, and no clients at all. Which one is drawn is decided by
 * the deck, not by the URL, which is why there is one page here.
 *
 * Frame 2a, the ⌘K palette, opens over this one. Frame 3a — offline, with a sync
 * queue in the hero slot — is deliberately NOT built: the web app is online-only,
 * so a screen describing a local write queue would be describing an architecture
 * this half does not have. `AGENTS.md` carries that list.
 *
 * A failure the API can produce is rendered, not thrown — see `requireToday`. The
 * error boundary next door is for bugs, not for a restarting server.
 *
 * `force-dynamic` because the deck is a snapshot of a minute and `getToday` reads
 * a cookie; without it Next would try to prerender a page whose whole subject is
 * what time it is.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const result = await requireToday();
  /* Development only: the backend calls this render made, printed in the
     browser console — they never reach the Network tab. Read after
     `requireToday`, so every call has finished and is in the list. */
  const log = <ApiLogConsole entries={apiLogEntries()} page="/today" />;
  if (!result.ok) {
    return <>{log}<Unavailable kind={result.kind} status={result.kind === 'refused' ? result.status : undefined} /></>;
  }
  return <>{log}<Today data={result.data} /></>;
}
