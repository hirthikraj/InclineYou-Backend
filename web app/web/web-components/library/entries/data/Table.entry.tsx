import { Avatar } from '../../../ui/Avatar';
import { CheckboxCell } from '../../../ui/Checkbox';
import { DayRule } from '../../../ui/DayRule';
import { GroupRow, Row, Table, TableFrame } from '../../../ui/Table';
import { Tag } from '../../../ui/Tag';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

const COLUMNS = [
  { key: 'sel', label: <span className="vh">Select</span>, bare: true, className: 'sel' },
  { key: 'client', label: 'Client' },
  { key: 'status', label: 'Status' },
  { key: 'plan', label: 'Plan' },
  { key: 'adherence', label: 'Adherence', numeric: true },
  { key: 'owed', label: 'Pending', numeric: true },
];

const ROSTER = [
  { id: 'cl-006', name: 'Meera Krishnan', status: <Tag tone="ok">Active</Tag>, plan: 'Push / Pull', adh: '92%', owed: '₹9,500' },
  { id: 'cl-004', name: 'Priya Pillai', status: <Tag tone="danger">12 days late</Tag>, plan: 'Full B', adh: '71%', owed: '₹9,000' },
  { id: 'cl-003', name: 'Vikram Rao', status: <Tag tone="warn">Renew soon</Tag>, plan: 'Upper A', adh: '88%', owed: '—' },
];

export function TableEntry() {
  const entry = byId('c-table')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Table.tsx</code> },
        { k: 'Class', v: <code>.tbl</code> },
        { k: 'Row', v: '44px' },
        { k: 'Selection', v: 'multi' },
      ]}
    >
      <Blk title="Specimen">
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <TableFrame width="100%">
            <Table caption="3 clients, sorted by name" columns={COLUMNS} sort={{ key: 'client', direction: 'ascending' }}>
              {ROSTER.map((r) => (
                <Row
                  key={r.id}
                  select={<CheckboxCell label={`Select ${r.name}`} />}
                  header={
                    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                      <Avatar id={r.id} name={r.name} size="sm" />
                      {r.name}
                    </span>
                  }
                  cells={[
                    { key: 'status', content: r.status },
                    { key: 'plan', content: r.plan },
                    { key: 'adherence', content: r.adh, numeric: true },
                    { key: 'owed', content: r.owed, numeric: true },
                  ]}
                />
              ))}
            </Table>
          </TableFrame>
        </Bench>
      </Blk>

      <Blk
        title="Three things this adds to a <table>"
        lede={
          <>
            All three are the kind that get written once, correctly, and then lost the next time a column is
            added.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '14px 16px' }}>
          <code style={{ fontSize: 12.5, lineHeight: 1.9 }}>
            &lt;caption class=&quot;vh&quot;&gt; &nbsp;&nbsp;&larr; &ldquo;22 clients, sorted by name&rdquo;
            <br />
            &lt;th scope=&quot;col&quot;&gt; &nbsp;&nbsp;&nbsp;&nbsp;&larr; on every header, not some
            <br />
            &lt;th scope=&quot;row&quot;&gt; &nbsp;&nbsp;&nbsp;&nbsp;&larr; the name cell, so a figure is read
            with it
            <br />
            aria-sort &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&larr; computed from the
            current sort, never typed
          </code>
        </Bench>
        <p className="blk__p">
          <code>scope=&quot;row&quot;</code> is the one that changes the most. Without it a reader in the Pending
          column says &ldquo;nine thousand&rdquo;; with it, &ldquo;Priya Pillai, nine thousand&rdquo;. On a
          nine-column roster that is the difference between usable and not.
        </p>
      </Blk>

      <Blk
        title="The boundary with List row"
        lede={
          <>
            A <b>table is for comparing</b> &mdash; the eye runs down a column of figures. A <b>list row is for
            finding</b> &mdash; the eye runs down a column of names. A table with one meaningful column is a
            list wearing borders, and it costs a header row and a horizontal scrollbar to be one.
          </>
        }
      />

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Row height', value: '44px', note: 'Holds a 20px tag and a 24px avatar without growing' },
            { property: 'Header', value: '11.5px / 600', token: '--tx-ink-3', note: 'Sticky under the toolbar' },
            { property: 'Numeric', value: <code>.num</code>, note: 'Right-aligned, tabular — the point of a table' },
            { property: 'Selection', value: <code>.sel</code>, note: '38px, first column' },
            { property: 'Caption', value: 'visually hidden', note: 'Required. Otherwise: “table, 9 columns” of what?' },
            { property: 'Sort', value: <code>aria-sort</code>, note: 'On exactly one header, computed' },
            { property: 'Frame', value: '1px + 10px radius', note: 'On the wrapper. The table has no border of its own' },
          ]}
        />
      </Blk>

      <Blk
        title="A heading inside the body"
        lede={
          <>
            A long chronological table has one fact that repeats and one that does not.{' '}
            <code>GroupRow</code> is where the repeated one goes: a single{' '}
            <code>&lt;td colspan&gt;</code> across the row, holding whatever heads the run —
            usually a <code>DayRule</code>, which is the design system&rsquo;s answer to exactly
            this question and cannot be a child of a <code>&lt;tbody&gt;</code> on its own,
            because it is a <code>&lt;div&gt;</code>.
          </>
        }
      >
        <Bench>
          <TableFrame width={420}>
            <Table
              caption="4 sessions across two months"
              columns={[
                { key: 'd', label: 'Date' },
                { key: 's', label: 'Session' },
                { key: 'o', label: 'Status' },
              ]}
            >
              <GroupRow span={3}>
                <DayRule className="dayr--sec" day="September 2026" trailing={<span className="dayr__n">2 of 2 kept</span>} />
              </GroupRow>
              <Row cells={[{ key: 'd', content: '17 Sep 2026' }, { key: 's', content: 'Full B' }, { key: 'o', content: <Tag tone="ok">Done</Tag> }]} />
              <Row cells={[{ key: 'd', content: '15 Sep 2026' }, { key: 's', content: 'Full A' }, { key: 'o', content: <Tag tone="ok">Done</Tag> }]} />
              <GroupRow span={3}>
                <DayRule className="dayr--sec" day="August 2026" trailing={<span className="dayr__n">1 of 2 kept</span>} />
              </GroupRow>
              <Row cells={[{ key: 'd', content: '25 Aug 2026' }, { key: 's', content: 'Full A' }, { key: 'o', content: <Tag tone="danger">No-show</Tag> }]} />
              <Row cells={[{ key: 'd', content: '18 Aug 2026' }, { key: 's', content: 'Full A' }, { key: 'o', content: <Tag tone="ok">Done</Tag> }]} />
            </Table>
          </TableFrame>
        </Bench>

        <SpecTable
          rows={[
            {
              property: 'span',
              value: 'required',
              note: 'Exactly the number of VISIBLE columns — see the warning below',
            },
            { property: 'Element', value: <code>&lt;td&gt;</code>, note: 'Not a th: the band divides one list, it does not head a set of rows' },
            { property: 'Hover', value: 'none', note: 'It is not a row anybody can press, and a tint would claim otherwise' },
            { property: 'Contents', value: <code>c-dayrule</code>, note: <><code>.dayr--sec</code> gives it the card’s ground and drops the sticky</> },
          ]}
        />
      </Blk>

      <Blk
        title="The span is load-bearing"
        lede={
          <>
            A <code>colspan</code> wider than the number of columns that exist does{' '}
            <b>not</b> clamp — the browser invents the difference out of the table&rsquo;s own
            width, and on a <code>table-layout: fixed</code> table that silently rewrites every
            track. Measured on the roster at a narrow band: cells summing to 692 inside an 813px
            table, an action column taking 40px against the 161 it was owed, and a button painted
            over its neighbour. <code>.main</code> is <code>overflow: hidden</code>, so no
            document-level overflow probe reported any of it. A screen that hides a column at a
            breakpoint has to change the span there too — or, better, give the group row a real
            cell per hideable column so one rule hides both and the counts cannot disagree.
          </>
        }
      />

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <TableFrame width={340}>
                <Table caption="2 clients by amount pending" columns={[{ key: 'c', label: 'Client' }, { key: 'o', label: 'Pending', numeric: true }]}>
                  <Row header="Priya Pillai" cells={[{ key: 'o', content: '₹9,000', numeric: true }]} />
                  <Row header="Rohan Sharma" cells={[{ key: 'o', content: '₹16,300', numeric: true }]} />
                </Table>
              </TableFrame>
            ),
            caption: 'Figures right-aligned and tabular, so the eye compares digit place against digit place without reading either number.',
          }}
          no={{
            figure: (
              <TableFrame width={340}>
                <Table caption="2 clients" columns={[{ key: 'c', label: 'Client' }, { key: 'o', label: 'Pending' }]}>
                  <Row header="Priya Pillai" cells={[{ key: 'o', content: '₹9,000' }]} />
                  <Row header="Rohan Sharma" cells={[{ key: 'o', content: '₹16,300' }]} />
                </Table>
              </TableFrame>
            ),
            caption:
              'The same figures left-aligned and proportional. ₹9,000 now looks wider than ₹16,300 starts, and the column has to be read rather than scanned.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
