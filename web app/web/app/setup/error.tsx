'use client';

import { Button } from '@/web-components/ui/Button';

/**
 * When the profile will not load.
 *
 * Every screen under `/setup` reads `/v1/trainers/me` and a full sync pull
 * before it can draw a rail, so a failed fetch has nothing to render around —
 * and the alternative to this page is an empty rail over a form whose Continue
 * does nothing, which reads as the flow having lost the answers.
 *
 * A signed-out token is not this page's case: the guard redirects a 401 to
 * `/sign-in`. What reaches here is a server that answered 500, or one that did
 * not answer — both of which a retry can genuinely fix, which is why the action
 * is a retry and not a link out.
 */
export default function SetupError({ reset }: { error: Error; reset: () => void }) {
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
        <div style={{ maxWidth: '52ch', textAlign: 'center' }}>
          {/* No inline size. `.stp__hd` is clamped in app.css, and an inline
              `fontSize` here pinned the longest headline in the flow at 26px on
              a 320px phone. */}
          <h1 className="stp__hd" style={{ marginInline: 'auto' }}>
            We couldn’t load your setup
          </h1>
          <p className="stp__sub" style={{ marginInline: 'auto' }}>
            Nothing is lost — every answer you have given is on your account, not in this browser. The
            server did not answer just now.
          </p>
          <p style={{ marginTop: 24 }}>
            <Button variant="primary" size="lg" onClick={reset}>
              Try again
            </Button>
          </p>
        </div>
      </div>
    </div>
  );
}
