import Link from 'next/link';

/**
 * A destination the sign-in flow can reach that has not been built yet.
 *
 * Drawn rather than left to 404 for the same reason §06 draws two dead
 * buttons: the routing decision after a verify is real and testable now, and a
 * 404 would read as a bug in it. Each of these says which frame owes it, so the
 * next pass has a list.
 */
export function NotBuilt({
  route,
  frame,
  what,
}: {
  route: string;
  frame: string;
  what: string;
}) {
  return (
    <div className="app app--noshell" data-theme="dark">
      <div
        style={{
          height: '100%',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: 'var(--tx-canvas)',
        }}
      >
        <div style={{ maxWidth: '56ch', textAlign: 'center' }}>
          <p
            className="small"
            style={{ fontFamily: 'var(--tx-mono)', color: 'var(--tx-ink-3)', letterSpacing: '.1em' }}
          >
            {route.toUpperCase()}
          </p>
          <h1 className="stp__hd" style={{ fontSize: 26, marginTop: 12, marginInline: 'auto' }}>
            {what}
          </h1>
          <p className="stp__sub" style={{ marginInline: 'auto' }}>
            Not built yet — sign-in and verify were this pass. This screen is{' '}
            <b>{frame}</b> in the design set.
          </p>
          <p style={{ marginTop: 24 }}>
            <Link className="btn btn--secondary btn--lg" href="/sign-in">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
