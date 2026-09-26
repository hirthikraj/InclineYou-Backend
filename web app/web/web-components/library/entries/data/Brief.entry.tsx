import { Brief } from '../../../ui/Brief';
import { Tag } from '../../../ui/Tag';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/**
 * The pre-flight's own list, which is the component's only call-site today.
 *
 * It marks the REQUIRED group, and that is the specimen's most useful lesson:
 * the flow has seven optional steps and one that is not, so marking the seven
 * would put an identical chip down four of these five rows. Mark the exception,
 * whichever side it is on.
 */
const ASKED = [
  {
    count: '1',
    title: 'Your name and gender',
    body: 'Clients see your name on every invite you send, and filter on the other',
    right: <Tag>Required</Tag>,
  },
  {
    count: '2–4',
    title: 'Experience, specialities and certifications',
    body: '“Not certified yet” is a real answer',
  },
  { count: '5', title: 'Languages you coach in', body: 'Clients filter by this. Nobody else asks it' },
  {
    count: '6–7',
    title: 'When you work and what you sell',
    body: 'The week the diary reads, and the prices the money book groups by',
  },
  { count: '8', title: 'How you get paid', body: 'Your UPI ID. You can do this later' },
];

export function BriefEntry() {
  const entry = byId('c-brief')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Brief.tsx</code> },
        { k: 'Class', v: <code>.brf</code> },
        { k: 'Element', v: <code>&lt;ol&gt;</code> },
        { k: 'Used in', v: <code>/setup</code> },
      ]}
    >
      <Blk title="Specimen">
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Brief items={ASKED} label="What we’ll ask" style={{ maxWidth: 560 }} />
        </Bench>
      </Blk>

      <Blk
        title="It exists because surprise is the complaint, not length"
        lede={
          <>
            The most-cited onboarding complaint across every platform in the teardown was not that the
            forms were long &mdash; it was <i>&ldquo;I wasn&rsquo;t made aware of all the things they
            would require from me&rdquo;</i>. A pre-flight costs one click and prevents that review, so
            any flow asking for more than a couple of things owes the person a contents page before it
            starts. The alternative is every such flow solving it again, differently.
          </>
        }
      />

      <Blk
        title="The count is a range, and that is what keeps it from being a second progress bar"
        lede={
          <>
            Five entries cover eight steps &mdash; <code>1</code>, <code>2&ndash;4</code>,{' '}
            <code>5</code>, <code>6&ndash;7</code>, <code>8</code>. The body groups the questions the way
            a trainer would recognise them and the rail keeps the eight; the range is the join. &sect;10
            forbids two progress systems in one flow, and this is not one: a contents entry has no
            state, so nothing here is ever lit, ticked or current. A flow whose contents <i>are</i>{' '}
            navigable has a step rail already &mdash; draw <code>Wizard</code> instead.
          </>
        }
      />

      <Blk
        title="Not a timeline, and not a list row"
        lede={
          <>
            <code>Timeline</code> is the near miss and is wrong both ways: its ordering prop is a{' '}
            <code>date</code> with an ISO instant behind it, and a step range is not an instant &mdash;
            and its dot carries a halo punched out of <code>--tx-canvas</code>, which draws as a dark
            outline on the <code>--tx-surface</code> panel this list sits on. <code>ListRow</code>{' '}
            ellipsises its title and subtitle on one line, because it is the finding pane of a split;
            every subtitle here is a sentence that wraps.
          </>
        }
      />

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Tile', value: '1px border, r3', token: '--tx-surface-2', note: 'One surface up, so it still reads raised on a --tx-surface panel' },
            { property: 'Count', value: '10.5px, 34×22 pill', token: '--tx-mono', note: 'A pill, not the rail’s circle — “2–4” does not fit in 24px' },
            { property: 'Title', value: '13.5px / 600', token: '--tx-ink' },
            { property: 'Body', value: '12.5px / 1.5', token: '--tx-ink-3', note: 'Wraps. One line about what the question is for' },
            { property: 'Right slot', value: <code>.brf__r</code>, note: 'Usually a Tag. Aligned to the title’s line, not the row’s middle' },
            { property: 'Gap', value: '8px between tiles' },
            { property: 'Element', value: <code>&lt;ol&gt;</code>, note: 'With an aria-label naming what the list is of' },
            { property: 'Interaction', value: 'none', note: 'No href, no onClick. Every row is a statement about a question that is coming' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: <Brief items={ASKED.slice(0, 2)} label="What we’ll ask" style={{ maxWidth: 360 }} />,
            caption:
              'Each entry says what is wanted and why it is wanted, and the one step that cannot be skipped is marked here, before it is reached — which is the whole reason the screen exists.',
          }}
          no={{
            figure: (
              <Brief
                items={[
                  { count: '1', title: 'Profile details' },
                  { count: '2', title: 'Business details' },
                ]}
                label="What we’ll ask"
                style={{ maxWidth: 360 }}
              />
            ),
            caption:
              'Two headings out of a schema. This names the tables the answers land in rather than the questions a trainer will be asked, and a contents page nobody can picture prevents no surprise at all.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
