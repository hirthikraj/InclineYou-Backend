import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ENTRIES, byId } from '@/web-components/registry';
import { ENTRY_VIEWS } from '@/web-components/library/entries';
import { Cmp } from '@/web-components/library/chrome/Cmp';
import { Blk } from '@/web-components/library/chrome/Blk';
import { Viewport } from '@/web-components/library/chrome/Viewport';
import { familyReport } from '@/web-components/library/system/viewports';

/**
 * One component's page.
 *
 * The id is the design file's own anchor, so `webapp-c-actions.html#c-button`
 * and `/library/c-button` name the same thing — which is what lets a comment
 * written against the HTML still be followed here.
 */
export function generateStaticParams() {
  return ENTRIES.map((e) => ({ id: e.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = byId(id);
  return { title: entry ? `${entry.name} · Component library` : 'Component library' };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = byId(id);
  if (!entry) notFound();

  const View = ENTRY_VIEWS[entry.id];

  /* The catalogue's own `cls`, falling back to the id's stem. The fallback is
     the guess the stub below has always made and it is wrong more often than
     right — `c-button` is drawn by `.btn` — which is why 28 entries carry the
     class explicitly and why `familyReport` answers "did I find this class"
     separately from "where is it restyled". */
  const cls = entry.cls ?? entry.id.replace(/^c-/, '');
  const fam = familyReport(cls);

  if (View)
    return (
      <>
        <View />

        {/* AFTER the entry view and deliberately not inside `Cmp`.
            `/frame/[id]` renders the entry view itself, so a viewport mounted
            inside the shared chrome would frame a page containing its own
            frame, and then that one would too. Here the recursion cannot
            start: the frame route never renders this file. */}
        <Blk
          title="At both viewports"
          tag="the component, framed"
          lede={
            <>
              The same specimens above, in a real 390px viewport beside a real 1440px one. Not a narrowed
              column &mdash; a <code>@media</code> rule tests the viewport, so the only way to see what a
              phone gets is to give the page one.
            </>
          }
        >
          <Viewport src={`/frame/${entry.id}`} title={entry.name} />
          <p className="blk__p" style={{ marginTop: 18 }}>
            {!fam.found ? (
              <>
                <b>Breakpoints: not determined.</b> This page looks for <code>.{cls}</code>, derived from
                the catalogue id, and no rule in either stylesheet uses that class &mdash; this component
                is drawn under a different name. The frames above are still the truth; the missing thing is
                the list, not the behaviour. Reported rather than left blank, because an empty list here
                would otherwise read as &ldquo;identical at every width&rdquo;.
              </>
            ) : fam.crossings.length === 0 ? (
              <>
                <b>Crosses no breakpoint.</b> <code>.{cls}</code> is styled, and no width query restyles
                it: this component is the same object at 360 as at 1440, and whatever moves in the frames
                above moves because its container did.
              </>
            ) : (
              <>
                <b>Restyled at {fam.crossings.length} width{fam.crossings.length === 1 ? '' : 's'}:</b>{' '}
                {fam.crossings.map((b, i) => (
                  <span key={`${b.feature}${b.px}`}>
                    {i > 0 ? ', ' : ''}
                    <code>
                      {b.feature.startsWith('min') ? '≥' : '≤'}
                      {b.px}
                    </code>
                  </span>
                ))}
                . Read out of the stylesheets at build time, so a rung added tomorrow appears here without
                anybody editing this page.
              </>
            )}
            {fam.found && fam.container > 0 ? (
              <>
                {' '}
                It is also restyled by {fam.container} <code>@container</code>{' '}
                {fam.container === 1 ? 'query' : 'queries'}, which answer to the width of its own box
                rather than the window &mdash; so those fire in the frames above and would fire in a narrow
                column too. They are counted apart for that reason, and not added to the figure before them.
              </>
            ) : null}
          </p>
        </Blk>
      </>
    );

  /* The stub is a real page rather than a 404, because the catalogue is the work
     list: a component with no write-up still has to be findable, and what it
     says here is the next thing to do about it. */
  return (
    <Cmp
      entry={entry}
      status="todo"
      meta={[
        { k: 'Class', v: <code>.{entry.id.replace(/^c-/, '')}</code> },
        { k: 'Group', v: entry.group },
        { k: 'Documented in', v: <code>webapp-c-{entry.page}.html#{entry.id}</code> },
        { k: 'Implementation', v: entry.impl === 'component' ? 'Shared component' : 'CSS class only' },
      ]}
    >
      <Blk title="Not written yet">
        <p className="blk__p">
      This component is in the catalogue and has no page here. The reference draws it in{' '}
      <code>webapp-c-{entry.page}.html#{entry.id}</code>, which stays the authority until this page
      replaces it.
        </p>
        <p className="blk__p">
      {entry.impl === 'component' ? (
        <>
          It is already a shared module, so writing the page is all that is left — the specimens will
          render the same import the application does.
        </>
      ) : (
        <>
          It is still a CSS class the application writes as raw markup, so the page needs the component
          extracted into <code>web-components/ui/</code> first. Until then a specimen here would be a
          copy of the product&rsquo;s markup, and a copy can drift from it &mdash; which is the problem
          this library exists to end.
        </>
      )}
        </p>
        <p className="blk__p">
      <Link href="/library">Back to all components</Link>
        </p>
      </Blk>
    </Cmp>
  );
}
