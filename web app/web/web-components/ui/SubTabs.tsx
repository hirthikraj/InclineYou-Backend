import Link from 'next/link';

import type { PageTab } from '@/components/shell/PageTabs';

/**
 * Sub-tabs — a SECOND level of tabs, where each one is a route. `.subtabs`,
 * catalogue entry `c-subtabs`.
 *
 * ── WHY IT IS NOT A SECOND `PageTabs` ───────────────────────────────────────
 *
 * `c-tabs` is the underline strip at the top of a page, and it is the right
 * component exactly once per screen: what makes it readable is that the
 * underlined word is where you are, and there is nothing above it making the
 * same claim. Draw two of them and the reader has two identical strips, one
 * under the other, with no mark anywhere saying which owns which — the lower
 * one reads as five peers of the upper one that happened to wrap.
 *
 * So the second level takes a DIFFERENT shape rather than a smaller copy of the
 * first. It is a pill row: the current tab is an ink plate, the others are
 * quiet outlines, and the whole group reads as one control sitting inside the
 * page the strip above it selected.
 *
 * ── AND WHY IT IS NOT `Segment`, WHICH IS ALREADY THAT SHAPE ────────────────
 *
 * `c-segment` is the same picture and a different promise. Its pills are
 * `<button>`s over data the page already holds — a `role="radiogroup"` with
 * roving `tabindex`, arrow keys and `aria-checked`, which is the correct
 * accessibility story for *pick one of five things in front of you* and a
 * promise this component cannot keep. These are page loads: the panel is not
 * there until the server sends it. `c-tabs`' own header settles it for the
 * strip above — *a `<nav>` of links is what these are, and a screen reader that
 * announces them as links is telling the truth about what pressing one does* —
 * and the same sentence decides it here.
 *
 * Hence `aria-current="page"` and not `aria-checked`, a `<nav>` and not a
 * `role="radiogroup"`, and one tab stop per tab: they are separate
 * destinations, and the honest count of destinations is all of them.
 *
 * ── THE COUNT IS `PageTabs`' CONTRACT, VERBATIM ─────────────────────────────
 *
 * A figure beside the label, omitted and never drawn as a zero, on the same
 * grounds: a strip that says *InclineYou templates 0* has spent a badge to
 * report that a read failed. `PageTab` is imported rather than restated so the
 * two strips cannot disagree about what a tab is.
 */
export function SubTabs({
  tabs,
  current,
  label,
  className,
}: {
  tabs: PageTab[];
  current: string;
  /**
   * What this lower strip is a set of tabs FOR, read before the first one. It
   * matters more here than on the strip above: there are two `<nav>`s on the
   * page now, and *Program shelves* is what tells a screen reader's landmark
   * list which of them is which.
   */
  label: string;
  className?: string;
}) {
  return (
    <nav className={['subtabs', className].filter(Boolean).join(' ')} aria-label={label}>
      {tabs.map(t => {
        const on = t.key === current;
        return (
          <Link
            key={t.key}
            className={on ? 'subtabs__t subtabs__t--on' : 'subtabs__t'}
            href={t.href}
            scroll={false}
            {...(on ? { 'aria-current': 'page' as const } : {})}
          >
            {t.label}
            {t.count != null && t.count > 0 && <span className="subtabs__n">{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
