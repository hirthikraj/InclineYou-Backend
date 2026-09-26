'use client';

import type { ReactNode } from 'react';

import { TRAINER_EMPTY, trainerViews } from '@/components/shell/notificationViews';
import type { Notification } from '@/lib/notifications/types';

import { NotificationPanel } from '../../../ui/NotificationPanel';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { RulesTable, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/**
 * The panel is `position:absolute` and anchored to `.app`, which is the one
 * thing `/library` does not have — §23's bench is a block in a scrolling
 * document. So every specimen stands in a `Frame`: a positioned box of a fixed
 * size, with `--w-top` zeroed so the panel's 56px offset does not open the
 * demo with an empty strip.
 *
 * A scaffold, not a variant. Nothing here changes a rule in §03 — it supplies
 * the containing block the shell supplies in the product, which is why it is
 * inline style on a wrapper rather than a `.ntf--library` modifier that would
 * then exist in the stylesheet for the benefit of one page.
 *
 * ── `h` IS REQUIRED, AND THAT IS THE FIX FOR A BUG THIS PAGE SHIPPED WITH ──
 *
 * It had a 560px default and three callers took a smaller number off the top of
 * my head. `.ntf`'s max-height is `100% − --w-top − 28`, so a frame that is
 * 70px short of its panel does not clip the panel — it makes the panel's LIST
 * scroll, which on a bench looks exactly like a panel that fits. The two-row
 * comparison block was showing one row, on the page whose whole subject is what
 * the second row looks like beside the first.
 *
 * So there is no default: every caller states the height, and the number is the
 * measured height of the specimen plus a little. If a specimen grows, the frame
 * has to be re-measured — which is the honest cost of standing an absolutely
 * positioned component on a page that has no shell.
 */
function Frame({ h, children }: { h: number; children: ReactNode }) {
  return (
    <div
      style={{
        position: 'relative',
        width: 432,
        height: h,
        ['--w-top' as string]: '0px',
      }}
    >
      {children}
    </div>
  );
}

const HOUR = 3_600_000;
const DAY = 86_400_000;
/* A FIXED instant, not `Date.now()`. Every stamp on this panel is relative, so
   a specimen dated from the clock reads "2 h" on one visit and "3 h" on the
   next — a component page whose figures move is one nobody can diff against a
   screenshot. It is also what a `Date.now()` in a render costs on this half:
   `MonthPicker` was deleted for exactly that lint error. */
const NOW = new Date('2026-08-30T18:40:00').getTime();

const ROWS: Notification[] = [
  {
    id: 'n1', kind: 'payment', clientId: 'c1', clientName: 'Rohan Sharma',
    amount: 9000, subjectAt: null, text: 'gym', at: NOW - 2 * HOUR, readAt: null,
  },
  {
    id: 'n2', kind: 'cancelled', clientId: 'c2', clientName: 'Divya Krishnan',
    amount: null, subjectAt: NOW + 20 * HOUR, text: 'Full B', at: NOW - 5 * HOUR, readAt: null,
  },
  {
    id: 'n3', kind: 'metric', clientId: 'c3', clientName: 'Nikhil Kumar',
    amount: null, subjectAt: null, text: '78.4 kg', at: NOW - 9 * HOUR, readAt: null,
  },
  {
    id: 'n4', kind: 'team', clientId: 'c4', clientName: 'Meera Reddy',
    amount: null, subjectAt: null, text: 'Harini Balaji', at: NOW - 28 * HOUR,
    readAt: NOW - 26 * HOUR,
  },
  {
    id: 'n5', kind: 'payment', clientId: 'c5', clientName: 'Arjun Subramanian',
    amount: 12000, subjectAt: null, text: 'upi', at: NOW - 3 * DAY, readAt: NOW - 3 * DAY,
  },
];

const noop = () => {};

/**
 * The specimens go through the trainer's own adapter rather than hand-building
 * views, and that is the point of the bench: `/library` renders the same two
 * modules the shell does, so a plate tone or a sentence changed in
 * `lib/notifications/copy.ts` shows up here without anybody remembering to
 * update a fixture. A hand-written `NotificationView[]` would be a third
 * spelling of the feed, which is the drift this page exists to catch.
 */
const VIEWS = trainerViews(ROWS);

export function NotificationsEntry() {
  const entry = byId('c-notify')!;

  return (
    <Cmp
      entry={entry}
      status="beta"
      meta={[
        { k: 'Component', v: <code>ui/NotificationPanel.tsx</code> },
        { k: 'Class', v: <code>.ntf</code> },
        { k: 'Width', v: '400px · full width under 640' },
        { k: 'Kinds', v: 'set by the caller — 4 on the trainer’s feed, 5 on the client’s' },
        { k: 'Used in', v: 'both shells, behind the top bar’s bell' },
      ]}
    >
      <Blk
        title="Specimen"
        lede={
          <>
            Five events over three days, two of them already read. The panel holds the whole feature —
            there is no notifications <b>screen</b>, and the footer says how far back the list goes
            because that is the only thing that makes “everything is in here” an honest promise.
          </>
        }
      >
        <Bench style={{ alignItems: 'flex-start' }}>
          <Frame h={560}>
            <NotificationPanel
              notifications={VIEWS}
              now={NOW}
              onOpen={noop}
              onMarkAll={noop}
              onClose={noop}
              empty={TRAINER_EMPTY}
            />
          </Frame>
        </Bench>
      </Blk>

      <Blk
        title="What goes in it"
        lede={
          <>
            A notification is an <b>event</b>: somebody else did something, at a time, and the trainer
            was not looking. Today’s <i>Needs you today</i> is <b>state</b> — computed from the book,
            true until it is fixed, and carrying the verb that fixes it. The two surfaces would
            otherwise be one surface drawn twice, and every verb in the product would have two homes.
          </>
        }
      >
        <RulesTable
          rows={[
            {
              rule: 'A row carries a verb',
              yes: 'Today’s queue — Renew, Remind, Mark',
              no: 'The bell. A row links to the thing it happened to and writes nothing.',
            },
            {
              rule: 'A row leaves the list',
              yes: 'The bell — when it is read',
              no: 'Today’s queue — when the condition stops being true',
            },
            {
              rule: 'A kind is shipped',
              yes: 'The product can observe it happening',
              no: 'It would need a channel this app does not have — a WhatsApp reply, say',
            },
          ]}
        />
      </Blk>

      <Blk
        title="States"
        lede={
          <>
            Unread is <b>two steps of ink and a dot</b>, never a tinted row: a wash fights the hover
            state, which is the only thing saying the row is clickable, and on a list where most rows
            are unread it paints most of the panel a colour that then means nothing.
          </>
        }
      >
        <Bench style={{ gap: 26, alignItems: 'flex-start' }}>
          <Cell label="EVERYTHING READ · NO FILTER, NO MARK-ALL">
            <Frame h={520}>
              <NotificationPanel
                notifications={VIEWS.map((n) => ({ ...n, readAt: n.readAt ?? n.at + HOUR }))}
                now={NOW}
                onOpen={noop}
                onMarkAll={noop}
                onClose={noop}
                empty={TRAINER_EMPTY}
              />
            </Frame>
          </Cell>
          <Cell label="NOTHING AT ALL">
            <Frame h={360}>
              <NotificationPanel
                notifications={[]}
                now={NOW}
                onOpen={noop}
                onMarkAll={noop}
                onClose={noop}
                empty={TRAINER_EMPTY}
              />
            </Frame>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="The dot’s column is always there"
        lede={
          <>
            Column one is a 14px gutter whether or not a dot is in it, so marking a row read changes
            two colours and moves nothing — both rows below start their plate at the same x. A list
            that reflows under the pointer as rows are read is a list you lose your place in, which
            is the whole reason the gutter is a track and not a conditional element.
            <br />
            <br />
            There is no <b>Don’t</b> beside it, deliberately: §23’s rule for this page is that both
            halves render real components, so a wrong half has to be something the product can be
            made to do. This one cannot — the column is in{' '}
            <code>grid-template-columns</code> and the dot is the only thing that can be absent from
            it.
          </>
        }
      >
        <Bench style={{ alignItems: 'flex-start' }}>
          <Frame h={344}>
            <NotificationPanel
              notifications={[VIEWS[0], { ...VIEWS[1], readAt: NOW - HOUR }]}
              now={NOW}
              onOpen={noop}
              onMarkAll={noop}
              onClose={noop}
              empty={TRAINER_EMPTY}
            />
          </Frame>
        </Bench>
      </Blk>

      <Blk title="Spec">
        <SpecTable
          rows={[
            { property: 'Width', value: '400px', token: '—', note: 'Full width less 6px each side under 640' },
            { property: 'Anchor', value: 'top: --w-top + 6, right: 14', token: '--w-top', note: 'A sibling of .top, never a child — the bar is a stacking context' },
            { property: 'Max height', value: 'min(560px, 100% − --w-top − 28)', token: '—', note: '72dvh on a phone' },
            { property: 'Layer', value: 'z 35', token: '—', note: 'Over the panel (30), under a modal (41) and the palette (50)' },
            { property: 'Row', value: '14 / 30 / 1fr / auto', token: '—', note: 'Dot gutter, kind plate, text, stamp' },
            { property: 'Plate tones', value: 'ok · warn · floor · accent · remote', token: '--tx-*-soft', note: 'Never danger — a notification is not an emergency' },
            { property: 'Entrance', value: 'tx-pop 180ms', token: '--tx-t-fast', note: 'Origin top right, off under prefers-reduced-motion' },
          ]}
        />
      </Blk>
    </Cmp>
  );
}
