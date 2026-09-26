'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import type { ProgressRange } from '@/lib/log/log';
import { DEFAULT_RANGE, RANGE_LABEL, readRange } from '@/lib/portal/range';
import { Chip } from '@/web-components/ui/Chip';

/**
 * §3's range chips — *8 weeks · 6 months · Since you started*.
 *
 * ── THE RANGE IS IN THE URL, WHICH IS THE TRAINER HALF'S OWN RULE ────────────
 *
 * `AGENTS.md` states it for the same control on the same client's data, one
 * screen over: *"`range` and `focus` stay in the query string — a chosen range
 * is a PLACE, and a trainer showing a client six months should be able to send
 * that link."* It is at least as true here: the client is the one who might
 * want to show somebody, and the page is `force-dynamic` already, so the round
 * trip buys a real re-derivation rather than a client-side filter over rows the
 * browser would otherwise have to hold.
 *
 * `replace` and not `push`, with `scroll: false` — the trainer's `go()` makes
 * both calls and they are right: a client who tried three ranges should press
 * Back once and leave Progress, not three times, and the chip they pressed
 * should still be under their thumb when the screen redraws.
 *
 * ── AND THE PRESSED STATE IS THE DESIGN SYSTEM'S, WHICH IS THE DIFFERENCE ────
 *
 * `components/log/Progress.tsx` draws the same three chips and overrides
 * `aria-pressed`'s appearance with an INLINE `background` / `borderColor` /
 * `color` triple — a soft accent tint where §04's own rule is a solid lime
 * fill. That is the defect the setup flow already had and had fixed: *"Step 8's
 * chips had their own pressed state … One flow, one pressed state — and on the
 * screen whose whole job is *read this back to yourself*, the unambiguous fill
 * is the better of the two."*
 *
 * This screen's whole job is read this back to yourself, so it takes the fill
 * and passes no `style` at all. The trainer's copy is left alone — it is a
 * trainer surface and this pass did not open it — but it must not be copied
 * from, which is why this note is here rather than in a commit message.
 */
export function ProgressRanges({
  choices,
}: {
  /**
   * Which ranges to draw, from `rangeChoices`. A client eight weeks in is not
   * offered *6 months*, because on their data it redraws the screen identically
   * to *Since you started* — the dead control this shell keeps deleting.
   *
   * One chip is drawn as nothing at all: a filter row whose only option is the
   * one already applied is a control that cannot do its job, which is
   * `.wsw--one`'s rule for the workspace switcher and `TopBar`'s for the bell.
   */
  choices: ProgressRange[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  /* ── THE CURRENT RANGE IS READ HERE, NOT PASSED IN ────────────────────────

     It was a prop, filled by the page from its own `searchParams`. The chips
     moved into the tab LAYOUT, and **a layout is not given `searchParams`** in
     the App Router — only pages are. Reading the same parameter through
     `useSearchParams` is the honest fix rather than threading it: this
     component was already a client component reading exactly this object to
     build the next URL, so the value it needs was in its hand the whole time.

     `readRange` is the same parser the server uses, so a hand-typed
     `?range=lifetime` marks the same chip the page renders for it. */
  const range = readRange(params.get('range') ?? undefined);

  if (choices.length < 2) return null;

  function go(next: ProgressRange) {
    const q = new URLSearchParams(params.toString());
    /* The default is not written down. `?range=all` and no parameter mean the
       same screen, and a URL that carries its own default is one that cannot be
       shortened by hand — the same call `Schedule.tsx` makes when it strips
       `?new=1` after reading it. */
    if (next === DEFAULT_RANGE) q.delete('range');
    else q.set('range', next);
    const query = q.toString();
    /* `pathname`, not `/me/progress` — the chips are drawn over four tabs now,
       and a hard-coded root would have thrown a client back to the summary
       every time they narrowed the window while reading their exercises. */
    router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
  }

  return (
    /* `.pgrange` and not `.row gap2`, which is what this was while it lived in
       the page header: `.row` is `display:flex` with NO wrap, and in the tab's
       own body the row is the portal's full width rather than the header's
       actions slot. MEASURED at 320px — the three chips need 301px against a
       296px portal, so *Since you started* ran 4px past the card column with
       nothing to scroll it. `.phfilter` makes the same declaration for the
       same reason one tab over. */
    <div className="pgrange" role="group" aria-label="How far back to look">
      {choices.map((key) => (
        <Chip
          key={key}
          pressed={range === key}
          onClick={() => go(key)}
          /* The chip's text is the label, so it needs no `aria-label` — but it
             does need the group above it, because *8 weeks* on its own says
             nothing about what eight weeks of what. */
        >
          {RANGE_LABEL[key]}
        </Chip>
      ))}
    </div>
  );
}
