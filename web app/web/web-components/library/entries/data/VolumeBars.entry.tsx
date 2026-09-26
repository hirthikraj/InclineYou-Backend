import { VolumeBars, type VolumeWeek } from '../../../ui/VolumeBars';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

const inr = (n: number) => n.toLocaleString('en-IN');

const MONDAYS = ['4 Aug', '11 Aug', '18 Aug', '25 Aug', '1 Sep', '8 Sep', '15 Sep'];

/** Priya Pillai's seven weeks, as the client file draws them. */
const REAL = [12543, 5210, 12680, 5340, 13080, 7740, 13375];

/** The same client with a fortnight off in the middle. Both weeks keep a bar. */
const GAP = [12543, 5210, 0, 0, 13080, 7740, 13375];

const series = (values: number[]): VolumeWeek[] => {
  const peak = Math.max(...values, 1);
  return values.map((value, i) => ({
    label: `w${i + 1}`,
    value,
    fraction: value / peak,
    current: i === values.length - 1,
    when: MONDAYS[i],
  }));
};

export function VolumeBarsEntry() {
  const entry = byId('c-vbars')!;

  return (
    <Cmp
      entry={entry}
      status="beta"
      meta={[
        { k: 'Component', v: <code>ui/VolumeBars.tsx</code> },
        { k: 'Class', v: <code>.vb</code> },
        { k: 'Baseline', v: 'zero, always' },
        { k: 'Axis', v: '3 ticks — peak, half, zero' },
        { k: 'Readout', v: 'first + last pinned, the rest on hover' },
        { k: 'Used in', v: 'the client file’s Progress tab' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            Seven weeks of one client&rsquo;s work, in kilos moved. Volume is a <b>sum</b>, which is
            the whole licence for this shape: a bar from zero tells the truth about a total and
            about nothing else. A load is not a sum and never gets drawn this way &mdash;{' '}
            <code>.seq</code> writes a top set out as the numbers it actually is, for the reason{' '}
            <code>c-trend</code>&rsquo;s own docstring gives.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Cell label="SEVEN WEEKS · 13,375 KG IN THE LATEST" stretch>
            <div style={{ width: 620 }}>
              <VolumeBars
                label="Volume per week"
                unit="kg"
                format={inr}
                weeks={series(REAL)}
                note={
                  <>
                    <b>Bars, from zero.</b> A week with nothing in it keeps its bar. Point at one to
                    read it.
                  </>
                }
              />
            </div>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="Every bar is readable, and that is what the component was made for"
        lede={
          <>
            The markup this replaces printed a figure on the FIRST bar and on the CURRENT one and
            on no others. MEASURED at 1536&times;695 on the client file&rsquo;s Progress tab: two of
            seven bars carried a number, so week four could be read as <i>taller than that one</i>{' '}
            and as nothing else &mdash; and the caption under it is <code>w4</code>, which is an
            index and not a time, so a trainer could not say <i>when</i> either.
            <br />
            <br />
            Three answers, and none of them is a fourth figure printed on the chart at rest. The{' '}
            <b>axis</b> labels the peak, the half and the floor, so a bar chart from zero is fully
            scaled and every other column reads off it by eye. The two interior <b>grid lines</b>{' '}
            are a background on <code>.vb__cols</code> rather than overlaid elements &mdash; a
            positioned grid over a flex row is one more box to keep in register with the bars. And
            the <b>readout</b> is on every bar, hidden until the pointer is on it, with the
            week&rsquo;s Monday under the figure.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <div style={{ width: 280 }}>
                <VolumeBars label="Volume per week" unit="kg" format={inr} weeks={series(REAL)} />
              </div>
            ),
            caption: (
              <>
                Scaled. <i>Week 6 was about 7,700</i> is a reading anyone can take off this without
                touching it.
              </>
            ),
          }}
          no={{
            figure: (
              <div style={{ width: 280 }} className="vb">
                <div className="vb__row">
                  <div className="vb__plot">
                    <div className="vb__cols" style={{ backgroundImage: 'none' }}>
                      {REAL.map((v, i) => (
                        <i
                          key={i}
                          className={`vb__c${i === REAL.length - 1 ? ' vb__c--on' : ''}${
                            i === 0 || i === REAL.length - 1 ? ' vb__c--pin' : ''
                          }`}
                          style={{ height: `${Math.round((v / 13375) * 100)}%` }}
                        >
                          <b>{inr(v)}</b>
                        </i>
                      ))}
                    </div>
                    <div className="vb__x">
                      {REAL.map((_, i) => (
                        <span key={i}>w{i + 1}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ),
            caption: (
              <>
                No axis and no rules. Two numbers, five shapes, and no way to turn one of the five
                into a figure.
              </>
            ),
          }}
        />
      </Blk>

      <Blk
        title="An empty week keeps its bar"
        lede={
          <>
            A gap that closes up is a gap that never happened, and the fortnight a client took off
            is the single most useful thing on this chart. So a zero week renders as a 2px tick on
            the baseline &mdash; <code>Math.max(1, …)</code> in the component, deliberately, because
            a zero-height element is a week that <i>vanished</i> rather than a week with nothing in
            it. The caller supplies every week between the first and the last; this component does
            not invent one.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Cell label="TWO WEEKS OFF · THE SPINE IS STILL SEVEN WIDE" stretch>
            <div style={{ width: 520 }}>
              <VolumeBars label="Volume per week" unit="kg" format={inr} weeks={series(GAP)} />
            </div>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="The accessible reading is the series, not the picture"
        lede={
          <>
            <code>role=&quot;img&quot;</code> with the span, the peak and the latest week in words
            &mdash; the same call <code>c-trend</code> makes. The columns under it are decoration
            once that sentence exists: a reader stepping through seven <code>&lt;i&gt;</code>{' '}
            elements learns nothing the sentence did not already say, and the hover readout is
            unreachable to them anyway. On a phone there is no pointer either, which is why the
            axis is the one part that never stands down.
          </>
        }
      >
        <Bench>
          <p className="small ink3" style={{ maxWidth: '62ch' }}>
            <code>
              Volume per week: 7 weeks, peak 13,375 kg, latest 13,375 kg.
            </code>
          </p>
        </Bench>
      </Blk>

      <Blk title="Specifications" tag="tokens">
        <SpecTable
          rows={[
            { property: 'Plot height', value: '190px · 150 under 620', token: '--vb-h' },
            { property: 'Baseline', value: '1px rule', token: '--tx-line-strong', note: 'The zero. Never anything but zero — §09 forbids a non-zero baseline outright.' },
            { property: 'Grid', value: '2 interior lines, 1px', token: '--tx-line', note: 'A background gradient on .vb__cols, not overlaid elements.' },
            { property: 'Axis', value: '3 ticks · peak, half, zero', token: '--tx-ink-3', note: 'The arithmetic half, not the median week — the axis describes the box.' },
            { property: 'Bar', value: 'fill + 1px inset ring', token: '--tx-ink-3 34% / 70%', note: 'MEASURED: surface-3 alone is 1.19:1 on dark and 1.05 on light, and no grey in the scale reaches 3. The ring carries it — 3.3:1 on both.' },
            { property: 'Bar · hover', value: 'fill lifts to 52%', token: '--tx-ink-3', note: '120ms. The readout appears with it.' },
            { property: 'Bar · current', value: 'accent fill', token: '--tx-accent', note: 'A fill, so the lime is allowed. One per series.' },
            { property: 'Empty week', value: 'min-height 2px', note: 'It kept its bar. A zero-height element is a week that vanished.' },
            { property: 'Readout', value: '11px mono over the bar', token: '--tx-mono', note: 'Pinned on the FIRST and the LAST; on hover for the rest. Not on `current` — a client who last trained a fortnight ago has no current week in the series.' },
            { property: 'Gap', value: '6px · 3 under 620', note: '26 weeks in a 342px card is under 7px a column at the desk gap.' },
          ]}
        />
      </Blk>
    </Cmp>
  );
}
