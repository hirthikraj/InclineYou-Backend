import { Pager } from '../../../ui/Pager';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/** Every specimen on this page points at the library's own route, so the links
 *  are real links — a bench that renders `href="#"` is a bench that cannot show
 *  hover, focus or a middle-click working. */
const href = (p: number) => (p === 0 ? '/library/c-pager' : `/library/c-pager?page=${p}`);

export function PagerEntry() {
  const entry = byId('c-pager')!;

  return (
    <Cmp
      entry={entry}
      status="beta"
      meta={[
        { k: 'Component', v: <code>ui/Pager.tsx</code> },
        { k: 'Class', v: <code>.pager</code> },
        { k: 'Pages are', v: 'links' },
        { k: 'Window', v: '7 slots' },
        { k: 'One page', v: 'renders nothing' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            Seventy-seven exercises at twenty-five to a page. The count line is the sentence —
            <b> 26&ndash;50 of 77 exercises</b> — and the numbers are how you act on it.
          </>
        }
      >
        <Bench pad={false} style={{ gap: 0 }}>
          <div style={{ width: '100%', background: 'var(--tx-surface)' }}>
            <Pager page={1} size={25} total={77} href={href} label="Exercise library pages" noun="exercises" />
          </div>
        </Bench>
      </Blk>

      <Blk
        title="The window, and why the ends are always drawn"
        lede={
          <>
            Fifty-three pages is fifty-three targets. The run is capped at seven slots: the current
            page, its neighbours, and <b>always the first and the last</b>. Those two are what a naive
            window drops, and they answer the only two questions a trainer deep in a list actually has
            — <i>take me back to the start</i> and <i>how deep does this go</i>.
          </>
        }
      >
        <Bench pad={false} style={{ gap: 0, flexDirection: 'column', alignItems: 'stretch' }}>
          <div style={{ width: '100%', background: 'var(--tx-surface)' }}>
            <Pager page={0} size={25} total={1324} href={href} label="First page" noun="exercises" />
            <Pager page={26} size={25} total={1324} href={href} label="A page in the middle" noun="exercises" />
            <Pager page={52} size={25} total={1324} href={href} label="Last page" noun="exercises" />
          </div>
        </Bench>
        <p className="blk__p">
          The run keeps its width as you walk through it, which is why the middle specimen fills toward
          the centre rather than drawing the two neighbours and stopping. A control that changes width
          as you use it moves the target you were about to press.
        </p>
      </Blk>

      <Blk
        title="The ends, and the current page"
        lede={
          <>
            <b>Previous</b> on page one is a disabled span — not a missing button and not a link to
            nowhere. Removing it shifts every other control sideways exactly when the trainer is
            learning where they are. The current page is a span too, for the sharper reason: a link
            that goes to the page you are already on is the one control a keyboard user cannot tell
            apart from the ones that move.
          </>
        }
      >
        <Bench pad={false} style={{ gap: 0, flexDirection: 'column', alignItems: 'stretch' }}>
          <div style={{ width: '100%', background: 'var(--tx-surface)' }}>
            <Pager page={0} size={25} total={77} href={href} label="At the first page" noun="exercises" />
            <Pager page={2} size={25} total={77} href={href} label="At the last page" noun="exercises" />
          </div>
        </Bench>
      </Blk>

      <Blk
        title="One page renders nothing"
        lede={
          <>
            Twelve exercises at twenty-five to a page is one page, and the component returns{' '}
            <code>null</code> rather than drawing <i>1&ndash;12 of 12</i> beside a lone <b>1</b>. That
            is the component&rsquo;s decision and not each caller&rsquo;s — <code>CountBadge</code>{' '}
            refuses a zero for the same reason. A control that is sometimes inert teaches the eye to
            skip the place the real one will appear.
          </>
        }
      >
        <Bench pad={false} style={{ gap: 0 }}>
          <div
            style={{
              width: '100%',
              background: 'var(--tx-surface)',
              padding: '14px 24px',
              fontSize: 12.5,
              color: 'var(--tx-ink-3)',
            }}
          >
            <Pager page={0} size={25} total={12} href={href} label="Twelve exercises" noun="exercises" />
            (nothing above this line — that is the specimen)
          </div>
        </Bench>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Row height', value: '52px', note: '10px above and below a 32px .btn' },
            { property: 'Padding', value: '10px 24px', note: '10px 14px under 620px' },
            { property: 'Top rule', value: '1px', token: '--tx-line' },
            { property: 'Count line', value: '12.5px', token: '--tx-ink-3', note: 'Tabular; margin-right:auto' },
            { property: 'Page target', value: '32 × 32px min', note: 'min-width, so 1 and 10 are the same target' },
            { property: 'Window', value: '7 slots', note: 'First and last always drawn; gaps are aria-hidden' },
            { property: 'Current page', value: <code>aria-current</code>, note: 'A span. Never a link to itself' },
            { property: 'Ends', value: <code>aria-disabled</code>, note: 'Drawn, never removed' },
            { property: 'Under 620px', value: 'run folds away', note: 'Prev/Next and the count still place you' },
            { property: 'Accessible name', value: <code>label</code>, note: 'Required. Two unnamed navs are two identical landmarks' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <div style={{ width: '100%', background: 'var(--tx-surface)' }}>
                <Pager page={1} size={25} total={77} href={href} label="Do" noun="exercises" />
              </div>
            ),
            caption:
              'A catalogue — something the trainer is searching rather than reading forward through. Position is the point: they can say where they found it, get back to it, and send it to someone.',
          }}
          no={{
            figure: (
              <div style={{ width: '100%', background: 'var(--tx-surface)', padding: '10px 24px' }}>
                <button className="btn" type="button">
                  Load more · 27 remaining
                </button>
              </div>
            ),
            caption:
              'Load more appends, so the list has no position at all — nothing to reload back into, nothing to link to, and no way back to the row you scrolled past. It is right for a feed read forward once, and a library is not that.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
