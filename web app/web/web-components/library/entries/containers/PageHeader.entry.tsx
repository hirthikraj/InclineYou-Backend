import { Plus, Send } from '@/components/shell/Icons';

import { Button } from '../../../ui/Button';
import { PageHeader } from '../../../ui/PageHeader';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      background: 'var(--tx-canvas)',
      border: '1px solid var(--tx-line)',
      borderRadius: 'var(--tx-r3)',
      overflow: 'hidden',
      width: '100%',
    }}
  >
    {children}
  </div>
);

export function PageHeaderEntry() {
  const entry = byId('c-pageheader')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/PageHeader.tsx</code> },
        { k: 'Class', v: <code>.ph</code> },
        { k: 'Height', v: '~76px, ~112px with tabs' },
        { k: 'Title', v: <code>&lt;h1&gt;</code> },
      ]}
    >
      <Blk title="Specimen">
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Frame>
            <PageHeader
              title="Clients"
              sub="22 active · 3 owe you ₹31,000"
              actions={
                <>
                  <Button variant="secondary" icon={<Send />}>
                    Export
                  </Button>
                  <Button variant="primary" icon={<Plus />}>
                    Add client
                  </Button>
                </>
              }
            />
          </Frame>
        </Bench>
      </Blk>

      <Blk
        title="One h1 per screen, and this is it"
        lede={
          <>
            The reference draws <code>&lt;p class=&quot;ph__t&quot;&gt;</code>, which puts a page on the web
            with <b>no h1 at all</b> &mdash; the single most reported failure in any accessibility audit, and
            the first thing a screen reader jumps to.
          </>
        }
      />

      <Blk
        title="The sub-line is state, not description"
        lede={
          <>
            &ldquo;22 active &middot; 3 owe you ₹31,000&rdquo; is what the screen says <b>today</b>. A trainer
            already knows what Clients is; what they do not know is what is in it this morning, and that line
            is often the only thing they came for.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <div className="col gap4" style={{ width: '100%' }}>
            <Frame>
              <PageHeader title="Business" sub="₹1,06,500 billed · ₹31,500 pending · August" />
            </Frame>
            <Frame>
              <PageHeader title="Schedule" sub="14 sessions this week · 2 gaps on Thursday" />
            </Frame>
          </div>
        </Bench>
      </Blk>

      <Blk title="With tabs">
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Frame>
            <PageHeader
              title="Meera Krishnan"
              sub="Floor · Push / Pull · pack 8 of 12"
              actions={<Button variant="primary">Record payment</Button>}
              tabs={
                <>
                  <a className="tab" aria-current="page" href="#c-pageheader">
                    Overview
                  </a>
                  <a className="tab" href="#c-pageheader">
                    Sessions
                  </a>
                  <a className="tab" href="#c-pageheader">
                    Payments
                  </a>
                  <a className="tab" href="#c-pageheader">
                    Notes
                  </a>
                </>
              }
            />
          </Frame>
        </Bench>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Height', value: '~76px', note: '~112px with a tab row' },
            { property: 'Title', value: '22px / 800', token: '--tx-brand', note: 'An h1. Exactly one per screen' },
            { property: 'Sub', value: '13px', token: '--tx-ink-2', note: 'The screen’s state in one line' },
            { property: 'Actions', value: 'right', note: 'One primary at most' },
            { property: 'Tabs', value: <code>.ph__tabs</code>, note: 'A path segment, not a hidden panel' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <Frame>
                <PageHeader title="Clients" sub="22 active · 3 owe you ₹31,000" actions={<Button variant="primary">Add client</Button>} />
              </Frame>
            ),
            caption: 'A name, today’s state, and the one thing the screen is for. Three fixations and the trainer knows whether they need to be here.',
          }}
          no={{
            figure: (
              <Frame>
                <PageHeader
                  title="Clients"
                  sub="Manage your client roster"
                  actions={
                    <>
                      <Button variant="primary">Add client</Button>
                      <Button variant="primary">Import</Button>
                      <Button variant="primary">Export</Button>
                    </>
                  }
                />
              </Frame>
            ),
            caption:
              'A description instead of a state, and three primaries. The sub-line tells the trainer what they already knew, and nothing in the row says which action the screen expects.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
