import { notFound, redirect } from 'next/navigation';

import { ReadBack } from '@/components/portal/assess/ReadBack';
import { Take } from '@/components/portal/assess/Take';
import { TopBar } from '@/components/shell/TopBar';
import type { AssessDetailWire } from '@/lib/portal/assess-api';
import { requirePortalSession } from '@/lib/portal/session';
import { portalGet, settle } from '@/lib/portal/plan-api';
import { Message } from '@/web-components/ui/Message';

export const metadata = { title: 'Assessment · InclineYou' };

/**
 * `/me/assessments/:id` — one assessment: the form to take while it is open, what was taken once it is done (api-contract 1.2, pa-l2). One
 * URL for both, so a link in a reminder or on Home is always right whatever state it has reached.
 */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePortalSession();
  if (!session.ok) return null;
  const r = await portalGet<AssessDetailWire>(`/v1/portal/assessments/${encodeURIComponent(id)}`);
  if (!r.ok && r.status === 404) notFound();
  const a = settle(r);
  if (!a) {
    return (
      <>
        <TopBar crumb="Assessment" title="Assessment" />
        <main className="main" id="main-content"><div className="body"><Message tone="warn">We couldn’t load this assessment just now. Reload in a moment — nothing has been lost.</Message></div></main>
      </>
    );
  }
  if (a.state === 'done' && a.readings === undefined) redirect('/me/progress/assessments');
  const first = (session.me.trainer?.name ?? 'Your trainer').split(' ')[0];
  return (
    <>
      <TopBar crumb="Assessment" title={a.name} />
      <main className="main" id="main-content">
        <div className="body">{a.state === 'open' ? <Take a={a} trainerFirstName={first} /> : <ReadBack a={a} />}</div>
      </main>
    </>
  );
}
