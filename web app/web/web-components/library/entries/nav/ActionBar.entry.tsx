'use client';

import { useEffect, useState } from 'react';

import { ActionBar } from '../../../ui/ActionBar';
import { Button } from '../../../ui/Button';
import { Blk, Bench } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';

/** The two glyphs the specimen needs, at the size a bar draws them. */
function Timer() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2M9 2h6" />
    </svg>
  );
}
function Tick() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12.5l5.5 5.5L20 6.5" />
    </svg>
  );
}

const TOTAL = 150;

export function ActionBarEntry() {
  const entry = byId('c-actionbar')!;

  /* A clock that actually counts, because the whole argument for the component
     is a number a trainer reads at arm's length while it moves. A still
     specimen of a timer is a picture of a timer. */
  const [left, setLeft] = useState(92);
  const [running, setRunning] = useState(true);
  useEffect(() => {
    if (!running || left <= 0) return;
    const id = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(id);
  }, [running, left]);
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;

  return (
    <Cmp
      entry={entry}
      status="beta"
      meta={[
        { k: 'Component', v: <code>ui/ActionBar.tsx</code> },
        { k: 'Class', v: <code>.abar</code> },
        { k: 'Position', v: 'fixed, bottom edge' },
        { k: 'Pointer', v: 'coarse only' },
      ]}
    >
      <Blk
        title="Specimen"
        lede="The running state, drawn in place. The progress is the bar’s own top border, so it costs no height at all."
      >
        <Bench pad={false} style={{ padding: '18px 20px' }}>
          <div style={{ width: '100%' }}>
            <ActionBar
              inline
              tone={left === 0 ? 'ok' : 'accent'}
              progress={left === 0 ? undefined : left / TOTAL}
              role={left === 0 ? 'status' : 'timer'}
              label={`${clock} rest remaining`}
            >
              <ActionBar.Lead icon={left === 0 ? <Tick /> : <Timer />} figure={clock} />
              {left === 0 ? (
                <ActionBar.Text>
                  Set <b>4</b> is up
                </ActionBar.Text>
              ) : null}
              <ActionBar.Acts>
                <Button variant="ghost" size="sm" onClick={() => setLeft((n) => Math.max(0, n - 15))}>
                  &minus;15
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setLeft((n) => n + 15)}>
                  +15
                </Button>
                <Button variant="secondary" size="sm" onClick={() => { setRunning(false); setLeft(92); setRunning(true); }}>
                  {left === 0 ? 'Got it' : 'Skip'}
                </Button>
              </ActionBar.Acts>
            </ActionBar>
          </div>
        </Bench>
      </Blk>

      <Blk
        title="It exists because a card foot is not the bottom of the screen"
        lede={
          <>
            On a desk the workout console&rsquo;s card is a pane, its body is the scrollport, and{' '}
            <code>Card.Foot</code> keeps the primary verb and the rest clock where the eye left them.
            A phone has no pane &mdash; the card is as tall as its content and the page is the
            scroller, so the same foot is simply the bottom of a 900px card.{' '}
            <b>Measured at 390&times;844: y=1007, inside a 628px window.</b> The fix that works at
            1440 does nothing at 390.
          </>
        }
      />

      <Blk
        title="The thumb arc is the whole argument"
        lede={
          <>
            A phone held in one hand gives the thumb a comfortable arc across the bottom third and
            nothing above it. Everything else on a screen can be scrolled to; the control a trainer
            presses once per set, twelve times a session, with a bar in the other hand, should not
            have to be. <b>This is the band that does not scroll away.</b>
          </>
        }
      />

      <Blk
        title="One state at a time, and it never wraps"
        lede={
          <>
            A bar that grows a second line moves every control on it, and the controls are the reason
            it exists. Measured at 390 with a clock and three buttons on it, the text track is{' '}
            <b>95px</b> &mdash; which is not a sentence, so the running state carries no prose and the
            whole line goes on the timer&rsquo;s <code>aria-label</code> instead. Anything that will
            not fit one line at 360 belongs on the screen behind the bar.
          </>
        }
      />

      <Blk title="Specifications" tag="design-specifications">
        <SpecTable
          rows={[
            { property: 'Height', value: '60px min', note: 'Plus env(safe-area-inset-bottom)' },
            { property: 'Position', value: 'fixed, bottom', note: 'Portalled — a size container traps a fixed child' },
            { property: 'z-index', value: '18', note: 'Under .scrim (20), so a sheet dims it' },
            { property: 'Targets', value: '44px', note: '.btn--sm is 36 and nothing here is beside a bigger control' },
            { property: 'Figure', value: 'mono, tabular', note: 'A counting clock must not shuffle its digits' },
            { property: 'Progress', value: 'top border', note: '3px, scaleX — costs no height' },
            { property: 'Tones', value: 'accent · ok', note: 'Running · spent. Never danger' },
            { property: 'Rendered', value: 'behind a media query', note: 'Never display:none — two live regions is a clock read twice' },
          ]}
        />
      </Blk>

      <Blk title="Do and don’t" tag="guidelines">
        <DoDont
          yes={{
            figure: (
              <div style={{ width: 340 }}>
                <ActionBar inline>
                  <Button variant="primary" className="abar__go">
                    <Tick /> Set 3 &mdash; take last time&rsquo;s numbers
                  </Button>
                </ActionBar>
              </div>
            ),
            caption:
              'One verb, the width of the bar. The target a thumb aims at mid-set is the bar, not a word in the middle of it.',
          }}
          no={{
            figure: (
              <div style={{ width: 340 }}>
                <ActionBar inline>
                  <ActionBar.Text>Rest over. Set 3 of barbell bench press is up.</ActionBar.Text>
                  <ActionBar.Acts>
                    <Button variant="ghost" size="sm">+15</Button>
                    <Button variant="ghost" size="sm">Note</Button>
                    <Button variant="secondary" size="sm">Got it</Button>
                  </ActionBar.Acts>
                </ActionBar>
              </div>
            ),
            caption:
              'A sentence with nowhere to go, clipped mid-word, and a third verb that belongs on the row it is about. The bar says what to do next; it is not a place to put a paragraph.',
          }}
        />
      </Blk>
    </Cmp>
  );
}
