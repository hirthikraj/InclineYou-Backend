import { Card, CardBody, CardHead } from '../../../ui/Card';
import { Change } from '../../../ui/Change';
import { Stat, Stats } from '../../../ui/Stat';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

export function ChangeEntry() {
  const entry = byId('c-change')!;

  return (
    <Cmp
      entry={entry}
      status="beta"
      meta={[
        { k: 'Component', v: <code>ui/Change.tsx</code> },
        { k: 'Class', v: <code>.chg</code> },
        { k: 'Sizes', v: '2 — md · lg' },
        { k: 'Tones', v: 'none on the figure' },
        { k: 'Used in', v: 'the client portal’s Progress' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            §3 of the client spec opens with one instruction — <em>&ldquo;Show change, not
            data&rdquo;</em> — which makes this the portal&rsquo;s most-repeated shape. Two sizes:
            17px for a line in a list of them, 19px for a card&rsquo;s own headline, where the
            label is the card head instead. <code>unit</code> is passed BARE — the gap between a
            figure and its unit is <code>.chg__u</code>&rsquo;s, at <code>0.18em</code>, so it
            scales with the size and no caller can space it differently.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Cell label="A CARD HEADLINE · lg · WITH A STRENGTH DELTA" stretch>
            <div style={{ width: '100%', maxWidth: 420 }}>
              <Card>
                <CardHead title="Overhead Press" />
                <CardBody>
                  <Change size="lg" from={25} to={27.5} unit="kg" delta="up 2.5 kg" />
                </CardBody>
              </Card>
            </div>
          </Cell>
          <Cell label="A SUMMARY, SIX LINES · md · LABELLED, NO DELTAS" stretch>
            <div style={{ width: '100%', maxWidth: 420 }}>
              <Card>
                <CardBody>
                  <div className="col gap2">
                    <Change label="Overhead Press" from={25} to={27.5} unit="kg" />
                    <Change label="Barbell Bench Press" from={40} to={42.5} unit="kg" />
                    <Change label="Chest" from={98.5} to={102.3} unit="cm" />
                    <Change label="Arms" from={33.4} to={35} unit="cm" />
                    <Change label="Weight" from={82} to={81.3} unit="kg" />
                  </div>
                </CardBody>
              </Card>
            </div>
          </Cell>
        </Bench>
        <p className="blk__p">
          The figures are <code>tabular-nums</code>, so <code>98.5</code> and <code>102.3</code> are
          the same width per digit and the arrow sits the same distance from both sides of{' '}
          <em>one</em> line. It does <b>not</b> align the arrows down a STACK — the label comes
          first and <code>Barbell Bench Press</code> is 167px against <code>Chest</code>&rsquo;s 49
          — and a <code>min-width</code> wide enough to fix that would be 118px of dead space on
          every short row. Measured and left: the labels are the ragged edge, which is what a list
          of different things should look like.
        </p>
      </Blk>

      <Blk
        title="One spelling, and that is the whole reason it exists"
        lede={
          <>
            Progress drew this shape <b>four times with nothing underneath it</b>, and two of the
            four disagreed: <code>buildSummary</code> wrote{' '}
            <code>{'${g.from}kg → ${g.to}kg'}</code> while the card below it wrote{' '}
            <code>{'{g.from} kg → {g.to} kg'}</code>. So the same change was spelled two ways{' '}
            <b>300px apart on one screen</b>. Neither is wrong, and a reader has no way to know
            that — one figure in two typographies reads as two figures.
            <br />
            <br />
            The disagreement lived in the <b>string</b>, so no amount of CSS could have caught it.
            That is why the model returns the PARTS now and this component is the only thing in the
            product that formats them.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <div className="col gap2" style={{ width: '100%' }}>
                <Change label="Overhead Press" from={25} to={27.5} unit="kg" />
                <Change size="lg" from={25} to={27.5} unit="kg" delta="up 2.5 kg" />
              </div>
            ),
            caption: (
              <>
                The claim and its proof, at two sizes and in <b>one</b> spelling. Only the size and
                the delta differ, which is the difference that was meant.
              </>
            ),
          }}
          no={{
            figure: (
              <div className="col gap2" style={{ width: '100%' }}>
                <p className="h4" style={{ fontSize: 17 }}>
                  Overhead Press 25kg &rarr; 27.5kg
                </p>
                <p className="h4" style={{ fontSize: 19 }}>
                  25 kg &rarr; 27.5 kg
                  <span className="acc" style={{ fontSize: 15, marginLeft: 8 }}>
                    up 2.5 kg
                  </span>
                </p>
              </div>
            ),
            caption: (
              <>
                The markup Progress used to carry: two <code>.h4</code>s, three inline font sizes,
                and the unit spaced one way above and the other way below.
              </>
            ),
          }}
        />
      </Blk>

      <Blk
        title="No tone on the figure, and Stat’s delta is the near miss"
        lede={
          <>
            There is no <code>direction</code> and no <code>good</code>. <code>c-stat</code>&rsquo;s{' '}
            <code>delta</code> has both and <em>argues</em> for both — an arrow for which way the
            number moved and a tone for whether that is welcome, because on a trainer&rsquo;s
            dashboard &ldquo;up&rdquo; is not always good. That is the right prop for that surface.
            <br />
            <br />
            This is a client reading a number about their own body, and{' '}
            <code>WEIGHT_HAS_NO_TONE</code> is the rule: <b>down is not good, up is not bad</b>, and
            a waist growing on somebody putting on muscle is the plan working. This product holds no
            field that tells the two apart — <code>client.goal</code> is the trainer&rsquo;s free
            text. So the figure is plain ink at every size, and the accent is available only on the
            separate <code>delta</code> clause, which <code>Progress</code> passes for a{' '}
            <b>strength gain and nothing else</b>.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Cell label="THE SANCTIONED ACCENT · A STRENGTH GAIN" stretch>
            <div style={{ width: '100%', maxWidth: 300 }}>
              <Change size="lg" from={25} to={27.5} unit="kg" delta="up 2.5 kg" />
            </div>
          </Cell>
          <Cell label="AND WEIGHT, WHICH TAKES NO DELTA AT ALL" stretch>
            <div style={{ width: '100%', maxWidth: 300 }}>
              <Change size="lg" from={82} to={81.3} unit="kg" />
            </div>
          </Cell>
          <Cell label="FOR CONTRAST · WHAT c-stat IS FOR" stretch>
            <div style={{ width: '100%', maxWidth: 300 }}>
              <Stats up={2}>
                <Stat
                  label="Billed"
                  value="₹1,06,500"
                  delta={{ text: '8% on July', direction: 'up', good: true }}
                />
                <Stat
                  label="The gym’s share"
                  value="₹49,000"
                  tone="warn"
                  delta={{ text: '4% on July', direction: 'up', good: false }}
                />
              </Stats>
            </div>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="Three sizes, and the third is for a change that IS the card"
        lede={
          <>
            17px is a line in a list and 19px is a card&rsquo;s headline &mdash; both are a change{' '}
            <i>about</i> the card&rsquo;s subject. <code>xl</code> is for the inversion: a card whose whole
            content is what one number did between two dates, with the chart under the figure rather than a
            figure beside the chart. It is <code>--tx-fig-sm</code>, the same size <code>c-figures</code> sets
            a stat row in, so it lands on the scale the system already has and steps 30 &rarr; 26px on a
            narrow viewport with the rest of it.
          </>
        }
      >
        <Bench>
          <div className="col gap3">
            <Change from={65.1} to={66.5} unit="kg" />
            <Change size="lg" from={65.1} to={66.5} unit="kg" />
            <Change size="xl" from={65.1} to={66.5} unit="kg" />
          </div>
        </Bench>
        <p className="blk__p">
          The UNIT steps down at <code>xl</code> and at neither of the other two: at 17 or 19px{' '}
          <code>kg</code> beside the figure is the same word at the same weight, and at 30 it is a second
          figure. Half an em, so it moves with whatever the scale does. <code>xl</code> is also the one size
          whose figure may WRAP &mdash; between the two numbers, never inside one, because each is its digits
          and its unit with no space between them.
        </p>
      </Blk>

      <Blk
        title="A first reading is not a change"
        lede={
          <>
            <code>from</code> is nullable, and passing <code>null</code> draws the figure by itself with no
            arrow and no clipped <i>to</i>. It is for the case every screen that draws a change eventually
            meets &mdash; a client&rsquo;s first check-in, the first time a tape goes round a new site, a lift
            logged once &mdash; where <code>72.2 &rarr; 72.2</code> would be a claim about a movement nobody
            measured.
          </>
        }
      >
        <Bench>
          <div className="col gap3" style={{ width: 300 }}>
            <Change label="Body weight" from={73.3} to={72.2} unit="kg" size="lg" />
            <Change label="Waist, first reading" from={null} to={87.1} unit="cm" size="lg" />
          </div>
        </Bench>
        <p className="blk__p">
          The prop is owed rather than offered: the assessment screen hand-wrote a <code>.chg</code> paragraph
          of its own for this state, and <code>check-components</code> caught it. Every screen with a first
          reading in it would have written that paragraph again.
        </p>
      </Blk>

      <Blk
        title="The arrow is not read aloud"
        lede={
          <>
            A <code>&rarr;</code> between two numbers is announced as &ldquo;right arrow&rdquo; or as
            nothing at all, so the glyph is <code>aria-hidden</code> and the component supplies the
            word: a reader gets <em>&ldquo;25 kg to 27.5 kg&rdquo;</em>. It is a clipped{' '}
            <code>.vh</code> span rather than an <code>aria-label</code> on the figure, because a
            label would REPLACE the numbers to gain the word between them.
          </>
        }
      >
        <SpecTable
          rows={[
            { property: 'from', token: 'number | null', value: 'required', note: 'Null draws the figure alone — a first reading is not a change.' },
            { property: 'to', token: 'number', value: 'required', note: 'Drawn after `from`. Nothing here compares them.' },
            { property: 'unit', token: 'string', value: 'required', note: 'Rendered against BOTH figures — one spelling, always.' },
            { property: 'label', token: 'string', value: '—', note: 'What changed. Absent where the card head already says it.' },
            { property: 'delta', token: 'string', value: '—', note: 'The one accent. Strength only — see above.' },
            { property: 'size', token: 'md | lg | xl', value: 'md', note: '17px in a list, 19px as a card’s headline, `--tx-fig-sm` where the change IS the card.' },
          ]}
        />
      </Blk>
    </Cmp>
  );
}
