import { TextField } from '../../../ui/Field';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { Anatomy, DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

export function FieldEntry() {
  const entry = byId('c-field')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Field.tsx</code> },
        { k: 'Class', v: <code>.ctl</code> },
        { k: 'Wrapper', v: <code>.fld</code> },
        { k: 'Height', v: '34px' },
        { k: 'States', v: '7' },
      ]}
    >
      <Blk title="Specimen">
        <Bench style={{ gap: 30, alignItems: 'flex-start' }}>
          <TextField label="Name clients see" defaultValue="Meera Krishnan" width={290} />
          <TextField
            label="Mobile number"
            placeholder="+91"
            width={290}
            hint="This is how they log in. Ten digits, no country code."
          />
        </Bench>
      </Blk>

      <Blk title="Anatomy">
        <Anatomy
          figure={
            <TextField
              label="Mobile number"
              defaultValue="98765 43210"
              width={280}
              hint="This is how they log in."
            />
          }
          pins={[
            {
              n: 1,
              dir: 'r',
              style: { left: -46, top: 2, '--l': '30px' },
              title: 'Label',
              body: (
                <>
                  Always visible, never a placeholder. It carries <code>htmlFor</code>, so clicking the words
                  moves focus into the box &mdash; which a hand-assembled <code>.fld__l</code> does not.
                </>
              ),
            },
            {
              n: 2,
              dir: 'r',
              style: { left: -46, top: 34, '--l': '30px' },
              title: 'Control',
              body: (
                <>
                  34px, <code>.ctl</code>. 16px text so iOS does not zoom the page when it takes focus.
                </>
              ),
            },
            {
              n: 3,
              dir: 'r',
              style: { left: -46, bottom: 0, '--l': '30px' },
              title: 'Hint',
              body: (
                <>
                  Named by <code>aria-describedby</code>. A hint that is not is invisible to a screen reader
                  &mdash; and this one is the answer to the question the field is about to be got wrong over.
                </>
              ),
            },
          ]}
        />
      </Blk>

      <Blk
        title="The wiring is the component"
        lede={
          <>
            <code>.fld</code>, <code>.fld__l</code> and <code>.fld__h</code> are three classes anybody can
            type, and typing them produces a field that <b>looks</b> right and is not. The ids are generated
            here and attached here, so there is no way to assemble the parts without them.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '14px 16px' }}>
          <code style={{ fontSize: 12.5, lineHeight: 1.8 }}>
            &lt;label for=&quot;r1-ctl&quot;&gt; &nbsp;&larr; click the words, focus moves
            <br />
            &lt;input id=&quot;r1-ctl&quot; aria-describedby=&quot;r1-note&quot;&gt;
            <br />
            &lt;span id=&quot;r1-note&quot;&gt; &nbsp;&larr; the hint, actually announced
          </code>
        </Bench>
      </Blk>

      <Blk
        title="States"
        lede={
          <>
            The error <b>replaces</b> the hint rather than stacking under it. Two lines of small text under one
            input is the trainer reading both to find out which is currently true &mdash; when a field is in
            error, the error is the hint.
          </>
        }
      >
        <Bench style={{ gap: 26, alignItems: 'flex-start' }}>
          <Cell label="REST">
            <TextField label="Name" defaultValue="Meera Krishnan" width={230} />
          </Cell>
          <Cell label="WITH A HINT">
            <TextField label="Mobile number" defaultValue="98765 43210" width={230} hint="Ten digits." />
          </Cell>
          <Cell label="ERROR · role=alert">
            <TextField
              label="Mobile number"
              defaultValue="9876"
              width={230}
              hint="Ten digits."
              error="Ten digits, no country code."
            />
          </Cell>
          <Cell label="DISABLED">
            <TextField label="Trainer code" defaultValue="XR-4471" width={230} disabled />
          </Cell>
          <Cell label="READ ONLY">
            <TextField label="Joined" defaultValue="12 March 2025" width={230} readOnly />
          </Cell>
          <Cell label="NUMERIC · TABULAR FIGURES">
            <TextField label="Sessions in the pack" defaultValue="12" width={230} numeric />
          </Cell>
        </Bench>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Height', value: '34px', token: '--w-ctl' },
            { property: 'Text', value: '16px', note: 'Not 14 — iOS zooms the page on a smaller focused input' },
            { property: 'Radius', value: '8px', token: '--tx-r2', note: 'Shared with buttons, cards and chips' },
            { property: 'Label', value: '12.5px / 600', note: 'Always visible. A placeholder is not a label' },
            { property: 'Hint', value: '12px', token: '--tx-ink-3', note: 'Wired by aria-describedby' },
            { property: 'Error', value: <code>.fld--err</code>, note: 'Replaces the hint, and carries role="alert"' },
            { property: 'Numeric', value: <code>.ctl--num</code>, note: 'Tabular figures, so a column of amounts lines up' },
            { property: 'Focus', value: '2px + halo', token: '--tx-focus' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <TextField
                label="Mobile number"
                defaultValue="98765 43210"
                width={250}
                hint="This is how they log in."
              />
            ),
            caption: (
              <>
                A visible label that stays visible once typing starts, and a hint that says what the number is{' '}
                <i>for</i>. Both survive the field being filled in.
              </>
            ),
          }}
          no={{
            figure: (
              <div className="fld" style={{ width: 250 }}>
                <input className="ctl" placeholder="Mobile number" />
              </div>
            ),
            caption:
              'The label as a placeholder. It vanishes the moment there is a value, so the one time a trainer checks what they typed, nothing on screen says what it was meant to be.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
