import { PageTabs } from '@/components/shell/PageTabs';
import { SubTabs } from '@/web-components/ui/SubTabs';

import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

const TOP = [
  { key: 'programs', label: 'Programs', href: '#c-subtabs' },
  { key: 'templates', label: 'Templates', href: '#c-subtabs', count: 6 },
];

const LOWER = [
  { key: 'mine', label: 'My templates', href: '#c-subtabs' },
  { key: 'certified', label: 'InclineYou templates', href: '#c-subtabs', count: 12 },
];

/**
 * Sub-tabs — written 22 Sep 2026 for `/programs`, when *Templates* grew two
 * shelves under it and the page needed a second level that could not be
 * mistaken for the first.
 */
export function SubTabsEntry() {
  const entry = byId('c-subtabs')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/SubTabs.tsx</code> },
        { k: 'Class', v: <code>.subtabs</code> },
        { k: 'Element', v: <><code>&lt;nav&gt;</code> of <code>&lt;Link&gt;</code></> },
        { k: 'Height', v: '32px · 38 coarse' },
        { k: 'Selected', v: <code>aria-current=&quot;page&quot;</code> },
        { k: 'Used in', v: '/programs/templates · /programs/certified' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            The two levels as the page draws them: <code>c-tabs</code> above,{' '}
            <code>c-subtabs</code> below. The upper strip says which noun — the programmes clients
            are on, or the blueprints they came from; the lower one says <b>whose shelf</b>.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <div className="col" style={{ width: '100%' }}>
            <PageTabs tabs={TOP} current="templates" label="Fitness" />
            <SubTabs tabs={LOWER} current="mine" label="Template shelves" />
          </div>
        </Bench>
      </Blk>

      <Blk
        title="Two underline strips read as one that wrapped"
        lede={
          <>
            What makes a tab legible is that the underlined word is where you are and nothing above
            it is making the same claim. Draw <code>c-tabs</code> twice and the reader has two
            identical strips with no mark anywhere saying which owns which — so the second level
            takes a different shape rather than a smaller copy of the first.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <div className="col" style={{ width: '100%' }}>
                <PageTabs tabs={TOP} current="templates" label="Fitness, do" />
                <SubTabs tabs={LOWER} current="mine" label="Template shelves, do" />
              </div>
            ),
            caption:
              'An underline over a pill row. Two levels, two shapes, and the lower one reads as a control sitting inside the page the strip above it selected.',
          }}
          no={{
            figure: (
              <div className="col" style={{ width: '100%' }}>
                <PageTabs tabs={TOP} current="templates" label="Fitness, do not" />
                <PageTabs tabs={LOWER} current="mine" label="Template shelves, do not" />
              </div>
            ),
            caption:
              'Four underlined words in two rows. Nothing says the lower pair belongs to the upper right-hand one, and the second underline marks nothing the first has not already marked.',
          }}
        />
      </Blk>

      <Blk
        title="Links, not a Filter segment — the shape is shared and the promise is not"
        lede={
          <>
            <code>c-segment</code> is the same picture: pills, one of them an ink plate. Its pills
            are <code>&lt;button&gt;</code>s over data the page already holds, wrapped in a{' '}
            <code>role=&quot;radiogroup&quot;</code> with roving <code>tabindex</code>, arrow keys
            and <code>aria-checked</code> — the correct story for <i>pick one of five things in
            front of you</i>, and a promise this component cannot keep.
          </>
        }
      >
        <p className="blk__p">
          These are page loads: the panel is not there until the server sends it.{' '}
          <code>c-tabs</code>&rsquo; own header settles it for the strip above — <i>a nav of links
          is what these are, and a screen reader that announces them as links is telling the truth
          about what pressing one does</i> — and the same sentence decides it here. So:{' '}
          <code>aria-current=&quot;page&quot;</code> rather than <code>aria-checked</code>, a{' '}
          <code>&lt;nav&gt;</code> rather than a radiogroup, and one tab stop per tab, because they
          are separate destinations and the honest count of destinations is all of them.
        </p>
        <p className="blk__p">
          The <code>label</code> matters more here than on the strip above: there are two{' '}
          <code>&lt;nav&gt;</code>s on the page now, and it is what tells a screen reader&rsquo;s
          landmark list which is which.
        </p>
      </Blk>

      <Blk
        title="Selected is an ink plate, never the lime"
        lede={
          <>
            <code>#C6F24E</code> is this product&rsquo;s <b>action</b> colour, and on the screen
            this was written for the primary verb — <i>New program</i> — sits 200px up and to the
            right in exactly that lime. A selected tab takes no action, so it must not be drawn in
            the colour that does. <code>c-segment</code> reached the same answer from the same
            argument; the two ink tokens are each other&rsquo;s opposite, so the pair passes AA in
            both themes by construction.
          </>
        }
      />

      <SpecTable
        rows={[
          { property: 'Height', value: '32px', token: undefined, note: '38 under `pointer:coarse`, where the padding opens with it' },
          { property: 'Label', value: '12.5px / 500', token: '--tx-ink-2', note: '600 when selected — a weight step, not a second grey' },
          { property: 'Resting', value: 'surface + line', token: '--tx-line-strong', note: 'Quiet enough that the ink plate is the only thing the eye lands on' },
          { property: 'Selected', value: 'ink plate', token: '--tx-ink', note: 'Label steps to --tx-surface. Never the accent — see above' },
          { property: 'Count', value: '10.5px mono', token: 'currentColor', note: '.62 opacity, so one rule is legible on both grounds. Omitted at zero, `c-tabs`’ contract' },
          { property: 'Row', value: 'wraps at desk', token: undefined, note: 'Scrolls edge to edge under 900px: a wrapping chip row changes a toolbar’s height as its content changes' },
          { property: 'Position', value: 'outside `.ph`', token: undefined, note: '`.ph` is padding-bottom:0 so the active `.tab`’s underline lands on the rule — drawn inside, this row would push it off' },
        ]}
      />
    </Cmp>
  );
}
