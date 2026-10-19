import { ClientPrograms } from '@/components/programs/ClientPrograms';
import { Unavailable } from '@/components/today/Unavailable';
import { requireClientPrograms } from '@/lib/programs/guard';

/**
 * `/programs` — **every client's copy**, and Fitness' first page.
 *
 * ── THIS ROUTE CHANGED HANDS, 22 SEP 2026 ────────────────────────────────────
 *
 * It drew the trainer's shelf of blueprints until now; that screen is
 * `/programs/templates` and the move is argued in `lib/programs/tabs.ts` and in
 * `ClientPrograms.tsx`. The short version is that a program in this product is
 * the copy a client is on — `apply` writes an independent row and nothing
 * reaches back through `template_id` — so the page named after them was listing
 * the other table, and the copies had no list at all.
 *
 * `/programs/exercises`, `/programs/certified` and now `/programs/templates`
 * are sibling STATIC segments and win over `[templateId]` by the App Router's
 * own precedence, which is safe here only because a template id is a uuid and
 * can never be any of those three literal strings. That was a two-child note
 * when this file was the shelf; it is a three-child note now, and the same
 * property makes it safe. The mock's router carries the same ordering one layer
 * down, where the check is manual rather than the framework's.
 *
 * ── ONE READ ─────────────────────────────────────────────────────────────────
 *
 * `requireClientPrograms` is this screen. It also read the template shelf, for
 * nothing but the integer on the *Templates* tab — three backend queries (rows,
 * tree counts, assignments) kept for a `.length`. That badge was dropped on 18
 * Oct 2026 rather than given a count endpoint; the Templates page already draws
 * no count on this tab, so the strip stays symmetrical.
 *
 * `force-dynamic` because every figure on the list is a statement about `now`:
 * the stamp on each row is relative, the guard reads a cookie, and a cached
 * page would report *today* on a programme edited last week.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Programs · Fitness · InclineYou' };

export default async function Page() {
  const result = await requireClientPrograms();

  if (!result.ok) {
    return (
      <Unavailable
        kind={result.kind === 'missing' ? 'refused' : result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }

  return (
    <ClientPrograms
      data={result.data}
      /* THE GUARD'S CLOCK, read beside the rows it dates. `Guarded<T>` carries
         the argument for why it is not read here and not inside the list. */
      now={result.now}
    />
  );
}
