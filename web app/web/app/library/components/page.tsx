import Link from 'next/link';

import { ENTRIES, GROUPS, extracted, updatedLabel } from '@/web-components/registry';
import { isWritten } from '@/web-components/library/entries';
import { Sec } from '@/web-components/library/chrome/Sec';
import { bySlug } from '@/web-components/library/system/parts';

/**
 * Part 3 — the component library.
 *
 * ── WHY THIS IS NO LONGER `/library` ────────────────────────────────────────
 *
 * It was, for as long as the library existed, and that was the quiet mistake:
 * a component catalogue standing at the design system's front door tells every
 * reader that components ARE the design system. They are one part of ten. The
 * catalogue did not shrink when it moved down a level — the other nine parts
 * were written, and this one stopped pretending to be all of them.
 *
 * What it still is: the design file's cards plus the ones built here, with two
 * columns the design file could not have — whether a component is a real shared
 * module yet, and whether its page has been written. Both numbers are computed,
 * never typed. A library that reports its own progress from a hand-kept list is
 * the first thing to go stale.
 */
export const metadata = { title: 'Component library · Design system' };

export default function Page() {
  const total = ENTRIES.length;
  const asComponent = extracted();
  const written = ENTRIES.filter((e) => isWritten(e.id)).length;

  return (
    <Sec part={bySlug('components')!}>
      <p className="doc__lede" style={{ marginTop: 22 }}>
        Every specimen on these pages is the component the application renders, imported from{' '}
        <code>web-components/</code>. Change one there and both this page and the running application change on
        the same save &mdash; not by convention, but because they are the same import.
      </p>

      <div className="grid3" style={{ gap: 14, alignItems: 'stretch', marginBottom: 26 }}>
        <div className="card" style={{ padding: '14px 16px' }}>
          <p className="cell__l">SHARED COMPONENT</p>
          <p style={{ fontFamily: 'var(--tx-brand)', fontSize: 26, fontWeight: 800, marginTop: 4 }}>
            {asComponent} <span style={{ fontSize: 15, color: 'var(--tx-ink-2)' }}>/ {total}</span>
          </p>
          <p className="libcard__d">
            Imported by both halves. Editing the file changes the app and this page together.
          </p>
        </div>
        <div className="card" style={{ padding: '14px 16px' }}>
          <p className="cell__l">PAGE WRITTEN</p>
          <p style={{ fontFamily: 'var(--tx-brand)', fontSize: 26, fontWeight: 800, marginTop: 4 }}>
            {written} <span style={{ fontSize: 15, color: 'var(--tx-ink-2)' }}>/ {total}</span>
          </p>
          <p className="libcard__d">Specimen, anatomy, variants, states, specifications, content, do and don&rsquo;t.</p>
        </div>
        <div className="card" style={{ padding: '14px 16px' }}>
          <p className="cell__l">STILL A CSS CLASS</p>
          <p style={{ fontFamily: 'var(--tx-brand)', fontSize: 26, fontWeight: 800, marginTop: 4 }}>
            {total - asComponent}
          </p>
          <p className="libcard__d">
            Written as raw markup at the call-site. Styling syncs from the design system; structure does not.
          </p>
        </div>
      </div>

      {GROUPS.map(({ group, entries }) => (
        <section className="cmp" key={group} id={`g-${group.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
          <div className="cmp__hd">
            <h3 className="cmp__n">{group}</h3>
            <span className="cmp__st cmp__st--stable">{entries.length}</span>
          </div>
          <div className="grid3" style={{ gap: 14, alignItems: 'stretch' }}>
            {entries.map((e) => (
              <div className="card libcard" key={e.id}>
                <div className="libcard__fig">
                  <div>
                    {/* The rewrite stamp sits BESIDE the impl chip rather than
                        under the name: both answer "can I trust the specimen",
                        and a reader checking that should not have to look in
                        two places. Absent on everything never rewritten, which
                        is most of the catalogue and the honest default. */}
                    {/* "Added" for a component that did not exist before,
                        "Upgraded" for one that was rewritten. Two fields rather
                        than one inferred from `badge`: `NEW` is historical on
                        several entries, so reading it as "added today" labelled
                        a rewrite as a new component. */}
                    {(e.added ?? e.updated) && (
                      <span
                        className="cmp__st cmp__st--stable"
                        title={`${e.added ? 'Added' : 'Rewritten'} ${updatedLabel((e.added ?? e.updated)!)}`}
                      >
                        {e.added ? 'Added' : 'Upgraded'} &middot;{' '}
                        {updatedLabel((e.added ?? e.updated)!)}
                      </span>
                    )}{' '}
                    <span
                      className={`cmp__st cmp__st--${e.impl === 'component' ? 'stable' : 'todo'}`}
                      title={
                        e.impl === 'component'
                          ? 'A shared module. The library renders the same import the app does.'
                          : 'Still a CSS class written as raw markup at the call-site.'
                      }
                    >
                      {e.impl === 'component' ? 'Component' : 'CSS only'}
                    </span>
                  </div>
                </div>
                <div className="libcard__m">
                  <Link className="libcard__n" href={`/library/${e.id}`}>
                    {e.name}
                    {e.badge ? <b> · {e.badge}</b> : null}
                  </Link>
                  <p className="libcard__d">{e.desc}</p>
                  <p className="libcard__d" style={{ opacity: isWritten(e.id) ? 1 : 0.55 }}>
                    {isWritten(e.id) ? 'Page written' : 'Page not written yet'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </Sec>
  );
}
