import { byId } from '../../../registry';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { SpecTable } from '../../chrome/Docs';
import { ScreenSheetSpecimen } from './ScreenSheetSpecimen';

/**
 * Screen sheet — a whole phone screen of a task.
 *
 * Written 21 Nov 2026 for the assessment template editor on a phone, where the
 * desk's 640px dialog left the measurements below the fold. The specimen is live.
 */
export function ScreenSheetEntry() {
  const entry = byId('c-screensheet')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/ScreenSheet.tsx</code> },
        { k: 'Class', v: <code>.scrsh</code> },
        { k: 'Element', v: <><code>&lt;div role=&quot;dialog&quot;&gt;</code>, header and one scroller</> },
        { k: 'Used in', v: '/clients/assessments/templates (phone)' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            Press <i>Measurements</i> to drill in and the back chevron or <i>Done</i> to return. The
            body enters from the side moved to, opens at its top, and focus lands on the new heading.
          </>
        }
      >
        <Bench style={{ alignItems: 'stretch' }}>
          <Cell label="a summary and one drill-in screen" stretch>
            <ScreenSheetSpecimen />
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="A screen, not a box"
        lede={
          <>
            <code>c-modal</code> is a box over a page with its own scroller and a pinned foot. On a phone that
            is a border, a dimmed page and a foot spending ~40% of the glass, and a body that scrolls inside
            a page that also scrolls. Here the header carries the way back and the one verb, and the body is
            the only scroller. Use <code>c-modal</code> on a desk and for a confirm; use this for a
            multi-part form below 620px.
          </>
        }
      />

      <Blk
        title="The caller holds the screen"
        lede={
          <>
            Pass each screen&rsquo;s <code>title</code>, <code>backLabel</code>, <code>onBack</code> and{' '}
            <code>action</code>, its key as <code>screen</code>, and which way the trainer moved as{' '}
            <code>direction</code> — <code>null</code> on the first screen, so opening the sheet does not
            slide in as though it had been navigated to. Draw it inside a <code>ModalHost</code> for the
            scrim, Escape and the focus trap, and decide in the host&rsquo;s <code>onClose</code> whether
            Escape means back one screen or close.
          </>
        }
      />

      <SpecTable
        rows={[
          { property: 'Header', value: '56px min', token: undefined, note: 'Plus `safe-area-inset-top`' },
          { property: 'Back control', value: '44×44', token: '--tx-r2', note: 'Chevron, named by `backLabel`' },
          { property: 'Title', value: '17px / 800', token: '--tx-brand', note: 'One line, ellipsised' },
          { property: 'Body padding', value: '16 · 16 · 28', token: undefined, note: 'Plus `safe-area-inset-bottom`' },
          { property: 'Entrance', value: '16px + fade', token: '--tx-t-base', note: 'None under reduced motion' },
          { property: 'Layer', value: 'z 41 · 61 in a frame host', token: undefined, note: 'Above `.scrim--frame` (60)' },
        ]}
      />
    </Cmp>
  );
}
