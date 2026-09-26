import { Blk, Bench } from '../../chrome/Blk';
import { SpecTable, DoDont } from '../../chrome/Docs';
import { SegmentSingleSpecimen, SegmentSpecimen } from './SegmentSpecimen';

/**
 * FILTERS THAT SHAPE A LIST.
 *
 * Written out of the 15 Sep 2026 `/today` pass. Deliberately not a `Chip`.
 */
export function SegmentEntry() {
  return (
    <>
      <Blk
        title="Why this is not a Chip"
        lede={
          <>
            <code>Chip</code> is a selectable token and its pressed state is a filled lime pill,
            which the client portal uses deliberately and which <code>AGENTS.md</code> records as a
            decision not to copy. This is a different problem:{' '}
            <b>its resting state is mostly-on</b>. Two of three are selected by default, often all
            three, so whatever selected looks like is what the whole row looks like nearly all the
            time.
          </>
        }
      />

      <Blk
        title="It has been wrong twice, in opposite directions"
        lede={
          <>
            First as three lime pills, which spent the product&rsquo;s action colour on a control
            that takes no action and put a row of lime directly above the day in the same colour as
            the primary verb. Then as full <code>--tx-ink</code> plates, which is the same mistake
            in a different colour: black is the strongest mark available on a light ground, so the
            least consequential control on the screen became the heaviest thing on it. Swapping a
            loud fill for a louder one is not a fix.
          </>
        }
      >
        <DoDont
          yes={{
            figure: <SegmentSpecimen />,
            caption:
              'Three quiet cues, not one loud one: a --tx-surface-3 fill, --tx-ink against the resting --tx-ink-3, and weight 650 against 500. Press one, this specimen is live.',
          }}
          no={{
            figure: (
              <div className="seg">
                <span className="chip chip--on">
                  In Person<span className="chip__n">1</span>
                </span>
                <span className="chip chip--on">
                  Online<span className="chip__n">0</span>
                </span>
                <span className="chip chip--on">
                  Done<span className="chip__n">7</span>
                </span>
              </div>
            ),
            caption:
              'Three plates above the day, competing with the page’s primary verb for the same colour. “Done”, the least urgent count on the screen, is the loudest thing on it.',
          }}
        />
      </Blk>

      <Blk
        title="Why three cues and not one"
        lede={
          <>
            Redundant on purpose. The fill alone is too subtle at 30px, colour alone fails for
            anyone who cannot separate two greys, and weight alone is invisible at 12.25px. Together
            they read at a glance and the row stays quiet when everything is on. The selected fill
            measures only 1.26:1 against the canvas, so it is never asked to carry the state by
            itself: the label carries 6.4:1 to 14.3:1, and <code>aria-pressed</code> carries it for
            assistive tech.
          </>
        }
      />

      <Blk
        title="Two grammars, one control"
        lede={
          <>
            <code>mode=&quot;toggle&quot;</code> is what this was: <code>aria-pressed</code> on
            each pill, more than one on at once, the group a <code>role=&quot;group&quot;</code>.{' '}
            <code>mode=&quot;single&quot;</code> is one of a set —{' '}
            <code>role=&quot;radiogroup&quot;</code>, <code>aria-checked</code>, one tab stop, and
            the arrow keys.
            <br />
            <br />
            The second was added on 19 Sep 2026 for the client file&rsquo;s session history, which
            had been through this argument in the other direction: it drew six filter chips, they
            were replaced by a <code>&lt;select&gt;</code>, and the stated reason was right —{' '}
            <i>a row of toggles that behaves as a radio group is a radio group drawn wrong</i>.
            What brought the row back is the <b>counts</b>. The question that tab is opened with
            is <i>has this client been missing sessions</i>, and the answer is a number per
            outcome; a <code>&lt;select&gt;</code> can show one option at a time and only once you
            open it. So the objection is answered rather than re-committed.
          </>
        }
      >
        <Bench>
          <SegmentSingleSpecimen />
        </Bench>
      </Blk>

      <Blk
        title="A single-select group owes you arrow keys"
        lede={
          <>
            A radio group is <b>one</b> tab stop. Tab enters it at the checked option, the arrows
            move between options and check as they go, Home and End reach the ends. Five separate
            tab stops carrying <code>aria-checked</code> is a radio group drawn wrong in the
            opposite direction from the one this replaced — so the roving{' '}
            <code>tabindex</code> and the key handler live in the component, and every screen that
            reaches for <code>single</code> gets the behaviour with the role. The handler drives
            its children through <code>.click()</code>, so the group needs to know nothing about
            what they do.
          </>
        }
      />

      <SpecTable
        rows={[
          { property: 'Height', value: '30px, pill radius', token: '--tx-rfull', note: 'Hit target is the control itself' },
          { property: 'Resting', value: 'transparent / ink-3 / 500', token: '--tx-line', note: 'Light 5.64:1, dark 6.42:1' },
          { property: 'Selected', value: 'surface-3 / ink / 650', token: '--tx-surface-3', note: 'Light 14.89:1, dark 14.28:1' },
          { property: 'Count', value: 'tabular, ink-2 when selected', token: '--tx-ink-3', note: 'Never --tx-ink-off: §01 calls that 3.3:1, so it is a hairline colour and a count is type' },
          { property: 'State · toggle', value: 'aria-pressed', token: undefined, note: 'More than one can be on at once. role="group"' },
          { property: 'State · single', value: 'aria-checked', token: undefined, note: 'role="radiogroup" + role="radio", one tab stop, arrow keys' },
        ]}
      />
    </>
  );
}
