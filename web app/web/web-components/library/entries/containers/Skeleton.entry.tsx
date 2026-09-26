import { Skeleton, SkeletonLine, SkeletonRow } from '../../../ui/Skeleton';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/**
 * Skeleton — the shape of the content that is coming.
 *
 * §24 wrote this component's specification in August 2026 and shipped no
 * component, so the rule sat in a comment while four lists answered a wait with
 * a sentence. This is that rule, as a thing a screen can import.
 */
export function SkeletonEntry() {
  const entry = byId('c-skeleton')!;

  /* The real library row is 48px with a 12.5px name over a 10.5px meta line —
     measured off `.wkl__w`, which renders 47.43px rather than the 48 it looks
     like — the point being that it was measured at all. */
  const widths = ['62%', '78%', '54%', '70%', '58%', '84%'];

  return (
    <Cmp
      entry={entry}
      status="beta"
      meta={[
        { k: 'Component', v: <code>ui/Skeleton.tsx</code> },
        { k: 'Class', v: <code>.skel</code> },
        { k: 'Parts', v: <><code>Row</code> · <code>Line</code></> },
        { k: 'Delay', v: '300ms, owned' },
        { k: 'Keyframes', v: <>none new &mdash; <code>tx-fade</code></> },
        { k: 'Used in', v: 'the workout builder’s library pane' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            Nine bones at the real row&rsquo;s height, with the line widths varied down the list.
            Identical widths read as a table; varied ones read as prose about to arrive.{' '}
            <code>delay={0}</code> here, because a bench that waits 300ms to draw its own specimen
            looks broken.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px', display: 'block' }}>
          <Cell label="THE EXERCISE LIBRARY, LOADING — 329px COLUMN, 47px ROWS" stretch>
            <div style={{ width: 314, border: '1px solid var(--tx-line)', borderRadius: 'var(--tx-r2)' }}>
              <Skeleton label="Loading the exercise library" delay={0}>
                {widths.map((w, i) => (
                  <SkeletonRow key={i} height={47}>
                    <SkeletonLine width={w} height={11} />
                    <SkeletonLine width="46%" height={8} />
                  </SkeletonRow>
                ))}
              </Skeleton>
            </div>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="The 300ms belongs to the component"
        lede={
          <>
            &sect;24&rsquo;s rule is <i>nothing under ~300ms</i>, and a skeleton that flashes for
            80ms is worse than no skeleton &mdash; a visible flicker reporting that something was
            slow when nothing was. The delay lives in <code>Skeleton</code> rather than in each
            caller, because a rule re-implemented at four call-sites is a rule three of them get
            wrong. The polite live region is mounted <b>empty</b> from the first render and filled
            when the bones appear, so the label arriving is a real content change &mdash; the
            console&rsquo;s rest clock records what happens when a live region is inserted with its
            content already in it.
          </>
        }
      />

      <DoDont
        yes={{
          figure: (
            <div style={{ width: '100%', border: '1px solid var(--tx-line)', borderRadius: 'var(--tx-r2)' }}>
              <Skeleton label="Loading" delay={0}>
                {['64%', '80%', '56%'].map((w, i) => (
                  <SkeletonRow key={i} height={47}>
                    <SkeletonLine width={w} height={11} />
                    <SkeletonLine width="46%" height={8} />
                  </SkeletonRow>
                ))}
              </Skeleton>
            </div>
          ),
          caption: (
            <>
              The row height and the rule are the REAL list&rsquo;s. Nothing moves when the content
              lands, and the wait says what is coming rather than that something is happening.
            </>
          ),
        }}
        no={{
          figure: (
            <div
              style={{
                width: '100%', border: '1px solid var(--tx-line)', borderRadius: 'var(--tx-r2)',
                height: 144, display: 'flex', alignItems: 'flex-start',
              }}
            >
              <p className="wkl__none">Loading the library&hellip;</p>
            </div>
          ),
          caption: (
            <>
              What every list in this product did until now: one 11.5px line in a 329&times;428px
              column. It is a spinner made of words &mdash; it reports a wait and describes nothing,
              and the pane jumps from one line to nine rows when the request lands.
            </>
          ),
        }}
      />

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Delay', value: '300ms', note: '§24’s floor, owned by the component. `delay={0}` opts out' },
            { property: 'Bone', value: '13% ink', note: 'color-mix against `--tx-ink`, so it lands the same distance from any surface and inverts on light' },
            { property: 'Plate', value: '+10% ink', note: 'Pulses over the base on `tx-fade` + `alternate`; the base never disappears' },
            { property: 'Measured', value: '1.44 → 1.93:1', note: 'Dark; 1.31 → 1.60 on light. It was `--tx-surface-2` over `--tx-surface-3` and measured 1.00:1 — the bone WAS the pane' },
            { property: 'Keyframes added', value: 'none', note: '§24 budgets 8 and 7 are spoken for — a shimmer would spend the spare on a placeholder' },
            { property: 'Reduced motion', value: 'steady', note: '§24’s global collapse lands the plate on `to{opacity:1}` — legible, not blank' },
            { property: 'Stagger', value: '0 / .14 / .28 / .42s', note: 'Off `nth-child` — one shared clock makes nine bars strobe' },
            { property: 'Row height', value: 'the caller’s', note: 'Measured off the real row. A guessed height is a layout shift with a nicer texture' },
            { property: 'Bones', value: <code>aria-hidden</code>, note: 'Nine rectangles announced one at a time is noise' },
            { property: 'Announcement', value: <code>role=&quot;status&quot;</code>, note: 'Mounted empty, filled with the bones — the thing a skeleton usually removes' },
          ]}
        />
      </Blk>
    </Cmp>
  );
}
