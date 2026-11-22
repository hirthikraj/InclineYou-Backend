import { notFound } from 'next/navigation';

import { LoadFailed } from '@/components/portal/LoadFailed';
import { PlanTree } from '@/components/portal/plan/PlanTree';
import { requirePortalSession } from '@/lib/portal/session';
import { portalGet, settle, type ProgramTreeWire } from '@/lib/portal/plan-api';

export const metadata = { title: 'Plan · InclineYou' };

/** `/me/plan/history/:id` — one plan, read-only (api-contract 1.2, pp-l2). Only the client's own; a template is never reachable. */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ programId: string }> }) {
  const { programId } = await params;
  const session = await requirePortalSession();
  if (!session.ok) return null;
  const r = await portalGet<ProgramTreeWire>(`/v1/portal/programs/${encodeURIComponent(programId)}`);
  if (!r.ok && r.status === 404) notFound();
  const tree = settle(r);
  if (!tree) return <LoadFailed what="this plan" retryHref={`/me/plan/history/${encodeURIComponent(programId)}`} />;
  return (
    <div className="body">
      <PlanTree tree={tree} trainerFirstName={(session.me.trainer?.name ?? 'Your trainer').split(' ')[0]} />
    </div>
  );
}
