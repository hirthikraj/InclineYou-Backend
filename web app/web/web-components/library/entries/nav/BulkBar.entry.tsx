'use client';

import { useState } from 'react';

import { BulkBar } from '../../../ui/BulkBar';
import { Button } from '../../../ui/Button';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

export function BulkBarEntry() {
  const entry = byId('c-bulkbar')!;
  const [n, setN] = useState(3);

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/BulkBar.tsx</code> },
        { k: 'Class', v: <code>.bulk</code> },
        { k: 'Replaces', v: 'the toolbar, in place' },
        { k: 'Announced', v: 'the count' },
      ]}
    >
      <Blk title="Specimen" lede="Press the checkbox — it moves between all, some and none, and the bar announces the count each time.">
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <div style={{ width: '100%' }}>
            <BulkBar
              inline
              count={n}
              total={22}
              noun="clients"
              onSelectAll={() => setN((c) => (c === 22 ? 0 : 22))}
              actions={
                <>
                  <Button size="sm" variant="secondary">
                    Send a nudge
                  </Button>
                  <Button size="sm" variant="secondary">
                    Export
                  </Button>
                  <Button size="sm" variant="danger">
                    Archive
                  </Button>
                </>
              }
            />
          </div>
        </Bench>
      </Blk>

      <Blk
        title="In place, so nothing moves"
        lede={
          <>
            It takes the toolbar&rsquo;s position rather than appearing above or below it. A bar that pushes
            the table down by 48px makes <b>the row under the pointer a different row</b> &mdash; and the
            trainer&rsquo;s next click lands on a client they did not mean to touch.
          </>
        }
      />

      <Blk
        title="The count has to be said out loud"
        lede={
          <>
            The bar appearing is a visual event. <code>role=&quot;status&quot;</code> turns it into an
            announced one, and the count is why: a trainer about to archive in bulk needs the number{' '}
            <b>before</b> the verb, not after the confirm.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '14px 16px' }}>
          <code style={{ fontSize: 12.5 }}>announced: &ldquo;{n} clients selected&rdquo;</code>
        </Bench>
      </Blk>

      <Blk
        title="And the leading checkbox is indeterminate"
        lede={
          <>
            Some but not all is the one state a header checkbox exists to show, and the one JSX silently drops
            &mdash; <code>indeterminate</code> is a DOM property, not an attribute. Set it above to 3 of 22 and
            look at the box.
          </>
        }
      />

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Height', value: '48px', note: 'The toolbar’s. Nothing reflows' },
            { property: 'Position', value: 'in place', note: 'Replaces the toolbar, never stacks with it' },
            { property: 'Count', value: 'leading', note: 'Before the verbs, in a live region' },
            { property: 'Checkbox', value: 'tri-state', note: 'all · some (indeterminate) · none' },
            { property: 'Actions', value: '2–4', note: 'One may be danger. Never two' },
            { property: 'Live region', value: 'polite' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <div style={{ width: 340 }}>
                <BulkBar
                  inline
                  count={3}
                  total={22}
                  noun="clients"
                  actions={
                    <Button size="sm" variant="secondary">
                      Send a nudge
                    </Button>
                  }
                />
              </div>
            ),
            caption: 'The number, the noun, and what can be done to them. A trainer reads the bar and knows the blast radius.',
          }}
          no={{
            figure: (
              <div style={{ width: 340 }}>
                <BulkBar
                  inline
                  count={3}
                  total={22}
                  noun="items"
                  actions={
                    <>
                      <Button size="sm" variant="danger">
                        Archive
                      </Button>
                      <Button size="sm" variant="danger">
                        Delete
                      </Button>
                    </>
                  }
                />
              </div>
            ),
            caption:
              '“Items” instead of clients, and two destructive verbs side by side in the same red. Nothing distinguishes the recoverable action from the one that is not.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
