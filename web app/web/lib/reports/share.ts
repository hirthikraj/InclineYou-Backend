/**
 * FOUR WAYS THE CARD LEAVES THE BUILDING, AND WHY THERE ARE FOUR.
 *
 * The brief asks for "a one-tap share to WhatsApp", and on a browser that is one
 * capability on a phone and a different one on a desk. Pretending otherwise
 * gives every trainer the worse of the two, so the screen offers the best route
 * the machine in front of it actually has:
 *
 * | | What it does | Where it is the right answer |
 * | --- | --- | --- |
 * | **Share** | `navigator.share` with the PNG attached | a phone or a tablet — genuinely one tap, and the OS sheet lists WhatsApp, Instagram and everything else |
 * | **WhatsApp** | `wa.me/<number>?text=` | a desk, where the text opens in WhatsApp Web against the right chat |
 * | **Copy image** | the PNG on the clipboard | a desk, where the trainer then pastes it into that same chat |
 * | **Download** | the PNG in Downloads | everywhere, and the only one that cannot fail |
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

export type ShareOutcome = 'shared' | 'downloaded' | 'copied' | 'unsupported' | 'cancelled' | 'failed';

/**
 * The native share sheet, with the card attached.
 *
 * `canShare({files})` is asked BEFORE anything is painted, because a desktop
 * Chrome answers false and the honest response is to fall through to the other
 * three buttons rather than to spend a second rendering a PNG nothing will take.
 *
 * An `AbortError` is the trainer closing the sheet, which is not a failure and
 * must not be reported as one — a toast saying "could not share" after somebody
 * deliberately pressed Cancel is the product arguing with them.
 */
export async function shareCard(r: ClientReport): Promise<ShareOutcome> {
  if (typeof navigator === 'undefined' || !navigator.canShare) return 'unsupported';

  const blob = await reportCardBlob(r);
  if (!blob) return 'failed';

  const file = new File([blob], reportCardFilename(r), { type: 'image/png' });
  if (!navigator.canShare({ files: [file] })) return 'unsupported';

  try {
    await navigator.share({
      files: [file],
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

/** The PNG in Downloads. The same object-URL dance `downloadCsv` does, and the
 *  one route on this screen with no capability behind it to fail. */
export async function downloadCard(r: ClientReport): Promise<ShareOutcome> {
  const blob = await reportCardBlob(r);
  if (!blob) return 'failed';

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = reportCardFilename(r);
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  requestAnimationFrame(() => URL.revokeObjectURL(url));
  return 'downloaded';
}
