'use client';

import { useState } from 'react';

import { TemplateRow, TemplateRowHead } from '../../../ui/TemplateRow';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/**
 * Workout-template row — `c-workoutrow`'s sibling for a blueprint.
 *
 * The rows below are `ui/TemplateRow.tsx`, the same import the Templates tab of
 * `/programs/workouts` renders, so this page cannot drift from the screen. The
 * selection and the name's click are live: both are the parts a drawing could
 * not show.
 */
export function TemplateRowEntry() {
  const entry = byId('c-templaterow')!;
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set(['b']));
  const [opened, setOpened] = useState<string | null>(null);

  const rows = [
    { id: 'a', name: 'Push · full gym', notes: 'The heavy press first, then volume.', duration: '~37 min', movements: 5, sets: 16, created: '2 Aug 2026', updated: '11 Sep 2026' },
    { id: 'b', name: 'Dumbbells only · full body', notes: 'For a client training at home.', duration: '~29 min', movements: 5, sets: 14, created: '18 Aug 2026', updated: '18 Aug 2026' },
    { id: 'c', name: 'Ten-minute finisher', notes: null, duration: '~11 min', movements: 3, sets: 9, created: '3 Sep 2026', updated: '9 Sep 2026' },
  ] as const;

  function toggle(id: string, next: boolean) {
    setPicked(prev => {
      const out = new Set(prev);
      if (next) out.add(id); else out.delete(id);
      return out;
    });
  }

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/TemplateRow.tsx</code> },
        { k: 'Class', v: <code>.wtrow</code> },
        { k: 'Element', v: <code>&lt;div&gt;</code> },
        { k: 'Columns', v: '8' },
        { k: 'Reflows at', v: '900px' },
        { k: 'Used in', v: '/programs/workouts?view=templates' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            The NAME is the control &mdash; a <code>&lt;button&gt;</code>, because opening a saved template is
            a fetch and then a dialog rather than a navigation. That is the one thing this does not share
            with <code>c-workoutrow</code>, whose name is a link.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px', display: 'block' }}>
          <div className="pgt">
            <TemplateRowHead
              allSelected={picked.size === rows.length}
              someSelected={picked.size > 0}
              onSelectAll={next => setPicked(next ? new Set(rows.map(r => r.id)) : new Set())}
            />
            <ul className="pgt__l" role="list">
              {rows.map(r => (
                <li key={r.id}>
                  <TemplateRow
                    name={r.name}
                    notes={r.notes}
                    duration={r.duration}
                    movements={r.movements}
                    sets={r.sets}
                    created={r.created}
                    updated={r.updated}
                    selected={picked.has(r.id)}
                    onSelect={next => toggle(r.id, next)}
                    onOpen={() => setOpened(r.name)}
                  />
                </li>
              ))}
            </ul>
            <p className="pgt__range" role="status">
              1 to {rows.length} of {rows.length}
              {picked.size > 0 && <span className="pgt__picked">{picked.size} selected</span>}
            </p>
          </div>
        </Bench>
        {opened && <p className="ink3" role="status">Opened <b>{opened}</b>.</p>}
      </Blk>

      <Blk
        title="The two stamps are the point"
        lede={
          <>
            This list was a <code>c-listrow</code> shelf &mdash; a name over a 12px sentence &mdash; behind the
            same tab strip as three <code>c-workoutrow</code> tables. <i>Created on</i> and <i>Updated on</i>{' '}
            are what a trainer with thirty blueprints actually scans for, and a sentence cannot be scanned
            down one edge. Both arrive as strings: a row holding its own <code>Date.now()</code> would format
            the stamp twice and can disagree across a day boundary.
          </>
        }
      />

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Columns', value: '8', note: 'Select · workout · notes · duration · movements · sets · created on · updated on' },
            { property: 'Reflow', value: '900px', note: 'Two declared lines, the select box flanking them' },
            { property: 'Target', value: 'the name', note: 'A button — a checkbox may live inside neither an anchor nor a button' },
            { property: 'Header', value: 'sticky', note: 'Carries the select-all, so it is not `aria-hidden`; its labels are' },
            { property: 'Column heads', value: 'mono 9.5px', token: '--tx-ink-3' },
            { property: 'Figures', value: 'mono 12.5px', token: '--tx-ink-2', note: 'Right-ranged, so the column reads down' },
            { property: 'Nouns', value: 'clipped', note: 'Un-clipped by the reflow, not invented by it' },
            { property: 'Busy', value: <code>.wtrow--busy</code>, note: 'The open is in flight — dimmed and inert, so it is not clicked twice' },
          ]}
        />
      </Blk>
    </Cmp>
  );
}
