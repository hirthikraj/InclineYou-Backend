import { AffixField } from '../../../ui/AffixField';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

export function AffixFieldEntry() {
  const entry = byId('c-affix')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/AffixField.tsx</code> },
        { k: 'Class', v: <code>.affix</code> },
        { k: 'Sides', v: 'leading or trailing' },
        { k: 'Height', v: '34px' },
      ]}
    >
      <Blk title="Specimen">
        <Bench style={{ gap: 26, alignItems: 'flex-start' }}>
          <Cell label="LEADING · CURRENCY">
            <AffixField label="Price per session" unit="rupees" affix="₹" defaultValue="800" width={180} />
          </Cell>
          <Cell label="TRAILING · WEIGHT">
            <AffixField label="Working weight" unit="kilograms" affix="kg" side="trailing" defaultValue="62.5" width={180} />
          </Cell>
          <Cell label="TRAILING · DURATION">
            <AffixField label="Session length" unit="minutes" affix="min" side="trailing" defaultValue="45" width={180} />
          </Cell>
          <Cell label="TRAILING · SHARE">
            <AffixField label="The gym’s share" unit="percent" affix="%" side="trailing" defaultValue="46" width={180} />
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="Two forms of the unit, and they are rarely the same string"
        lede={
          <>
            The affix is <code>aria-hidden</code> and the unit is folded into the label as visually-hidden
            text. A reader that announces the affix instead gets &ldquo;rupee, Price per session, eight
            hundred&rdquo; &mdash; the unit before the thing it qualifies, in the wrong order, before the field
            has been named.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '14px 16px' }}>
          <code style={{ fontSize: 12.5, lineHeight: 1.8 }}>
            affix=&quot;₹&quot; &nbsp;&nbsp;&larr; drawn, what the eye needs
            <br />
            unit=&quot;rupees&quot; &larr; spoken, what the ear needs
            <br />
            <br />
            reads &nbsp;&nbsp;&nbsp;&ldquo;Price per session&rdquo;
            <br />
            announced &ldquo;Price per session in rupees&rdquo;
          </code>
        </Bench>
        <p className="blk__p">
          The visible label is untouched &mdash; the design is not changed to make the announcement work. That
          is what <code>label</code> being a node rather than a string buys.
        </p>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Height', value: '34px', note: 'Same as a plain field. It sits in the same rows' },
            { property: 'Affix', value: '12.5px / 600', token: '--tx-ink-3' },
            { property: 'Side', value: 'leading or trailing', note: 'Currency leads; units trail. Never both' },
            { property: 'Input', value: <code>.ctl--num</code>, note: 'Tabular by default — an affixed field is nearly always a number' },
            { property: 'Affix element', value: <code>aria-hidden</code>, note: 'The unit is in the label instead' },
            { property: 'Radius', value: '8px', token: '--tx-r2', note: 'On the wrapper; the input’s own corner is squared' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: <AffixField label="Price per session" unit="rupees" affix="₹" defaultValue="800" width={180} />,
            caption: 'The symbol is welded to the box, so the number is never read without its unit — and the trainer never types ₹ into a numeric field.',
          }}
          no={{
            figure: (
              <div className="fld" style={{ width: 180 }}>
                <label className="fld__l">Price per session</label>
                <input className="ctl ctl--num" defaultValue="₹800" />
              </div>
            ),
            caption:
              'The symbol typed into the value. Now the field holds a string, the sort order is alphabetical, and every read of it has to strip a character first.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
