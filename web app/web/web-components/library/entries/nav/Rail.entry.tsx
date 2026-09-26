import { Rail } from '@/components/shell/Rail';

import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/**
 * Navigation rail — the product's own component, not a copy.
 *
 * `components/shell/Rail.tsx` takes plain props, so the library can render the
 * exact rail `/today` renders. This is the strongest form the guarantee takes:
 * there is no `ui/Rail.tsx` to drift from, because there is nothing here but
 * the import.
 */
export function RailEntry() {
  const entry = byId('c-rail')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>components/shell/Rail.tsx</code> },
        { k: 'Class', v: <code>.rail</code> },
        { k: 'Width', v: '64px, fixed' },
        { k: 'Destinations', v: '8' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            This is the application&rsquo;s own <code>Rail</code>, imported. Not a copy, not a drawing &mdash;
            the same module the shell mounts, with the same counts a real book produces.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          {/* `app--rail-min` on the bench, because that is the only state the
              product renders — the rail is fixed at 64px in both shells and the
              class is unconditional on `.app`. Without it the specimen would be
              a 248px rail nobody can reach, which is the drift this entry exists
              to prevent. The class alone and not `.app` with it: `.app` is a
              `100dvh` grid and would take the bench apart, while every rule the
              collapsed rail needs is a descendant of the modifier. */}
          <div className="app--rail-min" style={{ height: 460, display: 'flex', overflow: 'hidden', borderRadius: 'var(--tx-r3)' }}>
            <Rail
              current="today"
              trainerName="Arun Prakash"
              trainerPhone="98410 22119"
              counts={{
                today: { text: '13', tone: 'alert', label: '13 clients need you today' },
                clients: { text: '22', label: '22 clients' },
              }}
            />
          </div>
        </Bench>
      </Blk>

      <Blk
        title="Where am I"
        lede="The rail's whole job is answering that before the trainer has read anything. Compare the marked row against the quiet ones — and note that it is a tinted ground plus aria-current, never a colour on its own."
      >
        <Bench pad={false} style={{ padding: '18px 20px', gap: 18, alignItems: 'flex-start' }}>
          <div className="app--rail-min" style={{ height: 400, display: 'flex', overflow: 'hidden', borderRadius: 'var(--tx-r3)' }}>
            <Rail
              current="clients"
              trainerName="Arun Prakash"
              counts={{ today: { text: '13', tone: 'alert', label: '13 clients need you today' } }}
            />
          </div>
          <div className="app--rail-min" style={{ height: 400, display: 'flex', overflow: 'hidden', borderRadius: 'var(--tx-r3)' }}>
            <Rail
              current="biz"
              trainerName="Arun Prakash"
              counts={{ biz: { text: '5', tone: 'alert', label: '5 payments overdue' } }}
            />
          </div>
        </Bench>
      </Blk>

      <Blk
        title="First run, with nothing in the book"
        lede="A brand-new trainer has no counts and nowhere to go yet. The rail still renders every destination — hiding them would make the product look smaller than it is on the one day the trainer is deciding whether to keep it."
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <div className="app--rail-min" style={{ height: 400, display: 'flex', overflow: 'hidden', borderRadius: 'var(--tx-r3)' }}>
            <Rail current="today" trainerName="Anbu R" firstRun />
          </div>
        </Bench>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Width', value: '64px', note: 'Fixed — the section pane is the column that collapses' },
            { property: 'Row', value: '38px' },
            { property: 'Current', value: <code>aria-current=&quot;page&quot;</code>, note: 'Plus a tinted ground — never colour alone' },
            {
              property: 'Count',
              value: <code>RailBadge</code>,
              note: 'text + tone + a REQUIRED label — the product already enforces what Count badge documents',
            },
            { property: 'Foot', value: 'the account menu', note: 'Name, number, and the way out' },
            { property: 'Element', value: <code>&lt;nav&gt;</code>, note: 'A landmark, labelled' },
          ]}
        />
      </Blk>
    </Cmp>
  );
}
