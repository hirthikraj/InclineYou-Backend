import type { ReactNode } from 'react';

import { Avatar } from './Avatar';

/**
 * CoachNote — a line FROM the trainer, attributed and quoted. Catalogue entry
 * `c-coachnote`, `.cnote`.
 *
 * ── IT IS THE HIGHEST-VALUE ELEMENT ON HOME AND IT WAS NOT A COMPONENT ───────
 *
 * §1 of the client spec: *"If the trainer left a message or updated the
 * program, surface it here with their name and photo. This is the single
 * highest-value element on the screen and it costs almost nothing to build."*
 * It is what separates this portal from a free workout app.
 *
 * And Home hand-wrote it — a `.row.row--top`, an `<Avatar>` and three inline
 * style properties on the quote — which is the condition
 * `check-components.mjs` exists to catch and could not, because there was no
 * class for it to own. The family is one component with parts (`.cnote__av`,
 * `.cnote__b`, `.cnote__q`, `.cnote__m`), the way `Card.Head` is: a BEM family
 * is one component, never one per `__element`.
 *
 * ── THE AVATAR IS THE PHOTO SLOT, AND SAYING SO IS THE POINT ─────────────────
 *
 * §1 asks for "their name and photo" and this product has no photo store —
 * `/settings/profile` states that under its own preview. `Avatar` is the
 * initials plate that has stood in for one since setup, so the slot is real and
 * the identity is right; the day a photo column lands, it lands here and
 * nowhere else, which is what a component buys over a `.row` at a call-site.
 *
 * ── WHAT IT DELIBERATELY HAS NO PROP FOR ─────────────────────────────────────
 *
 * A **reply**. §"What to cut" is explicit — *"in-app chat — you cannot beat
 * WhatsApp; link to it"* — so there is no action slot on this component and a
 * screen that wants one is asking for the feature that was cut. `meta` takes
 * the *go and look at it* line instead, which is a link to a screen this app
 * already has.
 *
 * A **tone**. A note from your trainer is not a status. Tinting it would put
 * *"keep the same weight on the bench"* in the same visual language as a
 * balance owing, and the stylesheet's block says the same thing.
 */
export function CoachNote({
  /** Whose note it is. Names the avatar's plate and its accessible label. */
  author,
  /**
   * The trainer's id, so the plate's colour is stable for one person across
   * every screen that draws them — `Avatar`'s own rule.
   */
  authorId,
  /**
   * What they wrote. Quoted by the STYLESHEET rather than by this component or
   * the caller — two call-sites typing their own `&ldquo;` is two chances to use
   * a straight one, and typing them here breaks the moment the child is a block
   * (see the note at the element). Either way, no caller supplies a quote mark.
   */
  children,
  /**
   * The line under the quote — what the note is about, or where to go and look.
   * Never the author's name: the card's head already says who it is from.
   */
  meta,
}: {
  author: string;
  authorId?: string;
  children: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="cnote">
      <div className="cnote__av">
        <Avatar name={author} id={authorId} size="md" />
      </div>
      <div className="cnote__b">
        {/*
          A `<blockquote>`, and the reason is the same one that made the Today
          hero's kicker an `<h2>`: this is the one paragraph of somebody else's
          words on the screen, and a reader walking the page is owed the fact
          that it is a quotation rather than the app talking. `cite` is not set
          — the attribution is the avatar and the card's head, both of which are
          in the accessible tree already, and a URL there would be a link to
          nothing.
        */}
        {/*
          NO QUOTE GLYPHS HERE ANY MORE — §11 draws them, and the reason is
          measured rather than tidy. Typed into the element, they are two text
          nodes with the child between them; when that child is `<Markup>` the
          child is `display:block`, so the blockquote splits into three anonymous
          block boxes and each mark takes a LINE to itself. The portal's notes
          card rendered 89.9px around 45px of prose at 390px, ten times over.

          `.cnote__q` now carries `quotes` plus an `::before`/`::after` pair, and
          hands them to the first and last line of a markup run instead when
          there is one. Which also closes the thing this file used to worry about
          two paragraphs up: no call-site can type a straight quote, because no
          call-site types one at all.
        */}
        <blockquote className="cnote__q">{children}</blockquote>
        {meta ? <p className="cnote__m">{meta}</p> : null}
      </div>
    </div>
  );
}
