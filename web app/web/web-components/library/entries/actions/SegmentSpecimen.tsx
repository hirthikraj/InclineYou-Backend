'use client';

import { useState } from 'react';

import { Segment, SegmentButton } from '../../../ui/Segment';

/**
 * The one specimen on this page that is not static.
 *
 * `Segment` is a toggle and the whole argument for it is about what PRESSED
 * looks like, so a frozen pair of buttons would be showing half of it. Its
 * state here is local and throwaway: the real `TodayList` persists the choice
 * to `localStorage`, and a specimen sheet that wrote to that key would change
 * the running screen from the library, which is the one thing a specimen must
 * never do.
 */
export function SegmentSpecimen() {
  const [on, setOn] = useState({ floor: true, remote: true, done: false });
  const toggle = (k: keyof typeof on) => setOn((v) => ({ ...v, [k]: !v[k] }));
  return (
    <Segment label="Specimen filters">
      <SegmentButton pressed={on.floor} onClick={() => toggle('floor')} count={1}>
        In Person
      </SegmentButton>
      <SegmentButton pressed={on.remote} onClick={() => toggle('remote')} count={0}>
        Online
      </SegmentButton>
      <SegmentButton pressed={on.done} onClick={() => toggle('done')} count={7}>
        Done
      </SegmentButton>
    </Segment>
  );
}

/**
 * The second grammar, and it is live for the same reason the first one is.
 *
 * The whole argument for `single` is about the KEYBOARD as much as the paint:
 * Tab enters the group once, at the checked option, and the arrows move between
 * the five. A frozen row of pills would show none of that.
 */
export function SegmentSingleSpecimen() {
  const [pick, setPick] = useState('all');
  const options = [
    { value: 'all', label: 'All', count: 26 },
    { value: 'done', label: 'Completed', count: 13 },
    { value: 'booked', label: 'Booked', count: 8 },
    { value: 'missed', label: 'Missed', count: 3 },
    { value: 'cancelled', label: 'Cancelled', count: 2 },
  ];
  return (
    <Segment label="Specimen outcome filter" mode="single">
      {options.map((o) => (
        <SegmentButton
          key={o.value}
          mode="single"
          pressed={pick === o.value}
          onClick={() => setPick(o.value)}
          count={o.count}
        >
          {o.label}
        </SegmentButton>
      ))}
    </Segment>
  );
}
