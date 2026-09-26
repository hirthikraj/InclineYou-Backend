import { Plus, Send } from '@/components/shell/Icons';

import { Button, buttonClass } from '../../../ui/Button';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { Anatomy, DoDont, Matrix, RulesTable, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/**
 * Button — the first entry written against the real component.
 *
 * Every specimen below is `<Button>`: the same import `components/today/Hero.tsx`
 * renders. Nothing here is a copy of the product's markup, so nothing here can
 * describe a button the product does not have.
 */
export function ButtonEntry() {
  const entry = byId('c-button')!;

  const focusRing = {
    outline: '2px solid var(--tx-focus)',
    outlineOffset: 2,
    boxShadow: '0 0 0 5px var(--tx-focus-halo)',
  };

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Button.tsx</code> },
        { k: 'Class', v: <code>.btn</code> },
        { k: 'Variants', v: '4' },
        { k: 'Sizes', v: '3' },
        { k: 'States', v: '6' },
        { k: 'Call-sites', v: '340' },
      ]}
    >
      <Blk title="Specimen">
        <Bench style={{ gap: 14 }}>
          <Button variant="primary">Record payment</Button>
          <Button variant="secondary" icon={<Send />}>
            Nudge
          </Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">Archive client</Button>
        </Bench>
      </Blk>

      <Blk title="Anatomy">
        <Anatomy
          figure={
            <Button variant="primary" size="lg" icon={<Plus />} style={{ minWidth: 210 }}>
              Add client
            </Button>
          }
          pins={[
            {
              n: 1,
              dir: 'r',
              style: { left: -46, top: 11, '--l': '30px' },
              title: 'Container',
              body: (
                <>
                  The hit area. <code>height</code> is fixed per size; width is content plus padding, never a
                  grid unit. <code>border-radius: var(--tx-r2)</code>, 8px.
                </>
              ),
            },
            {
              n: 2,
              dir: 'd',
              style: { left: 18, top: -46, '--l': '30px' },
              title: 'Leading icon · optional',
              body: (
                <>
                  15px at <code>stroke-width 1.6</code>, passed as the <code>icon</code> prop. Only for actions
                  with a real glyph — plus, send, download. Never decoration.
                </>
              ),
            },
            {
              n: 3,
              dir: 'd',
              style: { left: 96, top: -46, '--l': '30px' },
              title: 'Label',
              body: '13.5px / 600. Sentence case, verb first, three words or fewer.',
            },
            {
              n: 4,
              dir: 'l',
              style: { right: -46, top: 11, '--l': '30px' },
              title: 'Padding',
              body: '14px each side, 12px when an icon is present, so the optical weight matches.',
            },
            {
              n: 5,
              dir: 'u',
              style: { left: 50, bottom: -46, '--l': '30px' },
              title: 'Focus ring',
              body: (
                <>
                  2px <code>--tx-focus</code> offset 2px, plus a 3px halo. Never removed, never replaced by a
                  colour change alone.
                </>
              ),
            },
          ]}
        />
      </Blk>

      <Blk
        title="Variants"
        lede={
          <>
            Four, and the count is deliberate. Emphasis is a hierarchy, not a palette: if two buttons in a row
            are both primary, neither is. <code>secondary</code> is the default, so a call-site that names no
            variant cannot accidentally claim the page&rsquo;s one primary.
          </>
        }
      >
        <Bench style={{ gap: 22 }}>
          <Cell label="PRIMARY · one per screen">
            <Button variant="primary">Save changes</Button>
          </Cell>
          <Cell label="SECONDARY · the default">
            <Button>Discard</Button>
          </Cell>
          <Cell label="GHOST">
            <Button variant="ghost">Clear all</Button>
          </Cell>
          <Cell label="DANGER">
            <Button variant="danger">Delete account</Button>
          </Cell>
          <Cell label="DISABLED">
            <Button variant="primary" disabled>
              Save changes
            </Button>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="States"
        lede={
          <>
            Hover, focus and pressed are drawn here with the declarations §04 applies, because a static page
            cannot hover itself. <b>Loading</b> is real on the web: <code>.btn--loading</code> exists in the
            design system, and the note that a save has already succeeded by the time the pointer lifts was
            written for the offline phone. This half writes straight to the server.
          </>
        }
      >
        <Matrix
          rowHeader="Variant"
          columns={['Rest', 'Hover', 'Focus-visible', 'Pressed', 'Disabled']}
          rows={[
            {
              label: 'Primary',
              cells: [
                <Button key="r" variant="primary">
                  Save
                </Button>,
                <Button key="h" variant="primary" style={{ background: 'var(--tx-accent-press)' }}>
                  Save
                </Button>,
                <Button key="f" variant="primary" style={focusRing}>
                  Save
                </Button>,
                <Button
                  key="p"
                  variant="primary"
                  style={{ background: 'var(--tx-accent-press)', transform: 'translateY(1px)' }}
                >
                  Save
                </Button>,
                <Button key="d" variant="primary" disabled>
                  Save
                </Button>,
              ],
            },
            {
              label: 'Secondary',
              cells: [
                <Button key="r">Nudge</Button>,
                <Button
                  key="h"
                  style={{ background: 'var(--tx-surface-3)', borderColor: 'var(--tx-line-strong)' }}
                >
                  Nudge
                </Button>,
                <Button key="f" style={focusRing}>
                  Nudge
                </Button>,
                <Button key="p" style={{ transform: 'translateY(1px)' }}>
                  Nudge
                </Button>,
                <Button key="d" disabled>
                  Nudge
                </Button>,
              ],
            },
            {
              label: 'Danger',
              cells: [
                <Button key="r" variant="danger">
                  Archive
                </Button>,
                <Button key="h" variant="danger" style={{ filter: 'brightness(1.08)' }}>
                  Archive
                </Button>,
                <Button key="f" variant="danger" style={focusRing}>
                  Archive
                </Button>,
                <Button key="p" variant="danger" style={{ transform: 'translateY(1px)' }}>
                  Archive
                </Button>,
                <Button key="d" variant="danger" disabled>
                  Archive
                </Button>,
              ],
            },
          ]}
        />
      </Blk>

      <Blk
        title="Sizes"
        tag="scale"
        lede="Large is for the one action a page exists to perform, and for the wizard. Small belongs inside a table row or a card header, never on its own in a toolbar."
      >
        <Bench style={{ gap: 26 }}>
          <Cell label="LARGE · 40px">
            <Button variant="primary" size="lg" icon={<Plus />}>
              Add client
            </Button>
          </Cell>
          <Cell label="DEFAULT · 34px">
            <Button variant="primary" icon={<Plus />}>
              Add client
            </Button>
          </Cell>
          <Cell label="SMALL · 28px">
            <Button variant="primary" size="sm">
              Add
            </Button>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="As a link"
        lede={
          <>
            Sixty-three call-sites put <code>.btn</code> on a <code>next/link</code>. Passing <code>href</code>{' '}
            renders one — same classes, correct element. A control that changes place is an anchor, and making
            it a button breaks middle-click, open-in-new-tab and the status bar.
          </>
        }
      >
        <Bench style={{ gap: 14 }}>
          <Button href="/clients" variant="secondary">
            All clients
          </Button>
          <Button href="/schedule" variant="ghost">
            Full schedule
          </Button>
        </Bench>
      </Blk>

      <Blk
        title="Icon only"
        lede={
          <>
            <code>iconOnly</code> requires <code>label</code> at the type level — an icon button with no
            accessible name will not compile. The label becomes both <code>aria-label</code> and the tooltip.
          </>
        }
      >
        <Bench style={{ gap: 14 }}>
          <Button iconOnly label="Add client" icon={<Plus />} variant="primary" />
          <Button iconOnly label="Send a nudge" icon={<Send />} />
          <Button iconOnly label="Add client" icon={<Plus />} size="sm" variant="ghost" />
        </Bench>
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            {
              property: 'Height',
              value: '34px',
              note: (
                <>
                  Large 40px (<code>.btn--lg</code>), small 28px (<code>.btn--sm</code>)
                </>
              ),
            },
            { property: 'Padding inline', value: '14px', note: '12px when a leading icon is present' },
            { property: 'Radius', value: '8px', token: '--tx-r2', note: 'Shared with fields, cards and chips' },
            { property: 'Label', value: '13.5px / 600', token: '--tx-font', note: 'Small size drops to 12.5px' },
            { property: 'Icon', value: '15px', note: 'Gap 7px; 18px only in an icon button' },
            {
              property: 'Min target',
              value: '34 × 34',
              token: '--w-tap',
              note: 'Clears WCAG 2.2 SC 2.5.8 (24×24) with margin',
            },
            {
              property: 'Primary fill',
              value: '#C6F24E',
              token: '--tx-accent',
              note: (
                <>
                  Ink is <code>--tx-accent-ink</code> at 15.2:1
                </>
              ),
            },
            {
              property: 'Danger fill',
              value: '#D93036',
              token: '--tx-danger-fill',
              note: (
                <>
                  White ink, 4.9:1 — <b>not</b> <code>--tx-danger</code>, which is a text colour
                </>
              ),
            },
            { property: 'Transition', value: '180ms', token: '--tx-t-fast', note: 'Background and border only' },
            {
              property: 'Default class',
              value: <code>{buttonClass({})}</code>,
              note: 'What a call-site with no props produces',
            },
          ]}
        />
      </Blk>

      <Blk title="Content">
        <RulesTable
          rows={[
            { rule: 'Verb first', yes: 'Record payment', no: 'Payment' },
            { rule: 'Say the object', yes: 'Archive client', no: 'Confirm' },
            { rule: 'Three words or fewer', yes: 'Send weekly report', no: 'Send the weekly report now' },
            { rule: 'Sentence case', yes: 'Add client', no: 'Add Client' },
            { rule: 'No terminal punctuation', yes: 'Save changes', no: 'Save changes.' },
            {
              rule: 'Match the heading it answers',
              yes: '“Archive Meera?” → Archive',
              no: '“Archive Meera?” → OK',
            },
          ]}
        />
      </Blk>

      <Blk title="Do and don&rsquo;t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <div className="bench__row" style={{ gap: 14, alignItems: 'center', flexWrap: 'nowrap' }}>
                <Button variant="primary">Record payment</Button>
                <Button variant="ghost">Cancel</Button>
              </div>
            ),
            caption: (
              <>
                One primary, one quiet escape. The eye finds the action in a single fixation, and <b>Cancel</b>{' '}
                earns no emphasis because nothing is at stake in leaving.
              </>
            ),
          }}
          no={{
            figure: (
              <div className="bench__row" style={{ gap: 14, alignItems: 'center', flexWrap: 'nowrap' }}>
                <Button variant="primary">Record payment</Button>
                <Button variant="primary">Send receipt</Button>
                <Button variant="secondary">Cancel</Button>
              </div>
            ),
            caption:
              'Two primaries and a bordered cancel. The trainer now has to read three labels to find out which one the panel was for.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
