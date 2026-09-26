'use client';

import { useRef, useState, type ReactNode } from 'react';

import { Button } from '../../../ui/Button';
import { Toast } from '../../../ui/Toast';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/** The deck's own box, un-pinned.
 *
 *  `.toasts` is `position:fixed` in the real app — it is a corner of the
 *  viewport, not a box in a page. A bench cannot use it as authored without
 *  four specimens piling into the bottom-right of the library itself, so the
 *  class is kept (every rule the cards read hangs off it) and only the pinning
 *  is undone. It is the one thing on this page that is not what ships. */
function Bay({ children, h = 150 }: { children: ReactNode; h?: number }) {
  return (
    /* `width:100%` is load-bearing and was found by measuring: `.bench` is a
       flex column, so a bare block child is a flex ITEM and shrink-wraps — to
       zero here, because everything inside the bay is absolutely positioned.
       The cards then took `width:100%` of nothing and rendered as a 30px
       ribbon of vertical text. */
    <div style={{ position: 'relative', width: '100%', height: h }}>
      <div
        className="toasts"
        style={{ position: 'absolute', inset: 'auto 0 0 auto', width: '100%', maxWidth: 340 }}
      >
        {children}
      </div>
    </div>
  );
}

/** The deck, drawn at rest so a reviewer can read the depth arithmetic off it. */
function Deck() {
  return (
    <Bay>
        <Toast tone="ok" depth={0} title={<>Payment recorded</>} body="₹2,000 · Meera K · UPI" onDismiss={() => {}} />
        <Toast depth={1} title={<>Session moved</>} body="Thu 6:00 am" onDismiss={() => {}} />
        <Toast tone="warn" depth={2} title={<>Pack ends Thursday</>} body="Four days, two sessions left." onDismiss={() => {}} />
      <Toast tone="danger" depth={3} title={<>Export failed</>} body="The server did not answer." onDismiss={() => {}} />
    </Bay>
  );
}

export function ToastEntry() {
  const entry = byId('c-toast')!;
  /** `leaving` is the id on its way out. The bench keeps the same one-frame
   *  hold `lib/toast/store.ts` does — without it a dismiss unmounts the card
   *  before its exit transition has a box to run in, and the specimen would
   *  demonstrate half the motion it is documenting. */
  const [notices, setNotices] = useState<{ id: number; leaving?: boolean }[]>([]);
  const [receipt, setReceipt] = useState<'in' | 'out' | null>(null);
  /* A REF, NOT STATE, and it is the bench's own version of a real bug: two
     presses inside one tick both read the same `next` out of the render's
     closure, so both cards get id 1 — React sees duplicate keys and dismissing
     one takes the other with it. The store does not have this problem because
     its ids carry a random suffix; a counter has to be read and bumped in the
     same statement. */
  const next = useRef(1);

  const dropNotice = (id: number) => {
    setNotices(list => list.map(n => (n.id === id ? { ...n, leaving: true } : n)));
    window.setTimeout(() => setNotices(list => list.filter(n => n.id !== id)), 560);
  };
  const dropReceipt = () => {
    setReceipt('out');
    window.setTimeout(() => setReceipt(null), 560);
  };

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/Toast.tsx</code> },
        { k: 'Class', v: <code>.toast</code> },
        { k: 'Variants', v: '2 motions × 4 tones' },
        { k: 'Width', v: '340px' },
        { k: 'Drawn', v: '4 of the deck' },
      ]}
    >
      <Blk
        title="Specimen — the deck at rest"
        lede={
          <>
            Four confirms, one origin. Depth <code>i</code> poses each card:{' '}
            <code>y = −10i</code>, <code>scale = 1 − 0.06i</code>, <code>opacity = 1 − 0.2i</code>. The front
            card is legible; the ones behind it are a count.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <Deck />
        </Bench>
      </Blk>

      <Blk
        title="Live — both motions"
        lede={
          <>
            Press <b>Notice</b> more than once: the deck reshuffles on a spring, each card a beat behind the
            last. A <b>receipt</b> flies in from the right, holds five seconds and shrinks in place — and it
            can be dragged off to the right.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '18px 20px', minHeight: 190 }}>
          <div className="tools">
            <Button
              size="sm"
              onClick={() => {
                setNotices(list => [{ id: next.current++ }, ...list].slice(0, 5));
              }}
            >
              Notice
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setReceipt('in')} disabled={receipt !== null}>
              Receipt
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => notices.forEach(n => dropNotice(n.id))}
              disabled={notices.length === 0}
            >
              Clear the deck
            </Button>
          </div>
          <Bay>
            {receipt && (
              <Toast
                tone="ok"
                variant="receipt"
                depth={0}
                leaving={receipt === 'out'}
                title={<>Booked</>}
                body="Meera K · Thu 6:00 am"
                action={{ label: 'Undo', onClick: dropReceipt }}
                onDismiss={dropReceipt}
              />
            )}
            {notices.map((n, i) => {
              /* Depth over LIVE cards only, which is `depthOf`'s job in the
                 store — the deck has to close over a card that is leaving
                 rather than hold its slot open. */
              const depth =
                (receipt && receipt !== 'out' ? 1 : 0) +
                notices.slice(0, i).filter(x => !x.leaving).length;
              return (
                <Toast
                  key={n.id}
                  tone="ok"
                  depth={depth}
                  buried={depth > 3}
                  leaving={n.leaving}
                  title={<>Copied into your programs</>}
                  body={`Upper / Lower · copy ${n.id}. The original is untouched.`}
                  onDismiss={() => dropNotice(n.id)}
                />
              );
            })}
          </Bay>
        </Bench>
      </Blk>

      <Blk
        title="The politeness is the component"
        lede={
          <>
            &ldquo;Payment recorded&rdquo; and &ldquo;Export failed&rdquo; are not the same announcement. The
            first is <code>polite</code> &mdash; it can wait for the reader to finish the sentence they are on.
            The second is <code>assertive</code>, because something the trainer asked for did not happen, and
            every second they spend believing it did is a second they act on the wrong book. That is chosen
            from <code>tone</code> here rather than at the call-site, where in practice it is chosen by whoever
            copied the nearest existing toast.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '14px 16px' }}>
          <code style={{ fontSize: 12.5, lineHeight: 1.8 }}>
            tone=&quot;ok&quot; &nbsp;&rarr;&nbsp; role=&quot;status&quot; · aria-live=&quot;polite&quot;
            <br />
            tone=&quot;danger&quot; &rarr;&nbsp; role=&quot;alert&quot; &nbsp;· aria-live=&quot;assertive&quot;
          </code>
        </Bench>
      </Blk>

      <Blk
        title="And the motion is the variant"
        lede={
          <>
            The same argument, one level out. Which entrance a confirm gets is a fact about the news &mdash; is
            this one of a run, or is it a single thing with a clock on it &mdash; so it is a prop with two
            values rather than a bag of durations each call site sets for itself.
          </>
        }
      >
        <SpecTable
          rows={[
            { property: 'notice · enter', value: 'y +60 → 0, scale .85 → 1', note: 'rises into the deck, from below the fold' },
            { property: 'notice · exit', value: 'the same, reversed', note: 'it leaves along the stack’s own axis' },
            { property: 'notice · life', value: 'until dismissed', note: 'one of a run; the fifth must not bury the first' },
            { property: 'receipt · enter', value: 'x +100 → 0', note: 'flies in from the right edge' },
            { property: 'receipt · exit', value: 'scale → .9', note: 'shrinks in place. Retracing its entrance would read as undone' },
            { property: 'receipt · life', value: '5,000ms', note: 'the only variant with a deadline, and the only one carrying Undo' },
            { property: 'receipt · swipe', value: 'right, 50px', note: 'drag is right-only; past the threshold, letting go dismisses' },
          ]}
        />
      </Blk>

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Width', value: '340px', note: 'Fixed. A toast that grows with its message is a dialog' },
            { property: 'Phone', value: 'full-bleed', note: 'lifted clear of the tab bar by --w-tabs' },
            { property: 'Tones', value: '4', note: 'neutral · ok · warn · danger' },
            { property: 'Radius', value: '12px', token: '--tx-r3' },
            { property: 'Depth', value: 'y −10i · scale 1−.06i · opacity 1−.2i', note: 'four drawn; the fifth waits at zero' },
            { property: 'Spring', value: 'stiffness 400, damping 30', token: '--tx-ease-real-spring' },
            { property: 'Stagger', value: '20ms × depth', note: 'one settling motion rather than one block' },
            { property: 'Action', value: 'one, at most', note: 'A toast with two choices is a modal that got away' },
            { property: 'Live region', value: 'from the tone', note: 'polite, except danger' },
            { property: 'Stack', value: <code>.toasts</code>, note: 'Newest at the front, nearest the thumb' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <Bay h={96}>
                <Toast
                  tone="ok"
                  variant="receipt"
                  depth={0}
                  title={<>Payment recorded</>}
                  body="₹2,000 · Meera K · UPI"
                  action={{ label: 'Undo', onClick: () => {} }}
                  onDismiss={() => {}}
                />
              </Bay>
            ),
            caption: (
              <>
                What happened, to whom, for how much &mdash; and one way back. The trainer can confirm the
                figure without opening Payments.
              </>
            ),
          }}
          no={{
            figure: (
              <Bay h={96}>
                <Toast tone="ok" depth={0} title={<>Success!</>} onDismiss={() => {}} />
              </Bay>
            ),
            caption:
              '“Success” names neither the thing that succeeded nor the amount. Six of these in a row down the corner of a screen are indistinguishable, and none of them can be checked.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
