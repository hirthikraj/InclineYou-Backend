import { Blk, Bench, Cell } from '../../chrome/Blk';
import { SpecTable, DoDont } from '../../chrome/Docs';
import { Slab } from '../../../ui/Slab';

/**
 * A SECTION, GROUPED BY A RULE INSTEAD OF A BOX.
 *
 * Written out of the 15 Sep 2026 `/today` pass, where it replaced the `.card` +
 * `.sh` + `.sh__l` trio the screen had been using to head each of its blocks.
 */
export function SlabEntry() {
  return (
    <>
      <Blk
        title="What it replaced"
        lede={
          <>
            `/today` stacked four <code>.card</code> containers down the page, which says
            &ldquo;four equal things&rdquo; about blocks the screen&rsquo;s own argument ranks by
            what it costs to ignore them. A box cannot say <i>third most important</i>; type and
            space can. So the only container a section gets here is a hairline above it.
          </>
        }
      >
        <Bench style={{ alignItems: 'stretch' }}>
          <Cell label="heading, count and an action" stretch>
            <Slab title="Needs you today" count={14} action={{ label: 'Full schedule', href: '/schedule' }}>
              <p className="small" style={{ paddingTop: 2 }}>The section&rsquo;s body goes here.</p>
            </Slab>
          </Cell>
        </Bench>
        <Bench style={{ alignItems: 'stretch' }}>
          <Cell label="heading alone, which most sections are" stretch>
            <Slab title="Today at a glance">
              <p className="small" style={{ paddingTop: 2 }}>No count and no action.</p>
            </Slab>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="The heading is a heading, and that is the point"
        lede={
          <>
            An eyebrow is a small uppercase tracked-out label above a section title. With one above
            every block, every section shouts at the same volume and none of them rank. Three were
            on `/today` at once.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <Slab title="The rest of today">
                <p className="small">17px at 650, on the type scale.</p>
              </Slab>
            ),
            caption:
              'One heading, in the document’s own type. It ranks against the headings above and below it.',
          }}
          no={{
            figure: (
              <div>
                <p className="sh__l" style={{ marginBottom: 6 }}>The rest of today</p>
                <p className="small">10.5px mono, tracked out to 1.155px.</p>
              </div>
            ),
            caption: 'A texture rather than a hierarchy. Every section reads at the same weight.',
          }}
        />
      </Blk>

      <Blk
        title="The action link is not the queue's disclosure"
        lede={
          <>
            <code>.slab__link</code> exists because <code>.atn__more</code> was borrowed for it
            first. That one is a FOOT control and carries a 10px top margin and 6px of vertical
            padding to stand itself off the last row; in a baseline-aligned header those made the
            band <b>39.8px tall for a 20.8px title</b> and dragged the heading 12px down with them.
            The header link has no margin and no vertical padding, and buys its tap target with a{' '}
            <code>::before</code> pad, which costs no layout.
          </>
        }
      />

      <SpecTable
        rows={[
          { property: 'Heading', value: '17px / 650 / -0.011em', token: '--tx-head', note: 'Inter, variable axis. 16px under 900px.' },
          { property: 'Count', value: '12.25px Archivo, tabular', token: '--tx-meta', note: 'A figure, not a coloured badge' },
          { property: 'Header band', value: '24px', token: undefined, note: 'min-height, so a section with no action matches one with' },
          { property: 'Rule above', value: '1px', token: '--tx-line', note: 'Dropped by `first`' },
          { property: 'Controls slot', value: '12px foot', token: undefined, note: '`.slab__ctl` owns the gap to the body, so a control never has to remember it' },
          { property: 'Rhythm', value: '26px margin, 14px padding', token: '--tx-s6', note: '20 / 12 under 900px' },
        ]}
      />
    </>
  );
}
