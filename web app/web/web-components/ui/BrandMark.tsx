/**
 * A PAYMENT RAIL'S MARK — `c-brandmark`.
 *
 * Trainers recognise a payment method by its logo long before they read its
 * name: a UPI arrow and a Razorpay slash are what they see on every till and
 * every checkout. So Payment setup leads each method with its mark (25 Nov 2026).
 *
 * The mark always sits on a WHITE tile, in both themes, because these are other
 * companies' colours and they are only right on the ground they were drawn for —
 * the same reason a QR code here is always printed on white.
 *
 * ⚠ These are simplified, hand-drawn stand-ins, not the official artwork.
 * Before launch, replace each `<svg>` body with the asset from the owner's
 * brand kit (NPCI for UPI, Razorpay's brand page) and follow their usage rules.
 * The tile, the size and the accessible name stay as they are.
 */
export type Brand = 'upi' | 'razorpay';

const NAME: Record<Brand, string> = { upi: 'UPI', razorpay: 'Razorpay' };

export function BrandMark({ brand, size = 'md' }: { brand: Brand; size?: 'sm' | 'md' }) {
  return (
    <span className={size === 'sm' ? 'brandmark brandmark--sm' : 'brandmark'} role="img" aria-label={NAME[brand]}>
      {brand === 'upi' ? <UpiSvg /> : <RazorpaySvg />}
    </span>
  );
}

function UpiSvg() {
  return (
    <svg viewBox="0 0 64 28" aria-hidden="true" focusable="false">
      <text x="2" y="21" fontWeight="800" fontStyle="italic" fontSize="20" fill="#6D6E71" letterSpacing="-0.5">
        UPI
      </text>
      {/* The arrow: an orange wedge behind a green one, pointing on. */}
      <polygon points="45,4 57,14 45,24" fill="#F37021" />
      <polygon points="41,4 53,14 41,24" fill="#0B8F45" />
    </svg>
  );
}

function RazorpaySvg() {
  /* The mark alone: at a 64px tile a wordmark is ~9px type nobody can read, and the
     name is always written beside the tile anyway. */
  return (
    <svg viewBox="0 0 64 28" aria-hidden="true" focusable="false">
      {/* The slash: a light-blue blade and a navy foot. */}
      <polygon points="30,26 38,2 47,2 40,15" fill="#3395FF" />
      <polygon points="21,27 28,15 34,15 29,27" fill="#072654" />
    </svg>
  );
}
