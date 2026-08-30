import type { Metadata, Viewport } from 'next';
import { Archivo, Inter, JetBrains_Mono } from 'next/font/google';

import './styles/webapp.css';
import './styles/app.css';

/**
 * The three families §01 names. Self-hosted by `next/font` rather than linked
 * from Google, so the first paint carries no third-party request and the
 * fallback metrics are computed rather than guessed — a font swapping in late
 * on a dense table is a whole screen reflowing.
 *
 * The variables are wired into the tokens below rather than applied as classes,
 * because every rule in webapp.css reads `--tx-font`, `--tx-brand` or
 * `--tx-mono` and none of them knows what next/font is.
 */
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--f-inter' });
const archivo = Archivo({ subsets: ['latin'], display: 'swap', variable: '--f-archivo' });
const mono = JetBrains_Mono({ subsets: ['latin'], display: 'swap', variable: '--f-mono' });

export const metadata: Metadata = {
  title: 'X REP',
  description: 'The app for personal trainers who coach in person',
};

/**
 * `viewportFit` for the notch, and no `maximumScale`: pinch-zoom is the one
 * accommodation every low-vision user has on every site, and turning it off to
 * stop iOS zooming a focused input is a trade nobody should make. The inputs
 * that would trigger that zoom are 16px already.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#08090B',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      /* Dark is the product's default and the theme every frame is drawn in.
         It is set here rather than sniffed so the server and the client agree
         on the first paint; the light palette is defined and not yet switched. */
      data-theme="dark"
      className={`${inter.variable} ${archivo.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
