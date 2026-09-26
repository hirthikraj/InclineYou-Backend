'use client';

import { useState } from 'react';

import { ChoiceList } from '../../../ui/ChoiceList';
import { Cell } from '../../chrome/Blk';

/**
 * Every specimen on this page, and they are all in one client module for a
 * reason the library has already paid for once: an entry file is a SERVER
 * component, and `ChoiceList` takes an `onChange` — a function prop cannot
 * cross that boundary, so a control dropped straight into the entry is a 500
 * on the route rather than a specimen that does not move.
 *
 * It is also the only honest way to draw this one. The whole argument for the
 * component is what PICKING does — the ground, the border and the weight all
 * move together — and a frozen list shows one of its two states.
 */

/** The exclusive case: four answers, one of them true. */
export function ChoiceOne() {
  const [value, setValue] = useState<string[]>(['b']);
  return (
    <ChoiceList
      name="spec-difficulty"
      label="How did the plan feel?"
      value={value}
      onChange={setValue}
      options={[
        { id: 'a', text: 'Too easy' },
        { id: 'b', text: 'About right' },
        { id: 'c', text: 'Hard but manageable' },
        { id: 'd', text: 'Too hard' },
      ]}
    />
  );
}

/** The one question in the product's bank that takes several answers. */
export function ChoiceMany() {
  const [value, setValue] = useState<string[]>(['a', 'b']);
  return (
    <ChoiceList
      name="spec-blockers"
      label="What got in the way most often?"
      multiple
      value={value}
      onChange={setValue}
      options={[
        { id: 'a', text: 'Work' },
        { id: 'b', text: 'Travel' },
        { id: 'c', text: 'Illness' },
        { id: 'd', text: 'Motivation' },
        { id: 'e', text: 'Nothing, it was a clean block' },
      ]}
    />
  );
}

/** Two options is a yes/no, and there is no second component for it. */
export function ChoiceYesNo() {
  const [value, setValue] = useState<string[]>([]);
  return (
    <ChoiceList
      name="spec-pain"
      label="Did anything hurt or feel off while training?"
      value={value}
      onChange={setValue}
      options={[
        { id: 'yes', text: 'Yes' },
        { id: 'no', text: 'No' },
      ]}
    />
  );
}

/** The *Other* line — a fifth option that happens to be typed into. */
export function ChoiceOther() {
  const [value, setValue] = useState<string[]>(['other']);
  const [text, setText] = useState('Night shifts for three weeks');
  return (
    <ChoiceList
      name="spec-other"
      label="What got in the way most often?"
      value={value}
      onChange={setValue}
      options={[
        { id: 'a', text: 'Work' },
        { id: 'b', text: 'Travel' },
        { id: 'c', text: 'Illness' },
      ]}
      other={{
        id: 'other',
        label: 'Something else',
        value: text,
        placeholder: 'In your own words',
        onChange: setText,
      }}
    />
  );
}

/**
 * The near miss, side by side. `.lgl` + `.lrow` is the same picture and a
 * different grammar — drawn here as the raw markup the booking panel writes,
 * because the point is what the ELEMENTS are, not how they look.
 */
export function ChoiceAgainstRows() {
  const [value, setValue] = useState<string[]>(['b']);
  return (
    <>
      <Cell label="THIS COMPONENT · A RADIO GROUP">
        <div style={{ width: 300 }}>
          <ChoiceList
            name="spec-cmp"
            label="How did the plan feel?"
            value={value}
            onChange={setValue}
            options={[
              { id: 'a', text: 'Too easy' },
              { id: 'b', text: 'About right' },
              { id: 'c', text: 'Too hard' },
            ]}
          />
        </div>
      </Cell>
      <Cell label="A PICKING LIST · THREE TOGGLES">
        <div className="lgl" style={{ width: 300 }}>
          <button type="button" className="lrow" aria-pressed={false}>
            <span className="lrow__m">
              <span className="lrow__t">Too easy</span>
            </span>
          </button>
          <button type="button" className="lrow" aria-pressed>
            <span className="lrow__m">
              <span className="lrow__t">About right</span>
            </span>
          </button>
          <button type="button" className="lrow" aria-pressed={false}>
            <span className="lrow__m">
              <span className="lrow__t">Too hard</span>
            </span>
          </button>
        </div>
      </Cell>
    </>
  );
}
