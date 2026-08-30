'use client';

import Link from 'next/link';

import type { DayMoney, DayRibbon as Ribbon, Gap } from '@/lib/today/day';
import { dayFooting, gapWorth, windowsLabel } from '@/lib/today/day';
import type { DeckSession } from '@/lib/today/deck';
import { MODE_LABELS } from '@/lib/today/mode';
import {
  avatarToken, dayLong, formatMinute, formatSpan, initials, minuteOfDay, rupees,
} from '@/lib/today/time';
import { NowMarker } from './Clock';

/**
 * THE DAY, TO SCALE. One minute is one pixel — OR WIDER, NEVER NARROWER.
 *
 * The schedule design's whole redesign was that sentence, drawn vertically with
 * seven days across. This is the same geometry rotated ninety degrees: a block's
 * `left` is its start minute minus the ribbon's, its `width` is its duration in
 * minutes. `day.ts` still computes both in minutes and nothing there changed —
 * what changed is the unit they are PRINTED in.
 *
 * ── WHY THEY ARE PERCENTAGES NOW ─────────────────────────────────────────────
 *
 * This used to be literal: `width: ribbon.span` px, and the comment here argued
 * that "at a wider window it does not stretch, it stays true and the column gets
 * emptier". 06:00–20:30 is 870 minutes and therefore 870px, which fits the
 * content column at 1:1 — on a 1440px laptop. On a 1920px monitor the same 870px
 * band sits in a 1,600px card and a third of the widest module on the screen is
 * blank; on an ultrawide it is more than half. The trainer bought the pixels.
 *
 * So every offset here is `value / span` as a percentage of the track, and the
 * track is `width:100%` with `min-width:<span>px`. Two things follow, and they
 * are the reason this is not a retreat from the design's claim:
 *
 * 1 · The scale is still LINEAR and still exact. A 60-minute session is twice a
 *     30-minute one at every width, and a block still starts exactly above its
 *     own gridline, because both are the same fraction of the same span. What is
 *     no longer fixed is the constant, not the proportionality — and the
 *     proportionality is the thing the ribbon promises.
 * 2 · `min-width` is the old behaviour, kept as a FLOOR. The ribbon can never
 *     compress: below the width where a minute is a pixel it scrolls, exactly as
 *     it did, so the 24px avatar still fits the 30-minute session that sets the
 *     floor and nothing above gets tighter than it was tested at.
 *
 * The setup flow's own copy of this component (`components/setup/DayRibbon.tsx`)
 * is deliberately NOT changed: it sits in a 332px-sibling column that has no
 * spare width to give, so stretching it would buy nothing and cost a divergence.
 * That is why the fluid behaviour is a modifier class rather than a change to
 * `.dr` itself.
 *
 * ── THE THREE THINGS ON IT THAT ARE NOT SESSIONS ─────────────────────────────
 *
 * 1 · The working windows are the GROUND and everything else is hatched — the
 *     same hatch as the week grid's, so "outside your hours" looks identical on
 *     both screens.
 * 2 · The hole between two shifts keeps its FULL WIDTH. The week grid folds that
 *     span to a 30px seam because across seven days it holds nothing; on one day
 *     it is the shape of the day. And it carries a label, because 390px of hatch
 *     with nothing written on it is a rendering error until it says what it is.
 * 3 · A gap — free time inside a window, long enough to sell — is dashed on all
 *     four sides so it can never be misread as a booking, and labelled with what
 *     it is worth, because free time is the most expensive thing on this screen.
 *
 * ── AND ONE THING ABOUT THE BLOCKS ───────────────────────────────────────────
 *
 * A 30-minute session is 30px wide, which holds no text at all. So a block on the
 * ribbon carries the avatar and nothing else, and the name lives in its
 * `aria-label` and in the rail's pin list. The avatar is 24px, which is what makes
 * 30px the floor: the shortest session this product books is exactly wide enough
 * to be a person rather than a bar.
 */

/**
 * `left` and `width` are CSS lengths, not numbers — percentages of the ribbon's
 * span, from `pct()` below. Typed as strings so a raw minute count cannot be
 * passed here by accident and land back at one pixel a minute on a track that is
 * no longer that wide.
 */
function Block({ session, left, width }: { session: DeckSession; left: string; width: string }) {
  const start = minuteOfDay(session.at);
  const classes = ['ev', 'ev--h'];
  if (session.mode === 'remote') classes.push('ev--remote');
  if (session.done) classes.push('ev--done');
  else if (session.live) classes.push('ev--live');
  else if (session.late) classes.push('ev--late');

  const state = session.done
    ? 'done'
    : session.live
      ? 'in session'
      : session.late
        ? 'started, nothing logged'
        : 'upcoming';

  return (
    <Link
      className={classes.join(' ')}
      style={{ left, width }}
      /* The session, not the client. A block on the ribbon IS one appointment —
         it is placed by that appointment's minute and sized by its length — so
         the client file was always the approximate answer, taken because
         `/sessions/{id}` did not exist yet. `PhoneStack`'s `SessionRow` carries
         the full note. */
      href={`/sessions/${session.id}`}
      aria-label={`${session.clientName}, ${formatMinute(start)} to ${formatMinute(start + session.minutes)}, ${session.detail}, ${MODE_LABELS[session.mode].toLowerCase()}, ${state}`}
    >
      <span
        className="av av--sm"
        style={{ background: `var(${avatarToken(session.clientId)})` }}
        aria-hidden="true"
      >
        {initials(session.clientName)}
      </span>
    </Link>
  );
}

function GapButton({
  gap,
  left,
  width,
  money,
  gymSharePercent,
}: {
  gap: Gap;
  left: string;
  width: string;
  money: DayMoney;
  gymSharePercent: number | null;
}) {
  const worth = gapWorth(gap, money, gymSharePercent);
  return (
    <Link
      className="gapb gapb--h"
      style={{ left, width, opacity: gap.past ? 0.6 : 1 }}
      href={`/schedule?book=${gap.startMinute}`}
      aria-label={`Free, ${formatMinute(gap.startMinute)} to ${formatMinute(gap.endMinute)}, ${formatSpan(gap.minutes)}${worth ? `, worth ${worth}` : ''}`}
    >
      <b>{formatMinute(gap.startMinute)}</b>
      <span>{formatSpan(gap.minutes)} free</span>
    </Link>
  );
}

export function DayRibbon({
  ribbon,
  sessions,
  windows,
  money,
  gymSharePercent,
  now,
  serverNow,
}: {
  ribbon: Ribbon;
  sessions: DeckSession[];
  windows: { startMinute: number; endMinute: number }[];
  money: DayMoney;
  gymSharePercent: number | null;
  now: number;
  /** The instant the ribbon's geometry was computed against. */
  serverNow: number;
}) {
  const live = sessions.filter((s) => !s.dead);

  // Every offset on the track, as a share of the span. `span` is
  // `Math.max(60, …)` in `day.ts`, so this can never divide by zero.
  const pct = (minutes: number) => `${(minutes / ribbon.span) * 100}%`;

  return (
    <div className="card">
      {/*
        `.card__hd--wrap`, and the reason is arithmetic rather than taste. This
        head carries a long date, two tags, the day's footing and two money
        figures against a `.card__acts` pinned right by `margin-left:auto`. At
        1440px they fit on one line; at 900 the money runs into the tags, and at
        390 it leaves the card entirely. Wrapping puts the money on its own line
        under the date instead — which is also the reading order the DAY's
        figures want, since the head's left half says what the day IS and its
        right half says what it came to.
      */}
      <div className="card__hd card__hd--wrap">
        <h2 className="card__t">{dayLong(serverNow)}</h2>
        <span className="tag">
          {live.length} session{live.length === 1 ? '' : 's'}
        </span>
        {windows.length > 0 && <span className="tag tag--info">{windowsLabel(windows)}</span>}
        <span className="card__acts">
          {/*
            MONEY APPEARS TWICE ON THIS SCREEN, AT TWO SCOPES, AND EACH CARRIES
            ITS SCOPE IN ITS OWN LABEL. The DAY's figures sit here, beside the day
            they are about; the MONTH's sit in the third column with all four of
            `DeckMoney`'s fields under their own names. Neither is a card at the
            top of the screen, and neither is a bare figure in a footer.
          */}
          <span className="small">
            {dayFooting(live)}
            {money.billed > 0 && (
              <>
                {'  ·  '}
                <b>{rupees(money.billed)}</b> billed,{' '}
                <b style={{ color: 'var(--tx-accent-text)' }}>{rupees(money.yours)}</b> yours
                {money.partial && (
                  <span className="ink3"> ({money.priced} of {money.total} priced)</span>
                )}
              </>
            )}
          </span>
        </span>
      </div>

      {/*
        THE SCROLLER IS A CLASS NOW, AND IT SAYS THAT IT SCROLLS.

        It was an inline `overflowX:'auto'`, which worked and told nobody. The
        ribbon widens with the column but never narrows past one pixel a minute —
        `06:00–20:30` floors at 870px — so on any window under about 950px it is
        cut, and a cut ribbon with no edge to see and no words about it reads as a
        ribbon that ends at lunchtime. `app.css` already carries exactly this pattern for the setup
        flow's own copy of this component: a `local`/`scroll` gradient pair so the
        edge fades while there is more, and a line of text at the width the
        arithmetic says it is cut. This reuses both rather than restating them.

        `overscroll-behavior-x:contain` goes with it: a horizontal swipe that runs
        out of ribbon must not become the browser's back gesture on the one screen
        a trainer swipes across while standing on a gym floor.
      */}
      <div className="card__b dr__wrap">
        <div className="dr dr--fluid" style={{ minWidth: ribbon.span }}>
          {ribbon.windows.map((w, i) => (
            <div key={`w${i}`} className="dr__win" aria-hidden="true" style={{ left: pct(w.left), width: pct(w.width) }} />
          ))}
          {ribbon.off.map((o, i) => (
            <div key={`o${i}`} className="dr__off" aria-hidden="true" style={{ left: pct(o.left), width: pct(o.width) }} />
          ))}
          {ribbon.lines.map((l, i) => (
            <div
              key={`l${i}`}
              className={`dr__l${l.edge ? ' dr__l--h' : ''}`}
              aria-hidden="true"
              style={{ left: pct(l.left) }}
            />
          ))}
          {ribbon.holes.map((h, i) => (
            <div key={`h${i}`} className="dr__hole" style={{ left: pct(h.left) }}>
              <b>{h.range}</b> · {h.note}
            </div>
          ))}
          {ribbon.gaps.map((g) => (
            <GapButton
              key={`g${g.startMinute}`}
              gap={g}
              left={pct(g.left)}
              width={pct(g.width)}
              money={money}
              gymSharePercent={gymSharePercent}
            />
          ))}
          {ribbon.blocks.map((b) => (
            <Block key={b.session.id} session={b.session} left={pct(b.left)} width={pct(b.width)} />
          ))}
          <NowMarker
            now={now}
            fromMinute={ribbon.fromMinute}
            toMinute={ribbon.toMinute}
            span={ribbon.span}
            variant="line"
          />
        </div>

        {/*
          The ruler lives OUTSIDE the track, and that is a measured fix rather
          than a layout preference. The now chip used to sit inside the track at
          `top:-1px`, and at 09:12 it covered the whole of a 30px block — the one
          session the screen existed to show. A ribbon's blocks are 30px wide and
          there is nowhere on them to put a label, so the chip lives here, under
          the line, where nothing can be behind it.
        */}
        <div className="dr__ax dr__ax--fluid" style={{ minWidth: ribbon.span }}>
          {/*
            THE LAST TICK IS MARKED IN THE MARKUP, NOT PICKED IN CSS, and the
            reason is the sibling under it. `.dr__t:first-of-type` works for the
            leading label because the first `<span>` on the ruler is always a
            tick — but the LAST one is not: `NowMarker`'s chip is a `<span>` too
            and renders after these, so `:last-of-type` would match the chip's
            absence rather than the tick, and silently stop matching anything at
            all on a day the clock is inside. A class says which one it means.

            `i > 0` so a ruler that somehow held a single tick cannot be both
            ends of itself — the leading rule and this one would then disagree by
            source order rather than by intent.
          */}
          {ribbon.ticks.map((t, i) => (
            <span
              key={t.left}
              className={`dr__t${i > 0 && i === ribbon.ticks.length - 1 ? ' dr__t--last' : ''}`}
              style={{ left: pct(t.left) }}
            >
              {t.label}
            </span>
          ))}
          <NowMarker
            now={now}
            fromMinute={ribbon.fromMinute}
            toMinute={ribbon.toMinute}
            span={ribbon.span}
            variant="chip"
          />
        </div>
      </div>

      {/*
        Outside the scroller, so it does not scroll away from the thing it is
        describing. `.dr__hint` is `display:none` until the breakpoint that knows
        this column cannot hold the band turns it on, so it costs nothing on a
        desk — and `--today` because the setup flow's copy of this component sits
        in a narrower column and cuts 200px sooner. The arithmetic for both is in
        `app.css`.

        The sentence is phrased to hold at the MARGIN, which is the one thing a
        width-triggered hint cannot know: the span is the trainer's own working
        day, so a trainer who finishes at 17:00 has a band 210px shorter than one
        who finishes at 20:30 and the same breakpoint is right for neither. "If
        the day runs past the edge" is true whether it does or not; "scroll to see
        the rest" would be a claim about something that may not be there.
      */}
      <p className="dr__hint dr__hint--today small">
        Drawn to scale — {formatMinute(ribbon.fromMinute)} to {formatMinute(ribbon.toMinute)},
        every block as wide as it is long. Scroll sideways if the day runs past the edge.
      </p>
    </div>
  );
}
