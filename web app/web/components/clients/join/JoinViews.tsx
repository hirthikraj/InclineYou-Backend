'use client';

import { useEffect, useRef } from 'react';

import { Chip } from '@/web-components/ui/Chip';

/**
 * The Joining views as links, and on a phone the row scrolls sideways — so the chosen one
 * can sit off the edge, and a trainer on *Declined* could not see that Declined was chosen
 * (24 Nov 2026). On mount the ROW's own scroll brings it into view. `scrollLeft` and not
 * `scrollIntoView`, which would also move every scrollable ancestor.
 */
export function JoinViews({
  views,
  current,
}: {
  views: { key: string; label: string; href: string; count: number }[];
  current: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const row = ref.current;
    const on = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !on || row.scrollWidth <= row.clientWidth) return;
    const left = on.offsetLeft - row.offsetLeft;
    const right = left + on.offsetWidth;
    if (left < row.scrollLeft || right > row.scrollLeft + row.clientWidth) {
      row.scrollLeft = Math.max(0, right - row.clientWidth + 24);
    }
  }, [current]);

  return (
    <nav className="jn-views" aria-label="Which people" ref={ref}>
      {views.map((v) => (
        <Chip key={v.key} href={v.href} aria-current={v.key === current ? 'page' : undefined}>
          {v.label}
          {v.count > 0 && <span className="rail__n">{v.count}</span>}
        </Chip>
      ))}
    </nav>
  );
}
