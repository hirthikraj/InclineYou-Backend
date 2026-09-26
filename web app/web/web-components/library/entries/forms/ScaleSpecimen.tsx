'use client';

import { useState } from 'react';

import { Scale } from '../../../ui/Scale';

/**
 * The specimens, in a client module for `ChoiceListSpecimen`'s reason: an entry
 * file is a Server Component and `onChange` is a function prop, which cannot
 * cross that boundary.
 */

/** The middle scale, and the one every seeded question uses. */
export function ScaleTen() {
  const [value, setValue] = useState<number | null>(7);
  return <Scale name="spec-ten" label="How would you rate your overall progress this block?" value={value} onChange={setValue} />;
}

/** The three the model allows, stacked, so the wrap at twenty is visible. */
export function ScaleThree() {
  const [five, setFive] = useState<number | null>(4);
  const [ten, setTen] = useState<number | null>(7);
  const [twenty, setTwenty] = useState<number | null>(13);
  return (
    <div className="col gap4" style={{ width: 420 }}>
      <div>
        <p className="micro ink3" style={{ marginBottom: 8 }}>SCALE 5</p>
        <Scale name="spec-5" label="Out of five" top={5} value={five} onChange={setFive} />
      </div>
      <div>
        <p className="micro ink3" style={{ marginBottom: 8 }}>SCALE 10</p>
        <Scale name="spec-10" label="Out of ten" top={10} value={ten} onChange={setTen} />
      </div>
      <div>
        <p className="micro ink3" style={{ marginBottom: 8 }}>SCALE 20</p>
        <Scale name="spec-20" label="Out of twenty" top={20} value={twenty} onChange={setTwenty} />
      </div>
    </div>
  );
}

/** With the ends named — a caller that has the words, which this product does not. */
export function ScaleEnds() {
  const [value, setValue] = useState<number | null>(null);
  return (
    <Scale
      name="spec-ends"
      label="How sore were you the next morning?"
      value={value}
      onChange={setValue}
      low="Not at all"
      high="Could not train"
    />
  );
}

/** Unanswered, which is the state the check-in opens every question in. */
export function ScaleEmpty() {
  const [value, setValue] = useState<number | null>(null);
  return <Scale name="spec-empty" label="How well did you recover between sessions?" value={value} onChange={setValue} />;
}
