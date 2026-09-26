import { SetHeader, SetRows } from '../../../ui/SetRow';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

const SETS = [
  { n: 1, load: '62.5', reps: '8', rpe: '7', last: '60 × 8', state: 'done' as const },
  { n: 2, load: '62.5', reps: '8', rpe: '8', last: '60 × 8', state: 'done' as const },
  { n: 3, load: '62.5', reps: '', rpe: '', last: '60 × 7', state: 'pending' as const },
];

export function SetRowEntry() {
  const entry = byId('c-setrow')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/SetRow.tsx</code> },
        { k: 'Class', v: <code>.sets</code> },
        { k: 'Row', v: '38px' },
        { k: 'Commit', v: '↵' },
      ]}
    >
      <Blk title="Specimen" lede="The densest control in the product, and the only one used with a barbell in one hand.">
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <div className="col gap3" style={{ width: 420 }}>
            <SetHeader name="Bench press" target="3 × 8 @ 62.5" />
            <SetRows sets={SETS} exercise="Bench press" width={420} />
          </div>
        </Bench>
      </Blk>

      <Blk
        title="“Last time” is the component"
        lede={
          <>
            The right-hand column is what the client did last time, and it is the reason the console is usable
            at speed: the trainer is <b>not recalling a number, they are beating one</b>.
          </>
        }
      >
        <p className="blk__p">
          It is <code>aria-hidden</code> in the row and repeated into each input&rsquo;s{' '}
          <code>aria-describedby</code>, so a reader hears <i>&ldquo;Load, 62.5, last time 60 × 8&rdquo;</i>{' '}
          rather than reading a column of orphaned figures at the end of the table. The figure has to arrive{' '}
          <b>with</b> the field it qualifies, not after it.
        </p>
      </Blk>

      <Blk
        title="Real inputs, not tap-to-edit"
        lede="The trainer types over the previous value and moves on. A field that has to be tapped to become editable costs a press per number, and there are nine numbers in a three-set exercise."
      >
        <p className="blk__p">
          <code>inputMode=&quot;decimal&quot;</code> on every cell, so a phone offers the number pad rather than
          a full keyboard &mdash; the console is used on a phone more than anywhere else in the product.
        </p>
      </Blk>

      <Blk
        title="data-state, not a class"
        lede={
          <>
            Matching the design file. The three states are a <b>sequence</b> &mdash; pending, done, skipped
            &mdash; rather than three independent modifiers, and an attribute that holds one value at a time
            says that in a way three classes cannot.
          </>
        }
      />

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Row', value: '38px', note: 'Five columns: set, load, reps, RPE, last time' },
            { property: 'Inputs', value: 'transparent', note: 'Bordered only on focus — the grid is the structure' },
            { property: 'Figures', value: 'tabular', token: '--tx-mono' },
            { property: 'Input mode', value: 'decimal', note: 'The number pad, on a phone' },
            { property: 'Last time', value: <code>aria-describedby</code>, note: 'Read with the field, not after the table' },
            { property: 'State', value: <code>data-state</code>, note: 'pending · done · skipped — a sequence' },
            { property: 'Commit', value: '↵', note: 'And opens the next set' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: <SetRows sets={SETS.slice(0, 2)} exercise="Bench press" width={320} />,
            caption: 'Last time sits beside the field it informs. The trainer reads across one row and knows whether the set was a step up.',
          }}
          no={{
            figure: (
              <SetRows
                sets={SETS.slice(0, 2).map((s) => ({ ...s, last: undefined }))}
                exercise="Bench press"
                width={320}
              />
            ),
            caption:
              'The same rows with no history. Every load is now a decision made from memory, in a gym, mid-set — which is where the numbers in a training log start drifting.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
