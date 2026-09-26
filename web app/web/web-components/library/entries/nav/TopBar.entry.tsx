'use client';

import { useState } from 'react';

import { TopBar } from '@/components/shell/TopBar';
import { WorkspaceHost } from '@/components/shell/WorkspaceHost';
import type { Workspace } from '@/lib/workspace/types';

import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/**
 * Top bar — the product's own component, imported.
 *
 * A client entry, because `TopBar` takes an `onSearch` handler and a function
 * cannot cross the server/client boundary as a prop.
 */
export function TopBarEntry() {
  const entry = byId('c-topbar')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>components/shell/TopBar.tsx</code> },
        { k: 'Class', v: <code>.top</code> },
        { k: 'Height', v: '56px' },
        { k: 'Contents', v: 'workspace switcher, palette, bell' },
      ]}
    >
      <Blk
        title="Specimen"
        lede="The application’s own bar, outside the shell — so it falls back to the breadcrumb. Press the search box."
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <div style={{ width: '100%', border: '1px solid var(--tx-line)', borderRadius: 'var(--tx-r3)', overflow: 'hidden' }}>
            <TopBar crumb="Today" onSearch={() => {}} />
          </div>
        </Bench>
      </Blk>

      <Blk
        title="The search box is a button"
        lede={
          <>
            It looks like a field and it is a <code>&lt;button&gt;</code>, because it does not filter anything
            &mdash; it <b>opens the palette</b>. A text input that swallows the first keystroke and then throws
            it away is the worst version of this control, and it is what a real input here would be.
          </>
        }
      >
        <p className="blk__p">
          Which means the palette is the search, and this is its affordance. The <b>Command palette</b> entry
          is where the searching itself is documented.
        </p>
      </Blk>

      <Blk title="At each destination">
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <div className="col gap3" style={{ width: '100%' }}>
            {['Today', 'Clients', 'Schedule', 'Business'].map((c) => (
              <div key={c} style={{ border: '1px solid var(--tx-line)', borderRadius: 'var(--tx-r3)', overflow: 'hidden' }}>
                <TopBar crumb={c} onSearch={() => {}} />
              </div>
            ))}
          </div>
        </Bench>
      </Blk>

      <Blk
        title="Inside the shell it is a workspace switcher"
        lede={
          <>
            A trainer can coach three ways at once &mdash; on their own, inside a <b>team</b>, on a{' '}
            <b>gym&rsquo;s floor</b> &mdash; and those are three <b>tenants</b>, not three screens. Which
            one is open scopes every figure on every screen, so it is said in the chrome that is on every
            screen. Press it; the rows switch.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <div className="col gap3" style={{ width: '100%' }}>
            <SwitcherBar workspaces={THREE} />
            {/*
              One book, no menu. A trainer with no team and no gym has exactly
              one, and a dropdown whose list has one row takes a click, opens a
              panel and offers nothing — the dead control this shell keeps
              deleting. The name is still the answer to *which book*, so it is
              a plain label, and the caret arrives the day a second one does.
            */}
            <SwitcherBar workspaces={ONE} />
          </div>
        </Bench>
        <p className="blk__p">
          The <b>breadcrumb</b> is what it replaced, and the trade is deliberate: with three tenants{' '}
          <i>where am I</i> is two questions, and the bar has room for one. The screen is already said by
          the rail&rsquo;s <code>aria-current</code> and by every page&rsquo;s own <code>&lt;h1&gt;</code>;
          the <b>book</b> was said nowhere. Outside the shell there is no host, so the crumb is drawn
          instead &mdash; the specimen at the top of this page.
        </p>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Height', value: '56px' },
            {
              property: 'Workspace',
              value: <code>.wsw</code>,
              note: 'Inside the shell. A menu button; the panel is portalled — see below',
            },
            {
              property: 'Crumb',
              value: <code>.crumbs</code>,
              note: 'The fallback, outside the shell. A nav landmark — see Breadcrumb',
            },
            { property: 'Search', value: 'a button', note: 'Opens the palette. Never an input' },
            { property: 'Shortcut', value: '⌘K', note: 'Shown in the box, so it is discoverable without a tooltip' },
            { property: 'Sticky', value: 'yes', note: 'The bar is the answer to “where am I” while a long table scrolls' },
            {
              property: 'Panel',
              value: <code>.menu--ws</code>,
              note: 'position:fixed, portalled to the body — §24 makes .top a stacking context',
            },
          ]}
        />
      </Blk>
    </Cmp>
  );
}

/**
 * A bar with a workspace host around it, over local state.
 *
 * `onSwitch` overrides the server action deliberately: a design review that
 * cannot click the control is reading a screenshot, and the real switch writes
 * a cookie and revalidates the whole layout — which is not a thing a component
 * bench is allowed to do to the page it is drawn on.
 */
function SwitcherBar({ workspaces }: { workspaces: Workspace[] }) {
  const [activeId, setActiveId] = useState(workspaces[0].id);
  /* The star is state here too, so the bench can demonstrate the one thing a
     screenshot of this control cannot: that pressing one releases the others. */
  const [defaultId, setDefaultId] = useState(workspaces[0].id);
  return (
    <div
      style={{
        width: '100%',
        border: '1px solid var(--tx-line)',
        borderRadius: 'var(--tx-r3)',
        overflow: 'hidden',
      }}
    >
      <WorkspaceHost
        workspaces={workspaces}
        activeId={activeId}
        defaultId={defaultId}
        onSwitch={setActiveId}
        onDefault={setDefaultId}
      >
        <TopBar crumb="Today" onSearch={() => {}} />
      </WorkspaceHost>
    </div>
  );
}

const THREE: Workspace[] = [
  { id: 'solo', kind: 'solo', name: 'Arun Prakash', role: 'Independent · just you' },
  { id: 'team:1', kind: 'team', name: 'Iron Yard Coaching', role: 'Team · 3 coaches · Owner' },
  { id: 'gym:1', kind: 'gym', name: 'Iron Yard, Anna Nagar', role: 'Gym · shared floor' },
];

const ONE: Workspace[] = [THREE[0]];
