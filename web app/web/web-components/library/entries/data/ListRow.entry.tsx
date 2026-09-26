import { Avatar } from '../../../ui/Avatar';
import { ListRow, ListRowNumber, ListRows } from '../../../ui/ListRow';
import { Tag } from '../../../ui/Tag';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

const PANE = [
  { id: 'cl-006', name: 'Meera Krishnan', sub: 'Floor · Push / Pull', tag: <Tag tone="ok">Active</Tag>, n: '₹9,500', sel: true },
  { id: 'cl-004', name: 'Priya Pillai', sub: 'Floor · Full B', tag: <Tag tone="danger">12 days late</Tag>, n: '₹9,000' },
  { id: 'cl-003', name: 'Vikram Rao', sub: 'Remote · Upper A', tag: <Tag tone="warn">Renew soon</Tag>, n: '—' },
];

export function ListRowEntry() {
  const entry = byId('c-listrow')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/ListRow.tsx</code> },
        { k: 'Class', v: <code>.lrow</code> },
        { k: 'Height', v: '56px min' },
        { k: 'Pane', v: '400px' },
      ]}
    >
      <Blk title="Specimen">
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <div
            style={{
              width: 380,
              border: '1px solid var(--tx-line)',
              borderRadius: 'var(--tx-r3)',
              overflow: 'hidden',
              background: 'var(--tx-surface)',
            }}
          >
            <ListRows label="Clients">
              {PANE.map((r) => (
                <ListRow
                  key={r.id}
                  href={`/clients/${r.id}`}
                  selected={r.sel}
                  avatar={<Avatar id={r.id} name={r.name} />}
                  title={r.name}
                  sub={r.sub}
                  right={
                    <>
                      {r.tag}
                      <ListRowNumber>{r.n}</ListRowNumber>
                    </>
                  }
                />
              ))}
            </ListRows>
          </div>
        </Bench>
      </Blk>

      <Blk
        title="aria-selected needs a list to be selected in"
        lede={
          <>
            The reference draws <code>&lt;div class=&quot;lrow&quot; aria-selected=&quot;true&quot;&gt;</code>.
            That attribute is only meaningful on an element inside a container with a matching role &mdash; on
            a bare div it is <b>ignored</b>, so the one state the pane exists to express is announced to
            nobody.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '14px 16px' }}>
          <code style={{ fontSize: 12.5, lineHeight: 1.9 }}>
            &lt;div role=&quot;listbox&quot; aria-label=&quot;Clients&quot;&gt; &larr; supplied by ListRows
            <br />
            &nbsp;&nbsp;&lt;a role=&quot;option&quot; aria-selected=&quot;true&quot; href=…&gt;
          </code>
        </Bench>
        <p className="blk__p">
          The row stays an <code>&lt;a&gt;</code>, because selecting a client changes the URL: middle-click
          still opens a tab and the back button still works. The wrapper supplies the semantics the attribute
          needed, without taking the behaviour the element already had.
        </p>
      </Blk>

      <Blk
        title="For finding, not comparing"
        lede={
          <>
            The second line says <b>where and what</b> &mdash; &ldquo;Floor &middot; Push / Pull&rdquo; &mdash;
            never a repeat of the name. A row a trainer scans for a person needs one strong line and one weak
            one; two strong lines is a table that has lost its headers.
          </>
        }
      />

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Height', value: '56px min', note: 'Grows for a second line; never shrinks below the tap target' },
            { property: 'Pane', value: '400px', note: 'The left half of a split' },
            { property: 'Title', value: '13.5px / 600' },
            { property: 'Sub', value: '12px', token: '--tx-ink-3', note: 'Where and what' },
            { property: 'Number', value: <code>.lrow__n</code>, note: 'Tabular, right-ranged' },
            { property: 'Element', value: <code>&lt;a&gt;</code>, note: 'Selection is a URL change' },
            { property: 'Container', value: <code>role=&quot;listbox&quot;</code>, note: 'Without it aria-selected does nothing' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <div style={{ width: 300, background: 'var(--tx-surface)', borderRadius: 8 }}>
                <ListRows label="Clients">
                  <ListRow
                    href="/clients/cl-006"
                    selected
                    avatar={<Avatar id="cl-006" name="Meera Krishnan" />}
                    title="Meera Krishnan"
                    sub="Floor · Push / Pull"
                  />
                </ListRows>
              </div>
            ),
            caption: 'One strong line for finding, one weak line for confirming. The eye lands on the name and the second line answers “which Meera”.',
          }}
          no={{
            figure: (
              <div style={{ width: 300, background: 'var(--tx-surface)', borderRadius: 8 }}>
                <ListRows label="Clients">
                  <ListRow
                    href="/clients/cl-006"
                    avatar={<Avatar id="cl-006" name="Meera Krishnan" />}
                    title="Meera Krishnan"
                    sub="₹9,500 · 92% · 8 of 12 · Thu 06:00"
                  />
                </ListRows>
              </div>
            ),
            caption:
              'Four figures crammed into the second line. Nothing here can be compared with the row above it — this is table data in a list, and it needs columns to be readable.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
