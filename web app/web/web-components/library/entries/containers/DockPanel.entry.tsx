import type { ReactNode } from 'react';

import { Button } from '../../../ui/Button';
import { Chip } from '../../../ui/Chip';
import { DockPanel } from '../../../ui/DockPanel';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/* The 13px cross the product's panels close with, drawn here rather than
   imported so the page does not reach into `components/`. */
function CloseIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/* A dock is 380px of a three-track grid. On this page there is no grid, so the
   specimens are given the width directly — the one thing about them that is a
   drawing rather than the component. */
function Frame({ children, h = 300 }: { children: ReactNode; h?: number }) {
  return (
    <div
      style={{
        display: 'flex',
        height: h,
        width: 380,
        border: '1px solid var(--tx-line)',
        borderRadius: 'var(--tx-r2)',
        overflow: 'hidden',
        background: 'var(--tx-canvas)',
      }}
    >
      {children}
    </div>
  );
}

export function DockPanelEntry() {
  const entry = byId('c-dock')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/DockPanel.tsx</code> },
        { k: 'Class', v: <code>.dock</code> },
        { k: 'Width', v: '380px, as a grid track' },
        { k: 'Opened by', v: <code>.split:has(&gt; .dock)</code> },
        { k: 'Under 1180px', v: 'a full-screen sheet' },
      ]}
    >
      <Blk
        title="Specimen"
        lede="A head, a scrolling body and a button row. The head's subtitle is what the row being edited currently says, because the panel is how it gets changed."
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Frame>
            <DockPanel label="Edit Barbell back squat">
              <DockPanel.Head
                title="Barbell back squat"
                sub="4 × 8 · 90s rest"
                actions={
                  <Button variant="ghost" iconOnly label="Close" title={undefined} icon={<CloseIcon />} />
                }
              />
              <DockPanel.Body>
                <div className="row gap2">
                  <Chip pressed>Reps</Chip>
                  <Chip>Time</Chip>
                </div>
                <p className="small" style={{ margin: 0 }}>
                  Four sets of eight. The rows above and below this one are still on screen, which is the
                  whole reason this is a column and not a sheet.
                </p>
              </DockPanel.Body>
              <DockPanel.Foot>
                <Button variant="ghost">Cancel</Button>
                <Button>Save the row</Button>
              </DockPanel.Foot>
            </DockPanel>
          </Frame>
        </Bench>
      </Blk>

      <Blk
        title="It pushes; it does not cover"
        lede={
          <>
            This is the difference from <code>Panel</code>, and it is the reason the component exists.{' '}
            <code>.panel</code> is <code>position:absolute</code> with a shadow and an entrance animation, so
            it floats over what was behind it. <code>.dock</code> is a grid track:{' '}
            <code>.split:has(&gt; .dock)</code> opens a third column and the plane gives up 380px. Rendering
            the component IS the layout change, so there is no flag to keep in sync with it.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <div style={{ display: 'flex', gap: 0, width: 320, height: 130 }}>
                <div
                  style={{
                    flex: 1,
                    background: 'var(--tx-surface-2)',
                    borderRight: '1px solid var(--tx-line)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 11,
                    color: 'var(--tx-ink-3)',
                  }}
                >
                  the rows, narrower
                </div>
                <div style={{ width: 118, background: 'var(--tx-surface)', display: 'grid', placeItems: 'center', fontSize: 11 }}>
                  the dock
                </div>
              </div>
            ),
            caption: (
              <>
                The four rows this one is being set against are still readable. That is what the trainer is
                deciding <i>4 × 8</i> by looking at.
              </>
            ),
          }}
          no={{
            figure: (
              <div style={{ position: 'relative', width: 320, height: 130 }}>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'var(--tx-surface-2)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 11,
                    color: 'var(--tx-ink-3)',
                  }}
                >
                  the rows
                </div>
                <div
                  style={{
                    position: 'absolute',
                    inset: '0 0 0 auto',
                    width: 150,
                    background: 'var(--tx-surface)',
                    borderLeft: '1px solid var(--tx-line-strong)',
                    boxShadow: 'var(--tx-e3)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 11,
                  }}
                >
                  a sheet
                </div>
              </div>
            ),
            caption: (
              <>
                A sheet covers the rows nearest the one being edited &mdash; the ones the number is relative
                to. Right for a payment, wrong for a set count.
              </>
            ),
          }}
        />
      </Blk>

      <Blk
        title="A list gives up the gutter"
        lede={
          <>
            The body is <code>14px</code> of padding and a <code>12px</code> gap, which is right for a stack of
            fields. Rows that carry their own dividers need to reach the panel&rsquo;s edges, or every
            separator stops 14px short of the border &mdash; the tell that a list is wearing a form&rsquo;s
            padding. <code>list</code> is that, and the filter strip sits <b>outside</b> the body&rsquo;s
            scroller so the search does not scroll away from the rows it is filtering.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Frame h={272}>
            <DockPanel label="The exercise library">
              <DockPanel.Head title="Add an exercise" />
              <DockPanel.Filters>
                <Chip>Legs</Chip>
              </DockPanel.Filters>
              <DockPanel.Body list>
                {['Barbell back squat', 'Front squat', 'Bulgarian split squat', 'Leg press'].map((n) => (
                  <div
                    key={n}
                    style={{
                      padding: '11px 6px',
                      borderBottom: '1px solid var(--tx-line)',
                      fontSize: 13,
                    }}
                  >
                    {n}
                  </div>
                ))}
              </DockPanel.Body>
            </DockPanel>
          </Frame>
        </Bench>
      </Blk>

      <Blk
        title="The parts are usable without the root, and that is not a loophole"
        lede={
          <>
            The <i>new program</i> dialog draws <code>Head</code>, <code>Body</code> and <code>Foot</code>{' '}
            inside a <code>.pg__dialog</code> with no dock around them. A dialog and a docked panel share a
            header, a scrolling body and a button row; the alternative is a second set of classes that drift
            apart from these. Same reason <code>Card.Head</code> is exported.
          </>
        }
      />

      <Blk
        title="What it was before, and what the name was hiding"
        lede={
          <>
            These classes were <code>.pg__panel*</code> in <code>app/styles/app.css</code> &mdash; wrong on
            both halves. Not a <code>.pg</code> element: the week builder&rsquo;s <code>LibraryDock</code>{' '}
            wears it, and <code>.pg</code> is the programs screen. Not a <code>.panel</code> either, which is
            the overlay above. Six screens hand-wrote the markup and one of them left a comment saying it
            &ldquo;wears <code>.pg__panel</code> rather than <code>.panel</code>&rdquo; and why &mdash; a
            component this page could have carried instead.
          </>
        }
      >
        <SpecTable
          rows={[
            { property: 'label', token: 'string', value: 'required', note: 'It is an <aside>. An unnamed landmark is one a reader cannot tell from the others.' },
            { property: 'Head · sub', token: 'ReactNode', value: '—', note: 'Brings the wrapping div that .dock__hd > div styles. Absent means no wrapper.' },
            { property: 'Head · actions', token: 'ReactNode', value: '—', note: 'Not an onClose: each screen imports its own close glyph.' },
            { property: 'Body · list', token: 'boolean', value: 'false', note: 'Rows reach the edges. gap:0, padding:0 8px 8px.' },
            { property: 'Foot · stack', token: 'boolean', value: 'false', note: 'Full-width, for a primary and a destructive rather than a pair.' },
            { property: 'className', token: 'string', value: '—', note: 'For a dock with its own internals — `dock wslib wslib--drawer`.' },
          ]}
        />
      </Blk>
    </Cmp>
  );
}
