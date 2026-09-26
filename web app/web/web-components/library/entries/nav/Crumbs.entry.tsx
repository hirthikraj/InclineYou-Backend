import { Crumbs } from '../../../ui/Crumbs';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

export function CrumbsEntry() {
  const entry = byId('c-crumbs')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Crumbs.tsx</code> },
        { k: 'Class', v: <code>.crumbs</code> },
        { k: 'Max levels', v: '3' },
        { k: 'Used in', v: 'the top bar, every screen' },
      ]}
    >
      <Blk title="Specimen">
        <Bench style={{ gap: 26, alignItems: 'flex-start' }}>
          <Cell label="ONE LEVEL">
            <Crumbs items={[{ label: 'Business' }]} />
          </Cell>
          <Cell label="TWO">
            <Crumbs items={[{ label: 'Clients', href: '/clients' }, { label: 'Meera Krishnan' }]} />
          </Cell>
          <Cell label="THREE · THE CEILING">
            <Crumbs
              items={[
                { label: 'Clients', href: '/clients' },
                { label: 'Meera Krishnan', href: '/clients/cl-006' },
                { label: 'Bench press' },
              ]}
            />
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="The last one is the page, and says so"
        lede={
          <>
            The reference has the <code>&lt;nav&gt;</code> and its label right, and puts the current page in a
            bare <code>&lt;b&gt;</code>. That renders correctly and tells a reader nothing about{' '}
            <b>which</b> of the three is the one they are on. <code>aria-current=&quot;page&quot;</code> is the
            missing word.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '14px 16px' }}>
          <code style={{ fontSize: 12.5, lineHeight: 1.9 }}>
            &lt;nav aria-label=&quot;Breadcrumb&quot;&gt;&lt;ol&gt;
            <br />
            &nbsp;&nbsp;&lt;li&gt;&lt;a href=&quot;/clients&quot;&gt;Clients&lt;/a&gt;
            <br />
            &nbsp;&nbsp;&lt;li&gt;&lt;b aria-current=&quot;page&quot;&gt;Meera Krishnan&lt;/b&gt;
          </code>
        </Bench>
      </Blk>

      <Blk
        title="The separators are drawn, not typed"
        lede="They are CSS and aria-hidden, so a reader gets “Clients, Meera Krishnan” rather than “Clients slash Meera Krishnan”. A separator typed into the markup is a word in the announcement."
      />

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Levels', value: '3 max', note: 'Deeper than that and the bar wraps at 1280px' },
            { property: 'Element', value: <code>&lt;nav&gt;&lt;ol&gt;</code>, note: 'Labelled Breadcrumb' },
            { property: 'Current', value: <code>aria-current=&quot;page&quot;</code>, note: 'On the last item, which is never a link' },
            { property: 'Separator', value: 'CSS', note: 'aria-hidden. Not a character in the markup' },
            { property: 'Label', value: '13px / 600' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: <Crumbs items={[{ label: 'Clients', href: '/clients' }, { label: 'Meera Krishnan' }]} />,
            caption: 'Two levels, the parent a link, the current page marked. The trainer can get back to the roster in one press.',
          }}
          no={{
            figure: (
              <Crumbs
                items={[
                  { label: 'Home', href: '/' },
                  { label: 'Clients', href: '/clients' },
                  { label: 'Meera Krishnan', href: '/clients/cl-006' },
                  { label: 'Sessions', href: '#' },
                  { label: 'Bench press' },
                ]}
              />
            ),
            caption:
              'Five levels including a “Home” that is not a place in this product. The trail is now longer than the page title and wraps out of a 56px bar.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
