'use client';

import type { ReactNode } from 'react';

import { Toast, Toasts } from '@/web-components/ui/Toast';
import { ToastProvider, depthOf, useToastStore } from '@/lib/toast/store';

/**
 * The deck, mounted once for the whole shell.
 *
 * ── WHY IT IS IN THE SHELL AND NOT ON THE SCREENS ───────────────────────────
 *
 * The same argument `NotificationsHost` makes about the bell, and it is the one
 * that decides this component's existence: a confirm each PAGE had to remember
 * to mount is a confirm that is missing on the screens somebody forgot. Worse
 * here than there — an absent count on a bell is a missing number, but an
 * absent confirm is the claim that nothing happened, and the trainer's next
 * move is to press the button again.
 *
 * It also has to outlive a navigation. *Use this* copies a certified program
 * and then pushes the trainer into the builder; a toast owned by the shelf
 * unmounts on the way and is never seen. This host is above the router's
 * children, so the card is still on screen when the new page paints — which is
 * what let `?copied=1` and the `.pg__flash` band that consumed it go.
 *
 * ── ONE REGION, TWO MOTIONS ─────────────────────────────────────────────────
 *
 * Notices and receipts share this deck rather than getting a corner each. Two
 * fixed regions in the same corner is a collision, and two regions in different
 * corners is a second place to look — the failure §04 names by name. So they
 * stack together and differ in how they arrive and how they leave, which is a
 * difference a trainer reads without being told about it.
 */
export function ToastHost({ children }: { children: ReactNode }) {
  const store = useToastStore();

  return (
    <ToastProvider value={store}>
      {children}
      <Toasts>
        {store.toasts.map((toast, index) => {
          /* Depth over LIVE cards only, so the deck closes over a card that is
             on its way out instead of holding its slot open. `depthOf` in the
             store is the count; this is the only place it is used. */
          const depth = depthOf(store.toasts, index);
          return (
            <Toast
              key={toast.id}
              tone={toast.tone}
              variant={toast.variant}
              depth={depth}
              buried={depth > 3}
              leaving={toast.leaving}
              title={toast.title}
              body={toast.body}
              action={
                toast.action
                  ? {
                      label: toast.action.label,
                      /* The action dismisses its own card. Every one of these is
                         an Undo, and an Undo that leaves the confirm of the thing
                         it just undid on screen is a contradiction in the corner
                         of the room. The call site never has to remember. */
                      onClick: () => {
                        toast.action?.onClick();
                        store.dismiss(toast.id);
                      },
                    }
                  : undefined
              }
              onDismiss={() => store.dismiss(toast.id)}
            />
          );
        })}
      </Toasts>
    </ToastProvider>
  );
}
