import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

import {
  ChoiceAgainstRows,
  ChoiceMany,
  ChoiceOne,
  ChoiceOther,
  ChoiceYesNo,
} from './ChoiceListSpecimen';

export function ChoiceListEntry() {
  const entry = byId('c-choicelist')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/ChoiceList.tsx</code> },
        { k: 'Class', v: <code>.chl</code> },
        { k: 'Element', v: <code>label + input</code> },
        { k: 'Row', v: '40px floor' },
        { k: 'Grammars', v: '2' },
      ]}
    >
      <Blk
        title="Specimen"
        lede="One question, its answers, and nothing else. Tab into it once, then arrow between the options — the whole sentence is the target, not the dot beside it."
      >
        <Bench style={{ gap: 26 }}>
          <div style={{ width: 360 }}>
            <ChoiceOne />
          </div>
        </Bench>
      </Blk>

      <Blk
        title="The grammar is the prop, and it changes the element"
        lede={
          <>
            <code>multiple</code> is not a styling flag. Off, the options are radios: <b>one tab stop</b>,
            arrows between them, and a reader is told <i>2 of 4</i>. On, they are checkboxes: four tab stops,
            Space toggles each, and nothing is announced as exclusive. Tab through both and the difference is
            audible before it is visible.
          </>
        }
      >
        <Bench style={{ gap: 26, alignItems: 'flex-start' }}>
          <div style={{ width: 320 }}>
            <p className="micro ink3" style={{ marginBottom: 10 }}>ONE ANSWER · RADIOS</p>
            <ChoiceOne />
          </div>
          <div style={{ width: 320 }}>
            <p className="micro ink3" style={{ marginBottom: 10 }}>SEVERAL · CHECKBOXES</p>
            <ChoiceMany />
          </div>
        </Bench>
      </Blk>

      <Blk
        title="A yes/no is two options, not a second component"
        lede={
          <>
            <i>Did anything hurt while training</i> is this control with two options and{' '}
            <code>multiple</code> off. A component of its own would be the same markup, the same radio group
            and one fewer decision &mdash; and the day one of them grew a focus fix, the other would not
            have it.
          </>
        }
      >
        <Bench>
          <div style={{ width: 320 }}>
            <ChoiceYesNo />
          </div>
        </Bench>
      </Blk>

      <Blk
        title="Other is an option, never a field beside the list"
        lede={
          <>
            Picking it <b>is</b> the answer; the text is the detail. A field outside the list would be a
            second control for one answer, and the client would have to work out whether ticking and typing
            were one act or two. It appears on picking and not before &mdash; an empty box under an unpicked
            option invites somebody to type an answer that does not count.
          </>
        }
      >
        <Bench>
          <div style={{ width: 360 }}>
            <ChoiceOther />
          </div>
        </Bench>
        <p className="blk__p">
          The trainer decides this per question. A typed answer is one no chart can put beside last block&rsquo;s,
          so the option exists and is <b>off by default</b>.
        </p>
      </Blk>

      <Blk
        title="Against the picking list, which is the same picture"
        lede={
          <>
            The booking panel&rsquo;s <code>.lgl</code> + <code>.lrow</code> is a column of bordered rows that
            select, and from two feet away this is that. The difference is the grammar: that one is{' '}
            <code>&lt;button aria-pressed&gt;</code> &mdash; independent toggles behaving as a group &mdash;
            where a question with four answers is a radio group. <code>ListRow</code> makes the same argument
            in the other direction: <i>a picker made of buttons is not a listbox, and saying so is the honest
            markup.</i>
          </>
        }
      >
        <Bench style={{ gap: 26, alignItems: 'flex-start' }}>
          <ChoiceAgainstRows />
        </Bench>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Row height', value: '40px floor', token: '--w-tap-touch' },
            { property: 'Padding', value: '13px 14px' },
            { property: 'Radius', value: '8px', token: '--tx-r2' },
            { property: 'Gap', value: '8px', token: '--tx-s2', note: 'Between options' },
            { property: 'Answer size', value: '15px / 1.45', note: 'Options are read, not scanned' },
            {
              property: 'Element',
              value: <code>&lt;label&gt; + &lt;input&gt;</code>,
              note: 'Radio where exclusive, checkbox where not',
            },
            { property: 'Group role', value: 'radiogroup / group', note: 'Follows the same prop' },
            { property: 'Picked', value: 'accent border + soft fill', token: '--tx-accent-soft' },
            { property: 'Focus ring', value: 'on the box', note: 'Not on the 18px dot inside it' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <div style={{ width: 300 }}>
                <ChoiceYesNo />
              </div>
            ),
            caption:
              'Full-width options with the sentence inside the label. One tab stop, arrows between the answers, and the target is the words.',
          }}
          no={{
            figure: (
              <div className="seg" role="radiogroup" aria-label="Don’t">
                <button type="button" className="chip" role="radio" aria-checked="false">
                  Hard but manageable
                </button>
                <button type="button" className="chip" role="radio" aria-checked="true">
                  About right
                </button>
              </div>
            ),
            caption:
              'Pills. Right for five outcomes with a count on each, wrong for sentences — four 28-character answers is a wrapped row nobody can scan.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
