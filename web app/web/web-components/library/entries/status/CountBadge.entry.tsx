import { CountBadge } from '../../../ui/CountBadge';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

export function CountBadgeEntry() {
  const entry = byId('c-count')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/CountBadge.tsx</code> },
        { k: 'Class', v: <code>.rail__n</code> },
        { k: 'Variants', v: '3' },
        { k: 'Height', v: '18px' },
        { k: 'Zero', v: 'renders nothing' },
      ]}
    >
      <Blk title="Specimen">
        <Bench style={{ gap: 26 }}>
          <Cell label="NEUTRAL · A SIZE">
            <CountBadge n={22} label="22 clients" />
          </Cell>
          <Cell label="ACCENT · NEEDS YOU">
            <CountBadge n={13} label="13 clients need you today" tone="acc" />
          </Cell>
          <Cell label="ALERT · OVERDUE MONEY">
            <CountBadge n={5} label="5 payments overdue" tone="alert" />
          </Cell>
          <Cell label="CAPPED · PAST 99">
            <CountBadge n={412} label="412 unread" tone="alert" />
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="Two rules the type enforces"
        lede={
          <>
            Both were being broken by hand. <code>label</code> is <b>required</b>: a bare
            &ldquo;13&rdquo; beside an icon is a number with no noun, and a screen reader gets
            &ldquo;thirteen&rdquo; and nothing else. And a <b>zero renders nothing at all</b> &mdash; nought is
            not a count a trainer can act on, and a badge that is sometimes zero teaches the eye to stop seeing
            the badge.
          </>
        }
      >
        <Bench style={{ gap: 26 }}>
          <Cell label="n = 13 · RENDERS">
            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13.5, color: 'var(--tx-ink)' }}>Needs you today</span>
              <CountBadge n={13} label="13 clients need you today" tone="alert" />
            </span>
          </Cell>
          <Cell label="n = 0 · RENDERS NOTHING">
            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13.5, color: 'var(--tx-ink)' }}>Needs you today</span>
              <CountBadge n={0} label="nothing needs you" tone="alert" />
            </span>
          </Cell>
        </Bench>
      </Blk>

      <Blk title="In the rail, which is what the class is named for">
        <Bench pad={false} style={{ padding: '10px 12px', gap: 0 }}>
          <div className="col" style={{ width: 240, gap: 2 }}>
            {[
              { label: 'Today', n: 13, tone: 'alert' as const },
              { label: 'Clients', n: 22, tone: 'neutral' as const },
              { label: 'Schedule', n: 0, tone: 'neutral' as const },
              { label: 'Business', n: 5, tone: 'acc' as const },
            ].map((r) => (
              <span
                key={r.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 8,
                  fontSize: 13.5,
                  color: 'var(--tx-ink)',
                }}
              >
                {r.label}
                <CountBadge n={r.n} label={`${r.n} in ${r.label}`} tone={r.tone} />
              </span>
            ))}
          </div>
        </Bench>
        <p className="blk__p">
          Schedule has nothing outstanding, so it carries no badge &mdash; not a grey nought. The row is quiet
          because there is nothing to say.
        </p>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Height', value: '18px' },
            { property: 'Label', value: '11px / 700', token: '--tx-mono', note: 'Tabular, so 8 and 88 do not shift the row' },
            { property: 'Radius', value: 'full' },
            { property: 'Tones', value: '3', note: 'neutral · acc · alert' },
            { property: 'Cap', value: '99+', note: 'Past 99 the exact number stops changing what anyone does' },
            { property: 'Zero', value: 'not rendered', note: 'Enforced by the component, not by the caller' },
            { property: 'Accessible name', value: <code>label</code>, note: 'Required. The digits alone are a number with no noun' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 13.5, color: 'var(--tx-ink)' }}>Needs you today</span>
                <CountBadge n={13} label="13 clients need you today" tone="alert" />
              </span>
            ),
            caption: 'A count of things the trainer can act on, beside the noun it counts. Thirteen rows, thirteen decisions.',
          }}
          no={{
            figure: (
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 13.5, color: 'var(--tx-ink)' }}>Clients</span>
                <CountBadge n={22} label="22" tone="alert" />
              </span>
            ),
            caption:
              'Twenty-two clients is not an alert — it is the size of the book. A tone that means “act” spent on a number that means “exists” is the fastest way to make every badge on the screen ignorable.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
