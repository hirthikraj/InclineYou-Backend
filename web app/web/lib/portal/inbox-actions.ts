'use server';

import { revalidatePath } from 'next/cache';

import { ApiError, api } from '@/lib/http/client';

/**
 * The inbox's reads and writes from the browser (api-contract 1.2, pi-l3, pi-a1, pi-a2). The bell sits in a bar every screen draws, so it is read
 * from the client; a failure is `null` and the bell then shows nothing, which is honest — a missing count is a missing number, where a wrong one
 * would send somebody looking for something that is not there.
 */
export interface NoticeWire {
  id: string;
  kind: 'note' | 'plan' | 'session' | 'pack' | 'best' | 'assessment' | 'reminder' | string;
  text: string;
  at: number;
  readAt: number | null;
  sessionId: string | null;
  subjectAt: number | null;
  amount: number | null;
}

export interface NoticesWire {
  items: NoticeWire[];
  unreadCount: number;
  nextCursor: string | null;
}

export async function loadNotices(): Promise<NoticesWire | null> {
  try {
    return await api<NoticesWire>('/v1/portal/notices?limit=20');
  } catch (e) {
    if (e instanceof ApiError) return null;
    throw e;
  }
}

/** Opening the bell is what clears the count: the unread ones it just showed are marked read. Best effort — a failed mark leaves the badge as it was, which is true. */
export async function markNoticesRead(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  try {
    await api('/v1/portal/notices/read', { method: 'POST', body: { ids: ids.slice(0, 100) } });
    return true;
  } catch (e) {
    if (e instanceof ApiError) return false;
    throw e;
  }
}

/** Opening a message is what marks it read; the trainer sees that it was. Idempotent on the server. */
export async function markMessageRead(id: string): Promise<boolean> {
  try {
    await api(`/v1/portal/messages/${id}/read`, { method: 'POST', body: {} });
    revalidatePath('/me', 'layout');
    return true;
  } catch (e) {
    if (e instanceof ApiError) return false;
    throw e;
  }
}
