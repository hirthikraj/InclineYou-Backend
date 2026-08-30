'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState, useSyncExternalStore } from 'react';

import {
  REPORT_WEEKS,
  longDate,
  reportMessage,
  shortDate,
  signed,
  trim,
  type ClientReport as Report,
  type ReportWeeks,
} from '@/lib/reports/build';
import { copyCard, downloadCard, shareCard, whatsappUrl, type ShareOutcome } from '@/lib/reports/share';
import { TopBar } from '@/components/shell/TopBar';
import { CardPreview } from './CardPreview';

/**
 * Whether this browser has a native share sheet that will take a file.
 *
 * `useSyncExternalStore` and not a bare `typeof navigator` check in the render:
 * this component is server-rendered, so reading a browser capability during the
 * first render is a hydration mismatch on exactly the screen a trainer opens to
 * send something. `getServerSnapshot` answers false — the desk's three buttons —
 * and the real answer arrives on the client's first render straight after. It is
 * a fact about the machine and never changes, so nothing subscribes.
 */
const NO_SUBSCRIBE = () => () => {};
const canShareFiles = () =>
  typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';

/**
 * THE CLIENT PROGRESS REPORT — the highest-leverage screen in the product, on
 * the brief's own ranking, and the reason is one sentence: **most clients quit
 * because progress feels invisible, not because it is absent.**
 *
 * Everything here is arranged around the card being an object that LEAVES. It is
 * not a dashboard the trainer reads; it is a thing they hand over, and the three
 * jobs of the screen are to make it true, make it beautiful, and get it out in
 * one tap.
 *
 * ── THE SCREEN IS TWO COLUMNS AND THEY HAVE DIFFERENT READERS ───────────────
 *
 * **Left is the client's.** The painted 1080×1350 PNG, exactly as it will
 * arrive, with the share actions under it. Nothing about the trainer's business
 * appears on it — no revenue, no adherence framed as a failure, no attendance
 * rate for a month the client was ill.
 *
 * **Right is the trainer's.** The same figures as real markup, plus the two
 * things a client is never sent: how many sessions went unmarked, and what the
 * window actually measured. A trainer about to send somebody a number should be
 * able to see where it came from first, and the card cannot carry a methodology
 * note without stopping being a card.
 *
 * ── THE WINDOW IS IN THE URL ────────────────────────────────────────────────
 *
 * A chosen range is a **place** — the same call `/clients/:id/progress` makes
 * for its own `range`, and for the same reason: a trainer showing a client six
 * months should be able to send that link, and a reload should land on the
 * report they were looking at rather than the default.
 *
 * ── AND NOTHING ON THIS SCREEN WRITES ───────────────────────────────────────
 *
 * No server action, no `nudge_log` row, nothing stored. The WhatsApp button is a
 * plain `wa.me` link exactly as the client file's is, and `lib/reports/share.ts`
 * carries the reason: `POST /v1/clients/{id}/nudge` spends the once-a-week
 * reminder that an overdue invoice needs three days later. Sending somebody
 * their progress must not cost the trainer that.
 */
export function ClientReport({ report }: { report: Report }) {
  const hasShareSheet = useSyncExternalStore(NO_SUBSCRIBE, canShareFiles, () => false);
  const router = useRouter();
  const params = useSearchParams();
  const [outcome, setOutcome] = useState<ShareOutcome | 'working' | null>(null);

  const setWeeks = (weeks: ReportWeeks) => {
    const next = new URLSearchParams(params.toString());
    next.set('weeks', String(weeks));
    router.replace(`/clients/${report.clientId}/report?${next}`, { scroll: false });
  };

  /**
   * One handler for the three actions that paint.
   *
   * `working` is set before the await because painting a 1080×1350 canvas and
   * encoding it takes a beat on a phone, and a share button that looks inert for
   * 400ms gets pressed twice — which on the native sheet means two sheets.
   */
  const run = useCallback(async (action: (r: Report) => Promise<ShareOutcome>) => {
    setOutcome('working');
    setOutcome(await action(report));
  }, [report]);

  const s = report.sessions;
  const rows = [report.weight, ...report.measurements].filter((m) => m !== null);

  return (
    <>
      <TopBar crumb={`Clients / ${report.clientName} / Progress report`} onSearch={() => {}} />

      <main className="main" id="main-content">
        <div className="ph">
          <div className="ph__row">
            <div className="ph__id">
              <h1 className="ph__t">{report.clientName}</h1>
              <p className="ph__sub">
                {report.weeks} weeks · {longDate(report.from)} — {longDate(report.to)}
                {report.clientSince >= report.from && (
                  <> · started with you {shortDate(report.clientSince)}</>
                )}
              </p>
            </div>
            <div className="ph__acts">
              <div className="btngroup" role="group" aria-label="How far back the report goes">
                {REPORT_WEEKS.map((w) => (
                  <button
                    key={w}
                    className="btn btn--sm"
                    type="button"
                    aria-pressed={report.weeks === w}
                    onClick={() => setWeeks(w)}
                  >
                    {w}w
                  </button>
                ))}
              </div>
              <Link className="btn btn--secondary" href={`/clients/${report.clientId}`}>
                Open their file
              </Link>
            </div>
          </div>
        </div>

        <div className="body">
          {report.isThin ? (
            <ThinReport report={report} />
          ) : (
            <div className="rpt">
              {/* ── the client's half ───────────────────────────────────── */}
              <div className="rpt__card">
                <CardPreview report={report} />

                <div className="card" style={{ marginTop: 12 }}>
                  <div className="card__hd">
                    <h2 className="card__t">Send it</h2>
                    <span className="tag">{report.clientPhone ? 'Number on file' : 'No number on file'}</span>
                  </div>
                  <div className="card__b">
                    <div className="row gap2" style={{ flexWrap: 'wrap' }}>
                      {/* The native sheet is first where it exists, because on a
                          phone it is the only one of the four that is genuinely
                          one tap: the image and the message go together, and
                          WhatsApp, Instagram and everything else are in the list.
                          It is hidden rather than disabled on a desk — a button
                          that can never work is worse than no button. */}
                      {hasShareSheet && (
                        <button
                          className="btn btn--primary"
                          type="button"
                          onClick={() => run(shareCard)}
                        >
                          Share the card
                        </button>
                      )}
                      <a
                        className="btn btn--primary"
                        href={whatsappUrl(report)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Send on WhatsApp
                      </a>
                      <button className="btn btn--secondary" type="button" onClick={() => run(copyCard)}>
                        Copy the image
                      </button>
                      <button className="btn btn--secondary" type="button" onClick={() => run(downloadCard)}>
                        Download
                      </button>
                    </div>

                    {/* ONE `<span>`, and it is not optional. `.msg` is
                        `display:flex` with a gap — it is built for an icon beside a
                        sentence — so every inline child becomes a flex ITEM and the
                        sentence renders as a row of narrow columns. Found by
                        rendering, and it is the same shape as the `.kv`/`.who`
                        traps already recorded in AGENTS.md. */}
                    <p className="msg" style={{ marginTop: 12 }} aria-live="polite">
                      <span>
                        {outcome === 'working' && 'Drawing the card…'}
                        {outcome === 'copied' && 'Copied. Paste it straight into the chat.'}
                        {outcome === 'downloaded' && 'Saved to your downloads.'}
                        {outcome === 'shared' && 'Handed to your phone’s share sheet.'}
                        {outcome === 'cancelled' && 'Nothing sent.'}
                        {outcome === 'unsupported' && 'This browser cannot do that one — use Download instead.'}
                        {outcome === 'failed' && 'That did not go through. Download still works.'}
                        {outcome === null && (
                          <>
                            <b>WhatsApp takes text, not attachments, from a link.</b>{' '}
                            On a desk: send the message, then paste the image into the
                            same chat. On a phone, <i>Share the card</i> sends both at once.
                          </>
                        )}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              {/* ── the trainer's half ──────────────────────────────────── */}
              <div className="rpt__side">
                <div className="card">
                  <div className="card__hd">
                    <h2 className="card__t">What is on the card</h2>
                  </div>
                  <div className="card__b">
                    <div className="kv">
                      <span className="kv__k">Sessions done</span>
                      <span className="kv__v mono">{s.attended}</span>
                    </div>
                    <div className="kv">
                      <span className="kv__k">Adherence</span>
                      <span className="kv__v mono">
                        {s.adherence === null ? '—' : `${s.adherence}%`}
                        {s.settled > 0 && (
                          <span className="ink3"> · {s.settled - s.noShow}/{s.settled}</span>
                        )}
                      </span>
                    </div>
                    <div className="kv">
                      <span className="kv__k">Personal bests</span>
                      <span className="kv__v mono">{report.prCount}</span>
                    </div>
                    <div className="kv">
                      <span className="kv__k">Exercises trained</span>
                      <span className="kv__v mono">{report.exerciseCount}</span>
                    </div>
                    {report.volumeKg > 0 && (
                      <div className="kv">
                        <span className="kv__k">Total load moved</span>
                        <span className="kv__v mono">{report.volumeKg.toLocaleString('en-IN')} kg</span>
                      </div>
                    )}
                  </div>

                  {/* The two things the client is NOT sent. A trainer should see
                      where a number came from before they hand it to somebody. */}
                  <div className="card__b" style={{ borderTop: '1px solid var(--tx-line)' }}>
                    {s.unmarked > 0 ? (
                      <p className="msg msg--warn">
                        <span>
                          <b>{s.unmarked} past session{s.unmarked === 1 ? '' : 's'}</b> in this window
                          {s.unmarked === 1 ? ' was' : ' were'} never marked. {s.unmarked === 1 ? 'It is' : 'They are'} in
                          neither figure — not counted as done, and not counted against them.
                        </span>
                      </p>
                    ) : (
                      <p className="small" style={{ lineHeight: 1.6 }}>
                        Adherence is over sessions that <b>settled</b> — done or no-show.
                        A booking nobody marked is in neither half of it.
                      </p>
                    )}
                  </div>
                </div>

                {rows.length > 0 && (
                  <div className="card" style={{ marginTop: 12 }}>
                    <div className="card__hd">
                      <h2 className="card__t">Measurements</h2>
                      <span className="small mono" style={{ marginLeft: 'auto' }}>start → latest</span>
                    </div>
                    <div className="card__b card__b--flush">
                      <table className="tbl" style={{ width: '100%' }}>
                        <tbody>
                          {rows.map((m) => (
                            <tr key={m.type}>
                              <td className="strong">{m.label}</td>
                              <td className="mono" style={{ color: 'var(--tx-ink-3)' }}>
                                {trim(m.from)} → <b className="ink">{trim(m.to)}</b> {m.unit}
                              </td>
                              <td className="mono num">{signed(m.delta)}</td>
                              <td style={{ color: 'var(--tx-ink-3)' }}>
                                {m.baselineIsOlder
                                  ? `from ${shortDate(m.firstAt)}, before this window`
                                  : `${m.readings} readings`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="card__b" style={{ borderTop: '1px solid var(--tx-line)' }}>
                      <p className="small" style={{ lineHeight: 1.6 }}>
                        No colour on the change, on the card or here: the app has
                        <b> no opinion</b> about which way a client&rsquo;s numbers should go,
                        and a green arrow would be one.
                      </p>
                    </div>
                  </div>
                )}

                {report.lifts.length > 0 && (
                  <div className="card" style={{ marginTop: 12 }}>
                    <div className="card__hd">
                      <h2 className="card__t">Getting stronger</h2>
                      <span className="tag">{report.lifts.length} moved</span>
                    </div>
                    <div className="card__b card__b--flush">
                      <table className="tbl" style={{ width: '100%' }}>
                        <tbody>
                          {report.lifts.map((l) => (
                            <tr key={l.exerciseId}>
                              <td className="strong wrap">{l.name}</td>
                              <td className="mono" style={{ color: 'var(--tx-ink-3)' }}>
                                {trim(l.from)} → <b className="ink">{trim(l.to)}</b> {l.unit}
                              </td>
                              <td className="mono num" style={{ color: 'var(--tx-accent-text)' }}>
                                +{l.percent}%
                              </td>
                              <td style={{ color: 'var(--tx-ink-3)' }}>{l.days} days</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="card__b" style={{ borderTop: '1px solid var(--tx-line)' }}>
                      <p className="small" style={{ lineHeight: 1.6 }}>
                        The best set on the <b>first day</b> of the window against the best
                        anywhere in it — not against the last day, because a block often
                        closes on a deload and a real gain would read as a loss. Only the
                        top four go on the card.
                      </p>
                    </div>
                  </div>
                )}

                <div className="card" style={{ marginTop: 12 }}>
                  <div className="card__hd">
                    <h2 className="card__t">The message</h2>
                  </div>
                  <div className="card__b">
                    {/* Shown rather than hidden behind the button, because it is
                        going out under the trainer's name. Every nudge template in
                        this product is a first draft the trainer edits in their own
                        composer, and they cannot edit what they have not read. */}
                    <pre
                      className="small mono"
                      style={{
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.65,
                        margin: 0,
                        color: 'var(--tx-ink-2)',
                      }}
                    >
                      {reportMessage(report)}
                    </pre>
                    <p className="small" style={{ color: 'var(--tx-ink-3)', marginTop: 12, lineHeight: 1.6 }}>
                      A first draft. It opens in your own WhatsApp composer, so change
                      anything you like before it goes.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

/**
 * NOTHING TO REPORT, AND THE SCREEN SAYS SO RATHER THAN DRAWING A BLANK CARD.
 *
 * A card with a name on it and no figures under it is worse than no card: the
 * trainer sends it, the client reads it as "you have done nothing", and a
 * retention tool has cost a renewal. So the report refuses to be generated and
 * names what would fill it.
 */
function ThinReport({ report }: { report: Report }) {
  return (
    <div className="empty" style={{ marginTop: 48 }}>
      <div className="empty__ic">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 9h8M8 13h5" />
        </svg>
      </div>
      <p className="empty__t">Nothing to show {report.clientName} yet</p>
      <p className="empty__b">
        There are no delivered sessions, measurements or logged sets in the last{' '}
        {report.weeks} weeks. A card with a name on it and no figures under it reads
        as <i>you have done nothing</i>, so this one is not generated.
      </p>
      <div className="row gap2" style={{ marginTop: 16 }}>
        {REPORT_WEEKS.filter((w) => w !== report.weeks).map((w) => (
          <Link
            key={w}
            className="btn btn--secondary"
            href={`/clients/${report.clientId}/report?weeks=${w}`}
          >
            Try {w} weeks
          </Link>
        ))}
        <Link className="btn btn--primary" href={`/clients/${report.clientId}`}>
          Open their file
        </Link>
      </div>
    </div>
  );
}
