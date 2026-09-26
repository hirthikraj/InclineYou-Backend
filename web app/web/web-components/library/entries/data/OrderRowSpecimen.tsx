'use client';

import { useState } from 'react';

import { Button } from '../../../ui/Button';
import { OrderRow, OrderRows } from '../../../ui/OrderRow';
import { RowMenu } from '../../../ui/RowMenu';

const SEED = [
  'How would you rate your overall progress this block?',
  'How consistent were you with your training sessions?',
  'How well did you recover between sessions?',
];

/**
 * Live, and the drag works: this specimen is the whole ladder — arm on the
 * grip, carry, drop — plus the keyboard path beside it, because a list only a
 * mouse can arrange is exactly what the component's doc-comment refuses.
 *
 * Throwaway state; nothing here reaches a template.
 */
export function OrderRowSpecimen() {
  const [rows, setRows] = useState(SEED);
  const [armed, setArmed] = useState<number | null>(null);
  const [carrying, setCarrying] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= rows.length) return;
    const next = rows.slice();
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    setRows(next);
  };

  return (
    <OrderRows label="Specimen questions">
      {rows.map((text, i) => (
        <OrderRow
          key={text}
          ordinal={i + 1}
          gripLabel={`Reorder question ${i + 1}`}
          armed={armed === i}
          lifted={carrying === i}
          onto={over === i && carrying !== i}
          onGripDown={() => setArmed(i)}
          onGripUp={() => setArmed(null)}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(i));
            setCarrying(i);
          }}
          onDragEnd={() => { setCarrying(null); setOver(null); setArmed(null); }}
          onDragOver={(e) => { e.preventDefault(); setOver(i); }}
          onDragLeave={() => setOver((v) => (v === i ? null : v))}
          onDrop={(e) => {
            e.preventDefault();
            const from = Number(e.dataTransfer.getData('text/plain'));
            if (Number.isFinite(from)) move(from, i);
            setCarrying(null);
            setOver(null);
          }}
          actions={
            <>
              <RowMenu
                label={`question ${i + 1}`}
                items={[
                  { key: 'up', label: 'Move up', disabled: i === 0, onSelect: () => move(i, i - 1) },
                  { key: 'down', label: 'Move down', disabled: i === rows.length - 1, onSelect: () => move(i, i + 1) },
                ]}
              />
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                label={`Remove question ${i + 1}`}
                icon={<BinIcon />}
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              />
            </>
          }
        >
          {text}
        </OrderRow>
      ))}
      {rows.length === 0 && (
        <Button variant="secondary" size="sm" onClick={() => setRows(SEED)}>
          Put the three back
        </Button>
      )}
    </OrderRows>
  );
}

/** The lettered form — the same component with a field in it. */
export function OptionRowSpecimen() {
  const [options, setOptions] = useState([
    '100% — hit every session',
    '75 to 99% — missed one or two',
  ]);

  return (
    <OrderRows label="Specimen options">
      {options.map((text, i) => (
        <OrderRow
          key={i}
          field
          ordinal={String.fromCharCode(65 + i)}
          gripLabel={`Reorder option ${String.fromCharCode(65 + i)}`}
        >
          <input
            className="ctl"
            value={text}
            aria-label={`Option ${String.fromCharCode(65 + i)}`}
            onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
          />
        </OrderRow>
      ))}
    </OrderRows>
  );
}

function BinIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M10 7V5h4v2M6 7l1 13h10l1-13" />
    </svg>
  );
}
