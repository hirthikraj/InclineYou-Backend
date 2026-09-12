import 'server-only';

import { getToken } from '@/lib/auth/session';

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';
const TIMEOUT_MS = 8_000;

export class ExercisesApiError extends Error {
  constructor(readonly status: number | null) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'ExercisesApiError';
  }
}

export interface ExerciseWire {
  id: string;
  name: string;
  muscleGroup: string | null;
  bodyPart: string | null;
  target: string | null;
  equipment: string | null;
  movementPattern: string | null;
  description: string | null;
  level: string | null;
  isCustom: boolean;
}

export interface ExercisesMeta {
  muscleGroups: string[];
  bodyParts: string[];
  targets: string[];
  equipment: string[];
  levels: string[];
}

export interface ExercisesPage {
  exercises: ExerciseWire[];
  total: number;
}

export interface ExerciseSearchParams {
  q?: string;
  muscleGroup?: string;
  equipment?: string;
  page?: number;
  size?: number;
}

async function authedGet<T>(path: string): Promise<T> {
  const token = await getToken();
  if (!token) throw new ExercisesApiError(401);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ExercisesApiError(null);
  }

  if (!res.ok) throw new ExercisesApiError(res.status);
  return res.json() as Promise<T>;
}

export async function getExercises(params: ExerciseSearchParams = {}): Promise<ExercisesPage> {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.muscleGroup) qs.set('muscleGroup', params.muscleGroup);
  if (params.equipment) qs.set('equipment', params.equipment);
  if (params.page !== undefined) qs.set('page', String(params.page));
  if (params.size !== undefined) qs.set('size', String(params.size));

  const query = qs.toString();
  return authedGet<ExercisesPage>(`/v1/exercises${query ? `?${query}` : ''}`);
}

export async function getExercisesMeta(): Promise<ExercisesMeta> {
  return authedGet<ExercisesMeta>('/v1/exercises/meta');
}

export async function createExercise(body: {
  name: string;
  muscleGroup?: string;
  target?: string;
  equipment?: string;
  description?: string;
}): Promise<ExerciseWire> {
  const token = await getToken();
  if (!token) throw new ExercisesApiError(401);

  let res: Response;
  try {
    res = await fetch(`${BASE}/v1/exercises`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ExercisesApiError(null);
  }

  if (!res.ok) throw new ExercisesApiError(res.status);
  return res.json() as Promise<ExerciseWire>;
}
