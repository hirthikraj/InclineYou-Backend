import { Button } from '../../../ui/Button';
import { InlineLink } from '../../../ui/InlineLink';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

export function InlineLinkEntry() {
  const entry = byId('c-link')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/InlineLink.tsx</code> },
        { k: 'Element', v: <code>&lt;a&gt;</code> },
        { k: 'Class', v: 'none — §02 styles the element' },
        { k: 'Underline', v: 'on hover' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            A link in prose carries no class. §02 styles the bare element, which is the right place for it
            &mdash; prose written by anybody is styled without anybody remembering to.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--tx-ink-2)', maxWidth: '58ch', margin: 0 }}>
            Meera&rsquo;s package runs out on <InlineLink href="/clients">6 October</InlineLink>, six sessions
            from now. The gym&rsquo;s share is set on <InlineLink href="/clients">the client file</InlineLink>{' '}
            and overrides the default of 46%.
          </p>
        </Bench>
      </Blk>

      <Blk
        title="What the component is actually for"
        lede={
          <>
            Not the colour &mdash; the element. An in-app path gets <code>next/link</code> and its client-side
            navigation; an off-site one gets a plain <code>&lt;a&gt;</code>, because <code>next/link</code>{' '}
            prefetches, and prefetching <code>wa.me</code> fires a request at WhatsApp every time a row scrolls
            into view. A new tab gets <code>rel=&quot;noopener noreferrer&quot;</code> attached rather than
            remembered.
          </>
        }
      >
        <Bench style={{ gap: 26 }}>
          <Cell label="IN-APP · next/link">
            <InlineLink href="/clients">The roster</InlineLink>
          </Cell>
          <Cell label="OFF-SITE · plain anchor">
            <InlineLink href="https://wa.me/919841022119">WhatsApp</InlineLink>
          </Cell>
          <Cell label="NEW TAB · rel added, and announced">
            <InlineLink href="https://wa.me/919841022119" newTab>
              Message Meera
            </InlineLink>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="A link is not a button"
        lede={
          <>
            The boundary is what changes: a <b>link changes place</b>, a <b>button changes data</b>. It is not a
            matter of appearance &mdash; a button styled as a link still breaks middle-click, open-in-new-tab
            and the status bar, and a link that records a payment cannot be undone by the back button.
          </>
        }
      >
        <Bench style={{ gap: 26 }}>
          <Cell label="CHANGES PLACE · a link">
            <InlineLink href="/schedule">Full schedule</InlineLink>
          </Cell>
          <Cell label="CHANGES PLACE, DRAWN AS A BUTTON">
            <Button href="/schedule" size="sm" variant="secondary">
              Full schedule
            </Button>
          </Cell>
          <Cell label="CHANGES DATA · a button">
            <Button size="sm" variant="primary">
              Record payment
            </Button>
          </Cell>
        </Bench>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Colour', value: '#C6F24E', token: '--tx-accent-text', note: 'Steps to #4F6B0A on light, 6.1:1' },
            { property: 'Underline', value: 'on hover', note: 'Never at rest in prose — the colour carries it' },
            { property: 'Element', value: <code>&lt;a&gt;</code>, note: 'Always. A span with onClick is not a link' },
            { property: 'In-app', value: <code>next/link</code>, note: 'Client-side navigation, prefetched' },
            { property: 'Off-site', value: <code>&lt;a href&gt;</code>, note: 'No prefetch' },
            { property: 'New tab', value: <code>noopener noreferrer</code>, note: 'Attached automatically, plus a visually-hidden note' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--tx-ink-2)', margin: 0 }}>
                Set on <InlineLink href="/clients">the client file</InlineLink>.
              </p>
            ),
            caption: (
              <>
                The link text names its destination. Read alone, out of the sentence, it still says where it
                goes &mdash; which is how a screen reader&rsquo;s link list is read.
              </>
            ),
          }}
          no={{
            figure: (
              <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--tx-ink-2)', margin: 0 }}>
                To change the gym&rsquo;s share, <InlineLink href="/clients">click here</InlineLink>.
              </p>
            ),
            caption:
              '“Click here” names nothing. A reader listing the links on this screen gets “click here” eleven times, and the sentence they came from is not in the list.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
