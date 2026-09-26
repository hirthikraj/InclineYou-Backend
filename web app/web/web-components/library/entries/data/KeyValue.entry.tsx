import { KeyValueList, KeyValueRow } from '../../../ui/KeyValue';
import { Switch } from '../../../ui/Switch';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

const SETTINGS = [
  { k: 'Default gym share · floor', v: '46%' },
  { k: 'Default gym share · remote', v: '0%' },
  { k: 'Default session fee', v: '₹800' },
  { k: 'Storage used', v: '4.2 MB' },
];

export function KeyValueEntry() {
  const entry = byId('c-kv')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/KeyValue.tsx</code> },
        { k: 'Class', v: <code>.kv</code> },
        { k: 'Height', v: '~38px' },
        { k: 'Element', v: <code>&lt;dl&gt;</code> },
      ]}
    >
      <Blk title="Specimen">
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <KeyValueList rows={SETTINGS} width={360} />
        </Bench>
      </Blk>

      <Blk
        title="A description list, which is the whole component"
        lede={
          <>
            The pairing between &ldquo;Default session fee&rdquo; and &ldquo;₹800&rdquo; is <b>visual only</b>{' '}
            in the reference: two spans side by side, with nothing saying they belong together. A screen reader
            gets a run of alternating fragments and the trainer has to hold the pairing in their head.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '14px 16px' }}>
          <code style={{ fontSize: 12.5, lineHeight: 1.9 }}>
            &lt;dl&gt;
            <br />
            &nbsp;&nbsp;&lt;div class=&quot;kv&quot;&gt;
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;&lt;dt class=&quot;kv__k&quot;&gt;Default session fee&lt;/dt&gt;
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;&lt;dd class=&quot;kv__v&quot;&gt;₹800&lt;/dd&gt;
          </code>
        </Bench>
        <p className="blk__p">
          It costs nothing &mdash; <code>.kv</code> styles it identically, because the classes never depended
          on the tags &mdash; and it is the difference between a settings screen that can be read aloud and one
          that cannot.
        </p>
      </Blk>

      <Blk
        title="A single row, when the value is a control"
        lede={
          <>
            <code>KeyValueRow</code> stays a pair of spans rather than a one-item <code>&lt;dl&gt;</code>. A
            description list of one is a list a reader announces the length of, and &ldquo;list, 1 item&rdquo;
            before every switch on the settings screen is noise.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '8px 12px' }}>
          <div className="col" style={{ gap: 0, width: 340 }}>
            <KeyValueRow k="Session reminder to clients">
              <Switch label="Session reminder to clients" checked />
            </KeyValueRow>
            <KeyValueRow k="Weekly report · Sundays 20:00">
              <Switch label="Weekly report, Sundays at 20:00" checked />
            </KeyValueRow>
          </div>
        </Bench>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Height', value: '~38px', note: 'Grows for a wrapped key' },
            { property: 'Key', value: '13px', token: '--tx-ink-2', note: 'Left, never truncated' },
            { property: 'Value', value: '13px / 600', token: '--tx-ink', note: 'Right-ranged' },
            { property: 'Divider', value: '1px', token: '--tx-line', note: 'Between rows, not around the list' },
            { property: 'Element', value: <code>&lt;dl&gt;/&lt;dt&gt;/&lt;dd&gt;</code>, note: 'For a list of pairs' },
            { property: 'Single row', value: 'two spans', note: 'A dl of one announces a list length nobody needs' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: <KeyValueList rows={SETTINGS.slice(0, 2)} width={300} />,
            caption: 'Short keys, short values, one line each. The eye reads the left column down and stops at the row it wants.',
          }}
          no={{
            figure: (
              <KeyValueList
                rows={[
                  { k: 'What proportion of each floor session fee is retained by the gym', v: '46%' },
                  { k: 'Remote', v: 'Zero percent is retained for sessions delivered remotely' },
                ]}
                width={300}
              />
            ),
            caption:
              'A sentence in the key and another in the value. Both wrap, the rows lose their rhythm, and the pairing the layout existed to show is buried in prose.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
