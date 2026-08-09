import { api } from './client';

// ── Templates ─────────────────────────────────────────────────────────────

export interface TemplateExerciseInput {
  exerciseId: string;
  sets?: number;
  reps?: number;
  restSeconds?: number;
  dayOfWeek?: number;
  orderIndex: number;
}

export interface TemplateExercise {
  exercise_id: string;
  sets: number | null;
  reps: number | null;
  rest_seconds: number | null;
  target_load: number | null;
  notes: string | null;
  day_of_week: number | null;
  order_index: number;
}

export interface TemplateDetail {
  id: string;
  name: string;
  goal: string | null;
  description: string | null;
  exercises: TemplateExercise[];
  dayLabels: Record<string, string> | null; // {"1":"Push Day","3":"Pull Day"}
  createdAt: number;
  updatedAt: number;
}

export async function createTemplate(input: {
  name: string;
  goal?: string;
  description?: string;
  exercises: TemplateExerciseInput[];
  dayLabels?: Record<number, string>;
}): Promise<TemplateDetail> {
  const { data } = await api.post<TemplateDetail>('/v1/templates', input);
  return data;
}

export async function getTemplate(id: string): Promise<TemplateDetail> {
  const { data } = await api.get<TemplateDetail>(`/v1/templates/${id}`);
  return data;
}

export async function deleteTemplate(id: string): Promise<void> {
  await api.delete(`/v1/templates/${id}`);
}

export async function applyTemplate(
  templateId: string,
  clientId: string,
  name?: string,
  goal?: string,
): Promise<{ id: string }> {
  const { data } = await api.post(`/v1/templates/${templateId}/apply`, { clientId, name, goal });
  return data;
}

// ── Program exercises ─────────────────────────────────────────────────────

export interface ProgramExerciseInput {
  exerciseId: string;
  sets?: number;
  reps?: number;
  restSeconds?: number;
  dayOfWeek?: number;
  orderIndex: number;
}

export interface ProgramExercisePatch {
  sets?: number;
  reps?: number;
  restSeconds?: number;
  notes?: string;
  dayOfWeek?: number;
  orderIndex?: number;
}

export async function addProgramExercise(programId: string, input: ProgramExerciseInput) {
  const { data } = await api.post(`/v1/programs/${programId}/exercises`, input);
  return data;
}

export async function updateProgramExercise(
  programId: string,
  exId: string,
  patch: ProgramExercisePatch,
) {
  const { data } = await api.put(`/v1/programs/${programId}/exercises/${exId}`, patch);
  return data;
}

export async function removeProgramExercise(programId: string, exId: string): Promise<void> {
  await api.delete(`/v1/programs/${programId}/exercises/${exId}`);
}
