import type { ToastSpec } from '@/lib/toast/store';
import { undoPackage } from './package-actions';

/**
 * THE RECEIPT A SALE OR RENEW LEAVES — with its Undo (9 Nov 2026).
 *
 * Renew goes straight through, the way booking does: no Yes/No before it,
 * because a confirm on a button pressed every week is a reflex, and a mis-tap
 * here costs nothing yet (no money moved, nobody was told). The receipt is the
 * safety net instead. Its Undo is `DELETE /v1/packages/{id}`, which the server
 * allows for ten minutes and only while nothing was recorded on the pack, so
 * the receipt holds ten seconds rather than five. One builder for Today, the
 * roster and the client file, so the three say the same thing.
 */
export function packReceipt(
  show: (spec: ToastSpec) => string,
  input: { title: string; body: string; clientId: string | null; packageId?: string },
): void {
  const { packageId } = input;
  show({
    tone: 'ok',
    variant: 'receipt',
    title: input.title,
    body: input.body,
    duration: 10_000,
    action: packageId
      ? {
          label: 'Undo',
          onClick: () => void undoPackage(input.clientId, packageId).then((res) => {
            show(res.ok
              ? { tone: 'ok', variant: 'receipt', title: 'Undone', body: 'The pack is gone, and any sessions it took wait for a pack again.' }
              : { tone: 'danger', variant: 'receipt', title: 'Could not undo', body: res.message });
          }),
        }
      : undefined,
  });
}
