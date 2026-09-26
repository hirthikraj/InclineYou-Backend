/**
 * HOW THE REPORT LEAVES THE BUILDING — TWO ARTEFACTS, FIVE ROUTES.
 *
 * ── THE TWO ARTEFACTS ARE FOR TWO DIFFERENT MOMENTS ─────────────────────────
 *
 * **The card** is a 1080×1350 PNG: one image, 4:5, built to be posted to a
 * WhatsApp status or an Instagram story. It carries the headline and drops
 * whatever will not fit above its footer, because a card with a hole in it is
 * worse than a card with three lifts on it.
 *
 * **The report** is a multi-page A4 PDF: every lift, every movement trained
 * whether or not it went up, every measurement with its whole series, and the
 * note saying how each figure was arrived at. It is the thing a client keeps
 * and the thing they forward to a physio. Its first page is the card, painted
 * by the same function, so the two can never disagree.
 *
 * Both, and not one: a client who asks *"how am I doing"* wants the card, and a
 * client who asks *"can you send me the numbers"* wants the PDF, and a product
 * that guesses gets it wrong half the time.
 *
 * ── AND FIVE ROUTES, BECAUSE A BROWSER IS TWO DIFFERENT MACHINES ────────────
 *
 * The brief asks for "a one-tap share to WhatsApp", and on a browser that is
 * one capability on a phone and a different one on a desk. Pretending otherwise
 * gives every trainer the worse of the two, so the screen offers the best route
 * the machine in front of it actually has:
 *
 * | | What it does | Where it is the right answer |
 * | --- | --- | --- |
 * | **Share** | `navigator.share` with the PNG *and* the PDF attached | a phone or a tablet — genuinely one tap, and the OS sheet lists WhatsApp, Instagram and everything else |
 * | **WhatsApp** | `wa.me/<number>?text=` | a desk, where the text opens in WhatsApp Web against the right chat |
 * | **Copy image** | the PNG on the clipboard | a desk, where the trainer then pastes it into that same chat |
 * | **Save image** | the PNG in Downloads | everywhere, and one of the two that cannot fail |
 * | **Save report** | the PDF in Downloads | a desk, to attach to the chat, or to print |
 *
 * ── THE TEXT AND THE IMAGE ARE NOT THE SAME SHARE ───────────────────────────
 *
 * A `wa.me` link carries text and nothing else — there is no parameter for an
 * attachment and there never has been. So a trainer on a desk sends the message
 * and pastes the card; a trainer on a phone sends both at once through the OS
 * sheet. Both are supported rather than one being simulated, because the failure
 * mode of pretending is a trainer who thinks they sent a picture and sent a
 * paragraph.
 *
 * ── AND NOTHING HERE IS LOGGED ──────────────────────────────────────────────
 *
 * Deliberately a plain `wa.me` link, exactly as the client file's WhatsApp
 * button is, and for the identical reason it gives: `POST /v1/clients/{id}/nudge`
 * writes a `nudge_log` row, and the phone computes a once-per-client-per-7-days
 * cooldown from that table (`app/src/nudges/rules.ts`). Sending somebody their
 * progress report must not spend the weekly reminder that an overdue invoice
 * needs three days later. **The money book's *Remind* should stay the only thing
 * that nudges.**
 */

import type { ClientReport } from './build';
import { reportMessage } from './build';
import { reportCardBlob, reportCardFilename } from './card-image';
import { reportPdfBlob, reportPdfFilename } from './report-pdf';

/** What `wa.me` wants: country code, no punctuation. Copied from `Header.tsx`
 *  rather than imported, because that file is a component and this one is not. */
export function dialable(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

/**
 * `wa.me/<number>?text=…`, or the number-less form when there is no phone on
 * file. WhatsApp's own chooser is the right fallback: a trainer who never typed
 * the client's number still gets the message written for them.
 */
export function whatsappUrl(r: ClientReport): string {
  const text = encodeURIComponent(reportMessage(r));
  return r.clientPhone
    ? `https://wa.me/${dialable(r.clientPhone)}?text=${text}`
    : `https://wa.me/?text=${text}`;
}

export type ShareOutcome =
  | 'shared'
  | 'downloaded'
  | 'saved-pdf'
  | 'copied'
  | 'unsupported'
  | 'cancelled'
  | 'failed';

/**
 * The native share sheet, with BOTH artefacts attached.
 *
 * `canShare({files})` is asked BEFORE anything is painted, because a desktop
 * Chrome answers false and the honest response is to fall through to the other
 * buttons rather than to spend two seconds rendering files nothing will take.
 *
 * ── THE PAIR DEGRADES TO THE IMAGE, NOT TO NOTHING ──────────────────────────
 *
 * `canShare` is asked a second time with the pair, and the reason is a real
 * platform split rather than caution: Android's sheet takes a mixed-type
 * multi-file share and several iOS versions accept a single file only. So the
 * pair is offered, and where it is refused the CARD goes on its own — it is
 * the artefact the button is named after, and the PDF has its own Save button
 * one row down. Dropping the share entirely because the second file was
 * unwelcome would be the product punishing the trainer for their OS.
 *
 * ── AND CANCEL IS NOT A FAILURE ─────────────────────────────────────────────
 *
 * An `AbortError` is the trainer closing the sheet, which must not be reported
 * as an error — a message saying "could not share" after somebody deliberately
 * pressed Cancel is the product arguing with them.
 */
export async function shareCard(r: ClientReport): Promise<ShareOutcome> {
  if (typeof navigator === 'undefined' || !navigator.canShare) return 'unsupported';

  const [png, pdf] = await Promise.all([reportCardBlob(r), reportPdfBlob(r)]);
  if (!png) return 'failed';

  const card = new File([png], reportCardFilename(r), { type: 'image/png' });
  const report = pdf ? new File([pdf], reportPdfFilename(r), { type: 'application/pdf' }) : null;

  const files =
    report && navigator.canShare({ files: [card, report] })
      ? [card, report]
      : navigator.canShare({ files: [card] })
        ? [card]
        : null;
  if (!files) return 'unsupported';

  try {
    await navigator.share({
      files,
      text: reportMessage(r),
      title: `${r.clientName} · ${r.weeks} weeks`,
    });
    return 'shared';
  } catch (error) {
    return error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

/** The PNG on the clipboard, for pasting straight into WhatsApp Web. Firefox
 *  has no `ClipboardItem` for images, which is a real browser and not an error —
 *  the caller falls back to the download. */
export async function copyCard(r: ClientReport): Promise<ShareOutcome> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return 'unsupported';

  const blob = await reportCardBlob(r);
  if (!blob) return 'failed';

  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** A blob into the trainer's Downloads. The same object-URL dance
 *  `downloadCsv` does, and the two routes on this screen with no browser
 *  capability behind them to fail. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

/** The card, as a PNG. */
export async function downloadCard(r: ClientReport): Promise<ShareOutcome> {
  const blob = await reportCardBlob(r);
  if (!blob) return 'failed';
  saveBlob(blob, reportCardFilename(r));
  return 'downloaded';
}

/**
 * The full report, as a PDF.
 *
 * A separate outcome from the PNG's — `saved-pdf` rather than `downloaded` —
 * because the screen has to be able to say WHICH file landed. Two buttons that
 * both report "saved to your downloads" is a trainer opening their Downloads
 * folder to find out what they just pressed.
 */
export async function downloadReportPdf(r: ClientReport): Promise<ShareOutcome> {
  const blob = await reportPdfBlob(r);
  if (!blob) return 'failed';
  saveBlob(blob, reportPdfFilename(r));
  return 'saved-pdf';
}
