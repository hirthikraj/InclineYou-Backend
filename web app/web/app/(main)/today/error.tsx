'use client';

import { Button } from '@/web-components/ui/Button';

/**
 * Today failed to load.
 *
 * Seven requests, and any one of them can fail. The screen says which kind of
 * failure it was in the only terms that change what a trainer should do — retry,
 * or wait — and offers the retry as a button rather than asking them to reload.
 *
 * It does NOT draw an empty Today with a warning strip. An empty deck looks
 * exactly like a quiet morning: no sessions, nobody owing, no money. A trainer
 * would read it and believe it, then miss a session. Refusing to draw the screen
 * at all is the honest failure here.
 */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="app app--noshell">
      <div
        style={{
          height: '100%',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: 'var(--tx-canvas)',
        }}
      >
        <div style={{ maxWidth: '54ch', textAlign: 'center' }}>
          <p
            className="micro"
            style={{ color: 'var(--tx-ink-3)' }}
          >
            TODAY
          </p>
          <h1 className="stp__hd" style={{ fontSize: 26, marginTop: 12, marginInline: 'auto' }}>
            We could not read your day
          </h1>
          <p className="stp__sub" style={{ marginInline: 'auto' }}>
            Nothing is lost and nothing was changed — this screen only reads. Your sessions,
            payments and packs are on the server exactly as they were.
          </p>
          <div className="row gap2" style={{ marginTop: 24, justifyContent: 'center' }}>
            <Button variant="primary" size="lg" onClick={reset}>
              Try again
            </Button>
            <Button href="/clients" variant="secondary" size="lg">
              Open the roster
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
