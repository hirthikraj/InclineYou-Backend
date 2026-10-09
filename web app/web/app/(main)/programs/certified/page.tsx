import { CertifiedShelf } from '@/components/programs/CertifiedShelf';
import { Unavailable } from '@/components/today/Unavailable';
import { getClientName } from '@/lib/programs/api';
import { requireCertifiedShelf } from '@/lib/programs/guard';

/**
 * `/programs/certified` — the catalogue a trainer copies from.
 *
 * ── THIS IS THE SECOND STATIC CHILD, AND THE FIRST ONE LEFT A NOTE ───────────
 *
 * `app/(main)/programs/page.tsx` warns that `/programs/exercises` is a sibling
 * STATIC segment winning over `[templateId]` by the App Router's own precedence,
 * and adds: *"worth knowing before anybody adds a second static child."* This is
 * that second child, and it is safe for the identical reason — a template id is a
 * uuid and can never be the literal string `certified`. There is a THIRD now,
 * `/programs/templates`, added on 22 Sep 2026 when this shelf and the trainer's
 * own became the two halves of one tab; same argument, same uuid.
 *
 * The mock's router carries the same ordering one layer down, where the check is
 * manual rather than the framework's: `templates/certified` is matched BEFORE
 * `templates/:id`, or `certified` is read as a template id and answers 404.
 *
 * `force-dynamic` because the catalogue's *You have a copy* state is computed
 * against the caller's own shelf — a cached page would offer *Use this* on a
 * program they copied a minute ago, which is the one state this screen exists to
 * get right.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'InclineYou templates · Fitness · InclineYou' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const forClient = typeof q.client === 'string' ? q.client : null;
  const result = await requireCertifiedShelf();

  if (!result.ok) {
    return (
      <Unavailable
        kind={result.kind === 'missing' ? 'refused' : result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }

  /* Who the trainer is choosing for, by first name; a failed read is an absence and the banner says *a client*. */
  const forClientName = forClient ? ((await getClientName(forClient))?.split(' ')[0] ?? null) : null;

  return <CertifiedShelf data={result.data} forClientName={forClientName} />;
}
