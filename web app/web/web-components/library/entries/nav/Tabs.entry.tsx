import { PageTabs } from '@/components/shell/PageTabs';

import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

const CLIENT_TABS = [
  { key: 'overview', label: 'Overview', href: '#c-tabs' },
  { key: 'sessions', label: 'Sessions', href: '#c-tabs', count: 34 },
  { key: 'payments', label: 'Payments', href: '#c-tabs' },
  { key: 'notes', label: 'Notes', href: '#c-tabs', count: 3 },
];

const MONEY_TABS = [
  { key: 'ledger', label: 'Payments', href: '#c-tabs' },
  { key: 'owed', label: 'Pending', href: '#c-tabs', count: 4 },
  { key: 'gym', label: 'Gym share', href: '#c-tabs' },
  { key: 'gst', label: 'GST', href: '#c-tabs' },
  { key: 'reports', label: 'Reports', href: '#c-tabs', count: 0 },
];

export function TabsEntry() {
  const entry = byId('c-tabs')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>components/shell/PageTabs.tsx</code> },
        { k: 'Class', v: <code>.ph__tabs</code> },
        { k: 'Height', v: '36px' },
        { k: 'Max', v: '6' },
        { k: 'URL', v: 'a path segment' },
      ]}
    >
      <Blk title="Specimen" lede="The application’s own PageTabs, imported.">
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <div className="col gap4" style={{ width: '100%' }}>
            <PageTabs tabs={CLIENT_TABS} current="overview" label="Client file" />
            <PageTabs tabs={MONEY_TABS} current="owed" label="The money book" />
          </div>
        </Bench>
      </Blk>

      <Blk
        title="A zero count is not drawn"
        lede={
          <>
            The <b>Reports</b> tab above carries <code>count: 0</code> and shows no badge. The product&rsquo;s
            own comment says why: <i>&ldquo;a strip that says Pending 0 has spent a badge to say nothing
            happened&rdquo;</i> &mdash; the same rule the <b>Count badge</b> entry documents, already enforced
            here.
          </>
        }
      />

      <Blk
        title="A tab is a path segment, not a hidden panel"
        lede={
          <>
            <code>/clients/cl-006/information</code> is a place. That is what makes the back button work through a
            client file, and what makes a tab linkable &mdash; a trainer can send somebody straight to the
            payments tab.
          </>
        }
      >
        <p className="blk__p">
          Which is also why the component is a <code>&lt;nav&gt;</code> of links rather than a{' '}
          <code>role=&quot;tablist&quot;</code> of buttons. ARIA tabs promise arrow-key navigation between
          panels that never leave the page; these navigate. Claiming the pattern would describe behaviour this
          strip does not have.
        </p>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Height', value: '36px' },
            { property: 'Max', value: '6', note: 'Past that the strip scrolls, and a scrolled tab is a hidden one' },
            { property: 'Current', value: <code>aria-current=&quot;page&quot;</code>, note: 'Plus the underline' },
            { property: 'Count', value: 'omitted at zero', note: 'Never drawn as “0”' },
            {
              property: 'Element',
              value: (
                <>
                  <code>&lt;nav&gt;</code> of links
                </>
              ),
              note: 'Not a tablist. These navigate',
            },
            { property: 'Label', value: 'required', note: 'What the strip is a set of tabs FOR' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: <PageTabs tabs={CLIENT_TABS.slice(0, 3)} current="overview" label="Client file" />,
            caption: 'Three views of one client, each with its own URL. The counts say which are worth opening.',
          }}
          no={{
            figure: (
              <PageTabs
                tabs={[
                  { key: 'a', label: 'Overview', href: '#c-tabs' },
                  { key: 'b', label: 'Sessions', href: '#c-tabs' },
                  { key: 'c', label: 'Payments', href: '#c-tabs' },
                  { key: 'd', label: 'Notes', href: '#c-tabs' },
                  { key: 'e', label: 'Programs', href: '#c-tabs' },
                  { key: 'f', label: 'Measurements', href: '#c-tabs' },
                  { key: 'g', label: 'Files', href: '#c-tabs' },
                  { key: 'h', label: 'Settings', href: '#c-tabs' },
                ]}
                current="a"
                label="Client file"
              />
            ),
            caption:
              'Eight tabs. Past six the strip scrolls, and a tab that has to be scrolled to is a tab the trainer does not know exists — which is a worse hiding place than a menu.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
