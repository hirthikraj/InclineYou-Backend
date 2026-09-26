'use client';

import { useState } from 'react';

import { ArrowDown, WarnIcon } from '@/components/programs/Icons';

import { BalanceStrip } from '../../../ui/BalanceStrip';

import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/**
 * Balance strip — the fold of a panel that will not fit.
 *
 * ── WHY IT IS IN THE CATALOGUE AT ALL ───────────────────────────────────────
 *
 * It is not one of the design file's forty-seven. It was built in the program
 * builder, against a measured failure, and registering it here is the point of
 * the exercise: a pattern that solves a general problem and lives at one
 * call-site is a pattern the next screen will build again, differently.
 *
 * The strip below is `ui/BalanceStrip.tsx` — the SAME import `BalancePanel`
 * renders, so this page cannot drift from what a trainer sees. Verified at the
 * swap: the rendered DOM on `/programs/tpl_001` is byte-identical before and
 * after, `437a1f35:788`.
 *
 * The opened panel's tracks below are still hand-mirrored markup, because the
 * chart is `BalancePanel`'s own and only the strip was extracted. They are
 * marked as such where they are drawn.
 */
export function BalanceStripEntry() {
  const entry = byId('c-balancestrip')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/BalanceStrip.tsx</code> },
        { k: 'Class', v: <code>.wsbal__sum</code> },
        { k: 'Element', v: <code>&lt;button aria-expanded&gt;</code> },
        { k: 'Appears', v: 'only when the panel does not fit' },
        { k: 'Height', v: '40px' },
        { k: 'Used in', v: 'the program builder' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            One line that answers <i>is anything out of band</i> before the week is read, and opens the full
            panel if the answer needs looking at. The wrapper below is <code>.wsplane</code>, which is what
            declares the container the strip is conditional on &mdash; without it the strip is{' '}
            <code>display:none</code> and this page would render an empty bench.
            <br />
            <br />
            Its <b>860px cap is the specimen</b>, not styling. The strip exists only inside{' '}
            <code>@container ws (max-width:900px)</code>, so a plane left to fill this column measures 1079px
            here and the component correctly vanishes — which is right, and is why the width is declared.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px', display: 'block' }}>
          <div className="wsplane" style={{ maxWidth: 860 }}>
            <div className="col gap4">
              <Cell label="OVER THE CEILING — AMBER, AND THE GROUPS ARE NAMED, NOT COUNTED" stretch>
                <Live total={96} over={['Back', 'Chest']} />
              </Cell>

              <Cell label="UNDER THE FLOOR — A GAP, NOT A HAZARD. NEUTRAL INK, AND IT POINTS DOWN" stretch>
                <Live total={22} under={['Chest', 'Back', 'Legs', 'Mobility']} />
              </Cell>

              <Cell label="BOTH AT ONCE — OVER IS READ FIRST, BECAUSE IT IS THE URGENT ONE" stretch>
                <Live total={64} over={['Back']} under={['Core']} />
              </Cell>

              <Cell label="NINE TIMES IN TEN — AND IT STILL SAYS THE WEEK'S SIZE" stretch>
                <Live total={84} />
              </Cell>

              <Cell label="ONE OF EACH — THE SINGULARS ARE THE COMPONENT'S" stretch>
                <Live total={1} over={['Chest']} />
              </Cell>
            </div>
          </div>
        </Bench>
      </Blk>

      <Blk
        title="A fold, not a smaller chart"
        lede={
          <>
            The panel it stands in for is a six-track bar chart in a 280px rail. Side by side with the board it
            needs <code>900 + 248 + 400 = 1548px</code> of viewport, so at 1280, 1366, 1440 <i>and</i> 1512 it
            was pushed below the board &mdash; measured at <b>y=993</b>. A trainer opening a program on a
            laptop got a bar chart and 700px of scrolling before exercise one: the panel took the screen away
            from the thing it is a comment on.
            <br />
            <br />
            Shrinking the chart would have kept all six tracks and made none of them readable. Folding keeps
            the <i>answer</i> at full size and puts the evidence one click away, which is the trade a
            disclosure is for. <code>[data-open]</code> is consumed only in the narrow state, so one instance
            of the panel serves both widths and the attribute is inert where the chart already fits.
          </>
        }
      />

      <Blk
        title="The band is two ticks, not a wash"
        lede={
          <>
            Inside the opened panel each track marks the acceptable range. It was a filled wash, and measured
            it was <b>1.09:1</b> against its own track in dark and <b>1.16:1</b> in light &mdash; WCAG 1.4.11
            asks 3:1 of a graphical object you have to read. Worse, the fill painted straight over it, so the
            marker vanished at exactly the moment a bar reached the range it marks.
            <br />
            <br />
            Two ticks instead, drawn <i>above</i> the fill and protruding 3px onto the panel surface so they
            survive it &mdash; <code>--tx-ink-2</code>, <b>7.92:1</b>.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px', display: 'block' }}>
          <div className="wsbal" style={{ maxWidth: 300 }}>
            <div className="wsbal__body">
              <div className="wsbal__r">
                <span className="wsbal__l">Quads</span>
                <span className="wsbal__v">14</span>
                <span className="wsbal__t">
                  <span className="wsbal__band" />
                  <span className="wsbal__f" style={{ width: '47%' }} />
                </span>
                <span className="wsbal__w" hidden />
              </div>
              <div className="wsbal__r wsbal__r--out wsbal__r--low">
                <span className="wsbal__l">Chest</span>
                <span className="wsbal__v">7</span>
                <span className="wsbal__t">
                  <span className="wsbal__band" />
                  <span className="wsbal__f" style={{ width: '23%' }} />
                </span>
                <span
                  className="wsbal__w"
                  role="img"
                  aria-label="Chest is 7 sets — under the 10-set minimum effective volume."
                >
                  <ArrowDown size={13} />
                </span>
              </div>
              <div className="wsbal__r wsbal__r--out wsbal__r--high">
                <span className="wsbal__l">Back</span>
                <span className="wsbal__v">22</span>
                <span className="wsbal__t">
                  <span className="wsbal__band" />
                  <span className="wsbal__f" style={{ width: '73%' }} />
                </span>
                <span
                  className="wsbal__w"
                  role="img"
                  aria-label="Back is 22 sets — above the 20-set adaptive ceiling."
                >
                  <WarnIcon size={13} />
                </span>
              </div>
            </div>
          </div>
        </Bench>
        <p className="blk__p">
          Under and over are <i>different mistakes</i> and take different marks &mdash; an arrow down for
          <b> too little</b>, the warning triangle for <b>too much</b>. One triangle on both said only
          &ldquo;this row is wrong&rdquo;, which is the half of the sentence the trainer already had from the
          bar.
        </p>
      </Blk>

      <Blk
        title="A band is read as a range, never as a target"
        lede={
          <>
            <code>MEV = 10</code> and <code>MAV = 20</code> are landmarks, not a prescription: they move with
            the individual, the exercise selection and the phase of the block. So a flag is an invitation to
            look, and the strip says <i>2 flags &middot; Back, Chest</i> rather than <i>2 problems</i>. The
            groups are named because <i>two groups are out of band</i> is a number the trainer would otherwise
            resolve against six tracks by hand; the names ellipsize by CSS when the rail is too narrow, and
            are never truncated in JS.
          </>
        }
      />

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Height', value: '40px', note: 'Replaces a panel measured at 573px wide' },
            {
              property: 'Appears',
              value: <code>@container ws (max-width:900px)</code>,
              note: 'And whenever the library dock is open, which narrows the rail',
            },
            {
              property: 'Selector',
              value: <code>.wsbal &gt; .wsbal__sum</code>,
              token: '—',
              note: 'The child combinator is load-bearing: @container adds no specificity, so a bare class loses to the base display:none later in the file',
            },
            { property: 'Disclosure', value: <code>[data-open]</code>, note: 'Inert at widths where the chart fits' },
            { property: 'Band ticks', value: '1px, +3px bleed', token: '--tx-ink-2', note: '7.92:1' },
            { property: 'Fill, in band', value: 'solid', token: '--tx-ink-3', note: '5.08:1' },
            { property: 'Flag names', value: 'ellipsis', note: 'Hidden entirely once the rail is at its narrowest' },
            {
              property: 'Accessible name',
              value: <code>aria-expanded</code> ,
              note: 'It is a disclosure button, not a status line with a chevron drawn on it',
            },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <div className="wsplane" style={{ width: 300 }}>
                <Live total={96} over={['Back', 'Chest']} />
              </div>
            ),
            caption:
              'The answer at full size, the evidence one click away. The strip is legible at the width that made the panel illegible.',
          }}
          no={{
            figure: (
              <div className="wsbal" style={{ width: 300, transform: 'scale(.55)', transformOrigin: 'left top' }}>
                <div className="wsbal__body">
                  {['Quads', 'Chest', 'Back', 'Hamstrings'].map((g, i) => (
                    <div className="wsbal__r" key={g}>
                      <span className="wsbal__l">{g}</span>
                      <span className="wsbal__v">{[14, 7, 22, 11][i]}</span>
                      <span className="wsbal__t">
                        <span className="wsbal__band" />
                        <span className="wsbal__f" style={{ width: ['47%', '23%', '73%', '37%'][i] }} />
                      </span>
                      <span className="wsbal__w" hidden />
                    </div>
                  ))}
                </div>
              </div>
            ),
            caption:
              'The same chart, scaled to fit. Every track survives and not one of them can be read — which is the panel failing quietly instead of folding honestly.',
          }}
        />
      </Blk>
    </Cmp>
  );
}

/**
 * The strip is a DISCLOSURE, so a specimen that cannot be pressed is showing
 * half of it. This holds the open state and a body for `aria-controls` to
 * resolve against — an `aria-controls` pointing at nothing is the kind of thing
 * a library page is supposed to catch rather than demonstrate.
 */
function Live({
  total,
  over = [],
  under = [],
}: {
  total: number;
  over?: string[];
  under?: string[];
}) {
  const [open, setOpen] = useState(false);
  const id = `spec-${total}-${over.length}-${under.length}`;

  return (
    <div className="wsbal" data-open={open ? '1' : undefined}>
      <BalanceStrip
        total={total}
        over={over}
        under={under}
        open={open}
        bodyId={id}
        onToggle={() => setOpen((v) => !v)}
      />
      <div className="wsbal__body" id={id}>
        <p className="blk__p" style={{ margin: '10px 12px' }}>
          The panel’s six tracks stand here on the real screen. This is the
          disclosure target, so the control above has something to point at.
        </p>
      </div>
    </div>
  );
}
