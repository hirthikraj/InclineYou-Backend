import { Avatar, AvatarStack } from '../../../ui/Avatar';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/** The seeded roster, in the order the shelf would send it — by name. */
const CAST = [
  { id: 'cl-007', name: 'Anjali Nair' },
  { id: 'cl-002', name: 'Divya Krishnan' },
  { id: 'cl-001', name: 'Karthik Menon' },
  { id: 'cl-006', name: 'Meera K' },
  { id: 'cl-004', name: 'Priya Pillai' },
  { id: 'cl-005', name: 'Rohan Sharma' },
];

export function AvatarStackEntry() {
  const entry = byId('c-avatar-stack')!;

  return (
    <Cmp
      entry={entry}
      status="beta"
      meta={[
        { k: 'Component', v: <code>ui/Avatar.tsx</code> },
        { k: 'Class', v: <code>.avs</code> },
        { k: 'Draws', v: <code>Avatar</code> },
        { k: 'Overlap', v: '7px' },
        { k: 'Default max', v: '4' },
      ]}
    >
      <Blk
        title="Specimen"
        lede="A program with forty-two clients on it. Four faces, then the rest as a figure — and the figure is the server's count, not what is left of the array."
      >
        <Bench style={{ gap: 12 }}>
          <AvatarStack people={CAST} total={42} />
        </Bench>
      </Blk>

      <Blk
        title="The four states, and one of them is a name"
        lede={
          <>
            A single disc is a worse answer than the name it abbreviates &mdash; two initials on a colour, with
            all the room in the world beside them. So one person is named and several are counted. The rule
            lives in the component rather than at the call-site, or the product would name one client on the
            shelf and abbreviate them on the next screen.
          </>
        }
      >
        <Bench style={{ gap: 26 }}>
          <Cell label="NOBODY · DRAWS NOTHING">
            <AvatarStack people={[]} total={0} />
            <span style={{ fontSize: 12.5, color: 'var(--tx-ink-3)' }}>&mdash;</span>
          </Cell>
          <Cell label="ONE · NAMED">
            <AvatarStack people={CAST.slice(0, 1)} total={1} />
          </Cell>
          <Cell label="THREE · UNDER THE CAP">
            <AvatarStack people={CAST.slice(0, 3)} total={3} />
          </Cell>
          <Cell label="FORTY-TWO · CAPPED">
            <AvatarStack people={CAST} total={42} />
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="`total` is authoritative and `people` is a sample"
        lede={
          <>
            The two are separate props on purpose. A program with forty clients must not ship forty names to
            draw four discs, so the wire caps the array &mdash; and the overflow figure is computed off{' '}
            <code>total</code>, which is counted server-side. Derived from <code>people.length</code> instead,
            every program in the product would silently cap at its payload size and a shelf of forty-client
            blocks would all read <code>+2</code>.
          </>
        }
      >
        <DoDont
          yes={{
            figure: <AvatarStack people={CAST} total={42} />,
            caption: (
              <>
                Six names on the wire, four drawn, <code>total={42}</code>. The figure is the truth about the
                program.
              </>
            ),
          }}
          no={{
            figure: <AvatarStack people={CAST} />,
            caption: (
              <>
                The same six names with no <code>total</code>. It is not wrong &mdash; it is the sample
                describing itself &mdash; and on a capped wire it is a program with forty-two clients reporting
                six.
              </>
            ),
          }}
        />
      </Blk>

      <Blk
        title="Sizes"
        tag="scale"
        lede="It takes Avatar's own scale. `sm` is the list row's, and it is the only size any call-site has needed so far — the larger two are here because the stack must not be the reason somebody hand-rolls one."
      >
        <Bench style={{ gap: 26 }}>
          <Cell label="SM · 24px">
            <AvatarStack people={CAST} total={42} size="sm" />
          </Cell>
          <Cell label="MD · 32px">
            <AvatarStack people={CAST} total={42} size="md" />
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="The ring is the separator, and it is the surface it sits on"
        lede={
          <>
            Two adjacent discs of similar hue read as one blob without it. It is a <code>box-shadow</code>{' '}
            rather than a border so it costs the disc no inner room &mdash; a bordered <code>.av--sm</code>{' '}
            shrinks its initials to 22px and clips them &mdash; and it is the SURFACE colour rather than a line,
            because a <code>--tx-line</code> stroke around a circle at 60% overlap draws a stack of crescents.
            On anything but the page ground, set <code>--avs-ring</code> where the stack sits.
          </>
        }
      >
        <Bench style={{ gap: 26 }}>
          <Cell label="ON THE PAGE GROUND">
            <AvatarStack people={CAST} total={42} />
          </Cell>
          <Cell label="ON A FILLED ROW · --avs-ring SET">
            <span
              style={{
                display: 'inline-flex',
                padding: '8px 12px',
                borderRadius: 'var(--tx-r2)',
                background: 'var(--tx-surface-2)',
                ['--avs-ring' as string]: 'var(--tx-surface-2)',
              }}
            >
              <AvatarStack people={CAST} total={42} />
            </span>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="It is aria-hidden, and the caller owes a count"
        lede={
          <>
            Like <code>Avatar</code> itself. Announcing thirteen sets of initials before &ldquo;13 clients on
            this&rdquo; is a list nobody asked for, read in place of the fact. Every call-site draws this beside
            a written count &mdash; clipped at desk width on <code>ProgramRow</code>, shown again under 900px
            &mdash; and a call-site with no count beside it is the defect, not a variant.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '14px 16px' }}>
          <span style={{ display: 'inline-flex', gap: 12, alignItems: 'center' }}>
            <AvatarStack people={CAST} total={42} />
            <span style={{ fontSize: 12.5, color: 'var(--tx-ink-2)' }}>42 clients on this</span>
          </span>
        </Bench>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Overlap', value: '−7px', note: 'margin-left, never a transform — a transform leaves the box one disc wide' },
            { property: 'Separator', value: '2px ring', token: '--avs-ring', note: 'box-shadow in the surface colour, not a border' },
            { property: 'Default max', value: '4', note: 'Then a +N disc' },
            { property: 'Overflow disc', value: 'mono 10px', token: '--tx-surface-3', note: 'Not an avatar — a number on an identity colour reads as a thirteenth person' },
            { property: 'Name', value: 'at total = 1', note: 'Ellipsised; it is the only part whose width is a name' },
            { property: 'Empty', value: 'renders null', note: 'The caller draws its own — see ProgramRow’s “nobody on this yet”' },
            { property: 'Accessibility', value: <code>aria-hidden</code>, note: 'The count beside it is the accessible text' },
          ]}
        />
      </Blk>

      <Blk
        title="Do and don’t"
        tag="guidelines"
        lede={
          <>
            <code>Avatar</code>&rsquo;s own don&rsquo;t reads &ldquo;avatars alone, standing in for
            names&rdquo; &mdash; and this component is a row of avatars with no names against most of them. It
            is not the same claim. A stack does not identify anybody: it answers <i>is anybody on this</i>, at a
            glance, with the exact figure written beside it and every face leading to the same place. The moment
            a reader has to tell two discs apart, the stack is the wrong component and a list is the right one.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <span style={{ display: 'inline-flex', gap: 12, alignItems: 'center' }}>
                <AvatarStack people={CAST} total={42} />
                <span style={{ fontSize: 12.5, color: 'var(--tx-ink-2)' }}>42 on this</span>
              </span>
            ),
            caption:
              'A count you can see. Nobody is being identified, and the figure is right there for anybody who wants it.',
          }}
          no={{
            figure: (
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <Avatar id="cl-002" name="Divya Krishnan" size="sm" />
                <span style={{ fontSize: 12.5, color: 'var(--tx-ink-3)' }}>&rarr;</span>
                <Avatar id="cl-005" name="Rohan Sharma" size="sm" />
              </span>
            ),
            caption:
              'Two discs the reader is expected to tell apart — who moved, whose session this is, which one to press. Two clients in a roster of twenty-four share initials and the colour is a hash rather than a label. Name them.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
