import { TemplateCard } from '../../../ui/TemplateCard';
import { Button } from '../../../ui/Button';
import { Tag } from '../../../ui/Tag';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/**
 * Template card — a certified blueprint nobody has read yet.
 *
 * The cards below are `ui/TemplateCard.tsx` — the SAME import
 * `components/programs/CertifiedCard.tsx` renders, so this page cannot drift
 * from `/programs/certified`.
 *
 * Nothing here has a handler. `/library/[id]` is a Server Component, so a
 * specimen that passed `onClick` to a card would be a 500 on three routes with
 * `tsc` and `eslint` both clean. Every control below is a `Button` with an
 * `href`, which is what the real card's *Preview* and *Open your copy* are
 * anyway; only *Use this* is a handler at the call-site, and that belongs to
 * the screen rather than to the component.
 */
export function TemplateCardEntry() {
  const entry = byId('c-templatecard')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/TemplateCard.tsx</code> },
        { k: 'Class', v: <code>.certc</code> },
        { k: 'Element', v: <code>&lt;article&gt;</code> },
        { k: 'Slots', v: '6' },
        { k: 'Grid track', v: '320px min' },
        { k: 'Used in', v: '/programs/certified' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            Six slots in a fixed order: the name and the one tag that varies, the sentence, the spec bar, the
            tags, the server&rsquo;s refusal when there is one, and a footer split between provenance and
            verbs. The footer is <code>margin-top:auto</code>, so a grid of cards with summaries of different
            lengths still puts every <i>Use this</i> on one line.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(320px,100%),1fr))', gap: 14, alignItems: 'stretch' }}>
          <TemplateCard
            name="Beginner Full Body · 3 day"
            href="#c-templatecard"
            tag={<Tag tone="acc">Most used</Tag>}
            summary="A first eight weeks for somebody who has never trained. Compound lifts at low volume, one new movement a week, and nothing that needs a spotter."
            spec={[
              { value: 3, noun: 'days a week' },
              { value: 8, noun: 'weeks' },
              { value: 15, noun: 'exercises' },
            ]}
            tags={
              <>
                <Tag>Beginner</Tag>
                <Tag>Full gym</Tag>
                <Tag>General fitness</Tag>
              </>
            }
            meta={
              <>
                Used by <b>214</b> · reviewed Aug
              </>
            }
            actions={
              <>
                <Button href="#c-templatecard" variant="secondary" size="sm">
                  Preview
                </Button>
                <Button href="#c-templatecard" variant="primary" size="sm">
                  Use this
                </Button>
              </>
            }
          />

          <TemplateCard
            name="Push / Pull / Legs · 3 day"
            href="#c-templatecard"
            mine
            tag={<Tag tone="ok">You have a copy</Tag>}
            summary="Classic PPL at sixteen sets a session. The one most trainers reach for when a client plateaus on an upper/lower, and it holds up at three days as well as six."
            spec={[
              { value: 3, noun: 'days a week' },
              { value: 8, noun: 'weeks' },
              { value: 15, noun: 'exercises' },
            ]}
            tags={
              <>
                <Tag>Intermediate</Tag>
                <Tag>Full gym</Tag>
                <Tag>Hypertrophy</Tag>
              </>
            }
            meta={
              <>
                Copied <b>18 Jul</b> · revised since
              </>
            }
            actions={
              <>
                <Button href="#c-templatecard" variant="ghost" size="sm">
                  Preview
                </Button>
                <Button href="#c-templatecard" variant="ghost" size="sm">
                  Use again
                </Button>
                <Button href="#c-templatecard" variant="secondary" size="sm">
                  Open your copy
                </Button>
              </>
            }
          />

          <TemplateCard
            name="Bodyweight Anywhere · 2 day"
            href="#c-templatecard"
            summary="No equipment at all, and no floor space beyond a mat. The program for a client who travels, or who has told you twice they will not be joining a gym."
            spec={[
              { value: 2, noun: 'days a week' },
              { value: 4, noun: 'weeks' },
              { value: 10, noun: 'exercises' },
            ]}
            tags={
              <>
                <Tag>Beginner</Tag>
                <Tag>Bodyweight</Tag>
                <Tag>General fitness</Tag>
              </>
            }
            meta={
              <>
                Used by <b>96</b> · reviewed Jul
              </>
            }
            actions={
              <>
                <Button href="#c-templatecard" variant="secondary" size="sm">
                  Preview
                </Button>
                <Button href="#c-templatecard" variant="primary" size="sm">
                  Use this
                </Button>
              </>
            }
          />
        </Bench>
      </Blk>

      <Blk
        title="The header slot holds one thing, and often nothing"
        lede={
          <>
            It used to hold <i>By InclineYou</i> on every card that was not already copied &mdash; four of
            five &mdash; under a page whose own subtitle reads <i>written and reviewed by certified
            trainers</i>. A badge on ~100% of rows carries no bits, and this one spent the card&rsquo;s most
            valuable 90px saying what the <code>&lt;h1&gt;</code> had already said.
            <br />
            <br />
            What goes there instead is whatever varies. <b>You have a copy</b> changes both verbs in the
            footer, so it is the state that earns the slot. <b>Most used</b> rides the single card the
            catalogue&rsquo;s own ranking put first &mdash; and only ever that one, never the row that happens
            to lead a filtered grid. <b>Neither</b> is the common case, and an empty slot is the correct
            drawing of it.
            <br />
            <br />
            <code>mine</code> wins when a card is both: a trainer who already holds this blueprint is being
            told what to press, which is a fact about them, and <i>most used</i> is a fact about everybody
            else.
          </>
        }
      />

      <Blk
        title="Every figure carries the noun it is of"
        lede={
          <>
            <code>spec</code> takes <code>{'{ value, noun }'}</code> pairs and the noun is <b>required</b>.{' '}
            <code>3 · 8 · 15</code> is not three facts, it is three numbers whose units a reader has to guess,
            and a card grid has no column heading anywhere to guess them from &mdash; which is exactly the
            argument <code>.ptrow__k</code> makes on the program row, where there IS a heading and it still
            was not enough.
            <br />
            <br />
            The figure takes <code>--tx-ink</code> and the noun <code>--tx-ink-3</code>, so the bar scans as
            numbers at a glance and reads as a sentence when actually read. Tabular, so a column of cards puts
            its units in the same place whether the count is 8 or 15. Hairline separators rather than{' '}
            <code>·</code>, matching <code>.figs</code>.
            <br />
            <br />
            <b>The space between the figure and its noun is a real space in the markup.</b> The span was an{' '}
            <code>inline-flex</code> with a <code>gap</code> first, which draws 4px and puts no character
            between them: the accessible name came out <code>3days a week</code>. It looked right and read as
            one word.
          </>
        }
      />

      <Blk
        title="What replaced the shape strip, and why"
        lede={
          <>
            The card drew <code>.shape</code> &mdash; seven cells, three of them lit &mdash; beside the same
            figures the bar now carries. On <code>/programs</code> that strip is the trainer&rsquo;s own
            layout and the row beside it names the days. On a <i>certified</i> blueprint it is{' '}
            <code>3 days a week</code> drawn twice: law 1 of <code>blueprint.ts</code> is that a day is an
            ordinal slot and which weekday it lands on is the <b>client&rsquo;s</b>, chosen once at assign
            time &mdash; so the strip encoded a position that means nothing until somebody copies the program
            and schedules it.
            <br />
            <br />
            It also cost the accent. Three solid <code>--tx-accent</code> blocks a card, times five cards,
            over a lime tag and a lime <i>Use this</i>, under a lime active tab. An accent on every element of
            every card is not an accent &mdash; it is the surface colour, and the one thing the trainer is
            meant to press had nothing left to stand out with.
          </>
        }
      />

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Element', value: <code>&lt;article&gt;</code>, note: 'Not a link — it contains buttons, and nested interactive content breaks tab order' },
            { property: 'Padding', value: '14px', note: 'Was 13; the grid gutter went to 14 with it, so a hovered card keeps an edge' },
            { property: 'Radius', value: <code>--tx-r3</code> },
            { property: 'Title', value: '13.5px / 600', token: '--tx-ink', note: 'text-wrap:balance — the names run to four words' },
            { property: 'Title link', value: <code>.certc__tl</code>, note: 'Underlines on hover and focus only; ±4px of vertical slop, ±13 on a coarse pointer' },
            { property: 'Summary', value: '12px', token: '--tx-ink-2', note: '3-line clamp — a fourth line has never decided anything' },
            { property: 'Spec figure', value: 'mono 11px / 600', token: '--tx-ink', note: 'Tabular' },
            { property: 'Spec noun', value: 'mono 11px', token: '--tx-ink-3' },
            { property: 'Separator', value: '1px', token: '--tx-line', note: 'border-inline-start, so a right-to-left build divides on the correct side' },
            { property: 'Footer', value: <code>margin-top:auto</code>, note: 'Pins the verbs to the bottom of a stretched grid track' },
            { property: 'Provenance', value: 'mono 10.5px', token: '--tx-ink-2', note: 'The figure inside it takes --tx-ink. Was --tx-ink-3 whole' },
            { property: 'Hover', value: 'border + surface', token: '--tx-surface-2', note: 'The whole card, not only the title' },
            { property: 'Copied state', value: 'a lit edge', token: '--tx-accent-line', note: 'Never a fill — provenance, not selection' },
          ]}
        />
      </Blk>

      <Blk
        title="Do and don’t"
        tag="guidelines"
        lede={
          <>
            Both cards are real <code>TemplateCard</code>s. The claim is about what goes in the slots, not
            about a width, so a live specimen can make it.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <TemplateCard
                name="Fat Loss Circuit · 3 day"
                summary="Dumbbells and a mat, nothing else. Written for a client training at home, or on a gym floor too crowded to hold a squat rack for forty minutes."
                spec={[
                  { value: 3, noun: 'days a week' },
                  { value: 6, noun: 'weeks' },
                  { value: 15, noun: 'exercises' },
                ]}
                tags={
                  <>
                    <Tag>Beginner</Tag>
                    <Tag>Dumbbells only</Tag>
                  </>
                }
                meta={
                  <>
                    Used by <b>161</b> · reviewed Jul
                  </>
                }
                actions={
                  <Button href="#c-templatecard" variant="secondary" size="sm">
                    Preview
                  </Button>
                }
              />
            ),
            caption:
              'An empty header slot, three figures with their nouns, and the use count weighted. Nothing on the card is there to fill a row.',
          }}
          no={{
            figure: (
              <TemplateCard
                name="Fat Loss Circuit · 3 day"
                tag={<Tag tone="acc">By InclineYou</Tag>}
                summary="Dumbbells and a mat, nothing else. Written for a client training at home, or on a gym floor too crowded to hold a squat rack for forty minutes."
                spec={[
                  { value: 3, noun: '' },
                  { value: 6, noun: '' },
                  { value: 15, noun: '' },
                ]}
                tags={
                  <>
                    <Tag>Beginner</Tag>
                    <Tag>Dumbbells only</Tag>
                  </>
                }
                meta={<>Used by 161</>}
                actions={
                  <Button href="#c-templatecard" variant="secondary" size="sm">
                    Preview
                  </Button>
                }
              />
            ),
            caption:
              'A badge every card wears, bare figures whose units the reader supplies, and the one fact that separates this blueprint from the next one whispered in --tx-ink-3.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
