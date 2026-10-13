'use server';

import { revalidatePath } from 'next/cache';

import { ApiError, api } from '@/lib/http/client';

import type { AltWire, FeedbackWire, FinishedWire, LogExerciseWire, SetWire, TotalsWire } from './workout-api';

/**
 * Every write the client's workout makes (api-contract 1.2, pw-a1 … pw-a6). One result shape, and the server owns the sentence: a refusal
 * is shown as the rule that made it. A write that did not reach the server says so and says nothing was lost — the set is still on the
 * screen and one tap sends it again, which the server's idempotence makes harmless.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; message: string; code?: string };

const UNREACHABLE = 'We couldn’t reach the server. Nothing was lost — tap again when you’re back online.';

async function run<T>(call: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await call() };
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    if (e.status === null) return { ok: false, message: UNREACHABLE };
    return { ok: false, message: e.problem.detail ?? 'That didn’t save. Nothing changed — try again.', code: e.problem.code };
  }
}

/** Start, or resume: the browser mints the id, so a double tap or a second tab cannot make two logs. */
export async function startWorkout(workoutId: string): Promise<Result<{ sessionId: string }>> {
  const id = crypto.randomUUID();
  const res = await run(() => api<{ session: { id: string } }>('/v1/portal/sessions', { method: 'POST', body: { id, workoutId } }));
  if (!res.ok) return res;
  revalidatePath('/me/today');
  return { ok: true, value: { sessionId: res.value.session.id } };
}

export interface SetAnswer {
  set: SetWire;
  totals: TotalsWire;
  isBest: boolean;
  version: string;
}

/** `{ done: true }` copies the target; values adjust it; `{ done: false }` skips. */
export async function saveSet(sessionId: string, setId: string, body: { done?: boolean; loadValue?: number | null; effortValue?: number | null; rpe?: number | null }) {
  return run(() => api<SetAnswer>(`/v1/portal/sessions/${sessionId}/sets/${setId}`, { method: 'PATCH', body }));
}

export async function addSet(sessionId: string, exerciseRowId: string, body: { loadValue?: number | null; effortValue?: number | null }) {
  return run(() =>
    api<{ set: SetWire; totals: TotalsWire }>(`/v1/portal/sessions/${sessionId}/exercises/${exerciseRowId}/sets`, {
      method: 'POST',
      body: { id: crypto.randomUUID(), ...body },
    }),
  );
}

export async function savePause(sessionId: string, pausedSeconds: number) {
  return run(() => api(`/v1/portal/sessions/${sessionId}`, { method: 'PATCH', body: { pausedSeconds } }));
}

/** The swap sheet's library list, read only when it is opened. */
export async function libraryAlternatives(exerciseId: string, sessionId: string) {
  return run(async () => (await api<{ items: AltWire[] }>(`/v1/portal/exercises/${exerciseId}/alternatives?limit=8&sessionId=${sessionId}`)).items);
}

export async function swapExercise(sessionId: string, exerciseRowId: string, body: { toExerciseId: string; source: 'approved' | 'library'; reason?: 'busy' | 'pain' | 'other' }) {
  return run(() =>
    api<{ exercise: LogExerciseWire; totals: TotalsWire }>(`/v1/portal/sessions/${sessionId}/exercises/${exerciseRowId}/swap`, { method: 'POST', body }),
  );
}

export async function finishWorkout(sessionId: string, body: { effort?: 'easy' | 'right' | 'hard'; note?: string; pausedSeconds?: number }) {
  const res = await run(() => api<FinishedWire>(`/v1/portal/sessions/${sessionId}/finish`, { method: 'POST', body }));
  if (res.ok) revalidatePath('/me', 'layout');
  return res;
}

export async function saveFeedback(sessionId: string, body: { effort: 'easy' | 'right' | 'hard' | null; note: string | null }) {
  return run(() => api<FeedbackWire>(`/v1/portal/sessions/${sessionId}/feedback`, { method: 'PUT', body }));
}
