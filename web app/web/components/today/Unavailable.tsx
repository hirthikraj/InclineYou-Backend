'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/web-components/ui/Button';

/**
 * The API did not give us a day — said in the terms that change what to do next.
 *
 * TWO CASES, TWO SENTENCES, and the split is the point. The screen this replaces
 * had one — "We could not read your day" — and a trainer meeting it during a
 * twenty-second deploy could not tell it from a broken screen. What they need to
 * know is whether waiting will fix it.
 *
 * What both cases say, and it is the reassurance that actually matters: **this
 * screen only reads.** Nothing was half-written, nothing is queued, nothing is
 * lost. On a half that writes straight to the server that is a true and complete
 * account, which is exactly what the offline-first half cannot promise.
 *
 * Not an empty Today with a warning strip: an empty deck looks like a quiet
 * morning, and a trainer would believe it.
 */
export function Unavailable({
  kind,
  status,
  kicker,
  what,
  back,
}: {
  kind: 'unreachable' | 'refused';
  status?: number;
  /** The small caps line over the headline. Defaults to `TODAY` on Today and to nothing elsewhere. */
  kicker?: string;
  /**
   * What the server could not build, as a noun phrase: *your day*, *this check-in*. It was
   * hard-coded to *your day*, so a check-in that failed to open told a trainer the server could
   * not build their day, on a screen that was not Today (and so did the 30-odd other call-sites).
   */
  what?: string;
  /** Where *Open the roster* would go, when a nearer door exists — the file the failure happened in. */
  back?: { href: string; label: string };
}) {
  const router = useRouter();
  const onToday = (usePathname() ?? '').startsWith('/today');
  const noun = what ?? (onToday ? 'your day' : 'this page');
  const eyebrow = kicker ?? (onToday ? 'TODAY' : null);
  const [retrying, setRetrying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The happy path unmounts this component — a successful refresh replaces it
  // with the day — so the timer below usually outlives it. Held in a ref and
  // cleared, because a `setTimeout` that fires into an unmounted tree is a
  // pending task keeping a closure alive for four seconds after it can matter.
  useEffect(() => () => clearTimeout(timer.current), []);

  const retry = () => {
    setRetrying(true);
    // `refresh()` re-runs the server component, which re-runs the eight
    // requests. It does not reset this component's state, so the spinner is
    // cleared on the render that replaces it — or, if it fails again, by the
    // timeout below, because a button stuck on "Trying…" reads as frozen.
    router.refresh();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setRetrying(false), 4000);
  };

  const unreachable = kind === 'unreachable';

  return (
    <div className="app app--noshell">
      {/*
        Two inline blocks became `.midcol`, and one of them was a live bug at any
        width. `fontSize: 26` on the headline pinned the longest sentence on the
        screen at 26px on a 320px phone, defeating `.stp__hd`'s own
        `clamp(21px,5vw,26px)` — verbatim the defect the setup flow's consistency
        pass found in `app/setup/error.tsx`, in the other file that says a request
        did not work. The class keeps the clamp.
      */}
      <div className="midcol">
        <div className="midcol__in">
          {eyebrow ? <p className="micro ink3">{eyebrow}</p> : null}
          <h1 className="stp__hd midcol__hd">
            {unreachable ? 'The server is not answering' : `The server could not build ${noun}`}
          </h1>
          <p className="stp__sub midcol__sub">
            {unreachable ? (
              <>
                Nothing reached it at all, which usually means it is restarting. This normally
                clears in a few seconds. Try again.
              </>
            ) : (
              <>
                It answered, and refused{status ? <> with a {status}</> : null}. Trying again is
                worth one attempt; if it keeps happening the problem is on the server and waiting
                will not fix it.
              </>
            )}
          </p>
          <p className="stp__sub midcol__sub mt2">
            <b style={{ color: 'var(--tx-ink)' }}>Nothing is lost.</b> This screen only reads,
            your sessions, payments and packs are on the server exactly as they were, and nothing
            was left half-written.
          </p>
          <div className="row gap2 mt6 actrow actrow--mid">
            <Button
              variant="primary"
              size="lg"
              onClick={retry}
              disabled={retrying}
            >
              {retrying ? 'Trying…' : 'Try again'}
            </Button>
            {/* The roster is one request rather than eight, so it is the thing
                most likely to work when this one did not, and it is where a
                trainer can still look someone up. */}
            <Button href={back?.href ?? '/clients'} variant="secondary" size="lg">
              {back?.label ?? 'Open the roster'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
