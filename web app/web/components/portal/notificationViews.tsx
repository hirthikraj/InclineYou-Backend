'use client';

import { Calendar, Dumbbell, Note, Rupee, Star } from '@/components/shell/Icons';
import type { PortalNotificationWire } from '@/lib/portal/api';
import {
  CLIENT_KIND_TONE,
  clientDetailFor,
  clientHrefFor,
  clientLineFor,
  type ClientNotificationKind,
} from '@/lib/portal/notifications';
import type { NotificationView } from '@/web-components/ui/NotificationPanel';

/**
 * The client's feed, reduced to what `NotificationPanel` draws.
 *
 * `components/shell/notificationViews.tsx` is the trainer's half of this pair
 * and carries the argument for why the pair exists: the panel is one component
 * for both bells, and everything that is a decision about *whose feed this is*
 * lives out here. The two files never import each other.
 *
 * ── THE GLYPHS, AND THE ONE THAT IS FILLED ──────────────────────────────────
 *
 * Four outlines and a solid star. Every other glyph in this product is a 1.6px
 * stroke, and `best` is deliberately the exception: it is the only row on this
 * feed that is good news about the reader rather than news about their
 * arrangement, and §"Notifications" is explicit that the PR row is the one that
 * gets opened. A filled mark is the cheapest way to make it findable in a list
 * of five without giving it a louder plate than the money.
 *
 * `Record<ClientNotificationKind, …>` rather than a lookup with a fallback, so
 * a sixth kind added to the union fails the build here instead of rendering an
 * empty plate above a working sentence — the half-drawn row `lib/notifications/
 * api.ts` filters unknown kinds to avoid.
 */
const GLYPH: Record<ClientNotificationKind, React.ReactNode> = {
  note: <Note size={16} />,
  plan: <Dumbbell size={16} />,
  session: <Calendar size={16} />,
  pack: <Rupee size={16} />,
  best: <Star size={16} filled />,
};

export function clientViews(
  rows: PortalNotificationWire[],
  /**
   * The trainer's FIRST name, which four of the five rows lead with.
   *
   * Passed in rather than read here for the reason `lib/portal/api.ts` gives
   * for `getMe` being `cache()`d: the portal reads the trainer's name once per
   * request, in the layout, and a copy module that fetched its own would be a
   * second round trip to print a word the shell already has.
   */
  trainerFirst: string,
): NotificationView[] {
  return rows.map((n) => {
    const { who, said } = clientLineFor(n, trainerFirst);
    return {
      id: n.id,
      tone: CLIENT_KIND_TONE[n.kind],
      glyph: GLYPH[n.kind],
      who,
      said,
      detail: clientDetailFor(n),
      href: clientHrefFor(n.kind),
      at: n.at,
      readAt: n.readAt,
    };
  });
}

/**
 * What an empty client feed says.
 *
 * It names the trainer, which the trainer's own empty state cannot do and this
 * one must: §"Notifications" is a promise about WHERE the messages come from,
 * and the moment to make it is the moment there are none — a client whose bell
 * has been quiet for three weeks is the person most likely to wonder whether
 * this app is about to start nagging them. Saying *from Arun* in the one place
 * with nothing else to say is the cheapest version of that promise.
 */
export function clientEmpty(trainerFirst: string): { title: string; body: string } {
  return {
    title: 'Nothing yet',
    body: `When ${trainerFirst} changes your plan, moves a session or leaves you a note, it will show up here.`,
  };
}
