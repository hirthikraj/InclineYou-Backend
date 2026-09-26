import { Check, Search, Users } from '@/components/shell/Icons';

import { Button } from '../../../ui/Button';
import { EmptyState } from '../../../ui/EmptyState';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

const Pane = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 330, border: '1px solid var(--tx-line)', borderRadius: 'var(--tx-r3)' }}>{children}</div>
);

export function EmptyStateEntry() {
  const entry = byId('c-empty')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/EmptyState.tsx</code> },
        { k: 'Class', v: <code>.empty</code> },
        { k: 'Kinds', v: '3' },
        { k: 'Used in', v: 'every list, table and pane' },
      ]}
    >
      <Blk
        title="Three kinds, and conflating them is the mistake"
        lede={
          <>
            They look identical and mean completely different things. A <b>filtered</b> list that says
            &ldquo;No clients yet&rdquo; tells a trainer with twenty-two clients that their book is empty. It
            is the same six words and a completely different lie.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px', gap: 16, alignItems: 'stretch', flexWrap: 'wrap' }}>
          <Pane>
            <EmptyState
              kind="first-run"
              icon={<Users size={22} />}
              title="No clients yet"
              body="Add your first client, or import a list. The roster is the only thing the rest of the app needs."
              action={
                <Button variant="primary" size="sm">
                  Add a client
                </Button>
              }
            />
          </Pane>
          <Pane>
            <EmptyState
              kind="filtered"
              icon={<Search size={22} />}
              title="No clients match “owing”"
              body="Twenty-two clients are in the roster. None of them owes you anything today."
              action={
                <Button variant="ghost" size="sm">
                  Clear the filter
                </Button>
              }
            />
          </Pane>
          <Pane>
            <EmptyState
              kind="done"
              icon={<Check size={22} />}
              title="Nothing needs you today"
              body="Thirteen rows were here this morning. All of them are dealt with."
            />
          </Pane>
        </Bench>
      </Blk>

      <Blk
        title="What each kind has to offer"
        lede={
          <>
            <b>first-run</b> offers the way to start. <b>filtered</b> offers the way back &mdash; and says how
            much is being hidden, so the trainer knows the data exists. <b>done</b> offers nothing, and says so
            warmly: it is the only empty state that is good news.
          </>
        }
      />

      <Blk
        title="Only the filtered kind is announced"
        lede={
          <>
            <b>filtered</b> gets <code>role=&quot;status&quot;</code> and{' '}
            <code>aria-live=&quot;polite&quot;</code>, because it appears in response to typing: the rows
            silently vanish and a reader is left in a region that has become blank. Polite, so it waits for
            the typing to stop.
          </>
        }
      >
        <p className="blk__p">
          <b>first-run</b> and <b>done</b> get neither. They are on the screen when it loads, so they are
          ordinary content &mdash; making them live regions would have them re-read on every unrelated update,
          which is the usual way a well-meant <code>aria-live</code> becomes noise.
        </p>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Min height', value: '260px', note: 'Full pane. `inCard` tightens it' },
            { property: 'Icon', value: '22px', token: '--tx-ink-3', note: 'aria-hidden' },
            { property: 'Title', value: '14px / 700', note: 'Says which of the three kinds this is' },
            { property: 'Body', value: '12.5px', note: 'Two sentences at most' },
            { property: 'Action', value: 'one', note: 'The way to start, or the way back. None when done' },
            { property: 'Live region', value: 'filtered only', note: 'polite. The other two kinds are ordinary content' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <div style={{ width: 280 }}>
                <EmptyState
                  inCard
                  kind="filtered"
                  icon={<Search size={20} />}
                  title="No clients match “owing”"
                  body="Twenty-two are in the roster."
                  action={
                    <Button variant="ghost" size="sm">
                      Clear the filter
                    </Button>
                  }
                />
              </div>
            ),
            caption: 'Names the filter, says how much is hidden behind it, and offers the way back in one press.',
          }}
          no={{
            figure: (
              <div style={{ width: 280 }}>
                <EmptyState inCard kind="first-run" icon={<Users size={20} />} title="No clients yet" />
              </div>
            ),
            caption:
              'The first-run wording on a filtered list. The trainer has twenty-two clients and the screen has just told them they have none.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
