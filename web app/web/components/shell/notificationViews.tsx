'use client';

import { detailFor, lineFor } from '@/lib/notifications/copy';
import { KIND_TONE, hrefFor, type Notification, type NotificationKind } from '@/lib/notifications/types';
import type { NotificationView } from '@/web-components/ui/NotificationPanel';

import { Bars, Calendar, Rupee, Team } from './Icons';

/**
 * The trainer's feed, reduced to what `NotificationPanel` draws.
 *
 * ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────
 *
 * Everything in it used to be inside the panel, and it moved out the day the
 * client portal got a bell. The panel's own header carries the argument in
 * full; the short version is that a plate tone, a glyph, a sentence and an href
 * are all decisions about **whose feed this is**, and a design-system component
 * that knew four trainer kinds could not draw five client ones without either
 * growing a second switch or being copied. Copying it would have put twelve BEM
 * classes in two files, which is the drift the design system exists to prevent.
 *
 * So the split is: this file knows what a `payment` is, the panel knows what a
 * row is. `components/portal/notificationViews.tsx` is the same file for the
 * other half, and the two never import each other.
 *
 * ── AND THE GLYPHS ARE HERE RATHER THAN IN `lib/` ───────────────────────────
 *
 * `lineFor`, `detailFor`, `KIND_TONE` and `hrefFor` all live in
 * `lib/notifications/`, and the obvious tidiness is to put the map beside them.
 * It cannot go there: a glyph is JSX, `lib/` is `.ts` throughout on this half,
 * and a single `.tsx` in it would make the boundary "mostly data" rather than
 * "data". The map is three lines of markup over a union the compiler checks —
 * `Record<NotificationKind, …>` fails to build the moment a fifth kind lands
 * without an icon, which is the property worth keeping.
 */
const GLYPH: Record<NotificationKind, React.ReactNode> = {
  payment: <Rupee size={16} />,
  cancelled: <Calendar size={16} />,
  metric: <Bars size={16} />,
  team: <Team size={16} />,
};

export function trainerViews(rows: Notification[]): NotificationView[] {
  return rows.map((n) => {
    const { who, said } = lineFor(n);
    return {
      id: n.id,
      tone: KIND_TONE[n.kind],
      glyph: GLYPH[n.kind],
      who,
      said,
      detail: detailFor(n),
      href: hrefFor(n),
      at: n.at,
      readAt: n.readAt,
    };
  });
}

/**
 * What an empty trainer feed says.
 *
 * Named the three kinds that actually reach it, because the sentence's job is
 * to make "nothing has happened" checkable: somebody who knows a payment landed
 * this morning and reads this line knows the bell is broken rather than quiet.
 * `metric` is left out on purpose — a client's weight is the one of the four a
 * trainer would not go looking for here, and a four-item list stops being read.
 */
export const TRAINER_EMPTY = {
  title: 'Nothing has happened',
  body: 'Payments, cancellations and changes your team makes will appear here.',
};
