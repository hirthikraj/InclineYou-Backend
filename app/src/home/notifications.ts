/**
 * The notification centre (3b/3c), derived rather than stored.
 *
 * There is no notifications table and there deliberately isn't one: every line
 * in this list is already a fact in local storage — a payment landed, a record
 * was broken, a client went quiet — and a second copy of those facts would be
 * one more thing that can disagree with the first. Everfit is the only
 * competitor with a real notification centre; this is that model, derived.
 *
 * Read state is the only thing that has to be remembered, and it is a single
 * timestamp: everything older than the mark has been seen. That survives a
 * reinstall badly and that is fine — the worst case is a trainer sees three
 * rows in full ink that they had already read.
 *
 * The empty state carries the promise the whole feature depends on: we only
 * ping you for things that need a decision. That sentence is what stops people
 * muting the app in week two.
 */

import * as SecureStore from 'expo-secure-store';
import type { Deck } from './deck';
import { relativePast } from './time';

const READ_KEY = 'trainx_notifications_read_at';

export type NotifCategory = 'payments' | 'training';

export interface NotifItem {
  key: string;
  category: NotifCategory;
  /** Bolded lead — the client. */
  subject?: string;
  /** The rest of the sentence. */
  body: string;
  at: number;
  read: boolean;
  clientId?: string;
}

export interface NotifFeed {
  items: NotifItem[];
  unread: number;
  counts: { all: number; payments: number; training: number };
}

/**
 * Deck facts, turned into sentences and dated.
 *
 * Attention items come in as well as activity, because "Arjun hasn't logged a
 * workout in 9 days" is exactly the kind of thing a trainer wants to find
 * again later — and each one is dated from when the condition became true, not
 * from now, so opening the app twice does not re-announce it.
 */
export function buildNotifications(deck: Deck, readAt: number): NotifFeed {
  const items: NotifItem[] = [];

  for (const a of deck.activity) {
    const payment = a.target.kind === 'payment';
    items.push({
      key: `activity:${a.key}`,
      category: payment ? 'payments' : 'training',
      subject: a.clientName,
      body: a.tag?.label === 'PR' ? `${a.body} — and hit a PR` : a.body,
      at: a.at,
      read: a.at <= readAt,
      clientId: a.clientId,
    });
  }

  for (const item of deck.attention) {
    items.push({
      key: `attention:${item.key}`,
      category: item.kind === 'overdue' ? 'payments' : 'training',
      subject: item.clientName,
      body: sentence(item.kind, item.line),
      at: item.at,
      read: item.at <= readAt,
      clientId: item.clientId,
    });
  }

  items.sort((a, b) => b.at - a.at);

  return {
    items,
    unread: items.filter((i) => !i.read).length,
    counts: {
      all: items.length,
      payments: items.filter((i) => i.category === 'payments').length,
      training: items.filter((i) => i.category === 'training').length,
    },
  };
}

/**
 * The alert lines are written to sit in a row beside a name. A notification is
 * a sentence, so each one gets a verb — and the pack lines get rephrased
 * rather than lowercased, because "Divya Menon pack ends in 2 sessions" is not
 * something anyone would write.
 */
function sentence(kind: string, line: string): string {
  if (kind === 'overdue') return `has ${line.replace(' · ', ' for ')}`;
  if (kind === 'quiet') return line.replace(/^No workout logged/, "hasn't logged a workout");

  const ending = line.match(/^Pack ends in (\d+) session/);
  if (ending) {
    const n = Number(ending[1]);
    return `has ${n} session${n === 1 ? '' : 's'} left in their pack`;
  }
  return 'has run out of sessions';
}

export function stampFor(at: number, now: number): string {
  return relativePast(at, now);
}

export async function loadReadAt(): Promise<number> {
  try {
    const raw = await SecureStore.getItemAsync(READ_KEY);
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export async function markAllRead(at: number = Date.now()): Promise<void> {
  try {
    await SecureStore.setItemAsync(READ_KEY, String(at));
  } catch {
    // Losing the mark costs a re-read, not data.
  }
}
