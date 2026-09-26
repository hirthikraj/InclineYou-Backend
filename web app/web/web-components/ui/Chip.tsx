import Link from 'next/link';
import type { ComponentPropsWithRef, ReactNode } from 'react';

/**
 * Chip — a pressable pill: a filter, or a token.
 *
 * ── WHY IT IS A <button> AND NOT THE REFERENCE'S <span role="button"> ───────
 *
 * The design file draws `<span class="chip" role="button" aria-pressed="true">`.
 * A span with a role is reachable by a screen reader and NOT by the keyboard:
 * no tab stop, and it does not fire on Space or Enter.
 *
 * The product does not have that bug — it renders `<button className="chip">`
 * at sixty-eight of its seventy-one call-sites, and a bare `<span>` at two,
 * which are tokens rather than controls. So this component is not a fix; it is
 * the guarantee. The correct choice was being made by hand every time, and the
 * one time it is not, the drawing in the design file is what a developer copies.
 *
 * `role` and `aria-pressed` were right in the reference; only the element was
 * not. `.chip` styles a button identically because the class never depended on
 * the tag.
 *
 * ── WHY THIS ONE SPREADS DOM PROPS AND `ui/Tag.tsx` REFUSES TO ───────────────
 *
 * They look like the same pill and they are opposites. A tag is READ, so `Tag`
 * names the two harmless props it takes and shuts the door on `onClick`,
 * because a tag that can be pressed has become a chip. A chip IS pressed —
 * `onClick` is the whole point — so refusing DOM props here buys nothing and
 * costs the call-sites that legitimately need them: `role="menuitem"` on the
 * phone program's menu, `aria-haspopup` and `aria-expanded` on the two that
 * open one, `aria-label` where the pill's text is a bare number.
 *
 * ── AND A TOKEN MAY NOW BE TAKEN OFF ────────────────────────────────────────
 *
 * `.chip__x` has been in §04 since chips were drawn and NOTHING rendered it —
 * the class existed, the affordance did not, and a screen needing a removable
 * token drew a chip and put the × nowhere. `onRemove` is that affordance, and
 * the constraint it carries is the reason it is a prop here rather than a
 * second component: **a removable token is not a pressable chip.** A `<button>`
 * may not contain another interactive element, so the root becomes a `<span>`
 * and only the × is a control. `pressed` and `onClick` are refused alongside it
 * at the type level — a token that is both chosen and removable is two controls
 * in 90px with no way for a reader to tell which one they are on.
 *
 * ── TWO MODIFIERS ARE NOT PROPS, ON PURPOSE ─────────────────────────────────
 *
 * `chip--ghost` is `ghost`. `chip--sm` and `chip--active-status` are NOT typed
 * here: both are defined only in `app/styles/app.css`, and a prop in the
 * catalogue's API for a class a designer cannot reach in the design file would
 * be a lie about where that class lives. They ride `className` until somebody
 * moves the CSS — the same call as `card--pick` in `ui/Card.tsx`.
 */

type Common = {
  /** Present makes it a toggle. Absent makes it a plain token. */
  pressed?: boolean;
  ghost?: boolean;
  /** Extra classes for the call-site's own layout, and for the two app-local modifiers. */
  className?: string;
  children: ReactNode;
};

type AsButton = Common & { href?: never; onRemove?: never; removeLabel?: never } & Omit<
  ComponentPropsWithRef<'button'>,
  'className' | 'children'
>;

/**
 * A token with a × on it. The root is a `<span>`, never a control.
 *
 * `removeLabel` is required and is the accessible name of the ×: fifteen
 * buttons called *Remove* are fifteen identical controls in a screen reader's
 * list, which is the rule `CheckboxCell` and `RowMenu` already state. It is the
 * label rather than a prefix, so a call-site can say *Stop collecting body fat*
 * where *Remove body fat* would read as deleting the measurement itself.
 */
type AsToken = Common & {
  href?: never;
  pressed?: never;
  onRemove: () => void;
  removeLabel: string;
  title?: string;
  disabled?: boolean;
};

type AsLink = Common & {
  /**
   * Renders a `next/link` for an in-app path, a plain `<a>` for an off-site
   * one — the same scheme test as `Button` and `Tag`. The schedule toolbar's
   * *Hours* pill is the one that needed it, and it had been a hand-written
   * `<Link className="chip …">` for as long as the toolbar has existed.
   */
  href: string;
  pressed?: never;
} & Omit<ComponentPropsWithRef<'a'>, 'className' | 'children' | 'href'>;

export type ChipProps = AsButton | AsLink | AsToken;

/**
 * The class list, exported so the library's specimen prints the exact string a
 * call-site produces rather than a plausible-looking one.
 */
export function chipClass({ ghost, className }: { ghost?: boolean; className?: string }): string {
  return ['chip', ghost ? 'chip--ghost' : null, className].filter(Boolean).join(' ');
}

export function Chip(props: ChipProps) {
  const { ghost, className, children } = props;
  const cls = chipClass({ ghost, className });

  /* The token form, first: it is the one branch whose ROOT is not a control, so
     testing for it after the link and button branches would mean the button
     branch had already claimed every chip with a handler on it. */
  if ('onRemove' in props && props.onRemove !== undefined) {
    const { onRemove, removeLabel, title, disabled } = props;
    return (
      <span className={`${cls} chip--token`} title={title}>
        {children}
        <button
          type="button"
          className="chip__x"
          aria-label={removeLabel}
          disabled={disabled}
          onClick={onRemove}
        >
          <ExIcon />
        </button>
      </span>
    );
  }

  if ('href' in props && props.href !== undefined) {
    /* eslint-disable @typescript-eslint/no-unused-vars -- destructured only to keep
       the component's own props off the element `rest` spreads onto. */
    const { href, pressed: _p, ghost: _g, className: _c, children: _ch, ...rest } = props;
    /* eslint-enable @typescript-eslint/no-unused-vars */
    if (/^[a-z]+:|^\/\//i.test(href)) {
      return (
        <a className={cls} href={href} {...rest}>
          {children}
        </a>
      );
    }
    return (
      <Link className={cls} href={href} {...rest}>
        {children}
      </Link>
    );
  }

  /* eslint-disable @typescript-eslint/no-unused-vars -- as above. */
  const { pressed, ghost: _g, className: _c, children: _ch, type, ...rest } = props as AsButton;
  /* eslint-enable @typescript-eslint/no-unused-vars */

  /* A token — a value shown, not a control. No role, no tab stop, nothing for a
     reader to announce as pressable. The test is unchanged: a chip with neither
     a pressed state nor a handler is not a control, whatever it looks like. */
  if (pressed === undefined && !rest.onClick) {
    /* eslint-disable @typescript-eslint/no-unused-vars -- destructured only to keep
       a button's props off the span this branch renders. */
    const { onClick: _o, disabled: _d, ...spanRest } = rest;
    /* eslint-enable @typescript-eslint/no-unused-vars */
    return (
      <span className={cls} {...(spanRest as ComponentPropsWithRef<'span'>)}>
        {children}
      </span>
    );
  }

  return (
    <button type={type ?? 'button'} className={cls} aria-pressed={pressed} {...rest}>
      {children}
    </button>
  );
}

/** The ×, at the 11px the 28px pill has room for. */
function ExIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
