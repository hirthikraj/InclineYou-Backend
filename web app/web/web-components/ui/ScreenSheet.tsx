'use client';

import { useEffect, useId, useRef, type ReactNode, type Ref } from 'react';

import { ChevronLeft } from '@/components/shell/Icons';

/**
 * Screen sheet — a whole phone screen of a task, with a way back and one verb.
 * `.scrsh`, catalogue entry `c-screensheet`.
 *
 * ── WHY IT EXISTS, AND WHY IT IS NOT A WIDER `Modal` ────────────────────────
 *
 * `c-modal` is a box over a page: a title, a body that scrolls INSIDE the box,
 * and a foot of buttons. On a 390px phone that is the box's border, the dimmed
 * page round it and a pinned foot spending ~40% of the glass, and a body that
 * scrolls inside a page that also scrolls. MEASURED on the assessment template
 * editor (21 Nov 2026, from a screenshot): name, a five-line description and a
 * three-line switch came before the first measurement, so the thing the
 * trainer opened the editor to change started below the fold.
 *
 * A phone's answer to a multi-part form is a SCREEN, not a box: the header
 * holds the way back and the one verb, the body is the screen's only scroller,
 * and a part too big for one screen is a screen of its own reached by a row.
 * That is a different promise from `Modal`'s, so it is a different component
 * rather than a prop on that one — the same line `c-sidecar` and `c-dock` draw.
 *
 * ── ONE SURFACE, MANY SCREENS ───────────────────────────────────────────────
 *
 * The caller holds which screen is showing and hands this the screen's
 * `title`, `back` and `action`; `screen` is that screen's key. Changing it
 * remounts the body (so a drill-in opens at the top, not at the scroll position
 * of the screen it came from), plays the entrance from the side the trainer is
 * moving to (`direction`), and puts focus on the new screen's heading — a
 * keyboard or screen-reader user who pressed a row is told where they landed
 * rather than left on a control that no longer exists. Not on first mount: the
 * host's `initialFocus` owns that moment (`ModalHost`'s own rule).
 *
 * It is drawn inside a `ModalHost`, which brings the scrim, the Escape key, the
 * focus trap and the return of focus on close. The host's `onClose` is where a
 * caller decides whether Escape means *back one screen* or *close*.
 *
 * ── IT ARRIVES AND IT LEAVES (21 Nov 2026) ──────────────────────────────────
 *
 * Opening slides the sheet in from the right with a fade, the way a pushed
 * screen arrives on a phone, and `closing` slides it back out. The exit needs the
 * box to still be mounted while it moves, which is `useDismiss`'s whole job:
 * pass its `closing` and its `ref` (as `surfaceRef`) and call its `dismiss`
 * instead of unmounting, and the hook waits for the transition to finish. Both
 * are transitions (an entrance through `@starting-style`), never keyframes, and
 * both collapse under `prefers-reduced-motion`.
 */
export function ScreenSheet({
  title,
  screen = 'main',
  direction = null,
  backLabel,
  onBack,
  action,
  closing = false,
  surfaceRef,
  children,
  className,
}: {
  title: ReactNode;
  /** The key of the screen being shown. Changing it is a navigation — see above. */
  screen?: string;
  /**
   * Which way the last navigation went; decides the side the body enters from.
   * `null` (the default) on the first screen, so opening the sheet does not
   * slide its first screen in from the side as though it had been navigated to.
   */
  direction?: 'forward' | 'back' | null;
  /** What the back control does, in words: *Close*, *Back to the template*. */
  backLabel: string;
  onBack: () => void;
  /** The screen's one verb, at the header's right — *Save*, *Done*. */
  action?: ReactNode;
  /** Leaving: plays the exit. Pair with `useDismiss` — see above. */
  closing?: boolean;
  /** `useDismiss`'s ref, so the hook can wait for the exit on this element. */
  surfaceRef?: Ref<HTMLDivElement>;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    heading.current?.focus();
  }, [screen]);

  return (
    <div
      ref={surfaceRef}
      className={['scrsh', closing ? 'scrsh--out' : '', className].filter(Boolean).join(' ')}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-t`}
    >
      <header className="scrsh__hd">
        <button type="button" className="scrsh__back" onClick={onBack} aria-label={backLabel}>
          <ChevronLeft size={20} />
        </button>
        {/* `tabIndex={-1}`: focusable by the navigation above, never a tab stop. */}
        <h2
          key={screen}
          className="scrsh__t"
          id={`${id}-t`}
          ref={heading}
          tabIndex={-1}
          data-dir={direction ?? undefined}
        >
          {title}
        </h2>
        {action ? <span className="scrsh__act">{action}</span> : null}
      </header>
      <div key={screen} className="scrsh__body" data-dir={direction ?? undefined}>
        {children}
      </div>
    </div>
  );
}
