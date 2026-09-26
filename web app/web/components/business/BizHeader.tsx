'use client';

import { PeriodPicker } from '@/components/money/PeriodPicker';
import { Button } from '@/web-components/ui/Button';
import { PageHeader } from '@/web-components/ui/PageHeader';
import { usePeriodScope } from './PeriodScope';

/**
 * THE HEADER THE SIX BUSINESS PAGES SHARE — and what it no longer carries.
 *
 * ── THE TAB STRIP IS GONE FROM IT, WHICH IS THE WHOLE POINT ──────────────────
 *
 * This is `Business.tsx`'s `.ph` block, lifted out and made a component, minus
 * the `<PageTabs>` that used to sit under it. The seven tabs are six rows in the
 * section pane beside the rail now, and `components/shell/nav.tsx` carries the
 * argument for why a section's PAGES belong in a column and a page's VIEWS
 * belong in a strip. What is left here is the title, the line under it, and the
 * two controls that act on whatever page is open.
 *
 * ── THE TITLE IS THE PAGE AND NOT THE SECTION, WHICH REVERSES A DECISION ─────
 *
 * The old screen drew `Business` as its `<h1>` on all seven tabs, deliberately:
 * *"the title cannot change per tab — Business is the destination's name on the
 * rail and in the bar, and a page that renamed itself per tab would give the
 * trainer a different answer to 'where am I' than the thing they clicked."*
 *
 * That was right about a tab and it is wrong about a page. The pane now draws
 * the word *Business* as its own heading, permanently, two inches to the left —
 * so the `<h1>` repeating it was the second copy, and the page had no heading of
 * its own at all. Each page names itself here; the section names itself in the
 * pane; nothing is stated twice.
 *
 * ── AND THE EXPORT IS OPTIONAL BECAUSE TWO PAGES HAVE NOTHING TO EXPORT ──────
 *
 * Packages is a price list, which is not a thing a chartered accountant is sent,
 * and the Overview is a set of summaries whose rows all live on a page that has
 * its own export. Passing no `onExport` draws no button, rather than drawing a
 * disabled one — a control that can never be pressed is worse than an absent one
 * because it invites the press.
 */
export function BizHeader({
  title,
  subtitle,
  showPeriod = true,
  onExport,
  exportLabel = 'Export for my CA',
}: {
  title: string;
  subtitle: React.ReactNode;
  /**
   * False on the pages that are not about a window: the price list has no
   * period at all, and GST is a rolling twelve months against a statutory
   * threshold, so a picker above either offers a choice that changes nothing on
   * the screen. `tabs.ts`'s `PERIODLESS_TABS` said the same thing about the same
   * three pages; it is a prop now because the pages are separate files.
   */
  showPeriod?: boolean;
  onExport?: () => void;
  exportLabel?: string;
}) {
  const { period, setPeriod, now } = usePeriodScope();

  return (
    /* `.ph--named` stands the `<h1>` down where the top bar already says the
       screen — and CLIPS it rather than dropping it, which is trap 5 and the
       reason `PageHeader` is the right component here rather than a hand-written
       block that would have to remember the same thing.

       `.ph--biz` is a scope rather than a look: below 900px it lets `.ph__id`
       shrink to a zero basis so the picker and the export share the subtitle's
       line instead of taking a second one. See app.css. */
    <PageHeader
      className="ph--named ph--biz"
      title={title}
      sub={subtitle}
      actions={
        <>
          {showPeriod && (
            <PeriodPicker period={period} nowMs={now} onChange={setPeriod} />
          )}
          {onExport && (
            <Button variant="secondary" className="biz__export" onClick={onExport}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 4v11"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 19.5h15"/>
              </svg>
              {/* In a `<span>` so the phone can CLIP it rather than drop it.
                  Below 900px this button is a 44px glyph and the label is its
                  only text, therefore its accessible name — `display:none` would
                  take it out of the accessibility tree as well as the layout,
                  leaving an icon announced as "button". */}
              <span>{exportLabel}</span>
            </Button>
          )}
        </>
      }
    />
  );
}
