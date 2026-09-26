'use client';

import { useEffect, useState } from 'react';

import { ChevronDown } from './Icons';

/**
 * THE SHELF, ON A PHONE — the program's name is the way to the other programs.
 *
 * ── THE PROBLEM THIS SOLVES ──────────────────────────────────────────────────
 *
 * `app.css`'s phone block drops `.split__l` inside the builder and gives its
 * reason as *"the Programs tab IS that way back, one tap away in the bar"*. That
 * premise is false: `nav.tsx`'s `HIDDEN_FROM_BAR` is `['prog','biz']`, so
 * Programs is not in the bar at all — it is behind *More*. The only real door
 * was the *My programs* tab in `.ph`, which is a page navigation: it leaves the
 * draft, loads the shelf route, and asks the trainer to find their place again.
 *
 * Measured at 390px, the shelf was also unusable on its OWN route: a 321px band
 * capped at `38vh` whose inner scroller was 128px — two of six programs, in a
 * scroller nested inside the page's — above 296px of *Pick a program to open
 * it.* A third of the phone showed nothing on the screen whose only job is
 * choosing.
 *
 * ── WHY THE NAME, AND NOT A STRIP OR A BACK ARROW ────────────────────────────
 *
 * A sticky chip strip switches in one tap and costs 44px on every screen —
 * permanently, on the shell the block at the foot of `app.css` spent three rules
 * clawing height back from — and a chip can only carry the name: the clients
 * count, the day shape and the week count all fall off, which are the three
 * facts the desk shelf exists to show. A back arrow costs nothing and makes
 * every switch a round trip through the list.
 *
 * The name costs **zero permanent pixels**, and it is not a new idiom: `TopBar`
 * already makes the workspace name a switcher with this exact chevron, and
 * `PhoneProgram`'s row and day menus are already bottom sheets over a scrim.
 * This is the third instance of both, not the first of either.
 *
 * ── AND THE SHEET HOLDS THE REAL SHELF ───────────────────────────────────────
 *
 * `children` is a `<Shelf variant="sheet">` — the same component the desk draws
 * in its left column, with the same search, the same goal chips, the same
 * `.lrow` rows carrying clients / days / shape / weeks, and the same *New
 * program* foot. One renderer, two shells, which is the rule `PhoneProgram`
 * states for the week sheet and the reason the two cannot drift.
 *
 * DRAWN AT EVERY WIDTH, HIDDEN BY CSS ABOVE 900px — `Rail.tsx`'s call, for its
 * reason: a component that branched on a measured width would paint the wrong
 * half for a frame after every resize and could not be server-rendered.
 */
export function ProgramSwitcher({
  name,
  count,
  children,
  onOpenChange,
}: {
  /** The open program. It is the button's label, so it is never truncated to
   *  nothing — see `.pgsw__t`, which ellipsizes rather than wrapping. */
  name: string;
  /** On the button's own line at rest, because the one thing a switcher has to
   *  say before it is opened is that there IS something behind it. */
  count: number;
  /** The shelf, in its sheet variant. */
  children: React.ReactNode;
  /** RAISED SO THE PHONE'S LEVELS CAN STAND DOWN — see the Escape note below.
   *  This sheet opens from `.ph`, above `.wsm`, and `PhoneProgram` cannot see
   *  it: `covered` is the prop it stands down on and only `Builder` can set it.
   *  Optional, because the certified shelf and the component library open this
   *  with no levels underneath. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  /* One writer for the flag, so the three ways out cannot disagree with it. */
  const close = () => {
    setOpen(false);
    onOpenChange?.(false);
  };

  /* CAPTURE, AND `stopImmediatePropagation` — `PhoneProgram` owns an Escape
     ladder on the same window (L3, then L2, then nothing) and the builder owns
     a third. Without this, one press closes the sheet AND unwinds a level of
     the day behind it. Same handler shape as `Sheet` in `PhoneProgram`, for the
     same reason.

     AND CAPTURE IS NOT ENOUGH ON ITS OWN, which is what `onOpenChange` is for.
     MEASURED: open a day, tap the program name, press Escape — the DAY closed
     and the sheet stayed. Among capture listeners on the same target the
     EARLIER-REGISTERED one runs first, and `PhoneProgram`'s is registered when
     L2 mounts, which is before this sheet is opened. So its
     `stopImmediatePropagation` swallowed the press first and this handler never
     ran. Registration order is not something either file can negotiate — the
     comment in `PhoneProgram` says exactly that about the exercise picker — so
     the fix is the same one: the levels stand down while a surface is open over
     them, and they are told rather than left to infer it.

     This was reachable from the moment this component shipped and was verified
     only at L1, where `PhoneProgram`'s handler is not registered at all. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      setOpen(false);
      onOpenChange?.(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onOpenChange]);

  /* The sheet is a list of links, and a link navigates. Nothing closes it on
     the way out, so it would still be open over the program it just opened —
     `router` is not needed for this: the shelf's rows are `<Link>`s and a click
     anywhere inside the body is either one of them or a control that stays. */
  return (
    <>
      <button
        className="pgsw"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
          onOpenChange?.(true);
        }}
      >
        <span className="pgsw__t">{name || 'Untitled program'}</span>
        {/* THE COUNT AND THE CHEVRON ARE ONE BOX, and that is the whole reason
            for the wrapper: a bare `6` beside a program's name reads as a fact
            ABOUT that program — six weeks, six days. Inside the control it reads
            as what it is, *six of these, tap to see them*. */}
        <span className="pgsw__d">
          <span className="pgsw__n">{count}</span>
          <ChevronDown size={13} />
        </span>
      </button>

      {open && (
        <>
          <div className="pgsheet__scrim" role="presentation" onClick={close} />
          <div
            className="pgsheet"
            role="dialog"
            aria-modal="true"
            aria-label="Your programs"
            onClick={e => {
              /* A row is a `<Link>`, so the navigation is already under way by
                 the time this fires. Closing here rather than in an effect keyed
                 on the route means the sheet is gone in the same frame the new
                 program's header arrives, instead of one paint later. */
              if ((e.target as HTMLElement).closest('a')) close();
            }}
          >
            {/* THE GRAB HANDLE IS NOT DECORATION — it is the only thing on a
                bottom sheet that says the scrim above it is dismissible, and the
                scrim is the target a thumb actually reaches for. */}
            <div className="pgsheet__grab" aria-hidden="true" />
            {children}
          </div>
        </>
      )}
    </>
  );
}
