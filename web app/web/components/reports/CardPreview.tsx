'use client';

import { useEffect, useState } from 'react';

import type { ClientReport } from '@/lib/reports/build';
import { reportMessage } from '@/lib/reports/build';
import { reportCardBlob } from '@/lib/reports/card-image';
import { Card } from '@/web-components/ui/Card';

/**
 * THE PREVIEW IS THE ARTEFACT.
 *
 * The obvious build is an HTML card on the screen and a canvas painter for the
 * export, and it is the wrong one: two renderings of the same figures drift, and
 * the one that drifts is the one nobody looks at — which is the exported file,
 * the only one that leaves the building. A trainer would find out from a client.
 *
 * So this paints the real PNG and shows it in an `<img>`. What is on screen is
 * byte-for-byte what gets sent, and there is exactly one renderer to keep right.
 *
 * ── AN IMAGE IS NOT A DOCUMENT, SO THE FIGURES ARE DRAWN BESIDE IT ──────────
 *
 * A picture of numbers is unreadable to a screen reader, unselectable, and
 * untranslatable. The `alt` carries the message text — the same sentences the
 * WhatsApp share sends, which is the honest description of what the picture says
 * — and `ClientReport.tsx` draws every figure again as real markup in the column
 * next to it. That second column is not a duplicate of this: it is the TRAINER's
 * view of the same report, with the things a client is not sent (what was
 * unmarked, how the window was measured) beside the things they are.
 *
 * ── AND IT REPAINTS ON EVERY CHANGE, INCLUDING THE FONTS ────────────────────
 *
 * `reportCardBlob` awaits `document.fonts.ready`, so a card painted in the
 * moment before the webfont lands is not a card in Times. The object URL is
 * revoked on the way out; without that, flipping between 4, 12 and 24 weeks a
 * few times leaks a megabyte a click.
 */
export function CardPreview({ report }: { report: ClientReport }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    let created: string | null = null;

    reportCardBlob(report).then((blob) => {
      if (!live) return;
      if (!blob) {
        setFailed(true);
        return;
      }
      created = URL.createObjectURL(blob);
      setUrl(created);
    });

    return () => {
      live = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [report]);

  if (failed) {
    return (
      <Card>
        <p className="small">
          This browser would not draw the card. Everything below is still
          correct, and <b>Send on WhatsApp</b> still works — it sends the
          summary as text.
        </p>
      </Card>
    );
  }

  return (
    <div className="rptcard">
      {url ? (
        /* eslint-disable-next-line @next/next/no-img-element -- a blob URL
           painted in this browser; `next/image` optimises remote and static
           assets and has nothing to do for one. */
        <img src={url} alt={reportMessage(report)} width={1080} height={1350} />
      ) : (
        <div className="rptcard__wait" aria-hidden="true" />
      )}
    </div>
  );
}
