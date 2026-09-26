/**
 * WHAT A WRITTEN SESSION COSTS — in minutes, and in a band of calories.
 *
 * ── NO `server-only`, AND THAT IS THE POINT ─────────────────────────────────
 *
 * Trap 18. The builder's strip has to print a duration for a draft that has
 * never been saved and may never be, so the rule cannot live behind the wire;
 * the shelf has to print the same figure for a row that came off it. One module
 * both halves import is the only arrangement where those two figures cannot
 * disagree — the alternative is a `durationMinutes` column the server computes
 * and a second estimate in the browser for the unsaved case, which is two rules
 * that will drift on the first change to either.
 *
 * It reads no clock, no cookie and no request, which is what makes that safe.
 *
 * ── IT IS AN ESTIMATE AND IT IS DRAWN AS ONE ────────────────────────────────
 *
 * `~50 min`, never `50 min`. Nothing here knows how long this person takes to
 * change a plate, and a figure printed flat is one a trainer will eventually
 * find wrong and then stop reading. The calories are a BAND for the same
 * reason, only more so: bodyweight is the largest term in that arithmetic and a
 * template is written for nobody in particular, so a single number would be
 * precise about the one input it does not have.
 */

/** What a rep costs, in seconds. Three is the usual coaching rounding for a
 *  controlled tempo — a set of ten is half a minute of work. */
const SECONDS_PER_REP = 3;

/** Getting to the rack, loading it, and the trainer saying what is next. Paid
 *  once per exercise rather than per set. */
const SETUP_SECONDS = 45;

/** A set with no rest written still costs something before the next one. */
const DEFAULT_REST_SECONDS = 60;

/** kcal a minute, at the two ends of the band. A 60 kg client working through
 *  a light session and a 95 kg one grinding a heavy one. */
const KCAL_PER_MINUTE = [4, 6] as const;

export interface EstimateSet {
  effortKind: string;
  effortValue: number | null;
  restSeconds: number | null;
}

export interface EstimateExercise {
  sets: EstimateSet[];
  /** Members of one circuit. Their rest is paid once per ROUND, not per set. */
  groupId?: string | null;
}

function workSeconds(set: EstimateSet): number {
  if (set.effortValue === null) return 0;
  /* A kind measured on a clock is already seconds; everything else is a count
     of repetitions and costs `SECONDS_PER_REP` apiece. The MAX kinds carry no
     number at all, so they never reach here. */
  return set.effortKind === 'time' || set.effortKind === 'max_time'
    ? set.effortValue
    : set.effortValue * SECONDS_PER_REP;
}

/**
 * Seconds, whole.
 *
 * A CIRCUIT IS CHARGED ONCE PER ROUND. Three movements chained at 60 seconds
 * each is not three minutes of standing still — the whole point of the chain is
 * that you move straight to the next one, and the rest is taken after the
 * round. So within a group only the LAST member's rest is counted, which is the
 * same rule the builder states under a superset: *a superset's rest belongs to
 * the round*.
 */
export function estimateSeconds(exercises: EstimateExercise[]): number {
  let total = 0;
  exercises.forEach((exercise, i) => {
    total += SETUP_SECONDS;
    const next = exercises[i + 1];
    /* Last of its chain when the following row is not in it — which includes
       the tail of the list, where `next` is undefined. */
    const tailOfChain =
      exercise.groupId == null || next?.groupId == null || next.groupId !== exercise.groupId;
    for (const set of exercise.sets) {
      total += workSeconds(set);
      if (tailOfChain) total += set.restSeconds ?? DEFAULT_REST_SECONDS;
    }
  });
  return total;
}

/** Rounded to the nearest minute, floored at 1 so a one-set workout is not
 *  reported as taking no time at all. */
export function estimateMinutes(exercises: EstimateExercise[]): number {
  const seconds = estimateSeconds(exercises);
  if (seconds === 0) return 0;
  return Math.max(1, Math.round(seconds / 60));
}

/** `[25, 35]`, or null where there is nothing to estimate. Rounded to fives —
 *  a band reading 23–34 claims a precision the inputs cannot support. */
export function estimateKcal(exercises: EstimateExercise[]): [number, number] | null {
  const minutes = estimateMinutes(exercises);
  if (minutes === 0) return null;
  const five = (n: number) => Math.max(5, Math.round((n * minutes) / 5) * 5);
  return [five(KCAL_PER_MINUTE[0]), five(KCAL_PER_MINUTE[1])];
}

/** `~50 min`, or `~1 h 05` past the hour. The tilde is part of the figure. */
export function durationLabel(minutes: number): string {
  if (minutes === 0) return '—';
  if (minutes < 60) return `~${minutes} min`;
  return `~${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

/** `25–35 kcal`, en dash, or an em dash where there is nothing to say. */
export function kcalLabel(band: [number, number] | null): string {
  return band ? `${band[0]}–${band[1]} kcal` : '—';
}

/** `01:30`, which is how a rest is written on a set line and in the console. */
export function restLabel(seconds: number | null): string {
  if (seconds === null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** The inverse, for the box a trainer types `1:30` or `90` into. Null is *that
 *  is not a rest*, which the caller draws by putting the old value back. */
export function parseRest(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  if (text.includes(':')) {
    const [m, s] = text.split(':');
    const minutes = Number(m);
    const seconds = Number(s);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
    return Math.max(0, Math.round(minutes * 60 + seconds));
  }
  const n = Number(text);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}
