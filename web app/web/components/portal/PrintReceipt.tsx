'use client';

import { Button } from '@/web-components/ui/Button';

/**
 * PRINT OR SAVE AS PDF — the receipt's one action besides going back (25 Nov 2026). A receipt is a thing a client
 * keeps or forwards; the browser's own print dialog is where *Save as PDF* lives on every platform, so this opens it
 * rather than building a file. The print stylesheet (`.prc` in app.css) puts the receipt alone on white paper.
 */
export function PrintReceipt() {
  return (
    <Button variant="primary" onClick={() => window.print()}>
      Print or save as PDF
    </Button>
  );
}
