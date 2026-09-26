'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { markPaid, writeOffPayment } from '@/lib/money/actions';
import { rupees } from '@/lib/today/time';
import { Button } from '@/web-components/ui/Button';

/**
 * WHAT YOU CAN DO TO A PAYMENT — the last column of Payments and of the pending
 * list, which until now could do nothing at all.
 *
 * The cell this replaces held a bare `<svg>` of three dots. Not a button, no
 * handler, absent from the accessibility tree: an overflow affordance on every
 * row of the book that a trainer could click all afternoon. webapp.css already
 * describes the control it was pretending to be — "the rule became ONE overflow
 * button per row … 196px wide so it sits inside a 236px column" — so the design
 * set had specified this menu and Payments had drawn its shadow.
 *
 * Behind the dots were the two calls the whole screen was missing. A row
 * recorded `pending` could never become `paid`: `PATCH /v1/payments/:id/confirm`
 * has always existed and no screen in the product called it, so *Pending* was a
 * list a trainer could message forever and never clear. And nothing anywhere
 * could write a row off, which left the *Write-offs* tab reading data that no
 * screen could produce.
 *
 * ── THE TRIGGER SAYS WHICH ROWS WANT SOMETHING ───────────────────────────────
 *
 * A pending row's trigger is a labelled **Mark paid** button; a settled row's is
 * the quiet `···`, and a settled row with nothing worth a menu gets NOTHING.
 * That is deliberately not one control drawn twice. The rows that need a
 * decision are the minority and they are scattered down a table sorted by date,
 * so the eye should be able to find them without reading the *Status* column —
 * the label IS the scan. Recognition rather than recall.
 *
 * The empty case is the shell's own rule, stated for the workspace switcher and
 * applied here: *a dropdown whose list has one row takes a click, opens a panel
 * and offers nothing.* A settled cash payment's only action is *Open the file* —
 * which the NAME CELL in the same row already does, since this pass made it a
 * link — so a `···` there would be a second door to one room, drawn as the
 * overflow glyph this component exists to stop being a lie. It appears when the
 * row carries a reference to copy, and not before.
 *
 * ── THE METHOD IS ON THE MENU, NOT BEHIND A SECOND STEP ──────────────────────
 *
 * *Mark paid* opens straight onto **PAID BY · Cash / UPI / Bank transfer / Gym
 * front office**, so settling a debt is two clicks and the second one is the
 * answer to "how did they pay me". A bare confirm would have been one click and
 * would have written `method = null` — which is precisely what draws the em-dash
 * in the payments table's *How* column. The trainer marking the row has just been handed
 * cash or watched a UPI notification; asking is free.
 *
 * ── AND THE WRITE-OFF IS CONFIRMED INSIDE THE MENU ───────────────────────────
 *
 * `Packages.tsx` confirms a retire INLINE IN THE ROW — an explanatory sentence
 * and two ghost buttons where the actions were — and that is the right pattern
 * for a four-column price list whose last column is free to grow. It is the
 * wrong one here: the payments table's action column is the sixth of six inside a
 * `.tblwrap`, and swelling it to fit "Nothing is deleted — it stays in the
 * list, struck through" would widen the column for every OTHER row too and
 * shove the table into its own horizontal scroll. So the confirmation happens
 * where there is already room for it: the menu swaps to it in place. Same two
 * ghost buttons, same promise in the same words, no reflow.
 */

const METHODS = [
  { key: 'cash', label: 'Cash' },
  { key: 'upi', label: 'UPI' },
  { key: 'bank', label: 'Bank transfer' },
  { key: 'gym', label: 'Gym front office' },
] as const;

/* Roughly what each view stands up to, used only to decide whether the menu
   drops below the trigger or flips above it. An estimate is enough — being a
   few pixels out moves the menu, it cannot clip it, because the `top` it
   produces is clamped to the viewport either way. */
const H_ACTIONS = 250;
const H_CONFIRM = 168;

const DOTS = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" />
  </svg>
);

const CARET = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9.5 12 15.5l6-6" />
  </svg>
);

export interface PaymentRowMenuProps {
  paymentId: string;
  clientId: string;
  clientName: string;
  amount: number;
  /** The row's own status. Only a pending row can be settled or let go. */
  status: string;
  upiReference?: string | null;
  /** Said once, at the top of the tab — see `LedgerTab` and `OwedTab`. */
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}

export function PaymentRowMenu({
  paymentId, clientId, clientName, amount, status, upiReference = null,
  onNotice, onError,
}: PaymentRowMenuProps) {
  const isPending = status === 'pending';

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'actions' | 'writeoff'>('actions');
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const [busy, startWrite] = useTransition();

  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const first = clientName.split(' ')[0];

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    setView('actions');
    if (restoreFocus) trigger.current?.focus();
  }, []);

  /*
   * `position:fixed`, measured from the trigger in the handler that opens —
   * `WorkspaceMenu.tsx`'s model, for a reason that is sharper here.
   *
   * `.tblwrap` is `overflow-x:auto`, and a box that is not `visible` on one axis
   * computes to `auto` on the other. An absolutely-positioned menu inside it is
   * therefore clipped on BOTH — off the right edge of a wide table, and off the
   * bottom on the last row, which is the row a trainer is most likely to be
   * settling. Fixed escapes the scrollport entirely.
   *
   * Measured on open rather than in an effect after it, so the panel is never
   * painted at the top-left of the viewport for a frame first.
   */
  const openAt = useCallback(() => {
    const box = trigger.current?.getBoundingClientRect();
    if (!box) return;
    const GUTTER = 12;
    const W = 208;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    // Right-aligned to the trigger — the column is the last one — then clamped
    // so a narrow window cannot push it off either edge.
    const left = Math.max(GUTTER, Math.min(box.right - W, vw - GUTTER - W));

    /* Below, above, or pinned to the bottom edge — in that order of preference.
       Flipping ABOVE is right for the last row of a long payments list and wrong
       everywhere else: it lands the menu over the sticky page header and the
       stat tiles, which is a lot of screen to cover to save a few pixels. So it
       is taken only when there is genuinely more room up there, and when there
       is room in neither direction the menu pins to the bottom gutter and
       overlaps its own row — attached to the right place, and every item
       reachable, which a clipped menu is not. */
    const below = box.bottom + 4;
    const roomBelow = vh - GUTTER - below;
    const roomAbove = box.top - 4 - GUTTER;
    const top = roomBelow >= H_ACTIONS ? below
      : roomAbove > roomBelow && roomAbove >= H_ACTIONS ? box.top - H_ACTIONS - 4
      : Math.max(GUTTER, vh - GUTTER - H_ACTIONS);

    setAt({ top: Math.round(top), left: Math.round(left) });
    setView('actions');
    setOpen(true);
  }, []);

  /* Escape, arrows and a press anywhere else. Both boxes are checked because the
     panel is no longer inside the trigger's — a `contains` against the wrapper
     alone would read every click on a menu row as a click outside. */
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
      if (!keys.includes(e.key) || !panel.current) return;
      e.preventDefault();
      const items = [...panel.current.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')];
      if (items.length === 0) return;
      const cur = items.indexOf(document.activeElement as HTMLElement);
      const to =
        e.key === 'Home' ? 0
        : e.key === 'End' ? items.length - 1
        : e.key === 'ArrowDown' ? (cur + 1) % items.length
        : (cur - 1 + items.length) % items.length;
      items[to]?.focus();
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panel.current?.contains(target) || trigger.current?.contains(target)) return;
      close(false);
    };
    /* A fixed panel does not travel with the row it points at, so a scroll would
       leave it hanging over the wrong one. Shut rather than re-measure: the menu
       is a decision about ONE row and a menu that follows a moving row is a menu
       whose subject the trainer has to keep track of. */
    const onScrollOrResize = () => close(false);

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    panel.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, view, close]);

  function run(work: () => Promise<{ ok: boolean; message?: string }>, done: string) {
    close(false);
    startWrite(async () => {
      const result = await work();
      if (result.ok) onNotice(done);
      else onError(result.message ?? 'That did not go through. Nothing changed.');
    });
  }

  function go(href: string) {
    close(false);
    router.push(href);
  }

  /* The confirm view is shorter than the actions view it replaces, so the panel
     keeps the `top` it opened with and simply gets smaller — no jump under the
     pointer, and the buttons land where the eye already is. */
  const style = at
    ? { top: view === 'writeoff' ? Math.min(at.top, document.documentElement.clientHeight - H_CONFIRM - 12) : at.top, left: at.left }
    : undefined;

  /* A settled row's menu is *Open the file* plus a reference when there is one.
     One item is not a menu — see the docstring — and the name cell covers it. */
  const hasReference = Boolean(upiReference);
  if (!isPending && !hasReference) return null;

  return (
    <>
      {isPending ? (
        <Button
          variant="secondary"
          size="sm"
          ref={trigger}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={busy}
          onClick={() => (open ? close() : openAt())}
          style={{ gap: 5 }}
        >
          {busy ? 'Saving…' : 'Mark paid'}
          {!busy && CARET}
        </Button>
      ) : (
        <button
          className="btn btn--sm btn--ghost btn--icon"
          ref={trigger}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Actions for ${clientName}'s ${rupees(amount)}`}
          onClick={() => (open ? close() : openAt())}
        >
          {DOTS}
        </button>
      )}

      {open && at && (
        <div
          className="menu menu--row"
          ref={panel}
          role="menu"
          aria-label={`Actions for ${clientName}'s ${rupees(amount)}`}
          style={style}
        >
          {view === 'actions' ? (
            <>
              {isPending && (
                <>
                  <p className="menu__gk">Paid by</p>
                  {METHODS.map((m) => (
                    <button
                      key={m.key}
                      className="menu__i"
                      type="button"
                      role="menuitem"
                      onClick={() => run(
                        () => markPaid(paymentId, { method: m.key }),
                        `${rupees(amount)} from ${first} marked paid — ${m.label.toLowerCase()}.`,
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                  <div className="menu__sep" />
                  <button
                    className="menu__i menu__i--danger"
                    type="button"
                    role="menuitem"
                    onClick={() => setView('writeoff')}
                  >
                    Write it off…
                  </button>
                </>
              )}
              <button
                className="menu__i"
                type="button"
                role="menuitem"
                onClick={() => go(`/clients/${clientId}`)}
              >
                Open {first}&apos;s file
              </button>
              {upiReference && (
                <button
                  className="menu__i"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    navigator.clipboard?.writeText(upiReference).then(
                      () => onNotice(`Reference ${upiReference} copied.`),
                      () => onError('Could not copy the reference.'),
                    );
                    close(false);
                  }}
                >
                  Copy the reference
                </button>
              )}
            </>
          ) : (
            /* Not a `window.confirm`, and not a modal. The question is small, it
               is about the row the pointer is already on, and it names the two
               outcomes in the trainer's own words rather than OK and Cancel —
               `Packages.tsx`'s *Retire it / Keep selling it*, one screen over. */
            <div style={{ padding: '4px 5px 2px' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx-ink)', marginBottom: 5 }}>
                Write off {rupees(amount)}?
              </p>
              <p className="small" style={{ color: 'var(--tx-ink-3)', lineHeight: 1.4, marginBottom: 10 }}>
                Nothing is deleted. The row stays in the list, struck through,
                and leaves what {first} owes you.
              </p>
              <span className="row" style={{ gap: 6 }}>
                <Button
                  variant="ghost"
                  size="sm"
                  role="menuitem"
                  style={{ color: 'var(--tx-danger)' }}
                  onClick={() => run(
                    () => writeOffPayment(paymentId),
                    `${rupees(amount)} from ${first} written off.`,
                  )}
                >
                  Write it off
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  role="menuitem"
                  onClick={() => setView('actions')}
                >
                  Keep chasing
                </Button>
              </span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
