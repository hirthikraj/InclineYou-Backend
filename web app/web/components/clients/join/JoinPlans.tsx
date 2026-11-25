'use client';

import { useState } from 'react';
import Link from 'next/link';

import { Plus } from '@/components/shell/Icons';
import { Bin } from '@/components/clients/assessments/Icons';
import type { JoinPackOption } from '@/lib/join/api';
import { moved } from '@/lib/assessments/vocab';
import { planLine } from '@/lib/join/types';
import { Button } from '@/web-components/ui/Button';
import { ListRow } from '@/web-components/ui/ListRow';
import { OrderRow, OrderRows } from '@/web-components/ui/OrderRow';
import { RowMenu } from '@/web-components/ui/RowMenu';
import { Switch } from '@/web-components/ui/Switch';

/**
 * THE JOIN PAGE'S PLANS — which packs people may pick, in what order, and whether they may pick none (22 Nov 2026 rework).
 *
 * The question builder's shape, because the two cards sit side by side and ask the same two things of the trainer — what is
 * on the page, and in which order:
 *
 *   ON YOUR PAGE    an ordered list (`OrderRow`): drag by the grip, or the row's menu for Move up / Move down (SC 2.5.7's
 *                   non-dragging path), and a bin. Each row says what the pack IS — sessions, kind, validity — and its
 *                   price, because that is what the person reading the page will choose on.
 *   YOUR PRICE LIST everything not on the page yet, as pressable rows with the same three facts and a "+". It replaced a
 *                   <select> that showed nothing until it was opened, showed only names and prices when it was, and added
 *                   a plan the moment one was chosen — a select that acts on change is a control nobody expects to act.
 *
 * And the "Join without a plan" switch is only drawn when it can be switched. With no plans offered everybody joins without
 * one, so the switch used to sit there ON, in lime, and refuse to move; now that state is a sentence.
 */
const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export function JoinPlans({
  packs,
  offered,
  onChange,
  allowNoPlan,
  onAllowNoPlan,
  max,
}: {
  /** The trainer's own active packs. */
  packs: JoinPackOption[];
  /** Ids on the page, in order. */
  offered: string[];
  onChange: (ids: string[]) => void;
  allowNoPlan: boolean;
  onAllowNoPlan: (on: boolean) => void;
  max: number;
}) {
  const byId = new Map(packs.map((p) => [p.id, p]));
  const onPage = offered.filter((id) => byId.has(id));
  const rest = packs.filter((p) => !onPage.includes(p.id));
  const full = onPage.length >= max;

  const [armed, setArmed] = useState<number | null>(null);
  const [carrying, setCarrying] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  return (
    <div className="jlp">
      <div className="jlp__hd">
        <span className="jlp__t">On your page</span>
        <span className="jlp__n">{onPage.length} of {max}</span>
      </div>

      {onPage.length === 0 ? (
        <p className="jlp__empty">
          {packs.length === 0 ? 'Your price list is empty, so there is nothing to offer yet.' : 'None yet. Add one from your price list below.'}
        </p>
      ) : (
        <OrderRows label="Plans on your join page">
          {onPage.map((id, i) => {
            const p = byId.get(id)!;
            return (
              <OrderRow
                key={id}
                ordinal={i + 1}
                gripLabel={`Reorder ${p.name}`}
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
                  if (Number.isFinite(from)) onChange(moved(onPage, from, i));
                  setCarrying(null);
                  setOver(null);
                }}
                actions={
                  <>
                    <RowMenu
                      label={p.name}
                      items={[
                        { key: 'up', label: 'Move up', disabled: i === 0, onSelect: () => onChange(moved(onPage, i, i - 1)) },
                        { key: 'down', label: 'Move down', disabled: i === onPage.length - 1, onSelect: () => onChange(moved(onPage, i, i + 1)) },
                        { separator: true, key: 'sep' },
                        { key: 'rm', label: 'Take off the page', danger: true, onSelect: () => onChange(onPage.filter((x) => x !== id)) },
                      ]}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      label={`Take ${p.name} off the page`}
                      icon={<Bin />}
                      onClick={() => onChange(onPage.filter((x) => x !== id))}
                    />
                  </>
                }
              >
                <PackFacts p={p} />
              </OrderRow>
            );
          })}
        </OrderRows>
      )}

      {rest.length > 0 && (
        <>
          <p className="asm-rule">Your price list</p>
          <div className="jlp__list" role="list" aria-label="Packs you can add">
            {rest.map((p) => (
              <div role="listitem" key={p.id}>
                <ListRow
                  title={p.name}
                  sub={planLine(p)}
                  disabled={full}
                  onClick={() => onChange([...onPage, p.id])}
                  right={
                    <span className="jlp__add">
                      <b>{INR.format(p.amount)}</b>
                      <Plus size={15} />
                    </span>
                  }
                />
              </div>
            ))}
          </div>
          {full && <p className="small">That’s the most a page can show ({max}). Take one off to add another.</p>}
        </>
      )}

      {packs.length === 0 ? (
        <p className="small">
          Add packs on <Link className="inv-link" href="/business/packages">Business → Packages</Link> to offer them here.
        </p>
      ) : (
        <p className="small jlp__note">Only packs you sell yourself are listed. Prices and sessions come from your price list.</p>
      )}

      <div className="jlp__flag">
        {onPage.length === 0 ? (
          <ListRow
            title="Everyone joins without a plan"
            sub="With no plans on the page, people ask to join and you sell them a pack later."
          />
        ) : (
          <ListRow
            title="Let people join without a plan"
            sub="Adds a “Not sure yet” choice under your plans."
            right={<Switch checked={allowNoPlan} label="Let people join without a plan" onChange={onAllowNoPlan} />}
          />
        )}
      </div>
    </div>
  );
}

/** What a pack is, in the words the join page uses, with its price at the end. */
function PackFacts({ p }: { p: JoinPackOption }) {
  return (
    <span className="jlp__pack">
      <span className="jlp__pack-t">
        <b>{p.name}</b>
        <span>{planLine(p)}</span>
      </span>
      <b className="jlp__price">{INR.format(p.amount)}</b>
    </span>
  );
}
