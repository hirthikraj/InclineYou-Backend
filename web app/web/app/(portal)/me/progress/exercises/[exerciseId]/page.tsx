import { notFound } from 'next/navigation';

import { ExerciseProgress } from '@/components/portal/plan/ExerciseProgress';
import { requirePortalSession } from '@/lib/portal/session';
import { portalGet, settle, type ExerciseSeriesWire } from '@/lib/portal/plan-api';
import { Message } from '@/web-components/ui/Message';

export const metadata = { title: 'Exercise · InclineYou' };

/** `/me/progress/exercises/:id` — one movement over time: one point per session, its top set (api-contract 1.2, pp-l4). */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ exerciseId: string }> }) {
  const { exerciseId } = await params;
  const session = await requirePortalSession();
  if (!session.ok) return null;
  const r = await portalGet<ExerciseSeriesWire>(`/v1/portal/progress/exercises/${encodeURIComponent(exerciseId)}`);
  if (!r.ok && r.status === 404) notFound();
  const data = settle(r);
  if (!data) return <div className="body"><Message tone="warn">We couldn’t load this exercise just now. Reload in a moment.</Message></div>;
  return <div className="body"><ExerciseProgress data={data} /></div>;
}
