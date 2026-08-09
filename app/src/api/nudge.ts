import { api } from './client';

export interface NudgeResult {
  nudgeId: string;
  whatsappUrl: string | null;
  message: string;
}

export async function sendNudge(clientId: string, templateName: string): Promise<NudgeResult> {
  const { data } = await api.post<NudgeResult>(`/v1/clients/${clientId}/nudge`, { templateName });
  return data;
}

export async function getClientReport(clientId: string): Promise<string> {
  const { data } = await api.get<{ report: string }>(`/v1/clients/${clientId}/report`);
  return data.report;
}
