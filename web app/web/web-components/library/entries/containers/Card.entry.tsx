import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { KeyValueList } from '../../../ui/KeyValue';
import { Tag } from '../../../ui/Tag';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

const PAY = [
  { k: 'Default session fee', v: '₹800' },
  { k: 'Gym share · floor', v: '46%' },
  { k: 'Gym share · remote', v: '0%' },
];

export function CardEntry() {
  const entry = byId('c-card')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Card.tsx</code> },
        { k: 'Class', v: <code>.card</code> },
        { k: 'Radius', v: '12px' },
        { k: 'Tones', v: '3' },
      ]}
    >
      <Blk title="Specimen">
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <div className="grid2" style={{ gap: 16, width: '100%', alignItems: 'start' }}>
            <Card title="Getting paid" aside={<Tag>We never hold it</Tag>}>
              <KeyValueList rows={PAY} />
            </Card>
            <Card
              title="The week"
              actions={
                <Button size="sm" variant="ghost" href="/schedule">
                  Full schedule
                </Button>
              }
            >
              <p className="small" style={{ color: 'var(--tx-ink-2)', margin: 0 }}>
                14 sessions booked · 2 gaps on Thursday.
              </p>
            </Card>
          </div>
        </Bench>
      </Blk>

      <Blk
        title="The title is a real heading"
        lede={
          <>
            The reference draws <code>&lt;span class=&quot;card__t&quot;&gt;</code>. A screen half-built out of
            spans has <b>no outline at all</b> &mdash; and jumping between regions by heading is how a screen
            reader user navigates a dense page. There is nothing to jump to.
          </>
        }
      >
        <p className="blk__p">
          <code>level</code> is a prop rather than a constant because the right level depends on what is above
          the card. A component that always emits <code>&lt;h2&gt;</code> produces a page whose outline is h1,
          h2, h2, h2 regardless of nesting &mdash; correct directly under a page header, wrong inside a panel.
        </p>
      </Blk>

      <Blk title="Tones and a flush body">
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <div className="grid2" style={{ gap: 16, width: '100%', alignItems: 'start' }}>
            <Card title="Neutral" level={3}>
              <p className="small" style={{ margin: 0, color: 'var(--tx-ink-2)' }}>
                The default. Most cards.
              </p>
            </Card>
            <Card title="Accent · the one thing happening now" level={3} tone="acc">
              <p className="small" style={{ margin: 0, color: 'var(--tx-ink-2)' }}>
                One per screen, at most.
              </p>
            </Card>
            <Card title="Lead · the card the screen is about" level={3} tone="lead">
              <p className="small" style={{ margin: 0, color: 'var(--tx-ink-2)' }}>
                Heavier ground, same border.
              </p>
            </Card>
            <Card title="Flush body · for a table" level={3} flush>
              <KeyValueList rows={PAY.slice(0, 2)} />
            </Card>
          </div>
        </Bench>
        <p className="blk__p">
          A flush body drops the padding so a table or a list can reach the card&rsquo;s edges. Without it,
          every row sits inside a 16px margin the row dividers do not cross, and the card looks like it is
          holding the list at arm&rsquo;s length.
        </p>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Radius', value: '12px', token: '--tx-r3' },
            { property: 'Border', value: '1px', token: '--tx-line' },
            { property: 'Head', value: '~44px', note: 'Title, an optional tag, actions on the right' },
            { property: 'Body padding', value: '16px', note: 'Dropped by `flush`' },
            {
              property: 'Title',
              value: (
                <>
                  <code>&lt;h2&gt;</code>&ndash;<code>&lt;h4&gt;</code>
                </>
              ),
              note: 'Never a span',
            },
            { property: 'Tones', value: '3', note: 'acc · lead · raise' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <div style={{ width: 300 }}>
                <Card title="Getting paid" level={3} aside={<Tag>We never hold it</Tag>}>
                  <KeyValueList rows={PAY.slice(0, 2)} />
                </Card>
              </div>
            ),
            caption: 'One subject, named by a heading, with the tag qualifying the heading rather than floating in the body.',
          }}
          no={{
            figure: (
              <div style={{ width: 300 }}>
                <Card>
                  <KeyValueList rows={PAY.slice(0, 2)} />
                </Card>
              </div>
            ),
            caption:
              'A card with no heading. It is a box around some rows — nothing in the outline, nothing to jump to, and nothing saying what the two numbers have in common.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
