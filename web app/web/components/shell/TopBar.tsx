'use client';

import Link from 'next/link';

import { ChevronLeft, Search } from './Icons';
import { useWorkspace } from './WorkspaceHost';
import { WorkspaceMenu } from './WorkspaceMenu';
import { usePaletteOpener } from './PaletteHost';
import { ShortcutKeys } from './ShortcutKeys';

/**
 * Breadcrumb · search.
 *
 * The breadcrumb is not decoration. On a phone "back" is unambiguous because
 * there is one stack; on the web a trainer can arrive anywhere from a URL, so
 * where-am-I has to be written down.
 *
 * ── THE SYNC PILL IS NOT HERE, AND THAT IS THE DECISION ───────────────────────
 *
 * `gen_rail.py`'s `top()` draws a pill reading *Synced* / *6 queued* / *Offline*,
 * and `gen_today.py` draws all three states. **None of them is built.** The web
 * app is online-only (decided 23 Aug 2026): every write goes straight to the
 * server and there is no local database to queue into, so a pill saying "Synced"
 * would be describing an architecture this half does not have — and one saying
 * "6 queued" could never be true. `AGENTS.md` carries the list this belongs to,
 * alongside the dashboard's offline banner and Settings' sync-queue screen.
 *
 * What replaces it is nothing, deliberately. A failed write on this half is
 * reported where it happened — in the row, by the action that failed — which is
 * a stronger promise than a pill in a corner.
 *
 * ── AND NO GREETING ANYWHERE ─────────────────────────────────────────────────
 *
 * `deck.ts` settles it in its own docstring: "no greeting at all". The page this
 * replaces opened with *Good morning, Anbu* in the most-read line of the
 * most-read screen. The subtitle here is the day and its state instead.
 */
/**
 * The screen's name, from the breadcrumb it already had.
 *
 * Twenty screens pass a `crumb`, and a crumb is a PATH — *Clients / Meera K*,
 * *Programs · Certified · Upper/Lower*. The last segment of a path is the thing
 * the path arrived at, which is exactly what a phone's header has room to say,
 * so the title is derived rather than becoming a twenty-first prop nobody
 * remembers to pass. `title` overrides it where a screen knows better.
 *
 * Both separators are split on because the set uses both and they mean the same
 * thing here — `/` on the client file and the report, `·` in Programs and the
 * money book. Trailing empties are dropped so a crumb that ends in a separator
 * cannot produce a blank header.
 */
export function screenTitle(crumb: string): string {
  const parts = crumb
    .split(/\s*[/·]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts[parts.length - 1] ?? crumb;
}

export function TopBar({
  crumb,
  title,
  titleHref,
  onSearch,
}: {
  crumb: string;
  /**
   * What the phone's header calls this screen. Defaults to the crumb's last
   * segment — see `screenTitle`. Pass it only when that is wrong: the workout
   * console's crumb is *Sessions* for six different screens, and the one thing
   * a trainer needs at the top of those is whose session it is.
   */
  title?: string;
  /**
   * Where the title goes when it is pressed — the phone's way OUT of a screen
   * that sits inside a section. Pass it with a `title` naming the SECTION, not
   * the screen: the pair is a back control, so the label is the destination.
   *
   * For screens INSIDE a section — the builder, the certified preview, the
   * client file. A section's own top-level screen never gets one: *Clients* the
   * roster is not inside anything, and a title that points at the screen it is
   * already on is a control that does nothing.
   *
   * ── AND THE BAR HAVING A SLOT FOR THE SECTION IS NOT A REASON TO SKIP IT ──
   *
   * This note used to say the opposite: "a screen the tab bar can reach does not
   * get one, because the bar is already the way back". Narrowed 5 Sep 2026 on
   * the client file, which the bar reaches and which had no way back at all
   * below 900px — `.cfback` is `display:none` there, for 38px of fold that
   * app.css measures and that this slot does not spend.
   *
   * The distinction the old rule missed: a bar slot is a DESTINATION, identical
   * from every screen, and a back control is a RETURN. `Clients` in the bar is
   * the same tap from the money book; here it means *out of this file*. The
   * worry underneath it — that the title stops meaning one thing — is answered
   * by the chevron, which is on screen exactly when the word is a door.
   *
   * Still a judgement per screen, and the test is the DUPLICATE: pass it when
   * the screen already names itself below the bar, so the slot is spent on a
   * word nothing else says. The client file's `.ph__t` carries the name, an
   * avatar and the status; the roster's `.ph` does not name a client at all.
   */
  titleHref?: string;
  /**
   * Opens the palette. The bar's search box is a BUTTON — see below.
   *
   * OPTIONAL, and the default is the thing that was broken. Fifteen of the
   * twenty screens that draw this bar passed `() => {}` — a search box with a
   * printed keyboard shortcut, wired to nothing. Leaving it out now reaches the
   * shell's palette, so the box works because the shell exists rather than
   * because a screen remembered. Pass it only to open something else.
   */
  onSearch?: () => void;
}) {
  const openPalette = usePaletteOpener();
  const search = onSearch ?? openPalette;
  /* Same contract again: `undefined` outside the shell, and the bar falls back
     to the breadcrumb rather than drawing a switcher with nothing to switch. */
  const workspace = useWorkspace();
  /*
   * No search outside the shell — `/sign-in` and `/setup` draw no palette. The
   * box is dropped rather than drawn inert, which is the whole argument of this
   * pass: a control that cannot do its job should not be on the screen.
   */
  return (
    <header className="top">
      {/*
        THE WORKSPACE SWITCHER, IN THE SLOT THE BREADCRUMB HELD.

        The docstring above argues the crumb's case — "on the web a trainer can
        arrive anywhere from a URL, so where-am-I has to be written down" — and
        it is right about the question and out of date about the answer. With
        three tenants, *where am I* is TWO questions: which book, and which
        screen. The bar has room for one.

        The screen is already written down twice: the rail marks the destination
        with `aria-current="page"`, and every screen under this bar opens with
        its own `.ph` header and an `<h1>` in it. The BOOK was written down
        nowhere — a team was a row on the account menu, filed with the things
        read once a month, while it is in fact the scope of every figure on
        every screen. So the slot goes to the answer nothing else in the chrome
        was giving.

        The crumb survives wherever there is no host — the component library,
        and any bar outside the shell — so the control degrades to exactly what
        it replaced rather than to a gap. `WorkspaceMenu` returns null on an
        empty list for the same reason.
      */}
      {workspace ? (
        <WorkspaceMenu />
      ) : (
        <nav className="crumbs" aria-label="Breadcrumb">
          <b>{crumb}</b>
        </nav>
      )}

      {/*
        THE SCREEN'S NAME, AND IT ONLY EXISTS BELOW 900px.

        The docstring above says the bar has room for one of *which book* and
        *which screen*, and gave the slot to the book. That is still true of a
        1440px bar, where the screen is named twice over — the rail marks the
        destination with `aria-current="page"` and every screen opens with its
        own `.ph` header.

        On a phone NEITHER of those is on the bar's row and one of them is gone:
        the rail is a five-slot tab bar at the other end of the screen, and the
        `.ph` header is a scrolling part of the page rather than chrome — scroll
        the roster and the word *Clients* leaves with it. So the phone's header
        says the screen, the plate beside it still says the book, and the two
        questions the docstring names are both answered in 44px.

        `aria-hidden`, and that is not a shortcut. The `<h1>` in `.ph` is this
        document's heading and is kept in the accessibility tree even on the
        screens that visually hide it (`.ph--named`), so a reader that announced
        this too would say the screen's name twice before the first control. The
        heading outline is the one copy; this is the picture of it.
      */}
      {/*
        ── AND WHEN THE SCREEN IS INSIDE A SECTION, IT IS THE WAY OUT ─────────

        `titleHref` turns the same slot into a back control, and it is the one
        place on a phone that can afford to be one. REPORTED on the builder: the
        bar said *Return to Lifting · post-i…* and the switcher 46px below it
        said *Return to Lifting · p…* — the same program, twice, and MEASURED at
        390px NEITHER COPY WAS COMPLETE (208px and 184px of a string needing
        244). Two truncations of one string is worse than either alone.

        The name belongs to the switcher, because there it is a control that
        does something with it. So the bar takes the SECTION — which nothing
        else on that screen says, since `.ph--builder` hides the tab strip and
        Programs is not one of the bar's five slots — and the section's name is
        also its destination, so the label and the link are the same word.

        NOT `aria-hidden` in this form, and that is not an oversight: hiding a
        focusable element from the accessibility tree is a control a keyboard or
        screen-reader user can reach and cannot identify. The plain form stays
        hidden for the reason below — the `<h1>` is the heading outline and this
        is a picture of it — but a picture is all it is, and a link is not.

        It costs 0px. The alternative was a crumb row inside `.ph`, which is the
        idiom the console uses, and it would have added ~22px to the section
        with the tallest header in the app to say a word the bar was already
        drawing.
      */}
      {titleHref ? (
        <Link className="top__title top__title--back" href={titleHref}>
          <ChevronLeft size={14} />
          {title ?? screenTitle(crumb)}
        </Link>
      ) : (
        <p className="top__title" aria-hidden="true">
          {title ?? screenTitle(crumb)}
        </p>
      )}

      {/*
        A button, not an input. Typing here does not filter anything on this
        screen — it opens the palette, which is a different surface with its own
        list and its own keyboard model. An input that steals the first keystroke
        and then hands it to a dialog is the kind of thing that works once and
        confuses forever. `.omni`'s `cursor:text` is kept because the affordance
        is still "type here".

        ── AND ON A PHONE IT IS A GLYPH BESIDE THE BELL ───────────────────────

        This block has now argued both sides, so both are recorded.

        It first said the field was `display:none` below 900px and a
        `.top__search` icon button took its place, because `.omni` is a fixed
        320px and pushed the breadcrumb and the bell off a 390px bar. That
        arithmetic was right and the conclusion was wrong — 320px was the desk's
        number and the field's own, so the fix was to stop pinning the width.

        It then said the field, full width on a row of its own, because a search
        box "is MORE useful small, not less, because twenty-two clients are four
        taps deep through the roster and one search away. A 24px glyph does not
        say that; a field with the sentence inside it does." That is an argument
        about DISCOVERY and it is a real one — it is just priced at a whole
        second row, 44px on every route in the app, forever.

        The product owner asked for the glyph on 3 Sep 2026, and it ships beside
        the bell. Two things make the trade cheaper than when it was first
        refused: the bar draws a TITLE now, so the row is a cluster rather than
        three controls with 250px of space beside them; and the search and the
        bell are the two controls that open a surface from anywhere, so putting
        them in one corner groups them by what they do.

        The icon button is still DELETED and is not coming back. `.omni` is one
        `<button>` at both widths — app.css drops its label and its key cap below
        900px and gives it the bell's 44px square. A second element would be
        markup in the accessibility tree promising a second way to do the one
        thing this button already does, and it is the reason nothing here reads a
        width in JSX: a component that branches on a measured width renders the
        wrong half for one frame after every resize, and cannot be
        server-rendered at all.

        `[data-omni]` and `useOmniCollapse` went with the second row. They took
        the field's row away on scroll and gave it back on the way up, which
        bought exactly the 44px the glyph now buys unconditionally — so there was
        nothing left for them to collapse.

        **The accessible name does not change**, and app.css had to be fixed
        once to keep that true: the sentence below is this button's only text and
        therefore its name, so the rule that hides it clips it rather than
        setting `display:none`, which would take it out of the accessibility tree
        and leave a 44px glyph announced as "button".

        `aria-keyshortcuts` stays on both, because a phone can have a keyboard —
        the `<kbd>` that prints the chord does not, and app.css drops it there.
      */}
      {search && (
        <button className="omni" type="button" onClick={search} aria-keyshortcuts="Meta+K Control+K">
          <Search size={15} />
          <span>
            <span className="omni__long">Search clients, sessions, exercises…</span>
            <span className="omni__short" aria-hidden="true">Search clients…</span>
          </span>
          {/* The chord this platform actually listens for — see ShortcutKeys.
              It said ⌘K to everyone, and the app has always bound Ctrl+K too. */}
          <ShortcutKeys letter="K" />
        </button>
      )}
    </header>
  );
}
