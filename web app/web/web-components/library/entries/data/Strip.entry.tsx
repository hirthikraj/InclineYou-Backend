import { Blk, Bench, Cell } from '../../chrome/Blk';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { Cmp } from '../../chrome/Cmp';
import { Strip } from '../../../ui/Strip';
import { byId } from '../../../registry';

/**
 * THE BAND OF FIGURES THAT WAS LIVE FOR A MONTH WITH NO ENTRY.
 *
 * Written 21 Sep 2026 out of the workout-console pass, which found `.strip`
 * hand-written at five call-sites.
 */
export function StripEntry() {
  const entry = byId('c-strip')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Strip.tsx</code> },
        { k: 'Class', v: <code>.strip</code> },
        { k: 'Parts', v: <code>Cell · Choice</code> },
        { k: 'Tones', v: '3' },
      ]}
    >
      <Blk title="Specimen">
        <Bench style={{ display: 'block' }}>
          <Cell label="the workout console, mid-session" stretch>
            <Strip>
              <Strip.Cell value={8} of={20} label="sets logged" />
              <Strip.Cell value="2,065" unit="kg" label="moved" />
              <Strip.Cell value="1h 54m" label="on the floor" />
              <Strip.Cell value={6} of={12} label="pack, unchanged" />
            </Strip>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="Why this is not a row of stat tiles"
        lede={
          <>
            Checked against the three neighbours before it was written, which is the order{' '}
            <code>registry.ts</code> asks for. <code>c-stat</code> is one figure on its own ground,
            and a row of them is a dashboard — four independent questions, four boxes.{' '}
            <code>c-figures</code> is three numbers on the canvas with no container at all,
            deliberately, and is what a page <b>ends</b> with. <code>c-kv</code> is a label and a
            value stacked, which is a list.
            <br />
            <br />
            This is the band directly under a page header or above a table, saying four facts about{' '}
            <b>one object</b> — one session, one client, one view of a roster. The border is what
            makes the four read as one statement rather than as four claims that happen to be
            adjacent.
          </>
        }
      />

      <Blk
        title="A denominator is a second figure; a unit is a word"
        lede={
          <>
            Both were an inline <code>&lt;span className=&quot;ink3&quot;&gt;</code> at the five
            call-sites, and two of them added <code>style=&#123;&#123; fontSize: 14 &#125;&#125;</code>{' '}
            while a third did not — so <code>6/8</code> in the client file&rsquo;s header and{' '}
            <code>8/20</code> on the console rendered the second number at two sizes in one
            product. An inline style is not something a stylesheet can catch, which is why these
            are two classes and this component is the only thing that writes them.
            <br />
            <br />
            Two classes and not one, because they are two facts. <code>of</code> keeps the brand
            face a step down, so the pair reads as a ratio. <code>unit</code> takes the UI face —
            set in Archivo beside the number, <code>min</code> sat on the same optical line and
            read as part of the figure.
          </>
        }
      >
        <Bench style={{ display: 'block' }}>
          <Cell label="of · unit · neither" stretch>
            <Strip>
              <Strip.Cell value={8} of={20} label="sets logged" />
              <Strip.Cell value={349} unit="min" label="on the floor" />
              <Strip.Cell value="2,065" label="kg moved" />
            </Strip>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="A tone is for a figure that IS the state"
        lede={
          <>
            The same three words <code>Stat</code>, <code>Figures</code> and{' '}
            <code>SubscriptionBar</code> use. A cell takes a tone when the <b>number</b> is the
            state — a balance that has run out, sessions owed past a date — and never because the
            strip is about money.
          </>
        }
      >
        <Bench style={{ display: 'block' }}>
          <Cell label="neutral · warn · ok" stretch>
            <Strip>
              <Strip.Cell value={12} of={24} label="sessions left" />
              <Strip.Cell value={2} of={24} label="sessions left" tone="warn" />
              <Strip.Cell value={4} label="records today" tone="ok" />
            </Strip>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="Choice — the figure that is also the filter"
        lede={
          <>
            <code>.strip--pick</code> on the strip and a <code>&lt;button&gt;</code> per cell. The
            roster&rsquo;s focus tiles are the call-site: a count that narrows the list to the rows
            it counts. <code>aria-pressed</code> and not <code>aria-current</code> — these are
            toggles over one list, not places — and a zero is <b>disabled rather than hidden</b>,
            because a count of none is a true answer and a tile that comes and goes moves the three
            beside it.
          </>
        }
      >
        <Bench style={{ display: 'block' }}>
          <Cell label="one pressed, one empty" stretch>
            <Strip className="strip--pick">
              <Strip.Choice value={24} label="everyone" pressed />
              <Strip.Choice value={3} label="at risk" tone="warn" />
              <Strip.Choice value={5} label="owing" />
              <Strip.Choice value={0} label="lapsed" disabled />
            </Strip>
          </Cell>
        </Bench>
      </Blk>

      <DoDont
        yes={{
          figure: (
            <Strip>
              <Strip.Cell value={8} of={20} label="sets logged" />
              <Strip.Cell value="2,065" unit="kg" label="moved" />
              <Strip.Cell value="1h 54m" label="on the floor" />
            </Strip>
          ),
          caption:
            'Four facts about ONE session. The border says they belong together, and every figure is measured off the same object.',
        }}
        no={{
          figure: (
            <Strip>
              <Strip.Cell value={7} of={9} label="sessions today" />
              <Strip.Cell value="₹1.5L" label="collected" />
              <Strip.Cell value={9} label="clients at risk" />
            </Strip>
          ),
          caption:
            'Three unrelated dashboard questions. The border now claims a relationship there is none of — that is c-stat, or c-figures at the foot of the page.',
        }}
      />

      <SpecTable
        rows={[
          { property: 'Figure', value: '19px Archivo 800, tabular', token: '--tx-brand', note: 'One line; it never wraps' },
          { property: 'Label', value: '10px mono, caps, .11em', token: '--tx-ink-3', note: 'Tracked out — it is a caption, not a form label' },
          { property: 'Denominator', value: '14px, the figure’s own face', token: '--tx-ink-3', note: '.strip__of — a second number' },
          { property: 'Unit', value: '13px / 600 UI face', token: '--tx-ink-3', note: '.strip__u — a word about the number' },
          { property: 'Cell', value: 'flex:1, 9px 14px', token: '—', note: 'Equal tracks; a hairline between, none before the first' },
          { property: 'Separator', value: '1px border-left', token: '--tx-line', note: 'Inside one outer border and radius' },
          { property: 'tone="warn"', value: 'figure only', token: '--tx-warn', note: 'A balance running out' },
          { property: 'tone="ok"', value: 'figure only', token: '--tx-ok', note: 'A result worth reporting as good' },
        ]}
      />
    </Cmp>
  );
}
