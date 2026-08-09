import { api } from './client';

// ── Trainer profile ────────────────────────────────────────────────────────

export interface TrainerProfile {
  id: string;
  phone: string;
  name: string;
  upiVpa: string | null;
}

export async function getTrainerProfile(): Promise<TrainerProfile> {
  const { data } = await api.get<TrainerProfile>('/v1/trainers/me');
  return data;
}

export async function updateTrainerProfile(patch: { name?: string; upiVpa?: string }): Promise<TrainerProfile> {
  const { data } = await api.patch<TrainerProfile>('/v1/trainers/me', patch);
  return data;
}

// ── Packages ───────────────────────────────────────────────────────────────

export interface PackageResponse {
  id: string;
  clientId: string;
  type: string;
  sessionsTotal: number | null;
  sessionsRemaining: number | null;
  amount: number;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  createdAt: number;
  updatedAt: number;
}

export async function listPackages(clientId: string): Promise<PackageResponse[]> {
  const { data } = await api.get<PackageResponse[]>(`/v1/clients/${clientId}/packages`);
  return data;
}

export async function createPackageApi(
  clientId: string,
  input: {
    type: string;
    sessionsTotal?: number;
    amount: number;
    startDate?: string;
    endDate?: string;
  },
): Promise<PackageResponse> {
  const { data } = await api.post<PackageResponse>(`/v1/clients/${clientId}/packages`, input);
  return data;
}

// ── Payments ───────────────────────────────────────────────────────────────

export interface PaymentResponse {
  id: string;
  clientId: string;
  packageId: string;
  amount: number;
  currency: string;
  method: string;
  collectedBy: string;
  status: string;
  upiReference: string | null;
  paidAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export async function listPayments(packageId: string): Promise<PaymentResponse[]> {
  const { data } = await api.get<PaymentResponse[]>(`/v1/packages/${packageId}/payments`);
  return data;
}

export async function confirmPaymentApi(
  paymentId: string,
  upiReference?: string,
): Promise<PaymentResponse> {
  const { data } = await api.patch<PaymentResponse>(`/v1/payments/${paymentId}/confirm`, {
    upiReference: upiReference ?? null,
  });
  return data;
}
