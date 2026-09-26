import { Select } from '../../../ui/Select';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

const PAYS = [
  { value: 'trainer-upi', label: 'Trainer collects · UPI' },
  { value: 'trainer-cash', label: 'Trainer collects · cash' },
  { value: 'gym', label: 'The gym collects' },
];

const LENGTHS = [
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '60 minutes' },
  { value: '90', label: '90 minutes' },
];

export function SelectEntry() {
  const entry = byId('c-select')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Select.tsx</code> },
        { k: 'Class', v: <code>select.ctl</code> },
        { k: 'Element', v: 'native' },
        { k: 'Height', v: '34px' },
      ]}
    >
      <Blk title="Specimen" lede="Open them — this is the platform’s own picker, styled.">
        <Bench style={{ gap: 30, alignItems: 'flex-start' }}>
          <Select
            label="How this client pays"
            options={PAYS}
            defaultValue="trainer-upi"
            width={290}
            hint="Changes who the payment link belongs to."
          />
          <Select label="Session length" options={LENGTHS} defaultValue="45" width={290} />
        </Bench>
      </Blk>

      <Blk
        title="Native, on purpose"
        lede={
          <>
            Kept for what it already does that a custom listbox would have to re-earn: it opens as the
            platform&rsquo;s own picker on a phone, it types-to-select, it is reachable by every assistive
            technology without a role being declared, and it does not need to be told the window has scrolled.
          </>
        }
      >
        <p className="blk__p">
          The only thing it ever needed was styling, and <code>select.ctl::picker(select)</code> &mdash; the{' '}
          <b>Dropdown</b> entry &mdash; now claims the popup too. There is nothing left to gain by replacing
          it, and a great deal to lose.
        </p>
      </Blk>

      <Blk
        title="A placeholder is a disabled option"
        lede="Not an empty one. A required select whose first option is blank can be submitted still saying “Choose a length” — the disabled option makes that unreachable rather than merely discouraged."
      >
        <Bench style={{ gap: 26, alignItems: 'flex-start' }}>
          <Cell label="UNCHOSEN · DISABLED FIRST OPTION">
            <Select label="Session length" options={LENGTHS} placeholder="Choose a length" defaultValue="" width={250} />
          </Cell>
          <Cell label="CHOSEN">
            <Select label="Session length" options={LENGTHS} defaultValue="45" width={250} />
          </Cell>
        </Bench>
      </Blk>

      <Blk title="States">
        <Bench style={{ gap: 26, alignItems: 'flex-start' }}>
          <Cell label="REST">
            <Select label="Pays by" options={PAYS} defaultValue="gym" width={230} />
          </Cell>
          <Cell label="DISABLED">
            <Select label="Pays by" options={PAYS} defaultValue="gym" width={230} disabled />
          </Cell>
          <Cell label="ERROR">
            <Select
              label="Pays by"
              options={PAYS}
              placeholder="Choose one"
              defaultValue=""
              width={230}
              error="Pick who collects before saving."
            />
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="MEASURED BUG · the value sat off the vertical centre"
        lede={
          <>
            <code>appearance:base-select</code> turns the button into a real <b>flex container</b>, and a flex
            container&rsquo;s <code>align-items</code> initial value is <code>normal</code> &mdash; which
            behaves as <code>stretch</code>. The selected value was stretched to the field&rsquo;s full 34px
            and its text painted at the <b>top</b> of that box, a couple of pixels above where the same 13.5px
            sits in an <code>input.ctl</code> beside it.
          </>
        }
      >
        <p className="blk__p">
          Nothing in the stylesheet asked for flex, so nothing in it had centred the item.{' '}
          <code>appearance:none</code> never had the problem, which is why this arrived with the
          customizable-select pass and not before &mdash; and why it was invisible until a select and a text
          field were put in the same column.
        </p>
        <p className="blk__p">
          Fixed in §04 with <code>select.ctl{'{'}align-items:center{'}'}</code>, so it reaches the seven select
          call-sites in the product as well as this page.
        </p>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Height', value: '34px', note: 'Matches a text field exactly — they share rows' },
            { property: 'Element', value: <code>&lt;select&gt;</code>, note: 'Native. Never a div with a role' },
            { property: 'Options', value: '2–12', note: 'More than that is a search field over a list' },
            { property: 'Chevron', value: '15px', note: 'Drawn by §04, not an option’s content' },
            { property: 'Placeholder', value: 'disabled option', note: 'So a required select cannot submit unchosen' },
            { property: 'Picker', value: <code>::picker(select)</code>, note: 'The popup, claimed from the OS — see Dropdown' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: <Select label="Session length" options={LENGTHS} defaultValue="45" width={230} />,
            caption: 'Four closed, known values. The trainer sees all of them in the platform’s own picker, with type-to-select and no scroll trap.',
          }}
          no={{
            figure: (
              <Select
                label="Client"
                options={[
                  { value: '1', label: 'Karthik Menon' },
                  { value: '2', label: 'Divya Krishnan' },
                  { value: '3', label: 'Vikram Rao' },
                ]}
                defaultValue="1"
                width={230}
              />
            ),
            caption:
              'Twenty-two clients in a select. The list is long, unordered to the eye and unsearchable beyond first-letter jumps — this is a search field over a roster, not a closed list.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
