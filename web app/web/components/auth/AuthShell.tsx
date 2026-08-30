import { BrandMark } from './Icons';

/**
 * The two-column plate every sign-in screen sits in — §04's `.authwrap`.
 *
 * The left half carries no controls at all. It is the brand plate and the one
 * sentence the product wants read before anything is asked, which is why it is
 * the half that disappears on a narrow window rather than stacking above the
 * form: a trainer on a small screen wants the field, not the quote.
 */
export function AuthShell({
  quote,
  children,
}: {
  quote: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app app--noshell" data-theme="dark">
      <div className="authwrap">
        <div className="authwrap__l">
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span className="rail__mark" style={{ width: 30, height: 30 }}>
              <BrandMark />
            </span>
            <span
              style={{
                fontFamily: 'var(--tx-brand)',
                fontWeight: 800,
                fontSize: 16,
                letterSpacing: '-.02em',
              }}
            >
              X&nbsp;REP
            </span>
          </div>
          <p className="authwrap__quote">{quote}</p>
          <p className="authwrap__by">The app for personal trainers who coach in person</p>
        </div>
        <div className="authwrap__r">{children}</div>
      </div>
    </div>
  );
}
