'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import type { ProgressRange, ProgressView } from '@/lib/log/log';
import { PLATE_STEP_KG, trim1 } from '@/lib/log/log';
import { TopBar } from '@/components/shell/TopBar';
import { Back } from './Icons';

/**
 * FRAME 4b — VOLUME GETS A CHART. THE LOAD DOES NOT.
 *
 * Volume is a sum, so a bar from zero tells the truth about it, and it is the
 * only figure on this screen that gets one. A load is not a sum: from a zero
 * baseline a {2.5} kg week is two pixels, and from a 50 kg baseline it is
 * everything. So her top set is **written out as the sequence of numbers it
 * actually is** — which is also what a coach says out loud.
 *
 * ── THE EXERCISE IS A CHOICE HERE, AND ON THE PHONE IT IS NOT ───────────────
 *
 * §14 records the gap: `ProgressView.topSet` on the phone is the client's
 * MOST-LOGGED exercise. On a Push A client that is a press; on somebody
 * rehabbing a knee it might be a band walk, and the card will say so with a
 * straight face. The desk has room to let the trainer pick which exercise the
 * sequence is about, so it does — and most-logged is only the default.
 *
 * ── AND THE BODYWEIGHT HAS NO COLOUR AND NO ARROW ───────────────────────────
 *
 * The app has **no opinion** about which way a client's weight should go, and a
 * green arrow would be one.
 */

const RANGES: { key: ProgressRange; label: string }[] = [
  { key: '8w', label: '8 weeks' },
  { key: '6m', label: '6 months' },
  { key: 'all', label: 'All' },
];

/**
 * The range chips and the exercise picker, as a hook.
 *
 * Both write to the query string of `/clients/:id/progress`, which is now a TAB
 * of the client file rather than a screen of its own — so the URL it patches is
 * the same one either way, and the caller does not have to know which surface it
 * is rendering into.
 */
export function useProgressQuery(clientId: string) {
  const router = useRouter();
  const params = useSearchParams();

  return (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const query = next.toString();
    router.replace(`/clients/${clientId}/progress${query ? `?${query}` : ''}`, { scroll: false });
  };
}

/**
 * The range chips on their own, so the client file can put them in its tools row
 * where the standalone screen put them in its page header.
 */
export function ProgressRanges({
  range,
  go,
}: {
  range: ProgressRange;
  go: (patch: Record<string, string | null>) => void;
}) {
  return (
    <>
      {RANGES.map((r) => (
        <button
          className="chip"
          type="button"
          key={r.key}
          aria-pressed={range === r.key}
          onClick={() => go({ range: r.key })}
          style={
            range === r.key
              ? {
                  background: 'var(--tx-accent-soft)',
                  borderColor: 'var(--tx-accent-line)',
                  color: 'var(--tx-accent-text)',
                }
              : undefined
          }
        >
          {r.label}
        </button>
      ))}
    </>
  );
}

/**
 * Everything below the page header: the four figures, the volume bars, the top-set
 * sequence, the exercise picker and the bodyweight card.
 *
 * Extracted so the client file's Progress tab draws exactly this screen rather
 * than a second, drifting rendering of the same numbers. The standalone route is
 * the shell around it and nothing else.
 */
export function ProgressBody({
  data,
  go,
}: {
  data: ProgressView;
  go: (patch: Record<string, string | null>) => void;
}) {
  return (
    <>
          <div className="stats stats--4">
            <div className="stat">
              <p className="stat__k">Sessions</p>
              <p className="stat__v">{data.sessions}</p>
              <p className="stat__d">with something logged</p>
            </div>
            <div className="stat">
              <p className="stat__k">Sets</p>
              <p className="stat__v">{data.sets}</p>
              <p className="stat__d">across {data.exerciseCount} exercises</p>
            </div>
            <div className={`stat${data.records ? ' stat--acc' : ''}`}>
              <p className="stat__k">Records</p>
              <p className="stat__v">{data.records}</p>
              <p className="stat__d">judged on read, never stored</p>
            </div>
            <div className="stat">
              <p className="stat__k">Volume this week</p>
              <p className="stat__v">{data.volumeNow.toLocaleString('en-IN')}</p>
              <p className="stat__d">
                kg{data.volumeDelta ? <> &middot; <b>{data.volumeDelta}</b></> : null}
              </p>
            </div>
          </div>

          <div className="wk2 wk2--wide" style={{ marginTop: 12 }}>
            <div className="card">
              <div className="card__hd">
                <h2 className="card__t">
                  Volume, {data.weeks.length} week{data.weeks.length === 1 ? '' : 's'}
                </h2>
                <span className="small mono" style={{ marginLeft: 'auto' }}>kg moved per week</span>
              </div>
              <div className="card__b">
                {data.weeks.length ? (
                  <>
                    <div className="vb">
                      {data.weeks.map((w, i) => (
                        <i
                          className={w.current ? 'on' : ''}
                          key={w.label}
                          style={{ height: `${Math.max(1, Math.round(w.fraction * 100))}%` }}
                        >
                          {i === 0 || w.current ? <b>{w.volumeKg.toLocaleString('en-IN')}</b> : null}
                        </i>
                      ))}
                    </div>
                    <div className="vbx">
                      {data.weeks.map((w) => (
                        <span key={w.label}>{w.label}</span>
                      ))}
                    </div>
                    <p className="small" style={{ marginTop: 12 }}>
                      <b className="ink">Bars, from zero.</b> Volume is a sum, so a bar tells the
                      truth about it — and this is the only figure on the screen that gets one. A
                      week with nothing in it keeps its bar, because a gap that closes up is a gap
                      that never happened.
                    </p>
                  </>
                ) : (
                  <p className="small ink3">
                    Nothing logged in this range yet. A bar needs a set behind it.
                  </p>
                )}
              </div>
            </div>

            <div>
              <div className="card">
                <div className="card__hd">
                  <h2 className="card__t">
                    {data.focus ? `${data.focus.name}, her last ${data.focus.sequence.length}` : 'Her top set'}
                  </h2>
                </div>
                <div className="card__b">
                  {data.focus && data.focus.sequence.length ? (
                    <>
                      <p className="seq">
                        {data.focus.sequence.map((p, i, all) => (
                          <span key={`${p.value}-${i}`}>
                            {i > 0 ? ' → ' : ''}
                            {i === all.length - 1 ? <b>{p.value}</b> : p.value}
                          </span>
                        ))}{' '}
                        {data.focus.unit}
                      </p>
                      <p className="small" style={{ marginTop: 10 }}>
                        Written out, never charted. From a zero baseline a {trim1(PLATE_STEP_KG)} kg
                        week is two pixels; from a 50 kg baseline it is everything. This is also
                        what a coach says out loud.
                      </p>
                      <Link
                        className="btn btn--secondary btn--sm"
                        style={{ marginTop: 10 }}
                        href={`/clients/${data.clientId}/exercises/${data.focus.exerciseId}`}
                      >
                        Every session on it
                      </Link>
                    </>
                  ) : (
                    <p className="small ink3">
                      Nothing has two sessions behind it yet, so there is no sequence to write out.
                    </p>
                  )}
                </div>
              </div>

              {data.choices.length > 1 ? (
                <div className="card" style={{ marginTop: 12 }}>
                  <div className="card__hd">
                    <h2 className="card__t">Which exercise</h2>
                  </div>
                  <div className="card__b">
                    <div className="wk">
                      {data.choices.slice(0, 8).map((c) => (
                        <button
                          className="chip"
                          type="button"
                          key={c.exerciseId}
                          aria-pressed={data.focus?.exerciseId === c.exerciseId}
                          onClick={() => go({ focus: c.exerciseId })}
                        >
                          {c.name}
                          <span className="rail__n">{c.sessions}</span>
                        </button>
                      ))}
                    </div>
                    <p className="small" style={{ marginTop: 10 }}>
                      The phone picks the <b className="ink">most-logged</b> one and cannot be told
                      otherwise. On somebody rehabbing a knee that is a band walk, and the card
                      would say so with a straight face — so the desk lets you say which.
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="card" style={{ marginTop: 12 }}>
                <div className="card__hd">
                  <h2 className="card__t">Bodyweight</h2>
                </div>
                <div className="card__b">
                  {data.bodyweight ? (
                    <>
                      <div className="row" style={{ alignItems: 'baseline', gap: 10 }}>
                        <p
                          style={{
                            fontFamily: 'var(--tx-brand)', fontWeight: 800, fontSize: 30,
                            letterSpacing: '-.03em',
                          }}
                        >
                          {data.bodyweight.value}
                          <span className="ink3" style={{ fontSize: 16 }}> kg</span>
                        </p>
                        {data.bodyweight.delta ? (
                          <p className="small mono">{data.bodyweight.delta}</p>
                        ) : null}
                      </div>
                      <p className="small" style={{ marginTop: 9 }}>
                        No colour and no arrow. The app has <b>no opinion</b> about which way a
                        client&rsquo;s weight should go, and a green arrow would be one.
                      </p>
                    </>
                  ) : (
                    <p className="small ink3">
                      Nothing recorded. Body metrics are entered on her file.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
    </>
  );
}

export function Progress({ data }: { data: ProgressView }) {
  const go = useProgressQuery(data.clientId);

  return (
    <>
      <TopBar crumb="Clients" onSearch={() => {}} />
      <main className="main" id="main-content">
        <div className="ph">
          <div className="ph__row">
            <div>
              <nav className="crumbs" aria-label="Breadcrumb">
                <Link href="/clients">Clients</Link>
                <i aria-hidden="true">/</i>
                <Link href={`/clients/${data.clientId}`}>{data.clientName}</Link>
                <i aria-hidden="true">/</i>
                <b>Progress</b>
              </nav>
              <h1 className="ph__t">{data.clientName} &middot; progress</h1>
              <p className="ph__sub">
                {data.weeks.length} week{data.weeks.length === 1 ? '' : 's'} shown &middot;{' '}
                {data.exerciseCount} exercise{data.exerciseCount === 1 ? '' : 's'}
              </p>
            </div>
            <div className="ph__acts">
              <ProgressRanges range={data.range} go={go} />
              <Link className="btn btn--secondary btn--sm" href={`/clients/${data.clientId}`}>
                <Back /> Her file
              </Link>
            </div>
          </div>
        </div>

        <div className="body">
          <ProgressBody data={data} go={go} />
        </div>
      </main>
    </>
  );
}
