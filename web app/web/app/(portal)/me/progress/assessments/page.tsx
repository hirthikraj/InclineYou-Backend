import { AssessList } from '@/components/portal/assess/AssessList';
import { requirePortalSession } from '@/lib/portal/session';
import { portalGet, settle } from '@/lib/portal/plan-api';
import type { AssessPageWire, TemplateWire } from '@/lib/portal/assess-api';
import { Message } from '@/web-components/ui/Message';

export const metadata = { title: 'Assessments · InclineYou' };

/** `/me/progress/assessments` — what is waiting, what is done, and starting one of your own (api-contract 1.2, pa-l1 and pa-l3). */
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const session = await requirePortalSession();
  if (!session.ok) return null;
  const { cursor } = await searchParams;
  const [open, done] = await Promise.all([
    portalGet<AssessPageWire>('/v1/portal/assessments?state=open&limit=20&include=counts'),
    portalGet<AssessPageWire>(`/v1/portal/assessments?state=done&limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
  ]);
  const o = settle(open);
  const d = settle(done);
  if (!o || !d) return <div className="body"><Message tone="warn">We couldn’t load your assessments just now. Reload in a moment — nothing has been lost.</Message></div>;
  const templates = o.canStart ? settle(await portalGet<{ items: TemplateWire[] }>('/v1/portal/assessment-templates'))?.items ?? [] : [];
  const first = (session.me.trainer?.name ?? 'Your trainer').split(' ')[0];
  return <div className="body"><AssessList open={o.items} done={d.items} counts={o.counts ?? { open: o.items.length, done: d.items.length }} templates={templates} nextCursor={d.nextCursor} trainerFirstName={first} /></div>;
}
