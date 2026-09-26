import { Programs } from '@/components/programs/Programs';
import { Unavailable } from '@/components/today/Unavailable';
import { requireCertifiedShelf, requireShelf } from '@/lib/programs/guard';

/**
 * `/programs/templates` — **the trainer's own blueprints**, with nothing open.
 *
 * ── THIS WAS `/programs` UNTIL 22 SEP 2026 ───────────────────────────────────
 *
 * The shelf did not change; the ADDRESS did. `/programs` is the list of what
 * clients are actually on now, and `lib/programs/tabs.ts` carries the whole
 * argument — the one-line version is that `apply` copies a blueprint into
 * `program` and from that moment the two are independent, so the page named
 * after the copies was listing the blueprints.
 *
 * It is the first of TWO shelves under *Templates*, drawn under a second strip:
 * this one and `/programs/certified`. That pair is the old *Programs ·
 * Templates* strip with one label renamed, and it is still one page seen twice
 * — both answer *which blueprint do I start from*.
 *
 * `templates` is a sibling STATIC segment and wins over `[templateId]` by the
 * App Router's own precedence, which is safe for the reason the other two are:
 * a template id is a uuid and can never be the literal string. The mock's
 * router carries the same ordering one layer down, where the check is manual —
 * `templates/certified` is matched BEFORE `templates/:id`.
 *
 * The shelf beside an empty pane. Opening one is `/programs/:id`, which is a
 * real route rather than a piece of client state, for the client file's reason:
 * the back button works between programs, a trainer can send somebody a link to
 * one, and the open program cannot disagree with the URL because there is only
 * one of them. That route did NOT move — a blueprint's own address is the id it
 * has always had.
 *
 * ── THE CATALOGUE IS FETCHED ONLY WHEN THE SHELF IS EMPTY ────────────────────
 *
 * First run offers three certified programs instead of a blank page, and that is
 * the one branch of this route that needs them. A trainer with six programs gets
 * a count for the tab strip out of the same read — but the read is skipped
 * entirely on the first render for nobody, because the count IS the read. The
 * cheaper shape would be a dedicated count endpoint; five rows is not worth one.
 */
export const metadata = { title: 'My templates · Fitness · InclineYou' };

export default async function Page() {
  const result = await requireShelf();
  if (!result.ok) {
    return (
      <Unavailable
        kind={result.kind === 'missing' ? 'refused' : result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }

  /* A catalogue that will not load must not take the trainer's own shelf down
     with it — their six programs are still there and still the point of this
     screen. So the read is guarded and its failure is an absence: no tab count,
     and first run falls back to the empty state it always had. */
  const catalogue = await requireCertifiedShelf();
  const certified = catalogue.ok ? catalogue.data.certified : [];

  return (
    <Programs
      data={result.data}
      open={null}
      /* Ranked by how many trainers have copied it, and nothing cleverer. Three,
         because the row holds three at 1440 and a fourth is below the fold on
         the screen whose whole job is the first impression. */
      recommended={[...certified]
        .sort((a, b) => (b.certified?.usedCount ?? 0) - (a.certified?.usedCount ?? 0))
        .slice(0, 3)}
      certifiedCount={catalogue.ok ? certified.length : null}
      /* THE GUARD'S CLOCK, read beside the rows it dates. `Guarded<T>` carries
         the argument for why it is not read here and not inside `Shelf`. */
      now={result.now}
    />
  );
}
