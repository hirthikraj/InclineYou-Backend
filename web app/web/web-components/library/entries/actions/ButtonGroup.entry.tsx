'use client';

import { useState } from 'react';

import { ButtonGroup } from '../../../ui/ButtonGroup';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/**
 * Button group — live, because a group that cannot be pressed proves nothing.
 *
 * The specimens hold real state. That is the only way to see the rule the
 * component exists to enforce: exactly one option is pressed, always, and there
 * is no click sequence that produces two or none.
 */
export function ButtonGroupEntry() {
  const entry = byId('c-btngroup')!;

  const [range, setRange] = useState<'day' | 'week' | 'month'>('week');
  const [view, setView] = useState<'floor' | 'remote'>('floor');
  const [span, setSpan] = useState<'7' | '30' | '90' | '365'>('30');

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/ButtonGroup.tsx</code> },
        { k: 'Class', v: <code>.btngroup</code> },
        { k: 'Items', v: '2–4' },
        { k: 'Selection', v: 'single, always one' },
      ]}
    >
      <Blk
        title="Specimen"
        lede="Press them. One option is selected at every moment, and no sequence of clicks produces two or none — the options are data, not children, which is what makes that true rather than merely intended."
      >
        <Bench style={{ gap: 30 }}>
          <Cell label={`SCHEDULE · ${range}`}>
            <ButtonGroup
              label="Schedule range"
              value={range}
              onChange={setRange}
              options={[
                { value: 'day', label: 'Day' },
                { value: 'week', label: 'Week' },
                { value: 'month', label: 'Month' },
              ]}
            />
          </Cell>
          <Cell label={`TODAY · ${view}`}>
            <ButtonGroup
              label="Session kind"
              value={view}
              onChange={setView}
              options={[
                { value: 'floor', label: 'Floor' },
                { value: 'remote', label: 'Remote' },
              ]}
            />
          </Cell>
          <Cell label={`REPORTS · ${span} days`}>
            <ButtonGroup
              label="Reporting period"
              value={span}
              onChange={setSpan}
              options={[
                { value: '7', label: '7d' },
                { value: '30', label: '30d' },
                { value: '90', label: '90d' },
                { value: '365', label: '1y' },
              ]}
            />
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="Why the options are data"
        lede={
          <>
            A group whose children are supplied by the caller is a group where two can be pressed at once, and
            the design file&rsquo;s rule &mdash; <b>selection: single, always one</b> &mdash; has nowhere to
            live. Passing <code>options</code> and <code>value</code> puts the rule in the type: there is one
            selected value because there is one variable.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '14px 16px' }}>
          <code style={{ fontSize: 12.5, lineHeight: 1.7 }}>
            &lt;ButtonGroup label=&quot;Schedule range&quot; value={'{range}'} onChange={'{setRange}'}
            <br />
            &nbsp;&nbsp;options={'{'}[{'{'} value: &apos;day&apos;, label: &apos;Day&apos; {'}'}, …]{'}'} /&gt;
          </code>
        </Bench>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Items', value: '2–4', note: 'Five or more is a Select — the labels stop fitting' },
            { property: 'Height', value: '34px', note: 'Matches a default button; it sits in the same toolbars' },
            { property: 'Radius', value: '8px', token: '--tx-r2', note: 'On the group; inner corners are square' },
            { property: 'Selected', value: <code>aria-pressed</code>, note: 'Not a class — the state is announced, not only drawn' },
            { property: 'Grouping', value: <code>role=&quot;group&quot;</code>, note: 'With aria-label. Not radiogroup: arrow-key nav is not implemented' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <ButtonGroup
                label="Schedule range"
                value="week"
                options={[
                  { value: 'day', label: 'Day' },
                  { value: 'week', label: 'Week' },
                  { value: 'month', label: 'Month' },
                ]}
              />
            ),
            caption: (
              <>
                Three ways of looking at <b>one</b> set of sessions. Nothing is created or destroyed by
                pressing them, which is what separates this from a row of buttons.
              </>
            ),
          }}
          no={{
            figure: (
              <ButtonGroup
                label="Actions"
                value="save"
                options={[
                  { value: 'save', label: 'Save' },
                  { value: 'send', label: 'Send' },
                  { value: 'delete', label: 'Delete' },
                ]}
              />
            ),
            caption:
              'Three different actions welded into one control. A group answers “which view?”; these answer “do what?”, and pressing Delete would leave it looking selected afterwards.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
