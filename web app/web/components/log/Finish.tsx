'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { FinishDataX } from '@/lib/sessionlog/api';
import { stampDate } from '@/lib/log/log';
import { cancelSession, markDone, markNoShow } from '@/lib/schedule/actions';
import { TopBar } from '@/components/shell/TopBar';
import { Checkbox } from '@/web-components/ui/Checkbox';
import { RecordCard } from './RecordCard';
import { Back, Send, Tick, Warn } from './Icons';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Stat } from '@/web-components/ui/Stat';
import { PageHeader } from '@/web-components/ui/PageHeader';
import { Why } from '@/web-components/ui/Why';

/**
 * FRAME 5b — LOGGED, AND THE PACK HAS NOT MOVED.
 *
 * Four figures and one honest sentence, and the sentence is the screen. §09
 * names this frame as the one most likely to break the rule it is about:
 * **finishing the log does not move the pack. A pack moves on *done* or
 * *no-show*, never on *booked*.** The page this replaces printed "Package after
 * this · 7 of 12" — which says the log does the moving, and was wrong about the
 * number twice over.
 *
 * So the sets happened, and whether the session counts against the client's money is a
 * **second, separate tap**. The strip says what the pack is NOW; the callout
 * says what marking it done will do to it.
 *
 * ── AND THE SECOND TAP IS NOT OPTIONAL ──────────────────────────────────────
 *
 * This screen used to offer *Later*, which left the session open and trusted the
 * diary to chase it tomorrow. It is gone, on purpose: **the attendance mark is
 * the pivot of the product.** It feeds the balance, the balance feeds the expiry
 * warning, the warning feeds `/today`, and `/today` is what drives a renewal. An
 * unmarked session breaks that chain silently, and `/today`'s own `unmarked`
 * attention band exists because trainers took *Later* and never came back.
 *
 * A pack still moves on *done* or *no-show* and never on *booked* — forcing the
 * mark does not change what the mark means, it only refuses to let the trainer
 * leave without making one. Three outcomes are offered and all three are real:
 * done, no-show, cancelled. There is no fourth.
 *
 * **What this is not is a lock.** The rail is still there and so is the back
 * button; a browser tab cannot be held hostage and it would be dishonest to
 * pretend otherwise. What is removed is the *offered* escape — the product no
 * longer suggests skipping the one tap it cannot reconstruct later.
 *
 * ── THE WHATSAPP IS OPENED, NEVER SENT ──────────────────────────────────────
 *
 * One message, composed here and handed to the trainer to send. The client's
 * number belongs to the trainer's relationship with them, and an app that posts
 * to it unasked has taken a liberty. Only the LOUD records are in it — a quiet
 * one stays in their history, because a trainer who forwards five records a week
 * has taught a client that records mean nothing.
 */

const WA = (message: string) => `https://wa.me/?text=${encodeURIComponent(message)}`;

export function Finish({ data }: { data: FinishDataX }) {
  const router = useRouter();
  const { view, finish, session } = data;
  /* A name does not tell you somebody's pronouns, and this screen used to spell
     out a gendered possessive four times over about whoever the
     trainer happened to be finishing. The client's own first name is on the
     wire and reads better than any pronoun would; where a sentence needs a
     second reference, it takes *they*. */
  const first = view.clientName.split(' ')[0];
  const [, startTransition] = useTransition();
  const [send, setSend] = useState(finish.announced > 0);
  const [notTrained, setNotTrained] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const close = (run: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true);
    setMessage(null);
    startTransition(async () => {
      const result = await run();
      setBusy(false);
      if (!result.ok) {
        setMessage(result.message ?? 'That did not go through. Nothing changed.');
        return;
      }
      setNotTrained(false);
      router.refresh();
    });
  };

  return (
    <>
      <TopBar
        crumb="Sessions"
        /* Six screens in this flow pass the crumb *Sessions* — it names the
           flow, and it is the wrong thing for a 390px header to say when the
           one fact the trainer needs at the top is whose session this is.
           `screenTitle` would derive *Sessions* from it, so the title is
           stated. The `<h1>` under it keeps the plan head the bar has no room
           for, which is why these screens are not `.ph--named`. */
        title={view.clientName}
      />
      <main className="main" id="main-content">
        <PageHeader
          title={finish.title}
          sub={<>{view.clientName} &middot; {stampDate(view.sessionDate)}
            {finish.line ? ` · ${finish.line}` : ''}</>}
          crumbs={<nav className="crumbs" aria-label="Breadcrumb">
              <Link href="/programs/workouts">Workouts</Link>
              <i aria-hidden="true">/</i>
              <Link href={`/sessions/${data.routeId}/log`}>{view.clientName}</Link>
              <i aria-hidden="true">/</i>
              <b>Finish</b>
            </nav>}
          actions={<><Button href={`/sessions/${data.routeId}/log`} variant="secondary">
              <Back /> Back to the log
            </Button>
            <Button href={`/sessions/${data.routeId}/bests`} variant="secondary">
              Every top set
            </Button></>}
        />

        <div className="body">
          <div className="wk2 wk2--even" style={{ maxWidth: 1100 }}>
            <div>
              <div className="stats stats--4">
                <Stat
                  label="Sets"
                  value={finish.sets}
                  detail={finish.setsPlanned ? `of ${finish.setsPlanned} planned` : 'logged'}
                />
                <Stat
                  label="Volume"
                  value={finish.volumeKg.toLocaleString('en-IN')}
                  detail="kg moved"
                />
                <Stat
                  label="Minutes"
                  value={finish.minutes ?? '—'}
                  detail={finish.span ?? (finish.minutes === null ? 'left open, so nobody knows' : 'still running')}
                />
                <Stat
                  label="Records"
                  value={finish.records.length}
                  detail={<>{finish.announced} worth sending</>}
                  tone={finish.records.length ? 'acc' : undefined}
                />
              </div>

              <Why
                heading={<>This did not touch {first}&rsquo;s pack</>}
                tone="warn"
                style={{ marginTop: 14 }}
              >
                <p>
                  The sets happened. Whether the session counts against {first}&rsquo;s money is a{' '}
                  <b>second, separate tap</b> — and a pack moves on <i>done</i> or <i>no-show</i>,
                  never on <i>booked</i>. {finish.pack}
                </p>
              </Why>

              {finish.closed ? (
                <div className="msg msg--ok" style={{ marginTop: 16 }}>
                  <Tick />
                  <span>
                    Already marked <b>{finish.closedAs === 'done' ? 'done' : finish.closedAs?.replace('_', '-')}</b>.
                    The money side of this session is settled; the log stays editable.
                  </span>
                </div>
              ) : session ? (
                <>
                  <div className="row" style={{ marginTop: 16, gap: 9, flexWrap: 'wrap' }}>
                    <Button
                      variant="primary"
                      size="lg"
                      disabled={busy}
                      onClick={() => close(() => markDone(session.id))}
                    >
                      <Tick /> Mark the session done
                    </Button>
                    <Button
                      variant="secondary"
                      size="lg"
                      disabled={busy}
                      onClick={() => setNotTrained(true)}
                    >
                      They didn&rsquo;t train
                    </Button>
                  </div>
                  <p className="small" style={{ marginTop: 8 }}>
                    <b className="ink">One of these two has to happen.</b> The mark is what moves
                    {' '}{first}&rsquo;s balance, and the balance is what warns you before the pack
                    runs out — a session nobody closed is money the product cannot see. Not sure
                    which? <b className="ink">They didn&rsquo;t train</b> carries cancel, and a
                    cancel costs {first} nothing.
                  </p>
                </>
              ) : (
                <div className="msg" style={{ marginTop: 16 }}>
                  <Warn />
                  <span>
                    This log has no booking behind it, so there is no session to mark done and no
                    pack to move. That is the third group on <Link href="/sessions/new">who is this
                    for</Link> working as designed: logging is allowed to happen before booking.
                  </span>
                </div>
              )}

              {message ? (
                <p className="msg msg--err" role="alert" style={{ marginTop: 12 }}>{message}</p>
              ) : null}
            </div>

            <div>
              {finish.records.length ? <RecordCard card={finish.records[0]} /> : (
                <Card>
                  <p className="small">
                    No record today, and that is the ordinary case.{' '}
                    <b className="ink">Matching is not beating</b>, and a first log is never a
                    record — <Link href={`/sessions/${data.routeId}/bests`}>every top set</Link>{' '}
                    says which of the four each one was.
                  </p>
                </Card>
              )}

              <Card
                title={<>Send {view.clientName.split(' ')[0]} the {finish.announced > 1 ? 'records' : 'record'}</>}
                aside={<><button
                    className="switch"
                    type="button"
                    role="switch"
                    aria-checked={send}
                    aria-label="Open WhatsApp with this message"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => setSend(!send)}
                  /></>}
                style={{ marginTop: 12 }}
              >
                <p
                  className="ctl ctl--said"
                  style={{
                    height: 'auto', padding: '10px 12px', whiteSpace: 'normal',
                    lineHeight: 1.55, textAlign: 'left',
                  }}
                >
                  {finish.message}
                </p>
                <p className="small" style={{ marginTop: 9 }}>
                  One WhatsApp, <b className="ink">opened for you to send</b> and never sent on
                  your behalf. {first}&rsquo;s number belongs to your relationship with them,
                  and an app that posts to it unasked has taken a liberty.
                </p>
                <p className="small" style={{ marginTop: 9 }}>
                  {finish.announced > 0
                    ? `Only the ${finish.announced} loud record${finish.announced === 1 ? '' : 's'} ${finish.announced === 1 ? 'is' : 'are'} in it — a quiet one stays in the history.`
                    : 'No record loud enough to send, so this is the session, not a boast.'}
                </p>
                {send ? (
                  <Button
                    href={WA(finish.message)}
                    variant="secondary"
                    size="sm"
                    style={{ marginTop: 10 }}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Send /> Open WhatsApp
                  </Button>
                ) : null}
              </Card>
            </div>
          </div>
        </div>
      </main>

      {notTrained && session ? (
        <NotTrained
          clientName={view.clientName}
          busy={busy}
          onClose={() => setNotTrained(false)}
          onPick={(outcome, costsASession) =>
            close(() =>
              outcome === 'no_show'
                ? markNoShow({ id: session.id, costsASession })
                : cancelSession(session.id, outcome === 'client_cancelled' ? 'client' : 'trainer'),
            )
          }
        />
      ) : null}
    </>
  );
}

/**
 * FRAME 5c — THEY DIDN'T TRAIN.
 *
 * Three outcomes, and the design says exactly one difference between them: **a
 * no-show costs a session** and both kinds of cancellation do not. That single
 * fact is what the trainer is deciding, so it is written inside each option
 * rather than in a confirmation afterwards.
 *
 * ── THIS SCREEN USED TO SAY THE OPPOSITE, AND WAS RIGHT TO ──────────────────
 *
 * There was no write on the wire that could move a pack for a no-show:
 * `POST /v1/sessions/{id}/done` was the only endpoint anywhere that touched
 * `package.sessions_remaining`, `PUT /v1/sessions/{id}` wrote the status and
 * nothing else, and there was no package `PATCH` to fix it afterwards. So the
 * rows said what was actually written and the foot told the trainer to take the
 * session off in the money book by hand — §14's rule, *where a document
 * disagrees with the code, the code wins*, and promising a pack move that will
 * not happen is worse than admitting there isn't one.
 *
 * `packDelta` landed on `PUT /v1/sessions/{id}` on 28 Aug 2026 and the sentence
 * can be true now, so the screen says it.
 *
 * ── AND IT IS STILL A CHOICE, WHICH IS NOT THE DESIGN'S RULE ────────────────
 *
 * The design has the pack move as an automatic consequence of the outcome. The
 * backend deliberately made it a request field instead, because whether a missed
 * session burns one is a commercial decision the trainer makes with the client —
 * so the checkbox is **on by default**, which is the design's answer and the
 * phone's behaviour, and the trainer can turn it off for the client who rang at
 * 5am with a sick child.
 *
 * Re-deciding is safe: the server settles from what the session has already
 * taken, so saving twice costs one session and saving again with the box clear
 * gives it back. The diary says the identical sentence, which is what §14 asks
 * of the pair.
 */
function NotTrained({
  clientName,
  busy,
  onPick,
  onClose,
}: {
  clientName: string;
  busy: boolean;
  onPick: (
    outcome: 'no_show' | 'client_cancelled' | 'trainer_cancelled',
    costsASession: boolean,
  ) => void;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<'no_show' | 'client_cancelled' | 'trainer_cancelled' | null>(null);
  const first = clientName.split(' ')[0];
  /* On by default: the design's rule, and what the phone has always done. It
     only means anything for a no-show — a cancellation charges nothing at all,
     which is the one thing all three outcomes have always agreed on. */
  const [costs, setCosts] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows = [
    {
      key: 'no_show' as const,
      title: 'They didn’t turn up',
      body: 'The slot was held and nobody released it. Recorded as a no-show against the booking, and it stays on their file.',
      note: costs ? '−1 session' : 'no change',
      wide: true,
    },
    {
      key: 'client_cancelled' as const,
      title: 'They told me in time',
      body: 'The slot went back into the week. The booking is withdrawn and nothing is charged.',
      note: 'no change',
      wide: false,
    },
    {
      key: 'trainer_cancelled' as const,
      title: 'I called it off',
      body: 'Yours to give back, so it is given back. The booking is withdrawn and nothing is charged.',
      note: 'no change',
      wide: false,
    },
  ];

  return (
    <>
      <div className="scrim scrim--top" onClick={onClose} aria-hidden="true" />
      <div className="modal" style={{ width: 540 }} role="dialog" aria-modal="true" aria-label={`${clientName} didn’t train`}>
        <div className="modal__hd">
          <p className="modal__t">{clientName} didn&rsquo;t train</p>
        </div>
        <div className="modal__body" style={{ paddingBottom: 8 }}>
          <p style={{ margin: 0 }}>
            Three outcomes, and the difference is what happens to {first}&rsquo;s pack. A
            cancellation costs nothing either way; <b>a no-show is the one you decide</b>.
          </p>

          {rows.map((r) => (
            <button
              className={`scp${r.wide ? ' scp--wide' : ''}${choice === r.key ? ' scp--on' : ''}`}
              type="button"
              key={r.key}
              style={{ marginTop: 8 }}
              aria-pressed={choice === r.key}
              onClick={() => setChoice(r.key)}
            >
              <span className={`rad${choice === r.key ? ' rad--on' : ''}`} />
              <span className="scp__m">
                <span className="scp__t">{r.title}</span>
                <span className="scp__b">{r.body}</span>
              </span>
              <span className="scp__n">{r.note}</span>
            </button>
          ))}

          {/* Under the no-show row and only under it, because it is the only
              outcome the answer changes anything for. */}
          {choice === 'no_show' ? (
            /* `ui/Checkbox`. Same defect as the money panel's: a bare
               `<input type="checkbox">` with no class, so `.check` never
               applied and this drew the browser's blue box on a screen whose
               every other control is the design system's. `mt2` is 8px where
               this was an ad-hoc 10. */
            <Checkbox
              className="mt2"
              align="start"
              checked={costs}
              onChange={(e) => setCosts(e.target.checked)}
              label={
                <>
                  <b>Take a session off {first}&rsquo;s pack.</b> On by default, because the slot was held and
                  nobody released it. Turn it off for the client who rang at 5am — it is a commercial
                  decision between the two of you, and this is where you make it.
                </>
              }
            />
          ) : null}

          <p className="small" style={{ marginTop: 12 }}>
            What is actually being decided is written inside each option rather than in a
            confirmation afterwards — the same shape the diary uses, because a decision about
            somebody&rsquo;s money should read identically wherever it is made. Changing your mind
            later is safe: marking it again with the box clear puts the session back on the pack it
            came off.
          </p>
        </div>
        <div className="modal__foot">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!choice || busy}
            onClick={() => choice && onPick(choice, choice === 'no_show' && costs)}
          >
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </>
  );
}
