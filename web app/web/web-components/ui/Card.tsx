import { Children, isValidElement, type CSSProperties, type ReactNode } from 'react';

/**
 * Card — a bounded region with a heading.
 *
 * `title` renders as a real heading element, not a styled span. The reference
 * draws `<span class="card__t">`, and a screen half-built out of spans has no
 * outline at all — jumping between regions is how a screen reader user navigates
 * a dense page, and it needs headings to jump to.
 *
 * `level` exists because the right level depends on what is above the card, and
 * a component that always emits `<h2>` produces a page whose outline skips from
 * h1 to h2 to h2 to h2 regardless of nesting. The default is `h2`, which is
 * correct directly under a page header — and `PageHeader` emits the `<h1>`.
 *
 * ── TWO FORMS, AND WHEN EACH IS RIGHT ───────────────────────────────────────
 *
 * Most cards are a head and a body, so most cards are one tag:
 *
 *     <Card title="Team details" actions={<Button …/>}>…</Card>
 *
 * That covered 65 of the 110 cards in the product and none of the other 45. A
 * card is not always that shape: the reports grid puts its own class on the
 * head (`.mny__hd`, which stops the title and the CSV button running off a
 * 320px screen), the revenue card puts one on the body, and ten cards have
 * TWO bodies with a rule between them. Those are not misuse — they are what a
 * card is — and a prop for each (`headClassName`, `bodyClassName`, `bodyStyle`,
 * and nothing that could ever express two bodies) is how a component ends up
 * with fourteen props and still cannot draw the screen.
 *
 * So the parts are also components:
 *
 *     <Card>
 *       <Card.Head title="Revenue, month by month" className="mny__hd">
 *         <Tag>Your share, as it landed</Tag>
 *       </Card.Head>
 *       <Card.Body className="rptchart">…</Card.Body>
 *       <Card.Body>…</Card.Body>
 *     </Card>
 *
 * `Card` picks the form by looking at its children: if any of them is a
 * `Card.Head` or a `Card.Body` it renders them as given and wraps nothing. That
 * check is why the two forms cannot be mixed by accident — a `title` prop on a
 * composed card would silently produce two heads, and this way it produces
 * none, which is visible immediately.
 *
 * ── WHAT IT STILL DOES NOT DO ───────────────────────────────────────────────
 *
 * It does not own the styling. `.card`, `.card__hd`, `.card__b` and the tones
 * live in `design-system/webapp/webapp/assets/webapp.css`, where a designer can
 * reach them. `card--pick` and `card--pick-accent` are NOT tones here on
 * purpose: they are defined in `app/styles/app.css`, not in the design system,
 * so promoting them into this union would put an app-local class in the
 * catalogue's API. They ride `className` until somebody moves the CSS.
 */

/** The tones §04 defines. `pick`/`pick-accent` are app.css's, and deliberately absent. */
export type CardTone = 'acc' | 'lead' | 'raise' | 'danger';

export type CardLevel = 2 | 3 | 4;

function Heading({ level, children }: { level: CardLevel; children: ReactNode }) {
  const H = `h${level}` as 'h2' | 'h3' | 'h4';
  /* No `margin: 0` here. It was carried inline for a while and it was dead
     weight — `webapp.css`'s reset already zeroes every heading margin, and the
     inline copy was the one thing stopping a converted `<h2 class="card__t">`
     from being byte-identical to the markup it replaced. */
  return <H className="card__t">{children}</H>;
}

/**
 * The head, when a card needs to say more about it than `title` can carry.
 * Anything passed as children sits between the title and the actions, which is
 * where the reference puts a tag or a count.
 */
export function CardHead({
  title,
  level = 2,
  actions,
  className,
  style,
  children,
}: {
  title?: ReactNode;
  level?: CardLevel;
  /** Buttons on the right of the head. */
  actions?: ReactNode;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div className={['card__hd', className].filter(Boolean).join(' ')} style={style}>
      {title ? <Heading level={level}>{title}</Heading> : null}
      {children}
      {actions ? <span className="card__acts">{actions}</span> : null}
    </div>
  );
}

/**
 * A body. A card may have more than one, and `divided` is the rule between
 * them — the thing the docstring above has always claimed a card does and the
 * stylesheet never carried. Three classes in `app.css` were each restating
 * `border-top:1px solid var(--tx-line)` for exactly this, one of them carrying
 * nothing else at all.
 *
 * `tone` is a body that is a RECEIPT: what the action just did, in ok or
 * danger, with the small print inheriting the colour rather than staying grey.
 */
export type CardBodyTone = 'ok' | 'bad';

export function CardBody({
  flush,
  divided,
  tone,
  className,
  style,
  children,
}: {
  /** No padding — for a table or a list that reaches the card's edges. */
  flush?: boolean;
  /** A rule above it, for a body that follows another. */
  divided?: boolean;
  tone?: CardBodyTone;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div
      className={[
        'card__b',
        flush ? 'card__b--flush' : null,
        divided ? 'card__b--divided' : null,
        tone ? `card__b--${tone}` : null,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      {children}
    </div>
  );
}

/**
 * A band of controls between the head and a flush table — the payments card's
 * filter chips. Not a body: the table below it is the body, and this still owes
 * the card the same left edge, which is what `.card__band` is for.
 */
export function CardBand({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div className={['card__band', className].filter(Boolean).join(' ')} style={style}>
      {children}
    </div>
  );
}

/**
 * The head's mirror, on the other edge.
 *
 * A card whose body SCROLLS cannot keep its controls in the body: the workout
 * console's entry card is the pane a trainer types in, and the two things at
 * the end of it — the button that writes the set and the clock that says when
 * the next one starts — were the first two things to scroll away. A foot sits
 * outside the body, so the body is free to be the scrollport.
 *
 * `margin-top:auto` in the stylesheet is what pins it to the bottom of a card
 * taller than its content. In an ordinary auto-height card it does nothing, so
 * a foot is also just "a row of controls under a rule" and costs the call-site
 * nothing to adopt.
 */
export function CardFoot({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div className={['card__ft', className].filter(Boolean).join(' ')} style={style}>
      {children}
    </div>
  );
}

const PARTS = new Set<unknown>([CardHead, CardBody, CardBand, CardFoot]);

export function Card({
  as: As = 'div',
  title,
  level = 2,
  aside,
  actions,
  tone,
  flush,
  bare,
  className,
  style,
  children,
}: {
  /**
   * The element. `div` unless the call-site was already a `<section>` — nine of
   * them are, and a nameless `<section>` is exposed as a generic container by
   * every browser, so this preserves the markup rather than changing it. Not a
   * general escape hatch: those two are the whole union.
   */
  as?: 'div' | 'section';
  /** Omitted for a card that is a control rather than a region. */
  title?: ReactNode;
  level?: CardLevel;
  /** A tag or count beside the title. */
  aside?: ReactNode;
  /** Buttons on the right of the head. */
  actions?: ReactNode;
  tone?: CardTone;
  /** The body takes no padding — for a table or a list that reaches the edges. */
  flush?: boolean;
  /**
   * No body at all: the children ARE the card's ground.
   *
   * `FirstRun` is the case — one `.empty` filling the card, which brings its
   * own `64px 24px`. Without this the auto-wrap adds a `.card__b` around it and
   * the padding lands twice. Needed only when the children include none of the
   * parts below, since those already say the call-site is composing.
   */
  bare?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const cls = ['card', tone ? `card--${tone}` : null, className].filter(Boolean).join(' ');

  /* Composed form: the call-site brought its own parts, so this adds nothing
     but the outer element. Checked by identity against the part components
     rather than by display name, which survives minification. */
  const composed = Children.toArray(children).some(
    (child) => isValidElement(child) && PARTS.has(child.type),
  );

  if (composed || bare) {
    return (
      <As className={cls} style={style}>
        {children}
      </As>
    );
  }

  return (
    <As className={cls} style={style}>
      {title || actions ? (
        <CardHead title={title} level={level} actions={actions}>
          {aside}
        </CardHead>
      ) : null}
      {children ? <CardBody flush={flush}>{children}</CardBody> : null}
    </As>
  );
}

Card.Head = CardHead;
Card.Body = CardBody;
Card.Band = CardBand;
Card.Foot = CardFoot;
