'use client';

import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

/**
 * Modal — the interruption. Four of them exist in the product.
 *
 * `role="dialog"` with `aria-modal`, labelled by its own heading and described
 * by its body. All four are load-bearing and all four are the kind of attribute
 * that gets left off: a dialog with no accessible name is announced as
 * "dialog", and the sentence explaining what archiving actually does — the
 * sentence the whole modal exists to deliver — is not read at all unless
 * `aria-describedby` points at it.
 *
 * ── THE CONFIRM LABEL IS NOT "OK" ───────────────────────────────────────────
 *
 * `confirm.label` is required and the heading is a question, so the pair reads
 * "Archive Meera Krishnan?" → "Archive". A dialog answered with "OK" is one a
 * trainer confirms without re-reading, which for an archive is the one time
 * they should.
 *
 * Focus management and the Escape key are the host's: this component is the
 * surface and its semantics, not a dialog manager.
 */
export function Modal({
  title,
  confirm,
  cancel,
  foot,
  width = 472,
  /** Drawn in place, for a specimen. Never in the product. */
  inline,
  className,
  children,
}: {
  /** A question, when the modal asks for a decision. */
  title: ReactNode;
  confirm?: { label: string; onClick?: () => void; danger?: boolean };
  cancel?: { label?: string; onClick?: () => void };
  /**
   * THE FOOT, WHEN TWO BUTTONS ARE NOT THE SHAPE OF THE DECISION.
   *
   * `confirm`/`cancel` are the right props for the thing this component was
   * built for — a question with a yes and a no — and they stay the default
   * because they enforce the order, the variants and the copy that a confirm
   * should have.
   *
   * They are the wrong props for a dialog that is not asking a question. An
   * invoice sheet offers *send*, *copy*, *print* and a way out; a form offers
   * one verb and a cancel whose label is not "Cancel". Both used to mean
   * rendering the buttons in the BODY and getting no foot at all — no rule, no
   * `--tx-surface-2` band, and the actions floating under the content as though
   * they were part of it.
   *
   * So `foot` takes the whole band. It REPLACES the pair rather than adding to
   * it: a dialog with a confirm AND a custom foot has two competing primary
   * actions, which is the defect the pair exists to prevent.
   */
  foot?: ReactNode;
  width?: number;
  inline?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();

  return (
    <div
      className={['modal', className].filter(Boolean).join(' ')}
      role="dialog"
      aria-modal={inline ? undefined : true}
      aria-labelledby={`${id}-t`}
      aria-describedby={`${id}-b`}
      /*
         `position:static` IS NOT ENOUGH ON ITS OWN, and this line said only that
         for as long as `inline` has existed. §24 centres the box with
         `transform:translate(-50%,-50%)`, and a transform does not care what
         `position` is — so an inline modal rendered half its width to the left
         and half its height above wherever it was put. Measured on the library's
         own do/don't figures: 150px left, 92px up, out of the figure entirely.
         The entrance goes with it, because `tx-pop-c` re-declares the same
         translate in its keyframes and a running animation outranks this
         attribute — an inline `transform:none` cannot win while it plays.
      */
      style={
        inline
          ? {
              position: 'static',
              left: 'auto',
              top: 'auto',
              transform: 'none',
              animation: 'none',
              maxWidth: '100%',
              width,
              boxShadow: 'none',
            }
          : { width }
      }
    >
      <div className="modal__hd">
        <h2 className="modal__t" id={`${id}-t`} style={{ margin: 0 }}>
          {title}
        </h2>
      </div>
      <div className="modal__body" id={`${id}-b`}>
        {children}
      </div>
      {foot ? (
        <div className="modal__foot">{foot}</div>
      ) : confirm || cancel ? (
        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={cancel?.onClick}>
            {cancel?.label ?? 'Cancel'}
          </button>
          {confirm ? (
            <button
              type="button"
              className={confirm.danger ? 'btn btn--danger' : 'btn btn--primary'}
              onClick={confirm.onClick}
            >
              {confirm.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * THE ESCAPE LADDER, AND THE RUNG A POPOVER OWNS.
 *
 * `covered` below stands this host down for a modal opened OVER it, and it
 * works because both surfaces are owned by one component that can hold the
 * state. A POPOVER inside the dialog — a menu, an emoji grid, a combobox list
 * — is not like that: it is three components deep, it owns its own open state,
 * and the state has no business travelling up two layers of props.
 *
 * Those popovers all tried to solve it the same way, by binding Escape in the
 * capture phase and calling `stopImmediatePropagation`. **That cannot work**,
 * and it was measured: two capture listeners on `window` fire in the order they
 * were ADDED, this host mounts before anything inside it, so the dialog closed
 * and took the half-written form with it while the menu that "consumed" the key
 * never saw it.
 *
 * So the guard is a count, not an ordering trick. A popover declares itself
 * open with `useEscapeGuard`, this host ignores Escape while any are, and the
 * popover's own listener — whatever phase it is on — closes it. The count is
 * module-level because the question *is anything transient open right now* is
 * global; there is never more than one, and a leaked guard is impossible while
 * the hook's cleanup owns both ends.
 */
const guards = new Set<symbol>();

/** Hold the Escape key away from the surrounding `ModalHost` while `open`. */
export function useEscapeGuard(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const token = Symbol('popover');
    guards.add(token);
    return () => {
      /* RELEASED A TICK LATE. A popup that closes on this very keypress is unmounted (and its guard dropped) between two
         capture listeners if React flushes in between — and a host that re-registers its listener each render (the
         workout builder's `onClose` is inline) runs AFTER the popup's. It then saw no guard, and one Escape closed the
         menu AND opened *Close without saving?*. Deferring the delete lets the same key event still see it. */
      setTimeout(() => guards.delete(token), 0);
    };
  }, [open]);
}

/**
 * ModalHost — the scrim, the Escape key and the focus trap `Modal` says are the
 * host's job.
 *
 * ── WHY THIS IS PART OF THE `c-modal` FAMILY AND NOT A NEW ENTRY ────────────
 *
 * `Modal` above is deliberately "the surface and its semantics, not a dialog
 * manager", and that boundary is right — a specimen renders the surface
 * `inline` with no scrim at all. What was missing is the other half, and its
 * absence had a cost: **every modal in the product hand-writes it.**
 * `SwapModal.tsx`, `AddClientFlow.tsx` and the rest each carry their own
 * `<div className="scrim">`, their own `keydown` listener and their own
 * `role="dialog"` markup, which is the "still a CSS class" condition
 * `registry.ts` tracks — three copies of a behaviour, and the third one to be
 * written is the one that forgets the Escape key.
 *
 * One family, two parts. `Modal` is the box; this is the surface it floats
 * over. A second catalogue entry would say they are two components, and they
 * are not — nothing should ever render one without the other outside a bench.
 *
 * ── THREE THINGS IT DOES THAT A `<div className="scrim">` DOES NOT ──────────
 *
 * · **Escape closes**, bound on the window, in capture. A modal opened over a
 *   screen that also listens for Escape — the workout flow, the builder — must
 *   spend one press on one rung, and the capture phase runs before any bubble
 *   listener whatever order they were added in. `AGENTS.md` records that ladder
 *   being broken twice by two handlers answering the same key.
 * · **Focus goes in and comes back.** The first focusable element inside takes
 *   focus on mount and the previously focused element gets it back on unmount.
 *   Without the return, closing a dialog drops a keyboard user at the top of
 *   the document — `AccountMenu`'s own note calls that "the whole rail again to
 *   get back to where they were".
 * · **Tab is trapped.** A dialog with `aria-modal` claims the rest of the page
 *   is unreachable; without a trap, Tab walks straight out into it and the
 *   claim is a lie.
 *
 * `scrim--top` is §24's overlay layer, which is where glass applies.
 *
 * ── TWO PROPS THE FIRST FORM ON THIS HOST NEEDED ────────────────────────────
 *
 * · **`cover`.** `.scrim` is `position:absolute`, so it fills the nearest
 *   positioned ancestor — which for a modal opened from a screen is `.main`,
 *   and `.main` is the content area alone. A confirm that stops one decision
 *   can live with the rail staying lit; `cover="frame"` is for a dialog that
 *   claims the whole app is inert, and adds `.scrim--frame` (`position:fixed`,
 *   which `.app`'s `container-type` resolves against the frame rather than the
 *   viewport, so it is exactly the app's own box).
 * · **`initialFocus`.** The default — the first focusable thing inside — is
 *   right for a confirm, whose first control is its cancel button. It is wrong
 *   for a FORM with a close ✕ in its head: focus lands on the way out instead
 *   of on the first question. A SELECTOR rather than a ref, because a ref
 *   handed across this boundary is what `react-hooks/refs` refuses, and the
 *   established repair in this codebase is to find the element by selector.
 */
export function ModalHost({
  onClose,
  cover = 'main',
  initialFocus,
  covered = false,
  children,
}: {
  /** Escape, and a click on the scrim. */
  onClose: () => void;
  /**
   * AN INNER SURFACE IS UP AND OWNS THE ESCAPE KEY.
   *
   * The listener below is bound in the CAPTURE phase and stops the event, so
   * it beats everything inside the dialog — which is right for a screen
   * underneath and wrong for a popup within: a trainer pressing Escape to
   * shut a `SearchSelect`'s list would lose the half-filled form around it.
   * The rung ladder is the same one `PhoneProgram`'s `covered` draws, and it
   * is solved the same way — the state is lifted to whoever owns both
   * surfaces, and the outer one stands down while the inner one is up.
   *
   * It does NOT stand the scrim's click down: a press outside the dialog is
   * unambiguous, and the inner popup closes on an outside press of its own.
   */
  covered?: boolean;
  /** How much the scrim covers. `main` is the content area; `frame` is the app. */
  cover?: 'main' | 'frame';
  /** A selector, resolved inside the dialog, for the control focus should land on. */
  initialFocus?: string;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null;
    /* The first focusable thing inside, or the box. `.modal` is not focusable
       on its own, so a dialog whose body is prose would otherwise leave focus
       where it was — outside a surface claiming to be modal. */
    const first = box.current?.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    /* `autoFocus` on the field cannot do this job: React applies it during the
       commit phase, which runs BEFORE this passive effect, so the close button
       would take focus back off it. Measured. */
    const asked = initialFocus ? box.current?.querySelector<HTMLElement>(initialFocus) : null;
    (asked ?? first ?? box.current)?.focus();
    const previous = returnTo.current;
    return () => previous?.focus?.();
    /* Mount only. Re-running would refocus the trigger mid-dialog through the
       cleanup, and `initialFocus` does not change while a dialog is open. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        /* Stopped, so one press spends one rung. The screen underneath may
           have its own ladder — the workout flow does — and a dialog that let
           Escape through would close itself AND whatever was behind it. */
        if (covered || guards.size > 0) return;
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      /* VISIBLE ONLY, and this is a correction rather than a tidy-up.
         `querySelectorAll` matches a control inside a `display:none` subtree
         exactly as happily as one on the screen, and `HTMLElement.focus()` on
         it does nothing at all. So the moment any dialog in this app collapsed
         a panel by hiding it rather than by unmounting it — which is what the
         workout card's sets panel now does, so that it can animate — `lastEl`
         became an element that cannot be focused, the wrap silently failed, and
         Tab walked out of a dialog that declares `aria-modal`.

         `checkVisibility` is the check that actually answers the question,
         including `content-visibility` and `visibility:hidden`, neither of
         which an `offsetParent` test catches. */
      const focusable = [
        ...(box.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ].filter(el =>
        el.checkVisibility?.({ checkOpacity: false, checkVisibilityCSS: true }) ?? el.offsetParent !== null,
      );
      if (focusable.length === 0) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === firstEl || !box.current?.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, covered]);

  return (
    <>
      <div
        className={cover === 'frame' ? 'scrim scrim--top scrim--frame' : 'scrim scrim--top'}
        onClick={onClose}
        aria-hidden="true"
      />
      {/*
        ── THE BOX IS NAMED, AND `cover="frame"` IS WHY ─────────────────────────

        MEASURED 19 Sep 2026, reported as *"whole screen is dim"*: a dialog
        opened with `cover="frame"` was being PAINTED OVER BY ITS OWN SCRIM.

        `.scrim--top` is z-40 and `.modal` is z-41, so the default pairing is
        correct and always has been. `.scrim--frame` is not `.scrim--top`: it is
        an app-level class at **z-60**, written for the new-program dialog and
        the workout builder, both of which set THEMSELVES to z-61. Nothing said
        so, so any plain `.modal` passed `cover="frame"` went under a 66% black
        sheet — `elementFromPoint` at the viewport centre returned the scrim,
        and the dialog, its lime primary button and the whole page behind it all
        came back washed out together.

        The scrim keeps z-60: things unrelated to this ladder sit at 50 and 60 in
        `app.css`, and lowering it would let them through. Instead the box says
        which kind of host it is, and `app.css` lifts the dialog inside a frame
        host to 61 — the same rung its two existing neighbours already occupy.

        It stays a real element rather than `display:contents`, which generates
        no box and cannot take focus (and this one is `tabIndex={-1}` and is
        focused as the fallback when a dialog holds nothing focusable).
      */}
      <div
        ref={box}
        tabIndex={-1}
        className={cover === 'frame' ? 'mhost mhost--frame' : 'mhost'}
        style={{ outline: 'none' }}
      >
        {children}
      </div>
    </>
  );
}
