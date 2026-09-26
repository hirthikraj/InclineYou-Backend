import { Markup } from '../../../ui/Markup';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

const CUE = '# Top set\nPause a beat at the bottom, then **drive through the heel**.\nIf the bar *slows*, stop — that is the set. __Do not chase the number.__';

export function MarkupEntry() {
  const entry = byId('c-markup')!;

  return (
    <Cmp
      entry={entry}
      status="beta"
      meta={[
        { k: 'Component', v: <code>ui/Markup.tsx</code> },
        { k: 'Class', v: <code>.mkp</code> },
        { k: 'Format', v: <code>lib/text/markup.ts</code> },
        { k: 'Writes it', v: <code>c-markupfield</code> },
        { k: 'Used in', v: 'the workout builder’s set note' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            Four constructs and no fifth: <code>**bold**</code>, <code>*italic*</code>,{' '}
            <code>__underline__</code> and <code># a heading</code> on its own line. Everything
            else a trainer types is text — <code>3*4 sets</code> keeps its asterisk, because a
            marker with no partner is never a marker.
          </>
        }
      >
        <Bench>
          <Cell label="A CUE, AS WRITTEN" stretch>
            <pre style={{ margin: 0, font: 'inherit', fontSize: 12.5, whiteSpace: 'pre-wrap', color: 'var(--tx-ink-3)' }}>
              {CUE}
            </pre>
          </Cell>
          <Cell label="THE SAME CUE, AS READ" stretch>
            <Markup value={CUE} />
          </Cell>
          <Cell label="NOTHING TO MARK — IT IS JUST TEXT" stretch>
            <Markup value={'Three sets of 12, 3*4 if it feels light. 60% x 5.'} />
          </Cell>
        </Bench>
      </Blk>

      <Blk title="Rules" tag="guidelines">
        <DoDont
          yes={{
            figure: <Markup value="Keep the chest **up**." />,
            caption: (
              <>
                Every screen that displays a field written with <code>c-markupfield</code> renders
                it through this. The two ship together.
              </>
            ),
          }}
          no={{
            figure: <span style={{ color: 'var(--tx-ink-2)', fontSize: 12.5 }}>Keep the chest **up**.</span>,
            caption: (
              <>
                Printing the same field as a bare string. This is not a missing style — it is the
                client reading punctuation the trainer never meant to send.
              </>
            ),
          }}
        />
      </Blk>

      <Blk
        title="Specification"
        lede={
          <>
            The marks carry weight and slope and never a colour or a size: one cue is drawn at
            12px under a set line and at 13.5px in the box that writes it, and a mark that set
            either would make the same sentence two sizes on two screens.
          </>
        }
      >
        <SpecTable
          rows={[
            { property: 'Element, bold', value: <code>&lt;strong&gt;</code>, note: 'Weight only — 700 against the inherited size.' },
            { property: 'Element, italic', value: <code>&lt;em&gt;</code>, note: 'Slope only.' },
            { property: 'Element, underline', value: <code>&lt;u&gt;</code>, note: 'The one element whose meaning is “marked, without saying why”.' },
            { property: 'Underline offset', value: '2px', token: '—', note: 'The default clips descenders at the cue’s 12px.' },
            { property: 'Heading', value: <code>.mkp__h</code>, token: '--tx-brand', note: 'Weight and tracking, never a scale step, and never an <h*> — there is no outline to join.' },
            { property: 'Line', value: <code>span, display:block</code>, note: 'A cue renders inside a <button>; flow content there closes the button early.' },
            { property: 'HTML', value: 'none', note: 'Nodes to elements. dangerouslySetInnerHTML appears nowhere on this path.' },
          ]}
        />
      </Blk>
    </Cmp>
  );
}
