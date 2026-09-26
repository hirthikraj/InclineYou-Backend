'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from './Button';
import { useEscapeGuard } from './Modal';
import { SearchField } from './SearchField';

/**
 * Row menu — the overflow verbs at the end of a list row. `.menu.menu--row`.
 *
 * ── WHY IT IS A COMPONENT AND NOT A THIRD COPY ──────────────────────────────
 *
 * The popup ladder below — measure the trigger, flip when the room is above,
 * close on Escape, close on an outside press, close on scroll, roving arrow
 * keys, restore focus to the trigger — had been written twice before this file:
 * `money/PaymentRowMenu.tsx` and `programs/WorkoutRowMenu.tsx`. Both were ~130
 * lines and they already disagreed in one place that matters — one closed on
 * `resize` and the other did not — which is the shape of the defect a third
 * copy adds. `.menu--row` was always in the design system; only its behaviour
 * lived at the call-sites.
 *
 * `WorkoutRowMenu` is GONE, replaced by this file at its one call-site.
 * `PaymentRowMenu` is not, and deliberately: its items are writes with a
 * confirm step and a `.menu__note` inside the panel, which is a second shape
 * this component does not have yet. It is the next one to come down.
 *
 * ── WHAT THE CALLER STILL OWNS ──────────────────────────────────────────────
 *
 * The verbs, and whether each one navigates or writes. An item with `href` is a
 * destination and the router takes it; an item with `onSelect` is a write and
 * the menu closes BEFORE the callback runs, so a handler that opens a dialog
 * does not fight a panel that is still unmounting. `danger` is the last item's
 * red, never a colour the caller picks.
 *
 * ── AND IT GREW A TRIGGER SLOT AND CHECKABLE ITEMS, RATHER THAN A SIBLING ───
 *
 * `c-facet` needed the whole ladder below against a pill instead of a dots
 * button, and a list whose rows are STATES rather than verbs. Both are
 * extensions here rather than a second component, which is this design system's
 * standing call — the header above is itself a record of what two copies of
 * this ladder cost. What they add is small and neither touches the default:
 *
 *   · `triggerContent` replaces what is INSIDE the trigger, and `triggerClass`
 *     restyles it. The button itself stays this component's — see below.
 *   · an item with `checked` is a `menuitemcheckbox` and the menu DOES NOT
 *     CLOSE on it — a multi-select that shut after one tick would make picking
 *     two statuses two trips through the same menu.
 *   · `menuLabel` replaces *Actions for X*, which is the right sentence over a
 *     list of verbs and the wrong one over a list of states.
 *
 * ── AND IT IS A SLOT, NOT A RENDER PROP, BECAUSE OF THE REF ─────────────────
 *
 * The obvious API is `trigger={(props) => <button {...props} />}` and it does
 * not compile: `react-hooks/refs` refuses a ref handed to a function, on the
 * grounds that the function may read `.current` during render — trap 22, which
 * this codebase has already paid for once. So the button stays here, with its
 * own ref, and the caller supplies its CONTENTS and its class. The placement
 * ladder keeps working because it is measuring an element this file owns.
 *
 * ── WHY `position:fixed` AND A MEASURED TOP ─────────────────────────────────
 *
 * `PaymentRowMenu`'s finding, kept: the scrollers these rows live in
 * (`.pgt__body`, `.tbl__scroll`) are `overflow:auto` on one axis, and a box
 * that is not `visible` on one axis clips on both — so an absolutely positioned
 * panel loses its lower half on the last row of the list, which is exactly the
 * row a trainer is most often acting on. Fixed escapes the scrollport, and the
 * price is that the panel does not travel with its row: a scroll would leave it
 * pointing at a different program, so it shuts instead of re-measuring.
 *
 * ── AND FIXED IS NOT ENOUGH, WHICH COST A WHOLE MENU ────────────────────────
 *
 * **A transformed ancestor is a containing block for a `position:fixed` child**
 * — trap 11, which this codebase records for `backdrop-filter` and which a
 * `transform` does identically. `.modal` is centred with
 * `transform:translate(-50%,-50%)` and is `overflow:hidden`, so every row menu
 * inside a dialog was positioned against the DIALOG rather than the viewport
 * and then clipped by it.
 *
 * MEASURED in the assessment editor at 1536: the panel asked for
 * `top:357 left:768` off its trigger's rect and painted at **397 / 883**,
 * scaled by the dialog's own entrance transform, with `elementFromPoint` at the
 * panel's own centre returning something else. Four menu items, rendered,
 * focusable, announced — and invisible. It reads exactly like a button that
 * does nothing, which is how it was reported.
 *
 * So the panel PORTALS to `document.body`, which is the repair `WorkspaceMenu`
 * already makes for the same trap one file over. Two consequences worth
 * stating: the panel is no longer a descendant of the dialog, so a
 * `ModalHost`'s Tab trap cannot see it — which is why this component focuses
 * its own first item and runs its own roving keys — and it needs a z-index
 * above the dialog layer rather than `.menu--row`'s in-`.main` 34.
 *
 * ── AND A LIST LONG ENOUGH TO SCROLL GREW A FIND FIELD ──────────────────────
 *
 * `search` puts a `SearchField` at the head of the panel and filters the rows
 * under it as they are typed. It exists for the client axis on
 * `/clients/assessments`: a roster is a hundred and forty names, and a menu that
 * can only be scrolled asks a trainer to read a list to find a person they
 * already know the name of. Three things follow from it, and each one is a
 * behaviour rather than a style:
 *
 *   · **The panel stops being a menu.** A `menu` may own menu items and nothing
 *     else, and this one now holds a textbox — so the PANEL takes `dialog` and
 *     the rows keep `menu` inside `.menu__list`. The trigger's `aria-haspopup`
 *     follows it.
 *   · **Focus opens in the field, not on the first row.** Typing is the reason
 *     the field is there. Down and Up leave it for the rows, Home and End stay
 *     with the caret, and Enter takes the first row left standing — three
 *     letters and a key, never three letters and a mouse.
 *   · **The scroll that closes the menu must not be this one.** `.menu__list`
 *     is capped and scrolls, and the close-on-scroll listener below is a CAPTURE
 *     listener on `window`, so without a guard the first flick inside the list
 *     shut the panel it was scrolling. The guard is one `contains` check.
 *
 * `closeOnPick` is the other half of the same screen. A checkable row leaves the
 * menu open, which is right for two statuses and wrong for one client: the
 * answer is complete at the first press, and a panel left standing over a
 * filtered list with a stale term in the box is a panel a trainer dismisses by
 * hand. `Facet` passes its own `single` straight into it, which is what that
 * prop has claimed to do since it was written.
 *
 * ── AND IT HOLDS THE ESCAPE KEY WHILE IT IS OPEN ────────────────────────────
 *
 * `useEscapeGuard(open)` — trap 49 verbatim. Two capture listeners on `window`
 * fire in the order they were ADDED and a `ModalHost` mounts before anything
 * inside it, so without the guard one Escape meant to shut this menu closed the
 * whole dialog and took the half-written form with it. The guard is a COUNT
 * rather than an ordering trick; `ui/Modal.tsx` carries the whole argument.
 */
export type RowMenuItem =
  | {
      key?: string;
      label: string;
      href: string;
      danger?: boolean;
      disabled?: boolean;
      /** Extra text `search` matches, beyond the label — a phone, an email. */
      find?: string;
    }
  | {
      key?: string;
      label: string;
      onSelect: () => void;
      danger?: boolean;
      disabled?: boolean;
      /** Extra text `search` matches, beyond the label — a phone, an email. */
      find?: string;
      /**
       * Present makes the row a STATE rather than a verb: it announces as a
       * `menuitemcheckbox`, draws a tick, and leaves the menu open when it is
       * pressed. Absent is the ordinary verb.
       */
      checked?: boolean;
    }
  | { separator: true; key?: string };

function isSeparator(item: RowMenuItem): item is { separator: true; key?: string } {
  return 'separator' in item;
}

function isChecked(item: RowMenuItem): boolean {
  return !isSeparator(item) && 'checked' in item && item.checked !== undefined;
}



/**
 * The rows the arrow keys move between. Both roles, because a menu may hold
 * verbs and states at once — the facet's *Clear* under four tickable statuses
 * is exactly that, and a selector naming one role skips the other in silence.
 */
const ROVE = '[role="menuitem"]:not([disabled]),[role="menuitemcheckbox"]:not([disabled])';

/** `.menu__list`'s cap in §22, and the arithmetic below has to agree with it —
 *  a panel measured at the height of a hundred and forty rows flips upward to
 *  make room it is never going to use. */
const LIST_MAX = 256;
/** The find field, its 10px of inset a side and the rule under it. §22's
 *  `.menu__find` — 34 + 20 + 1. */
const FIND_H = 55;

/** One `.menu__i` is 32px; a rule is 1px between two 4px margins. The panel
 *  pads 5px a side over a 1px border. Measured off §33, and the arithmetic is
 *  here rather than a constant because the flip decision is wrong by exactly
 *  the number of items the caller passed that the constant did not know about. */
function panelHeight(items: RowMenuItem[], hasSearch: boolean): number {
  const body = items.reduce((h, item) => h + (isSeparator(item) ? 9 : 32), 0);
  return (hasSearch ? Math.min(body, LIST_MAX) + FIND_H : body) + 12;
}

export function RowMenu({
  label,
  items,
  width = 208,
  icon,
  className,
  menuLabel,
  triggerContent,
  triggerClass,
  search,
  closeOnPick = false,
  align = 'end',
}: {
  /**
   * WHICH ROW, spelled into the trigger's accessible name. Twenty-two buttons
   * called *Actions* are twenty-two identical controls in a screen reader's
   * list — `CheckboxCell`'s rule, and the same one.
   */
  label: string;
  items: RowMenuItem[];
  /** The panel's minimum, for a menu whose longest verb outgrows 208. */
  width?: number;
  /** The trigger's glyph. Defaults to the three dots every row already wears. */
  icon?: ReactNode;
  className?: string;
  /** Over a list of states, where *Actions for X* is the wrong sentence. */
  menuLabel?: string;
  /**
   * What goes INSIDE the trigger, in place of the dots glyph. The button is
   * still this component's — see the header for why it cannot be the
   * caller's — and visible text in here becomes its accessible name, so
   * nothing adds an `aria-label` on top of it.
   */
  triggerContent?: ReactNode;
  /** The trigger's class when it carries content. `className` otherwise. */
  triggerClass?: string;
  /**
   * A find field at the head of the panel, filtering the rows under it. For a
   * list nobody can scan — a roster, an exercise library — never for four
   * verbs. `noun` is what the live count says it counted; leave it out and the
   * count is not announced. See the header for what else it changes.
   */
  search?: { placeholder: string; empty: string; noun?: string };
  /**
   * Which edge the panel shares with its trigger. `end` is the default and is
   * the row's: a dots button lives at the right end of a row, so its panel
   * hangs LEFT and stays inside the column.
   *
   * `start` is the filter bar's, and the difference is the one this cost. A
   * facet pill is ~90px wide at the LEFT edge of the content, and its panel is
   * 232–288: right-aligned, the panel's left edge lands well past the pill's,
   * off the content and over the rail — reported as a dropdown sitting on top
   * of the sidebar. Aligned to the start it hangs to the right, under the name
   * of the axis it belongs to, which is also the order the pill reads in.
   */
  align?: 'start' | 'end';
  /**
   * A checkable row CLOSES the menu. For an axis where one value is the whole
   * answer — `Facet`'s `single`. The default leaves it open, which is what
   * ticking two of four statuses needs.
   */
  closeOnPick?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const id = useId();

  /* The surrounding `ModalHost` stands down while this is up. See the header. */
  useEscapeGuard(open);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const hasSearch = search !== undefined;

  const openAt = useCallback(() => {
    const box = triggerRef.current?.getBoundingClientRect();
    if (!box) return;
    const GUTTER = 12;
    const H = panelHeight(items, hasSearch);
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    /* Both edges are clamped to the viewport gutters, so a pill near the right
       edge still gets a panel that fits — the clamp is what makes `start` safe
       rather than a second way to leave the screen. */
    const wanted = align === 'start' ? box.left : box.right - width;
    const left = Math.max(GUTTER, Math.min(wanted, vw - GUTTER - width));
    const below = box.bottom + 4;
    const roomBelow = vh - GUTTER - below;
    const roomAbove = box.top - 4 - GUTTER;
    const top =
      roomBelow >= H ? below
      : roomAbove > roomBelow && roomAbove >= H ? box.top - H - 4
      : Math.max(GUTTER, vh - GUTTER - H);
    setAt({ top: Math.round(top), left: Math.round(left) });
    /* Cleared on the way IN rather than on the way out: the panel unmounts with
       the menu, and a term that survived the close would filter the next
       opening of a list the trainer has not typed into yet. */
    setTerm('');
    setOpen(true);
  }, [items, width, hasSearch, align]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (!panel.current) return;
      /* The caret is in the find field. Home and End belong to the text — a
         list that jumps to its last row while somebody is editing the middle of
         what they typed is a list that has taken the keyboard off them — and
         Enter takes the first row left standing. */
      const typing =
        hasSearch && panel.current.querySelector('.menu__find input') === document.activeElement;
      if (typing && (e.key === 'Home' || e.key === 'End')) return;
      if (typing && e.key === 'Enter') {
        e.preventDefault();
        panel.current.querySelector<HTMLElement>(ROVE)?.click();
        return;
      }
      const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
      if (!keys.includes(e.key)) return;
      e.preventDefault();
      const rows = [...panel.current.querySelectorAll<HTMLElement>(ROVE)];
      if (rows.length === 0) return;
      const cur = rows.indexOf(document.activeElement as HTMLElement);
      const to =
        e.key === 'Home' ? 0
        : e.key === 'End' ? rows.length - 1
        : e.key === 'ArrowDown' ? (cur + 1) % rows.length
        /* From the field the caret is nowhere in the list, and Up means the
           END of it — `(cur - 1 + len) % len` off -1 lands one row short. */
        : cur < 0 ? rows.length - 1
        : (cur - 1 + rows.length) % rows.length;
      rows[to]?.focus();
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panel.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    /* A fixed panel does not travel with its row — see the header. Shut rather
       than re-measure, on both signals: `resize` moves the row under it just as
       surely as a scroll does, and only one of the two copies this replaces
       listened for it.

       THE PANEL'S OWN SCROLL IS NOT ONE OF THEM. This is a CAPTURE listener on
       `window`, which sees every scroll in the document including the one
       inside `.menu__list` — so a capped, scrollable list of clients closed on
       the first flick through it, before the guard below. The panel has not
       moved relative to its trigger when its own list scrolls. */
    const onMove = (e: Event) => {
      const target = e.target;
      if (target instanceof Node && panel.current?.contains(target)) return;
      close(false);
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    /* Typing is the reason the field is there, so the caret opens in it. */
    const first = hasSearch
      ? panel.current?.querySelector<HTMLElement>('.menu__find input')
      : panel.current?.querySelector<HTMLElement>(ROVE);
    first?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, close, hasSearch]);

  const name = menuLabel ?? `Actions for ${label}`;
  const toggle = () => (open ? close() : openAt());

  /* Matched on the label AND on whatever the caller put in `find` — a roster
     searched by name alone is one a trainer cannot reach by the number they
     have in their hand. Separators go with the term: a rule between two groups
     that no longer exist is a rule between nothing and nothing. */
  const q = hasSearch ? term.trim().toLowerCase() : '';
  const shown =
    q === ''
      ? items
      : items.filter(
          (item) =>
            !isSeparator(item) &&
            `${item.label} ${item.find ?? ''}`.toLowerCase().includes(q),
        );

  const rows = shown.map((item, i) =>
    isSeparator(item) ? (
      <div key={item.key ?? `sep-${i}`} className="menu__sep" role="separator" />
    ) : (
      <button
        key={item.key ?? item.label}
        className={[
          'menu__i',
          item.danger ? 'menu__i--danger' : null,
          isChecked(item) ? 'menu__i--check' : null,
        ].filter(Boolean).join(' ')}
        type="button"
        role={isChecked(item) ? 'menuitemcheckbox' : 'menuitem'}
        aria-checked={isChecked(item) ? 'checked' in item && item.checked : undefined}
        disabled={item.disabled}
        id={`${id}-${i}`}
        onClick={() => {
          /* A STATE leaves the menu open — picking two of four statuses must
             not be two trips. `closeOnPick` is the axis where one value is the
             whole answer, and there the focus goes back to the pill: the list
             it came from is gone and the bar is where the trainer still is. A
             verb closes FIRST and restores nothing — one that opens a dialog
             would otherwise pull the caret back to a trigger the dialog is
             about to cover — and a destination is changing the page anyway. */
          if (isChecked(item)) {
            if (!closeOnPick) {
              if ('onSelect' in item) item.onSelect();
              return;
            }
            close(true);
            if ('onSelect' in item) item.onSelect();
            return;
          }
          close(false);
          if ('href' in item) router.push(item.href);
          else item.onSelect();
        }}
      >
        {isChecked(item) && <i aria-hidden="true"><TickIcon /></i>}
        <span>{item.label}</span>
      </button>
    ),
  );

  return (
    <>
      {triggerContent ? (
        <button
          type="button"
          className={triggerClass ?? className}
          ref={triggerRef}
          aria-haspopup={hasSearch ? 'dialog' : 'menu'}
          aria-expanded={open}
          onClick={toggle}
        >
          {triggerContent}
        </button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          ref={triggerRef}
          className={className}
          label={name}
          title={undefined}
          icon={icon ?? <DotsIcon />}
          aria-haspopup={hasSearch ? 'dialog' : 'menu'}
          aria-expanded={open}
          onClick={toggle}
        />
      )}

      {open && at && createPortal(
        <div
          className={[
            'menu', 'menu--row',
            align === 'start' ? 'menu--start' : null,
            hasSearch ? 'menu--find' : null,
          ].filter(Boolean).join(' ')}
          ref={panel}
          /* A `menu` may own menu items and nothing else. With a find field
             this panel also holds a textbox, so the PANEL becomes a container
             and the rows keep the menu, one level in. */
          role={hasSearch ? 'dialog' : 'menu'}
          aria-label={name}
          style={{ top: at.top, left: at.left, minWidth: width }}
        >
          {search && (
            <div className="menu__find">
              <SearchField
                label={search.placeholder}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                /* Filtering is silent: the rows change and nothing a reader was
                   on has moved. `SearchField`'s own live count is the repair,
                   and it is only drawn when the caller says what it counted. */
                count={
                  search.noun
                    ? { shown: shown.length, total: items.length, noun: search.noun }
                    : undefined
                }
              />
            </div>
          )}

          {hasSearch && shown.length === 0 ? (
            <p className="menu__none">{search?.empty}</p>
          ) : hasSearch ? (
            <div className="menu__list" role="menu" aria-label={name}>{rows}</div>
          ) : (
            rows
          )}
        </div>,
        /* `document.body`, so the panel is not a descendant of whatever
           transformed, filtered or clipped box the trigger happens to sit in.
           See the header — a dialog is exactly that box. */
        document.body,
      )}
    </>
  );
}

/** The tick on a checked row. 12px, so the reserved column is not widened. */
function TickIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 12 5.5 6L20 6" />
    </svg>
  );
}

/** The three dots, at the one size a row's action cell uses. */
function DotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="19" r="1.7" />
    </svg>
  );
}
