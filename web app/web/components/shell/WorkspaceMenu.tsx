'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { Workspace, WorkspaceKind } from '@/lib/workspace/types';

import { Building, Check, ChevronDown, Star, Team, User } from './Icons';
import { useWorkspace } from './WorkspaceHost';

/**
 * THE WORKSPACE SWITCHER — the first thing on the top bar, where the breadcrumb
 * used to be.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IT REPLACED THE BREADCRUMB, AND THAT TRADE IS THE DECISION
 *
 * `TopBar` argued the crumb's case at length and the argument was right for the
 * product it was written about: "on a phone *back* is unambiguous because there
 * is one stack; on the web a trainer can arrive anywhere from a URL, so
 * where-am-I has to be written down."
 *
 * What changed is that *where am I* stopped being one question. With three
 * tenants it is two — **which book**, and **which screen** — and the bar has
 * room for one of them. The screen is already written down twice: the rail
 * carries `aria-current="page"` on the destination, and every screen under this
 * bar opens with its own `.ph` header and an `<h1>` in it. The BOOK was written
 * down nowhere. So the slot goes to the answer nothing else in the chrome was
 * giving, and the crumb's job survives in the two places that were already
 * doing it.
 *
 * The `crumb` prop stays and is still drawn wherever there is no host — the
 * component library, and any bar outside the shell — so the control degrades to
 * exactly what it replaced.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A SWITCHER, NOT A LINK TO THE TEAM SCREEN
 *
 * *Team* was a row on the account menu, and the account menu is where a product
 * files the things you read once a month. That filing was the mistake this
 * replaces: a team is not a setting, it is a different set of clients, a
 * different money book and a different roster. Naming which one is open is the
 * chrome's job on every screen, and switching between them is a two-click
 * action rather than a visit.
 *
 * The menu does that and only that: it names the book and moves between books.
 * It carries no link to `/team` — managing a team is a screen INSIDE the team
 * workspace, not a destination reached from a control that is about all three —
 * and until those screens land that route has no door in the chrome. See the
 * note at the foot of the panel, and AGENTS.md.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO CONTROLS PER ROW: WHERE I AM, AND WHERE I START
 *
 * The row switches. The star beside it says which book the app OPENS in, and
 * they are separate because they are separate sentences — *I am working in the
 * team's book this afternoon* and *I start my mornings in my own* are both true
 * of the same trainer on the same day, and a menu that could only say the first
 * would make the second unsayable.
 *
 * **A toggle per row, not one switch.** A switch is binary about one thing, and
 * a default is one-of-N: there is no *no default* state — with nothing stored
 * the answer is the solo book — so a control that could be turned OFF would be
 * offering a state the model does not have. Pressing one star releases the
 * others, which is a radio's behaviour carried by a `menuitemcheckbox` — the
 * role ARIA gives a menu row with a state, and the one that does not put a
 * second ungrouped radio set into a menu that already has one.
 *
 * Always drawn, never revealed on hover: `Rail.tsx` settles that for the whole
 * shell — "a control that appears when the pointer arrives is a control a
 * keyboard user has to already know about". So the outline star sits on every
 * row at rest, and the note under the group says in one line what pressing it
 * does, because a star with no caption is as likely to be read as *favourite*.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PANEL IS A PORTAL, AND `.top` IS WHY
 *
 * §24 gives the top bar a `backdrop-filter`, which makes it a **stacking
 * context** — and a containing block for fixed-position descendants too. A
 * panel rendered inside it is trapped: `.main` is `position:relative` and later
 * in the DOM, so it paints over the menu at any z-index, and the menu's own
 * glass fill has nothing behind it to blur because its backdrop is the bar's
 * already-filtered layer. Both were live and both were visible in one
 * screenshot: a transparent panel with the day's heading drawn straight
 * through it.
 *
 * `NotificationsHost` already had this and solved it by mounting `.ntf` as a
 * sibling of `.top` at a fixed offset — which works because the bell is pinned
 * to the bar's right edge and nothing moves it. This trigger is at the LEFT
 * edge, behind a fixed rail and a section pane that collapses, so a constant
 * offset would be wrong on every route that draws a pane and wrong again the
 * moment one is put away. It portals to `document.body` and is placed from
 * the trigger's own rect instead, measured in the same handler that opens it,
 * so there is no frame where the panel is somewhere else.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ONE WORKSPACE DRAWS NO MENU
 *
 * A trainer with no team and no gym has exactly one book, and a dropdown whose
 * list has one row is the dead control this shell keeps deleting — it takes a
 * click, opens a panel and offers nothing. They get the name as a plain label
 * instead, which is still the answer to *which book*, and the caret appears the
 * day a second one does.
 */
export function WorkspaceMenu() {
  const ws = useWorkspace();

  /** `null` is closed. Open carries WHERE, because the panel is portalled out
   *  of this component's box and cannot inherit an anchor from it. */
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const open = at !== null;

  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  /** Closing returns focus to the trigger — `AccountMenu`'s reason, unchanged:
   *  a keyboard user who pressed Escape inside a panel that then unmounts is
   *  otherwise returned to the top of the document. */
  const close = useCallback((restoreFocus = true) => {
    setAt(null);
    if (restoreFocus) trigger.current?.focus();
  }, []);

  /*
   * Measured in the handler that opens, not in an effect afterwards.
   *
   * An effect runs after the panel has already been painted somewhere, which on
   * a menu anchored to a moving element is one frame of it in the wrong place —
   * and here "somewhere" is the top-left of the viewport, which is over the
   * rail. The rect is read from the trigger and the panel is mounted with it.
   *
   * Clamped to the viewport rather than trusted: the trigger sits 12px from the
   * left edge on a phone and the panel is up to 320px wide, which fits — but a
   * narrower window, or a longer workspace name pushing the trigger right, must
   * not put the panel's right edge off screen. GUTTER is `.top`'s own phone
   * padding, so the panel lands inside the same margin as the bar above it.
   */
  const openAt = useCallback(() => {
    const box = trigger.current?.getBoundingClientRect();
    if (!box) return;
    const GUTTER = 12;
    const MAX_W = 340;
    const room = document.documentElement.clientWidth - GUTTER;
    setAt({
      top: Math.round(box.bottom + 6),
      left: Math.round(Math.max(GUTTER, Math.min(box.left, room - MAX_W))),
    });
  }, []);

  // Escape, and a click anywhere else. `pointerdown` rather than `click`, so a
  // drag that starts here and ends on the page closes on the press — the same
  // model every other menu on this platform follows.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    /* BOTH boxes, because the panel is no longer inside the trigger's. A
       `contains` check against `wrap` alone would treat every click on a
       workspace row as a click outside and close the menu under the pointer. */
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (wrap.current?.contains(target) || panel.current?.contains(target)) return;
      close(false);
    };
    /* A portalled panel holds a position rather than an anchor, so anything
       that moves the trigger un-anchors it. Re-measuring on every resize frame
       is work on the wrong side of the trade for a menu that is open for two
       seconds; closing is honest and costs one more click. */
    const onMove = () => close(false);

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', onMove);
    };
  }, [open, close]);

  if (!ws || ws.workspaces.length === 0) return null;

  const { workspaces, activeId, defaultId, switching, switchTo, makeDefault } = ws;
  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0];

  /*
   * `role="menu"` OBLIGES ARROW KEYS — `AccountMenu` makes the whole argument
   * and this is the same twenty lines against the same obligation: a menu is
   * the one ARIA role that takes its rows out of the tab sequence, so a reader
   * told "menu, 3 items" and given no way to reach item two is worse served
   * than by a plain list.
   *
   * It queries `menuitemradio` as well as `menuitem`, because the workspace
   * rows are a CHOICE — one of three, exactly one checked — and the foot's link
   * to the team screen is a command. Both are rows; only one kind is an answer.
   */
  const onMenuKeys = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();

    const items = [
      ...e.currentTarget.querySelectorAll<HTMLElement>(
        '[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]',
      ),
    ].filter((el) => !el.hasAttribute('disabled'));
    if (items.length === 0) return;

    const at = items.indexOf(document.activeElement as HTMLElement);
    const to =
      e.key === 'Home' ? 0
      : e.key === 'End' ? items.length - 1
      : e.key === 'ArrowDown' ? (at + 1) % items.length
      : (at - 1 + items.length) % items.length;
    items[to]?.focus();
  };

  // One book, no menu — see the header.
  if (workspaces.length === 1) {
    return (
      <div className="wsw wsw--one">
        <Plate kind={active.kind} />
        <span className="wsw__n">
          <b>{active.name}</b>
          <i>{active.role}</i>
        </span>
      </div>
    );
  }

  return (
    <div className="wsw" ref={wrap}>
      <button
        className="wsw__b"
        type="button"
        ref={trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        /* The name alone is not enough for a reader: *Iron Yard Coaching* is a
           name, and what this control DOES with it is not in the name. The
           visible text stays two lines; the accessible name says the verb. */
        aria-label={`Workspace: ${active.name}. Switch workspace`}
        onClick={() => (open ? close() : openAt())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            openAt();
          }
        }}
      >
        <Plate kind={active.kind} />
        <span className="wsw__n">
          <b>{active.name}</b>
          {/* Dropped below 900px by app.css — on a phone this line is the
              screen's title and the bar has two verbs beside it. */}
          <i>{active.role}</i>
        </span>
        <ChevronDown size={14} />
      </button>

      {at && createPortal(
        <div
          className="menu menu--ws"
          role="menu"
          aria-label="Workspaces"
          style={{ top: at.top, left: at.left }}
          ref={(node) => {
            panel.current = node;
            focusFirstRow(node);
          }}
          onKeyDown={onMenuKeys}
        >
          <p className="menu__gk">Workspaces</p>

          {workspaces.map((w) => {
            const current = w.id === activeId;
            const isDefault = w.id === defaultId;
            const busy = switching === w.id;
            return (
              /*
                A WRAPPER, because a row now holds TWO controls and a button
                cannot contain a button. `role="none"` strips the div out of the
                menu's structure, so the radio and the star are still direct
                items of the menu as far as a reader is concerned — the same
                thing `role="presentation"` on an `<li>` does in a menu built
                from a list. Without it the menu would announce three groups of
                nothing between its rows.
              */
              <div className="menu__wsrow" role="none" key={w.id}>
                <button
                  className="menu__i menu__i--ws"
                  type="button"
                  role="menuitemradio"
                  aria-checked={current}
                  /* Every row disabled while one is in flight, not just the one
                     that was clicked: two switches racing would leave the cookie
                     holding whichever response landed last, which is not
                     necessarily the one the trainer asked for second. */
                  disabled={switching !== null}
                  onClick={() => {
                    switchTo(w.id);
                    // Closes on the click rather than on the response. The switch
                    // revalidates the whole layout, so waiting would hold an open
                    // panel over a screen that is already changing underneath it.
                    close(false);
                  }}
                >
                  <Plate kind={w.kind} />
                  <span className="menu__ws">
                    <b>{w.name}</b>
                    <i>{w.role}</i>
                  </span>
                  {current ? (
                    <Check size={15} />
                  ) : busy ? (
                    <span className="menu__ws__wait">Opening…</span>
                  ) : null}
                </button>

                {/*
                  THE STAR, and its accessible name is a whole sentence in both
                  states. `aria-pressed` alone would give a reader "button,
                  pressed" beside a workspace name, which does not say what is
                  pressed ABOUT it — and this is the one control on the menu
                  whose effect happens tomorrow rather than now, so the label is
                  the only place that can say when.

                  It is NOT disabled when it is already the default. A disabled
                  control drops out of the arrow-key walk, and this mark is how a
                  keyboard user finds out which book opens the app — the state
                  has to be reachable on every row for the question to be
                  answerable at all. Pressing it is a no-op, guarded in the host.

                  The label does not change with the state, and that is on
                  purpose: `aria-checked` already says whether it is set, and a
                  name that flipped between *Open X…* and *X opens…* would be
                  read as a different control appearing rather than as the same
                  one changing.
                */}
                <button
                  className="menu__star"
                  type="button"
                  /* `menuitemcheckbox`, NOT `menuitem` + `aria-pressed`: that
                     pair is invalid — a menu item has no pressed state — and the
                     linter is right to refuse it. This is the role ARIA gives a
                     menu row that carries an on/off state, and the exclusivity is
                     a rule of the model rather than something a checkbox forbids.
                     `menuitemradio` would say the exclusivity out loud and would
                     put a SECOND radio group in a menu that already has one, with
                     no `group` between them — "radio, 1 of 6" over three rows
                     that are three pairs. */
                  role="menuitemcheckbox"
                  aria-checked={isDefault}
                  disabled={switching !== null}
                  title={`Open ${w.name} when you sign in`}
                  aria-label={`Open ${w.name} when you sign in`}
                  onClick={() => makeDefault(w.id)}
                >
                  <Star size={15} filled={isDefault} />
                </button>
              </div>
            );
          })}

          {/*
            One line, and it is what stops the star being a guess. A star is read
            as *favourite* at least as often as *default*, and the difference
            matters here because pressing it changes nothing a trainer can see
            today. `role="none"` again: a paragraph is not a menu item.
          */}
          <p className="menu__hint" role="none">
            The starred workspace opens when you sign in.
          </p>

          {/*
            NO FOOT, AND `/team` HAS NO DOOR IN THE CHROME — 31 Aug 2026.

            A *Manage team* row sat here, and the argument for it was that moving
            *Team* off the account menu had taken away its only entry point. That
            argument was right about the hole and wrong about where the door
            belongs.

            A team is a WORKSPACE, and managing one is a screen INSIDE it — seats,
            invitations and who reads what are that book's own settings, the same
            way the solo book's settings live under `/settings`. A row in the
            switcher pointing at `/team` was the old filing surviving one level
            up: a link out of the menu, to a screen that is not scoped to the
            workspace the menu is about, reachable identically from every row
            including the two it has nothing to do with.

            So the menu does one thing now — it names the book and switches
            between them — and the door moves inside the team workspace with the
            screens that pass is waiting on.

            **Until then `/team` is a live route with no entry point** and that is
            a known gap rather than an oversight; it is the inverse of the defect
            this codebase names by name, and it is recorded in AGENTS.md so the
            team-workspace pass closes it rather than rediscovering it. Nothing
            else in the shell links there — checked, not assumed.
          */}
        </div>,
        document.body,
      )}
    </div>
  );
}

/**
 * The kind, as a glyph on a plate.
 *
 * Three kinds, three shapes — a person, a group, a building — because the names
 * cannot be told apart at a glance: this product's demo data has a team called
 * *Iron Yard Coaching* and a gym called *Iron Yard, Anna Nagar*, and a list
 * where the only difference between two rows is the tail of a string is a list
 * that gets misread. The plate is neutral in every kind: a coloured chip per
 * tenant would be a taxonomy nobody asked to learn, and the accent in this
 * system means *the current thing*, which the check mark already says.
 */
function Plate({ kind }: { kind: WorkspaceKind }) {
  return (
    <span className={`wsw__ic wsw__ic--${kind}`} aria-hidden="true">
      {kind === 'team' ? <Team size={15} />
        : kind === 'gym' ? <Building size={15} />
        : <User size={15} />}
    </span>
  );
}

/** Put the caret on the first row as the panel attaches — a ref callback for
 *  `AccountMenu`'s reason: React honours `autoFocus` imperatively only on form
 *  controls, and this menu's rows are buttons and a link. */
function focusFirstRow(node: HTMLElement | null): void {
  node?.querySelector<HTMLElement>('.menu__i')?.focus();
}

export type { Workspace };
