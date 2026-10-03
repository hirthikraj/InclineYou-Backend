'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { editPayment, markPaid, removePayment, writeOffPayment } from '@/lib/money/actions';
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
 * the quiet `···`. A refund gets NOTHING — the database refuses to change or
 * remove one. That is deliberately not one control drawn twice. The rows that
 * need a decision are the minority and they are scattered down a table sorted by
 * date, so the eye should be able to find them without reading the *Status*
 * column — the label IS the scan. Recognition rather than recall.
 *
 * (3 Oct 2026) A settled row used to get a `···` only when it had a reference to
 * copy, on the argument that *Open the file* is already the name cell. That left
 * a mistyped payment with no way to be corrected from the ledger, though the
 * contract has *Edit* and *Delete* for exactly that. Both are on every
 * non-refund row now, so the menu is never a single door.
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
] as const;

/* Roughly what each view stands up to, used only to decide whether the menu
   drops below the trigger or flips above it. An estimate is enough — being a
   few pixels out moves the menu, it cannot clip it, because the `top` it
   produces is clamped to the viewport either way. */
const H_ACTIONS = 300;
const H_CONFIRM = 190;
const H_EDIT = 430;
/** The edit form needs room for a date and a note; the other views are a plain menu. */
const W_MENU = 208;
const W_EDIT = 300;

/** The methods a trainer-collected row can carry; the wire's own words. */
const EDIT_METHODS = [
  { key: 'cash', label: 'Cash' },
  { key: 'upi', label: 'UPI' },
  { key: 'bank_transfer', label: 'Bank transfer' },
] as const;

/** `yyyy-MM-dd` in the browser's zone — what a date input holds. */
function dateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
  /** Who took the money. A gym-desk payment has no method to choose: the gym took it. */
  collectedBy?: 'trainer' | 'gym';
  /** The UPI or bank reference, when the payment has one. */
  reference?: string | null;
  /** What *Edit* starts from. `version` goes back as `If-Match`, so a stale screen cannot overwrite a newer figure. */
  method?: 'upi' | 'cash' | 'bank_transfer' | null;
  note?: string | null;
  paidAt?: number | null;
  version?: string;
  /** Said once, at the top of the tab — see `LedgerTab` and `OwedTab`. */
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}

export function PaymentRowMenu({
  paymentId, clientId, clientName, amount, status, collectedBy = 'trainer', reference: upiReference = null,
  method = null, note = null, paidAt = null, version = '',
  onNotice, onError,
}: PaymentRowMenuProps) {
  const isPending = status === 'pending';

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'actions' | 'writeoff' | 'delete' | 'edit'>('actions');
  const [at, setAt] = useState<{ top: number; left: number; right: number } | null>(null);

  /* The edit form's own state, seeded when the view opens so a second opening
     starts from the row as it is NOW and not from a half-typed earlier attempt. */
  const [fAmount, setFAmount] = useState('');
  const [fMethod, setFMethod] = useState<string>('cash');
  const [fRef, setFRef] = useState('');
  const [fDate, setFDate] = useState('');
  const [fNote, setFNote] = useState('');
  /* Today, read when the form opens — a component body may not call `Date.now()` (trap 20). */
  const [fMax, setFMax] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const editsMethod = collectedBy !== 'gym' && (status === 'paid' || status === 'pending');
  const editsDate = status === 'paid' && paidAt !== null;
  const editsRef = editsMethod && fMethod !== 'cash';
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
    const W = W_MENU;
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

    setAt({ top: Math.round(top), left: Math.round(left), right: Math.round(box.right) });
    setView('actions');
    setOpen(true);
  }, []);

  /* The edit form is wider than the menu it replaces, so it re-anchors to the
     trigger's right edge — the menu grows leftwards, under the same pointer. */
  const startEdit = () => {
    setFAmount(String(amount));
    setFMethod(method ?? 'cash');
    setFRef(upiReference ?? '');
    setFDate(paidAt !== null ? dateInput(paidAt) : '');
    setFNote(note ?? '');
    setFMax(dateInput(Date.now()));
    setFormError(null);
    setAt((a) => {
      if (!a) return a;
      const vw = document.documentElement.clientWidth;
      return { ...a, left: Math.max(12, Math.min(a.right - W_EDIT, vw - 12 - W_EDIT)) };
    });
    setView('edit');
  };

  /* Escape, arrows and a press anywhere else. Both boxes are checked because the
     panel is no longer inside the trigger's — a `contains` against the wrapper
     alone would read every click on a menu row as a click outside. */
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
      // In the form the arrows, Home and End belong to the field being typed in.
      if (view === 'edit' || !keys.includes(e.key) || !panel.current) return;
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
    (view === 'edit'
      ? panel.current?.querySelector<HTMLElement>('input, select')
      : panel.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])'))?.focus();
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

  /* Only what changed is sent. An unchanged form is not an error, it is nothing to
     say — the panel just closes. */
  function submitEdit() {
    const changes: Parameters<typeof editPayment>[2] = {};
    const amt = Number(fAmount);
    if (!Number.isFinite(amt) || amt <= 0) { setFormError('Enter an amount above zero.'); return; }
    if (amt !== amount) changes.amount = amt;
    if (editsMethod) {
      if (fMethod !== (method ?? 'cash')) changes.method = fMethod;
      const nextRef = fMethod === 'cash' ? '' : fRef.trim();
      if (nextRef !== (upiReference ?? '')) changes.reference = nextRef === '' ? null : nextRef;
    }
    if (editsDate && fDate && fDate !== dateInput(paidAt as number)) {
      // The chosen day at the original time of day, never later than now.
      const old = new Date(paidAt as number);
      const [y, m, d] = fDate.split('-').map(Number);
      const moved = new Date(y, m - 1, d, old.getHours(), old.getMinutes(), old.getSeconds()).getTime();
      changes.paidAt = Math.min(moved, Date.now());
    }
    if (fNote.trim() !== (note ?? '')) changes.note = fNote.trim() === '' ? null : fNote.trim();
    if (Object.keys(changes).length === 0) { close(); return; }
    run(() => editPayment(paymentId, version, changes), `${first}'s payment corrected.`);
  }

  function go(href: string) {
    close(false);
    router.push(href);
  }

  /* The confirm view is shorter than the actions view it replaces, so the panel
     keeps the `top` it opened with and simply gets smaller — no jump under the
     pointer, and the buttons land where the eye already is. */
  const tall = view === 'edit' ? H_EDIT : view === 'actions' ? H_ACTIONS : H_CONFIRM;
  const style = at
    ? { top: Math.max(12, Math.min(at.top, document.documentElement.clientHeight - tall - 12)), left: at.left,
        ...(view === 'edit' ? { width: W_EDIT } : null) }
    : undefined;

  /* A refund cannot be changed or removed (the database refuses both), so its row
     has no menu at all. Every other row can be corrected: a settled row used to
     get a menu only when it had a reference to copy, which left a mistyped
     payment with no way to fix it from the ledger. */
  if (status === 'refund') return null;

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
                  {collectedBy === 'gym' ? (
                    /* The gym counter took it, so there is no method to pick and the
                       server stamps none: one button, and no *Gym front office* chip
                       offered to a client who pays the trainer directly. */
                    <button
                      className="menu__i"
                      type="button"
                      role="menuitem"
                      onClick={() => run(
                        () => markPaid(paymentId, { method: null }),
                        `${rupees(amount)} from ${first} marked paid — the gym had it.`,
                      )}
                    >
                      Mark paid — the gym had it
                    </button>
                  ) : (
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
                    </>
                  )}
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
              <button className="menu__i" type="button" role="menuitem" onClick={startEdit}>
                Edit…
              </button>
              <button className="menu__i menu__i--danger" type="button" role="menuitem" onClick={() => setView('delete')}>
                Delete…
              </button>
              <div className="menu__sep" />
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
          ) : view === 'edit' ? (
            <form
              style={{ padding: '4px 6px 2px' }}
              onSubmit={(e) => { e.preventDefault(); submitEdit(); }}
              aria-label={`Edit ${first}'s ${rupees(amount)}`}
            >
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx-ink)', marginBottom: 8 }}>
                Correct this payment
              </p>
              <div className="fld">
                <label className="fld__l" htmlFor={`pe-amt-${paymentId}`}>Amount</label>
                <div className="affix">
                  <span className="affix__p">₹</span>
                  <input className="ctl ctl--num" id={`pe-amt-${paymentId}`} type="number" min="1" step="1"
                    value={fAmount} onChange={(e) => setFAmount(e.target.value)} />
                </div>
              </div>
              {editsMethod && (
                <div className="fld mt2">
                  <label className="fld__l" htmlFor={`pe-m-${paymentId}`}>How</label>
                  <select className="ctl" id={`pe-m-${paymentId}`} value={fMethod} onChange={(e) => setFMethod(e.target.value)}>
                    {EDIT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                </div>
              )}
              {editsRef && (
                <div className="fld mt2">
                  <label className="fld__l" htmlFor={`pe-r-${paymentId}`}>Reference <span className="small">optional</span></label>
                  <input className="ctl" id={`pe-r-${paymentId}`} value={fRef} maxLength={64} onChange={(e) => setFRef(e.target.value)} />
                </div>
              )}
              {editsDate && (
                <div className="fld mt2">
                  <label className="fld__l" htmlFor={`pe-d-${paymentId}`}>Received on</label>
                  {/* No future dates: the server refuses them, and a field that
                      would let you type one only to be told no is the worse design. */}
                  <input className="ctl" id={`pe-d-${paymentId}`} type="date" value={fDate} max={fMax}
                    onChange={(e) => setFDate(e.target.value)} />
                </div>
              )}
              <div className="fld mt2">
                <label className="fld__l" htmlFor={`pe-n-${paymentId}`}>Note <span className="small">optional</span></label>
                <input className="ctl" id={`pe-n-${paymentId}`} value={fNote} maxLength={500} onChange={(e) => setFNote(e.target.value)} />
              </div>
              {collectedBy === 'gym' && (
                <p className="small" style={{ color: 'var(--tx-ink-3)', marginTop: 8, lineHeight: 1.4 }}>
                  The gym&#8217;s desk took this one, so there is no method to change.
                </p>
              )}
              {formError && <p className="msg msg--err" role="alert" style={{ marginTop: 8 }}><span>{formError}</span></p>}
              <span className="row" style={{ gap: 6, marginTop: 10 }}>
                <Button variant="primary" size="sm" type="submit">Save</Button>
                <Button variant="ghost" size="sm" type="button" onClick={() => setView('actions')}>Back</Button>
              </span>
            </form>
          ) : view === 'delete' ? (
            /* A correction, not a refund — said in those words, because the two
               look alike on a row and mean opposite things to the books. */
            <div style={{ padding: '4px 5px 2px' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx-ink)', marginBottom: 5 }}>
                Delete this {rupees(amount)} entry?
              </p>
              <p className="small" style={{ color: 'var(--tx-ink-3)', lineHeight: 1.4, marginBottom: 10 }}>
                {status === 'paid'
                  ? `Use this for a payment recorded by mistake. It leaves the list and what ${first} has paid, so ${rupees(amount)} is owed again. The balance moves back.`
                  : status === 'write_off'
                    ? `The write-off is undone: ${rupees(amount)} is owed by ${first} again. The balance moves back.`
                    : `It is no longer expected. What ${first} owes does not change.`}
              </p>
              <span className="row" style={{ gap: 6 }}>
                <Button
                  variant="ghost"
                  size="sm"
                  role="menuitem"
                  style={{ color: 'var(--tx-danger)' }}
                  onClick={() => run(() => removePayment(paymentId), `${rupees(amount)} entry for ${first} deleted.`)}
                >
                  Delete it
                </Button>
                <Button variant="ghost" size="sm" role="menuitem" onClick={() => setView('actions')}>
                  Keep
                </Button>
              </span>
            </div>
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
