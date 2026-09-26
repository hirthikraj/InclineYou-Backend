import { byId } from '../../../registry';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { SpecTable } from '../../chrome/Docs';
import { OptionRowSpecimen, OrderRowSpecimen } from './OrderRowSpecimen';

/**
 * Order row — a row in a list somebody arranged.
 *
 * Written 19 Sep 2026 for the assessment editor's questions and its
 * multiple-choice options, which are the same shape twice. The specimens are
 * live and the drag works.
 */
export function OrderRowEntry() {
  const entry = byId('c-orderrow')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/OrderRow.tsx</code> },
        { k: 'Class', v: <code>.orow</code> },
        { k: 'Element', v: <><code>&lt;div&gt;</code>, four grid tracks</> },
        { k: 'Used in', v: '/clients/assessments' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            Drag by the grip, or use the row menu&rsquo;s <i>Move up</i> and <i>Move down</i>. Both
            are here because a drag handle is a pointer gesture and SC 2.5.7 wants the same
            operation without one — <code>DayCard</code>&rsquo;s answer, and the reason the week
            sheet&rsquo;s row drag was deleted rather than kept beside it.
          </>
        }
      >
        <Bench style={{ alignItems: 'stretch' }}>
          <Cell label="three questions, arranged" stretch>
            <OrderRowSpecimen />
          </Cell>
        </Bench>
        <Bench style={{ alignItems: 'stretch' }}>
          <Cell label="the lettered form, with a field in it" stretch>
            <OptionRowSpecimen />
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="The position is a label, never a control"
        lede={
          <>
            <code>1</code> and <code>A</code> are where the row <i>is</i>, and they move when it
            moves — so they carry <code>aria-hidden</code> and nothing announces them as an option
            to press. Mono and tabular, because a column of proportional digits is a ragged left
            edge on the one column whose whole job is to be read down. <code>.wke__o</code> on the
            week builder made the same call; this is that call written where more than one list can
            reach it.
          </>
        }
      />

      <Blk
        title="Draggable is armed on the grip and dropped on release"
        lede={
          <>
            <code>draggable</code> is true only while the grip is held —{' '}
            <code>DayColumn</code>&rsquo;s rule, recorded twice: a row that stays draggable after
            the pointer has gone is the next accidental drag, and it takes text selection with it.
            The call-site owns the flag because it owns the list, and because two rows may not both
            believe they are the one being carried.
          </>
        }
      />

      <Blk
        title="The grip's track is reserved, not removed"
        lede={
          <>
            <code>grip={'{false}'}</code> keeps the column and hides the handle —{' '}
            <code>.wkl__w--nog</code>&rsquo;s rule. A list with no grips keeps its ordinals in one
            place down the page, so a mixed list does not step sideways at the first row that
            cannot be moved.
          </>
        }
      />

      <SpecTable
        rows={[
          { property: 'Tracks', value: '20 · 26 · 1fr · auto', token: undefined, note: 'Grip, position, row, verbs' },
          { property: 'Height', value: '44px min', token: '--w-row', note: '56 under `pointer:coarse`' },
          { property: 'Position', value: '11px mono, tabular', token: '--tx-mono', note: 'In a 26×22 --tx-surface-3 pill' },
          { property: 'Content', value: '13.5px', token: '--tx-body', note: '`field` drops the vertical padding for a control that owns its height' },
          { property: 'Grip', value: '.55 → 1 on hover', token: '--tx-ink-3', note: 'Always 1 under `pointer:coarse`' },
          { property: 'Carried', value: 'opacity .45', token: undefined, note: '`lifted`' },
          { property: 'Target', value: '2px accent ring', token: '--tx-accent', note: '`onto`. A ring, not a fill — the row stays legible under the pointer' },
        ]}
      />
    </Cmp>
  );
}
