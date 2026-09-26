import { TrendChart, smooth } from '../../../ui/TrendChart';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/** A real bodyweight series: eight months of fat loss, weighed monthly, noisy. */
const WEIGHT = [88.4, 87.1, 87.9, 85.8, 86.3, 84.2, 84.9, 83.1, 82.4];
/** The same client's squat: monotonic, which is what makes strength motivating. */
const SQUAT = [40, 45, 47.5, 50, 52.5, 55, 57.5, 60, 62.5];
/** Six weeks of nothing moving. The case §3 says not to let read as failure. */
const FLAT = [79.8, 80.1, 79.9, 80.0, 79.9, 80.2, 80.0];

export function TrendChartEntry() {
  const entry = byId('c-trend')!;

  return (
    <Cmp
      entry={entry}
      status="beta"
      meta={[
        { k: 'Component', v: <code>ui/TrendChart.tsx</code> },
        { k: 'Class', v: <code>.trend</code> },
        { k: 'Input', v: 'raw readings, oldest first' },
        { k: 'Smoothing', v: 'centred mean, window 3' },
        { k: 'Sizes', v: <><code>md</code> 140px · <code>sm</code> 78px</> },
        { k: 'Used in', v: 'the client portal’s Progress, the client file’s Overview' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            Eight months of bodyweight, weighed monthly. The band is what was actually written down;
            the line is the mean of three. Only one of those two is a line, and that is the whole
            component.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Cell label="BODYWEIGHT · 88.4 → 82.4 KG" stretch>
            <div style={{ width: 420 }}>
              <TrendChart values={WEIGHT} label="Bodyweight" from="Jan" to="Sep" />
            </div>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="Two heights, and the small one is not a shrunk chart"
        lede={
          <>
            <code>md</code> is the 140px box a twelve-week trend is READ in — the chart is the
            content and the prose beside it is the caption. <code>sm</code> is 78px, for a chart
            that sits BESIDE the figure it qualifies: the client file&rsquo;s Overview leads with{' '}
            <code>57.1 kg → 56.4 kg</code> and the line under it is there to say whether that
            movement is a trend or a Tuesday.
            <br />
            <br />
            A prop and not a <code>className</code>, because the height is carried by{' '}
            <code>--trend-h</code> and a caller that wrote that custom property inline would be
            setting the component&rsquo;s geometry from outside it. 78px and not 60: the mark is a
            9px disc with a 2px ring, and under 70 a 1 kg swing and a 4 kg one land within three
            pixels of each other — the chart stops being a reading and becomes a decoration.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Cell label="MD · 140PX — THE CHART IS THE CONTENT" stretch>
            <div style={{ width: 420 }}>
              <TrendChart values={WEIGHT} label="Bodyweight" from="Jan" to="Sep" />
            </div>
          </Cell>
          <Cell label="SM · 78PX — THE CHART QUALIFIES A FIGURE" stretch>
            <div style={{ width: 420 }}>
              <TrendChart size="sm" values={WEIGHT} label="Bodyweight" from="Jan" to="Sep" />
            </div>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="It takes the RAW readings and cannot draw them as a line"
        lede={
          <>
            §3 of the client spec: <em>&ldquo;Show a smoothed trend line, not raw daily readings.
            Daily bodyweight swings 1–2kg on water alone, and showing that jagged line makes people
            feel they&rsquo;re failing when they aren&rsquo;t.&rdquo;</em>
            <br />
            <br />
            A component that took a pre-smoothed array would leave that rule at every call-site —
            the same mistake <code>Meter</code> fixed by taking amounts instead of percentages. The
            second screen to draw a weight chart would smooth it differently, or not at all, and the
            rule would have no home. So the raw series becomes <code>.trend__b</code>, a fill with no
            stroke, and there is no prop that makes it a line.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <div style={{ width: 230 }}>
                <TrendChart values={WEIGHT} label="Bodyweight" />
              </div>
            ),
            caption: (
              <>
                One line, falling. The band says the readings bounced and the line says the client is
                getting somewhere. Both are true and only one of them is the point.
              </>
            ),
          }}
          no={{
            figure: (
              <div style={{ width: 230 }} className="trend">
                <svg viewBox="0 0 320 130" width="100%" height={130} aria-hidden="true">
                  <g className="trend__g">
                    <line x1="0" y1="10" x2="320" y2="10" />
                    <line x1="0" y1="65" x2="320" y2="65" />
                    <line x1="0" y1="120" x2="320" y2="120" />
                  </g>
                  <path
                    className="trend__l"
                    d={WEIGHT.map((v, i) => {
                      const x = 10 + (i * 300) / (WEIGHT.length - 1);
                      const y = 120 - ((v - 82) / 6.4) * 110;
                      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
                    }).join(' ')}
                  />
                </svg>
              </div>
            ),
            caption: (
              <>
                The same eight readings as a raw line. It goes <em>up</em> twice, and a client on a
                good month reads two of those as having gone backwards.
              </>
            ),
          }}
        />
      </Blk>

      <Blk
        title="Flat is a series too"
        lede={
          <>
            Six weeks of a scale not moving has <code>hi === lo</code>, and dividing by that span puts
            every point at <code>NaN</code> — which renders as an empty <code>&lt;svg&gt;</code>: a
            blank box, on precisely the client §3 is worried about. A minimum span of 1 draws the line
            through the middle instead, and the accessible name says <em>level</em> rather than
            guessing a direction out of floating-point noise.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Cell label="FLAT · READS AS LEVEL, NOT AS MISSING" stretch>
            <div style={{ width: 300 }}>
              <TrendChart values={FLAT} label="Bodyweight" from="6 weeks ago" to="Today" />
            </div>
          </Cell>
          <Cell label="ONE READING · A CHART, NOT AN EMPTY STATE" stretch>
            <div style={{ width: 300 }}>
              <TrendChart values={[81.2]} label="Bodyweight" from="First weigh-in" to="" />
            </div>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="Hidden by choice is not the same as having no data"
        lede={
          <>
            §3 again: <em>&ldquo;Let clients hide the weight metric entirely if they prefer. Some are
            working on strength; some have a difficult relationship with the number.&rdquo;</em> That
            is a different state from <em>no readings</em>, and only one of the two has a way back —
            so <code>hidden</code> takes the message as a node rather than this component guessing at
            a verb.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Cell label="HIDDEN · THE CALLER SUPPLIES THE WAY BACK" stretch>
            <div style={{ width: 300 }}>
              <TrendChart
                values={WEIGHT}
                label="Bodyweight"
                hidden={
                  <p className="small ink3" style={{ textAlign: 'center', maxWidth: '30ch' }}>
                    Weight is hidden. You can turn it back on under <b>Me &rarr; My details</b>.
                  </p>
                }
              />
            </div>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="The stroke is --tx-accent-text, and the frame gets this wrong"
        lede={
          <>
            <code>webapp-client-portal.html</code> draws its chart as{' '}
            <code>stroke=&quot;var(--tx-accent)&quot;</code>, which is the stylesheet&rsquo;s opening
            rule broken: <b>#C6F24E is a FILL, never a stroke and never text on a light ground.</b>{' '}
            It measures ~1.35:1 on the light canvas, so that polyline is invisible on the theme half
            the product ships in — the same defect <code>.ntf__dot</code> had. The class strokes{' '}
            <code>--tx-accent-text</code>, which steps to <code>#4F6B0A</code> on light. The band and
            the last-point dot keep the lime, because those are fills.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Cell label="THE SQUAT · SAME COMPONENT, MONOTONIC SERIES" stretch>
            <div style={{ width: 420 }}>
              <TrendChart values={SQUAT} label="Squat top set" from="Jan · 40 kg" to="Sep · 62.5 kg" />
            </div>
          </Cell>
        </Bench>
        <p className="blk__p">
          Toggle the library to light and the line holds. Drawn with the frame&rsquo;s own token it
          disappears.
        </p>
      </Blk>

      <Blk
        title="`smooth` is exported, and the sentence beside the chart uses it"
        lede={
          <>
            &ldquo;Squat 40kg &rarr; 62.5kg&rdquo; has to agree with where the line starts and ends. A
            screen reading the raw first and last values while the chart reads the smoothed ones
            prints two different stories about one series, so the helper is exported rather than
            private. Window 3 and not 7: these readings are monthly, and a seven-point window on a
            monthly series is a half-year lag.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Cell label="RAW → SMOOTHED, FIRST AND LAST" stretch>
            <table className="tbl" style={{ width: 320 }}>
              <thead>
                <tr>
                  <th />
                  <th className="num">Raw</th>
                  <th className="num">Smoothed</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="strong">First</td>
                  <td className="num">{WEIGHT[0].toFixed(1)}</td>
                  <td className="num">{smooth(WEIGHT)[0].toFixed(1)}</td>
                </tr>
                <tr>
                  <td className="strong">Last</td>
                  <td className="num">{WEIGHT[WEIGHT.length - 1].toFixed(1)}</td>
                  <td className="num">{smooth(WEIGHT)[WEIGHT.length - 1].toFixed(1)}</td>
                </tr>
              </tbody>
            </table>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="The axis is off, and the exception is a chart somebody reads a value off"
        lede={
          <>
            <code>yAxis</code> labels the three grid lines with the top of the range, its middle and its
            bottom. It is off by default because on most call-sites the figures are already beside the chart
            &mdash; the portal&rsquo;s tape cards print the latest reading in the head and the delta under it,
            and a client reading <i>am I changing shape</i> is being asked to read a SHAPE. Three figures down
            the left of a 78px chart there are furniture.
          </>
        }
      >
        <Bench>
          <div className="row gap4" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <TrendChart
                values={[63.1, 63.7, 65.1, 66.5]}
                label="Body weight, with an axis"
                from="13 Mar"
                to="28 Aug"
                yAxis
                unit="kg"
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <TrendChart
                values={[63.1, 63.7, 65.1, 66.5]}
                label="Body weight, without"
                from="13 Mar"
                to="28 Aug"
              />
            </div>
          </div>
        </Bench>
        <p className="blk__p">
          There are exactly THREE ticks because there are exactly three grid lines. A fourth would need a
          fourth line, and this component&rsquo;s own opening rule is that anything wanting more than three
          lines, a band, a line and a dot wants a real chart and a different argument. The axis is a flex
          SIBLING of the plot rather than padding on it: <code>.trend__p</code>, the mark on the latest
          reading, is absolutely positioned inside <code>.trend__plot</code>, and a percentage there resolves
          against the padding box &mdash; so padding to make room for the labels moves the dot and not the
          line it marks.
        </p>
      </Blk>

      <Blk title="Specifications" tag="tokens">
        <SpecTable
          rows={[
            { property: 'Viewport', value: '320 × 130, non-scaling', note: 'preserveAspectRatio="none" — it stretches to the column and the stroke does not.' },
            { property: 'Grid', value: '3 lines, 1px', token: '--tx-line' },
            { property: 'yAxis', value: 'off', note: 'On, the three grid lines are labelled. A sibling column, never padding on the plot.' },
            { property: 'unit', value: '—', note: 'Said in the accessible name, never drawn on a tick.' },
            { property: 'Band', value: 'fill, no stroke', token: '--tx-accent-soft', note: 'The raw envelope. A fill, so the lime is allowed.' },
            { property: 'Line', value: '2.5px stroke', token: '--tx-accent-text', note: 'NOT --tx-accent. See above.' },
            { property: 'Last point', value: 'r=4 disc, 2px ring', token: '--tx-accent / --tx-surface', note: 'Ringed in the card’s ground so it sits on the line.' },
            { property: 'Min span', value: '1 unit', note: 'The flat-series guard. Without it a level client gets an empty box.' },
            { property: 'Smoothing', value: 'centred mean, w=3, edges held', note: 'Exported as `smooth` so the prose beside the chart agrees with it.' },
          ]}
        />
      </Blk>
    </Cmp>
  );
}
