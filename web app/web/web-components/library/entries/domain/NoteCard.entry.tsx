import { Tack } from '../../../../components/shell/Icons';
import { Button } from '../../../ui/Button';
import { Markup } from '../../../ui/Markup';
import { NoteCard } from '../../../ui/NoteCard';
import { Switch } from '../../../ui/Switch';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/* The trash glyph the client file draws. Copied rather than imported: the
   product's lives in `components/clients/file/shared.tsx`, which is that
   screen's own module, and the library importing a screen's private icon is the
   dependency this catalogue exists to run the other way. */
const Trash = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5 7.5 20h9l1-13.5M10.5 10v6M13.5 10v6" />
  </svg>
);

/* The four controls, exactly as the client file composes them. No handlers:
   this route renders on the server, and an `onClick` crossing that boundary is
   a 500 rather than a dead button. */
function Acts({ pinned }: { pinned?: boolean }) {
  return (
    <>
      <Button
        variant="ghost" size="sm" iconOnly
        label={pinned ? 'Unpin from the strip' : 'Pin to the strip'}
        icon={<Tack size={14} filled={pinned} />}
        aria-pressed={pinned}
      />
      <Button variant="ghost" size="sm">Edit</Button>
      <Button variant="ghost" size="sm" iconOnly label="Delete this note" icon={<Trash />} />
    </>
  );
}

function State({ name, shared }: { name: string; shared?: boolean }) {
  return (
    <>
      <Switch checked={!!shared} label={shared ? `Stop showing this note to ${name}` : `Show this note to ${name}`} />
      <span className={shared ? 'small' : 'small ink3'}>{shared ? `${name} can read this` : 'Only you'}</span>
    </>
  );
}

export function NoteCardEntry() {
  const entry = byId('c-notecard')!;

  return (
    <Cmp
      entry={entry}
      status="beta"
      meta={[
        { k: 'Component', v: <code>ui/NoteCard.tsx</code> },
        { k: 'Class', v: <code>.ncard</code> },
        { k: 'Element', v: <code>&lt;article&gt;</code> },
        { k: 'Measure', v: '~75 characters at a desk' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            Three cards as the client file tiles them: one pinned, one shared with the client, one plain.
            The wall is a <code>repeat(auto-fill, minmax(min(340px,100%), 1fr))</code> grid at the
            call-site &mdash; this component draws one cell of it and knows nothing about the others.
          </>
        }
      >
        <Bench pad={false} style={{ padding: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(340px,100%),1fr))', gap: 12 }}>
            <NoteCard pinned meta="7 Jul 2026" state={<State name="Ananya" />} actions={<Acts pinned />}>
              <Markup value="Travels for work every third week. Plan a two-day split for those weeks." />
            </NoteCard>
            <NoteCard shared meta="3 Sep 2026 · edited" state={<State name="Ananya" shared />} actions={<Acts />}>
              <Markup value="Nice work on the **80kg** — that is a 10kg PR since March." />
            </NoteCard>
            <NoteCard meta="17 Jul 2026" state={<State name="Ananya" />} actions={<Acts />}>
              <Markup value="Sleeping 5h most nights. Volume capped until that moves." />
            </NoteCard>
          </div>
        </Bench>
      </Blk>

      <Blk
        title="A note is not a row, and the measurement is why"
        lede={
          <>
            This replaces <code>.cfnote</code>, a full-bleed row in a flush card. MEASURED at 1536&times;695
            on the densest seeded client: the notes card was <b>974px wide and 288px tall</b> beside a
            571px record column, and the text column inside a row was <b>705px</b> holding a 72-character
            sentence. So every note was one line with ~255px of nothing after it, and a 283px step ran down
            the middle of the tab.
          </>
        }
      >
        <p className="blk__p">
          A row is right for records that share a schema and are read <i>down</i> a column &mdash; a session,
          a payment, a set. A note shares nothing with the note above it except its author, and the thing the
          reader does is not scan a column, it is read a sentence. The shape was wrong, not the ratio: a track
          ceiling can stop a row spreading, it cannot give a column something to say.
        </p>
      </Blk>

      <Blk
        title="Two states, and neither of them is a tone"
        lede={
          <>
            <code>pinned</code> takes a ground, <code>shared</code> takes an edge &mdash; because a note can
            be both, and two fills cannot both win. They are booleans rather than a <code>tone</code> prop on
            purpose: a pinned note is not a warning and a shared one is not a success, and handing this a tone
            is how the next caller tints a note red.
          </>
        }
      >
        <Bench pad={false} style={{ padding: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(300px,100%),1fr))', gap: 12 }}>
            <NoteCard pinned shared meta="19 Sep 2026" state={<State name="Ananya" shared />} actions={<Acts pinned />}>
              <Markup value="Both at once: the warm ground is the strip it is stuck to, the lime edge is the client reading it." />
            </NoteCard>
            <NoteCard editing meta="19 Sep 2026" actions={<><Button variant="primary" size="sm">Save</Button><Button variant="ghost" size="sm">Cancel</Button></>}>
              <Markup value="editing — the share control is suppressed and the footer is the editor's own two buttons." />
            </NoteCard>
          </div>
        </Bench>
        <p className="blk__p">
          The word <b>Pinned</b> is drawn as well as the ground. <code>--tx-warn-soft</code> is a .13 alpha
          fill: it is the same surface as the card beside it to a reader who cannot separate the two hues, and
          the strip the note is stuck to is three inches further up the page.
        </p>
      </Blk>

      <Blk
        title="The footer is pinned to the floor, and that is structural"
        lede={
          <>
            <code>margin-top:auto</code> inside a column flex box. Grid items stretch, so every card in a row
            is as tall as the tallest; without it a two-line note&rsquo;s controls would sit two lines higher
            than its neighbour&rsquo;s and the wall would read as ragged rather than as a set.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: 560 }}>
                <NoteCard meta="7 Jul" state={<State name="Ananya" />}>
                  <Markup value="One line." />
                </NoteCard>
                <NoteCard meta="3 Sep" state={<State name="Ananya" />}>
                  <Markup value="Three lines of a note that somebody actually wrote, which is what makes the row as tall as it is." />
                </NoteCard>
              </div>
            ),
            caption: 'The switches land on one line across the row, whatever each sentence did.',
          }}
          no={{
            figure: (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: 560, alignItems: 'start' }}>
                <NoteCard meta="7 Jul" state={<State name="Ananya" />}>
                  <Markup value="One line." />
                </NoteCard>
                <NoteCard meta="3 Sep" state={<State name="Ananya" />}>
                  <Markup value="Three lines of a note that somebody actually wrote, which is what makes the row as tall as it is." />
                </NoteCard>
              </div>
            ),
            caption:
              'Each card left at its own height — which is what the floor is defeating. The two control rows land 32px apart and the wall reads as ragged.',
          }}
        />
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Ground', value: <code>--tx-surface-2</code>, note: 'Not --tx-surface: the card it sits in is already that' },
            { property: 'Radius', value: 'var(--tx-r3)', note: 'The card’s own, one step in from the container' },
            { property: 'Body', value: '14.5px / 1.6', token: '--tx-ink', note: 'pre-wrap, overflow-wrap:anywhere' },
            { property: 'Meta', value: '10.5px mono', token: '--tx-ink-3', note: 'Uppercase, .08em' },
            { property: 'Pinned flag', value: '10px mono / 600', token: '--tx-warn', note: 'Right-ranged, opposite the date' },
            { property: 'Pinned ground', value: <code>--tx-warn-soft</code>, note: 'The pinned strip’s own' },
            { property: 'Shared edge', value: 'inset 3px', token: '--tx-accent-line', note: 'A shadow, so it follows the radius' },
            { property: 'Hover', value: 'border only', note: 'No lift — a content card is not a link' },
            { property: 'Footer', value: 'margin-top:auto', note: 'Lines the controls up across a row' },
          ]}
        />
      </Blk>
    </Cmp>
  );
}
