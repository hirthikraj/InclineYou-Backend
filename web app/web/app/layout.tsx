import type { Metadata, Viewport } from 'next';
import { Archivo, Inter, JetBrains_Mono } from 'next/font/google';

import { NO_FLASH } from '@/web-components/ui/theme';

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
const inter = Inter({ subsets: ['latin', 'latin-ext'], display: 'swap', variable: '--f-inter' });
const archivo = Archivo({ subsets: ['latin', 'latin-ext'], display: 'swap', variable: '--f-archivo' });
const mono = JetBrains_Mono({ subsets: ['latin', 'latin-ext'], display: 'swap', variable: '--f-mono' });

export const metadata: Metadata = {
  title: 'InclineYou',
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
         on the first paint. §01's light palette is real and reachable — the
         account menu switches it, and `NO_FLASH` below re-applies the choice
         before paint. Dark stays the default and the server's answer. */
      data-theme="dark"
      /* The theme is re-applied from localStorage before hydration, so this one
         attribute legitimately differs between the server's HTML and the
         client's DOM. Without this React logs a mismatch on every page a
         trainer loads in light. It suppresses the warning for THIS element's
         own attributes only; children still hydrate strictly. */
      suppressHydrationWarning
      className={`${inter.variable} ${archivo.variable} ${mono.variable}`}
    >
      <body>
        {/* Re-applies a remembered light theme before the first paint. Inline and
            first: anything bundled arrives after the dark paint it exists to
            prevent, and the whole screen would snap on every load. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
        {children}
      </body>
    </html>
  );
}
