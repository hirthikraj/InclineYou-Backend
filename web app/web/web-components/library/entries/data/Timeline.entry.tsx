import { Timeline } from '../../../ui/Timeline';
import { Tag } from '../../../ui/Tag';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/**
 * `c-timeline`. Server component, like every entry — see `entries/index.tsx`.
 * Nothing here takes a handler, which is what makes that safe: `Timeline.Item`
 * navigates with an `href` and has no interactive prop to pass.
 *
 * Two of the blocks below are the deleted page's, kept in its own words: the
 * `<ol>` argument and the `<time datetime>` one were right before this
 * component was purged and are right now. What replaced the rest is the part
 * that changed — the `items` array became parts, and the row became the link.
 */
export function TimelineEntry() {
  const entry = byId('c-timeline')!;

  return (
    <Cmp
      entry={entry}
      status="beta"
      meta={[
        { k: 'Component', v: <code>ui/Timeline.tsx</code> },
        { k: 'Class', v: <code>.tl</code> },
        { k: 'Parts', v: <code>Timeline.Item</code> },
        { k: 'Element', v: <code>&lt;ol&gt;</code> },
        { k: 'Used in', v: 'the client file’s Plan tab, the workout console' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            A history where the rows are ordered but not evenly spaced. One dot per entry against
            a spine, three lines beside it, and at most one row carrying the accent — the entry
            the list is <em>about</em>.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Cell label="THE CLIENT FILE'S PLAN HISTORY · THE LIVE BLOCK IS FIRST" stretch>
            <div style={{ width: 360 }}>
              <Timeline label="Priya Pillai’s plans, newest first">
                <Timeline.Item
                  live
                  href="#c-timeline"
                  mark={3}
                  title="Fat Loss · 3 day full body"
                  aside={
                    <Tag tone="acc" style={{ marginLeft: 6 }}>
                      Live
                    </Tag>
                  }
                  meta="26 Jul – 6 Sep · week 6 of 6 · Fat loss"
                />
                <Timeline.Item
                  href="#c-timeline"
                  mark={2}
                  title="Beginner Foundations · 2 day"
                  meta="14 Jun – 26 Jul · 6 weeks · General fitness"
                />
                <Timeline.Item
                  dim
                  mark="—"
                  title="No plan"
                  meta="19 Aug 2025 – 17 May 2026 · sessions logged as you went"
                />
              </Timeline>
            </div>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="An ordered list, because the order is the meaning"
        lede={
          <>
            A stack of divs tells a screen reader nothing about sequence or length. An{' '}
            <code>&lt;ol&gt;</code> says &ldquo;list, 3 items&rdquo; and numbers them &mdash; the
            difference between a history a trainer can scan and one they have to reconstruct.{' '}
            <code>label</code> names the list, for the same reason <code>c-meter</code> takes one:
            a spine and four dots have no accessible name of their own.
          </>
        }
      />

      <Blk
        title="The row is the door, not the title"
        lede={
          <>
            <code>href</code> puts the anchor over all three lines. It is the rule{' '}
            <code>app.css</code> had already written down and not implemented: the note over the
            deleted <code>.tl__l</code> said <em>“the link is the row”</em> while what shipped
            wrapped an anchor around the name — a target about 180&times;18 inside a row 660 wide,
            with the date under it and the dot beside it both dead.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <div style={{ width: 300 }}>
                <Timeline label="One entry, linked">
                  <Timeline.Item
                    href="#c-timeline"
                    mark={2}
                    title="Beginner Foundations · 2 day"
                    meta="14 Jun – 26 Jul · 6 weeks"
                  />
                </Timeline>
              </div>
            ),
            caption: (
              <>
                One anchor over the three lines, inside the <code>&lt;li&gt;</code> rather than on
                it. The hover mark goes on the <b>title</b>, which is the part of the row that
                names the destination.
              </>
            ),
          }}
          no={{
            figure: (
              <div style={{ width: 300 }}>
                <Timeline label="One entry, with an accent link in the title">
                  <Timeline.Item
                    mark={2}
                    title={
                      <span style={{ color: 'var(--tx-accent-text)' }}>
                        Beginner Foundations · 2 day
                      </span>
                    }
                    meta="14 Jun – 26 Jul · 6 weeks"
                  />
                </Timeline>
              </div>
            ),
            caption: (
              <>
                An accent link inside the title. §01 would paint it that way by default, and a
                list of thirteen lime plan names is thirteen calls to action where there is one
                list. The row keeps <code>color:inherit</code>.
              </>
            ),
          }}
        />
      </Blk>

      <Blk
        title="A title that is a reading"
        lede={
          <>
            <code>mono</code> sets the title in the figure face. The workout console draws a
            session’s sets in this slot — <code>60 kg × 8 · 62.5 kg × 6</code> — and figures stop
            being a heading when they get a heading’s weight. It existed as an inline{' '}
            <code>style</code> at two call-sites in one file before it was a modifier, which is
            the shape a catalogue entry is supposed to catch.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Cell label="THE CONSOLE'S RECORD LIST · TODAY TAKES THE ACCENT DOT" stretch>
            <div style={{ width: 300 }}>
              <Timeline label="Barbell Bench Press — the last 3 sessions">
                <Timeline.Item
                  live
                  mono
                  mark="TODAY · 06:52"
                  at="2026-09-19T06:52:00+05:30"
                  title="62.5 kg × 6 · 62.5 kg × 5"
                  meta="1,125 kg · record"
                />
                <Timeline.Item
                  mono
                  mark="12 SEP"
                  at="2026-09-12"
                  title="60 kg × 8 · 60 kg × 6"
                  meta="1,080 kg · matched"
                />
                <Timeline.Item
                  mono
                  mark="5 SEP"
                  at="2026-09-05"
                  title="57.5 kg × 8"
                  meta="920 kg · first time"
                />
              </Timeline>
            </div>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="The date is drawn one way and stored another"
        lede={
          <>
            &ldquo;TODAY &middot; 06:52&rdquo; is the right thing to show and is not a date a
            machine can read &mdash; and it stops being true at midnight. <code>at</code> carries
            the ISO instant in <code>&lt;time datetime&gt;</code> underneath, so the display
            string can stay human. Omit it where the mark is not a date: the plan history&rsquo;s
            marks are block numbers, and <code>&lt;time&gt;3&lt;/time&gt;</code> is a claim about
            an instant.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '14px 16px' }}>
          <code style={{ fontSize: 12.5, lineHeight: 1.9 }}>
            &lt;time datetime=&quot;2026-09-19T06:52:00+05:30&quot;&gt;TODAY · 06:52&lt;/time&gt;
          </code>
        </Bench>
      </Blk>

      <Blk title="Specification" tag="measured">
        <SpecTable
          rows={[
            { property: 'Spine', value: '1px, inset 7px from the left', token: '--tx-line',
              note: 'Runs from the first dot to the last and no further — a rule past the final entry claims there is more.' },
            { property: 'Dot', value: '9px, ringed 3px in the canvas', token: '--tx-surface-3',
              note: <><code>live</code> fills it <code>--tx-accent</code>. At most one row per list.</> },
            { property: 'Mark', value: '10.5px mono, +.06em', token: '--tx-ink-3',
              note: 'An ordinal, a date, a short label. Omitted entirely rather than drawn empty.' },
            { property: 'Title', value: '13px / 600', token: '--tx-ink',
              note: <><code>mono</code> → 12.5px / 500 in the figure face; <code>dim</code> → 500 in <code>--tx-ink-3</code>.</> },
            { property: 'Meta', value: '12.5px / 1.5', token: '--tx-ink-3', note: 'The third line. Dates, figures, an outcome.' },
            { property: 'Row gap', value: '18px', note: 'Bottom padding on the <li>, dropped on the last row, and outside the anchor.' },
            { property: 'Focus', value: '2px outline, 3px offset', token: '--tx-focus',
              note: 'On .tl__a, and it moves nothing — measured at 0px on both axes.' },
          ]}
        />
      </Blk>

      <Blk
        title="What it is not"
        lede={
          <>
            Not <code>c-listrow</code>, which is a list of things to choose between and gives
            every row the same weight. A timeline is a list of things that <em>happened</em>, in
            an order that is part of the content — which is what the spine draws and a list of
            rows cannot. Not <code>c-agenda</code> either: that one is the rest of a single day,
            ruled by time.
          </>
        }
      />
    </Cmp>
  );
}
