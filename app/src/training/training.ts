/**
 * The exercise library and the program shelf — screens 3a to 3e, derived from
 * local tables. Pure: `now` and the rows come in, nothing here reads the
 * database or the clock.
 *
 * ── What this takes from Hevy, and what it adds ───────────────────────────
 *
 * Hevy's exercise page answers **"what's my best?" before it answers "how do I
 * do it?"**, and the three records it leads with — heaviest weight, projected
 * 1RM, best set — are exactly the three a coach quotes out loud. Those are
 * computed here, from the same set logs the workout screen writes.
 *
 * The addition is the **Yours** filter. Hevy has custom exercises and buries
 * them in the same alphabetical list as the other 400; the one you invented for
 * one client's shoulder is the one you will hunt for hardest.
 *
 * ── The rule that shapes the program half ─────────────────────────────────
 *
 * **A program is a template, and assigning it copies it.** Nothing in this file
 * resolves a client's program through its template — a program's exercises are
 * its own rows. Editing a template here can never change a plan somebody is
 * halfway through, which is the bug both TrueCoach and Trainerize shipped.
 */

import type { ShapeLegendEntry } from '../design';

/* -------------------------------------------------------------- blueprint */

/**
 * One entry in a template's blueprint, as the server stores it.
 *
 * Defined here rather than beside the writers in `db/training`, because this is
 * the module that reads it and the reading is where the shape has to be right.
 * `db/training` imports the type from here.
 */
export interface BlueprintEntry {
  exerciseId: string;
  /** 1 = Monday. Null on an entry that was never given a day. */
  day: number | null;
  /**
   * Which week of the program, 1-based.
   *
   * Reads as 1 on every entry written before programs had weeks, which is what
   * those entries meant: one week's shape, repeated for however long the
   * program ran.
   */
  week: number;
  sets: number | null;
  reps: number | null;
  restSeconds: number | null;
  notes: string | null;
  orderIndex: number;
}

/* ------------------------------------------------------------------- input */

export interface LibExercise {
  id: string;
  name: string;
  /** Comma-separated in the seed: "Chest, triceps". */
  muscleGroup?: string | null;
  equipment?: string | null;
  description?: string | null;
  isCustom: boolean;
  /** 'weight_reps' | 'reps'. Null across the shared library, read as weight × reps. */
  logType?: string | null;
}

export interface LibSet {
  id: string;
  workoutSessionId: string;
  exerciseId: string;
  setNumber: number;
  loadKg?: number | null;
  reps?: number | null;
  rpe?: number | null;
}

export interface LibWorkout {
  id: string;
  clientId: string;
  /** 'YYYY-MM-DD'. */
  sessionDate: string;
}

export interface LibTemplate {
  id: string;
  name: string;
  goal?: string | null;
  weeks?: number | null;
  structure?: string | null;
  dayLabels?: string | null;
  /** "1,3,5". Null on a template authored before the layout step existed. */
  trainingDays?: string | null;
}

export interface LibProgram {
  id: string;
  clientId: string;
  templateId?: string | null;
  status: string;
}

export interface TrainingInput {
  exercises: LibExercise[];
  favourites: string[];
  sets: LibSet[];
  workouts: LibWorkout[];
  templates: LibTemplate[];
  programs: LibProgram[];
  clients: { id: string; name: string }[];
}

export const EMPTY_TRAINING_INPUT: TrainingInput = {
  exercises: [],
  favourites: [],
  sets: [],
  workouts: [],
  templates: [],
  programs: [],
  clients: [],
};

const DEAD_PROGRAM = new Set(['cancelled', 'canceled', 'completed', 'archived']);

const WEEKDAY_NAMES = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

/* ------------------------------------------------------- 3a · the programs */

export interface ProgramCard {
  id: string;
  name: string;
  weeks: number;
  /** How many clients are on a copy of this. */
  clients: number;
  /** Days a week the shape trains. */
  daysPerWeek: number;
  meta: string;
  mostUsed: boolean;
  /** Seven entries, Monday first. `null` is a rest day; a number is a legend tone. */
  week: (number | null)[];
  /** One per distinct training day, in the order they first occur. */
  legend: ShapeLegendEntry[];
}

export interface ProgramsView {
  subtitle: string;
  chips: { key: string; label: string; count: number }[];
  cards: ProgramCard[];
  empty: boolean;
}

/**
 * The shelf, with each template drawn as its shape.
 *
 * `filter` is a chip key: `all`, `in_play`, or a goal. Filtering happens after
 * the counts are taken, so the chips keep showing the whole library's numbers
 * rather than the filtered view's — a chip that reads "3" only when it is
 * already selected is useless for deciding whether to select it.
 */
export function buildPrograms(input: TrainingInput, filter: string = 'all'): ProgramsView {
  const live = input.programs.filter((p) => !DEAD_PROGRAM.has(p.status.toLowerCase()));
  const perTemplate = new Map<string, Set<string>>();
  live.forEach((p) => {
    if (!p.templateId) return;
    const set = perTemplate.get(p.templateId) ?? new Set<string>();
    set.add(p.clientId);
    perTemplate.set(p.templateId, set);
  });

  // Built once for the whole shelf rather than per card: the library is 873 rows
  // and every card needs to look up the muscles behind its exercises.
  const musclesById = new Map(
    input.exercises.map((e) => [e.id, splitMuscles(e.muscleGroup)] as const),
  );

  const all = input.templates.map<ProgramCard>((template) => {
    const blueprint = parseBlueprint(template.structure);
    const clients = perTemplate.get(template.id)?.size ?? 0;
    const weeks = Math.max(1, template.weeks ?? 1);
    const shape = weekShape(
      blueprint,
      parseTrainingDays(template.trainingDays, blueprint),
      parseDayLabels(template.dayLabels),
      musclesById,
    );
    const daysPerWeek = shape.week.filter((d) => d !== null).length;

    return {
      id: template.id,
      name: template.name,
      weeks,
      clients,
      daysPerWeek,
      meta: cardMeta(clients, daysPerWeek),
      mostUsed: false,
      week: shape.week,
      legend: shape.legend,
    };
  });

  // Most used, and only when it means something. A "Most used" tag on the only
  // program anybody is on is a badge for coming first in a race of one.
  const busiest = all.reduce<ProgramCard | null>(
    (best, card) => (card.clients > (best?.clients ?? 0) ? card : best),
    null,
  );
  if (busiest && busiest.clients > 1 && all.filter((c) => c.clients > 0).length > 1) {
    busiest.mostUsed = true;
  }

  const inPlay = all.filter((c) => c.clients > 0);
  const goals = new Map<string, number>();
  input.templates.forEach((t) => {
    const goal = (t.goal ?? '').trim();
    if (goal) goals.set(goal, (goals.get(goal) ?? 0) + 1);
  });

  const chips = [
    { key: 'all', label: 'All', count: all.length },
    { key: 'in_play', label: 'In play', count: inPlay.length },
    ...[...goals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([goal, count]) => ({ key: `goal:${goal}`, label: goal, count })),
  ];

  let cards = all;
  if (filter === 'in_play') cards = inPlay;
  else if (filter.startsWith('goal:')) {
    const goal = filter.slice(5);
    const ids = new Set(input.templates.filter((t) => (t.goal ?? '').trim() === goal).map((t) => t.id));
    cards = all.filter((c) => ids.has(c.id));
  }

  return {
    subtitle: `${all.length} you use · ${inPlay.length} in play`,
    chips,
    cards: [...cards].sort((a, b) => b.clients - a.clients || a.name.localeCompare(b.name)),
    empty: all.length === 0,
  };
}

function cardMeta(clients: number, daysPerWeek: number): string {
  const who = clients === 0 ? 'Nobody on this yet' : `${clients} client${clients === 1 ? '' : 's'} on this`;
  const days = daysPerWeek ? `${daysPerWeek} day${daysPerWeek === 1 ? '' : 's'} a week` : 'No days set';
  return `${who} · ${days}`;
}

/**
 * One week of the shape, and what each training day is called.
 *
 * **Colour is assigned per distinct day name, not per guessed split.** That is the
 * whole trick, and it is what a split-classifier could not do: a Full Body program
 * trains legs on all three days, so classifying it produced three cells of the
 * same colour and a legend that could not tell them apart. Grouping by the
 * trainer's own label gives Full Body A / B / C three colours, and still gives
 * Push / Pull / Legs lime / blue / amber, because that is three distinct days in
 * that order.
 *
 * The name is the trainer's label where the template has one, `nameDay`'s reading
 * of the muscles where it doesn't, and the weekday as a last resort. Every one of
 * those is something to show; none of them is a letter to decode.
 */
function weekShape(
  blueprint: BlueprintEntry[],
  trainingDays: number[],
  labels: Record<number, string>,
  musclesById: Map<string, string[]>,
): { week: (number | null)[]; legend: ShapeLegendEntry[] } {
  const week: (number | null)[] = [null, null, null, null, null, null, null];

  // The card draws ONE week's shape, so it draws the first — mixing weeks would
  // colour Wednesday from whichever week happened to sort last.
  const byDay = new Map<number, BlueprintEntry[]>();
  trainingDays.forEach((day) => byDay.set(day, []));
  blueprint.forEach((entry) => {
    if (entry.week !== 1) return;
    if (entry.day == null || entry.day < 1 || entry.day > 7) return;
    const list = byDay.get(entry.day) ?? [];
    list.push(entry);
    byDay.set(entry.day, list);
  });

  const tones = new Map<string, number>();
  const legend: ShapeLegendEntry[] = [];

  [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([day, entries]) => {
      const muscles = entries.flatMap((e) => musclesById.get(e.exerciseId) ?? []);
      const label = labels[day]?.trim() || nameDay(muscles) || WEEKDAY_NAMES[day - 1];

      // Two days called the same thing share a colour, which is correct: they
      // are the same session run twice.
      let tone = tones.get(label);
      if (tone === undefined) {
        tone = tones.size;
        tones.set(label, tone);
        legend.push({ label, tone });
      }
      week[day - 1] = tone;
    });

  return { week, legend };
}

/**
 * Names a day from the muscles it trains, for a template whose days were never
 * labelled. Null when the muscles say nothing coherent — better the weekday than
 * a confident wrong word.
 */
export function nameDay(muscles: string[]): string | null {
  const m = muscles.join(' ').toLowerCase();
  if (/quad|hamstring|glute|calf|leg/.test(m)) return 'Legs';
  if (/back|lat|bicep|trap|rear/.test(m)) return 'Pull';
  if (/chest|shoulder|tricep|delt/.test(m)) return 'Push';
  return null;
}

/* -------------------------------------------------- 3b · inside a program */

export interface ProgramDay {
  day: number;
  /** "Monday · Push A". */
  title: string;
  /** The trainer's own name for the day, where they gave it one. */
  label: string | null;
  exercises: {
    id: string;
    exerciseId: string;
    name: string;
    /** "4 × 6–8 · 90s rest". */
    prescription: string;
    custom: boolean;
  }[];
}

export interface ProgramView {
  id: string;
  name: string;
  subtitle: string;
  weeks: number;
  /** The week these days were drawn from — what the chip row has selected. */
  week: number;
  /** Every weekday the program trains on, whether or not it has been filled. */
  trainingDays: number[];
  days: ProgramDay[];
  clients: number;
  /**
   * This week has nothing of its own and is showing week 1's shape.
   *
   * The distinction matters at the point of editing: adding an exercise to a
   * repeating week has to copy the week first, or the trainer would be editing
   * week 1 while looking at a header that says week 3.
   */
  repeats: boolean;
  /** Weeks that have been authored in their own right, in order. */
  authoredWeeks: number[];
  /** Nothing laid out and nothing on the blueprint. */
  empty: boolean;
}

/**
 * One week of one program.
 *
 * ── Two rules, both about being honest ────────────────────────────────────
 *
 * **A day exists because the trainer laid it out, not because something is on
 * it.** Building the day list from the blueprint alone was the old behaviour and
 * it had a trap in it: the first exercise went on Monday, Monday became the only
 * day, and there was no longer anywhere to put Tuesday's first exercise. So the
 * days come from `training_days` and the blueprint's own days are merged in —
 * an exercise sitting on a day nobody laid out still gets drawn.
 *
 * **A week with nothing of its own repeats week 1.** That was already the app's
 * story for a multi-week program and it stays true; what changes is that a week
 * can now be authored separately, and `repeats` says which of the two you are
 * looking at so the screen never implies numbers nobody wrote.
 */
export function buildProgram(
  input: TrainingInput,
  templateId: string,
  week: number = 1,
): ProgramView | null {
  const template = input.templates.find((t) => t.id === templateId);
  if (!template) return null;

  const blueprint = parseBlueprint(template.structure);
  const labels = parseDayLabels(template.dayLabels);
  const byId = new Map(input.exercises.map((e) => [e.id, e] as const));
  const weeks = Math.max(1, template.weeks ?? 1);
  const wanted = Math.min(Math.max(1, Math.round(week)), weeks);
  const trainingDays = parseTrainingDays(template.trainingDays, blueprint);

  const clients = new Set(
    input.programs
      .filter((p) => p.templateId === templateId && !DEAD_PROGRAM.has(p.status.toLowerCase()))
      .map((p) => p.clientId),
  ).size;

  const authoredWeeks = [...new Set(blueprint.map((entry) => entry.week))].sort((a, b) => a - b);

  const own = blueprint.filter((entry) => entry.week === wanted);
  const repeats = own.length === 0 && wanted !== 1 && authoredWeeks.includes(1);
  const showing = repeats ? blueprint.filter((entry) => entry.week === 1) : own;

  const byDay = new Map<number, BlueprintEntry[]>();
  trainingDays.forEach((day) => byDay.set(day, []));
  showing.forEach((entry) => {
    if (entry.day == null) return;
    const list = byDay.get(entry.day) ?? [];
    list.push(entry);
    byDay.set(entry.day, list);
  });

  const days = [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map<ProgramDay>(([day, entries]) => {
      const sorted = [...entries].sort((a, b) => a.orderIndex - b.orderIndex);
      const label = labels[day] ?? null;

      return {
        day,
        title: [WEEKDAY_NAMES[day - 1] ?? `Day ${day}`, label].filter(Boolean).join(' · '),
        label,
        exercises: sorted.map((entry) => {
          const exercise = byId.get(entry.exerciseId);
          return {
            id: `${wanted}-${day}-${entry.exerciseId}-${entry.orderIndex}`,
            exerciseId: entry.exerciseId,
            // An exercise the library hasn't pulled yet is named honestly rather
            // than shown as a blank row.
            name: exercise?.name ?? 'An exercise not on this phone yet',
            prescription: prescribe(entry),
            custom: exercise?.isCustom ?? false,
          };
        }),
      };
    });

  return {
    id: template.id,
    name: template.name,
    subtitle: `${weeks} week${weeks === 1 ? '' : 's'} · ${clients} client${clients === 1 ? '' : 's'}`,
    weeks,
    week: wanted,
    trainingDays,
    days,
    clients,
    repeats,
    authoredWeeks,
    empty: days.length === 0,
  };
}

/** "4 × 6–8 · 90s rest". Whatever is missing is simply not said. */
function prescribe(entry: BlueprintEntry): string {
  const parts: string[] = [];
  if (entry.sets && entry.reps) parts.push(`${entry.sets} × ${entry.reps}`);
  else if (entry.sets) parts.push(`${entry.sets} sets`);
  else if (entry.reps) parts.push(`${entry.reps} reps`);
  if (entry.restSeconds) parts.push(`${entry.restSeconds}s rest`);
  if (entry.notes) parts.push(entry.notes);
  return parts.join(' · ') || 'No prescription set';
}

/* ------------------------------------------------------ 3c · the exercises */

export interface ExerciseRow {
  id: string;
  name: string;
  /** "Chest · triceps · barbell". */
  meta: string;
  custom: boolean;
  favourite: boolean;
  /** The trainer's heaviest across all clients, when there is one. */
  best: string | null;
}

export interface ExerciseFilter {
  query: string;
  muscles: string[];
  equipment: string[];
  yoursOnly: boolean;
  favouritesOnly: boolean;
}

export const NO_FILTER: ExerciseFilter = {
  query: '',
  muscles: [],
  equipment: [],
  yoursOnly: false,
  favouritesOnly: false,
};

export interface ExerciseSection {
  key: string;
  title: string;
  rows: ExerciseRow[];
}

export interface ExercisesView {
  subtitle: string;
  /** How many the filter matched, for the section heads. */
  total: number;
  sections: ExerciseSection[];
  /** Every muscle and every equipment type in the library, for the filter sheet. */
  muscleOptions: string[];
  equipmentOptions: string[];
  yoursCount: number;
  favouriteCount: number;
  empty: boolean;
}

/* ------------------------------------------------------------------ index
 *
 * Everything about the library that does not depend on the filter, computed once
 * and cached against the identity of the exercises array.
 *
 * Measured on a real device before this existed: `buildExercises` took **391ms**
 * over 873 rows, and it re-ran on every keystroke in the search box. Three things
 * were paying for that:
 *
 *   · `splitMuscles` ran about 2,600 times per call — once in the filter, once
 *     again in the row builder, and a third time to collect the filter options.
 *     Each call is a regex split, a map and a filter over a short string, which is
 *     nothing on its own and a lot 2,600 times.
 *   · `localeCompare` sorted 873 rows, twice over. It is locale-aware and, on
 *     this engine, orders of magnitude slower than `<`. That was the single
 *     biggest line.
 *   · the whole lot was recomputed for a one-character change to the query, when
 *     none of it depends on the query.
 *
 * A `WeakMap` keyed on the array is what makes this safe: WatermelonDB hands out a
 * new array only when the set of rows actually changes, so the index is built once
 * per library change and reused for every keystroke — and it is collected with the
 * array rather than pinning 873 objects alive forever.
 * -------------------------------------------------------------------------- */

interface IndexedExercise {
  id: string;
  name: string;
  custom: boolean;
  /** "Chest · triceps · barbell", ready to render. */
  meta: string;
  /** The section this one belongs in when it isn't starred or custom. */
  primary: string;
  /** Lowercased, for matching. */
  muscles: string[];
  equipment: string;
  /** Lowercased name + muscles + equipment, so search is one `includes`. */
  haystack: string;
}

interface LibraryIndex {
  items: IndexedExercise[];
  muscleOptions: string[];
  equipmentOptions: string[];
  yoursCount: number;
}

const indexCache = new WeakMap<object, LibraryIndex>();
const bestsCache = new WeakMap<object, Map<string, string>>();

/**
 * Compares two names cheaply.
 *
 * Deliberately NOT `localeCompare`. Exercise names in this library are ASCII, the
 * ordering only has to be stable and alphabetical to a reader, and `localeCompare`
 * was most of the 391ms. If the library ever carries names that need collation,
 * this is the one line to change — and the cost of changing it is known.
 */
function byNameAsc(a: { name: string }, b: { name: string }): number {
  const x = a.name.toLowerCase();
  const y = b.name.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

function libraryIndex(exercises: LibExercise[]): LibraryIndex {
  const cached = indexCache.get(exercises);
  if (cached) return cached;

  const muscleOptions = new Set<string>();
  const equipmentOptions = new Set<string>();
  let yoursCount = 0;

  const items = exercises.map<IndexedExercise>((e) => {
    const muscles = splitMuscles(e.muscleGroup);
    const equipment = (e.equipment ?? '').trim();

    muscles.forEach((m) => muscleOptions.add(m));
    if (equipment) equipmentOptions.add(equipment);
    if (e.isCustom) yoursCount += 1;

    return {
      id: e.id,
      name: e.name,
      custom: e.isCustom,
      meta: [...muscles, equipment].filter(Boolean).join(' · '),
      primary: muscles[0] ?? 'Other',
      muscles: muscles.map((m) => m.toLowerCase()),
      equipment: equipment.toLowerCase(),
      haystack: `${e.name} ${muscles.join(' ')} ${equipment}`.toLowerCase(),
    };
  });

  // Sorted once here rather than per section per call. Everything downstream
  // preserves order — `filter` does, and a `Map` keeps insertion order — so no
  // section needs to sort again.
  items.sort(byNameAsc);

  const index: LibraryIndex = {
    items,
    muscleOptions: [...muscleOptions].sort(),
    equipmentOptions: [...equipmentOptions].sort(),
    yoursCount,
  };
  indexCache.set(exercises, index);
  return index;
}

/**
 * The library, filtered and grouped.
 *
 * Favourites and the trainer's own exercises are pulled out into their own
 * sections at the top. Everything else is grouped by primary muscle, which is
 * how a trainer looking for "another chest thing" actually searches — and the
 * search box matches name, muscle and equipment, so typing "barbell" works.
 *
 * Everything the filter does not affect is precomputed — see `libraryIndex`.
 * What is left here is one pass of cheap comparisons.
 */
export function buildExercises(
  input: TrainingInput,
  filter: ExerciseFilter = NO_FILTER,
): ExercisesView {
  const index = libraryIndex(input.exercises);
  const favourites = new Set(input.favourites);
  const bests = bestPerExercise(input.sets);

  const query = filter.query.trim().toLowerCase();
  const wantMuscles = filter.muscles.map((m) => m.toLowerCase());
  const wantEquipment = filter.equipment.map((e) => e.toLowerCase());

  const matched = index.items.filter((e) => {
    if (filter.yoursOnly && !e.custom) return false;
    if (filter.favouritesOnly && !favourites.has(e.id)) return false;
    if (wantMuscles.length && !wantMuscles.some((m) => e.muscles.includes(m))) return false;
    if (wantEquipment.length && !wantEquipment.includes(e.equipment)) return false;
    if (query && !e.haystack.includes(query)) return false;
    return true;
  });

  const row = (e: IndexedExercise): ExerciseRow => ({
    id: e.id,
    name: e.name,
    meta: e.meta,
    custom: e.custom,
    favourite: favourites.has(e.id),
    best: bests.get(e.id) ?? null,
  });

  const sections: ExerciseSection[] = [];

  const starred: ExerciseRow[] = [];
  const yours: ExerciseRow[] = [];
  const groups = new Map<string, ExerciseRow[]>();

  // One pass, three buckets. The old version filtered `matched` three times over
  // and sorted each result.
  matched.forEach((e) => {
    if (favourites.has(e.id)) {
      starred.push(row(e));
    } else if (e.custom) {
      yours.push(row(e));
    } else {
      const list = groups.get(e.primary);
      if (list) list.push(row(e));
      else groups.set(e.primary, [row(e)]);
    }
  });

  if (starred.length) sections.push({ key: 'favourites', title: 'Favourites', rows: starred });
  if (yours.length) sections.push({ key: 'yours', title: 'Yours', rows: yours });

  [...groups.keys()]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .forEach((muscle) => {
      sections.push({ key: `m:${muscle}`, title: muscle, rows: groups.get(muscle)! });
    });

  return {
    subtitle: `${input.exercises.length} · ${index.yoursCount} of them yours`,
    total: matched.length,
    sections,
    muscleOptions: index.muscleOptions,
    equipmentOptions: index.equipmentOptions,
    yoursCount: index.yoursCount,
    favouriteCount: favourites.size,
    empty: matched.length === 0,
  };
}

/* --------------------------------------------------- 3d · one exercise */

export interface ExerciseRecord {
  label: string;
  value: string;
  unit: string;
}

export interface ExerciseHistoryEntry {
  workoutId: string;
  date: string;
  clientId: string;
  clientName: string;
  /** "3 × 85 kg · 6 reps". */
  summary: string;
}

export interface ExerciseView {
  id: string;
  name: string;
  meta: string;
  custom: boolean;
  favourite: boolean;
  logType: 'weight_reps' | 'reps';
  /** Heaviest, estimated 1RM, best set — Hevy's three, and the three a coach quotes. */
  records: ExerciseRecord[];
  steps: string[];
  history: ExerciseHistoryEntry[];
  /** Set when the screen was reached from a client — records are then theirs, not everyone's. */
  scopedTo: string | null;
}

/**
 * One exercise, optionally scoped to one client.
 *
 * "Records and history are **per client** when you arrive from a client" — the
 * tap map is explicit, and it matters: a coach standing next to Ananya wants
 * Ananya's best, not the gym's.
 */
export function buildExercise(
  input: TrainingInput,
  exerciseId: string,
  clientId: string | null = null,
): ExerciseView | null {
  const exercise = input.exercises.find((e) => e.id === exerciseId);
  if (!exercise) return null;

  const clientOf = new Map(input.workouts.map((w) => [w.id, w.clientId] as const));
  const dateOf = new Map(input.workouts.map((w) => [w.id, w.sessionDate] as const));
  const names = new Map(input.clients.map((c) => [c.id, c.name] as const));

  const sets = input.sets.filter((s) => {
    if (s.exerciseId !== exerciseId) return false;
    if (!clientId) return true;
    return clientOf.get(s.workoutSessionId) === clientId;
  });

  const logType: 'weight_reps' | 'reps' =
    exercise.logType === 'reps' ? 'reps' : 'weight_reps';

  return {
    id: exercise.id,
    name: exercise.name,
    meta: [...splitMuscles(exercise.muscleGroup), exercise.equipment]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(' · '),
    custom: exercise.isCustom,
    favourite: input.favourites.includes(exercise.id),
    logType,
    records: records(sets, logType),
    steps: parseSteps(exercise.description),
    history: history(sets, clientOf, dateOf, names, logType),
    scopedTo: clientId ? names.get(clientId) ?? null : null,
  };
}

/**
 * Heaviest, estimated 1RM, best set.
 *
 * The 1RM is Epley — `weight × (1 + reps / 30)` — which is the formula Hevy and
 * most of the field use. It is an estimate and the screen calls it one; over
 * about ten reps every formula in this family drifts, which is why the best set
 * sits beside it as the thing that actually happened.
 *
 * Returns an empty list rather than zeroes when nothing has been logged. "0 kg
 * heaviest" is a claim about the client; no records is a fact about the app.
 */
function records(sets: LibSet[], logType: 'weight_reps' | 'reps'): ExerciseRecord[] {
  const usable = sets.filter((s) => (s.reps ?? 0) > 0);
  if (!usable.length) return [];

  if (logType === 'reps') {
    const most = usable.reduce((best, s) => Math.max(best, s.reps ?? 0), 0);
    const total = usable.reduce((sum, s) => sum + (s.reps ?? 0), 0);
    return [
      { label: 'Most reps', value: String(most), unit: '' },
      { label: 'Total reps', value: String(total), unit: '' },
      { label: 'Sets logged', value: String(usable.length), unit: '' },
    ];
  }

  const loaded = usable.filter((s) => (s.loadKg ?? 0) > 0);
  if (!loaded.length) return [{ label: 'Sets logged', value: String(usable.length), unit: '' }];

  const heaviest = loaded.reduce((best, s) => Math.max(best, s.loadKg ?? 0), 0);
  const oneRm = loaded.reduce(
    (best, s) => Math.max(best, (s.loadKg ?? 0) * (1 + (s.reps ?? 0) / 30)),
    0,
  );
  // Best set by volume: the one that moved the most weight in one go, which is
  // what a coach means by "his best set".
  const best = loaded.reduce((top, s) =>
    (s.loadKg ?? 0) * (s.reps ?? 0) > (top.loadKg ?? 0) * (top.reps ?? 0) ? s : top,
  );

  return [
    { label: 'Heaviest', value: trim1(heaviest), unit: 'kg' },
    { label: 'Est. 1RM', value: String(Math.round(oneRm)), unit: 'kg' },
    { label: 'Best set', value: String(best.reps ?? 0), unit: `×${trim1(best.loadKg ?? 0)}` },
  ];
}

function history(
  sets: LibSet[],
  clientOf: Map<string, string>,
  dateOf: Map<string, string>,
  names: Map<string, string>,
  logType: 'weight_reps' | 'reps',
): ExerciseHistoryEntry[] {
  const byWorkout = new Map<string, LibSet[]>();
  sets.forEach((s) => {
    const list = byWorkout.get(s.workoutSessionId) ?? [];
    list.push(s);
    byWorkout.set(s.workoutSessionId, list);
  });

  return [...byWorkout.entries()]
    .map(([workoutId, rows]) => {
      const clientId = clientOf.get(workoutId) ?? '';
      const top = rows.reduce((best, s) =>
        (s.loadKg ?? 0) * (s.reps ?? 0) > (best.loadKg ?? 0) * (best.reps ?? 0) ? s : best,
      );
      const summary =
        logType === 'reps'
          ? `${rows.length} × ${top.reps ?? 0} reps`
          : `${rows.length} set${rows.length === 1 ? '' : 's'} · best ${top.reps ?? 0} × ${trim1(top.loadKg ?? 0)} kg`;

      return {
        workoutId,
        date: dateOf.get(workoutId) ?? '',
        clientId,
        clientName: names.get(clientId) ?? 'A client',
        summary,
      };
    })
    .filter((entry) => entry.date)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20);
}

/**
 * Coaching cues, as numbered steps.
 *
 * The seeded library stores instructions as one blob. Splitting on sentence ends
 * is imperfect and deliberately conservative — a fragment shorter than a few
 * words is folded back rather than shown as its own step, because "No." on its
 * own line looks like a bug.
 */
function parseSteps(description: string | null | undefined): string[] {
  if (!description) return [];
  const raw = description
    .split(/\r?\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z])/))
    .map((s) => s.trim())
    .filter(Boolean);

  const out: string[] = [];
  raw.forEach((piece) => {
    if (piece.length < 12 && out.length) out[out.length - 1] += ` ${piece}`;
    else out.push(piece);
  });
  return out.slice(0, 8);
}

/* ------------------------------------------------------------------ shared */

/**
 * The heaviest single set per exercise, formatted, across everything logged.
 *
 * Cached on the sets array for the same reason the library index is: it walks
 * every set log in the database and does not depend on the filter, so a keystroke
 * in the search box must not pay for it.
 */
function bestPerExercise(sets: LibSet[]): Map<string, string> {
  const hit = bestsCache.get(sets);
  if (hit) return hit;

  const best = new Map<string, number>();
  sets.forEach((s) => {
    const load = s.loadKg ?? 0;
    if (load <= 0) return;
    if (load > (best.get(s.exerciseId) ?? 0)) best.set(s.exerciseId, load);
  });
  const out = new Map<string, string>();
  best.forEach((load, id) => out.set(id, `${trim1(load)} kg`));
  bestsCache.set(sets, out);
  return out;
}

/** "Chest, triceps" → ["Chest", "triceps"]. Tolerates commas, slashes and pipes. */
export function splitMuscles(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,/|]/)
    .map((m) => m.trim())
    .filter(Boolean);
}

/** 92.5 stays 92.5; 90.0 becomes 90. Nobody writes "90.0 kg" on a whiteboard. */
function trim1(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/* ----------------------------------------------------------------- parsing
 *
 * Tolerant on purpose. This JSON is written by a server that may be a version
 * ahead of the phone, and a template whose blueprint fails to parse should draw
 * as an empty shape rather than take the Programs screen down with it.
 * -------------------------------------------------------------------------- */

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function parseBlueprint(structure: string | null | undefined): BlueprintEntry[] {
  if (!structure) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(structure);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: BlueprintEntry[] = [];
  parsed.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.exercise_id !== 'string' || !entry.exercise_id) return;
    out.push({
      exerciseId: entry.exercise_id,
      day: num(entry.day_of_week),
      // A missing week is week 1 — see the note on the field.
      week: Math.max(1, num(entry.week) ?? 1),
      sets: num(entry.sets),
      reps: num(entry.reps),
      restSeconds: num(entry.rest_seconds),
      notes: typeof entry.notes === 'string' && entry.notes ? entry.notes : null,
      orderIndex: num(entry.order_index) ?? index,
    });
  });
  return out.sort(
    (a, b) => a.week - b.week || (a.day ?? 99) - (b.day ?? 99) || a.orderIndex - b.orderIndex,
  );
}

/**
 * The weekdays a program trains on.
 *
 * `training_days` is the trainer's own layout and wins when it is there. When it
 * is not — every template authored before the layout step existed — the days are
 * whatever the blueprint already sits on, which is the same answer for a filled
 * template and an honest empty one for a template nobody has touched.
 *
 * Read across ALL weeks, not just the one on screen: a day belongs to the
 * program, and a week that happens to be empty does not remove Wednesday from it.
 */
export function parseTrainingDays(
  trainingDays: string | null | undefined,
  blueprint: BlueprintEntry[] = [],
): number[] {
  if (trainingDays != null && trainingDays.trim() !== '') {
    const days = trainingDays
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);
    return [...new Set(days)].sort((a, b) => a - b);
  }
  const used = blueprint
    .map((entry) => entry.day)
    .filter((day): day is number => day != null && day >= 1 && day <= 7);
  return [...new Set(used)].sort((a, b) => a - b);
}

/**
 * Which week of a program a date falls in, 1-based.
 *
 * Counted off the program's own start date rather than off the calendar's weeks,
 * because a program that started on a Wednesday is in its first week until the
 * following Wednesday — a Monday-based count would put its third day in week 2
 * and hand the client the wrong session on day three.
 *
 * Week 1 when the program never said when it started, and week 1 for a date
 * before it started. Both are the only answers that cannot be wrong about a plan
 * with no timeline on it.
 */
export function programWeek(
  startDate: string | null | undefined,
  on: Date = new Date(),
): number {
  if (!startDate) return 1;
  const start = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 1;
  const today = new Date(on.getFullYear(), on.getMonth(), on.getDate());
  const days = Math.floor((today.getTime() - start.getTime()) / 86_400_000);
  return days < 0 ? 1 : Math.floor(days / 7) + 1;
}

/** Back to the stored form. Empty when nothing is laid out, never `"0"`. */
export function formatTrainingDays(days: number[]): string {
  return [...new Set(days)]
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
    .sort((a, b) => a - b)
    .join(',');
}

export function parseDayLabels(json: string | null | undefined): Record<number, string> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<number, string> = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
      const day = Number(key);
      if (Number.isInteger(day) && typeof value === 'string' && value.trim()) {
        out[day] = value.trim();
      }
    });
    return out;
  } catch {
    return {};
  }
}
