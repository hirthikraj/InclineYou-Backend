'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';

import { signOut } from '@/lib/auth/actions';
import { formatPhone } from '@/lib/auth/policy';
import { initials } from '@/lib/today/time';
import { ChevronUp, Out } from './Icons';
import { ACCOUNT, type Destination } from './nav';

import { ThemeSwitch } from '@/web-components/ui/ThemeSwitch';

/**
 * The rail's foot — `webapp-rail.html` frame 2b, "the account menu".
 *
 * The button was already in `Rail.tsx`, drawn with `aria-haspopup="menu"` and
 * `disabled`, because the design set draws the menu in exactly one frame and the
 * Today pass had no sign-out to put in it. This is that menu, and the reason it
 * arrives now is that **sign-out was the one thing the shell could not do**: a
 * trainer on a shared gym desktop had no way to leave except clearing cookies.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ROW IS *Sign out*, WITH NO ELLIPSIS
 *
 * §2b sets the label as *Sign out…* "with an ellipsis, because it leads to a
 * screen that lists what is still queued rather than to a dialog that cannot name
 * it. There are six entries waiting on this device." The phone builds precisely
 * that screen and `SignOutScreen.tsx` gives the same reason.
 *
 * **On this half there is no queue, so there is no such screen** — the
 * online-only rule in `AGENTS.md`, the same call that drops the dashboard's
 * offline banner and the top bar's sync pill. With nothing to enumerate, the
 * ellipsis would be promising a listing the web shell never shows, so the row
 * reads plainly: **Sign out**.
 *
 * The click still does not sign out on the spot, because signing out here is not
 * free: **getting back in costs an SMS code**, against a ceiling of ten a day
 * (`MAX_SENDS_PER_DAY`), plus the wait for it. A one-click row at the bottom of a
 * navigation column that is on screen on every screen, two rows below a client's
 * name, is a misclick that ends the session. So the row leads to a confirm step
 * whose whole job is to name that cost — the same promise the design's screen was
 * making, about the thing that is actually at stake here.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CONFIRM REPLACES THE MENU RATHER THAN OPENING OVER IT
 *
 * A second surface anchored to a 248px rail is the problem §2a already solved for
 * the pin menu ("248px cannot hold a menu, and a menu that covered the four pins
 * above it would hide the list it is about"). Here the list the confirm would
 * cover is two rows about the account it is asking to leave, so the panel simply
 * changes what it holds — same box, same anchor, nothing moves. The header stays
 * in both views, and that is the point: the question is *leave THIS account*, and
 * the answer to *which one* has to still be on screen while it is being asked.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO OF THE DESIGN'S FOUR ROWS ARE NOT BUILT, AND THAT IS DELIBERATE
 *
 * §2b lists Profile, Settings, Help, Sign out. **Profile** and **Help** had no
 * route in this project at all — not even a `NotBuilt` placeholder — and the
 * defect `AGENTS.md` names by name is "nineteen live buttons pointing at a screen
 * that did not exist". A row that 404s is worse than a row that is missing, so
 * they arrive with the screens they open.
 *
 * **Profile arrived, on exactly those terms** — `/settings/profile` is built, so
 * the row it was waiting for is here, first, in the design's own order. It is a
 * real destination and not a duplicate of Settings: the four things a client
 * reads about a trainer are not "the things every screen reads", and burying the
 * only editor for them one level inside a preferences list makes the trainer's
 * own identity the hardest thing on this menu to find. **Help is still missing**,
 * and still on the same terms.
 *
 * **Settings** is built, as the `NotBuilt` placeholder every other rail
 * destination already lands on — and it is the row that could least afford to
 * wait: §2b moved Settings OFF the rail to free a row, so this menu is the only
 * entry point the design gives it, and without it `/settings` was reachable by
 * typing the URL and by nothing else.
 *
 * Its `,` accelerator is drawn in the design and is **not** drawn here. The rail's
 * ten `G`-letters are already hints for keys nothing binds; adding an eleventh
 * would widen a gap rather than close it. It comes back with the key.
 */
export function AccountMenu({
  trainerName,
  trainerPhone,
  rows = ACCOUNT,
  role = 'Trainer',
}: {
  trainerName: string;
  /** From `/v1/trainers/me`. Null on a profile that has none, and on an older
   *  backend — the header drops the line rather than printing a blank one. */
  trainerPhone: string | null;
  /**
   * The shelf's rows, from `nav.tsx`. Two for a trainer, one for a client —
   * `CLIENT_ACCOUNT` carries why the client's split is not the trainer's.
   *
   * A parameter and not a fork, for the reason the rows were moved into
   * `nav.tsx` in the first place: this menu and the phone's *More* sheet both
   * map the same array, and two copies of it is how a screen ends up reachable
   * from one surface and not the other. The client portal has no sheet, but it
   * has a rail foot and a tab bar, which is the same trap with different names.
   */
  rows?: Destination[];
  /**
   * The second line under the name. *Trainer* on the trainer's own shelf; the
   * client portal passes *with Arun*, because on that half the useful fact is
   * not which role you are — you only have one — but whose book is open, which
   * is the question a client on two rosters actually has.
   */
  role?: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  /**
   * Closing always resets the view AND returns focus to the trigger.
   *
   * The focus return is not a nicety: the button is the last thing in the rail's
   * tab order, and a keyboard user who presses Escape with focus inside a panel
   * that then unmounts is returned to the top of the document. They would have to
   * traverse the whole rail again to get back to where they were.
   */
  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    setConfirming(false);
    if (restoreFocus) trigger.current?.focus();
  }, []);

  // Escape, and a click anywhere else. `pointerdown` rather than `click`: a click
  // that starts on the page and ends here (or the reverse) is a drag, and closing
  // on the mousedown is what every other menu on the platform does.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // From the confirm step, Escape steps BACK to the menu rather than out of
      // it. One key, one level — the same reason the confirm is not a dialog.
      if (confirming) setConfirming(false);
      else close();
    };
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) close(false);
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open, confirming, close]);

  /*
   * `role="menu"` OBLIGES ARROW KEYS, so they are here rather than assumed.
   *
   * The design set emits `role="menu"` and `role="menuitem"` on this panel, and a
   * menu is the one ARIA role that takes its rows OUT of the tab sequence: a
   * screen reader user told "menu, 2 items" and given no way to reach item two is
   * worse served than by a plain list of links. This is the twenty lines that
   * makes the role true.
   *
   * The confirm view is deliberately NOT a menu — two answers to one question is
   * not a list of commands — so it keeps plain buttons and plain Tab.
   */
  const onMenuKeys = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();

    const items = [
      ...(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')),
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

  const name = trainerName || 'Your account';
  // `formatPhone` in `policy.ts` takes a string and always returns one — handed
  // '' it answers a bare `+91 `, which is precisely the blank line the header is
  // supposed to drop. The absence is decided here, before the formatter sees it.
  const phone = trainerPhone ? formatPhone(trainerPhone) : null;
  // The same fallback the trigger uses, so the two avatars agree on a profile
  // with no name yet: one 'X' plate, not an 'X' beside a 'YA'.
  const avatar = initials(trainerName || 'X');

  return (
    <div className="rail__foot" ref={wrap}>
      <button
        className="rail__acct"
        type="button"
        ref={trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        // Down-arrow opens a menu button and lands on its first row. The panel is
        // rendered on the same tick, so the focus is left to the panel's own mount.
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="av av--sm" style={{ background: 'var(--tx-av-4)' }} aria-hidden="true">
          {avatar}
        </span>
        <span className="rail__acct__n">
          {name}
          <i>{role}</i>
        </span>
        <ChevronUp size={15} />
      </button>

      {open &&
        (confirming ? (
          <SignOutConfirm name={name} phone={phone} avatar={avatar} onCancel={() => setConfirming(false)} />
        ) : (
          <div
            className="menu menu--acct"
            role="menu"
            aria-label={name}
            ref={focusFirstRow}
            onKeyDown={onMenuKeys}
          >
            <Header name={name} phone={phone} avatar={avatar} />
            {/*
              FIRST, which is §2b's order and also the right one.

              The header directly above it already shows this trainer's avatar and
              name; the row under it is where those come from. Settings is the
              machinery every screen reads — hours, nudge wording — and this is the
              trainer themselves, so it goes above rather than inside it.
            */}
            {rows.map((row) => (
              <Link
                key={row.key}
                className="menu__i"
                role="menuitem"
                href={row.href}
                title={row.purpose}
                onClick={() => close(false)}
              >
                {row.icon}
                {row.label}
              </Link>
            ))}
            {/*
              TEAM IS NOT HERE ANY MORE, AND THE ROW WAS NOT DELETED — IT MOVED.

              It sat between Settings and the theme for one pass, demoted out of
              the rail on the argument that "a team widens reads; it never moves
              ownership", so nothing on that screen changes a trainer's day and
              it belongs on the shelf a trainer reads once a month.

              That filing was the mistake. A team is not a permissions surface
              filed beside Settings — it is a DIFFERENT BOOK: different clients,
              a different money book, a different roster. Which one is open scopes
              every figure on every screen, and a question that scopes the whole
              app cannot live three clicks inside a menu about the account.

              So it is the top bar's workspace switcher now, in the slot the
              breadcrumb held (`WorkspaceMenu.tsx` carries the whole argument),
              and `/team` is reached from that menu's foot — which is what stops
              this being the deletion it looks like. `nav.tsx`'s `ACCOUNT` lost
              the row in the same commit, so the phone's sheet lost it too and
              the two widths still cannot disagree about what is on this shelf.
            */}
            {/*
              THE THEME, HERE RATHER THAN IN SETTINGS.

              §01 has carried a complete light palette from the beginning and the
              product never had a way to reach it — the server wrote
              `data-theme="dark"` and nothing ever wrote that attribute again.
              This is the way.

              On the account menu rather than in Settings because it is the
              trainer's own preference and not the business's: Settings is the
              machinery every screen reads — hours, the gym's share, nudge
              wording — and changing any of it changes what the product SAYS.
              This changes only how it looks, to this person, on this device.

              A row rather than a `menuitem`: an item that neither navigates nor
              closes the menu would lie to a reader about what Enter does. The
              group inside carries its own label and its own two buttons.
            */}
            {/*
              ONLY WHEN THERE ARE ROWS ABOVE IT. `.menu__hd` already draws a
              `border-bottom`, so on the client's shelf — which is empty, see
              `CLIENT_ACCOUNT` — an unconditional rule here would put two
              hairlines 9px apart under the name.
            */}
            {rows.length > 0 && <div className="menu__sep" />}
            <div className="menu__row">
              <span>Theme</span>
              <ThemeSwitch />
            </div>
            <div className="menu__sep" />
            <button
              className="menu__i menu__i--danger"
              type="button"
              role="menuitem"
              onClick={() => setConfirming(true)}
            >
              <Out size={15} />
              Sign out
            </button>
          </div>
        ))}
    </div>
  );
}

/**
 * Whose account this is. Drawn in both views — see the note above about why the
 * confirm keeps it.
 *
 * The number is the trainer's own and is printed in full rather than masked.
 * §2b's mock shows `+91 98407 ·· ··12`, which is the right shape for a number
 * somebody else might read over your shoulder; this is the number you sign in
 * with, on your own desktop, and the reason to show it at all is so a trainer with
 * two accounts can tell which one they are in. A masked one cannot answer that.
 */
function Header({
  name,
  phone,
  avatar,
}: {
  name: string;
  phone: string | null;
  avatar: string;
}) {
  return (
    <div className="menu__hd">
      <span className="av av--sm" style={{ background: 'var(--tx-av-4)' }} aria-hidden="true">
        {avatar}
      </span>
      <span>
        <b>{name}</b>
        {phone && <i>{phone}</i>}
      </span>
    </div>
  );
}

/**
 * The second step — a `<form>`, and that is the whole reason this is robust.
 *
 * `signOut` is a server action posted by the form, so the cookies are cleared and
 * the redirect issued by the framework rather than by a `fetch` this component
 * has to keep alive. Nothing here has to know where sign-out goes, and nothing
 * here can leave a half-signed-out browser sitting on `/today`: the response IS
 * the navigation.
 */
function SignOutConfirm({
  name,
  phone,
  avatar,
  onCancel,
}: {
  name: string;
  phone: string | null;
  avatar: string;
  onCancel: () => void;
}) {
  return (
    <form className="menu menu--acct" action={signOut} ref={focusFirstRow}>
      <Header name={name} phone={phone} avatar={avatar} />
      {/*
        The cost, named. This is what replaces the design's list of queued
        entries — the honest answer to "what does this actually do to me" on a
        half with no queue. The ceiling is real (`MAX_SENDS_PER_DAY`), and a
        trainer who signs out and back in four times in a morning is a trainer who
        will meet it, so the sentence is worth its two lines.
      */}
      <p className="menu__note">
        Getting back in needs a fresh code on WhatsApp. Nothing on your account changes.
      </p>
      <ConfirmRows onCancel={onCancel} />
    </form>
  );
}

/**
 * Split out only so `useFormStatus` can be read — it reports the status of the
 * nearest enclosing form and therefore cannot be called by the component that
 * renders that form.
 *
 * `Sign out` is first and takes the focus, which is the opposite of the
 * safe-option-first rule the phone's screen follows — and for a reason that does
 * not hold here. There the safe option is *sync first, then sign out*: a real
 * third thing to do, and the one almost everybody wants. Here there is nothing to
 * do first, so the two rows are the verb and the withdrawal of it — and the
 * trainer arrived by choosing the verb one click ago. Escape, a click anywhere
 * else and the second row are three ways out of it.
 */
function ConfirmRows({ onCancel }: { onCancel: () => void }) {
  const { pending } = useFormStatus();

  return (
    <>
      <button className="menu__i menu__i--danger" type="submit" disabled={pending}>
        <Out size={15} />
        {pending ? 'Signing out…' : 'Sign out'}
      </button>
      {/* Disabled once the post is away: the request cannot be recalled, and a
          live Cancel beside an in-flight sign-out is a button that lies. */}
      <button className="menu__i" type="button" onClick={onCancel} disabled={pending}>
        Stay signed in
      </button>
    </>
  );
}

/**
 * Put the caret on the first row as the panel attaches.
 *
 * A **ref callback**, not `autoFocus` and not an effect. `autoFocus` is what
 * `Palette.tsx` uses and it is right there, because React implements it by calling
 * `.focus()` imperatively — but only for form controls. On the `<a>` this menu
 * opens with, React renders it as the bare `autofocus` attribute and the browser
 * is under no obligation to honour it on a link. A ref callback fires when the
 * node attaches, before paint, on every element type.
 *
 * It is also why `open` means MOUNTED here, exactly as in `Palette.tsx`: the
 * panels are rendered only while open, so "focus the first row on open" needs no
 * dependency array and cannot fire on a re-render that did not open anything.
 */
function focusFirstRow(node: HTMLElement | null): void {
  node?.querySelector<HTMLElement>('.menu__i')?.focus();
}
