'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';

import type { Message } from '@/lib/auth/copy';
import type { StepResult } from '@/lib/setup/actions';
import { SetupApiError } from '@/lib/setup/errors';
import { writeMessage } from '@/lib/setup/copy';

/**
 * Running one step's write, and saying so when it fails.
 *
 * Every step in this flow does the same three things — call a server action,
 * navigate on success, put a sentence in the message slot on failure — and this
 * is the one place that sequence lives. Two details in it are load-bearing:
 *
 *   · **navigation is `push`, not `replace`.** The back button has to work
 *     across the whole flow, which is §14's commitment and the reason there are
 *     eight routes rather than one wizard;
 *   · **the message is cleared when the answer changes, not when the next
 *     attempt starts.** A refusal describes the value that was refused; it
 *     stops describing the one being edited the moment a key is pressed. Same
 *     rule as `SignInForm`.
 */
export function useStepAction() {
  const router = useRouter();
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, startTransition] = useTransition();

  const run = useCallback(
    (action: () => Promise<StepResult>, onDone?: () => void) => {
      setMessage(null);
      startTransition(async () => {
        let result: StepResult;
        try {
          result = await action();
        } catch (error) {
          // A server action that threw rather than returning — the request never
          // completed, so nothing was written and the copy should say so.
          setMessage(writeMessage(error));
          return;
        }

        if (!result.ok) {
          // The action serialises the error's two fields; rebuilt here so
          // `writeMessage` branches on the same shape it does everywhere else.
          setMessage(writeMessage(new SetupApiError(result.error.status, result.error.detail)));
          return;
        }

        if (result.next) {
          router.push(result.next);
          return;
        }
        // An empty destination means "written, stay here" — adding a pack, or
        // saving how you work before its price list exists.
        router.refresh();
        onDone?.();
      });
    },
    [router],
  );

  return { run, pending, message, setMessage } as const;
}
