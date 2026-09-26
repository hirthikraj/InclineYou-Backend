import { Stat, Stats } from '../../../ui/Stat';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

export function StatEntry() {
  const entry = byId('c-stat')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Stat.tsx</code> },
        { k: 'Class', v: <code>.stat</code> },
        { k: 'Tones', v: '4' },
        { k: 'Row', v: '2, 3 or 4 up' },
      ]}
    >
      <Blk title="Specimen">
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Stats up={4}>
            <Stat
              label="Billed this month"
              value="₹1,06,500"
              detail="21 sessions"
              delta={{ text: '8% on July', direction: 'up', good: true }}
            />
            <Stat label="The gym’s share" value="₹49,000" detail="46% of floor sessions" tone="warn" />
            <Stat label="Yours" value="₹57,500" detail="after the split" tone="acc" />
            <Stat label="Pending" value="₹31,500" detail="4 clients" tone="danger" />
          </Stats>
        </Bench>
      </Blk>

      <Blk
        title="The delta is not a colour"
        lede={
          <>
            &ldquo;+8% on July&rdquo; in green and &ldquo;&minus;8%&rdquo; in red is the obvious rendering and
            it is wrong twice over. Colour alone carries the direction, so it is gone for anyone who cannot
            separate the two hues &mdash; and <b>up is not always good</b>: a rise in the gym&rsquo;s share is a
            fall in the trainer&rsquo;s.
          </>
        }
      >
        <Bench style={{ gap: 26 }}>
          <Cell label="UP, AND WELCOME">
            <Stat label="Billed" value="₹1,06,500" delta={{ text: '8% on July', direction: 'up', good: true }} />
          </Cell>
          <Cell label="UP, AND NOT">
            <Stat
              label="The gym’s share"
              value="₹49,000"
              tone="warn"
              delta={{ text: '4% on July', direction: 'up', good: false }}
            />
          </Cell>
          <Cell label="DOWN, AND WELCOME">
            <Stat label="Pending" value="₹31,500" tone="acc" delta={{ text: '12% on July', direction: 'down', good: true }} />
          </Cell>
        </Bench>
        <p className="blk__p">
          <code>direction</code> and <code>good</code> are separate arguments because they are separate facts.
          The arrow says which way the number moved, the tone says whether that is welcome, and the
          visually-hidden text says both in words &mdash; so a reader that gets neither the arrow nor the
          colour still gets the meaning.
        </p>
      </Blk>

      <Blk title="Rows of two, three and four">
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <div className="col gap4" style={{ width: '100%' }}>
            <Stats up={2}>
              <Stat label="Billed this month" value="₹1,06,500" detail="21 sessions" />
              <Stat label="Yours" value="₹57,500" detail="after the split" tone="acc" />
            </Stats>
            <Stats up={3}>
              <Stat label="Sessions" value="21" detail="of 24 booked" />
              <Stat label="Adherence" value="88%" detail="last 30 days" tone="acc" />
              <Stat label="Missed" value="3" detail="2 rescheduled" tone="warn" />
            </Stats>
          </div>
        </Bench>
        <p className="blk__p">
          Four is the ceiling. Past that none of them is large, and a row of small numbers is a table that has
          lost its headers.
        </p>
      </Blk>

      <Blk
        title="A tile can be a door"
        lede={
          <>
            <code>href</code> makes the whole tile a link, which is what a figure on a HOME screen
            usually is — a number you check and then go and look at. The trainer&rsquo;s Today has
            drawn three of these since it shipped, hand-written as{' '}
            <code>&lt;Link className=&quot;stat&quot;&gt;</code> inside <code>.srail</code>, and the
            client portal&rsquo;s Home wants the same thing pointing at Progress and Me. Two screens
            writing an anchor with this component&rsquo;s class on it is the drift the catalogue
            exists to stop, so it is a prop.
            <br />
            <br />
            <code>.stat--link</code> carries the one thing a call-site must not be left to
            remember: §01&rsquo;s base rule paints every anchor <code>--tx-accent-text</code>, so an
            unmodified linked tile renders its figure <b>lime</b> — which on a dashboard reads as a
            status rather than as a number. The modifier sets the colour on the ROOT, so a{' '}
            <code>warn</code> or <code>danger</code> tile keeps its tone when it becomes a link.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Stats up={3}>
            <Stat label="This week" value="2" detail="of 3 sessions" href="/me/plan" />
            <Stat label="Turned up" value="91%" detail="last 90 days" href="/me/progress" />
            <Stat label="Sessions left" value="8" detail="29 days to run" tone="warn" href="/me/account" />
          </Stats>
        </Bench>
        <p className="blk__p">
          Hover one. The affordance is a <b>border</b>, not a fill: <code>.stat--on</code> already
          spends the accent ground on a tile that is <em>selected</em>, and a hover that looked like
          a selection would make three tiles appear chosen in turn as the pointer crossed them.
        </p>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Value', value: '26px / 800', token: '--tx-brand', note: 'Tabular figures' },
            { property: 'Label', value: '11.5px / 600', token: '--tx-ink-3', note: 'Above the figure, not below' },
            { property: 'Detail', value: '12px', note: 'Where the figure came from — the sessions behind the money' },
            { property: 'Tones', value: '4', note: 'neutral · acc · warn · danger' },
            { property: 'Row', value: '2 / 3 / 4 up', token: '.stats--n' },
            { property: 'Delta', value: 'arrow + tone + text', note: 'Never colour alone' },
            { property: 'href', value: '.stat--link', note: 'The whole tile becomes an anchor. Keeps its tone; resets the anchor lime.' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <div style={{ width: 220 }}>
                <Stat
                  label="Billed this month"
                  value="₹1,06,500"
                  detail="21 sessions"
                  delta={{ text: '8% on July', direction: 'up', good: true }}
                />
              </div>
            ),
            caption: 'The figure, and the count behind it. “₹1,06,500” alone cannot be checked; “21 sessions” makes it arithmetic a trainer can verify.',
          }}
          no={{
            figure: (
              <div style={{ width: 220 }}>
                <Stat label="Revenue" value="₹1,06,500" />
              </div>
            ),
            caption:
              'A figure with no source and no period. Billed or collected? This month or last? The number is precise and says nothing.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
