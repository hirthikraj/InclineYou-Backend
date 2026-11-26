'use client';

import { Button } from '@/web-components/ui/Button';
import { Tag } from '@/web-components/ui/Tag';
import { Check } from '@/components/shell/Icons';
import type { MarkState } from './useMarkRows';

/**
 * *Done* · *No-show* on a row, or the receipt that replaces them.
 *
 * Neither is lime: seven stacked lime buttons made a list louder than the
 * session about to start. The tick keeps *Done* the obvious answer of the two.
 *
 * *No-show* is a GHOST button (revamp review, 26 Nov 2026): nine marks in ten
 * are *Done*, and a mis-tapped *No-show* takes a session off a pack — so the
 * rare answer is the quiet one, still a full-size target.
 *
 * *No-show* lost its visible *· −1* in the revamp (approved 26 Nov 2026). The
 * cost moved to the card's sentence (*A no-show still uses one session from the
 * pack*) where it is said once instead of on every row — and it stays in the
 * accessible name, because a reader tabbing the buttons never reads the lead.
 */
export function MarkAnswer({
  state,
  clientName,
  onAnswer,
}: {
  state: MarkState;
  clientName: string;
  onAnswer: (came: boolean) => void;
}) {
  if (state.kind === 'done') {
    return (
      <span className="mka mka--done" aria-live="polite">
        <Tag tone="ok">
          <Check size={12} />
          {state.word}
        </Tag>
        {state.note && <span className="mka__note">{state.note}</span>}
      </span>
    );
  }
  const busy = state.kind === 'working' || state.kind === 'held';
  return (
    <span className="mka">
      {state.kind === 'failed' && (
        <span className="mka__err" role="alert">
          {state.message}
        </span>
      )}
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => onAnswer(true)}
        aria-label={`${clientName} came: mark done`}
      >
        {state.kind === 'held' ? (
          'Marking…'
        ) : state.kind === 'working' ? (
          '…'
        ) : (
          <>
            <Check size={13} />
            Done
          </>
        )}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => onAnswer(false)}
        aria-label={`No-show for ${clientName}, takes one session from the pack`}
      >
        No-show
      </Button>
    </span>
  );
}
