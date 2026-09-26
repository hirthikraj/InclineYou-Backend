import { byId } from '../../../registry';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { SpecTable } from '../../chrome/Docs';
import { FoldOffSpecimen, FoldSpecimen } from './FoldSpecimen';

/**
 * Fold — a block that folds, and can be switched off.
 *
 * Written 19 Sep 2026 for the assessment editor, where three of them stack.
 * The specimens below are live: this page renders the same import the editor
 * does, and both states are on screen at once because the argument for the
 * component is the difference between them.
 */
export function FoldEntry() {
  const entry = byId('c-fold')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Fold.tsx</code> },
        { k: 'Class', v: <code>.fold</code> },
        { k: 'Element', v: <><code>&lt;section&gt;</code> with a button head</> },
        { k: 'Used in', v: '/clients/assessments' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            Press the head to fold it; throw the switch to turn it off. The two are different
            states and the block draws both — <b>off dims the head and hides the body</b>, folded
            hides the body and leaves the head at full weight.
          </>
        }
      >
        <Bench style={{ alignItems: 'stretch' }}>
          <Cell label="on, open" stretch>
            <FoldSpecimen />
          </Cell>
        </Bench>
        <Bench style={{ alignItems: 'stretch' }}>
          <Cell label="off, folded" stretch>
            <FoldOffSpecimen />
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="Why it is not a <details>"
        lede={
          <>
            <code>.disc</code> already folds and is a native <code>&lt;details&gt;</code> with a
            12.5px triangle summary — a quiet aside inside a card, for <i>All 9 readings</i> under
            a chart. This is a container: it has a border, it is the thing being read rather than
            an aside from it, and it carries a <b>second control in its head</b>. A{' '}
            <code>&lt;summary&gt;</code> holding a switch is interactive content inside interactive
            content, and the switch would fold the block every time it was thrown.
          </>
        }
      />

      <Blk
        title="Switched off keeps its count"
        lede={
          <>
            A block switched off still remembers what is in it — that is a property of the data
            behind it (<code>{'{on, keys}'}</code> on the template, not an empty list), and the
            head goes on saying the number. So a trainer who switches <i>Measurements</i> back on
            can see their fifteen tapes are still there <b>before</b> they open it. The dim is on
            the name and the icon plate, never <code>opacity</code> on the box: that would take the
            border and the switch down with it and make the one control that can turn the block
            back on the hardest thing on the card to see.
          </>
        }
      />

      <Blk
        title="The head is props; the trailing slot is not"
        lede={
          <>
            <code>DockPanel</code>&rsquo;s six call-sites have six unlike bodies, so its parts are
            components. Every head here is the same five things — an icon, a name, a count, a
            sentence and a chevron — so the head is props and <code>control</code> is the one{' '}
            <code>ReactNode</code>. It is not an <code>on</code>/<code>onOn</code> pair: the moment
            this component renders the <code>Switch</code> it owns the label, the disabled state
            and the write, and the first call-site wanting a <code>Button</code> there has to grow
            a prop for it.
          </>
        }
      />

      <SpecTable
        rows={[
          { property: 'Head', value: '56px min-height', token: undefined, note: '60 under `pointer:coarse`' },
          { property: 'Icon plate', value: '28px, r1', token: '--tx-surface-3', note: 'So a 15px glyph never sets the head height' },
          { property: 'Name', value: '15px / 650', token: '--tx-name', note: 'Ellipsises; the switch is never pushed off the card' },
          { property: 'Sub', value: '12.25px', token: '--tx-meta', note: '--tx-ink-3' },
          { property: 'Count', value: '`.rail__n`', token: undefined, note: 'Omitted at zero — `PageTabs`’ contract' },
          { property: 'Body', value: '12px, ruled above', token: '--tx-surface-2', note: '`flush` for a body whose first child has its own border' },
          { property: 'Chevron', value: '16px, rotates 180°', token: '--tx-ink-3', note: 'Off `aria-expanded`, not a class' },
          { property: 'Unmounted', value: 'when folded', token: undefined, note: 'Three open bodies is three sets of fields a tab press walks through' },
        ]}
      />
    </Cmp>
  );
}
