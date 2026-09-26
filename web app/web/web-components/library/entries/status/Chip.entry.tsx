'use client';

import { useState } from 'react';

import { Chip } from '../../../ui/Chip';
import { Tag } from '../../../ui/Tag';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

export function ChipEntry() {
  const entry = byId('c-chip')!;

  const [filters, setFilters] = useState<string[]>(['all']);
  const toggle = (k: string) =>
    setFilters((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Chip.tsx</code> },
        { k: 'Class', v: <code>.chip</code> },
        { k: 'Roles', v: 'filter, token' },
        { k: 'Height', v: '28px' },
        { k: 'Target', v: '34 × 32' },
      ]}
    >
      <Blk
        title="Specimen"
        lede="Live. Press them, and reach them with Tab and Space — which is the whole reason this component exists."
      >
        <Bench style={{ gap: 7 }}>
          {[
            { k: 'all', label: 'All 22' },
            { k: 'active', label: 'Active 18' },
            { k: 'paused', label: 'Paused 3' },
            { k: 'owing', label: 'Owing 5' },
            { k: 'ending', label: 'Ending 4' },
          ].map((f) => (
            <Chip key={f.k} pressed={filters.includes(f.k)} onClick={() => toggle(f.k)}>
              {f.label}
            </Chip>
          ))}
        </Bench>
      </Blk>

      <Blk
        title="The element, guaranteed rather than remembered"
        lede={
          <>
            The design file draws <code>&lt;span class=&quot;chip&quot; role=&quot;button&quot;
            aria-pressed=&quot;true&quot;&gt;</code>. A span with a role is reachable by a screen reader and{' '}
            <b>not by the keyboard</b> &mdash; no tab stop, and it does not fire on Space or Enter.
          </>
        }
      >
        <Bench style={{ gap: 26 }}>
          <Cell label="THE REFERENCE · SPAN + ROLE">
            <span className="chip" role="button" aria-pressed="true">
              Owing 5
            </span>
          </Cell>
          <Cell label="THIS COMPONENT · A BUTTON">
            <Chip pressed onClick={() => {}}>
              Owing 5
            </Chip>
          </Cell>
        </Bench>
        <p className="blk__p">
          <b>The product does not have that bug.</b> It renders <code>&lt;button className=&quot;chip&quot;&gt;</code>{' '}
          at thirteen of its sixteen call-sites, and a bare <code>&lt;span&gt;</code> at the other three, which
          are tokens rather than controls. So this component is not a fix &mdash; it is the guarantee. The
          correct choice was being made by hand every time, and the one time it is not, the drawing above is
          what gets copied.
        </p>
        <p className="blk__p">
          Try tabbing to each of the two specimens. The <code>role</code> and the <code>aria-pressed</code> are
          right in both; only the element differs, and <code>.chip</code> styles a button identically because
          the class never depended on the tag.
        </p>
      </Blk>

      <Blk
        title="Two roles, one class"
        lede={
          <>
            A <b>filter</b> toggles a list and is pressable. A <b>token</b> is a value that has been chosen
            &mdash; a day, a place &mdash; and is only read. Passing neither <code>pressed</code> nor{' '}
            <code>onClick</code> renders a plain span with no role, so a token is never announced as a control
            that does nothing.
          </>
        }
      >
        <Bench style={{ gap: 26 }}>
          <Cell label="FILTER · PRESSABLE">
            <Chip pressed onClick={() => {}}>
              Active 18
            </Chip>
          </Cell>
          <Cell label="TOKEN · READ ONLY">
            <Chip>Mon</Chip>
          </Cell>
          <Cell label="GHOST · UNSELECTED SET">
            <Chip ghost>Sat</Chip>
          </Cell>
          <Cell label="DISABLED · REFUSED, NOT REMOVED">
            <Chip pressed={false} disabled onClick={() => {}}>
              Archived 0
            </Chip>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="And the boundary with Tag"
        lede="Similar shapes, opposite meanings. A chip is pressed; a tag is read. If it is not pressable it is a tag, and the 8px radius against the tag’s pill is the visual tell."
      >
        <Bench style={{ gap: 26 }}>
          <Cell label="CHIP · 28px, 8px RADIUS">
            <Chip pressed onClick={() => {}}>
              Owing 5
            </Chip>
          </Cell>
          <Cell label="TAG · 20px, FULL RADIUS">
            <Tag tone="danger">11 days late</Tag>
          </Cell>
        </Bench>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Height', value: '28px' },
            { property: 'Target', value: '34 × 32', token: '--w-tap', note: 'Padding carries it past the visible 28px' },
            { property: 'Radius', value: '8px', token: '--tx-r2', note: 'Not a pill — that is a tag' },
            { property: 'Label', value: '12.5px / 600' },
            { property: 'Element', value: <code>&lt;button&gt;</code>, note: 'When pressable. A bare span when it is a token' },
            { property: 'Selected', value: <code>aria-pressed</code>, note: 'Announced, not only drawn' },
            { property: 'Count in label', value: 'Active 18', note: 'The number rides in the chip, so filtering has a visible cost' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <div className="bench__row" style={{ gap: 7, flexWrap: 'nowrap' }}>
                <Chip pressed onClick={() => {}}>
                  All 22
                </Chip>
                <Chip pressed={false} onClick={() => {}}>
                  Owing 5
                </Chip>
                <Chip pressed={false} onClick={() => {}}>
                  Ending 4
                </Chip>
              </div>
            ),
            caption: (
              <>
                Each chip carries its count, so the trainer can see what a filter will cost them before pressing
                it. &ldquo;Owing 5&rdquo; is a decision; &ldquo;Owing&rdquo; is a guess.
              </>
            ),
          }}
          no={{
            figure: (
              <div className="bench__row" style={{ gap: 7, flexWrap: 'nowrap' }}>
                <span className="chip" role="button" aria-pressed="true">
                  All
                </span>
                <span className="chip" role="button" aria-pressed="false">
                  Owing
                </span>
                <Tag tone="ok">Active</Tag>
              </div>
            ),
            caption:
              'Spans with roles — no keyboard — no counts, and a tag smuggled into the row. The third item looks pressable and is not, which is the one mistake a filter row cannot afford.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
