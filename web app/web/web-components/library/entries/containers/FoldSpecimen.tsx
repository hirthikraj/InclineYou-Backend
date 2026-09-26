'use client';

import { useState } from 'react';

import { Fold } from '../../../ui/Fold';
import { Switch } from '../../../ui/Switch';

/**
 * Live, and it has to be: the whole argument for this component is the pair of
 * states — FOLDED and SWITCHED OFF — and a frozen specimen shows one of them.
 *
 * Its state is local and throwaway. A specimen that wrote to the real template
 * would change a running screen from the library, which is the one thing a
 * specimen must never do.
 *
 * The two blocks drawn here are the two the assessment editor has. There was a
 * third — *Progress photos* — and it was the obvious pick for a second
 * specimen, which is exactly why it is worth saying it is gone: **no progress
 * photos** is a standing product rule, and a catalogue page demonstrating a
 * block the product refuses to build teaches the block along with the
 * component.
 */
export function FoldSpecimen() {
  const [open, setOpen] = useState(true);
  const [on, setOn] = useState(true);

  return (
    <Fold
      icon={<RulerIcon />}
      title="Measurements"
      count={15}
      sub="Measurements to collect"
      open={open}
      onOpenChange={setOpen}
      off={!on}
      control={<Switch checked={on} onChange={setOn} label="Collect measurements" />}
    >
      <p className="small" style={{ margin: 0 }}>
        The block&rsquo;s body. Switch it off and the count stays — the fifteen tapes are still
        there, and a trainer who changes their mind has not lost them.
      </p>
    </Fold>
  );
}

/** A second one, drawn beside it, so both states are on screen at once. */
export function FoldOffSpecimen() {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(false);

  return (
    <Fold
      icon={<ChecklistIcon />}
      title="Questions"
      count={11}
      sub="Questions to ask the client"
      open={open}
      onOpenChange={setOpen}
      off={!on}
      control={<Switch checked={on} onChange={setOn} label="Ask questions" />}
    >
      <p className="small" style={{ margin: 0 }}>Eleven, about the block that just finished.</p>
    </Fold>
  );
}

function RulerIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9.5 9.5 3 21 14.5 14.5 21z" />
      <path d="M7.5 8 9 9.5M10.5 5 12 6.5M11 12l1.5 1.5M8 15l1.5 1.5" />
    </svg>
  );
}

function ChecklistIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6.5 4.6 8.2 7.8 5M3 12.5l1.6 1.7L7.8 11M3 18.5l1.6 1.7 3.2-3.2" />
      <path d="M11 6.6h10M11 12.9h10M11 19.2h7" />
    </svg>
  );
}
