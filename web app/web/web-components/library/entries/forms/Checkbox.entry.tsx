import { Checkbox, CheckboxCell } from '../../../ui/Checkbox';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

export function CheckboxEntry() {
  const entry = byId('c-checkbox')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Checkbox.tsx</code> },
        { k: 'Class', v: <code>.check</code> },
        { k: 'Box', v: '18px' },
        { k: 'Target', v: '32 × 32' },
        { k: 'States', v: '6' },
      ]}
    >
      <Blk title="Specimen" lede="Real checkboxes. Tab to them, toggle with Space, and click the words — the label is part of the target.">
        <Bench style={{ gap: 26 }}>
          <Checkbox label="Mark as paid" defaultChecked />
          <Checkbox label="Notify the client" />
          <Checkbox label="Send a receipt" defaultChecked disabled />
        </Bench>
      </Blk>

      <Blk
        title="A real input, which is what the product already uses"
        lede={
          <>
            The design file draws <code>&lt;span class=&quot;check&quot; role=&quot;checkbox&quot;
            aria-checked&gt;</code>. That is a drawing. The product renders{' '}
            <code>&lt;input type=&quot;checkbox&quot; className=&quot;check&quot;&gt;</code> &mdash; correctly
            &mdash; and this component makes that the only thing that can be rendered.
          </>
        }
      >
        <Bench style={{ gap: 26 }}>
          <Cell label="THE REFERENCE · SPAN + ROLE">
            <span style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}>
              <span className="check" role="checkbox" aria-checked="true" />
              <span className="small">Mark as paid</span>
            </span>
          </Cell>
          <Cell label="THIS COMPONENT · AN INPUT">
            <Checkbox label="Mark as paid" defaultChecked />
          </Cell>
        </Bench>
        <p className="blk__p">
          Tab through both. The second takes focus and toggles on Space; the first does neither, and clicking
          its words does nothing because there is no <code>&lt;label&gt;</code> around them.
        </p>
      </Blk>

      <Blk
        title="Indeterminate cannot be written in JSX"
        lede={
          <>
            It is a DOM <b>property</b>, not an attribute, so <code>indeterminate={'{true}'}</code> on a JSX
            element is silently dropped. A header checkbox over a partly-selected list is exactly where it is
            needed and exactly where it disappears &mdash; the ref callback in this component is the only way
            to set it.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '16px 18px' }}>
          <div className="col gap2" style={{ width: 300 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 6, borderBottom: '1px solid var(--tx-line)' }}>
              <CheckboxCell label="Select all clients" indeterminate />
              <span className="small" style={{ color: 'var(--tx-ink-2)' }}>3 of 22 selected</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckboxCell label="Select Karthik Menon" defaultChecked />
              <span className="small">Karthik Menon</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckboxCell label="Select Divya Krishnan" defaultChecked />
              <span className="small">Divya Krishnan</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckboxCell label="Select Vikram Rao" />
              <span className="small">Vikram Rao</span>
            </span>
          </div>
        </Bench>
      </Blk>

      <Blk
        title="In a table, the name says which row"
        lede={
          <>
            <code>CheckboxCell</code> has no visible label, so <code>label</code> becomes the accessible name
            and must name the row: <b>&ldquo;Select Meera K&rdquo;</b>, never &ldquo;Select&rdquo;. Twenty-two
            rows of &ldquo;Select&rdquo; is twenty-two identical names in a reader&rsquo;s list of controls.
          </>
        }
      />

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Box', value: '18px' },
            { property: 'Target', value: '32 × 32', token: '--w-tap', note: 'The label is part of it' },
            { property: 'Radius', value: '4px', note: 'Square-ish. A round box is a radio' },
            { property: 'Element', value: <code>&lt;input type=&quot;checkbox&quot;&gt;</code>, note: 'Never a span with a role' },
            { property: 'Label', value: (
                <>
                  <code>&lt;label&gt;</code> wrapper
                </>
              ), note: 'Makes the words clickable without htmlFor' },
            { property: 'Indeterminate', value: 'a ref, not a prop', note: 'A DOM property; JSX drops the attribute' },
            { property: 'Checked colour', value: '#C6F24E', token: '--tx-accent' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: <Checkbox label="Mark as paid" defaultChecked />,
            caption: 'The words are inside the label, so the whole phrase is a hit target — which on a 32px row is most of the target there is.',
          }}
          no={{
            figure: (
              <span style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}>
                <span className="check" role="checkbox" aria-checked="true" />
                <span className="small">Mark as paid</span>
              </span>
            ),
            caption:
              'A span with a role and words beside it. No tab stop, no Space, and the label is decorative — the trainer clicks the text and nothing happens.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
