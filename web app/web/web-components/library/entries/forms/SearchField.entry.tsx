import { SearchField } from '../../../ui/SearchField';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

export function SearchFieldEntry() {
  const entry = byId('c-search')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/SearchField.tsx</code> },
        { k: 'Class', v: <code>.search</code> },
        { k: 'Height', v: '34px' },
        { k: 'Type', v: <code>search</code> },
      ]}
    >
      <Blk title="Specimen">
        <Bench style={{ gap: 26, alignItems: 'flex-start' }}>
          <Cell label="EMPTY">
            <SearchField label="Search clients" width={300} />
          </Cell>
          <Cell label="TYPED · NATIVE CLEAR BUTTON">
            <SearchField label="Search clients" defaultValue="mee" width={300} />
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="type=&quot;search&quot; is not cosmetic"
        lede="It gives the browser’s own clear button, and on a phone a keyboard whose return key says Search. Both are free, and both have to be rebuilt badly if the input is a text field wearing a magnifying glass."
      />

      <Blk
        title="The result count is part of the control"
        lede={
          <>
            Typing filters the list <b>silently</b>: the rows change and a screen reader is told nothing,
            because nothing it was reading moved. <code>count</code> renders a polite live region, so
            &ldquo;6 of 22 clients&rdquo; is announced once the typing stops. Without it the control works for
            everybody who can watch the list shrink, and for nobody else.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '16px 18px' }}>
          <div className="col gap3" style={{ width: 320 }}>
            <SearchField label="Search clients" defaultValue="mee" count={{ shown: 6, total: 22, noun: 'clients' }} />
            <span className="small" style={{ color: 'var(--tx-ink-3)' }}>
              announced: &ldquo;6 of 22 clients&rdquo;
            </span>
          </div>
        </Bench>
      </Blk>

      <Blk
        title="The label says what is being searched"
        lede={
          <>
            Visually hidden, never absent. A magnifying glass is not a name, and &ldquo;Search&rdquo; alone is
            not one either when three lists on one screen each have a box. <code>label</code> is required so
            that it says which.
          </>
        }
      >
        <Bench style={{ gap: 26, alignItems: 'flex-start' }}>
          <Cell label="ROSTER">
            <SearchField label="Search clients" width={240} />
          </Cell>
          <Cell label="LIBRARY">
            <SearchField label="Search the exercise library" width={240} />
          </Cell>
          <Cell label="PAYMENTS">
            <SearchField label="Search payments" width={240} />
          </Cell>
        </Bench>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Height', value: '34px', note: 'Matches a field and a button — it sits in toolbars' },
            { property: 'Type', value: <code>search</code>, note: 'Native clear button; “Search” return key on a phone' },
            { property: 'Icon', value: '15px', note: 'Leading, inside the box, aria-hidden' },
            { property: 'Label', value: 'visually hidden', note: 'Required. Names the list, not the action' },
            { property: 'Placeholder', value: '= the label', note: 'The same words, so the two cannot disagree' },
            { property: 'Count', value: 'polite live region', note: 'Announces the filtered total after typing stops' },
            { property: 'Radius', value: '8px', token: '--tx-r2' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: <SearchField label="Search clients" defaultValue="mee" count={{ shown: 6, total: 22, noun: 'clients' }} width={260} />,
            caption: 'Named for the list it filters, and it announces what the filtering did. The control finishes the job it started.',
          }}
          no={{
            figure: (
              <label className="search" style={{ maxWidth: 260 }}>
                <input type="text" placeholder="Search" />
              </label>
            ),
            caption:
              'No label, no type, no count. A screen reader finds an unnamed text box, the phone offers a return key that submits nothing, and the filtered result is never announced.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
