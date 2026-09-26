import { FactList } from '../../../ui/FactList';
import { KeyValueList } from '../../../ui/KeyValue';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

export function FactListEntry() {
  const entry = byId('c-factlist')!;

  return (
    <Cmp
      entry={entry}
      status="beta"
      meta={[
        { k: 'Component', v: <code>ui/FactList.tsx</code> },
        { k: 'Class', v: <code>.facts</code> },
        { k: 'Row height', v: '~44px' },
        { k: 'Parts', v: <code>.Row · .Blank</code> },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            The client file&rsquo;s two record cards, which is every call-site so far. The list takes the
            card&rsquo;s own gutter and draws its rules between rows rather than around the block, so it sits
            inside a <code>flush</code> card with nothing wrapping it.
          </>
        }
      >
        <Bench pad={false}>
          <div className="card" style={{ width: 360 }}>
            <div className="card__hd">
              <h4 className="card__t">Physical information</h4>
            </div>
            <FactList>
              <FactList.Row k="Height">175 cm</FactList.Row>
              <FactList.Row k="Weight" note="19 Sep">
                <span className="facts__lk">94.6 kg</span>
              </FactList.Row>
              <FactList.Row k="Birth day" note="32 years old">19 Sept 1994</FactList.Row>
              <FactList.Row k="Body fat">
                <FactList.Blank />
              </FactList.Row>
            </FactList>
          </div>
        </Bench>
      </Blk>

      <Blk
        title="It is not a key-value row, and the weight runs the other way"
        lede={
          <>
            <code>c-kv</code> sets its key in the body face at the value&rsquo;s own size, with a fixed 80px
            key track and <code>flex-wrap:nowrap</code> &mdash; right for a settings list, where the label is
            the content and the value is a state. A stored record is the opposite: <b>175 cm</b> is the
            content and <i>Height</i> is the index to it.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <div style={{ width: 300 }}>
                <FactList>
                  <FactList.Row k="Mobile number">+91 98416 54932</FactList.Row>
                  <FactList.Row k="Full name">Ananya Balaji</FactList.Row>
                </FactList>
              </div>
            ),
            caption:
              'The figure takes the weight, the size and the right-hand edge. The label is the part allowed to wrap.',
          }}
          no={{
            figure: (
              <KeyValueList
                rows={[
                  { k: 'Mobile number', v: '+91 98416 54932' },
                  { k: 'Full name', v: 'Ananya Balaji' },
                ]}
                width={300}
              />
            ),
            caption:
              'The same two facts as a key-value list. The two were one class for a week and the 80px key track was the tell — the label wrapped while the number it indexes had 200px of room.',
          }}
        />
      </Blk>

      <Blk
        title="The second line is a slot, not something the caller appends"
        lede={
          <>
            <code>note</code> is the qualifier under a figure &mdash; <i>42 years old</i> under a birth day,
            the day a weight was taken under the weight. Lighter and smaller on purpose: the figure is the part
            that changes and the part the eye is looking for. A slot rather than extra children, so the two can
            never be set at the same size by accident.
          </>
        }
      >
        <p className="blk__p">
          <code>FactList.Blank</code> is the other part, and it exists because the three renderings it replaced
          were <code>&mdash;</code>, <code>-</code> and an empty string. The empty string is the one that reads
          as a row which failed to load rather than a field nobody has filled in.
        </p>
      </Blk>

      <Blk
        title="A figure that is also a destination says so at rest"
        lede={
          <>
            <code>.facts__lk</code> carries a dotted underline before the pointer arrives. It was{' '}
            <code>color:inherit; text-decoration:none</code> with an underline on hover &mdash; which on a card
            of five identical rows is a link nobody can find.
          </>
        }
      >
        <p className="blk__p">
          Not <code>--tx-accent</code>: <code>#C6F24E</code> is a fill, never text on a light ground, which is
          the rule the stylesheet opens with. The underline goes solid and the ink steps on hover instead. The
          link also takes hit slop through a <code>::before</code>, the way <code>.switch</code> does &mdash;
          its own box measures 55&times;18 and the row around it is 44.
        </p>
      </Blk>

      <Blk
        title="One row stacks, and it is the row whose value is a sentence"
        lede={
          <>
            <code>stack</code> drops the value under its label and lets it wrap. It is for the one shape the
            base row cannot hold &mdash; a check-in question with the answer a client typed under it &mdash;
            where a <code>nowrap</code> value 300px wide inside a 420px card is a card with ink past its own
            edge. The weight does not change: the answer keeps its own, and the question is still the index to
            it. Only the axis moves.
          </>
        }
      >
        <Bench pad={false}>
          <div className="card" style={{ width: 360 }}>
            <div className="card__hd">
              <h4 className="card__t">Answers</h4>
            </div>
            <FactList>
              <FactList.Row k="How would you rate your overall progress this block?">
                7 out of 10
              </FactList.Row>
              <FactList.Row k="Which lift felt strongest this block?" stack>
                Trap-bar deadlift. First time the second set did not feel like a fight.
              </FactList.Row>
              <FactList.Row k="What do you want to focus on next block?" stack>
                <FactList.Blank />
              </FactList.Row>
            </FactList>
          </div>
        </Bench>
        <p className="blk__p">
          The first row above is the ordinary one, kept in frame on purpose: a rating is a figure and belongs
          on the label&rsquo;s own line, ranged right. Mixing the two in one list is the point &mdash; what
          decides the axis is the ANSWER&rsquo;s shape, not the card&rsquo;s.
        </p>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Row height', value: '~44px', note: '13px padding, grows for a wrapped label' },
            { property: 'Stacked value', value: '14.5px / 700', token: '--tx-ink', note: 'Own line, wraps, text-wrap:pretty' },
            { property: 'Label', value: '13.5px', token: '--tx-ink-2', note: 'May wrap; min-width:0' },
            { property: 'Value', value: '15px / 700', token: '--tx-ink', note: 'Right-ranged, nowrap, flex:0 0 auto' },
            { property: 'Qualifier', value: '12.5px / 600', token: '--tx-ink-3', note: 'Own line under the value' },
            { property: 'Blank', value: <code>&mdash;</code>, token: '--tx-ink-3', note: 'Never an empty string' },
            { property: 'Divider', value: '1px', token: '--tx-line', note: 'Between rows; the last draws none' },
            { property: 'Gutter', value: '0 16px', note: 'The card’s own, for a flush body' },
            { property: 'Link slop', value: '::before, inset -9px 0', note: 'Zero layout cost; reaches 36px' },
          ]}
        />
      </Blk>
    </Cmp>
  );
}
