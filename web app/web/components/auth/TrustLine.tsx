import { IconLock } from './Icons';

/**
 * Not decoration, and the reason it is a ruled box rather than grey text under
 * a button: OTP-relay fraud over phone calls is common in India, and the mobile
 * spec has a row headed *never do this* whose entire content is this sentence.
 * Grey text under a button is text nobody reads.
 */
export function TrustLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="trust">
      <IconLock size={15} />
      <span>{children}</span>
    </div>
  );
}
