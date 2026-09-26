import Link from 'next/link';

import { Blk } from '@/web-components/library/chrome/Blk';
import { Sec, Tbl, Tk } from '@/web-components/library/chrome/Sec';
import { bySlug } from '@/web-components/library/system/parts';
import { ENTRIES, GROUPS } from '@/web-components/registry';

/**
 * Part 9 — documentation.
 *
 * ── THE PART THAT IS USUALLY A LINK TO A WIKI ───────────────────────────────
 *
 * And a wiki is where a design system's documentation goes to stop being true:
 * nothing about it fails when the code moves under it. So this page documents
 * the two things that cannot rot — the file layout, which a reader can check in
 * a second, and the commands, which fail loudly when they are wrong — and it
 * points at the code for everything else.
 *
 * The one genuinely important thing here is the LOOP: how a change made in the
 * design system reaches the running application, and what stops the two halves
 * drifting when nobody is watching. That is a mechanism, not a convention, and
 * it is the reason this library can claim the specimens are live.
 */
export const metadata = { title: 'Documentation · Design system' };

const PLACES = [
  [
    'design-system/webapp/webapp/assets/webapp.css',
    'The design system itself — tokens, every component’s rules, both themes. A designer edits this file.',
  ],
  [
    'web/app/styles/webapp.css',
    'Generated. What the application reads. Never edited by hand: `sync-design.mjs` overwrites it.',
  ],
  ['web/app/styles/library-chrome.css', 'Generated. The library’s own chrome, kept out of the product stylesheet.'],
  ['web/web-components/ui/', 'One file per component. Both halves import from here.'],
  ['web/web-components/registry.ts', 'The catalogue: id, name, group, one-line definition.'],
  ['web/web-components/library/entries/', 'One page per component — specimen, anatomy, variants, states, specs, do and don’t.'],
  ['web/web-components/library/system/', 'The nine non-component parts: this taxonomy, and the token reader they are drawn from.'],
  ['design-system/webapp/webapp/UIUX-SKILL.md', 'The usability gate a component passes before it ships.'],
];

const COMMANDS = [
  ['npm run sync:design', 'Carry the design system into the application stylesheet, once.'],
  ['npm run design', 'The same, on every save. This is the one to run during a design pass.'],
  ['npm run check:design', 'Fail if the generated copy is stale. For CI.'],
  ['npm run check:components', 'Fail if a file grew a new hand-written component.'],
  ['npm run check:components -- --list', 'Every hand-written occurrence, and which component owns it.'],
  ['npm run check:components -- --update', 'Record the new floor after converting call-sites.'],
];

export default function Page() {
  return (
    <Sec part={bySlug('documentation')!}>
      <Blk
        title="The loop"
        tag="how an edit reaches the product"
        lede={
          <>
            One direction, no copying, and a check at the end that fails rather than drifts. This is the
            mechanism that lets the rest of this library claim its specimens are live.
          </>
        }
      >
        <ol
          style={{
            display: 'grid',
            gap: 10,
            margin: '4px 0 0',
            padding: 0,
            listStyle: 'none',
            counterReset: 'loop',
          }}
        >
          {[
            <>
              A value or a rule changes in <code>design-system/webapp/webapp/assets/webapp.css</code> — the
              file a designer owns.
            </>,
            <>
              <code>sync-design.mjs</code> strips the parts that exist to <i>present</i> the design (the
              review chrome, this library&rsquo;s own chrome) and writes the rest to{' '}
              <code>web/app/styles/webapp.css</code>. Section numbering is preserved through the gaps, so
              every comment in the codebase that cites a section still points somewhere.
            </>,
            <>
              Next is already watching that file, so the change reaches the browser without a reload. Run{' '}
              <code>npm run design</code> during a pass and the two halves are genuinely one thing rather
              than two that agree when somebody remembers a command.
            </>,
            <>
              Structure lives in <code>web-components/ui/</code>, which both the application and this library
              import. There is no second copy to update.
            </>,
            <>
              <code>check:design</code> fails if the generated copy is stale; <code>check:components</code>{' '}
              fails if a screen grew a new hand-written control. Neither is a convention.
            </>,
          ].map((step, i) => (
            <li
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '26px minmax(0,1fr)',
                gap: 12,
                alignItems: 'start',
                fontSize: 'var(--tx-body)',
                lineHeight: 1.6,
                color: 'var(--tx-ink-2)',
              }}
            >
              <span
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 26,
                  height: 26,
                  borderRadius: 'var(--tx-r1)',
                  background: 'var(--tx-surface-3)',
                  fontFamily: 'var(--tx-mono)',
                  fontSize: 11,
                  color: 'var(--tx-ink)',
                }}
              >
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </Blk>

      <Blk
        title="Using a component"
        lede={
          <>
            Reach for <code>ui/</code> first. Hand-written markup beside a component that already exists is
            not a shortcut — it is a second definition that stops changing when the first one does. There
            are {ENTRIES.length} of them across {GROUPS.length} groups; the index is{' '}
            <Link href="/library/components">part 3</Link>.
          </>
        }
      >
        <pre
          style={{
            margin: '2px 0 0',
            padding: '13px 15px',
            background: 'var(--tx-surface-2)',
            border: '1px solid var(--tx-line)',
            borderRadius: 'var(--tx-r2)',
            fontFamily: 'var(--tx-mono)',
            fontSize: 12,
            lineHeight: 1.7,
            color: 'var(--tx-ink)',
            overflowX: 'auto',
          }}
        >
          {`import { Button } from '@/web-components/ui/Button';

<Button variant="primary" onClick={record}>Record payment</Button>`}
        </pre>
        <p className="blk__p" style={{ marginTop: 14 }}>
          A component file decides which class combinations are legal and what will not compile. It does not
          own colour, size or spacing — those stay in the design system, where a designer can reach them.
        </p>
      </Blk>

      <Blk
        title="Adding one"
        tag="four files, in this order"
        lede={
          <>
            A screen that needs something the catalogue does not have gets a component <i>first</i>. A
            one-off written at the call-site and left there is exactly how a catalogue ends up complete on
            paper and absent from the product.
          </>
        }
      >
        <Tbl
          cols={['Step', 'Where']}
          rows={[
            { key: '1', cells: [<b key="k">1 · The rules</b>, <>§04 of the design system CSS, then <code>npm run sync:design</code>.</>] },
            { key: '2', cells: [<b key="k">2 · The component</b>, <><code>web-components/ui/Name.tsx</code> — the markup, the legal variants, and what will not compile.</>] },
            { key: '3', cells: [<b key="k">3 · The catalogue row</b>, <><code>registry.ts</code> — id, name, group, and the one-line definition that says when <i>not</i> to use it.</>] },
            { key: '4', cells: [<b key="k">4 · The page</b>, <><code>library/entries/&lt;group&gt;/Name.entry.tsx</code>, and its id in <code>entries/index.tsx</code>.</>] },
          ]}
        />
        <p className="blk__p" style={{ marginTop: 14 }}>
          A family is one component with parts, never one component per BEM element. <code>.tbl</code>,{' '}
          <code>.tbl__hd</code> and <code>.tbl__r</code> are one Table; registering three would put three
          answers to one question in the catalogue.
        </p>
      </Blk>

      <Blk
        title="The checks"
        tag="a ratchet, not a wall"
        lede={
          <>
            <code>component-baseline.json</code> records what is hand-written today, per file. The check
            fails only when a file goes <i>up</i> — a genuinely new hand-written control. Converting
            call-sites makes numbers fall and <code>--update</code> locks them there, so nobody is blocked on
            the backlog and nobody can add to it.
          </>
        }
      >
        <Tbl
          cols={['Command', 'What it does']}
          rows={COMMANDS.map(([c, v]) => ({ key: c, cells: [<Tk key="c">{c}</Tk>, v] }))}
        />
        <p className="blk__p" style={{ marginTop: 14 }}>
          What it cannot see: a genuinely new component invented at a call-site under a new class name looks
          like ordinary markup to a grep. That half of the rule is a review question, and this page is where
          the answer to it belongs.
        </p>
      </Blk>

      <Blk title="Where things live">
        <Tbl
          cols={['Path', 'What it is']}
          rows={PLACES.map(([p, v]) => ({ key: p, cells: [<Tk key="p">{p}</Tk>, v] }))}
        />
      </Blk>
    </Sec>
  );
}
