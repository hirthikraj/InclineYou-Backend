import { AffixField } from '../../../ui/AffixField';
import { Button } from '../../../ui/Button';
import { TextField } from '../../../ui/Field';
import { FormGroup } from '../../../ui/FormGroup';
import { Select } from '../../../ui/Select';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

export function FormGroupEntry() {
  const entry = byId('c-formgroup')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/FormGroup.tsx</code> },
        { k: 'Classes', v: <code>.col .gap3</code> },
        { k: 'Columns', v: '1, or 2 for short pairs' },
        { k: 'Heading', v: <code>&lt;fieldset&gt;</code> },
      ]}
    >
      <Blk title="Specimen" lede="Add a client — one column, read straight down.">
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <FormGroup width={400}>
            <TextField label="Name clients see" defaultValue="Meera Krishnan" width="100%" />
            <TextField label="Mobile number" defaultValue="98765 43210" width="100%" hint="This is how they log in." />
            <Select
              label="How this client pays"
              options={[
                { value: 'upi', label: 'Trainer collects · UPI' },
                { value: 'gym', label: 'The gym collects' },
              ]}
              defaultValue="upi"
              width="100%"
            />
            <Button variant="primary" style={{ alignSelf: 'flex-start' }}>
              Add client
            </Button>
          </FormGroup>
        </Bench>
      </Blk>

      <Blk
        title="One column, because a form read down one line is a form nobody loses their place in"
        lede="Two columns only for values that are genuinely a pair and genuinely short — a start and an end, a count and a unit. Never for two unrelated fields that happen to fit."
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <FormGroup width={400} heading="The pack" hint="What the client is buying, and what it costs.">
            <FormGroup columns={2}>
              <TextField label="Sessions" defaultValue="12" numeric />
              <AffixField label="Price per session" unit="rupees" affix="₹" defaultValue="800" />
            </FormGroup>
          </FormGroup>
        </Bench>
        <p className="blk__p">
          Sessions and price are one decision priced two ways, so they belong on one line. Name and mobile
          number are not, and pairing them would mean the trainer&rsquo;s eye crosses the form twice per row.
        </p>
      </Blk>

      <Blk
        title="A heading makes it a fieldset"
        lede={
          <>
            With a <code>&lt;legend&gt;</code>. A screen reader then announces &ldquo;The pack, Sessions&rdquo;
            rather than &ldquo;Sessions&rdquo; &mdash; otherwise the heading is a visual grouping that exists
            for sighted users only, which is exactly the class of thing that gets drawn and never wired.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '14px 16px' }}>
          <code style={{ fontSize: 12.5, lineHeight: 1.8 }}>
            &lt;fieldset&gt;
            <br />
            &nbsp;&nbsp;&lt;legend class=&quot;fld__l&quot;&gt;The pack&lt;/legend&gt;
            <br />
            &nbsp;&nbsp;&lt;div class=&quot;col gap3&quot;&gt;…
          </code>
        </Bench>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Gap', value: '12px', token: '.gap3', note: 'Between fields' },
            { property: 'Columns', value: '1 or 2', note: 'Two only for a genuine pair of short values' },
            { property: 'Heading', value: <code>&lt;legend&gt;</code>, note: 'Announced before every field in the set' },
            { property: 'Without a heading', value: <code>&lt;div&gt;</code>, note: 'A fieldset with no legend groups nothing' },
            { property: 'Measure', value: '400px', note: 'One column of fields, not the width of the pane' },
            { property: 'Primary action', value: 'left-aligned', note: 'Under the first field’s edge, where the reading ended' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <FormGroup width={260}>
                <TextField label="Name clients see" defaultValue="Meera Krishnan" width="100%" />
                <TextField label="Mobile number" defaultValue="98765 43210" width="100%" />
              </FormGroup>
            ),
            caption: 'One column. Every label starts on the same left edge, so the eye travels down a single line and never hunts.',
          }}
          no={{
            figure: (
              <FormGroup width={260} columns={2}>
                <TextField label="Name clients see" defaultValue="Meera Krishnan" width="100%" />
                <TextField label="Mobile number" defaultValue="98765 43210" width="100%" />
              </FormGroup>
            ),
            caption:
              'Two unrelated fields paired because they fit. The names are now cramped, the reading order is ambiguous, and on a narrow window they stack anyway — into the same one column, with worse spacing.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
