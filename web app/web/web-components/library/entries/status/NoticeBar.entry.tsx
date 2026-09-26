import { NoticeBar } from '../../../ui/NoticeBar';
import { Button } from '../../../ui/Button';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/* The 14px glyph the schedule's move bar carries, drawn here rather than
   imported so the page does not reach into `components/` — the same rule
   `Message.entry` states for its own warning triangle. */
function Warn({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l9 16H3l9-16z" />
      <path d="M12 9v5" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export function NoticeBarEntry() {
  const entry = byId('c-noticebar')!;

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/NoticeBar.tsx</code> },
        { k: 'Class', v: <code>.ntc</code> },
        { k: 'Tones', v: 'accent · info' },
        { k: 'Height', v: '46.8px at one line, 9px/24px padding' },
      ]}
    >
      <Blk
        title="Specimen"
        lede="A band above a surface that still draws, saying what is true of it."
      >
        <Bench style={{ gap: 14, alignItems: 'stretch' }}>
          <Cell label="ACCENT — a mode you are in">
            <NoticeBar
              tone="accent"
              live
              icon={<Warn />}
              action={<Button variant="ghost" size="sm">Cancel</Button>}
            >
              Moving <b>Kavya Chandran</b> — tap or click where it should go.
            </NoticeBar>
          </Cell>
          <Cell label="INFO — a standing condition">
            <NoticeBar action={<Button variant="secondary" size="sm">Set your hours</Button>}>
              You have not told us when you work, so nothing is hatched and no gap is priced.
            </NoticeBar>
          </Cell>
          <Cell label="INFO — no action">
            <NoticeBar>
              No sessions match the filters — 43 sessions are hidden in this week.
            </NoticeBar>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="The boundary with the three components it is not"
        lede={
          <>
            <code>Message</code> answers a <b>submission</b> and lives inside a form, between the last field and
            the button. <code>Toast</code> is a receipt for an event that has finished and then goes away.{' '}
            <code>EmptyState</code> <b>replaces</b> a surface that has nothing in it. This one belongs to a
            surface that still draws and states a condition of it — which is why an empty schedule range gets a
            notice bar and not an empty state: the grid under it is still seven columns of bookable track, and
            replacing it would take the fastest way to book off the screen at the one moment booking is the only
            thing left to do there.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <div style={{ width: 300 }}>
                <NoticeBar action={<Button variant="secondary" size="sm">Book a session</Button>}>
                  Nothing booked this week. Click any empty slot to book at that time.
                </NoticeBar>
              </div>
            ),
            caption: <>The surface stays. The bar says what is true of it, and offers the way in.</>,
          }}
          no={{
            figure: (
              <div style={{ width: 300 }}>
                <NoticeBar tone="accent" icon={<Warn />}>
                  Saved. Packs already sold are untouched.
                </NoticeBar>
              </div>
            ),
            caption: (
              <>
                An event that has finished, so it is a <code>Toast</code>. A bar that does not go away is the
                wrong shape for a fact that stopped being true the moment it was read.
              </>
            ),
          }}
        />
      </Blk>

      <Blk
        title="The tone is what the bar is, not what colour it is"
        lede={
          <>
            <code>accent</code> is a <b>mode</b> the reader is in and can leave — it changes what the next click
            does, so it is the loud one and it should be announced. <code>info</code> is a <b>standing
            condition</b> of the screen: true when the page loaded and true after, so it is quiet and it is not
            announced. That split is what <code>.sch__moving</code> and <code>.sch__nohours</code> already
            encoded across two class names and never wrote down.
          </>
        }
      >
        <SpecTable
          rows={[
            { property: 'tone', token: 'accent | info', value: 'info', note: 'A mode, or a standing condition.' },
            { property: 'icon', token: 'ReactNode', value: '—', note: '14px. No space reserved when absent, unlike .msg.' },
            { property: 'live', token: 'boolean', value: 'false', note: 'role="status". True for a mode, false for a condition.' },
            { property: 'action', token: 'ReactNode', value: '—', note: 'At most one, pinned right. Two verbs is a toolbar.' },
            { property: 'children', token: 'ReactNode', value: 'required', note: 'Wrapped in a span so the action has something to push off.' },
          ]}
        />
      </Blk>

      <Blk
        title="Extracted at the third call-site, not the second"
        lede={
          <>
            <code>.sch__moving</code> and <code>.sch__nohours</code> in <code>app.css</code> were this bar twice
            — identical geometry, identical face, two fills — and the second was already a copy of the first.
            Two is a coincidence; the schedule&rsquo;s empty-range band would have been the third, in the same
            file, with the same declarations. Every value in <code>.ntc</code> is theirs unchanged, so both
            originals now render through this component with a computed-style diff of <b>nothing</b> across
            fifteen box properties and an identical 46.8px height.
          </>
        }
      />
    </Cmp>
  );
}
