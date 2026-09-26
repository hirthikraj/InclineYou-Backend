import { notFound } from 'next/navigation';

import { PastPlan } from '@/components/portal/PastPlan';
import { PortalApiError, getPortalProgramById } from '@/lib/portal/api';
import { requirePortal } from '@/lib/portal/guard';

export const dynamic = 'force-dynamic';

/**
 * §4 · Plan → Past plans → one earlier block, in full.
 *
 * ── THE FULL OBJECT IS READ HERE AND NOWHERE ELSE ───────────────────────────
 *
 * The list is summaries — see `PortalProgramSummaryWire` — because three
 * programs, each with three days of six movements carrying a cue, a paragraph of
 * steps and a list of form pointers, is a large response for a screen whose job
 * is to say *there are two, and here is what they were called*. This route is
 * the one that needs the contents, and it needs one program's.
 *
 * ── A PROGRAM THAT IS NOT THEIRS IS A 404 ───────────────────────────────────
 *
 * The mock answers 404 rather than 403 for another client's id, which is the
 * shape `ClientNoteTest` pins on the trainer's half: asking about somebody
 * else's row should not confirm that it exists. Both land here as `notFound()`,
 * so the two are indistinguishable from outside — which is the point.
 *
 * `PortalApiError` is caught rather than thrown because the 404 IS the answer
 * for a stale bookmark; anything else is a real failure and the shell's error
 * boundary should see it.
 */
export async function generateMetadata(props: {
  params: Promise<{ programId: string }>;
}) {
  const result = await requirePortal();
  if (!result.ok) return { title: 'Plan · InclineYou' };
  const { programId } = await props.params;
  try {
    const program = await getPortalProgramById(programId);
    return { title: `${program.name} · Past plans · InclineYou` };
  } catch {
    return { title: 'Past plans · Plan · InclineYou' };
  }
}

export default async function Page(props: { params: Promise<{ programId: string }> }) {
  const result = await requirePortal();
  if (!result.ok) return null;
  const { me } = result;

  const { programId } = await props.params;

  let program;
  try {
    program = await getPortalProgramById(programId);
  } catch (e) {
    if (e instanceof PortalApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }

  /* Belt and braces: the route is under *Past plans*, so a live block reached
     through it would draw *Finished* on the plan somebody is currently on. The
     server already filters, and this is the one line that makes the URL unable
     to say otherwise. */
  if (program.status === 'active') notFound();

  return (
    <div className="body">
      <PastPlan me={me} program={program} />
    </div>
  );
}
