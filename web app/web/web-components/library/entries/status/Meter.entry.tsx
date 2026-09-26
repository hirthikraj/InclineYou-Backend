import { Meter } from '../../../ui/Meter';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

export function MeterEntry() {
  const entry = byId('c-meter')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Meter.tsx</code> },
        { k: 'Class', v: <code>.meter</code> },
        { k: 'Sizes', v: '2' },
        { k: 'Segments', v: '2–3' },
        { k: 'Input', v: 'amounts, not percentages' },
      ]}
    >
      <Blk title="Specimen">
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <div className="col gap4" style={{ width: 420 }}>
            <Cell label="THE MONTH · YOURS / GYM / PENDING">
              <Meter
                size="lg"
                label="August takings"
                segments={[
                  { tone: 'ok', value: 121_500, label: 'yours' },
                  { tone: 'warn', value: 72_000, label: 'the gym’s' },
                  { tone: 'dim', value: 31_500, label: 'pending' },
                ]}
              />
            </Cell>
          </div>
        </Bench>
      </Blk>

      <Blk
        title="Amounts in, percentages out"
        lede={
          <>
            The design file writes the widths as percentages somebody worked out: <code>54% / 32% / 14%</code>.
            Every call-site doing that arithmetic by hand is a place where the bar can quietly fail to reach its
            end &mdash; and a meter that stops at 97% reads as a fourth, unlabelled segment. Passing the real
            figures and letting the component divide removes the arithmetic and the bug with it.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <div className="col gap4" style={{ width: 420 }}>
            <Cell label="₹121,500 · ₹72,000 · ₹31,500 — FILLS THE BAR">
              <Meter
                size="lg"
                label="August takings"
                segments={[
                  { tone: 'ok', value: 121_500 },
                  { tone: 'warn', value: 72_000 },
                  { tone: 'dim', value: 31_500 },
                ]}
              />
            </Cell>
            <Cell label="AN EXPLICIT TOTAL — THE GAP IS REAL">
              <Meter
                size="lg"
                label="Sessions delivered against the pack"
                total={12}
                segments={[{ tone: 'ok', value: 8, label: 'delivered' }]}
              />
            </Cell>
          </div>
        </Bench>
        <p className="blk__p">
          The second bar is short because four sessions of twelve are genuinely unspent. That is the one case
          where a bar that does not reach the end means something, and it is reachable only by naming the
          total.
        </p>
      </Blk>

      <Blk title="Sizes and tones">
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <div className="col gap4" style={{ width: 420 }}>
            <Cell label="LG · A CARD’S HEADLINE FIGURE">
              <Meter size="lg" label="Takings" segments={[{ tone: 'ok', value: 7 }, { tone: 'dim', value: 3 }]} />
            </Cell>
            <Cell label="MD · INSIDE A ROW">
              <Meter label="Takings" segments={[{ tone: 'ok', value: 7 }, { tone: 'dim', value: 3 }]} />
            </Cell>
            <Cell label="OK / WARN / DANGER / DIM">
              <Meter
                size="lg"
                label="Every tone"
                segments={[
                  { tone: 'ok', value: 1 },
                  { tone: 'warn', value: 1 },
                  { tone: 'danger', value: 1 },
                  { tone: 'dim', value: 1 },
                ]}
              />
            </Cell>
          </div>
        </Bench>
      </Blk>

      <Blk
        title="A bar alone says nothing"
        lede={
          <>
            <code>label</code> is required and becomes the accessible name, with each segment&rsquo;s share
            computed into it: <i>&ldquo;August takings: yours 54%, the gym&rsquo;s 32%, pending 14%&rdquo;</i>. A{' '}
            <code>role=&quot;img&quot;</code> with no name is three coloured rectangles.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '14px 16px' }}>
          <code style={{ fontSize: 12.5 }}>
            aria-label=&quot;August takings: yours 54%, the gym&rsquo;s 32%, pending 14%&quot;
          </code>
        </Bench>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Height', value: '6px', note: '10px at `lg`' },
            { property: 'Radius', value: 'full' },
            { property: 'Segments', value: '2–3', note: 'Four is a chart, and a chart has a legend' },
            { property: 'Tones', value: 'acc · ok · warn · danger · dim', note: '`acc` is the base fill — a magnitude, not a verdict' },
            { property: 'Input', value: 'raw amounts', note: 'Normalised here; call-sites never compute a percentage' },
            { property: 'Total', value: 'sum, or given', note: 'A given total larger than the sum leaves a real gap' },
            { property: 'Accessible name', value: <code>label</code>, note: 'Required. Shares are computed into it' },
            { property: 'describe', value: 'true', note: 'false where the segments are geometry and the label already says it all' },
            { property: 'Light-theme edge', value: '1px inset ring', note: '`acc` measures 1.03:1 on `--tx-surface-3`; app.css rings it in `--tx-accent-text`' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <div style={{ width: 300 }}>
                <Meter
                  size="lg"
                  label="August takings"
                  segments={[
                    { tone: 'ok', value: 121_500, label: 'yours' },
                    { tone: 'warn', value: 72_000, label: 'the gym’s' },
                  ]}
                />
              </div>
            ),
            caption: 'Two parts of one whole, in one bar. The comparison is the point, and it is made without a single number being read.',
          }}
          no={{
            figure: (
              <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Meter label="Yours" segments={[{ tone: 'ok', value: 1 }]} />
                <Meter label="The gym’s" segments={[{ tone: 'warn', value: 1 }]} />
              </div>
            ),
            caption:
              'Two full bars, stacked. Each is 100% of itself, so the one thing the reader wanted — the ratio between them — has been drawn out of the picture.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
