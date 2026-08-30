import Link from 'next/link';

import type { HistorySession, PrCard } from '@/lib/log/log';
import { Trophy } from './Icons';

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
    <div
      className="card card--acc"
      style={{ borderColor: 'var(--tx-pr)', background: 'var(--tx-pr-soft)' }}
    >
      <div className="card__b">
        <div className="row" style={{ gap: 9 }}>
          <span style={{ color: 'var(--tx-pr)', display: 'flex' }}><Trophy /></span>
          <span className="micro" style={{ color: 'var(--tx-pr)' }}>NEW TOP SET</span>
          <span className="tag tag--pr" style={{ marginLeft: 'auto' }}>{card.setLabel}</span>
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
      </div>
    </div>
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
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card__hd">
          <h2 className="card__t">{name}, her history</h2>
        </div>
        <div className="card__b">
          <p className="small">
            Nothing before today. <b className="ink">A first log is never a record</b> — it is the
            number to beat.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="card__hd">
        <h2 className="card__t">{name}, her last {sessions.length}</h2>
        <Link
          className="small"
          style={{ marginLeft: 'auto' }}
          href={`/clients/${clientId}/exercises/${exerciseId}`}
        >
          Every session
        </Link>
      </div>
      <div className="card__b">
        <div className="tl">
          {sessions.map((s) => (
            <div className={`tl__i${s.today ? ' tl__i--acc' : ''}`} key={s.workoutId}>
              <p className="tl__d">{s.label.toUpperCase()}</p>
              <p
                className="tl__t"
                style={{ fontFamily: 'var(--tx-mono)', fontSize: 12.5, fontWeight: 500 }}
              >
                {s.sets.map((set, i) => (
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
              </p>
              <p className="tl__b">
                {s.volumeKg.toLocaleString('en-IN')} kg
                {s.verdict === 'record' ? <> · <span className="acc">record</span></> : null}
                {s.verdict === 'quiet' ? ' · record, quietly' : null}
                {s.verdict === 'matched' ? ' · matched' : null}
                {s.verdict === 'first' ? ' · her first' : null}
              </p>
            </div>
          ))}
        </div>
        <p className="small" style={{ borderTop: '1px solid var(--tx-line)', paddingTop: 9 }}>
          The reason to look at history is to decide today&rsquo;s load, so it sits beside the
          entry. This is the half a 390px phone cannot do.
        </p>
      </div>
    </div>
  );
}
