'use client';

import { useState } from 'react';

import { DateField } from '../../../ui/DateField';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

export function DateFieldEntry() {
  const entry = byId('c-datefield')!;
  const [dob, setDob] = useState('');
  const [booked, setBooked] = useState('2026-10-12');

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/DateField.tsx</code> },
        { k: 'Classes', v: <><code>.dfld</code> <code>.dpop</code></> },
        { k: 'Value', v: <code>YYYY-MM-DD</code> },
        { k: 'Week', v: 'Monday first' },
        { k: 'Phone', v: 'bottom sheet, 44px' },
      ]}
    >
      <Blk
        title="Specimen"
        lede="Live. Type 12051990, or press the calendar and use the title to jump a year — it opens on the youngest valid month, not on today."
      >
        <Bench style={{ gap: 40, alignItems: 'flex-start' }}>
          <Cell label="BLOCK · A BIRTH DATE">
            <div style={{ width: 320 }}>
              <DateField
                label="Date of birth"
                block
                value={dob}
                onChange={setDob}
                min="1900-01-01"
                max="2008-10-04"
                openAt="2008-10-04"
              />
              <p className="fld__h" style={{ marginTop: 6 }}>
                Value: <code>{dob || '—'}</code>
              </p>
            </div>
          </Cell>
          <Cell label="HUGGING · A DATE ON A ROW">
            <DateField label="Session date" value={booked} onChange={setBooked} />
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="Two ways in, and neither is the fallback"
        lede={
          <>
            <b>Typing</b> is the fast path at a desk: three segments that advance on their own (a day that
            starts 4&ndash;9 is already a day), step with &uarr; &darr;, and take a pasted{' '}
            <code>12/05/1990</code> or <code>1990-05-12</code> whole. <b>The calendar</b> is the way in for a
            thumb: a day grid, and a title that opens a year grid and then a month grid &mdash; two taps to
            anywhere in a century. <code>&lt;input type=&quot;date&quot;&gt;</code> was neither: an OS popup in
            a light theme, opening on today, thirty years of Previous month from a birth date.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '14px 16px' }}>
          <code style={{ fontSize: 12.5, lineHeight: 1.8 }}>
            value: &quot;&quot; &rarr; not a date <i>yet</i> (empty, half-typed, 31/02)
            <br />
            onBlur(value, state): &apos;empty&apos; | &apos;incomplete&apos; | &apos;invalid&apos; | &apos;ok&apos;
          </code>
        </Bench>
      </Blk>

      <Blk
        title="min and max grey the calendar; they do not clamp what is typed"
        lede={
          <>
            Whether a date is <b>acceptable</b> is the form&rsquo;s rule. The Add client flow passes{' '}
            <code>max</code> as the day somebody turns 18, so the calendar greys out everyone younger &mdash;
            and typing a younger date still gets a sentence that says <i>when they turn 18</i>. A field that
            silently clamped a typed year would be writing a number nobody typed.
          </>
        }
      >
        <Bench style={{ gap: 26 }}>
          <Cell label="INVALID">
            <DateField label="Invalid example" value="2020-03-09" onChange={() => {}} invalid />
          </Cell>
          <Cell label="DISABLED">
            <DateField label="Disabled example" value="1990-05-12" onChange={() => {}} disabled />
          </Cell>
        </Bench>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Field', value: '34 / 44px', token: '--tx-field', note: '44px and 16px under 900px — iOS zooms anything smaller' },
            { property: 'Segments', value: 'DD / MM / YYYY', note: 'Mono, tabular; the focus ring is on the box' },
            { property: 'Calendar', value: '296px popover', note: 'Under 900px: a bottom sheet with a scrim and the safe area' },
            { property: 'Day cell', value: '36 / 44px', note: 'Selected = the accent as a FILL; today = a ring in --tx-line-strong' },
            { property: 'Week', value: 'Monday first', note: 'Every weekday in this product is 1 = Monday' },
            { property: 'Keys', value: '← → ↑ ↓ Home End PgUp PgDn', note: 'Shift+Page moves a year; Escape closes only the calendar' },
            { property: 'Mount', value: <code>document.body</code>, note: 'A portal — a drawer clips it and its transform traps a fixed child (trap 11)' },
          ]}
        />
      </Blk>
    </Cmp>
  );
}
