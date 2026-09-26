'use client';

import { useState } from 'react';

import { SearchSelect } from '../../../ui/SearchSelect';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

const GROUPS = [
  {
    label: 'Your programs',
    options: [
      {
        value: 'own:1',
        label: 'Upper / Lower · 4 day',
        meta: '4 workouts a week · 8 weeks · used 16 times',
        keywords: 'strength',
      },
      {
        value: 'own:2',
        label: 'Fat Loss · 3 day full body',
        meta: '3 workouts a week · 6 weeks · used 17 times',
        keywords: 'fat loss',
      },
      {
        value: 'own:3',
        label: 'Push / Pull / Legs · 3 day',
        meta: '3 workouts a week · 8 weeks · never used yet',
        keywords: 'hypertrophy',
      },
    ],
  },
  {
    label: 'InclineYou templates',
    options: [
      {
        value: 'cert:1',
        label: 'Beginner Full Body · 3 day',
        meta: '3 workouts a week · 8 weeks · 215 trainers use it',
        keywords: 'general fitness beginner',
      },
      {
        value: 'cert:2',
        label: 'Bodyweight Anywhere · 2 day',
        meta: '2 workouts a week · 4 weeks · 96 trainers use it',
        keywords: 'bodyweight',
      },
    ],
  },
];

export function SearchSelectEntry() {
  const entry = byId('c-searchselect')!;
  const [value, setValue] = useState('');
  const [chosen, setChosen] = useState('own:1');

  return (
    <Cmp
      entry={entry}
      status="beta"
      meta={[
        { k: 'Component', v: <code>ui/SearchSelect.tsx</code> },
        { k: 'Classes', v: <code>.pick</code> },
        { k: 'Trigger', v: '34px, the field’s own height' },
        { k: 'Popup', v: '288px max, scrolls' },
      ]}
    >
      <Blk title="Specimen">
        <Bench style={{ gap: 26, alignItems: 'flex-start' }}>
          <Cell label="NOTHING CHOSEN">
            <div style={{ width: 340 }}>
              <SearchSelect
                label="Start from"
                searchLabel="Search your programs and the catalogue"
                noun="programs"
                placeholder="An empty program"
                value={value}
                onChange={setValue}
                options={[{ value: '', label: 'An empty program' }]}
                groups={GROUPS}
              />
            </div>
          </Cell>
          <Cell label="CHOSEN">
            <div style={{ width: 340 }}>
              <SearchSelect
                label="Start from"
                searchLabel="Search your programs and the catalogue"
                noun="programs"
                value={chosen}
                onChange={setChosen}
                options={[{ value: '', label: 'An empty program' }]}
                groups={GROUPS}
                hint="A copy, yours to edit. Nothing you do to it reaches the original."
              />
            </div>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="Three things a <select> cannot do, and all three were needed"
        lede={
          <>
            <code>Select</code> is still right for a short closed list, and its own page argues that. This
            one exists because the new-program dialog needed to <b>filter as you type</b>, put{' '}
            <b>two lines in a row</b> — the name, and the counts the choice actually turns on — and group
            rows under a heading that is not itself pickable. Any one of those alone would not have earned
            a second control.
          </>
        }
      />

      <Blk
        title="The search box is in the popup, not in the trigger"
        lede={
          <>
            A trigger that becomes a text field on open erases the one thing it was carrying — what is
            currently chosen — at the moment the reader most wants to compare a new row against it. The
            shelf sheet this control sits beside puts its field above the list for the same reason.
          </>
        }
      />

      <Blk
        title="Escape is a ladder and this is a rung"
        lede={
          <>
            <code>ModalHost</code> binds Escape on the window in the <b>capture</b> phase and stops it, so
            a dialog holding this control would close itself on the press meant to shut the list — and the
            trainer loses a half-filled form to a key they pressed to close a popup. The repair is{' '}
            <code>PhoneProgram</code>&rsquo;s: the open state is lifted to whoever owns both surfaces, and
            the outer one stands down. Wire <code>onOpenChange</code> to <code>ModalHost</code>&rsquo;s{' '}
            <code>covered</code> at every call-site inside a modal.
          </>
        }
      >
        <SpecTable
          rows={[
            {
              property: 'Escape',
              value: 'closes the popup',
              note: 'Only where the host stands down — see above. Focus returns to the trigger.',
            },
            {
              property: '↑ / ↓',
              value: 'moves the cursor, wrapping',
              note: 'A closed list with no wrap is a dead key press at the last row, and a reader cannot tell that from a control that has stopped answering.',
            },
            { property: '↵', value: 'picks the row under the cursor' },
            { property: 'Tab', value: 'leaves, and the popup goes with it' },
            {
              property: 'Announcement',
              value: <code>aria-activedescendant</code>,
              note: 'On a `role="combobox"` input that `aria-controls` the listbox. Without the trio, arrowing is silent — the palette shipped that way once.',
            },
            {
              property: 'Result count',
              value: '“6 of 10 programs”',
              note: '`SearchField`’s own live region, reused rather than rebuilt.',
            },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <div style={{ width: 300 }}>
                <SearchSelect
                  label="Start from"
                  searchLabel="Search your programs"
                  noun="programs"
                  value="own:1"
                  onChange={() => {}}
                  groups={[GROUPS[0]]}
                />
              </div>
            ),
            caption:
              'Rows carry the figures the choice turns on. A trainer picks a blueprint on how often it trains and how often it has been used, not on its name alone.',
          }}
          no={{
            figure: (
              <div style={{ width: 300 }}>
                <SearchSelect
                  label="Start from"
                  searchLabel="Search"
                  value="own:1"
                  onChange={() => {}}
                  groups={[
                    {
                      label: 'Your programs',
                      options: GROUPS[0].options.map((o) => ({ value: o.value, label: o.label })),
                    },
                  ]}
                />
              </div>
            ),
            caption:
              'Names only. This is a `Select` wearing a search box — if the rows have nothing to say, the native element is the better control.',
          }}
        />
      </Blk>

      <Blk
        title="When not to use it"
        lede={
          <>
            Under about ten short rows with nothing to say about them, use <code>Select</code>. Anything
            that is not one answer to one question — multi-select, or rows that are actions — is a{' '}
            <code>Panel</code> or a menu. And not at the bottom of a long scroller: the popup is{' '}
            <code>position:absolute</code> and is clipped by whatever scroller it is drawn in, with no
            portal behind it yet.
          </>
        }
      />
    </Cmp>
  );
}
