'use server';

import { revalidatePath } from 'next/cache';

import { ApiError, api } from '@/lib/http/client';

import type { AnswerWire, AssessDetailWire } from './assess-api';

/**
 * The two writes the assessments tab makes (api-contract 1.2, pa-a1 and pa-a2). The server owns every sentence a refusal needs; a write that
 * did not reach it says so and says nothing was lost — what was typed is still on the screen, and saving again is harmless.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; message: string; code?: string };

const UNREACHABLE = 'We couldn’t reach the server. Nothing was lost — what you typed is still here. Try again when you’re back online.';

async function run<T>(call: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await call() };
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    if (e.status === null) return { ok: false, message: UNREACHABLE };
    if (e.status === 412) return { ok: false, message: 'This changed on another device since you opened it. Reload to see the latest, then carry on.', code: 'PRECONDITION_FAILED' };
    return { ok: false, message: e.problem.detail ?? 'That didn’t save. Nothing changed — try again.', code: e.problem.code };
  }
}

/** Save for later (`complete: false`) or hand it in (`complete: true`). The whole entry is replaced, so the version it was drawn from rides along. */
export async function saveEntry(id: string, version: string, entry: { readings: Record<string, number>; answers: Record<string, AnswerWire> }, complete: boolean) {
  const res = await run(() =>
    api<AssessDetailWire>(`/v1/portal/assessments/${id}/entry`, { method: 'PUT', body: { ...entry, complete }, headers: { 'if-match': `"${version}"` } }),
  );
  if (res.ok && complete) revalidatePath('/me', 'layout');
  return res;
}

/** Start one of the templates the trainer offers. The browser mints the id; a retry or a second tap opens the one already waiting. */
export async function startAssessment(templateId: string): Promise<Result<{ id: string }>> {
  const res = await run(() => api<AssessDetailWire>('/v1/portal/assessments', { method: 'POST', body: { id: crypto.randomUUID(), templateId } }));
  if (!res.ok) return res;
  revalidatePath('/me/progress/assessments');
  return { ok: true, value: { id: res.value.id } };
}
