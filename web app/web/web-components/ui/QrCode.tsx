import qrcode from 'qrcode-generator';

/**
 * QR code — a link a phone can take from a screen. `.qr`, catalogue entry `c-qrcode`.
 *
 * Written 21 Nov 2026 for the client's *Pay with UPI*: on a phone the UPI link
 * opens the client's own UPI app, but on a laptop there is no UPI app to open,
 * and the honest way across is the phone's camera — every UPI app scans a code.
 *
 * ── THE ENCODER IS A LIBRARY, AND THAT WAS A DECISION ───────────────────────
 *
 * A QR code that does not scan is worse than none on a payment screen, and this
 * tree has no decoder to prove a hand-written encoder against. So the encoding is
 * `qrcode-generator` (MIT, no dependencies, pinned exactly), and this component
 * draws the result itself: one SVG path from the module grid, no injected markup.
 *
 * ── ALWAYS DARK ON LIGHT, IN BOTH THEMES ────────────────────────────────────
 *
 * Phone scanners read dark modules on a light ground most reliably, and an
 * inverted code fails on a fair share of them. So it is black on white with the
 * standard four-module quiet zone, whatever the theme — a white tile on the dark
 * page is the correct look, not a theming miss. Error correction is M (15%): the
 * links it carries are short, and a code stays readable through a smudged screen.
 */
export function QrCode({
  value,
  label,
  size = 176,
  className,
}: {
  value: string;
  /** What the code is, for a screen reader: "UPI payment code for ₹4,500". */
  label: string;
  size?: number;
  className?: string;
}) {
  const q = qrcode(0, 'M');
  q.addData(value);
  q.make();
  const n = q.getModuleCount();
  const quiet = 4;
  const dim = n + quiet * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (q.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  return (
    <svg
      className={['qr', className].filter(Boolean).join(' ')}
      viewBox={`0 0 ${dim} ${dim}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={dim} height={dim} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
