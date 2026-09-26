import { Textarea } from '../../../ui/Textarea';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

const NOTE =
  'No problem — I have kept Thursday 6pm for you. Same plan, we will add a rep on the bench.';

export function TextareaEntry() {
  const entry = byId('c-textarea')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Textarea.tsx</code> },
        { k: 'Class', v: <code>textarea.ctl</code> },
        { k: 'Min height', v: '76px' },
        { k: 'Resize', v: 'vertical' },
      ]}
    >
      <Blk title="Specimen">
        <Bench style={{ gap: 30, alignItems: 'flex-start' }}>
          <Textarea
            label="Note to Nikhil"
            defaultValue={NOTE}
            width={330}
            hint="Goes out on WhatsApp when you save."
          />
        </Bench>
      </Blk>

      <Blk
        title="Vertical resize only"
        lede="A textarea that can be dragged wider escapes the column it sits in, and the form reflows around a box the trainer was only trying to make taller. Drag the corner of the one above."
      />

      <Blk
        title="A limit tells, it does not take"
        lede={
          <>
            <code>maxLength</code> is deliberately not wired to a silent truncation. A note that stops
            accepting characters mid-sentence, with no count and no message, is the one failure this control
            cannot have &mdash; the trainer is mid-thought and has no idea the end of it is being dropped.
            Passing <code>limit</code> shows the count and lets the text run over, in error.
          </>
        }
      >
        <Bench style={{ gap: 26, alignItems: 'flex-start' }}>
          <Cell label="UNDER · A COUNT IN THE HINT">
            <Textarea label="Note" defaultValue="Same plan on Thursday." limit={160} width={280} />
          </Cell>
          <Cell label="OVER · AN ERROR, NOT A TRUNCATION">
            <Textarea label="Note" defaultValue={NOTE} limit={60} width={280} />
          </Cell>
        </Bench>
      </Blk>

      <Blk title="States">
        <Bench style={{ gap: 26, alignItems: 'flex-start' }}>
          <Cell label="EMPTY">
            <Textarea label="Note to the client" placeholder="Anything they should know before Thursday" width={260} />
          </Cell>
          <Cell label="FILLED">
            <Textarea label="Note to the client" defaultValue={NOTE} width={260} />
          </Cell>
          <Cell label="DISABLED">
            <Textarea label="Note to the client" defaultValue={NOTE} width={260} disabled />
          </Cell>
        </Bench>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Min height', value: '76px', note: 'Three lines. Two reads as a text field that grew' },
            { property: 'Resize', value: 'vertical', note: 'Horizontal drag escapes the column' },
            { property: 'Text', value: '16px / 1.55', note: 'Same as a field — iOS zooms below 16' },
            { property: 'Radius', value: '8px', token: '--tx-r2' },
            { property: 'Limit', value: 'advisory', note: 'Shows a count and errors over it. Never truncates' },
            { property: 'Validation', value: 'none', note: 'It is free text. Nothing here rejects a sentence' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <Textarea label="Note to Nikhil" defaultValue={NOTE} width={280} hint="Goes out on WhatsApp when you save." />
            ),
            caption: 'Three lines of room and a hint saying where the text ends up. The trainer knows they are writing to a person, not to a database.',
          }}
          no={{
            figure: (
              <Textarea label="Note" defaultValue={NOTE} width={280} rows={1} style={{ minHeight: 34 }} />
            ),
            caption:
              'One line of a message that is three. The trainer writes into a slot they cannot read back, and the box gives no sign there is more above the fold.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
