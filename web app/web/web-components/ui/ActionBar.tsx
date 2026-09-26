'use client';

import type { ReactNode } from 'react';

/**
 * ACTION BAR — the screen's live verb, in the thumb's arc.
 *
 * A bar anchored to the bottom edge of the viewport holding the one thing the
 * screen is for at this moment: the primary verb, or the clock that says when
 * the next one is due.
 *
 * ── WHY IT EXISTS, AND WHY IT IS NOT `.bulk` ────────────────────────────────
 *
 * `BulkBar` replaces a toolbar IN PLACE and counts ticked rows. This replaces
 * nothing and says what to do next. They look alike — a bar, actions on the
 * right — and they answer different questions: one is a mode a table enters,
 * the other is the floor of the screen.
 *
 * ── THE MEASUREMENT THAT ASKED FOR IT ───────────────────────────────────────
 *
 * On `/sessions/:id/log` at 390x844 the rest clock and *Take last time's
 * numbers* live in the card's foot, which is at y=1007 inside a 628px
 * scroller. Tick a set and the clock that starts is 400px below the fold, on
 * the one screen in the product a trainer drives one-handed with a phone on a
 * rack. A card foot is the right home for them while the card fits the
 * viewport; on a phone it is the first thing to scroll away.
 *
 * ── IT IS A TOUCH COMPONENT AND SAYS SO ─────────────────────────────────────
 *
 * Call-sites render it behind a media query rather than drawing it always and
 * hiding it with CSS. Two copies of a `role="timer"` — one of them in a
 * `display:none` subtree — is a clock announced twice, and `Clients.tsx`
 * already records the matching bug for a menu. `usePhoneView` is the shape.
 *
 * Every control in the bar clears 44px. `.btn--sm` is 36 under a coarse
 * pointer and the app has decided that is acceptable for a control sitting
 * beside a bigger one; nothing in this bar is beside a bigger one.
 */
export function ActionBar({
  tone,
  /** 0…1. Drawn as the bar's own top border, so it costs no height. */
  progress,
  label,
  role,
  children,
  /** Drawn in place, for a specimen. */
  inline,
  className,
}: {
  tone?: 'accent' | 'ok';
  progress?: number;
  /** The accessible name — the bar is a landmark for a live figure, not prose. */
  label?: string;
  role?: 'timer' | 'group' | 'status';
  children: ReactNode;
  inline?: boolean;
  className?: string;
}) {
  return (
    <div
      className={['abar', tone ? `abar--${tone}` : null, className].filter(Boolean).join(' ')}
      role={role ?? 'group'}
      aria-label={label}
      style={
        inline
          ? { position: 'relative', borderRadius: 'var(--tx-r2)', border: '1px solid var(--tx-line-strong)' }
          : undefined
      }
    >
      {progress === undefined ? null : (
        <span
          className="abar__fill"
          aria-hidden="true"
          style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }}
        />
      )}
      {children}
    </div>
  );
}

/**
 * An icon and one figure, read at arm's length.
 *
 * The figure is mono and tabular for the reason every counting number in this
 * app is: `2:30` to `2:29` must not shuffle the sentence beside it sideways.
 */
function Lead({ icon, figure }: { icon?: ReactNode; figure: ReactNode }) {
  return (
    <span className="abar__lead">
      {icon}
      <b className="abar__fig">{figure}</b>
    </span>
  );
}

/**
 * One line, clipped rather than wrapped.
 *
 * A bar that grows a second line moves every control on it, and the controls
 * are the reason the bar exists. Anything that will not fit on one line at
 * 360px belongs on the screen behind the bar, not in it.
 */
function Text({ children }: { children: ReactNode }) {
  return <span className="abar__text">{children}</span>;
}

function Acts({ children }: { children: ReactNode }) {
  return <span className="abar__acts">{children}</span>;
}

ActionBar.Lead = Lead;
ActionBar.Text = Text;
ActionBar.Acts = Acts;
