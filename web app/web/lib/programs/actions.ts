'use server';

import { revalidatePath } from 'next/cache';

import {
  deleteTemplate as apiDelete,
  getCertifiedList,
  postApply,
  postCertifiedCopy,
  postDuplicate,
  postPlanNotice,
  postResync,
  postTemplate,
  putProgramBlueprint,
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
  /** The trainer's own sentence about the block. Optional, and never required
   *  by the wire — `''` and `null` are one answer here, because a blank
   *  description is the absence of one rather than a cleared field. */
  description?: string | null;
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
      description: input.description?.trim() || null,
      weeks: input.weeks ?? 1,
      trainingDays: input.trainingDays ?? [1],
      dayLabels: input.dayLabels ?? {},
      exercises: [],
    });
    revalidatePath('/programs/templates');
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
    revalidatePath('/programs/templates');
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
    revalidatePath('/programs/templates');
    return { ok: true, value: { id: copy.id, name: copy.name } };
  } catch (error) {
    return refusal(error, 'Could not duplicate the program.');
  }
}

/**
 * *Use this* — the certified shelf's only primary.
 *
 * The rule the whole screen turns on: **handing a program over makes a copy.**
 * Assigning a template copies it onto the client; using a certified program
 * copies it onto the trainer. In both cases the copy has one owner and editing
 * the original never reaches it.
 *
 * Which is why there is no *assign* on that shelf. A certified blueprint has no
 * owner a trainer can edit, so assigning it directly would produce a client
 * plan whose *edit this program* button leads nowhere. The copy gives it an
 * owner, on their own shelf, with their name on it.
 *
 * ── AND IT IS NOT CALLED `useCertified` ──────────────────────────────────────
 *
 * A `use` prefix is a React Hook by convention, and `rules-of-hooks` reads it as
 * one — so every call site inside a `startTransition` callback is a lint error.
 * The BUTTON still says *Use this*: what the trainer does and what the function
 * does are allowed to differ, and *copy* is the more honest name for the thing
 * that actually happens.
 */
export async function copyCertified(id: string): Promise<Result<{ id: string; name: string }>> {
  try {
    const copy = await postCertifiedCopy(id);
    revalidatePath('/programs/templates');
    revalidatePath('/programs/certified');
    return { ok: true, value: { id: copy.id, name: copy.name } };
  } catch (error) {
    return refusal(error, 'Could not copy the program.');
  }
}

/* ══════════════════════════════ starting from something that exists ══ */

/**
 * One row of the new-program dialog's *Start from* list.
 *
 * A PROJECTION, and deliberately not `CertifiedWire`. That wire carries the
 * catalogue's own metadata — level, equipment, review date, used count, the
 * caller's copy — none of which a `<select>` can draw, and all of which would
 * cross the wire to the browser to be dropped. Six fields, all of them printed.
 */
export interface StartChoice {
  id: string;
  /** `certified` copies the catalogue's; `own` duplicates the trainer's. */
  source: 'certified' | 'own';
  name: string;
  goal: string | null;
  description: string | null;
  weeks: number;
  /** How many ordinal slots it trains. Never a weekday — the first law. */
  days: number;
  exercises: number;
  /**
   * HOW OFTEN IT HAS BEEN USED — and the two sources count different things,
   * which is why the label is the caller's and not this field's.
   *
   * On a trainer's own program it is `assignedCount`: every copy ever made
   * onto a client, lifetime and not the active count, because the question the
   * picker answers is *is this one I actually reach for*. On a certified
   * blueprint it is `certified.usedCount` — how many TRAINERS have copied it,
   * which is the catalogue's own fact in place of a rating.
   */
  used: number;
}

/**
 * The catalogue, for that list.
 *
 * A READ in a file of writes, and it earns the place: it is read once, when
 * the dialog OPENS, rather than on every load of `/programs`. Forty blueprints
 * nobody asked for is the cost `getShelf` was narrowed to avoid, and most
 * visits to this screen never open the dialog at all.
 *
 * The trainer's OWN programs are not fetched here — the screen holds them
 * already (`ShelfData.templates`), and a second read of a list in the browser
 * is a second answer to a question that has one.
 *
 * A refusal is not a failure of the dialog. The picker simply draws without
 * its second group and the trainer starts from an empty program, which is
 * what they came to do.
 */
export async function certifiedChoices(): Promise<Result<StartChoice[]>> {
  try {
    const rows = await getCertifiedList();
    return {
      ok: true,
      value: rows.map(row => ({
        id: row.id,
        source: 'certified' as const,
        name: row.name,
        goal: row.goal,
        description: row.certified?.summary ?? row.description,
        weeks: row.weeks ?? 1,
        days: row.trainingDays.length,
        exercises: row.exerciseCount,
        used: row.certified?.usedCount ?? 0,
      })),
    };
  } catch (error) {
    return refusal(error, 'Could not read the template catalogue.');
  }
}

/**
 * START FROM SOMETHING THAT EXISTS — one call, two endpoints, one rule.
 *
 * **Handing a program over makes a copy** (see `copyCertified`), and this is
 * that rule with a name field in front of it. The trainer picked a blueprint
 * and typed what their version is called; the copy is theirs, and editing it
 * never reaches the original or anybody already training on one.
 *
 * ── WHY THE SHAPE IS NOT AN ARGUMENT ────────────────────────────────────────
 *
 * No `weeks`, no `trainingDays`. The blueprint arrives with its exercises
 * already laid out on its own slots, and a dialog that offered to change the
 * day count would be offering to orphan every row on the day it removed — the
 * copy would open with exercises on a day the program no longer has, which is
 * exactly the state law 2 exists to prevent. The builder is where a shape is
 * changed, because that is where the rows being moved are visible.
 *
 * ── AND WHY THE SECOND WRITE IS CONDITIONAL ─────────────────────────────────
 *
 * The copy routes take a `name` and nothing else, so a changed goal or
 * description needs a `PUT`. It is sent only when one of them actually differs
 * from what the copy came back holding — an unconditional second request would
 * rewrite two columns with the values they already have, on the request path
 * of the most-used action on this screen.
 */
export async function createFromTemplate(input: {
  source: 'certified' | 'own';
  templateId: string;
  name: string;
  goal?: string | null;
  description?: string | null;
}): Promise<Result<{ id: string; name: string }>> {
  const name = input.name.trim();
  if (!name) return { ok: false, message: 'Give this program a name.' };

  try {
    const copy =
      input.source === 'certified'
        ? await postCertifiedCopy(input.templateId, name)
        : await postDuplicate(input.templateId, name);

    const patch: TemplatePatch = {};
    const goal = input.goal?.trim() || null;
    const description = input.description?.trim() || null;
    if (goal !== (copy.goal ?? null)) patch.goal = goal;
    if (description !== (copy.description ?? null)) patch.description = description;
    /* The name too, for a wire that ignored it on the copy. A trainer's typed
       name silently becoming the origin's is the failure this catches, and it
       costs nothing on a wire that honoured it. */
    if (copy.name !== name) patch.name = name;
    if (Object.keys(patch).length > 0) await putTemplate(copy.id, patch);

    revalidatePath('/programs/templates');
    revalidatePath('/programs/certified');
    return { ok: true, value: { id: copy.id, name } };
  } catch (error) {
    return refusal(error, 'Could not start from that template.');
  }
}

/**
 * REMOVE SEVERAL, AND IT IS NOT A BULK ENDPOINT.
 *
 * The wire has one verb — `DELETE /v1/templates/:id` — so this is a loop, and
 * the loop is SEQUENTIAL on purpose: `Promise.all` over eight deletes fires
 * eight connections at a server whose whole job here is one row each, and a
 * rejection mid-flight leaves the caller unable to say which of the eight
 * actually went.
 *
 * IT DOES NOT STOP AT THE FIRST REFUSAL. A trainer who ticked eight and lost
 * the third to a server that is holding it would otherwise be told nothing
 * about the other five, and would have to guess which are still there. So each
 * id is tried, the survivors are named, and the count that DID go comes back —
 * the toast prints both, and `revalidatePath` runs once at the end because the
 * shelf is one list however many rows left it.
 */
export async function removeTemplates(
  ids: string[],
): Promise<Result<{ deleted: number; failed: { id: string; message: string }[] }>> {
  if (ids.length === 0) return { ok: false, message: 'Nothing was selected.' };

  let deleted = 0;
  const failed: { id: string; message: string }[] = [];

  for (const id of ids) {
    try {
      await apiDelete(id);
      deleted += 1;
    } catch (error) {
      /* `refusal` throws anything that is not a `ProgramsApiError`, which is
         the line this file already draws: a bug stays a bug even in a loop. */
      const result = refusal(error, 'Could not remove the program.');
      failed.push({ id, message: result.ok ? '' : result.message });
    }
  }

  revalidatePath('/programs/templates');
  return { ok: true, value: { deleted, failed } };
}

export async function removeTemplate(id: string): Promise<Result<null>> {
  try {
    await apiDelete(id);
    revalidatePath('/programs/templates');
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
    /* BOTH LISTS. The shelf's row counts who is on a blueprint, and `/programs`
       is the list of the copies themselves — assigning writes one, so the page
       that lists them is stale the moment this returns. */
    revalidatePath('/programs');
    revalidatePath('/programs/templates');
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
  /** Whose copy this is. Optional only because a caller that does not know it
   *  should still be able to push — but every caller today does, and without it
   *  the client's own plan screen goes on rendering the prescription the push
   *  just replaced until something else happens to revalidate it. */
  clientId?: string,
): Promise<Result<{ removed: number; added: number }>> {
  try {
    const result = await postResync(programId);
    revalidatePath(`/programs/${templateId}`);
    if (clientId) {
      revalidatePath(`/clients/${clientId}/program`);
      revalidatePath(`/clients/${clientId}/program/${programId}`);
    }
    return { ok: true, value: { removed: result.removed, added: result.added } };
  } catch (error) {
    return refusal(error, 'Could not push the update.');
  }
}

/**
 * THE CLIENT COPY'S SAVE.
 *
 * `saveTemplate`'s twin, pointed at the other table, and the two are kept as
 * two functions rather than one with a flag because the paths they revalidate
 * have nothing in common: a blueprint edit changes the shelf and every screen
 * that counts programmes, and this changes one person's file.
 *
 * `/clients/:id/program` is revalidated as well as the builder itself, because
 * the tab behind this screen prints the plan's shape and the week it is in —
 * a trainer who adds week 9 and presses back must not read *week 3 of 8*.
 */
export async function saveClientPlan(
  clientId: string,
  programId: string,
  patch: TemplatePatch,
): Promise<Result<null>> {
  try {
    await putProgramBlueprint(programId, patch);
    revalidatePath(`/clients/${clientId}/program`);
    revalidatePath(`/clients/${clientId}/program/${programId}`);
    return { ok: true, value: null };
  } catch (error) {
    return refusal(error, "Could not save this client's plan.");
  }
}

/**
 * *Notify* — pressed after a save, never instead of one.
 *
 * `revalidatePath` is deliberately absent. Nothing on the TRAINER's side of the
 * book changes: the row lands in the client's feed, which no screen in this
 * tree reads. Revalidating the plan here would throw away the draft the trainer
 * is still looking at to refresh two paths that cannot have moved.
 *
 * `sent: false` is a success, not a refusal — the client has plan notifications
 * switched off, the save still happened, and the trainer needs to be told the
 * difference rather than shown an error for a setting that is not theirs.
 */
export async function notifyPlanChange(programId: string): Promise<Result<{ sent: boolean }>> {
  try {
    const result = await postPlanNotice(programId);
    return { ok: true, value: { sent: result.sent } };
  } catch (error) {
    return refusal(error, 'Could not notify this client.');
  }
}

/**
 * *Reset to template* — the same write as `pushUpdate`, pressed from the other
 * end and by the person whose edits it discards.
 *
 * It is `POST /v1/programs/:id/resync` either way. What differs is who is
 * asking and what they can see: from the blueprint it is *push this to thirteen
 * people*, and from inside one client's plan it is *throw away what I changed
 * for this one person and take the blueprint again*. The second is destructive
 * in a way the first is not, so the panel that calls it confirms and names the
 * count.
 */
export async function resetClientPlan(
  clientId: string,
  programId: string,
): Promise<Result<{ removed: number; added: number }>> {
  try {
    const result = await postResync(programId);
    revalidatePath(`/clients/${clientId}/program`);
    revalidatePath(`/clients/${clientId}/program/${programId}`);
    return { ok: true, value: { removed: result.removed, added: result.added } };
  } catch (error) {
    return refusal(error, 'Could not reset this plan to the template.');
  }
}
