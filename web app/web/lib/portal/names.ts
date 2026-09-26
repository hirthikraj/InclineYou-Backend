import 'server-only';

import { getPortalExerciseNames, getPortalProgram } from './api';

/**
 * Movement id → name, for a screen that reads set logs.
 *
 * ── TWO SOURCES, AND THE ORDER IS THE COST ──────────────────────────────────
 *
 * The program is free: `getPortalProgram` is `cache()`d and every screen in the
 * portal already reads it, and each of its rows carries a hydrated `exercise`.
 * So it answers first, and for a client whose plan holds everything they train
 * it answers completely — `GET /v1/me/exercises` is then never called.
 *
 * The second read exists for one case and it is the case the Exercises tab is
 * about: a movement logged for months and since taken off the plan. It has no
 * program row, so before this it had no name, and `buildStrength` printed *That
 * movement*. See the route's own note in `mock/portal.ts`.
 *
 * `wanted` is the ids the caller actually has sets for, so the second request
 * is scoped to what is missing rather than to the library.
 */
export async function resolveNames(wanted: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();

  const program = await getPortalProgram();
  for (const day of program?.days ?? []) {
    for (const row of day.exercises) {
      if (row.exercise) names.set(row.exercise.id, row.exercise.name);
    }
  }

  const missing = [...new Set(wanted)].filter((id) => !names.has(id));
  if (missing.length > 0) {
    /* A refusal here costs a name, not a screen. The tab draws *A movement no
       longer on your plan* for anything still unresolved, which is the honest
       rendering and the one thing that must not become an error page: the rows
       it would take down are the client's own logged work. */
    try {
      for (const ex of await getPortalExerciseNames(missing)) names.set(ex.id, ex.name);
    } catch {
      /* left unresolved on purpose — see above */
    }
  }

  return names;
}
