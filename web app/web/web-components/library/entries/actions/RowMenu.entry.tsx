import { RowMenu } from '../../../ui/RowMenu';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/**
 * Row menu — the overflow verbs at the end of a list row.
 *
 * ── WHY IT IS IN THE CATALOGUE ──────────────────────────────────────────────
 *
 * `.menu` and `.menu--row` were always in §33. The BEHAVIOUR was not, and it is
 * most of the component: measure the trigger, flip when the only room is above,
 * close on Escape, close on an outside press, close on a scroll, roving arrow
 * keys, restore focus to the trigger. That ladder had been hand-written twice —
 * `money/PaymentRowMenu.tsx` and `programs/WorkoutRowMenu.tsx` — and the two
 * already disagreed about whether `resize` closes the panel, which is exactly
 * the shape of the defect a third copy adds. The second of those is gone;
 * the first keeps a confirm step this component does not model yet.
 *
 * The specimens below are live: this page renders the same import `/programs`
 * does.
 */
export function RowMenuEntry() {
  const entry = byId('c-rowmenu')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/RowMenu.tsx</code> },
        { k: 'Class', v: <code>.menu.menu--row</code> },
        { k: 'Element', v: <><code>&lt;button&gt;</code> + a fixed panel</> },
        { k: 'Role', v: <code>menu</code> },
        { k: 'Used in', v: '/programs · /programs/workouts' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            Two kinds of item and a rule between them. An item with an <code>href</code> is a destination and
            the router takes it; an item with <code>onSelect</code> is a write, and the panel closes{' '}
            <i>before</i> the callback runs so a handler that opens a dialog is not fighting a panel that is
            still unmounting.
            <br />
            <br />
            <b>Every specimen on this page uses <code>href</code>, and that is a constraint rather than a
            preference.</b> These entry files are Server Components, and a function prop cannot cross that
            boundary — an <code>onSelect</code> written here is not a demo that behaves differently, it is a
            500. <code>/programs</code> is where the write form is drawn, from a client component.
          </>
        }
      >
        <Bench style={{ display: 'flex', gap: 24, justifyContent: 'center' }}>
          <RowMenu
            label="Upper / Lower · 4 day"
            items={[
              { label: 'Duplicate', href: '#c-rowmenu' },
              { separator: true },
              { label: 'Delete…', href: '#c-rowmenu', danger: true },
            ]}
          />
          <RowMenu
            label="Push · full gym"
            items={[
              { label: 'Open the session', href: '#c-rowmenu' },
              { label: 'Client history', href: '#c-rowmenu' },
              { label: 'Mark as done', href: '#c-rowmenu', disabled: true },
            ]}
          />
        </Bench>
      </Blk>

      <Blk
        title="Fixed to the viewport, not to the row"
        lede={
          <>
            The scrollers these rows live in — <code>.pgt__body</code>, <code>.tbl__scroll</code> — are{' '}
            <code>overflow:auto</code> on one axis, and a box that is not <code>visible</code> on one axis
            clips on <i>both</i>. So an absolutely positioned panel loses its lower half on the last row of the
            list, which is the row a trainer is most often acting on.
            <br />
            <br />
            The price of <code>position:fixed</code> is that the panel does not travel with its row. A scroll
            would leave it pointing at a different program, so it <b>shuts</b> rather than re-measuring — on{' '}
            <code>scroll</code> and on <code>resize</code>, because a resize moves the row under it just as
            surely.
          </>
        }
      />

      <Blk
        title="The trigger says which row"
        lede={
          <>
            <code>label</code> is spelled into the accessible name: <i>Actions for Upper / Lower · 4 day</i>.
            Twenty-two buttons called <i>Actions</i> are twenty-two identical controls in a screen
            reader&rsquo;s list — <code>CheckboxCell</code>&rsquo;s rule, and the same one.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <RowMenu label="Fat Loss · 3 day full body" items={[{ label: 'Duplicate', href: '#c-rowmenu' }]} />
            ),
            caption:
              'Named. A reader walking the list hears which program each trigger belongs to, without leaving the row.',
          }}
          no={{
            figure: <RowMenu label="this row" items={[{ label: 'Duplicate', href: '#c-rowmenu' }]} />,
            caption:
              '“Actions for this row” — a name that is the same on every row is a name that identifies nothing.',
          }}
        />
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Panel', value: 'position:fixed', note: 'Escapes the row scroller — see above' },
            { property: 'Width', value: '208px', note: 'The `width` prop raises it; `.menu--row` caps at 218' },
            { property: 'Item', value: '32px', token: '--tx-ink-2', note: <code>.menu__i</code> },
            { property: 'Rule', value: '1px + 8', note: <code>.menu__sep</code> },
            { property: 'Flip', value: 'measured', note: 'Below by default; above when the room is there and below is not' },
            { property: 'Keys', value: '↑ ↓ Home End Esc', note: 'Roving focus, skipping disabled items' },
            { property: 'Closes on', value: 'Esc · outside · scroll · resize', note: 'Focus returns to the trigger only on Escape' },
            { property: 'Danger', value: 'last item', token: '--tx-danger', note: <code>.menu__i--danger</code> },
          ]}
        />
      </Blk>
    </Cmp>
  );
}
