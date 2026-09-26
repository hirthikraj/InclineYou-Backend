import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

import { ScaleEmpty, ScaleEnds, ScaleTen, ScaleThree } from './ScaleSpecimen';

export function ScaleEntry() {
  const entry = byId('c-scale')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Scale.tsx</code> },
        { k: 'Class', v: <code>.scale</code> },
        { k: 'Point', v: '44px tall' },
        { k: 'Scales', v: '5 · 10 · 20' },
        { k: 'Element', v: <code>label + radio</code> },
      ]}
    >
      <Blk
        title="Specimen"
        lede="The whole range at once, every point a target. Tab in once and arrow along it — the numbers are real radios, hidden behind the plates."
      >
        <Bench>
          <div style={{ width: 420 }}>
            <ScaleTen />
          </div>
        </Bench>
      </Blk>

      <Blk
        title="Three scales, and the model allows no fourth"
        lede={
          <>
            5, 10 or 20. A scale is only comparable against itself, so the value a trainer picks is one they
            are choosing for the next year of that client&rsquo;s check-ins &mdash; offering 1&ndash;100 invites
            a number nobody can hold in their head and no two clients read the same way. At twenty the row{' '}
            <b>wraps</b> rather than scrolling: a horizontal scroller hides the top of the scale, which is the
            end somebody is most likely to want.
          </>
        }
      >
        <Bench>
          <ScaleThree />
        </Bench>
      </Blk>

      <Blk
        title="Not a slider, and that is the whole argument"
        lede={
          <>
            A <code>range</code> input is for a continuum somebody is aiming at. This is a <b>label</b>: the
            answer is <i>seven</i>, and the only thing to do is say it. Dragging to a value you knew before
            you touched the screen is work the question did not ask for, the handle is the smallest target on
            the page, and the result is never quite certain &mdash; which defeats the one property a fixed
            scale exists for.
          </>
        }
      >
        <Bench style={{ gap: 26, alignItems: 'flex-start' }}>
          <Cell label="THIS COMPONENT · ONE TAP">
            <div style={{ width: 300 }}>
              <ScaleEmpty />
            </div>
          </Cell>
          <Cell label="A SLIDER · DRAG AND HOPE">
            <input type="range" min={1} max={10} defaultValue={5} style={{ width: 300 }} aria-label="Don’t" />
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="The ends are the caller’s words, and usually there are none"
        lede={
          <>
            <code>low</code> and <code>high</code> caption the two ends. This product passes neither, which is
            deliberate rather than unfinished: the question bank holds no anchor text, every rating question
            in it is phrased <i>how well</i> or <i>how would you rate</i>, and inventing a pair at the
            call-site puts words in the trainer&rsquo;s mouth that the chart then treats as part of the
            question. A screen that <b>has</b> them should pass them; none should make them up.
          </>
        }
      >
        <Bench>
          <div style={{ width: 420 }}>
            <ScaleEnds />
          </div>
        </Bench>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Point', value: '34 × 44 min', note: 'Grows to fill the row evenly' },
            { property: 'Gap', value: '6px' },
            { property: 'Radius', value: '8px', token: '--tx-r2' },
            { property: 'Figure', value: '14px mono', token: '--tx-mono', note: 'Tabular — a row of digits' },
            { property: 'Chosen', value: '#C6F24E plate', token: '--tx-accent' },
            { property: 'Chosen ink', value: '15.2:1', token: '--tx-accent-ink', note: 'Never the inherited ink' },
            { property: 'Element', value: <code>&lt;input type=&quot;radio&quot;&gt;</code>, note: 'Clipped with .vh, not hidden' },
            { property: 'Spoken', value: '“7 of 10”', note: 'A bare 7 is a figure with no range' },
            { property: 'Wrap', value: 'at 20', note: 'Two rows of ten, never nineteen and a stray' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <div style={{ width: 300 }}>
                <ScaleTen />
              </div>
            ),
            caption:
              'Every point on the screen at once. One tap answers it, one tab stop reaches it, and the chosen number is the only accent on the question.',
          }}
          no={{
            figure: (
              <select className="ctl" defaultValue="7" aria-label="Don’t" style={{ width: 120 }}>
                {Array.from({ length: 10 }, (_, i) => (
                  <option key={i + 1}>{i + 1}</option>
                ))}
              </select>
            ),
            caption:
              'A select. It hides nine of the ten answers behind a press, and a native option list is a bad place to put a scale somebody is comparing across.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
