'use client';

import { useState } from 'react';

import { Checkbox } from '../../../ui/Checkbox';
import { Switch } from '../../../ui/Switch';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

const SETTINGS = [
  { k: 'reminder', label: 'Session reminder to clients' },
  { k: 'weekly', label: 'Weekly report · Sundays 20:00' },
  { k: 'ask', label: 'Ask me before sending a nudge' },
];

export function SwitchEntry() {
  const entry = byId('c-switch')!;
  const [on, setOn] = useState<Record<string, boolean>>({ reminder: true, weekly: true, ask: false });

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Switch.tsx</code> },
        { k: 'Class', v: <code>.switch</code> },
        { k: 'Track', v: '38 × 22' },
        { k: 'Target', v: '48 × 32' },
        { k: 'Saves', v: 'on change' },
      ]}
    >
      <Blk title="Specimen" lede="Live, and reachable by keyboard — Tab to one and press Space.">
        <Bench pad={false} style={{ padding: '8px 12px' }}>
          <div className="col" style={{ gap: 0, width: 340 }}>
            {SETTINGS.map((s) => (
              <div className="kv" key={s.k}>
                <span className="kv__k">{s.label}</span>
                <span className="kv__v">
                  <Switch
                    label={s.label}
                    checked={on[s.k]}
                    onChange={(next) => setOn((o) => ({ ...o, [s.k]: next }))}
                  />
                </span>
              </div>
            ))}
          </div>
        </Bench>
      </Blk>

      <Blk
        title="The boundary with Checkbox is when it saves"
        lede={
          <>
            A <b>switch</b> has already saved by the time the thumb lands. A <b>checkbox</b> is a value
            collected and then saved with everything else on the form. If there is a Save button underneath it,
            it was a checkbox &mdash; the shape is not the decision.
          </>
        }
      >
        <Bench style={{ gap: 30 }}>
          <Cell label="SWITCH · TAKES EFFECT NOW">
            <Switch label="Weekly report" checked={on.weekly} onChange={(n) => setOn((o) => ({ ...o, weekly: n }))} />
          </Cell>
          <Cell label="CHECKBOX · SAVED WITH THE FORM">
            <Checkbox label="Mark as paid" defaultChecked />
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="It carries its own name"
        lede={
          <>
            A switch in the right half of a <code>.kv</code> row has its words in the left half, and{' '}
            <b>nothing in the DOM connects the two</b>. A reader announces &ldquo;switch, on&rdquo; with no
            subject. So <code>label</code> is required and becomes <code>aria-label</code> &mdash; the same
            phrase, said twice, once for each way of reading the row.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '14px 16px' }}>
          <code style={{ fontSize: 12.5, lineHeight: 1.8 }}>
            &lt;span class=&quot;kv__k&quot;&gt;Session reminder to clients&lt;/span&gt; &larr; seen
            <br />
            &lt;button role=&quot;switch&quot; aria-label=&quot;Session reminder to clients&quot;&gt; &larr;
            heard
          </code>
        </Bench>
      </Blk>

      <Blk title="States">
        <Bench style={{ gap: 26 }}>
          <Cell label="ON">
            <Switch label="On" checked onChange={() => {}} />
          </Cell>
          <Cell label="OFF">
            <Switch label="Off" checked={false} onChange={() => {}} />
          </Cell>
          <Cell label="ON · DISABLED">
            <Switch label="On, locked" checked disabled />
          </Cell>
          <Cell label="OFF · DISABLED">
            <Switch label="Off, locked" checked={false} disabled />
          </Cell>
        </Bench>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Track', value: '38 × 22' },
            { property: 'Thumb', value: '18px' },
            { property: 'Target', value: '48 × 32', token: '--w-tap' },
            { property: 'Element', value: <code>&lt;button role=&quot;switch&quot;&gt;</code>, note: 'What the product already uses. Never a span' },
            { property: 'State', value: <code>aria-checked</code> },
            { property: 'Name', value: <code>label</code>, note: 'Required — the .kv row’s words are not connected to it' },
            { property: 'Transition', value: '180ms', token: '--tx-t-fast' },
            { property: 'Saves', value: 'on change', note: 'If there is a Save button below it, use a Checkbox' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <div className="kv" style={{ width: 300 }}>
                <span className="kv__k">Weekly report · Sundays 20:00</span>
                <span className="kv__v">
                  <Switch label="Weekly report, Sundays at 20:00" checked onChange={() => {}} />
                </span>
              </div>
            ),
            caption: 'A setting that is true the moment it moves, with the schedule in the label so “on” means something specific.',
          }}
          no={{
            figure: (
              <div className="col gap3" style={{ width: 300 }}>
                <div className="kv">
                  <span className="kv__k">Mark as paid</span>
                  <span className="kv__v">
                    <Switch label="Mark as paid" checked={false} onChange={() => {}} />
                  </span>
                </div>
                <button className="btn btn--sm btn--primary" type="button" style={{ alignSelf: 'flex-start' }}>
                  Save changes
                </button>
              </div>
            ),
            caption:
              'A switch above a Save button. It promises the change has landed and then asks for confirmation — the trainer cannot tell whether leaving now keeps it.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
