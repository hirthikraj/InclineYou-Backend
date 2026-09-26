import Link from 'next/link';

import type { HistorySession, PrCard } from '@/lib/log/log';
import { Trophy } from './Icons';
import { useDismiss } from '@/lib/ui/dismiss';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Tag } from '@/web-components/ui/Tag';
import { Timeline } from '@/web-components/ui/Timeline';

/**
 * THE LAST FEW SESSIONS OF ONE MOVEMENT, AS A TIMELINE.
 *
 * ── IT WAS WRITTEN TWICE, IN THIS FILE, FORTY LINES APART ───────────────────
 *
 * `ExerciseTimeline` drew the card beside the entry and `ExerciseHistoryPanel`
 * drew the same rows in a dock, and the two were byte-identical `.tl` markup
 * with the same inline `style` attribute on the title — because `.tl` had no
 * component to import, so the second one was written by copying the first. It
 * is one component now (`c-timeline`), the style attribute is `mono`, and the
 * two call-sites pass the same array to the same thing.
 *
 * No `href`. A row here is a reading, not a door: the session it came from is
 * already this client's and this exercise's, which is the page the reader is
 * on, and *Every session* at the head of the card goes to the only place a
 * fuller history lives.
 */
function SetHistory({ name, sessions }: { name: string; sessions: HistorySession[] }) {
  return (
    <Timeline label={`${name} — the last ${sessions.length} sessions`}>
      {sessions.map((s) => (
        <Timeline.Item
          key={s.workoutId}
          live={s.today}
          mono
          mark={s.label.toUpperCase()}
          title={s.sets.map((set, i) => (
            <span key={set.setId}>
              {i > 0 ? ' · ' : ''}
              {set.pr ? (
                <b className="acc">
                  {set.load === '—' ? `${set.reps} reps` : `${set.load} kg × ${set.reps}`}
                </b>
              ) : set.load === '—' ? (
                `${set.reps} reps`
              ) : (
                `${set.load} kg × ${set.reps}`
              )}
            </span>
          ))}
          meta={
            <>
              {s.volumeKg.toLocaleString('en-IN')} kg
              {s.verdict === 'record' ? <> · <span className="acc">record</span></> : null}
              {s.verdict === 'quiet' ? ' · record, quietly' : null}
              {s.verdict === 'matched' ? ' · matched' : null}
              {s.verdict === 'first' ? ' · first time' : null}
            </>
          }
        />
      ))}
    </Timeline>
  );
}

/**
 * THE ONE GLOW, AND THE HISTORY UNDER IT.
 *
 * §11 of the audit — *one glow per screen, enforced in CSS rather than left to
 * whoever writes the next screen*. `.exr[aria-current]` gives the open exercise
 * card its accent; this card takes it back the moment a record exists, because
 * if two things glow nothing is live.
 *
 * The card is only drawn for a record — `record` or `quiet`, the two members of
 * `Verdict` that are real. **Matched and first get nothing**, because a badge
 * that appears for matching is a badge that means nothing.
 */
export function RecordCard({ card }: { card: PrCard }) {
  return (
    <Card
      tone="acc"
      style={{ borderColor: 'var(--tx-pr)', background: 'var(--tx-pr-soft)' }}
    >
      <div className="row" style={{ gap: 9 }}>
        <span style={{ color: 'var(--tx-pr)', display: 'flex' }}><Trophy /></span>
        <span className="micro" style={{ color: 'var(--tx-pr)' }}>NEW TOP SET</span>
        <Tag tone="pr" style={{ marginLeft: 'auto' }}>{card.setLabel}</Tag>
      </div>
      <p
        style={{
          fontFamily: 'var(--tx-brand)', fontWeight: 800, fontSize: 34,
          letterSpacing: '-.03em', lineHeight: 1.05, marginTop: 8,
        }}
      >
        {card.value}
        <span className="ink3" style={{ fontSize: 18 }}> {card.unit}</span>
        {card.reps ? <span className="ink3" style={{ fontSize: 18 }}> {card.reps}</span> : null}
      </p>
      <p className="small" style={{ marginTop: 5 }}>
        {card.was} · <b className="ink">{card.delta}</b>
      </p>
      <p
        className="small"
        style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--tx-line)' }}
      >
        {card.why}
      </p>
    </Card>
  );
}

/**
 * HER LAST FOUR, BESIDE THE ENTRY.
 *
 * The reason to look at history is to decide today's load, so it sits next to
 * the fields rather than a screen away. **This is the half a 390px phone cannot
 * do**, and it is one of the three things this console is for.
 *
 * Every session carries the verdict it earned AT THE TIME — walked forward by
 * the same `judge` the badge above uses. So a line can read *record, quietly*
 * nine days later and still be true.
 */
export function ExerciseTimeline({
  name,
  clientId,
  exerciseId,
  sessions,
}: {
  name: string;
  clientId: string;
  exerciseId: string;
  sessions: HistorySession[];
}) {
  if (!sessions.length) {
    return (
      <Card
        title={<>{name}, no history yet</>}
        className="setg__tl"
        style={{ marginTop: 12 }}
      >
        <p className="small">
          Nothing before today. <b className="ink">A first log is never a record</b> — it is the
          number to beat.
        </p>
      </Card>
    );
  }

  return (
    <Card
      title={<>{name}, the last {sessions.length}</>}
      aside={<><Link
          className="small"
          style={{ marginLeft: 'auto' }}
          href={`/clients/${clientId}/exercises/${exerciseId}`}
        >
          Every session
        </Link></>}
      /* `.setg__tl` is what lets this card take the third pane and scroll —
         see *the console is a console* in `app.css`. Named rather than
         `:last-child`, because a session with two records draws a link under
         it. */
      className="setg__tl"
      style={{ marginTop: 12 }}
    >
      {/* THE PARAGRAPH THAT USED TO CLOSE THIS CARD IS GONE · 21 Sep 2026.
          It read *"The reason to look at history is to decide today's load, so
          it sits beside the entry. This is the half a 390px phone cannot do."*
          — two lines of a 460px column, on the screen a trainer is mid-set on,
          explaining this component's own layout decision to them. That
          sentence is an argument addressed to whoever builds the next screen,
          it is stated twice in this file's own docstrings and once in
          `lib/log/api.ts`, and none of those places is the product. */}
      <SetHistory name={name} sessions={sessions} />
    </Card>
  );
}

/**
 * THE SAME TIMELINE, AS A SHEET — the phone's half of the third column.
 *
 * `ExerciseTimeline` above ends with the sentence *"this is the half a 390px
 * phone cannot do"*, and at 1440px that is true of the LAYOUT: there is no room
 * beside the fields on a phone. It was never true of the CONTENT. Measured, the
 * console stacked at 390 put `NEW TOP SET` 802px and the last three sessions
 * 989px below the top of the card the trainer types in — about two and a half
 * screens down, and two and a half back.
 *
 * So the column becomes a sheet, one tap from the card header. The brief it
 * answers is exact: *see the last rep and weight, and the PR of that exercise,
 * in one click*. Last time is already a column in the row and costs nothing;
 * this is the other half.
 *
 * **The record card comes with it.** Today's top set is the answer to "is this
 * a PR" and it is drawn nowhere else once the third column has stacked below
 * the fold, so the sheet carries it above the timeline when there is one.
 *
 * A `.panel` and not a `.modal`, which is `webapp.css`'s rule for the two and
 * `SetPanel`'s stated reason: the sets it is about stay on the screen behind
 * it. The bottom-sheet shape below 900px is `.rp-panel`'s, and this is the
 * SIXTH opt-in of it — see `.setg-hpanel` in `app.css`.
 */
export function HistorySheet({
  name,
  clientId,
  exerciseId,
  sessions,
  card,
  onClose,
}: {
  name: string;
  clientId: string;
  exerciseId: string;
  sessions: HistorySession[];
  card: PrCard | null;
  onClose: () => void;
}) {
  /* The sheet leaves instead of vanishing — `lib/ui/dismiss.ts`. Both ways out
     of it, the scrim and the Close button, go through `dismiss`. */
  const { closing, dismiss, ref: panelRef } = useDismiss<HTMLDivElement>(onClose);

  return (
    <>
      <div
        className={`scrim scrim--soft${closing ? ' scrim--out' : ''}`}
        onClick={dismiss}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className={`panel setg-hpanel${closing ? ' panel--out' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${name} — the last sessions`}
      >
        <div className="panel__hd">
          <span className="panel__t">{name}</span>
          <Link
            className="small setg-hpanel__all"
            href={`/clients/${clientId}/exercises/${exerciseId}`}
          >
            Every session
          </Link>
        </div>

        <div className="panel__body">
          {card ? (
            <div style={{ marginBottom: 14 }}>
              <RecordCard card={card} />
            </div>
          ) : null}

          {sessions.length ? (
            <SetHistory name={name} sessions={sessions} />
          ) : (
            <p className="small">
              Nothing before today. <b className="ink">A first log is never a record</b> — it is
              the number to beat.
            </p>
          )}
        </div>

        <div className="panel__foot">
          <Button variant="secondary" onClick={dismiss}>
            Close
          </Button>
        </div>
      </div>
    </>
  );
}
