'use client';

import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import { Warn, Check, No } from '@/components/shell/Icons';
import type { ToastTone, ToastVariant } from '@/lib/toast/store';

/**
 * Toast — the confirm with no row to land on.
 *
 * ── THE POLITENESS IS THE COMPONENT ─────────────────────────────────────────
 *
 * A toast that says "Payment recorded" and a toast that says "Export failed"
 * are not the same announcement. The first is `polite` — it can wait for the
 * reader to finish the sentence they are on. The second is `assertive`, because
 * something the trainer asked for did not happen and every second they spend
 * believing it did is a second they act on the wrong book.
 *
 * That is chosen from `tone` here rather than at the call-site, where in
 * practice it is chosen by whoever copied the nearest existing toast.
 *
 * ── AND THE MOTION IS THE VARIANT ───────────────────────────────────────────
 *
 * The same argument, one level out. A `notice` rises into the deck and stays; a
 * `receipt` flies in from the right edge, holds five seconds and shrinks in
 * place. Which one a confirm gets is a fact about the news — is this one of a
 * run, or is it a single thing with a clock on it — so it is a prop with two
 * values rather than a bag of durations and offsets each call site sets for
 * itself. `lib/toast/store.ts` carries that argument in full.
 *
 * Every number the motion uses lives in `webapp.css`. This file contributes one
 * thing the stylesheet cannot: the finger.
 */
export type { ToastTone, ToastVariant };

const ICON: Record<ToastTone, ReactNode> = {
  neutral: <Check size={16} />,
  ok: <Check size={16} />,
  warn: <Warn size={16} />,
  danger: <No size={16} />,
};

/** Past this, letting go dismisses instead of springing back. The reference's. */
const SWIPE_THRESHOLD = 50;

/**
 * How much of the finger's travel the card actually takes once it is past the
 * threshold — the reference's `dragElastic: 0.1`. It matters more than it
 * sounds: without it a long drag carries the card into the middle of the
 * screen, and the gesture stops reading as "push it off the edge".
 */
const DRAG_ELASTIC = 0.1;

export function Toast({
  tone = 'neutral',
  variant = 'notice',
  depth = 0,
  buried = false,
  leaving = false,
  title,
  body,
  action,
  onDismiss,
  className,
}: {
  tone?: ToastTone;
  variant?: ToastVariant;
  /** Position in the deck. 0 is the front card. Drives every transform. */
  depth?: number;
  /** Under the fourth card: mounted, so it can fade up, drawn at zero. */
  buried?: boolean;
  /** Dismissed and being held for one exit transition. */
  leaving?: boolean;
  /** What happened. One clause. */
  title: ReactNode;
  /** What it happened to. Clamped at two lines. */
  body?: ReactNode;
  /** One undo, at most. A toast with two choices is a modal that got away. */
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
  className?: string;
}) {
  /* The finger's offset, in px. State rather than a ref because it is drawn —
     but it is written to a custom property rather than to `transform`, because
     the transform also carries the card's depth in the deck and the stylesheet
     is the one place that composition should be written down. */
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const from = useRef(0);

  /* A NOTICE IS NOT SWIPEABLE, and that is deliberate rather than unfinished.
     It sits in a deck where three other cards are stacked directly behind it,
     and a horizontal drag over a pile is a gesture whose target nobody can
     predict. The receipt is alone on screen, which is what makes the gesture
     unambiguous — and it is also the one with a deadline, so it is the one a
     trainer has a reason to want gone early. */
  const swipeable = variant === 'receipt' && !!onDismiss && !leaving;

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!swipeable) return;
    /* Not from the buttons. A press that starts on Undo is a press of Undo,
       and capturing the pointer here would eat its click. */
    if ((event.target as HTMLElement).closest('button')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    from.current = event.clientX;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const raw = event.clientX - from.current;
    /* RIGHT ONLY — `dragConstraints: {left: 0}` in the reference. Dragging a
       bottom-right card leftwards pulls it into the page it is reporting on. */
    if (raw <= 0) {
      setDx(0);
      return;
    }
    setDx(raw > SWIPE_THRESHOLD ? SWIPE_THRESHOLD + (raw - SWIPE_THRESHOLD) * DRAG_ELASTIC : raw);
  }

  function onPointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (dx >= SWIPE_THRESHOLD) onDismiss?.();
    /* Either way the offset goes back to zero: on a dismiss the exit pose
       overrides it, and on a release short of the threshold the card springs
       home on the same curve everything else uses. */
    setDx(0);
  }

  return (
    <div
      className={[
        'toast',
        tone === 'neutral' ? null : `toast--${tone}`,
        variant === 'receipt' ? 'toast--receipt' : null,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--i': depth, '--tx-dx': `${dx}px` } as CSSProperties}
      data-buried={buried || undefined}
      data-leaving={leaving || undefined}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role={tone === 'danger' ? 'alert' : 'status'}
      aria-live={tone === 'danger' ? 'assertive' : 'polite'}
      /* A card under the fourth is drawn at zero opacity and is still in the
         DOM, which is exactly the shape a screen reader should not read out. */
      aria-hidden={buried || undefined}
    >
      {ICON[tone]}
      <span className="toast__m">
        <span className="toast__t">{title}</span>
        {body ? <span className="toast__b">{body}</span> : null}
      </span>
      {action ? (
        <button type="button" className="toast__act" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
      {onDismiss ? (
        <button type="button" className="toast__x" aria-label="Dismiss" onClick={onDismiss}>
          <No size={14} />
        </button>
      ) : null}
    </div>
  );
}

/**
 * The stack. Newest at the FRONT of the array and at the front of the deck —
 * nearest the thumb, drawn over the ones behind it. `depthOf` in the store is
 * what turns that order into the `--i` each card is posed by.
 */
export function Toasts({ children }: { children: ReactNode }) {
  return <div className="toasts">{children}</div>;
}
