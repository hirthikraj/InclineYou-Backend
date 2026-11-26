'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { markDone, markNoShow, reopenSession } from '@/lib/schedule/actions';
import { useToast } from '@/lib/toast/store';

/**
 * ONE SESSION, TWO ANSWERS — AND *MARK ALL*, WHICH IS THE FIRST ANSWER MANY TIMES.
 *
 * Shared by the two cards on Today that ask about sessions nobody marked:
 * *Log today's sessions* and *Unmarked from last week*. They were one card's
 * private state; a second caller is the moment it becomes a hook rather than
 * a copy.
 *
 * ── THE WRITES ARE THE SCHEDULE'S, ONE AT A TIME ────────────────────────────
 *
 * `markDone` / `markNoShow` — one door per verb. They run strictly one after
 * another, for `deck.ts`'s reason: two charges racing against a pack with one
 * session left both read `1`. A row is disabled while its write is in flight.
 *
 * ── *MARK ALL N DONE* IS HELD, AND NOTHING IS WRITTEN UNTIL THE HOLD ENDS ────
 *
 * Decided with the product owner on 26 Nov 2026: the button ships now, and a
 * bulk endpoint follows later. Until then it is the per-session write in a
 * loop, so it works today and the swap is one function (`runAll`).
 *
 * One press moves up to N pack balances, so it is held for ten seconds with an
 * Undo — the queue's own hold (`HOLD_SECONDS`) and the console's ten-second
 * receipt, for the same reason: undoing a write that has happened is a
 * correction, undoing one that has not is free. The rows say *Marking…* while
 * held, so the screen never claims a mark the server has not made.
 *
 * Navigating away during the hold CANCELS it. Leaving the page is not consent,
 * the AttentionQueue's rule for its own timers.
 *
 * ── AND NO MARK IS A ONE-WAY DOOR ───────────────────────────────────────────
 *
 * Every write here ends in a receipt with *Undo*, which is `reopenSession`:
 * booked again, the pack charge reversed (never deleted) — the client file's
 * Sessions tab's rule (`MarkButtons`). The first draft of this hook had none,
 * and neither had the card it was extracted from; found during verification,
 * when a mark made by the bulk hold had NO way back anywhere in the product:
 * the Schedule sends a settled session to its page, and that page has no
 * Reopen. The receipt is the only door, so it has to be on every mark.
 */

export type MarkState =
  | { kind: 'rest' }
  | { kind: 'held' }
  | { kind: 'working' }
  | { kind: 'done'; word: 'Done' | 'No-show'; note?: string }
  | { kind: 'failed'; message: string };

export const BULK_HOLD_MS = 10_000;

export interface Markable {
  id: string;
  clientName: string;
}

export function useMarkRows() {
  const router = useRouter();
  const { show } = useToast();
  const [states, setStates] = useState<Record<string, MarkState>>({});
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = useCallback((id: string, state: MarkState) => {
    setStates((prev) => ({ ...prev, [id]: state }));
  }, []);

  useEffect(
    () => () => {
      if (hold.current) clearTimeout(hold.current);
    },
    [],
  );

  /** One write, recorded on its row. Answers whether it went through. */
  const write = useCallback(
    async (s: Markable, came: boolean): Promise<boolean> => {
      set(s.id, { kind: 'working' });
      const result = came
        ? await markDone(s.id)
        : await markNoShow({ id: s.id, costsASession: true });
      if (!result.ok) {
        set(s.id, { kind: 'failed', message: result.message ?? 'That did not go through.' });
        return false;
      }
      const left = result.sessionsRemaining;
      set(s.id, {
        kind: 'done',
        word: came ? 'Done' : 'No-show',
        note: result.message ?? (typeof left === 'number' ? `${left} left on the pack` : undefined),
      });
      return true;
    },
    [set],
  );

  /** Reopen the given sessions, one at a time, and put their rows back. */
  const undoMarks = useCallback(
    async (list: Markable[]) => {
      let failed = 0;
      for (const s of list) {
        const back = await reopenSession(s.id);
        if (back.ok) set(s.id, { kind: 'rest' });
        else failed += 1;
      }
      router.refresh();
      if (failed > 0) {
        show({
          tone: 'danger',
          title: <>Could not undo {failed === 1 ? 'one mark' : `${failed} marks`}</>,
          body: <>Open the session to change it.</>,
        });
      }
    },
    [router, set, show],
  );

  const answer = useCallback(
    async (s: Markable, came: boolean) => {
      if (!(await write(s, came))) return;
      router.refresh();
      show({
        tone: 'ok',
        variant: 'receipt',
        title: <>{came ? 'Marked done' : 'No-show recorded'}</>,
        body: <>{s.clientName}. One session off the pack.</>,
        action: { label: 'Undo', onClick: () => void undoMarks([s]) },
      });
    },
    [router, show, undoMarks, write],
  );

  /** The bulk write. Swap the loop for the bulk endpoint when it lands. */
  const runAll = useCallback(
    async (list: Markable[]) => {
      let failed = 0;
      const marked: Markable[] = [];
      for (const s of list) {
        if (await write(s, true)) marked.push(s);
        else failed += 1;
      }
      router.refresh();
      if (marked.length > 0) {
        show({
          tone: 'ok',
          variant: 'receipt',
          duration: BULK_HOLD_MS,
          title: <>Marked {marked.length === 1 ? '1 session' : `${marked.length} sessions`} done</>,
          body: <>One session off each pack.</>,
          action: { label: 'Undo', onClick: () => void undoMarks(marked) },
        });
      }
      if (failed > 0) {
        show({
          tone: 'danger',
          title: <>{failed} of {list.length} not marked</>,
          body: <>The rest went through. Each one that did not says why on its row.</>,
        });
      }
    },
    [router, show, undoMarks, write],
  );

  const markAll = useCallback(
    (list: Markable[]) => {
      if (list.length === 0 || hold.current) return;
      setStates((prev) => {
        const next = { ...prev };
        for (const s of list) next[s.id] = { kind: 'held' };
        return next;
      });
      const release = () =>
        setStates((prev) => {
          const next = { ...prev };
          for (const s of list) if (next[s.id]?.kind === 'held') next[s.id] = { kind: 'rest' };
          return next;
        });
      hold.current = setTimeout(() => {
        hold.current = null;
        void runAll(list);
      }, BULK_HOLD_MS);
      show({
        tone: 'neutral',
        variant: 'receipt',
        duration: BULK_HOLD_MS,
        title: <>Marking {list.length === 1 ? '1 session' : `${list.length} sessions`} done</>,
        body: <>Each takes one session off its pack. Nothing is written for ten seconds.</>,
        action: {
          label: 'Undo',
          onClick: () => {
            if (hold.current) clearTimeout(hold.current);
            hold.current = null;
            release();
          },
        },
      });
    },
    [runAll, show],
  );

  const stateOf = useCallback((id: string): MarkState => states[id] ?? { kind: 'rest' }, [states]);

  const holding = Object.values(states).some((s) => s.kind === 'held');

  return { stateOf, answer, markAll, holding };
}
