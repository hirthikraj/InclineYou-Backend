import { Select } from '../../../ui/Select';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

const LENGTHS = [
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '60 minutes' },
  { value: '90', label: '90 minutes' },
];

/**
 * Dropdown — not a component. It is the Select's popup, styled.
 *
 * There is no module to import and no markup to write, which is the finding
 * worth recording: this entry exists so that nobody builds one.
 */
export function DropdownEntry() {
  const entry = byId('c-dropdown')!;

  return (
    <Cmp
      entry={entry}
      status="beta"
      meta={[
        { k: 'Component', v: <code>ui/Select.tsx</code> },
        { k: 'Class', v: <code>select.ctl::picker(select)</code> },
        { k: 'Markup', v: 'none new' },
        { k: 'Support', v: 'progressive' },
      ]}
    >
      <Blk
        title="There is nothing to import"
        lede={
          <>
            The dropdown is the <b>native picker</b>, claimed from the operating system with{' '}
            <code>::picker(select)</code>. It is the same <code>&lt;select&gt;</code> as the entry next door,
            with the popup styled instead of replaced &mdash; no new element, no new module, no new call-site.
          </>
        }
      >
        <Bench style={{ gap: 30, alignItems: 'flex-start' }}>
          <Select label="Session length" options={LENGTHS} defaultValue="45" width={250} />
        </Bench>
        <p className="blk__p">
          Open it. On a browser that supports the pseudo-element you get the design&rsquo;s popup; on one that
          does not you get the platform&rsquo;s. <b>Both work.</b> That is the whole argument for doing it this
          way rather than building a listbox: the failure mode of the new syntax is last year&rsquo;s
          behaviour, and the failure mode of a custom listbox is a control the keyboard cannot drive.
        </p>
      </Blk>

      <Blk
        title="Why this entry exists at all"
        lede="To stop someone building one. A “Dropdown” in a component library is normally a div, a portal, a focus trap, a scroll listener and a reimplementation of type-to-select. All of that is being deleted here, not written."
      >
        <Bench pad={false} style={{ padding: '14px 16px' }}>
          <code style={{ fontSize: 12.5, lineHeight: 1.8 }}>
            select.ctl::picker(select) {'{'} … {'}'} &nbsp;&larr; the entire implementation
          </code>
        </Bench>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Element', value: <code>&lt;select&gt;</code>, note: 'The same one. Nothing is added' },
            { property: 'Popup', value: <code>::picker(select)</code>, note: 'Styled, not replaced' },
            { property: 'Fallback', value: 'the OS picker', note: 'On browsers without the pseudo-element' },
            { property: 'Keyboard', value: 'the platform’s', note: 'Type-to-select, Home/End, arrow keys — none of it reimplemented' },
            { property: 'Markup', value: 'none new', note: 'No portal, no focus trap, no scroll listener' },
          ]}
        />
      </Blk>
    </Cmp>
  );
}
