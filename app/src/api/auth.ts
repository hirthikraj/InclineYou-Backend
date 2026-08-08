import { api } from './client';

export interface AuthResponse {
  token: string;
  trainerId: string;
  isNewUser: boolean;
}

export function requestOtp(phone: string) {
  return api.post<void>('/v1/auth/otp/request', { phone });
}

export function verifyOtp(phone: string, otp: string) {
  return api.post<AuthResponse>('/v1/auth/otp/verify', { phone, otp });
}
