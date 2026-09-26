import { Card, CardBody, CardHead } from '../../../ui/Card';
import { CoachNote } from '../../../ui/CoachNote';
import { InlineLink } from '../../../ui/InlineLink';
import { Tag } from '../../../ui/Tag';
import { Avatar } from '../../../ui/Avatar';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

const BODY =
  'Good work this week. Keep the same weight on the bench next week and we will add a rep instead of a plate.';

export function CoachNoteEntry() {
  const entry = byId('c-coachnote')!;

  return (
    <Cmp
      entry={entry}
      status="beta"
      meta={[
        { k: 'Component', v: <code>ui/CoachNote.tsx</code> },
        { k: 'Class', v: <code>.cnote</code> },
        { k: 'Parts', v: '4 — av · b · q · m' },
        { k: 'Measure', v: '62ch on the quote' },
        { k: 'Used in', v: 'the client portal’s Home' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            One line from the trainer, in a <code>Card</code> whose head says who it is from. §1 of
            the client spec calls this <em>&ldquo;the single highest-value element on the screen and
            it costs almost nothing to build&rdquo;</em> — it is the thing that separates the portal
            from a free workout app, which is why it sits above the consistency figure on Home: a
            sentence from a person beats a number about yourself.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Cell label="A NOTE ABOUT THE PROGRAM · UNREAD" stretch>
            <div style={{ width: '100%', maxWidth: 520 }}>
              <Card>
                <CardHead title="From Arun">
                  <Tag tone="acc">New</Tag>
                  <span className="small ink3">2 days ago</span>
                </CardHead>
                <CardBody>
                  <CoachNote author="Arun Prakash" authorId="trn_001">
                    {BODY}
                  </CoachNote>
                </CardBody>
              </Card>
            </div>
          </Cell>
          <Cell label="WITH A META LINE · A PROGRAM CHANGE GETS A WAY TO LOOK AT IT" stretch>
            <div style={{ width: '100%', maxWidth: 520 }}>
              <Card>
                <CardHead title="From Arun">
                  <span className="small ink3">Sat</span>
                </CardHead>
                <CardBody>
                  <CoachNote
                    author="Arun Prakash"
                    authorId="trn_001"
                    meta={<InlineLink href="/me/plan">See what changed in your plan</InlineLink>}
                  >
                    I have swapped the barbell row for a chest-supported one — easier on your lower
                    back while it settles.
                  </CoachNote>
                </CardBody>
              </Card>
            </div>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="The measure is the whole point of the quote part"
        lede={
          <>
            <code>.portal</code> caps at 920px, and inside it the hand-written version of this note
            measured a <b>760px line holding 108 characters</b> — around 105 characters a line,
            where 45–75 is the band a reader can track without losing the return. It is the one
            paragraph of real prose on Home, so it is the one place that cost anything.{' '}
            <code>max-width:62ch</code> is on the <code>.cnote__q</code> part rather than on the
            card, because the card also holds a name, a tag and a stamp — none of which want a
            reading measure.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <div style={{ width: '100%' }}>
                <CoachNote author="Arun Prakash" authorId="trn_001">
                  {BODY}
                </CoachNote>
              </div>
            ),
            caption: (
              <>
                The quote stops at <b>62ch</b> however wide the card gets. The avatar stays put and
                the white space to the right of the line is the component working.
              </>
            ),
          }}
          no={{
            figure: (
              <div className="row row--top gap3" style={{ width: '100%' }}>
                <Avatar name="Arun Prakash" id="trn_001" size="md" />
                <p style={{ fontSize: 14.5, lineHeight: 1.5, color: 'var(--tx-ink)' }}>
                  &ldquo;{BODY}&rdquo;
                </p>
              </div>
            ),
            caption: (
              <>
                The markup Home used to carry: a <code>.row</code>, an <code>.av</code>, and three
                declarations as <b>inline style</b> — a font size, a line height and a colour a
                designer opening <code>webapp.css</code> cannot reach, on the element the spec is
                most insistent about.
              </>
            ),
          }}
        />
      </Blk>

      <Blk
        title="Two props it does not have, and both absences are the brief"
        lede={
          <>
            There is <b>no reply</b> and no action slot. §&ldquo;What to cut&rdquo; is explicit —{' '}
            <em>&ldquo;in-app chat — you cannot beat WhatsApp; link to it&rdquo;</em> — so a screen
            that wants a reply control here is asking for the feature that was cut;{' '}
            <code>meta</code> takes the <em>go and look at it</em> line instead, which points at a
            screen this app already has. And there is <b>no tone</b>: a note from your trainer is
            not a status, and tinting it would put <em>&ldquo;keep the same weight on the
            bench&rdquo;</em> into the same visual language as a balance owing.
          </>
        }
      />

      <Blk
        title="The avatar is the photo slot, and saying so is the point"
        lede={
          <>
            §1 asks for &ldquo;their name and photo&rdquo; and this product has no photo store —{' '}
            <code>/settings/profile</code> states that under its own preview. <code>Avatar</code> is
            the initials plate that has stood in for one since setup, so the slot is real and the
            identity is right. The day a photo column lands it lands <em>here</em>, and nowhere
            else, which is what a component buys over a <code>.row</code> assembled at a call-site.
            The plate&rsquo;s colour is keyed on <code>authorId</code> so one trainer is one colour
            on every screen that draws them.
          </>
        }
      >
        <SpecTable
          rows={[
            { property: 'author', token: 'string', value: 'required', note: 'Names the plate and its accessible label.' },
            { property: 'authorId', token: 'string', value: '—', note: 'Keys the colour, so one person is one colour everywhere.' },
            { property: 'children', token: 'ReactNode', value: 'required', note: 'What they wrote. Quoted HERE, never by the caller.' },
            { property: 'meta', token: 'ReactNode', value: '—', note: 'The line under it. Never the author’s name — the card’s head says that.' },
          ]}
        />
      </Blk>
    </Cmp>
  );
}
