import { byId } from '../../../registry';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { SpecTable } from '../../chrome/Docs';
import { NumPadSpecimen } from './NumPadSpecimen';

/**
 * Number pad — numbers typed with a thumb.
 *
 * Written 21 Nov 2026 for the workout console on a phone. The specimen is live.
 */
export function NumPadEntry() {
  const entry = byId('c-numpad')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/NumPad.tsx</code> },
        { k: 'Class', v: <code>.npad</code> },
        { k: 'Element', v: <>a docked <code>role=&quot;group&quot;</code>, portalled to the body</> },
        { k: 'Used in', v: '/sessions/:id/log (phone)' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            Tap <i>Load kg</i> or <i>Reps</i> to choose the field; the first key replaces its value and the next
            ones append. The chips step it. The verb under the keys is the screen&rsquo;s own.
          </>
        }
      >
        <Bench style={{ alignItems: 'stretch' }}>
          <Cell label="a load and reps, the console's pair" stretch>
            <NumPadSpecimen />
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="Instead of the phone's keyboard, not beside it"
        lede={
          <>
            The field it serves is <code>readOnly</code> with <code>inputMode=&quot;none&quot;</code>, so focusing it
            raises the pad and never the OS keyboard. Use it where a number is entered repeatedly on a phone
            and the same few steps recur; a one-off number in a form is still a <code>c-field</code>. It is not
            a dialog: the page above stays readable, and Escape or the chevron closes it.
          </>
        }
      />

      <SpecTable
        rows={[
          { property: 'Keys', value: '3 × 4, 52px tall', token: '--tx-surface-2', note: 'Mono 22px; ⌫ and the decimal point' },
          { property: 'Field', value: '52px, 20px figure', token: '--tx-mono', note: 'Active: an ink ring' },
          { property: 'Chips', value: '40px pills', token: '--tx-line-strong', note: 'One step each, floored at the field’s min' },
          { property: 'Verb', value: '52px, full width', token: '--tx-accent', note: 'The one lime fill' },
          { property: 'Layer', value: 'z 19, fixed bottom', token: undefined, note: 'Above the console’s bar (18)' },
        ]}
      />
    </Cmp>
  );
}
