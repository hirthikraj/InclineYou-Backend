'use server';

import { revalidatePath } from 'next/cache';

import { api, ApiError } from '@/lib/http/client';
import { isUpiFormat } from '@/lib/setup/upi';
import type { BusinessWire, BusinessWrite, PaymentSetupWrite } from './types';

export type SaveBusinessResult = { ok: true; business: BusinessWire } | { ok: false; message: string };

/** bz-a2 — the whole form. The shape checks the browser can answer are answered here first; the server has the last word. */
export async function saveBusiness(write: BusinessWrite): Promise<SaveBusinessResult> {
  if (!write.name.trim()) return { ok: false, message: 'Your business needs a name.' };
  if (write.upiVpa && !isUpiFormat(write.upiVpa)) {
    return { ok: false, message: 'That doesn’t look like a UPI ID — it should look like name@bank.' };
  }
  try {
    const business = await api<BusinessWire>('/v1/business', { method: 'PUT', body: write });
    // The workspace switcher and every screen that greets the practice by name read the workspace's name.
    revalidatePath('/', 'layout');
    return { ok: true, business };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === null) return { ok: false, message: 'We couldn’t reach the server. Nothing was saved.' };
    if (error.problem.code === 'BUSINESS_OWNER_ONLY') return { ok: false, message: 'Only the owner of this workspace can change its business.' };
    if (error.status === 401) return { ok: false, message: 'Your session expired. Sign in again.' };
    return { ok: false, message: error.problem.detail ?? 'That didn’t save. Nothing changed.' };
  }
}

/** bz-a4 — Business → Payment setup: the UPI ID clients pay and the part-payment switch. Owner-only, like the rest. */
export async function savePaymentSetup(write: PaymentSetupWrite): Promise<SaveBusinessResult> {
  if (write.upiVpa && !isUpiFormat(write.upiVpa)) {
    return { ok: false, message: 'That doesn’t look like a UPI ID — it should look like name@bank.' };
  }
  try {
    const business = await api<BusinessWire>('/v1/business/payments', { method: 'PUT', body: write });
    revalidatePath('/business', 'layout');
    revalidatePath('/settings', 'layout');
    return { ok: true, business };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === null) return { ok: false, message: 'We couldn’t reach the server. Nothing was saved.' };
    if (error.problem.code === 'BUSINESS_OWNER_ONLY') return { ok: false, message: 'Only the owner of this workspace can change how clients pay.' };
    if (error.status === 401) return { ok: false, message: 'Your session expired. Sign in again.' };
    return { ok: false, message: error.problem.detail ?? 'That didn’t save. Nothing changed.' };
  }
}
