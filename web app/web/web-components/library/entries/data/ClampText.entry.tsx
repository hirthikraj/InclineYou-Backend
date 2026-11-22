'use client';

import { useState } from 'react';

import { byId } from '../../../registry';
import { ClampText } from '../../../ui/ClampText';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { SpecTable } from '../../chrome/Docs';

const LONG =
  'Pulled 62.5 for five on Friday. Two more sessions like that and we test a heavier single — proud of you. Sleep early on Thursday and keep the warm-up sets light.';
const SHORT = 'Strong session — every set landed.';

function Demo({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [fits, setFits] = useState<boolean | null>(null);
  return (
    <div style={{ width: 300 }}>
      <ClampText text={text} open={open} onFits={setFits} />
      {fits === false && (
        <button type="button" className="btn btn--ghost btn--sm mt2" onClick={() => setOpen((o) => !o)}>
          {open ? 'Show less' : 'Show all'}
        </button>
      )}
    </div>
  );
}

/** Clamp text — written 22 Nov 2026 for the portal inbox's messages. */
export function ClampTextEntry() {
  const entry = byId('c-clamptext')!;
  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/ClampText.tsx</code> },
        { k: 'Class', v: <code>.clmp</code> },
        { k: 'Element', v: <><code>&lt;div&gt;</code> + one <code>&lt;p&gt;</code>; the caller owns the control</> },
        { k: 'Used in', v: '/me/inbox' },
      ]}
    >
      <Blk title="Specimen" lede="A text longer than its line opens; one that fits is drawn whole and offers nothing to press.">
        <Bench>
          <Cell label="longer than a line">
            <Demo text={LONG} />
          </Cell>
          <Cell label="fits — no control">
            <Demo text={SHORT} />
          </Cell>
        </Bench>
      </Blk>
      <SpecTable
        rows={[
          { property: 'Closed', value: '1lh, end fades over 56px', token: '--tx-ink-3', note: 'Mask, not an ellipsis — an ellipsis cannot animate into the rest of the line' },
          { property: 'Open', value: 'its own height', token: '--tx-ink-2', note: 'Only height moves; the type is identical, so nothing re-flows' },
          { property: 'Motion', value: '240ms', token: '--tx-ease', note: 'Off under prefers-reduced-motion' },
          { property: 'Fits', value: 'measured on width change', note: 'onFits(true) — draw no control' },
        ]}
      />
    </Cmp>
  );
}
