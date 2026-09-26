import type { ReactNode } from 'react';

/**
 * NOTE CARD — a thing somebody wrote down, drawn as the object it is.
 * Catalogue entry `c-notecard`, `.ncard`.
 *
 * ── WHAT IT REPLACES, AND THE MEASUREMENT THAT CONDEMNED IT ─────────────────
 *
 * The client file's *Personal information* tab drew its notes as full-bleed
 * rows in a flush card (`.cfnote`, app.css). MEASURED at 1536×695 on `cli_012`,
 * the densest seeded client:
 *
 *   the notes card                        974px wide, 288px tall
 *   the left column beside it             423px wide, 571px tall
 *   the text column inside a row          705px
 *   the longest note in it                 72 characters, one line, ending at ~450px
 *
 * So every note was a single sentence smeared across 705px with ~255px of
 * nothing after it, the column holding them was 69% of the screen and the
 * shortest thing on it, and the 283px step down the middle of the page read as
 * a card that had failed to load. `.cfgrid--ov` on the Overview tab had already
 * been through this argument one tab over and reached the same conclusion: a
 * track ceiling can stop a row spreading, it cannot give a column something to
 * say. **What was needed was a different shape for the CONTENT.**
 *
 * A note is not a row. A row is right for records that share a schema and are
 * read down a column — a session, a payment, a set. A note shares nothing with
 * the note above it except that the same person wrote both, and the thing the
 * reader does is not scan a column, it is read a sentence. So: an index card,
 * in a wall of index cards (`.cfnw` at the call-site), each one about 480px at a
 * desk — a reading measure of roughly 75 characters rather than 120.
 *
 * ── THE FOOTER IS PINNED TO THE FLOOR, AND THAT IS STRUCTURAL ───────────────
 *
 * `margin-top:auto` on `.ncard__ft` inside a column flex box. Grid items stretch
 * by default, so every card in a row is as tall as the tallest, and without this
 * each card's controls would sit wherever its sentence happened to end — a
 * ragged line of switches across the wall. With it the controls form one line
 * per row, which is the same argument `.cfgrid--ov` makes for `Card.Band`.
 *
 * ── THE THREE SLOTS, AND WHY THE STATE IS NOT ONE OF THEM ───────────────────
 *
 * `meta` (when it was written), `state` (who may read it) and `actions` (what
 * you can do to it) are ReactNodes and not data, because this component must not
 * know what a note IS. It draws a card with a sentence on it; whether the
 * control on the left is a share switch or something a later screen needs is the
 * call-site's business. What it DOES own is where each goes and that the three
 * never collide — which is the part that was being re-decided per screen.
 *
 * `pinned` and `shared` are booleans rather than a tone, deliberately. They are
 * not statuses: a pinned note is not a warning and a shared one is not a
 * success, and handing this a `tone` prop is how the next caller tints a note
 * red. They select two named treatments this component defines and nothing else.
 *
 * ── AND WHAT IT HAS NO PROP FOR ─────────────────────────────────────────────
 *
 * An `href`, and a `onClick` on the card itself. A note is read where it sits;
 * there is no detail page for eleven words, and a card that navigates would make
 * the four controls inside it into things you have to avoid pressing. `.ncard`
 * carries a hover border and no lift, which is §04's rule for a content plane:
 * motion is a claim of interactivity and only a card that is a link may make it.
 */
export function NoteCard({
  /** The note itself. `Markup`, never a bare string — the body carries markers. */
  children,
  /** When it was written, and whether it has been edited since. */
  meta,
  /**
   * Who may read it, as a control with its own word beside it. It sits at the
   * left of the footer because it is the only thing on the card that changes
   * who the note is FOR; everything in `actions` is about the author's own copy.
   */
  state,
  /** Pin / edit / delete, at the right-hand end of the footer. */
  actions,
  /** Stuck to the top of the client file's strip. A warm ground and a flag. */
  pinned,
  /**
   * Visible to the client. Drawn as an edge on the card rather than a fill,
   * because a note can be pinned AND shared and two fills cannot both win.
   */
  shared,
  /**
   * The card is in its editing state: the body is a field, and the footer's
   * `state` half is suppressed so the editor's own buttons are the only
   * controls in it. The call-site still owns what the field is.
   */
  editing,
  className,
}: {
  children: ReactNode;
  meta?: ReactNode;
  state?: ReactNode;
  actions?: ReactNode;
  pinned?: boolean;
  shared?: boolean;
  editing?: boolean;
  className?: string;
}) {
  const cls = [
    'ncard',
    pinned ? 'ncard--pin' : null,
    shared ? 'ncard--shared' : null,
    editing ? 'ncard--edit' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={cls}>
      {/* The head exists even when `meta` is empty, because `actions` lives in
          it while the card is being edited and the row must not collapse. */}
      {meta || (editing && actions) ? (
        <div className="ncard__hd">
          {meta ? <span className="ncard__m">{meta}</span> : null}
          {pinned ? (
            /* The word as well as the ground. A tint is a claim nobody can
               read: `--tx-warn-soft` at .13 alpha is the same surface a
               colour-blind reader sees as the card beside it, and the strip
               this note is stuck to is three inches up the page. */
            <span className="ncard__flag">Pinned</span>
          ) : null}
        </div>
      ) : null}

      <div className="ncard__b">{children}</div>

      {state || actions ? (
        <div className="ncard__ft">
          {!editing && state ? <span className="ncard__st">{state}</span> : null}
          {actions ? <span className="ncard__a">{actions}</span> : null}
        </div>
      ) : null}
    </article>
  );
}
