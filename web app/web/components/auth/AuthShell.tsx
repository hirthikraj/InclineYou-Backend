import { Logo } from '@/web-components/ui/Logo';

/**
 * The canvas every sign-in screen sits on — §04's `.authwrap`.
 *
 * One dark ground, ruled and lit the way inclineyou.com is, with the form
 * centred on it as a card. No half carries controls and no half is brand; there
 * is one column, and the brand is what it is standing on.
 *
 * ── WHO IS SIGNING IN IS NOT KNOWN ON THE TWO BUSIEST SCREENS ───────────────
 *
 * `/sign-in` and `/sign-in/verify` are drawn BEFORE anybody's role is resolved.
 * `destinationFor` runs on the VERIFY response — a client and a trainer type
 * their number into the same field and read the same plate on the way in, and
 * `personaFor` only tells them apart afterwards. The first draft of this shell
 * had the eyebrow default to *Trainer console* and the headline to *Two books.
 * One login.*, which is a fact about a trainer's account — their own training
 * kept apart from their clients' — and a client has no second book to make
 * sense of it with.
 *
 * So **the defaults below are audience-neutral and must stay that way.** The
 * four screens that DO know who is reading (`/role` and `/unattached` are
 * client-only, `/setup/done` is trainer-only, `/new` is either) pass their own.
 *
 * ── WHY `lead` IS REQUIRED ──────────────────────────────────────────────────
 *
 * It is set in caps at up to 40px, which a full sentence does not survive, and
 * every call-site's `quote` is a sentence. Required, the compiler asks for the
 * short line instead of silently blowing one up.
 *
 * ── THE ORDER OF THE CHILDREN IS LOAD-BEARING ───────────────────────────────
 *
 * §04 staggers `.authwrap__in > *` by `:nth-child`. Four children exactly:
 * lockup, headline block, card, foot. A fifth sibling added here inherits the
 * last delay rather than going undrawn, which is the failure worth having.
 */
export function AuthShell({
  eyebrow = 'Coaching, written down',
  lead = 'Every session. Every number.',
  quote = 'The plan, the sets and the payments — in one place both of you can see.',
  children,
}: {
  /** The mono, tracked-out microlabel over the headline. Never names a role
      unless the screen knows which role is reading it. */
  eyebrow?: string;
  /** Two to five words, set in caps. Not a sentence. */
  lead?: string;
  /** The sentence under the card. */
  quote?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app app--noshell">
      {/* `data-theme` is on the CANVAS and not on the card inside it: §01's
          palettes are attribute-scoped, so this pins the ground to the brand's
          dark while the card keeps whatever theme the document is in — which is
          the theme of the application it is about to open. */}
      <div className="authwrap" data-theme="dark">
        <div className="authwrap__in">
          <Logo cap={19} />
          <div className="authwrap__say">
            <span className="authwrap__k">{eyebrow}</span>
            <p className="authwrap__lead">{lead}</p>
          </div>
          <div className="authwrap__card">{children}</div>
          <div className="authwrap__foot">
            <p className="authwrap__quote">{quote}</p>
            <p className="authwrap__by">
              The app for personal trainers <b>and the people they coach</b>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
