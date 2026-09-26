import Link from 'next/link';
import type { ComponentPropsWithRef, ReactNode } from 'react';

/**
 * Button — the one control allowed to change data.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * `.btn` was written as raw markup at 340 call-sites across 81 files. Every one
 * of them was a chance to forget `type="button"`, to pair two primaries in one
 * row, or to give an icon-only button no accessible name — and the component
 * library had no way to show the real thing, only a hand-copied picture of it.
 *
 * This is the single definition both halves import: the application renders it,
 * and `/library` renders the same import. A change here reaches the running
 * product and its documentation in the same save, which is the only arrangement
 * where the two cannot drift.
 *
 * ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
 *
 * It does not own the styling. `.btn` and its modifiers stay in the design
 * system, where `sync-design.mjs` can carry them to both stylesheets. This file
 * decides which classes are legal and in what combination; §04 decides what
 * they look like. Putting colour here would put it out of the designer's reach.
 *
 * ── WHY THE PROPS CARRY A `ref` ─────────────────────────────────────────────
 *
 * `ComponentPropsWithoutRef` was the original, and it turned out to refuse the
 * three call-sites that need the element itself: the modal footer's *Got it*
 * (focus lands there on open), the exercise panel's close, and the payment
 * row's menu trigger (focus returns to it on close). All three are focus
 * management, which is the one thing a button cannot delegate. React 19 passes
 * `ref` as an ordinary prop to a function component, so it rides through
 * `...rest` onto the element with no `forwardRef` and no change to the DOM.
 */

/** Emphasis. A hierarchy, not a palette — two primaries in a row and neither is. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/** 40px, 34px, 28px. `sm` belongs in a table row or a card header, never alone in a toolbar. */
export type ButtonSize = 'lg' | 'md' | 'sm';

type Common = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading glyph. 15px at stroke-width 1.6 — a real glyph, never decoration. */
  icon?: ReactNode;
  /**
   * Full width. For the only action in a column that has an edge — a filter
   * sheet's foot, a panel's single confirm, an empty state's one way out.
   *
   * It was `.pg__wide` in `app.css` and every call-site was already a `<Button>`,
   * which is what made it the button's modifier rather than the page's.
   */
  wide?: boolean;
  /** Extra classes for the call-site's own layout. Never for restyling the button. */
  className?: string;
  children?: ReactNode;
};

/**
 * The icon-only form, split out at the type level rather than checked at runtime.
 *
 * `.btn--icon` drops the label, so the accessible name has to come from
 * somewhere else or the control is a mystery to a screen reader. Making `label`
 * required on this branch is why: an icon button with no name will not compile.
 */
type IconOnly = Common & {
  iconOnly: true;
  /** The name the label would have carried. Becomes `aria-label` and the tooltip. */
  label: string;
  children?: never;
};

type WithLabel = Common & { iconOnly?: false; label?: never };

type AsButton = (IconOnly | WithLabel) & {
  href?: never;
  /**
   * `.btn--loading` exists in §04 and no call-site in the product uses it. It is
   * exposed rather than dropped because a web app that writes straight to the
   * server does have requests in flight — the design file's note that a save has
   * already succeeded by the time the pointer lifts was written for the offline
   * phone, and the web half reversed that.
   */
  loading?: boolean;
} & Omit<ComponentPropsWithRef<'button'>, 'className' | 'children'>;

type AsLink = (IconOnly | WithLabel) & {
  /** Renders a `next/link`. Sixty-three call-sites already do this by hand. */
  href: string;
  loading?: never;
} & Omit<ComponentPropsWithRef<'a'>, 'className' | 'children' | 'href'>;

export type ButtonProps = AsButton | AsLink;

/**
 * The class list, exported so the library's specimen can print the exact string
 * a call-site produces instead of a plausible-looking one.
 */
export function buttonClass({
  variant = 'secondary',
  size = 'md',
  iconOnly,
  wide,
  loading,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  wide?: boolean;
  loading?: boolean;
  className?: string;
}): string {
  return [
    'btn',
    `btn--${variant}`,
    size === 'md' ? null : `btn--${size}`,
    iconOnly ? 'btn--icon' : null,
    wide ? 'btn--wide' : null,
    loading ? 'btn--loading' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export function Button(props: ButtonProps) {
  const { variant = 'secondary', size = 'md', icon, wide, className, children, label, iconOnly } = props;

  const cls = buttonClass({
    variant,
    size,
    iconOnly,
    wide,
    loading: 'loading' in props ? props.loading : false,
    className,
  });

  /* The label is the accessible name in both forms; only the icon-only branch
     has to say it out loud, because its text node is gone. */
  const body = (
    <>
      {icon}
      {iconOnly ? null : children}
    </>
  );

  if ('href' in props && props.href !== undefined) {
    /* eslint-disable @typescript-eslint/no-unused-vars -- destructured only to keep
       the component's own props off the DOM element `rest` spreads onto. */
    const { href, variant: _v, size: _s, icon: _i, wide: _w, className: _c, children: _ch, label: _l, iconOnly: _io, ...rest } = props;
    const shared = {
      className: cls,
      'aria-label': iconOnly ? label : undefined,
      title: iconOnly ? label : undefined,
      ...rest,
    };

    /* An off-site destination is a plain anchor. `next/link` would render one
       anyway, but it also prefetches, and prefetching wa.me fires a request at
       WhatsApp every time a queue row scrolls into view. The scheme test is the
       whole condition: everything the router can serve starts with a slash. */
    if (/^(?:[a-z]+:)?\/\//i.test(href) || /^(?:mailto|tel):/i.test(href)) {
      return (
        <a href={href} {...shared}>
          {body}
        </a>
      );
    }

    return (
      <Link href={href} {...shared}>
        {body}
      </Link>
    );
  }

  /* eslint-disable @typescript-eslint/no-unused-vars -- destructured only to keep
     the component's own props off the DOM element `rest` spreads onto. */
  const {
    variant: _v,
    size: _s,
    icon: _i,
    wide: _w,
    className: _c,
    children: _ch,
    label: _l,
    iconOnly: _io,
    loading: _ld,
    type,
    ...rest
  } = props as AsButton;

  return (
    <button
      /* Defaulted, not left to the call-site. A bare <button> inside a <form>
         submits it, and that has been the shape of this bug everywhere it has
         appeared. A call-site that wants a submit still says so. */
      type={type ?? 'button'}
      className={cls}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      aria-busy={'loading' in props && props.loading ? true : undefined}
      {...rest}
    >
      {body}
    </button>
  );
}
