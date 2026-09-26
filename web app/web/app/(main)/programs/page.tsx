import { ClientPrograms } from '@/components/programs/ClientPrograms';
import { Unavailable } from '@/components/today/Unavailable';
import { requireClientPrograms, requireShelf } from '@/lib/programs/guard';

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
 * ── TWO READS, AND THE SECOND IS A TAB'S BADGE ───────────────────────────────
 *
 * `requireClientPrograms` is this screen. `requireShelf` is read only for the
 * integer on the *Templates* tab, and it is guarded rather than awaited with
 * the other: a shelf that will not load must not take the programme list down
 * with it — the copies are still there and still the point of this screen — so
 * its failure is an absence, which is the one thing `PageTabs` draws nothing
 * for.
 *
 * It is the fat read for that purpose and knowingly so: `getShelf` fetches a
 * name for every exercise on the shelf. `getCertifiedShelf` has the same
 * problem in reverse and solves it with a second bare `/v1/templates` call;
 * doing better here means a count endpoint, and the note that turned that down
 * on the old `/programs` still applies — five rows is not worth one.
 *
 * `force-dynamic` because every figure on the list is a statement about `now`:
 * the stamp on each row is relative, the guard reads a cookie, and a cached
 * page would report *today* on a programme edited last week.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Programs · Fitness · InclineYou' };

export default async function Page() {
  const [result, shelf] = await Promise.all([requireClientPrograms(), requireShelf()]);

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
      templateCount={shelf.ok ? shelf.data.templates.length : null}
      /* THE GUARD'S CLOCK, read beside the rows it dates. `Guarded<T>` carries
         the argument for why it is not read here and not inside the list. */
      now={result.now}
    />
  );
}
