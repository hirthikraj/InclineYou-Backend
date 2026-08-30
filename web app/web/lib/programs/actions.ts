'use server';

import { revalidatePath } from 'next/cache';

import {
  deleteTemplate as apiDelete,
  postApply,
  postDuplicate,
  postResync,
  postTemplate,
  putTemplate,
  ProgramsApiError,
  type ApplyPayload,
  type TemplatePatch,
} from './api';

/**
 * EVERY WRITE ON `/programs`, AND THE ONE SHAPE THEY ALL ANSWER IN.
 *
 * A refusal here is nearly always a *sentence* rather than a status — the apply
 * route answers "This program trains 3 days a week — schedule exactly 3 weekdays
 * for it (got 2)." and the resync route answers with the day that is missing.
 * Those sentences are the server's, they name the fix, and no wording this half
 * could invent would be better. So `Result` carries `message` and every caller
 * prints it.
 *
 * `ok: false` is a refusal the trainer can act on. A thrown error is a bug and
 * stays thrown — the same line `isApiFailure` draws in `lib/auth/api.ts`, and for
 * the same reason: a catch-all that turns everything into "the server said no"
 * is how a real defect stays invisible for a month.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; message: string };

function refusal(error: unknown, fallback: string): Result<never> {
  if (error instanceof ProgramsApiError) {
    if (error.status === null) {
      return { ok: false, message: 'Could not reach the server. Nothing was saved.' };
    }
    return { ok: false, message: error.detail?.trim() || fallback };
  }
  throw error;
}

export async function createTemplate(input: {
  name: string;
  goal?: string | null;
  weeks?: number;
  trainingDays?: number[];
  dayLabels?: Record<string, string>;
}): Promise<Result<{ id: string; name: string }>> {
  const name = input.name.trim();
  if (!name) return { ok: false, message: 'Give this program a name.' };

  try {
    const created = await postTemplate({
      name,
      goal: input.goal?.trim() || null,
      weeks: input.weeks ?? 1,
      trainingDays: input.trainingDays ?? [1],
      dayLabels: input.dayLabels ?? {},
      exercises: [],
    });
    revalidatePath('/programs');
    return { ok: true, value: { id: created.id, name: created.name } };
  } catch (error) {
    return refusal(error, 'Could not create the program.');
  }
}

/**
 * The blueprint save.
 *
 * One PUT of the whole structure, because `template.structure` is one jsonb
 * column and there is no row to PATCH — see `putTemplate`. The builder therefore
 * holds a draft and this is pressed, which is also the line the design set draws
 * and the phone draws: *adding, removing and reordering are local; rewriting the
 * numbers goes through the endpoint that validates the blueprint.*
 */
export async function saveTemplate(id: string, patch: TemplatePatch): Promise<Result<null>> {
  try {
    await putTemplate(id, patch);
    revalidatePath('/programs');
    revalidatePath(`/programs/${id}`);
    return { ok: true, value: null };
  } catch (error) {
    return refusal(error, 'Could not save the program.');
  }
}

/**
 * The most-used action on this screen.
 *
 * Trainers build one good program and tweak it per client, and a blueprint six
 * people are already on is one they will not touch. Two clicks — the button and
 * the name — and the copy has nobody on it, which is what makes it safe.
 */
export async function duplicateTemplate(
  id: string,
  name?: string,
): Promise<Result<{ id: string; name: string }>> {
  try {
    const copy = await postDuplicate(id, name);
    revalidatePath('/programs');
    return { ok: true, value: { id: copy.id, name: copy.name } };
  } catch (error) {
    return refusal(error, 'Could not duplicate the program.');
  }
}

export async function removeTemplate(id: string): Promise<Result<null>> {
  try {
    await apiDelete(id);
    revalidatePath('/programs');
    return { ok: true, value: null };
  } catch (error) {
    return refusal(error, 'Could not remove the program.');
  }
}

/**
 * Assign — the step where an ordinal slot becomes a real Tuesday.
 *
 * The design set has this as *still open · 02*: "the step where Day 1 becomes
 * Monday 6:00 am … it has no drawing on the web yet." What it is NOT is a
 * reference — `POST /v1/templates/{id}/apply` copies every blueprint row into
 * `program_exercise` in one transaction, so the assigned instance is an
 * independent snapshot from the moment it exists. Editing the template
 * afterwards changes the template.
 *
 * The count-match rule is the server's and is not duplicated here beyond
 * disabling the button: the panel collects one weekday and time per slot, and if
 * the two ever disagree the server's sentence is the one the trainer reads.
 */
export async function assignTemplate(
  id: string,
  payload: ApplyPayload,
): Promise<Result<{ programId: string }>> {
  if (!payload.clientId) return { ok: false, message: 'Choose who this is for.' };

  try {
    const program = await postApply(id, payload);
    revalidatePath('/programs');
    revalidatePath(`/programs/${id}`);
    revalidatePath(`/clients/${payload.clientId}`);
    revalidatePath(`/clients/${payload.clientId}/program`);
    return { ok: true, value: { programId: program.id } };
  } catch (error) {
    return refusal(error, 'Could not assign the program.');
  }
}

/**
 * Push the blueprint onto one client who is already on a copy of it.
 *
 * The brief's own words — *"let the trainer push an update to an assigned
 * instance explicitly if they want to"* — and the emphasis is on **explicitly**.
 * Nothing propagates on its own, one program at a time, and the confirmation
 * says what moved.
 *
 * It keeps the client's weekday and time: those were chosen once, for them, and
 * a blueprint edit is not a reason to move somebody's Tuesday.
 */
export async function pushUpdate(
  programId: string,
  templateId: string,
): Promise<Result<{ removed: number; added: number }>> {
  try {
    const result = await postResync(programId);
    revalidatePath(`/programs/${templateId}`);
    return { ok: true, value: { removed: result.removed, added: result.added } };
  } catch (error) {
    return refusal(error, 'Could not push the update.');
  }
}
