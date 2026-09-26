import { Blk, Bench, Cell } from '../../chrome/Blk';
import { SpecTable } from '../../chrome/Docs';
import { Figures, Figure } from '../../../ui/Figures';

/**
 * THREE NUMBERS, ON ONE LINE, WITH NO BOXES.
 *
 * Written out of the 15 Sep 2026 `/today` pass, replacing `.srail`.
 */
export function FiguresEntry() {
  return (
    <>
      <Blk
        title="What it replaced"
        lede={
          <>
            <code>.srail</code> drew them as three equal cards in a row, which is the single most
            generated dashboard layout there is and more container than three figures ask for. The
            block&rsquo;s own argument, in <code>Today.tsx</code>, is &ldquo;three numbers, no
            more&rdquo;, and three numbers do not need three boxes, a border each and a shadow.
          </>
        }
      >
        <Bench style={{ alignItems: 'stretch' }}>
          <Cell label="the block, as the screen draws it" stretch>
            <Figures>
              <Figure label="Sessions today" value={7} of={9} href="/schedule" />
              <Figure label="Collected this month" value="₹1.5L" href="/business" />
              <Figure label="Clients at risk" value={9} href="/clients" />
            </Figures>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="Zero is a number"
        lede={
          <>
            The screen it came from rendered no-clients-at-risk as an em dash. Nobody at risk is the
            good news on that row, and a dash reads as a figure that failed to load rather than as
            the best possible answer.
          </>
        }
      >
        <Bench>
          <Cell label="none at risk">
            <Figures>
              <Figure label="Clients at risk" value={0} />
            </Figures>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="A tone is for a figure that IS the state"
        lede={
          <>
            Added 19 Sep 2026 for the client file&rsquo;s pack card, in the same four words{' '}
            <code>Stat</code> and <code>SubscriptionBar</code> already use — a fifth vocabulary for
            the same three colours is how one product ends up with two reds. A figure takes a tone
            when the NUMBER is the state: a balance that has run out, money that has gone past its
            date. Never because the ROW is about money.
          </>
        }
      >
        <Bench style={{ alignItems: 'stretch' }}>
          <Cell label="the four tones" stretch>
            <Figures>
              <Figure label="Sessions left" value={12} of={24} />
              <Figure label="Sessions left" value={2} of={24} tone="warn" />
              <Figure label="Sessions left" value={0} of={24} tone="danger" />
            </Figures>
          </Cell>
        </Bench>
        <Bench style={{ alignItems: 'stretch' }}>
          <Cell label="the denominator keeps its own colour in every tone" stretch>
            <Figures>
              <Figure label="Collected" value="₹0" tone="danger" />
              <Figure label="This month" value="₹1.5L" tone="acc" />
              <Figure label="Sessions left" value={0} of={24} tone="danger" />
            </Figures>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="Two up, and the rung is the caller's"
        lede={
          <>
            <code>.figs</code> is a pinned three-column grid with no breakpoint, the same shape{' '}
            <code>.stats--3</code> carries. A caller with two figures scopes its own rung —{' '}
            <code>.cfov__pack .figs</code> on the client file — and never edits the component.
            Two figures dropped into the three-track grid draw at two thirds width with a third of
            the card empty beside them.
          </>
        }
      />

      <Blk
        title="Where it belongs on a page"
        lede={
          <>
            At the FOOT, after the work. These are what somebody checks once the list is clear, not
            what greets them. The screen this came from opens with a to-do list and not a report,
            and putting the figures at the top would reverse that claim without changing a word.
          </>
        }
      />

      <SpecTable
        rows={[
          { property: 'Figure', value: '30px Archivo 800, tabular', token: '--tx-fig-sm', note: '26px under 900px' },
          { property: 'Label', value: '12.25px / 500', token: '--tx-meta', note: 'Sentence case, not a tracked-out caps label' },
          { property: 'Denominator', value: '15px Inter 650', token: '--tx-name', note: 'Context, not a second number' },
          { property: 'Separator', value: '1px border-left', token: '--tx-line', note: 'Under 900px: two up, the third full width' },
          { property: 'tone="acc"', value: 'value only', token: '--tx-accent-text', note: 'Never the label, never the denominator' },
          { property: 'tone="warn"', value: 'value only', token: '--tx-warn', note: 'A balance running out' },
          { property: 'tone="danger"', value: 'value only', token: '--tx-danger', note: 'A balance at zero, money past its date' },
        ]}
      />
    </>
  );
}
