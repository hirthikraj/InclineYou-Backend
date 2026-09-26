import { Why } from '../../../ui/Why';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

export function WhyEntry() {
  const entry = byId('c-why')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Why.tsx</code> },
        { k: 'Class', v: <code>.why</code> },
        { k: 'Variants', v: '3' },
        { k: 'Live region', v: 'none' },
      ]}
    >
      <Blk title="Specimen">
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <div className="col gap4" style={{ maxWidth: 560 }}>
            <Why heading="Why this is step 3 and not step 6">
              Every figure the app shows you afterwards — today&rsquo;s earnings, the month, GST turnover — is
              net of this number. Asked late, it makes every earlier screen wrong.
            </Why>
            <Why heading="One thing to know" tone="warn">
              This client has 8 sessions left in a pack that expires on Thursday. Archiving now keeps the history
              and stops the reminder.
            </Why>
            <Why heading="This cannot be undone from here" tone="danger">
              Writing off ₹9,000 removes it from what is pending and from your GST turnover. Recording a
              payment later will not restore the original invoice.
            </Why>
          </div>
        </Bench>
      </Blk>

      <Blk
        title="The most distinctive component in the set, and the easiest to misuse"
        lede={
          <>
            It exists to explain a decision <b>the product has already made</b> &mdash; why the gym&rsquo;s
            share is asked at step 3, why archiving keeps the history. It is not an alert and not a tip, and
            the moment it is used as a generic tinted box the screen has three colours of paragraph and no
            hierarchy.
          </>
        }
      >
        <p className="blk__p">
          <code>heading</code> is required for that reason. A <code>.why</code> with no heading is a coloured
          paragraph, and a coloured paragraph is what an alert looks like. The heading is what makes it a
          reason: &ldquo;Why this is step 3 and not step 6&rdquo;.
        </p>
      </Blk>

      <Blk
        title="No role, and no live region"
        lede={
          <>
            Nothing here is news. The callout was on the screen before the trainer arrived, and announcing an
            explanation as an alert makes it sound like a problem. <b>Toast</b> is for what just happened;
            this is for what was always true.
          </>
        }
      />

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Radius', value: '10px', token: '--tx-r3' },
            { property: 'Heading', value: '12.5px / 700', note: 'Required. Usually starts “Why…”' },
            { property: 'Body', value: '13px / 1.62', token: '--tx-ink-2' },
            { property: 'Tones', value: '3', note: 'neutral · warn · danger' },
            { property: 'Border', value: 'left 2px', note: 'Tinted by tone' },
            { property: 'Role', value: 'none', note: 'Deliberately. It is not news' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <div style={{ width: 320 }}>
                <Why heading="Why this is step 3 and not step 6">
                  Every figure afterwards is net of this number. Asked late, it makes every earlier screen
                  wrong.
                </Why>
              </div>
            ),
            caption: 'Answers a question the trainer is actually asking at that moment, and gives the reason rather than the rule.',
          }}
          no={{
            figure: (
              <div style={{ width: 320 }}>
                <Why heading="Note">Fields marked with an asterisk are required.</Why>
              </div>
            ),
            caption:
              'A tinted box used for form instructions. It is not a reason, the heading says nothing, and it spends the one visual treatment reserved for explaining a decision.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
