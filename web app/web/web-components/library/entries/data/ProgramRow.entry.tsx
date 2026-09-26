import { ProgramRow, ProgramRowHead } from '../../../ui/ProgramRow';
import { RowMenu } from '../../../ui/RowMenu';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/**
 * Program row — a blueprint as columns, two lines on a phone.
 *
 * ── WHY IT IS IN THE CATALOGUE AND WHY IT IS NOT `c-table` ──────────────────
 *
 * `ui/Table.tsx` emits a real `<table class="tbl">`, and this is not one. Every
 * row is a whole-row `<a>` to the program it names, and an anchor cannot wrap
 * `<tr>`. So it is a CSS grid pretending to be a table above 900px and giving
 * the pretence up below it, which is a different component with a different
 * accessibility story — not a variant of the data table.
 *
 * The rows below are `ui/ProgramRow.tsx` — the SAME import `Shelf` renders, so
 * this page cannot drift from `/programs`. Verified at the swap: six rows,
 * byte-identical DOM before and after, `41899c8c:5240`.
 *
 * The reflowed state is still DRAWN rather than rendered, and the block that
 * draws it says why: the reflow is a viewport media query and this column is
 * 1177px wide, so a live row capped narrow renders the component failing.
 */
export function ProgramRowEntry() {
  const entry = byId('c-programrow')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/ProgramRow.tsx</code> },
        { k: 'Class', v: <code>.ptrow</code> },
        { k: 'Element', v: <code>&lt;a&gt;</code>, },
        { k: 'Columns', v: '7 + two gutters' },
        { k: 'Reflows at', v: '900px' },
        { k: 'Used in', v: '/programs' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            The whole row is the link. Not the name inside it &mdash; a 14px target in a 1300px row asks the
            trainer to aim at the one word that happens to be a link, when every pixel of the row is about the
            same program.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px', display: 'block' }}>
          <div className="pgt">
            <ProgramRowHead actionable />
            <ul className="pgt__l" role="list">
              <li>
                <ProgramRow href="#c-programrow" name="Upper / Lower · Intermediate" sub="Upper A · Lower A · Upper B · Lower B" days={[1, 2, 4, 5]} clients={6} weeks={8} goal="Hypertrophy" edited="3d ago" certified actions={<RowMenu label="Upper / Lower · Intermediate" items={[{ label: 'Duplicate', href: '#c-programrow' }, { separator: true }, { label: 'Delete…', href: '#c-programrow', danger: true }]} />} />
              </li>
              <li>
                <ProgramRow href="#c-programrow" name="Push Pull Legs" sub="Push · Pull · Legs · Push · Pull" days={[1, 2, 3, 5, 6]} clients={11} weeks={12} goal="Strength" edited="yesterday" actions={<RowMenu label="Push Pull Legs" items={[{ label: 'Duplicate', href: '#c-programrow' }, { separator: true }, { label: 'Delete…', href: '#c-programrow', danger: true }]} />} />
              </li>
              <li>
                <ProgramRow href="#c-programrow" name="Post-injury return · shoulder" sub="Rebuild A · Rebuild B" days={[2, 4]} clients={0} weeks={6} goal="Rehab" edited="14 Aug" actions={<RowMenu label="Post-injury return · shoulder" items={[{ label: 'Duplicate', href: '#c-programrow' }, { separator: true }, { label: 'Delete…', href: '#c-programrow', danger: true }]} />} />
              </li>
            </ul>
          </div>
        </Bench>
      </Blk>

      <Blk
        title="The noun rides on the row, not on the header"
        lede={
          <>
            <code>.ptrow__k</code> holds the word each figure is <i>of</i> &mdash; <i>days a week</i>,{' '}
            <i>clients on this</i> &mdash; and it is clipped rather than <code>display:none</code>. Two things
            follow, and both are the point of the technique. The header row is safe to mark{' '}
            <code>aria-hidden</code>, because a screen reader hears <i>4 days a week</i> off the row itself and
            never has to associate a figure with a header it met six rows ago. And the reflow below has the
            nouns already in the markup: it un-clips them instead of inventing them.
            <br />
            <br />
            Clipped and not <code>.vh</code>, whose <code>!important</code> a media query cannot undo.
          </>
        }
      />

      <Blk
        title="And under 900px it is the column’s row again"
        lede={
          <>
            There are no columns left to align on one track, and <b>13</b> on its own is not a fact. So the
            nouns come back, the seven tracks collapse to two, and the head goes.
            <br />
            <br />
            <b>The block below is drawn, not the component.</b> The reflow is a <i>viewport</i> media query at
            900px, and this column is 1177px wide — so a live <code>.ptrow</code> capped at 420px here does
            not reflow, it stays seven tracks and collapses the name to <code>clientWidth: 0</code>. A
            specimen that renders the component failing is worse than a drawing that states what it does, so
            this is a drawing. Narrow the window past 900px to see the real one, on{' '}
            <code>/programs</code>.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px', display: 'block' }}>
          <div className="drawn" aria-hidden="true">
            <div className="drawn__r">
              <div className="drawn__c">
                <span className="drawn__nm">Post-injury return · shoulder</span>
                <span className="drawn__m">
                  <b>2</b> days a week · <b>—</b> nobody on this yet · <b>6</b> weeks
                  <br />
                  Rehab · edited 14 Aug
                </span>
              </div>
              <div className="drawn__sh">
                <span className="shape">
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <i key={n} className={n === 2 || n === 4 ? 'shape__c shape__c--1' : 'shape__c'} />
                  ))}
                </span>
              </div>
            </div>
          </div>
        </Bench>
        <p className="blk__p">
          The break is <i>declared</i>, not left to the viewport. <code>.ptrow__facts</code> becomes a block so
          the three figures close their line, and the two inline siblings after it fall into an anonymous block
          of their own: two lines, always. Measured without it, three of five rows broke mid-phrase
          (<i>&ldquo;Post-&rdquo;</i> / <i>&ldquo;injury return&rdquo;</i>) and every row was a different
          height.
        </p>
      </Blk>

      <Blk
        title="The name track is the only flexible one, so it has to earn it"
        lede={
          <>
            Six of the seven columns are fixed, so the name takes every pixel of slack &mdash; deliberately,
            because that is what keeps the numeric edge at the <i>right</i> edge, where <i>which of these has
            nobody on it</i> is a glance down one column. MEASURED on a 1536 shell that made the name track{' '}
            <b>700px</b> to hold a 194px name; at 1920 it was <b>872px</b>. Half of every row was blank canvas.
            <br />
            <br />
            <code>sub</code> is what fills it, and it is the blueprint&rsquo;s own content rather than
            decoration: the day names a trainer wrote, in slot order. It sits immediately left of the shape
            strip, which is a picture of the same fact &mdash; the strip says <i>which</i> slots, the line says{' '}
            <i>what is in them</i>. It ellipsises rather than wrapping: a row that grows a line when somebody
            names six days is a row whose neighbours stop lining up.
            <br />
            <br />
            The other half of the repair is a <b>measure</b>. <code>.pgt__body</code> caps the head and the
            list together at 1180px, because one flexible track means the row grows forever.
          </>
        }
      />

      <Blk
        title="Two gutters, and neither is a column"
        lede={
          <>
            The whole row is an <code>&lt;a&gt;</code>, and an anchor may contain neither a checkbox nor a
            button. So both controls are <i>siblings</i> of the link inside one positioned wrapper, laid over
            gutters the row opens with padding &mdash; <code>.ptrow--pick</code> on the left,{' '}
            <code>.ptrow--act</code> on the right. <code>ProgramRowHead</code> takes the identical padding, or
            PROGRAM sits 28px left of every name under it and EDITED 40px right of every stamp.
            <br />
            <br />
            The menu rests at 45% and comes up to full ink on hover, on focus and while its own panel is open.
            It is <b>not</b> hidden: a control that appears under the pointer is a control a keyboard and a
            touch screen cannot find, and <code>@media (pointer:coarse)</code> pins it visible outright.
          </>
        }
      />

      <Blk
        title="Zero is a dash and a sentence"
        lede={
          <>
            <code>0 clients</code> in a column of figures reads as a measurement. <i>&mdash; nobody on this yet</i>{' '}
            is what the trainer is actually scanning for: a program they can edit without reaching anybody. The
            dash is the column&rsquo;s answer and the sentence is the row&rsquo;s, so the dash is dropped in the
            reflowed state where the sentence is already there.
          </>
        }
      />

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Columns', value: '7', note: 'Program · shape · days · weeks · clients · goal · edited' },
            { property: 'Gutters', value: '38 + 40px', note: 'The checkbox and the row menu — laid over the row, not tracks of it' },
            { property: 'Second line', value: 'the day names', token: '--tx-ink-3', note: 'What the blueprint is made of — see below' },
            { property: 'Reflow', value: '900px', note: "The shell's breakpoint, not the content's — this list shares its width with nothing" },
            { property: 'Target', value: 'the whole row', note: 'A whole-row anchor, which is why this is not `c-table`' },
            { property: 'Header', value: <code>aria-hidden</code>, note: 'The nouns are on the rows' },
            { property: 'Column heads', value: 'mono 9.5px', token: '--tx-ink-3', note: '5.08:1 — was --tx-ink-off at 3.33:1' },
            { property: 'Figures', value: 'mono 12.5px', token: '--tx-ink', note: 'Tabular, so the column reads down' },
            { property: 'Nouns', value: 'clipped', note: 'Not `.vh` — its !important survives the media query' },
            { property: 'Shape strip', value: '7 cells', token: '--tx-accent', note: 'aria-hidden; the days column carries the text' },
            { property: 'Last row', value: 'no rule', note: <code>.pgt__l li:last-child .ptrow</code> },
          ]}
        />
      </Blk>

      <Blk
        title="Do and don’t"
        tag="guidelines"
        lede={
          <>
            Both figures are <b>drawn</b>, for the reason the reflow block gives: <code>DoDont</code> splits
            this column in half, and seven tracks in 539px collapse the name to nothing. The claim is about
            the narrow state, so the drawing is what can make it.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <div className="drawn" aria-hidden="true">
                <div className="drawn__r">
                  <div className="drawn__c">
                    <span className="drawn__nm">Push Pull Legs</span>
                    <span className="drawn__m">
                      <b>5</b> days a week · <b>11</b> clients on this · <b>12</b> weeks
                      <br />
                      Strength · edited yesterday
                    </span>
                  </div>
                  <div className="drawn__sh">
                    <span className="shape">
                      {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                        <i key={n} className={n === 4 || n === 7 ? 'shape__c' : 'shape__c shape__c--1'} />
                      ))}
                    </span>
                  </div>
                </div>
              </div>
            ),
            caption:
              'Every figure with the word it is of. The nouns were already in the markup, clipped — the reflow un-clips them rather than inventing them.',
          }}
          no={{
            figure: (
              <div className="drawn" aria-hidden="true">
                <div className="drawn__r">
                  <div className="drawn__c">
                    <span className="drawn__nm">Push Pull Legs</span>
                    <span className="drawn__m">
                      <b>5</b> · <b>11</b> · <b>12</b>
                      <br />
                      Strength · yesterday
                    </span>
                  </div>
                  <div className="drawn__sh">
                    <span className="shape">
                      {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                        <i key={n} className={n === 4 || n === 7 ? 'shape__c' : 'shape__c shape__c--1'} />
                      ))}
                    </span>
                  </div>
                </div>
              </div>
            ),
            caption:
              'The desk row’s bare figures, kept after the header that named them has gone. Five what? Eleven of what? A column only labels its cells while its head is on screen.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
