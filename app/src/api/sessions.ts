import { api } from './client';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SessionResponse {
  id: string;
  clientId: string;
  programId: string | null;
  scheduledAt: number;        // epoch millis
  durationMinutes: number | null;
  status: string;
  notes: string | null;
  dayLabel: string | null;
  templateDay: number | null;
  /**
   * 'floor' | 'remote', or null for "use the client's usual mode".
   *
   * Optional in the type as well as nullable: a server from before V9 doesn't
   * send the field at all, and a home screen that crashed on an older backend
   * would be a worse failure than one that shows a session as floor.
   */
  deliveryMode?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SetResponse {
  id: string;
  workoutSessionId: string;
  exerciseId: string;
  setNumber: number;
  loadKg: number | null;
  reps: number | null;
  rpe: number | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

// ── Scheduled sessions ─────────────────────────────────────────────────────

export async function listSessions(
  clientId?: string,
  from?: number,
  to?: number,
): Promise<SessionResponse[]> {
  const params: Record<string, string> = {};
  if (clientId) params.clientId = clientId;
  if (from != null) params.from = String(from);
  if (to != null) params.to = String(to);
  const { data } = await api.get<SessionResponse[]>('/v1/sessions', { params });
  return data;
}

export async function createSession(input: {
  clientId: string;
  scheduledAt: number;
  durationMinutes?: number;
  programId?: string;
  notes?: string;
  dayLabel?: string;
  templateDay?: number;
  /** Omit to inherit the client's usual mode, which is almost always right. */
  deliveryMode?: 'floor' | 'remote';
}): Promise<SessionResponse> {
  const { data } = await api.post<SessionResponse>('/v1/sessions', input);
  return data;
}

export async function updateSession(
  id: string,
  patch: {
    scheduledAt?: number;
    durationMinutes?: number;
    status?: string;
    notes?: string;
    /** Empty string clears the override and hands the session back to the client's mode. */
    deliveryMode?: 'floor' | 'remote' | '';
  },
): Promise<SessionResponse> {
  const { data } = await api.put<SessionResponse>(`/v1/sessions/${id}`, patch);
  return data;
}

export async function markSessionDone(
  id: string,
  workoutNotes?: string,
): Promise<{ workoutSessionId: string }> {
  const { data } = await api.post(`/v1/sessions/${id}/done`, { workoutNotes });
  return data;
}

// ── Set logs ──────────────────────────────────────────────────────────────

export async function listSets(workoutId: string): Promise<SetResponse[]> {
  const { data } = await api.get<SetResponse[]>(`/v1/workouts/${workoutId}/sets`);
  return data;
}

export async function addSet(
  workoutId: string,
  input: {
    exerciseId: string;
    setNumber: number;
    loadKg?: number;
    reps?: number;
    rpe?: number;
    notes?: string;
  },
): Promise<SetResponse> {
  const { data } = await api.post<SetResponse>(`/v1/workouts/${workoutId}/sets`, input);
  return data;
}

export async function updateSet(
  workoutId: string,
  setId: string,
  patch: { loadKg?: number; reps?: number; rpe?: number; notes?: string },
): Promise<SetResponse> {
  const { data } = await api.put<SetResponse>(
    `/v1/workouts/${workoutId}/sets/${setId}`,
    patch,
  );
  return data;
}

export async function deleteSet(workoutId: string, setId: string): Promise<void> {
  await api.delete(`/v1/workouts/${workoutId}/sets/${setId}`);
}
