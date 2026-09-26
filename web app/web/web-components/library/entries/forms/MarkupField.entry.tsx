'use client';

import { useState } from 'react';

import { Markup } from '../../../ui/Markup';
import { MarkupField } from '../../../ui/MarkupField';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

const SEED = 'Pause a beat at the bottom, then **drive through the heel**.';

export function MarkupFieldEntry() {
  const entry = byId('c-markupfield')!;
  const [written, setWritten] = useState(SEED);
  const [empty, setEmpty] = useState('');

  return (
    <Cmp
      entry={entry}
      status="beta"
      meta={[
        { k: 'Component', v: <code>ui/MarkupField.tsx</code> },
        { k: 'Class', v: <code>.mkpf</code> },
        { k: 'Marks', v: '4 — bold · italic · underline · heading' },
        { k: 'Format', v: <code>lib/text/markup.ts</code> },
        { k: 'Reads it back', v: <code>c-markup</code> },
        { k: 'Used in', v: 'the workout builder’s set note' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            Live — select a word and press <b>B</b>, or <kbd>⌘B</kbd>, and the box itself changes.
            The button stays <b>lit</b> while the caret is inside that mark, so the toolbar answers{' '}
            <em>what am I typing in</em> as well as acting on a selection.
            What is STORED is still markdown: the four markers go to a plain text column and{' '}
            <code>c-markup</code> reads them back wherever the note is displayed. <kbd>⌘Z</kbd>{' '}
            undoes the writing, <kbd>⌘⇧Z</kbd> redoes it.
          </>
        }
      >
        <Bench style={{ gap: 26, alignItems: 'flex-start' }}>
          <Cell label="WITH TEXT IN IT" stretch>
            <div style={{ width: '100%', maxWidth: 460 }}>
              <MarkupField
                value={written}
                onChange={setWritten}
                label="A note on this set"
                placeholder="Add a comment to the set"
              />
            </div>
          </Cell>
          <Cell label="EMPTY — THE PLACEHOLDER IS AN ATTRIBUTE" stretch>
            <div style={{ width: '100%', maxWidth: 460 }}>
              <MarkupField
                value={empty}
                onChange={setEmpty}
                label="An empty note"
                placeholder="Add a comment to the set"
              />
            </div>
          </Cell>
        </Bench>
      </Blk>

      <Blk title="Rules" tag="guidelines">
        <DoDont
          yes={{
            figure: <Markup value="Keep the chest **up**." />,
            caption: (
              <>
                Ship it with <code>c-markup</code>. A toolbar is only honest when every reader of
                the column can draw what it writes.
              </>
            ),
          }}
          no={{
            figure: (
              <span style={{ color: 'var(--tx-ink-2)', fontSize: 12.5 }}>Keep the chest **up**.</span>
            ),
            caption: (
              <>
                Placing this over a field some other screen prints as a bare string. The markers
                reach whoever reads it — on the set note, that is the client.
              </>
            ),
          }}
        />
      </Blk>

      <Blk
        title="What it deliberately has no button for"
        lede={
          <>
            A <b>Text ▾</b> block-style menu: its only two entries would be <em>Text</em> and{' '}
            <em>Heading</em>, and <b>H</b> is already both in one press — two controls for one
            state is how a toolbar teaches that its buttons are unreliable. Lists, links, code and
            quotes are out for the reason the format leaves them out: a cue is read on a phone,
            mid-set, at 12px.
          </>
        }
      />

      <Blk title="Specification">
        <SpecTable
          rows={[
            { property: 'Box', value: 'contenteditable', token: '--tx-field', note: 'A textarea cannot show a mark: bold glyphs are wider, so an overlay drifts from the caret.' },
            { property: 'Stored as', value: 'markdown', note: 'Serialised out of the DOM on every keystroke. Nothing downstream ever sees HTML.' },
            { property: 'Paste', value: 'text/plain only', note: 'A pasted document would bring tables and font stacks into a one-sentence column.' },
            { property: 'Toolbar target', value: '30 × 30px', note: 'Above §11’s 24px floor: a miss collapses the selection it was about to wrap.' },
            { property: 'Focus', value: 'never taken by a button', note: 'onMouseDown is prevented on every control, or the selection is gone before the click lands.' },
            { property: 'Focusable by', value: 'tabindex="0"', note: 'A contenteditable matches none of the selectors a focus trap looks for.' },
            { property: 'Lit state', value: 'aria-pressed + .mkpf__b--on', token: '--tx-accent-soft', note: 'Driven off selectionchange and queryCommandState — the only API that knows a collapsed caret is armed.' },
            { property: 'Caret', value: 'never touched by React', note: 'The box is written imperatively, and only when the value arriving from outside is not the one it last serialised.' },
            { property: 'Shortcuts', value: '⌘ + B · I · U · Z · ⇧Z · ⏎', note: 'Marks, undo, redo and the caller’s commit. Ctrl+Y redoes as well, for Windows.' },
            { property: 'Emoji', value: '16, fixed', note: 'Plain text — it needed no format. A full picker is a search field and 2,000 glyphs inside a one-field dialog.' },
            { property: 'Undo', value: 'the editable’s own', note: 'execCommand edits stay on the native history, and ⌘Z re-serialises so the model follows the box.' },
          ]}
        />
      </Blk>
    </Cmp>
  );
}
