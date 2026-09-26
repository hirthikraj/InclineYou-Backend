import { byId } from '../../../registry';
import { ProfileCard } from '../../../ui/ProfileCard';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';

export function ProfileCardEntry() {
  const entry = byId('c-profilecard')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/ProfileCard.tsx</code> },
        { k: 'Class', v: <code>.pfc</code> },
        { k: 'Fields', v: '8, all optional' },
        { k: 'Controls', v: 'links only' },
      ]}
    >
      <Blk title="Specimen">
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <div className="row row--wrap" style={{ alignItems: 'start', gap: 16 }}>
            <div style={{ width: 340 }}>
              <ProfileCard
                name="Ravi Kannan"
                headline="Strength & fat-loss coach · Indiranagar"
                meta="6–10 years · English, Kannada, Hindi"
                specialities={['Strength', 'Fat loss', 'Post-injury return']}
                credentials={['ACE-CPT', 'Precision Nutrition L1']}
                credentialNote="Self-declared"
                work="In person · Online — Iron Yard, Indiranagar"
                socials={[{ label: '@ravi.trains', url: 'https://instagram.com/ravi.trains' }]}
              />
            </div>
            <div style={{ width: 340 }}>
              <ProfileCard
                name="Meera Krishnan"
                headline="Pre- and post-natal coaching"
                meta="2–5 years"
                noCredentials="No certifications listed — which plenty of excellent trainers don’t have."
              />
            </div>
            <div style={{ width: 340 }}>
              <ProfileCard name="" />
            </div>
          </div>
        </Bench>
      </Blk>

      <Blk
        title="Absent means absent, and there is exactly one exception"
        lede={
          <>
            Nothing here draws a placeholder for an unanswered question. A preview that printed{' '}
            <i>No certifications yet</i> in the slot where certifications go would be telling the trainer a
            client sees a sentence that a client does not see. The second specimen above is what a half-filled
            profile actually looks like: three lines, not eight rows of dashes.
          </>
        }
      >
        <p className="blk__p">
          The exception is the <b>name</b> &mdash; the one field an invite cannot be sent without. An unnamed
          card draws the ghost (third specimen) rather than collapsing, because a card with no name at all
          reads as a component that failed to load rather than a field nobody has filled in.
        </p>
      </Blk>

      <Blk
        title="It is read-only, and that is a contract rather than an omission"
        lede={
          <>
            The tokens are <b>Tag</b> and never <b>Chip</b>: a chip is pressable, and a speciality here is a
            fact borrowed from the tab that owns it. A preview that could be typed into is a second form, and
            a second form is a second place for one answer to be written from.
          </>
        }
      >
        <p className="blk__p">
          <code>socials</code> is the exception and they are real anchors. A trainer checking their own
          preview is exactly the person who should find out that the handle they typed opens somebody
          else&rsquo;s account, and the only way to find that out is to follow it.
        </p>
        <p className="blk__p">
          <i>Not certified yet</i> is a real answer and never a tag &mdash; a badge reading that beside
          somebody&rsquo;s name renders an honest answer as a mark against them. It takes{' '}
          <code>noCredentials</code>, which is a quiet line.
        </p>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Avatar', value: '48px', note: 'Avatar size="lg" — one initials rule' },
            { property: 'Identity gap', value: '13px', token: '—' },
            { property: 'Name', value: '14px / 700', token: '--tx-ink' },
            { property: 'Headline', value: '12.5px, one line', note: 'Ellipses. The only child that clips' },
            { property: 'Borrowed line', value: '12.5px, 10px above', token: '--tx-ink-3' },
            { property: 'Qualifier', value: '11.5px', note: 'Beside the credentials, never a tag' },
          ]}
        />
        <p className="blk__p">
          <code>min-width:0</code> on <code>.pfc__n</code> is not defensive tidiness: a flex item&rsquo;s
          minimum is <code>auto</code>, so without it the name block refuses to shrink below its longest word
          and pushes the avatar off the card instead of ellipsing.
        </p>
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <div style={{ width: 320 }}>
                <ProfileCard
                  name="Ravi Kannan"
                  headline="Strength & fat-loss coach · Indiranagar"
                  specialities={['Strength', 'Fat loss']}
                />
              </div>
            ),
            caption:
              'One line under the name, and it ellipses. A headline is a single line by definition, so a trainer who typed two has written a bio in the wrong field — and seeing the clip is how they find that out before a client does.',
          }}
          no={{
            figure: (
              <div style={{ width: 320 }}>
                <ProfileCard
                  name="Ravi Kannan"
                  headline="Strength coach"
                  meta="—"
                  specialities={[]}
                  noCredentials="No certifications listed."
                  work="—"
                />
              </div>
            ),
            caption:
              'Dashes where the answers are not. The card is a preview, and a preview that invents a row a client will not see is the one thing a preview cannot do.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
