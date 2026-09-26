import { EmptyState } from '../../../ui/EmptyState';
import { PromptList } from '../../../ui/PromptList';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

const NOTES = [
  'How does Ananya like to train?',
  'What does their week actually look like?',
  'What should you ask about next time?',
  'What is changing outside the gym?',
];

export function PromptListEntry() {
  const entry = byId('c-prompts')!;

  return (
    <Cmp
      entry={entry}
      status="beta"
      meta={[
        { k: 'Component', v: <code>ui/PromptList.tsx</code> },
        { k: 'Class', v: <code>.prompts</code> },
        { k: 'Element', v: <code>&lt;ul&gt;</code> },
        { k: 'Row', v: '38px · 42 on touch' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            The client file&rsquo;s notes tab, which is the case it was built for. Two columns past a 600px
            band and one below it &mdash; a <code>@container</code> query, because the band is 824px beside a
            collapsed rail, 1,225 stacked and 324 on a phone, and a viewport query can see none of that.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <PromptList kicker="Worth writing down" prompts={NOTES} />
        </Bench>
      </Blk>

      <Blk
        title="It seeds the placeholder, never the draft"
        lede={
          <>
            <code>onPick</code> is handed the question verbatim and the call-site puts it in the field&rsquo;s{' '}
            <code>placeholder</code>. Writing it into the value was the other option and it is worse twice
            over: it is text the writer has to delete before they can start, and on this screen it would put
            the product&rsquo;s words inside a note the product has promised not to read.
          </>
        }
      >
        <p className="blk__p">
          A placeholder does the whole job and disappears on the first keystroke, which is what a prompt is
          for. Nothing here is remembered: there is no <i>used</i> state, no dismiss and no per-prompt icon,
          because each of the three turns a hint into a feature with state and the thing being hinted at is a
          textarea.
        </p>
      </Blk>

      <Blk
        title="Not a permanent fixture, and the call-site owns the threshold"
        lede={
          <>
            There is no <code>count</code> prop. Whether a surface is still being taught is the surface&rsquo;s
            own question &mdash; the notes tab draws this at one to three notes and stops, because a trainer
            with four has shown what they think the field is for.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <div style={{ width: 420 }}>
                <PromptList kicker="Worth writing down" prompts={NOTES.slice(0, 4)} />
              </div>
            ),
            caption:
              'Four questions somebody could answer today, about the person whose file this is. The first one carries their name.',
          }}
          no={{
            figure: (
              <div style={{ width: 420 }}>
                <PromptList
                  kicker="Worth writing down"
                  prompts={[
                    'Add a note',
                    'What have they told you they cannot do?',
                    'Record any conditions or medication',
                    'Keep your records up to date',
                  ]}
                />
              </div>
            ),
            caption:
              'One restates the button above it, one is the generic instruction a prompt replaces — and two ask for health data. A prompt is the one part of a free-text field where the PRODUCT speaks, so what it asks for is what the product is collecting.',
          }}
        />
      </Blk>

      <Blk
        title="Beside the empty state it is the other half of"
        lede={
          <>
            <code>c-empty</code> says there is nothing here and <code>c-skeleton</code> says it is coming.
            Neither answers <i>what do you want me to put in it</i>, and on a free-text field that is the
            question actually being asked.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(300px,100%),1fr))', gap: 20, alignItems: 'center' }}>
            <EmptyState
              inCard
              title="Nothing written down yet"
              body="The things that never fit in a field — how Ananya likes to train, what their week looks like."
            />
            <PromptList kicker="Worth writing down" prompts={NOTES} />
          </div>
        </Bench>
        <p className="blk__p">
          The same sentence twice, and only one of them can be acted on. They are not drawn together for that
          reason: the notes tab shows the empty state at zero notes and these from the first note on.
        </p>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Kicker', value: '10px mono / .13em', token: '--tx-ink-3', note: 'A label, not a heading — it stays out of the outline' },
            { property: 'Question', value: '13.5px', token: '--tx-ink-2', note: '--tx-ink on hover; 7.92:1 → 17:1' },
            { property: 'Marker', value: <code>+</code>, token: '--tx-ink-3', note: '--tx-accent-text on hover; a ::before, not an icon' },
            { property: 'Row', value: '38px', note: '42 under pointer:coarse' },
            { property: 'Target', value: 'full width', note: 'The line, not the words — so a four-word question and a nine-word one are one control' },
            { property: 'Columns', value: '2 / 1', note: '@container 600px, measured off the longest question at 271px + a name' },
            { property: 'Element', value: <code>&lt;ul&gt;/&lt;li&gt;/&lt;button&gt;</code>, note: 'The count is announced before the first one is read' },
            { property: 'Box', value: 'none', note: 'It sits among bordered objects; a fourth edge is the card arguing with itself' },
          ]}
        />
      </Blk>
    </Cmp>
  );
}
